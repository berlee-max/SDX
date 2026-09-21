import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards on the icon assets, because nothing else does.
 *
 * `scripts/quality-gate/package-smoke/` makes no icon assertions, so a build
 * that ships a stale or half-replaced icon set goes green on every pipeline.
 * The rules below were each learned by breaking them.
 */
const desktopRoot = __dirname
const icons = path.join(desktopRoot, 'src-tauri', 'icons')

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

describe('icon assets', () => {
  it('keeps src-tauri/app-icon.png byte-identical to public/app-icon.png', () => {
    // Two copies of one 1024 RGBA image, both emitted by
    // `bun run gen:brand-assets` from the same buffer. They used to be hand-kept,
    // and a rebrand replaced everything except the src-tauri copy, leaving a
    // stale source primed to overwrite the new set. Regeneration made that
    // impossible; this still guards against either one being edited by hand.
    const source = path.join(desktopRoot, 'src-tauri', 'app-icon.png')
    const runtime = path.join(desktopRoot, 'public', 'app-icon.png')
    expect(sha(source)).toBe(sha(runtime))
  })

  it('ships the sizes Linux actually looks for', () => {
    // electron-builder points `linux.icon` at the whole icons/ directory and
    // keeps only files named NxN. `icon.png` (512) has no dimensions in its
    // name and `128x128@2x.png` (256) collides with `128x128.png`, so both are
    // dropped — which once left the largest Linux icon at 310px, from a
    // Windows Store asset, and blurry on HiDPI.
    const present = new Set(readdirSync(icons))
    for (const size of [32, 64, 128, 256, 512]) {
      expect(present.has(`${size}x${size}.png`)).toBe(true)
    }
  })

  it('carries a packaged icon for every desktop platform', () => {
    // mac.icon / win.icon in package.json name these two directly; a missing
    // file makes electron-builder silently fall back to the Electron logo.
    for (const file of ['icon.icns', 'icon.ico', 'icon.png']) {
      const full = path.join(icons, file)
      expect(existsSync(full)).toBe(true)
      expect(readFileSync(full).byteLength).toBeGreaterThan(1024)
    }
  })

  it('lets nothing else into the directory Linux scans', () => {
    // The 310px Store asset above is the whole reason for this test: any PNG
    // whose name happens to contain NxN joins the scan and can outrank the real
    // icons. The Tauri shell's Store tiles and its android/ and ios/ sets were
    // deleted rather than rebranded — nothing built them, and they shipped
    // inside the asar carrying the previous product's artwork.
    const allowed = new Set([
      '32x32.png',
      '64x64.png',
      '128x128.png',
      '128x128@2x.png',
      '256x256.png',
      '512x512.png',
      'icon.png',
      'icon.icns',
      'icon.ico',
    ])
    const unexpected = readdirSync(icons).filter((entry) => !allowed.has(entry))
    expect(unexpected).toEqual([])
  })

  it('serves a favicon to the H5 client', () => {
    // The same index.html the Electron window loads is what a phone browser
    // gets over H5 remote access, where a missing icon means a blank tab.
    const html = readFileSync(path.join(desktopRoot, 'index.html'), 'utf8')
    expect(html).toMatch(/<link\s+rel="icon"/)
  })
})
