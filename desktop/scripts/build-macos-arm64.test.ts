// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { copyFile, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

async function exists(pathname: string): Promise<boolean> {
  return stat(pathname).then(() => true, () => false)
}

async function writeExecutable(pathname: string, source: string): Promise<void> {
  await writeFile(pathname, source, 'utf8')
  await chmod(pathname, 0o755)
}

/**
 * A worktree with the real build script and stubbed tools. `bun` exits 86 at
 * `build:sidecars`, so a run that reaches that point returns 86 and anything
 * that stops earlier is the script's own doing.
 */
async function stageBuildScript() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'sdx-macos-build-'))
  const desktopDir = path.join(fixtureRoot, 'desktop')
  const scriptsDir = path.join(desktopDir, 'scripts')
  const fakeBinDir = path.join(fixtureRoot, 'fake-bin')
  const buildScript = path.join(scriptsDir, 'build-macos-arm64.sh')

  await Promise.all([
    mkdir(scriptsDir, { recursive: true }),
    mkdir(path.join(fixtureRoot, 'adapters'), { recursive: true }),
    mkdir(fakeBinDir, { recursive: true }),
  ])
  await copyFile(path.resolve(import.meta.dirname, 'build-macos-arm64.sh'), buildScript)
  await chmod(buildScript, 0o755)
  await writeExecutable(path.join(fakeBinDir, 'uname'), `#!/bin/bash
if [[ "\${1:-}" == "-s" ]]; then
  echo Darwin
elif [[ "\${1:-}" == "-m" ]]; then
  echo arm64
fi
`)
  await writeExecutable(path.join(fakeBinDir, 'bun'), `#!/bin/bash
if [[ "\${1:-}" == "install" ]]; then
  mkdir -p "\${PWD}/node_modules"
  exit 0
fi
if [[ "\${*}" == *"build:sidecars"* ]]; then
  exit 86
fi
exit 0
`)
  for (const command of ['node', 'codesign', 'hdiutil', 'security', 'xcrun']) {
    await writeExecutable(path.join(fakeBinDir, command), '#!/bin/bash\nexit 0\n')
  }

  return {
    desktopDir,
    run: (env: Record<string, string>) =>
      spawnSync('/bin/bash', [buildScript], {
        cwd: desktopDir,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`, ...env },
      }),
    cleanup: () => rm(fixtureRoot, { recursive: true, force: true }),
  }
}

describe('NOTARIZE=1 preflight', () => {
  // It sits beside the signing identity rather than beside the packaging step
  // that consumes it. Everything in between takes minutes, and a typo'd Apple ID
  // should not cost a sidecar build to discover — so each of these has to stop
  // before the stub's exit 86.
  it('refuses an ad-hoc build, which Apple will not notarize', async () => {
    const fixture = await stageBuildScript()
    try {
      const result = fixture.run({
        MAC_TARGETS: 'zip',
        SIGN_BUILD: '0',
        NOTARIZE: '1',
        APPLE_ID: 'someone@example.com',
        APPLE_APP_SPECIFIC_PASSWORD: 'aaaa-bbbb-cccc-dddd',
        APPLE_TEAM_ID: 'ABCDE12345',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/needs a signed build/)
    } finally {
      await fixture.cleanup()
    }
  })

  it('names every missing credential at once instead of one per run', async () => {
    const fixture = await stageBuildScript()
    try {
      const result = fixture.run({
        MAC_TARGETS: 'zip',
        NOTARIZE: '1',
        CC_HAHA_SIGN_IDENTITY: 'Developer ID Application: Example (ABCDE12345)',
        APPLE_ID: '',
        APPLE_APP_SPECIFIC_PASSWORD: '',
        APPLE_TEAM_ID: '',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID')
    } finally {
      await fixture.cleanup()
    }
  })

  it('gets out of the way when it is not asked for', async () => {
    const fixture = await stageBuildScript()
    try {
      const result = fixture.run({ MAC_TARGETS: 'zip', SIGN_BUILD: '0' })
      expect(result.status).toBe(86) // reached build:sidecars, so nothing blocked it
    } finally {
      await fixture.cleanup()
    }
  })
})

describe('the disk image Apple never sees', () => {
  // electron-builder notarizes the .app and wraps the result in an unsigned
  // .dmg, so `spctl` reports "no usable signature" on the file a user actually
  // downloads. The extra round trip below is what makes the download work
  // offline; it must stay inside the NOTARIZE guard and must verify its result.
  it('signs, submits and staples the image under NOTARIZE=1', async () => {
    const source = await readFile(path.resolve(import.meta.dirname, 'build-macos-arm64.sh'), 'utf8')
    const block = source.slice(source.indexOf('Signing disk image'))
    expect(block).toMatch(/codesign --sign "\$\{RESOLVED_SIGN_IDENTITY\}" --timestamp --force/)
    expect(block).toMatch(/notarytool submit/)
    expect(block).toMatch(/stapler staple/)
    // Assert, do not trust: a silent staple failure ships an image needing the network.
    expect(block).toMatch(/stapler validate/)
    expect(block).toMatch(/spctl -a -t open/)
  })
})

describe('macOS arm64 build dependency installation', () => {
  it('installs every package needed by the compiled sidecar in a clean worktree', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'cc-haha-macos-build-'))
    const desktopDir = path.join(fixtureRoot, 'desktop')
    const adaptersDir = path.join(fixtureRoot, 'adapters')
    const scriptsDir = path.join(desktopDir, 'scripts')
    const fakeBinDir = path.join(fixtureRoot, 'fake-bin')
    const buildScript = path.join(scriptsDir, 'build-macos-arm64.sh')

    try {
      await Promise.all([
        mkdir(scriptsDir, { recursive: true }),
        mkdir(adaptersDir, { recursive: true }),
        mkdir(fakeBinDir, { recursive: true }),
      ])
      await copyFile(
        path.resolve(import.meta.dirname, 'build-macos-arm64.sh'),
        buildScript,
      )
      await chmod(buildScript, 0o755)

      await writeExecutable(path.join(fakeBinDir, 'uname'), `#!/bin/bash
if [[ "\${1:-}" == "-s" ]]; then
  echo Darwin
elif [[ "\${1:-}" == "-m" ]]; then
  echo arm64
fi
`)
      await writeExecutable(path.join(fakeBinDir, 'bun'), `#!/bin/bash
set -euo pipefail

if [[ "\${1:-}" == "install" ]]; then
  mkdir -p "\${PWD}/node_modules"
  exit 0
fi

if [[ "\${*}" == *"build:sidecars"* ]]; then
  for package_dir in "\${TEST_REPO_ROOT}" "\${TEST_REPO_ROOT}/desktop" "\${TEST_REPO_ROOT}/adapters"; do
    [[ -d "\${package_dir}/node_modules" ]] || exit 42
  done
  exit 86
fi

exit 0
`)
      for (const command of ['node', 'codesign', 'hdiutil']) {
        await writeExecutable(path.join(fakeBinDir, command), '#!/bin/bash\nexit 0\n')
      }

      expect(await Promise.all([
        exists(path.join(fixtureRoot, 'node_modules')),
        exists(path.join(desktopDir, 'node_modules')),
        exists(path.join(adaptersDir, 'node_modules')),
      ])).toEqual([false, false, false])

      const result = spawnSync('/bin/bash', [buildScript], {
        cwd: desktopDir,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
          MAC_TARGETS: 'zip',
          SIGN_BUILD: '0',
          TEST_REPO_ROOT: fixtureRoot,
        },
      })

      expect(result.status, [
        `status: ${String(result.status)}`,
        `signal: ${String(result.signal)}`,
        `spawn error: ${result.error?.stack ?? 'none'}`,
        `stderr: ${result.stderr || '<empty>'}`,
      ].join('\n')).toBe(86)
      expect(await Promise.all([
        exists(path.join(fixtureRoot, 'node_modules')),
        exists(path.join(desktopDir, 'node_modules')),
        exists(path.join(adaptersDir, 'node_modules')),
      ])).toEqual([true, true, true])
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })
})
