/**
 * Concurrent mutations of providers.json must not lose each other's writes.
 *
 * Every mutator used to read the index, mutate its own copy and write it back
 * with no lock. `writeIndex` is atomic (temp file + rename), so the file is
 * never torn — which is exactly why this went unnoticed. What it does not stop
 * is a lost update.
 *
 * The case that actually bit: activating a provider writes `activeId` to the
 * index AND the provider's env to managed settings. A reorder that read the
 * index before that write puts `activeId` back to null on its own write, while
 * the settings env survives. The CLI keeps talking to the provider; the model
 * picker goes back to listing the official models. Found in the wild in exactly
 * that state — full env written, `activeId: null`, and a `providerOrder` that
 * showed the reorder which clobbered it.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { ProviderService } from '../services/providerService.js'
import type { CreateProviderInput } from '../types/provider.js'

let tmpDir: string
let originalConfigDir: string | undefined
let originalHome: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-concurrency-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  originalHome = process.env.HOME
  process.env.CLAUDE_CONFIG_DIR = tmpDir
  process.env.HOME = tmpDir
})

afterEach(async () => {
  if (originalConfigDir !== undefined) process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  else delete process.env.CLAUDE_CONFIG_DIR
  if (originalHome !== undefined) process.env.HOME = originalHome
  else delete process.env.HOME
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function input(name: string): CreateProviderInput {
  return {
    presetId: 'custom',
    runtimeKind: 'anthropic_compatible',
    name,
    baseUrl: 'https://example.invalid/anthropic',
    apiKey: 'sk-test-not-a-real-key',
    apiFormat: 'anthropic',
    models: { main: 'model-main', haiku: 'model-haiku', sonnet: 'model-sonnet', opus: 'model-opus' },
  }
}

describe('providers.json under concurrent mutation', () => {
  test('a reorder racing an activation does not clobber activeId', async () => {
    const service = new ProviderService()
    const provider = await service.addProvider(input('DeepSeek'))

    const { providerOrder } = await service.listProviders()
    const reordered = [...providerOrder].reverse()

    // Fired without awaiting in between: this is the shape the desktop UI
    // produces when adding a provider, selecting it, and letting the list
    // resettle in the same tick.
    await Promise.all([
      service.activateProvider(provider.id),
      service.reorderProviders(reordered),
    ])

    const after = await service.listProviders()
    expect(after.activeId).toBe(provider.id)
  })

  test('the activation and its managed env agree afterwards', async () => {
    // The pair is the whole point. Either both land or neither does; an index
    // that says "official" beside an env that points at a third party is the
    // state that makes the UI lie about which model is answering.
    const service = new ProviderService()
    const provider = await service.addProvider(input('DeepSeek'))

    await Promise.all([
      service.activateProvider(provider.id),
      service.reorderProviders([...(await service.listProviders()).providerOrder].reverse()),
    ])

    const { activeId } = await service.listProviders()
    const settings = await service.getManagedSettings()
    const env = (settings.env ?? {}) as Record<string, string>

    expect(activeId).toBe(provider.id)
    expect(env.ANTHROPIC_BASE_URL).toBe('https://example.invalid/anthropic')
  })

  test('concurrent adds all survive', async () => {
    // Same lost-update shape, without the settings half: six overlapping adds
    // used to leave however many the last writer happened to have read.
    const service = new ProviderService()
    const names = ['a', 'b', 'c', 'd', 'e', 'f']

    await Promise.all(names.map((name) => service.addProvider(input(name))))

    const { providers } = await service.listProviders()
    expect(providers.map((p) => p.name).sort()).toEqual([...names].sort())
  })

  test('one failing mutation does not wedge the queue', async () => {
    // The chain stores itself back with rejections swallowed. If it did not,
    // a single rejected mutation would leave every later write hanging on it.
    const service = new ProviderService()
    await expect(service.activateProvider('does-not-exist')).rejects.toThrow()

    const provider = await service.addProvider(input('after-the-failure'))
    const { providers } = await service.listProviders()
    expect(providers.map((p) => p.id)).toContain(provider.id)
  })
})
