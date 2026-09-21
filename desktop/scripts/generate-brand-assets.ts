/**
 * Regenerate every app-icon raster from the SDX mark.
 *
 * The mark itself lives in `src/components/composite/BrandSeal.tsx`, whose
 * geometry comes from `brandSeal.geometry.py`. This script reads the path data
 * straight out of that component rather than keeping a second copy, so the icon
 * cannot silently drift from the mark the app draws in its own chrome — the one
 * failure the raster icons it replaces actually had.
 *
 * Run it after any change to the mark:
 *
 *   bun run gen:brand-assets
 *
 * Two deliberate differences from the in-app mark:
 *
 * - No sparks. `BrandSeal` shows them only at `xl` (80px) because below that
 *   they are under 2px and read as dirt. An app icon is seen mostly at 32-128px
 *   in a Dock or a taskbar, so they would be dirt nearly everywhere it appears,
 *   and a single artwork at every size avoids the mark visibly jumping scale
 *   when a Finder window's icon slider crosses a size boundary.
 * - A fixed palette. Themes cannot reach an .icns, so the icon takes the dark
 *   plate: cream blade on near-black holds its shape at 16px, where the light
 *   plate's near-black blade sinks into the terracotta one and turns to mud.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const markSource = path.join(desktopRoot, 'src/components/composite/BrandSeal.tsx')

export type IconTheme = 'light' | 'dark'

/**
 * Same values the themes resolve `--color-brand` and `--color-text-primary` to,
 * frozen here because an icon file has no theme to read them from.
 */
export const PALETTE: Record<IconTheme, { plate: string; ink: string; seal: string }> = {
  light: { plate: '#F6F0E1', ink: '#251E11', seal: '#96442B' },
  dark: { plate: '#201D17', ink: '#EDE6D6', seal: '#D07B52' },
}

/** The plate the mark sits on, kept at the footprint of the icon it replaces. */
const PLATE = { x: 88, y: 88, size: 848, radius: 175 }

/** Fraction of the plate the mark's width occupies. */
const MARK_FRACTION = 0.72

export type Mark = {
  shortBlade: string
  longBlade: string
  /** `[x, y, width, height]` of the star's ink, measured by the geometry script. */
  starBox: [number, number, number, number]
}

