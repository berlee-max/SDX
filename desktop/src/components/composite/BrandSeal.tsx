import { cx } from '@/lib/cx'

/**
 * The SDX mark — the blade-star from the "X" of the SDX wordmark.
 *
 * Two tapered spikes cross at a shared waist: a long pair swept off 45 degrees,
 * and a shorter pair crossing it the other way. The asymmetry is the point. An
 * even, axis-aligned four-point star is the "AI sparkle" a dozen other tools
 * already ship; the lean and the unequal arms are what keep this one telling
 * them apart.
 *
 * Everything is FILLED, never stroked. A stroke has one width along its whole
 * length and cannot taper, and a stroke thin enough to look right at 80px has
 * already disappeared at 24px. Filled tapered blades hold a real point at every
 * size — the narrowest feature here is 7.6px at the 24px rendering.
 *
 * Geometry is generated, not hand-drawn, and the viewBoxes below are the
 * measured ink bounds rather than estimates. Two things the raster app icon
 * could not do:
 *
 * 1. Recolour. The PNG kept its own palette while the chrome around it moved.
 *    Here the long blade takes `--color-brand` and the short one
 *    `--color-text-primary`, so every theme repaints the mark. When a palette
 *    makes those two nearly equal the blades merge into one solid star instead
 *    of half the silhouette dropping out — the monochrome case is a non-event
 *    rather than a failure.
 * 2. Shrink. The orbiting sparks are under 2px across below 80px and read as
 *    dirt, so they only exist at `xl` (see `SIZES`).
 *
 * A spark at the crossing was tried and cut. Drawn in ink over the brand-
 * coloured blade it reads as a flash on a dark theme but as a punched hole on a
 * light one, and an element that inverts meaning between themes is worse than
 * no element.
 */
export type BrandSealSize = 'sm' | 'md' | 'lg' | 'xl'

/** Which elements survive at each size. */
type MarkParts = 'star' | 'full'

/**
 * `sm`/`md`/`lg` share a viewBox on purpose rather than by oversight: the parts
 * they drop sit inside the star's own ink bounds, so what is drawn changes but
 * how far the ink reaches does not. The crop only moves at `xl`, where the
 * orbiting sparks push the bounds outward.
 */
const SIZES: Record<BrandSealSize, { box: string; viewBox: string; parts: MarkParts }> = {
  sm: { box: 'h-6 w-[27px]', viewBox: '280 309 465 406', parts: 'star' },
  md: { box: 'h-8 w-[37px]', viewBox: '280 309 465 406', parts: 'star' },
  lg: { box: 'h-[38px] w-[44px]', viewBox: '280 309 465 406', parts: 'star' },
  xl: { box: 'h-20 w-[100px]', viewBox: '206 249 632 508', parts: 'full' },
}

const INK = 'var(--color-text-primary)'
const SEAL = 'var(--color-brand)'

/** The short pair, crossing up-left to down-right. Drawn first, under the long pair. */
const SHORT_BLADE = 'M390.40 338.34C441.24 450.55 453.80 509.11 461.57 551.40C497.58 571.63 546.91 601.46 633.60 685.66C582.76 573.45 570.20 514.89 562.43 472.60C526.42 452.37 477.09 422.54 390.40 338.34Z'
/** The long swept pair — the dominant shape, leaning about 38 degrees. */
const LONG_BLADE = 'M738.41 315.18C591.57 404.66 516.39 430.41 461.52 447.38C435.24 500.95 396.91 573.88 285.59 708.82C432.43 619.34 507.61 593.59 562.48 576.62C588.76 523.05 627.09 450.12 738.41 315.18Z'
/** Sparks riding the long axis, `xl` only. */
const SPARK_LEAD = 'M801.99 255.44Q810.39 277.04 831.99 285.44Q810.39 293.84 801.99 315.44Q793.59 293.84 771.99 285.44Q793.59 277.04 801.99 255.44Z'
const SPARK_TRAIL = 'M234.62 705.71Q241.06 722.27 257.62 728.71Q241.06 735.15 234.62 751.71Q228.18 735.15 211.62 728.71Q228.18 722.27 234.62 705.71Z'

export type BrandSealProps = {
  size?: BrandSealSize
  className?: string
}

export function BrandSeal({ size = 'md', className }: BrandSealProps) {
  const spec = SIZES[size]

  return (
    <svg
      // Decorative: the product name sits next to the mark in the sidebar and
      // above it on the empty state, so announcing the brand twice is noise.
      aria-hidden="true"
      focusable="false"
      viewBox={spec.viewBox}
      className={cx('flex-shrink-0', spec.box, className)}
    >
      <path d={SHORT_BLADE} fill={INK} />
      <path d={LONG_BLADE} fill={SEAL} />
      {spec.parts === 'full' ? (
        <>
          <path d={SPARK_LEAD} fill={SEAL} />
          <path d={SPARK_TRAIL} fill={SEAL} />
        </>
      ) : null}
    </svg>
  )
}
