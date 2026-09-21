/**
 * Where this site lives, in one place.
 *
 * It is a GitHub Pages *project* site, so the repository name is a path prefix
 * on a shared origin rather than a domain of its own. That prefix is the reason
 * every absolute URL on the site is `origin + base + route` and never
 * `origin + route`: a canonical tag, an `og:url`, a sitemap entry or a
 * `robots.txt` line that forgets it points at a 404.
 *
 * The fork it came from used a custom domain at the apex, where base was `''`
 * and the distinction did not exist. `docs/public/CNAME` claimed that domain,
 * which this account does not own, so it was removed rather than repointed —
 * `prepare-static-output.mjs` now fails if one reappears.
 *
 * Imported by browser code (`lib/meta.js`) and by the static-output script that
 * runs in Node, so it must stay free of anything either one cannot load: plain
 * constants and one pure function.
 *
 * `SITE_BASE` is duplicated in `vite.config.js` as `base`, because Vite reads
 * its config before any of this is loadable. They have to move together.
 */
export const SITE_ORIGIN = 'https://berlee-max.github.io'

/** No trailing slash, so `SITE_BASE + route` never doubles one. */
export const SITE_BASE = '/SDX'

/** An absolute URL for an in-site route. `route` starts with `/`. */
export function siteUrl(route) {
  return `${SITE_ORIGIN}${SITE_BASE}${route === '/' ? '/' : route}`
}
