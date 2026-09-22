import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
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

/**
 * The bun pin has to be enforced where builds happen, not just written down.
 *
 * `packageManager` pins bun@1.3.14 for a reason: 1.4.2 fails the
 * systemProxyBridge race test that 1.3.14 passes. And the sidecar is produced by
 * `bun build --compile`, so whichever bun runs a build is baked into the binary
 * that ships.
 *
 * Every local build script therefore compares `bun --version` against the pin
 * and refuses to continue on a mismatch. Without that check a `brew install bun`
 * puts a different version ahead of ~/.bun/bin on PATH and the build still
 * succeeds — which is exactly what happened here, silently, for every macOS
 * artifact produced before the check existed. CI is already safe: it resolves
 * bun through `bun-version-file: package.json`, and the UOS container pins
 * BUN_VERSION in its Dockerfile.
 */
describe('the bun pin is enforced at build time', () => {
  const scripts = [
    'desktop/scripts/build-macos-arm64.sh',
    'desktop/scripts/build-linux.sh',
    'desktop/scripts/build-windows-x64.ps1',
  ]

  test.each(scripts)('%s compares bun --version against packageManager', (relative) => {
    const source = readFileSync(join(repoRoot, relative), 'utf8')
    expect(source).toContain('packageManager')
    expect(source).toMatch(/bun --version/)
  })

  test('the pin the scripts read is the one that is actually set', () => {
    const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      packageManager?: string
    }
    expect(rootPackage.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/)

    // The UOS container cannot read package.json at image-build time, so it
    // repeats the version as an ARG. Pinned together here so they cannot drift.
    const version = rootPackage.packageManager!.split('@')[1]
    const dockerfile = readFileSync(join(repoRoot, 'desktop/build/uos/Dockerfile'), 'utf8')
    expect(dockerfile).toContain(`ARG BUN_VERSION=${version}`)
  })
})
