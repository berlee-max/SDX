import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One package manager per workspace, enforced.
 *
 * The snapshot this fork was imported from shipped four lockfiles for three
 * managers: `bun.lock` + `package-lock.json` at the root, and `bun.lock` +
 * `pnpm-lock.yaml` under `desktop/`. Only the bun locks were ever updated after
 * import — every `bun install` rewrote them while the npm and pnpm files sat
 * frozen at the import commit — so the same `package.json` resolved to a
 * different tree depending on which manager a contributor happened to run. CI is
 * `bun install --frozen-lockfile` throughout, so the stale files were pure
 * drift waiting to be picked up by a local `npm install`.
 *
 * bun is the manager for the three code workspaces; `packageManager` in the root
 * and desktop package.json pins the version. `site/` is the one exception: it
 * deploys through `npm --prefix site ci` (see deploy-docs.yml), so its
 * package-lock.json is load-bearing and stays.
 */
const repoRoot = join(import.meta.dir, '..', '..')

const forbidden = [
  'package-lock.json',
  'desktop/package-lock.json',
  'desktop/pnpm-lock.yaml',
  'pnpm-lock.yaml',
  'yarn.lock',
  'desktop/yarn.lock',
  'adapters/package-lock.json',
  'adapters/pnpm-lock.yaml',
]

describe('lockfile hygiene', () => {
  test.each(forbidden)('no stray non-bun lockfile: %s', (relative) => {
    expect(existsSync(join(repoRoot, relative))).toBe(false)
  })

  test('each bun workspace still has its bun.lock', () => {
    for (const relative of ['bun.lock', 'desktop/bun.lock', 'adapters/bun.lock']) {
      expect(existsSync(join(repoRoot, relative))).toBe(true)
    }
  })

  test('site keeps its npm lockfile, because it deploys with npm ci', () => {
    // Not an oversight: deploy-docs.yml runs `npm --prefix site ci`, which needs
    // this file. If site ever moves to bun, delete it and drop this assertion.
    expect(existsSync(join(repoRoot, 'site/package-lock.json'))).toBe(true)
  })
})