/** Lift the mark out of the component so there is exactly one copy of it. */
export function readMark(source: string): Mark {
  const constant = (name: string) => {
    const captured = source.match(new RegExp(`const ${name} = '([^']+)'`))?.[1]
    if (!captured) throw new Error(`BrandSeal.tsx no longer defines ${name}`)
    return captured
  }
  // Blades first: they are the mark, and naming the missing one is the more
  // useful error when a refactor moves several things at once.
  const shortBlade = constant('SHORT_BLADE')
  const longBlade = constant('LONG_BLADE')

  const viewBox = source.match(/sm: \{ box: '[^']*', viewBox: '([^']+)'/)?.[1]
  if (!viewBox) throw new Error('BrandSeal.tsx no longer defines the sm viewBox')
  const box = viewBox.split(' ').map(Number)
  if (box.length !== 4 || box.some(Number.isNaN)) {
    throw new Error(`BrandSeal.tsx sm viewBox is not four numbers: ${viewBox}`)
  }
  return { shortBlade, longBlade, starBox: box as [number, number, number, number] }
}

/**
 * The two blades, scaled to `height` and centred on (`cx`, `cy`) in whatever
 * coordinate space the caller is drawing in. Centring is computed from the
 * mark's own measured bounds rather than assumed, so a re-tuned mark whose ink
 * lands off-centre still sits where it was placed.
 */
function markGroup(mark: Mark, colors: (typeof PALETTE)[IconTheme], at: { cx: number; cy: number; height: number }) {
  const [boxX, boxY, boxWidth, boxHeight] = mark.starBox
  const scale = at.height / boxHeight
  const transform = `translate(${at.cx} ${at.cy}) scale(${scale.toFixed(5)}) translate(${-(boxX + boxWidth / 2)} ${-(boxY + boxHeight / 2)})`
  return `<g transform="${transform}">
    <path d="${mark.shortBlade}" fill="${colors.ink}"/>
    <path d="${mark.longBlade}" fill="${colors.seal}"/>
  </g>`
}

/** Width of the mark once it is scaled to a given height. */
const markWidthAt = (mark: Mark, height: number) => (height * mark.starBox[2]) / mark.starBox[3]

export function iconSvg(mark: Mark, theme: IconTheme): string {
  const colors = PALETTE[theme]
  const height = (PLATE.size * MARK_FRACTION * mark.starBox[3]) / mark.starBox[2]

  return `<svg viewBox="0 0 1024 1024" width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.size}" height="${PLATE.size}" rx="${PLATE.radius}" fill="${colors.plate}"/>
  ${markGroup(mark, colors, { cx: 512, cy: 512, height })}
</svg>
`
}

/**
 * The font stack the previous wordmark used, kept verbatim. These files render
 * wherever they are opened rather than in a controlled pipeline, so the text is
 * live rather than outlined and the stack has to degrade on every platform.
 */
const WORDMARK_FONT =
  'SF Pro Display, -apple-system, BlinkMacSystemFont, Avenir Next, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif'

/** The product's full name, written the same way everywhere else. */
export const WORDMARK = 'AI Agent SDX'

/**
 * How wide the wordmark renders. SVG has no way to measure text and the font is
 * whatever the viewer has, so this is an estimate: about 0.62em for a glyph at
 * weight 800 across the stack above, with spaces narrower, and no trailing
 * letter-space because nothing follows the last glyph.
 *
 * It sizes the type to its box and positions the accent rule. A few percent of
 * error moves the rule a few pixels; hard-coded numbers instead drift visibly
 * the moment the name or the type size changes — which is exactly what happened
 * when the name grew from three letters to twelve.
 */
function wordmarkWidth(fontSize: number, letterSpacing: number, text = WORDMARK) {
  const glyphs = [...text]
  const em = glyphs.reduce((total, glyph) => total + (glyph === ' ' ? 0.28 : 0.62), 0)
  return em * fontSize + (glyphs.length - 1) * letterSpacing
}

/** The largest type size whose wordmark still fits `available`. */
function fitWordmark(available: number, letterSpacing: number) {
  const perEm = wordmarkWidth(1, 0)
  return Math.floor((available - ([...WORDMARK].length - 1) * letterSpacing) / perEm)
}

/**
 * Mark plus wordmark on one line. `docs/images/logo-horizontal*.svg`.
 *
 * The lockup it replaces read "Claude Code / Haha" over two lines with a pair
 * of decorative rules. A three-letter name does not need two lines, and the
 * rules were carrying a second accent colour that exists nowhere else in the
 * palette.
 */
export function lockupSvg(mark: Mark, theme: IconTheme): string {
  const colors = PALETTE[theme]
  const [width, height] = [2200, 640]
  const markHeight = 340
  const letterSpacing = 6
  const gap = 130
  const gutter = 120
  // Fit the type to what the mark and the margins leave, rather than pinning a
  // size the name has already outgrown once.
  const fontSize = fitWordmark(width - gutter * 2 - markWidthAt(mark, markHeight) - gap, letterSpacing)

  // Centre the mark-plus-wordmark as one unit rather than pinning it to a
  // gutter, so the pair stays optically balanced whatever the name's length.
  const groupWidth = markWidthAt(mark, markHeight) + gap + wordmarkWidth(fontSize, letterSpacing)
  const groupLeft = (width - groupWidth) / 2
  const markCx = groupLeft + markWidthAt(mark, markHeight) / 2
  const textX = groupLeft + markWidthAt(mark, markHeight) + gap

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" rx="64" fill="${colors.plate}"/>
  ${markGroup(mark, colors, { cx: markCx, cy: height / 2, height: markHeight })}
  <text x="${textX}" y="404" fill="${colors.ink}" font-family="${WORDMARK_FONT}" font-size="${fontSize}" font-weight="800" letter-spacing="${letterSpacing}">${WORDMARK}</text>
  <path d="M${textX} 478H${textX + wordmarkWidth(fontSize, letterSpacing)}" stroke="${colors.seal}" stroke-width="20" stroke-linecap="round"/>
</svg>
`
}

/**
 * The 1.91:1 card every social scraper crops to. `docs/public/images/banner.*`,
 * which is what `site/index.html` points `og:image` at.
 *
 * Centred stack rather than the side-by-side lockup: feeds crop this from the
 * edges, and a left-aligned mark is the first thing to go.
 */
export function socialCardSvg(mark: Mark, theme: IconTheme): string {
  const colors = PALETTE[theme]
  const [width, height] = [1200, 630]
  const markHeight = 190

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${colors.plate}"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="${theme === 'dark' ? '#15130F' : '#E5DBC3'}" stroke-width="16"/>
  ${markGroup(mark, colors, { cx: width / 2, cy: 218, height: markHeight })}
  <text x="${width / 2}" y="440" text-anchor="middle" fill="${colors.ink}" font-family="${WORDMARK_FONT}" font-size="112" font-weight="800" letter-spacing="4">${WORDMARK}</text>
  <text x="${width / 2}" y="520" text-anchor="middle" fill="${colors.seal}" font-family="${WORDMARK_FONT}" font-size="44" font-weight="600">本地优先的桌面 AI 编程工作台</text>
</svg>
`
}

/**
 * The wide card, 3:1. `docs/images/banner.*`.
 */
export function bannerSvg(mark: Mark, theme: IconTheme): string {
  const colors = PALETTE[theme]
  const [width, height] = [2752, 921]
  const markHeight = 470
  const inset = 64
  const letterSpacing = 8
  const gap = 180
  const gutter = 180
  const fontSize = fitWordmark(width - gutter * 2 - markWidthAt(mark, markHeight) - gap, letterSpacing)
  // A second plate one step off the first, so the card still reads as a card
  // when a social feed composites it onto its own background.
  const surround = theme === 'dark' ? '#15130F' : '#E5DBC3'

  const groupWidth = markWidthAt(mark, markHeight) + gap + wordmarkWidth(fontSize, letterSpacing)
  const groupLeft = (width - groupWidth) / 2
  const markCx = groupLeft + markWidthAt(mark, markHeight) / 2
  const textX = groupLeft + markWidthAt(mark, markHeight) + gap

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" rx="56" fill="${surround}"/>
  <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="48" fill="${colors.plate}"/>
  ${markGroup(mark, colors, { cx: markCx, cy: height / 2, height: markHeight })}
  <text x="${textX}" y="530" fill="${colors.ink}" font-family="${WORDMARK_FONT}" font-size="${fontSize}" font-weight="800" letter-spacing="${letterSpacing}">${WORDMARK}</text>
  <path d="M${textX} 628H${textX + wordmarkWidth(fontSize, letterSpacing)}" stroke="${colors.seal}" stroke-width="26" stroke-linecap="round"/>
</svg>
`
}

/**
 * The SVG declares 1024x1024 at the default 72dpi, so rasterizing above that
 * needs the density scaled to match — otherwise sharp renders 1024 logical
 * pixels and upscales, which softens every edge in the mark.
 */
function rasterize(svg: string, size: number) {
  return sharp(Buffer.from(svg), { density: (72 * Math.max(size, 1024)) / 1024 }).resize(size, size)
}

/**
 * Every raster below 1024 is downsampled from the 1024 render rather than
 * rasterized at its own size: the filtered average of a large render antialiases
 * a tapered blade far better than rendering it into 16 pixels directly.
 */
const downscale = (png1024: Buffer, size: number) =>
  sharp(png1024).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

/**
 * Assemble an .ico by hand. Every entry is a PNG, which is the layout the icon
 * this replaces already used and what Windows has read since Vista; the tools
 * that would do it instead each emit a single 256px entry, leaving Explorer and
 * the taskbar to downscale 256 -> 16 themselves.
 */
export function buildIco(entries: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length
  entries.forEach((entry, index) => {
    const at = index * 16
    // 256 is stored as 0: the field is one byte and 256 does not fit.
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at)
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1)
    directory.writeUInt8(0, at + 2) // palette size: 0 for truecolor
    directory.writeUInt8(0, at + 3) // reserved
    directory.writeUInt16LE(1, at + 4) // color planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(entry.png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)])
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** `iconutil` names; the value is the pixel size each name must contain. */
const ICONSET: Record<string, number> = {
  'icon_16x16.png': 16,
  'icon_16x16@2x.png': 32,
  'icon_32x32.png': 32,
  'icon_32x32@2x.png': 64,
  'icon_128x128.png': 128,
  'icon_128x128@2x.png': 256,
  'icon_256x256.png': 256,
  'icon_256x256@2x.png': 512,
  'icon_512x512.png': 512,
  'icon_512x512@2x.png': 1024,
}

/**
 * electron-builder scans the linux icon directory and keeps files whose names
 * parse as NxN. Nothing else may live there: the Windows Store tiles the Tauri
 * shell left behind parsed as sizes too, and `Square310x310Logo.png` once won
 * that scan outright, shipping a 310px Store asset as the Linux app icon.
 */
const LINUX_SIZES: Record<string, number> = {
  '32x32.png': 32,
  '64x64.png': 64,
  '128x128.png': 128,
  '128x128@2x.png': 256,
  '256x256.png': 256,
  '512x512.png': 512,
}

async function buildIcns(png1024: Buffer, destination: string): Promise<string> {
  const staging = await mkdtemp(path.join(tmpdir(), 'sdx-iconset-'))
  const iconset = path.join(staging, 'icon.iconset')
  try {
    await mkdir(iconset, { recursive: true })
    for (const [name, size] of Object.entries(ICONSET)) {
      await sharp(png1024).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(iconset, name))
    }
    // iconutil is the only tool here that emits the 16px and 32px ARGB entries a
    // non-Retina display falls back to; the cross-platform alternative starts at
    // 32px and lets macOS downscale.
    const result = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', destination], { encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      throw new Error(`iconutil failed: ${result.stderr || result.error?.message}`)
    }
    return 'iconutil'
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function main() {
  const source = await readFile(markSource, 'utf8')
  const mark = readMark(source)

  const svg: Record<IconTheme, string> = {
    light: iconSvg(mark, 'light'),
    dark: iconSvg(mark, 'dark'),
  }
  // The shipped icon is the dark plate; see the note at the top of this file.
  const shipped = svg.dark

  const written: string[] = []
  const write = async (relativePath: string, data: Buffer | string) => {
    const absolute = path.join(repoRoot, relativePath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, data)
    written.push(relativePath)
  }

  // ── vector ────────────────────────────────────────────────────────────────
  for (const relativePath of [
    'desktop/public/app-icon.svg',
    'desktop/src-tauri/app-icon.svg',
    'desktop/src-tauri/app-icon-macos.svg',
    'docs/images/app-icon.svg',
    'docs/images/app-icon-dark.svg',
  ]) {
    await write(relativePath, shipped)
  }
  await write('docs/images/app-icon-light.svg', svg.light)

  // ── raster ────────────────────────────────────────────────────────────────
  const png1024 = await rasterize(shipped, 1024).png({ compressionLevel: 9 }).toBuffer()
  await write('desktop/public/app-icon.png', png1024)
  await write('desktop/src-tauri/app-icon.png', png1024)
  await write('desktop/src-tauri/icons/icon.png', await downscale(png1024, 512))

  for (const [name, size] of Object.entries(LINUX_SIZES)) {
    await write(path.join('desktop/src-tauri/icons', name), await downscale(png1024, size))
  }

  // ── containers ────────────────────────────────────────────────────────────
  const icoEntries = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, png: await downscale(png1024, size) })),
  )
  await write('desktop/src-tauri/icons/icon.ico', buildIco(icoEntries))

  const icnsPath = path.join(repoRoot, 'desktop/src-tauri/icons/icon.icns')
  await mkdir(path.dirname(icnsPath), { recursive: true })
  const icnsTool = await buildIcns(png1024, icnsPath)
  written.push(`desktop/src-tauri/icons/icon.icns (${icnsTool})`)

  // ── docs ──────────────────────────────────────────────────────────────────
  const webp = (source: string) => rasterize(source, 1024).webp({ quality: 90, effort: 6 }).toBuffer()
  await write('docs/images/app-icon.webp', await webp(shipped))
  await write('docs/images/app-icon-dark.webp', await webp(shipped))
  await write('docs/images/app-icon-light.webp', await webp(svg.light))

  // ── wordmark ──────────────────────────────────────────────────────────────
  // These carry live text, so they render at their own dimensions rather than
  // through the square icon path.
  const wide = (source: string, width: number, height: number) =>
    sharp(Buffer.from(source), { density: 72 }).resize(width, height)

  for (const [relativePath, source, width, height] of [
    ['docs/images/logo-horizontal.svg', lockupSvg(mark, 'light'), 2200, 640],
    ['docs/images/logo-horizontal-dark.svg', lockupSvg(mark, 'dark'), 2200, 640],
    ['docs/images/banner.svg', bannerSvg(mark, 'light'), 2752, 921],
  ] as const) {
    await write(relativePath, source)
    await write(
      relativePath.replace(/\.svg$/, '.webp'),
      await wide(source, width, height).webp({ quality: 90, effort: 6 }).toBuffer(),
    )
  }

  // The og:image. PNG, not WebP: some scrapers still refuse WebP, and a social
  // card that fails to render is worse than a larger file.
  const card = socialCardSvg(mark, 'light')
  await write('docs/public/images/banner.svg', card)
  await write('docs/public/images/banner.png', await wide(card, 1200, 630).png({ compressionLevel: 9 }).toBuffer())

  console.log(`[generate-brand-assets] wrote ${written.length} files from ${path.relative(repoRoot, markSource)}`)
  for (const relativePath of written) console.log(`  ${relativePath}`)
}

if (import.meta.main) {
  await main()
}
