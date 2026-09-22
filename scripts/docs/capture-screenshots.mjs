#!/usr/bin/env bun
/**
 * Re-capture the documentation screenshots in docs/images/app/.
 *
 * docs/AGENTS.md says these must be "captured from a real build" and never
 * patched when the UI moves on. Until this script existed there was nothing to
 * capture them WITH, so the whole set was inherited from upstream and quietly
 * went stale: by v0.1.1 every one of the 50 still carried the upstream wordmark
 * and a composer placeholder the app had stopped using.
 *
 * Three constraints shape the design.
 *
 * THE REAL SHELL. The renderer also runs in a plain browser against the dev
 * server, which is far easier to drive — but it is not the same product. The
 * browser gets the remote variant: Settings there offers two tabs under a
 * banner reading "Desktop administration and remote-access controls remain on
 * the desktop", where the packaged app has fifteen. Screenshots taken that way
 * would document an app nobody installed. So this attaches to the packaged
 * .app over its own remote-debugging port.
 *
 * ISOLATION. The app reads ~/.claude, which on a real machine is the author's
 * own projects and conversations, and these images get published. The app must
 * be launched with HOME and CLAUDE_CONFIG_DIR redirected at a throwaway
 * directory; this script refuses to run against an API that already holds
 * sessions, because its first act is to delete every session it finds.
 *
 * EXACT PIXELS. check-docs pins widths (2000, or 1206 for `h5-`) and requires
 * en and zh-CN to match each other exactly. Emulation.setDeviceMetricsOverride
 * sets them on the renderer directly, independent of the real window size.
 *
 * Usage:
 *   bun run scripts/docs/capture-screenshots.mjs --help
 *   bun run scripts/docs/capture-screenshots.mjs --list
 *   bun run scripts/docs/capture-screenshots.mjs session-new settings-general
 *   bun run scripts/docs/capture-screenshots.mjs --all
 */
import { mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const REPO = path.resolve(import.meta.dir, '..', '..')
const CDP = process.env.SDX_SHOT_CDP ?? 'http://127.0.0.1:9223'
const SCRATCH = process.env.SDX_SHOT_DIR ?? '/tmp/sdx-shots'
const APP = path.join(REPO, 'desktop/build-artifacts/macos-arm64/AI Agent SDX.app/Contents/MacOS/AI Agent SDX')

const LOCALES = [
  { locale: 'zh', dir: 'zh-CN' },
  { locale: 'en', dir: 'en' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function usage() {
  console.log(`Re-capture documentation screenshots from the packaged app.

  bun run scripts/docs/capture-screenshots.mjs --list
  bun run scripts/docs/capture-screenshots.mjs <name>...
  bun run scripts/docs/capture-screenshots.mjs --all

Start the app first, with its data directory redirected somewhere disposable.
Without this it reads your real ~/.claude, and your own projects and
conversations end up in published images:

  mkdir -p ${SCRATCH}/home ${SCRATCH}/claude
  HOME=${SCRATCH}/home CLAUDE_CONFIG_DIR=${SCRATCH}/claude \\
    "${APP}" --remote-debugging-port=9223

The app's own API port is discovered automatically; override with SDX_SHOT_API.
`)
}

// ------------------------------------------------------------ app discovery

/**
 * The packaged app picks its API port at startup and only prints it to stdout,
 * so find it by asking which ports the Electron process listens on and probing
 * each. Guessing common ports would be worse than failing: something else
 * answering would send fixtures into a stranger's data directory.
 */
async function discoverApi() {
  if (process.env.SDX_SHOT_API) return process.env.SDX_SHOT_API
  const lsof = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' })
  const ports = new Set()
  for (const line of (lsof.stdout ?? '').split('\n')) {
    // The API belongs to the sidecar process, not to Electron itself. Electron
    // is matched too because other apps' helpers also appear here — which is
    // exactly why a port is only accepted after it answers in this app's shape.
    if (!/(claude-si|sidecar|electron)/i.test(line)) continue
    const match = line.match(/(?:127\.0\.0\.1|\*):(\d+)/)
    if (match) ports.add(match[1])
  }
  for (const port of ports) {
    const base = `http://127.0.0.1:${port}`
    const body = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(1500) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    // This machine runs other Electron apps. Anything can answer a GET; only
    // this API answers with a session listing carrying an index summary.
    if (body && Array.isArray(body.sessions) && body.index) return base
  }
  throw new Error('could not find the app API port; set SDX_SHOT_API')
}

// ---------------------------------------------------------------- CDP client

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const ready = new Promise((resolve) => (ws.onopen = resolve))
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
  const send = async (method, params = {}) => {
    await ready
    const myId = ++id
    return new Promise((resolve, reject) => {
      pending.set(myId, { resolve, reject })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
  }
  return { send, close: () => ws.close() }
}

async function attach() {
  const targets = await (await fetch(`${CDP}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page')
  if (!page) throw new Error(`no page target on ${CDP}; is the app running with --remote-debugging-port?`)
  return connect(page.webSocketDebuggerUrl)
}

/**
 * Injected so a shot can say "click Settings" instead of naming a store field
 * or a pixel, and so a miss reports what IS on screen.
 */
const HELPER = `
  window.__shotVisible = (el) => {
    // offsetParent is null for position:fixed elements, which is most of a
    // sidebar footer, so geometry is the test rather than layout ancestry.
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }
  window.__shotCandidates = () =>
    [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')]
      .filter(window.__shotVisible).map((el) => (el.textContent || '').trim()).filter(Boolean)
  window.__shotLocate = (text, nth = 0) => {
    const wanted = String(text).trim()
    const clickable = [...document.querySelectorAll('button, a, [role="button"], [role="tab"], li, div')]
      .filter(window.__shotVisible)
    const textOf = (el) => (el.textContent || '').trim()
    // Icons here are Material ligatures, so a button's textContent reads
    // "settings设置", not "设置". Exact match first, then the shortest element
    // containing the label — shortest being the control, not a wrapper.
    const exact = clickable.filter((el) => textOf(el) === wanted)
    const hits = (exact.length ? exact : clickable.filter((el) => textOf(el).includes(wanted)))
      .sort((a, b) => textOf(a).length - textOf(b).length)
    const target = hits[nth]
    if (!target) {
      throw new Error('no element with text: ' + wanted
        + ' -- visible clickables: ' + JSON.stringify(window.__shotCandidates().slice(0, 40)))
    }
    const rect = target.getBoundingClientRect()
    // A point, not target.click(): some controls listen for pointer events and
    // ignored a synthetic click entirely — silently, which is the worst way for
    // a capture to fail. The driver dispatches a real mouse event at this point.
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  }
`

async function capture({ width, height, setup, steps = [], afterSetupMs = 6000, out }) {
  const client = await attach()
  try {
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    })
    if (setup) {
      await client.send('Runtime.evaluate', { expression: setup, awaitPromise: true })
      // `setup` ends in location.reload(); the app refetches its session list
      // afterwards. Screenshotting too soon photographs the previous render,
      // which reads as a stale fixture rather than as a race.
      await sleep(afterSetupMs)
    }
    for (const step of steps) {
      await client.send('Runtime.evaluate', { expression: HELPER })
      const result = await client.send('Runtime.evaluate', {
        expression: step.js, awaitPromise: true, returnByValue: true,
      })
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails.exception?.description
          ?? JSON.stringify(result.exceptionDetails)
        throw new Error(`step failed: ${step.js} -- ${detail}`)
      }
      const point = result.result?.value
      if (point && typeof point.x === 'number') {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await client.send('Input.dispatchMouseEvent', {
            type, x: point.x, y: point.y, button: 'left', clickCount: 1,
          })
        }
      }
      await sleep(step.waitMs ?? 2500)
    }
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    await Bun.write(out, Buffer.from(shot.data, 'base64'))
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
    client.close()
  }
}

// ------------------------------------------------------------------ fixtures

/** Neutral, invented projects. Never this repository, never real work. */
const PROJECTS = {
  'launch-board': { 'src/app.js': 'export function filterTasks(tasks, status) {\n  return tasks.filter((task) => task.status === status)\n}\n' },
  'docs-site': { 'src/nav.js': 'export function buildNav(pages) {\n  return pages.filter((page) => !page.draft).map((page) => page.slug)\n}\n' },
  'api-gateway': { 'src/router.js': 'export function route(path, table) {\n  return table.find((entry) => entry.pattern.test(path)) ?? null\n}\n' },
}

const SESSIONS = [
  { key: 'lb1', project: 'launch-board', zh: '为 filterTasks 补一组单元测试', en: 'Add focused unit tests for filterTasks' },
  { key: 'lb2', project: 'launch-board', zh: '把看板列表改成按截止日期排序', en: 'Sort the board by due date' },
  { key: 'ds', project: 'docs-site', zh: '导航生成漏掉了草稿页，查一下', en: 'Nav generation is dropping draft pages' },
  { key: 'ag', project: 'api-gateway', zh: '给路由表加一个前缀匹配的分支', en: 'Add a prefix-match branch to the router' },
]

function buildFixtureProjects() {
  for (const [name, files] of Object.entries(PROJECTS)) {
    const root = path.join(SCRATCH, 'projects', name)
    rmSync(root, { recursive: true, force: true })
    for (const [relative, body] of Object.entries(files)) {
      const file = path.join(root, relative)
      mkdirSync(path.dirname(file), { recursive: true })
      Bun.write(file, body)
    }
    Bun.write(path.join(root, 'README.md'), `# ${name}\n\nFixture project for documentation screenshots.\n`)
    const git = (...args) => spawnSync('git', args, { cwd: root, stdio: 'ignore' })
    git('init', '-q')
    git('add', '-A')
    git('-c', 'user.email=docs@example.com', '-c', 'user.name=docs', 'commit', '-qm', 'initial')
  }
}

/**
 * Runs accumulate otherwise: last run's fixtures are still there, this run adds
 * four more to the same projects, and the extra same-project writes make the
 * lost update below far more likely.
 */
async function resetSessions(api) {
  const listing = await (await fetch(`${api}/api/sessions`)).json()
  for (const session of listing.sessions ?? []) {
    await fetch(`${api}/api/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {})
    await sleep(300)
  }
}

async function createSessions(api) {
  const ids = {}
  for (const session of SESSIONS) {
    const response = await fetch(`${api}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDir: path.join(SCRATCH, 'projects', session.project) }),
    })
    if (!response.ok) throw new Error(`create session ${session.key}: ${response.status}`)
    ids[session.key] = (await response.json()).sessionId
  }
  return ids
}

async function setTitles(api, ids, locale) {
  for (const session of SESSIONS) {
    const response = await fetch(`${api}/api/sessions/${ids[session.key]}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: session[locale] }),
    })
    if (!response.ok) throw new Error(`title ${session.key}: ${response.status}`)
    // Two sessions in one project race each other if written back to back, and
    // one title is silently dropped, so these are deliberately spaced. Do not
    // remove the wait until that lost update is fixed — without it this script
    // produces screenshots with a title in the wrong language.
    await sleep(1600)
  }
  // Spacing makes it likely, not certain. Assert before spending a capture.
  for (let attempt = 0; attempt < 30; attempt++) {
    const listing = await (await fetch(`${api}/api/sessions`)).json()
    const titles = (listing.sessions ?? []).map((entry) => entry.title)
    if (SESSIONS.every((session) => titles.includes(session[locale]))) return
    await sleep(1000)
  }
  throw new Error(`session titles never settled for ${locale}`)
}

// -------------------------------------------------------------------- shots

const prelude = (locale) => `
  localStorage.setItem('cc-haha-locale', ${JSON.stringify(locale)});
  localStorage.setItem('cc-haha-theme', 'light');
  location.reload();
`
const t = (locale, en, zh) => JSON.stringify(locale === 'en' ? en : zh)

/** Each entry writes docs/images/app/<dir>/<name>.webp for both locales. */
const SHOTS = {
  'session-new': {
    width: 2000, height: 1436,
    setup: (locale) => prelude(locale),
  },
  'settings-general': {
    width: 2000, height: 1436,
    setup: (locale) => prelude(locale),
    steps: (locale) => [
      { js: `__shotLocate(${t(locale, 'Settings', '设置')})` },
      { js: `__shotLocate(${t(locale, 'General', '通用')})` },
    ],
  },
  // settings-usage is deliberately absent. It captures cleanly, but a scratch
  // profile has no token history, so the panel is its empty state — and the
  // page that embeds it promises "a heatmap and stat cards". Seeding real usage
  // needs real model runs; until then no screenshot beats a misleading one.
}

async function shoot(name, api, ids) {
  const shot = SHOTS[name]
  const sharp = (await import(path.join(REPO, 'desktop/node_modules/sharp/lib/index.js'))).default

  for (const { locale, dir } of LOCALES) {
    await setTitles(api, ids, locale)
    const png = path.join(SCRATCH, `${name}.${dir}.png`)
    await capture({
      width: shot.width, height: shot.height,
      setup: shot.setup(locale), steps: shot.steps?.(locale) ?? [],
      out: png,
    })
    const webp = path.join(REPO, 'docs/images/app', dir, `${name}.webp`)
    await sharp(png).webp({ quality: 82 }).toFile(webp)
    const meta = await sharp(webp).metadata()
    if (meta.width !== shot.width || meta.height !== shot.height) {
      throw new Error(`${webp}: ${meta.width}x${meta.height}, expected ${shot.width}x${shot.height}`)
    }
    console.log(`  ${dir}/${name}.webp  ${meta.width}x${meta.height}`)
  }
}

// --------------------------------------------------------------------- main

const args = process.argv.slice(2)
if (args.length === 0 || args.includes('--help')) { usage(); process.exit(0) }
if (args.includes('--list')) { console.log(Object.keys(SHOTS).join('\n')); process.exit(0) }

const names = args.includes('--all') ? Object.keys(SHOTS) : args.filter((a) => !a.startsWith('-'))
for (const name of names) {
  if (!SHOTS[name]) { console.error(`unknown shot: ${name}`); process.exit(1) }
}

const reachable = await fetch(`${CDP}/json/list`).then((r) => r.ok).catch(() => false)
if (!reachable) { console.error(`No debuggable app at ${CDP}.\n`); usage(); process.exit(1) }

const api = await discoverApi()
// This script's first act is to delete every session it finds, so it has to be
// sure it is looking at a disposable directory. The test is not "is it empty" —
// a second run legitimately finds its own fixtures — but "does everything here
// live under the scratch directory". One session pointing anywhere else means
// this is somebody's real app, and nothing gets deleted.
const existing = await (await fetch(`${api}/api/sessions`)).json()
const scratchReal = SCRATCH.startsWith('/tmp/') ? `/private${SCRATCH}` : SCRATCH
const foreign = (existing.sessions ?? []).filter((session) => {
  const root = session.workDir ?? session.projectRoot ?? ''
  return !root.startsWith(SCRATCH) && !root.startsWith(scratchReal)
})
if (foreign.length > 0 && !process.env.SDX_SHOT_ALLOW_EXISTING) {
  console.error(`Refusing to run: ${api} holds ${foreign.length} session(s) outside ${SCRATCH},`)
  console.error(`such as ${foreign[0].workDir ?? foreign[0].projectRoot}.`)
  console.error('That looks like a real installation, and this script deletes what it finds.')
  console.error('Relaunch the app with HOME and CLAUDE_CONFIG_DIR redirected (--help).')
  process.exit(1)
}

console.log(`app API: ${api}`)
mkdirSync(SCRATCH, { recursive: true })
buildFixtureProjects()
await resetSessions(api)
const ids = await createSessions(api)
for (const name of names) {
  console.log(name)
  await shoot(name, api, ids)
}
console.log('\nNow run: bun run check:docs')
