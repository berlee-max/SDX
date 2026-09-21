import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PALETTE, buildIco, iconSvg, readMark } from './generate-brand-assets'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const markSource = path.join(desktopRoot, 'src/components/composite/BrandSeal.tsx')

const readMarkSource = () => readFile(markSource, 'utf8')

describe('readMark', () => {
  it('reads the blades out of the component rather than keeping a copy', async () => {
    const mark = readMark(await readMarkSource())
    expect(mark.shortBlade.startsWith('M')).toBe(true)
    expect(mark.longBlade.startsWith('M')).toBe(true)
    expect(mark.starBox).toHaveLength(4)
  })

  it('fails loudly when the component stops exporting what it reads', () => {
    // Silence is the dangerous outcome here: a renamed constant that fell back
    // to a default would ship an icon of something other than the mark.
    expect(() => readMark('export const nothing = 1')).toThrow(/SHORT_BLADE/)
    expect(() => readMark("const SHORT_BLADE = 'M0 0Z'\nconst LONG_BLADE = 'M0 0Z'")).toThrow(/viewBox/)
  })
})

describe('iconSvg', () => {
  it('paints from frozen hex, because an .icns cannot read a theme', async () => {
    const svg = iconSvg(readMark(await readMarkSource()), 'dark')
    expect(svg).not.toMatch(/var\(--/)
    expect(svg).toContain(PALETTE.dark.plate)
    expect(svg).toContain(PALETTE.dark.ink)
    expect(svg).toContain(PALETTE.dark.seal)
  })

  it('omits the sparks the in-app mark only draws at xl', async () => {
    // They are under 2px at the sizes an icon is actually seen at.
    const source = await readMarkSource()
    const svg = iconSvg(readMark(source), 'dark')
    const sparkLead = source.match(/const SPARK_LEAD = '([^']+)'/)![1]
    expect(svg).not.toContain(sparkLead)
  })

  it('draws the mark itself, not a redrawn approximation of it', async () => {
    const source = await readMarkSource()
    const mark = readMark(source)
    const svg = iconSvg(mark, 'light')
    expect(svg).toContain(mark.shortBlade)
    expect(svg).toContain(mark.longBlade)
  })
})

describe('the committed vector icons', () => {
  // This is the guard the raster icons never had: re-tuning the mark and
  // forgetting to regenerate used to leave the Dock showing the old artwork
  // indefinitely, with nothing failing.
  const shipped = [
    'desktop/public/app-icon.svg',
    'desktop/src-tauri/app-icon.svg',
    'desktop/src-tauri/app-icon-macos.svg',
    'docs/images/app-icon.svg',
    'docs/images/app-icon-dark.svg',
  ]

  it.each(shipped)('%s is exactly what the generator produces today', async (relativePath) => {
    const expected = iconSvg(readMark(await readMarkSource()), 'dark')
    const actual = await readFile(path.join(repoRoot, relativePath), 'utf8')
    expect(actual).toBe(expected)
  })

  it('keeps a light-plate variant for the docs that switch on colour scheme', async () => {
    const expected = iconSvg(readMark(await readMarkSource()), 'light')
    const actual = await readFile(path.join(repoRoot, 'docs/images/app-icon-light.svg'), 'utf8')
    expect(actual).toBe(expected)
  })
})

describe('buildIco', () => {
  const parse = (ico: Buffer) => {
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    return Array.from({ length: count }, (_unused, index) => {
      const at = 6 + index * 16
      return {
        width: ico.readUInt8(at) || 256,
        bitsPerPixel: ico.readUInt16LE(at + 6),
        length: ico.readUInt32LE(at + 8),
        offset: ico.readUInt32LE(at + 12),
      }
    })
  }

  it('lays out one directory entry per image, with 256 stored as zero', () => {
    const entries = [16, 256].map((size) => ({ size, png: Buffer.alloc(size, 7) }))
    const ico = buildIco(entries)
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt8(6 + 16)).toBe(0) // 256 does not fit in a byte
    expect(parse(ico).map((entry) => entry.width)).toEqual([16, 256])
  })

  it('points every entry at its own bytes', () => {
    const entries = [
      { size: 16, png: Buffer.from('first') },
      { size: 32, png: Buffer.from('second-image') },
    ]
    const ico = buildIco(entries)
    const parsed = parse(ico)
    expect(parsed).toHaveLength(entries.length)
    for (const [index, entry] of parsed.entries()) {
      expect(ico.subarray(entry.offset, entry.offset + entry.length)).toEqual(entries[index]!.png)
    }
  })

  it('produces a committed .ico that carries every size Windows asks for', async () => {
    // The off-the-shelf converters collapse this to a single 256px entry and
    // leave Explorer and the taskbar to downscale it to 16px themselves.
    const ico = await readFile(path.join(repoRoot, 'desktop/src-tauri/icons/icon.ico'))
    const entries = parse(ico)
    expect(entries.map((entry) => entry.width)).toEqual([16, 24, 32, 48, 64, 128, 256])
    for (const entry of entries) {
      expect(entry.bitsPerPixel).toBe(32)
      expect(ico.subarray(entry.offset, entry.offset + 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    }
  })
})
