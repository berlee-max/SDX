import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { BrandSeal } from './BrandSeal'

const SIZES = ['sm', 'md', 'lg', 'xl'] as const

describe('BrandSeal', () => {
  it('is decorative and hidden from assistive tech', () => {
    // The product name always sits beside the mark (sidebar) or under it
    // (empty state); announcing the brand again reads it twice.
    const { container } = render(<BrandSeal />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws both crossed blades at every size', () => {
    // The two blades ARE the mark. Whatever else is shed, losing one leaves a
    // single tapered sliver that reads as nothing.
    for (const size of SIZES) {
      const { container, unmount } = render(<BrandSeal size={size} />)
      expect(container.querySelectorAll(`path[fill="var(--color-text-primary)"]`)).toHaveLength(1)
      expect(
        container.querySelectorAll(`path[fill="var(--color-brand)"]`).length,
      ).toBeGreaterThanOrEqual(1)
      unmount()
    }
  })

  it('paints from tokens so all six palettes recolor it', () => {
    // This is why the vector replaced the raster app icon: a bitmap kept its
    // own colours under every theme while the chrome around it moved.
    const { container } = render(<BrandSeal size="xl" />)
    const svg = container.firstElementChild!
    expect(svg.querySelector('[fill="var(--color-text-primary)"]')).not.toBeNull()
    expect(svg.querySelector('[fill="var(--color-brand)"]')).not.toBeNull()
    // No literal hex anywhere — that would survive a theme switch unchanged.
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('is filled rather than stroked, so the blades can taper', () => {
    // A stroke carries one width along its whole length. The tips here come to
    // a point, and a stroke thin enough to look right at 80px is gone at 24px.
    for (const size of SIZES) {
      const { container, unmount } = render(<BrandSeal size={size} />)
      expect(container.querySelectorAll('[stroke]')).toHaveLength(0)
      unmount()
    }
  })

  it('sheds the orbiting sparks below xl instead of turning to mush', () => {
    // At 38px a spark is under 2px across and reads as dirt.
    const brandPaths = (size: (typeof SIZES)[number]) => {
      const { container, unmount } = render(<BrandSeal size={size} />)
      const n = container.querySelectorAll('path[fill="var(--color-brand)"]').length
      unmount()
      return n
    }
    expect(brandPaths('xl')).toBe(3) // long blade + two sparks
    expect(brandPaths('lg')).toBe(1) // long blade only
    expect(brandPaths('md')).toBe(1)
    expect(brandPaths('sm')).toBe(1)
  })

  it('crops the viewBox to the ink so the mark fills its box', () => {
    // A full 0 0 1024 1024 viewBox would letterbox the mark to roughly half
    // the height of its container at every size.
    for (const size of SIZES) {
      const { container, unmount } = render(<BrandSeal size={size} />)
      const viewBox = container.firstElementChild!.getAttribute('viewBox')!
      const [x, y, w, h] = viewBox.split(' ').map(Number)
      expect(x).toBeGreaterThan(200)
      expect(y).toBeGreaterThan(200)
      expect(w).toBeLessThan(1024)
      expect(h).toBeLessThan(1024)
      unmount()
    }
  })

  it('widens the crop only at xl, where the sparks push the bounds out', () => {
    // sm/md/lg dropping the sparks changes what is drawn, not how far the ink
    // reaches — so they share a crop, and only xl's is wider.
    const box = (size: (typeof SIZES)[number]) => {
      const { container, unmount } = render(<BrandSeal size={size} />)
      const vb = container.firstElementChild!.getAttribute('viewBox')!
      unmount()
      return vb
    }
    expect(box('sm')).toBe(box('md'))
    expect(box('md')).toBe(box('lg'))
    expect(box('xl')).not.toBe(box('lg'))
    expect(Number(box('xl').split(' ')[2])).toBeGreaterThan(Number(box('lg').split(' ')[2]))
  })
})
