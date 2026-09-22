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
 * Two constraints shape the design.
 *
 * ISOLATION. The server reads ~/.claude by default, which on a real machine is
 * the author's own projects and conversations. Screenshots are published, so a
 * capture run must never see that. Every run points HOME and CLAUDE_CONFIG_DIR
 * at a throwaway directory and builds its own fixture projects, and refuses to
 * start if that redirection is missing.
 *
 * EXACT PIXELS. check-docs pins widths (2000, or 1206 for `h5-`) and requires
 * en and zh-CN to match each other exactly. A browser pane that scales its
 * screenshots cannot satisfy that, so this drives headless Chrome over CDP and
 * sets the device metrics directly.
 *
 * Usage:
 *   bun run scripts/docs/capture-screenshots.mjs --list
 *   bun run scripts/docs/capture-screenshots.mjs session-new
 *   bun run scripts/docs/capture-screenshots.mjs --all
 *
 * The API server and the desktop dev server must already be running against
 * the throwaway directory; --help prints the two commands.
 */
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const REPO = path.resolve(import.meta.dir, '..', '..')
const API = process.env.SDX_SHOT_API ?? 'http://127.0.0.1:8791'
const WEB = process.env.SDX_SHOT_WEB ?? 'http://127.0.0.1:8792'
const CDP = process.env.SDX_SHOT_CDP ?? 'http://127.0.0.1:9222'
const SCRATCH = process.env.SDX_SHOT_DIR ?? '/tmp/sdx-shots'
const APP_URL = `${WEB}/?serverUrl=${API}`

const LOCALES = [
  { locale: 'zh', dir: 'zh-CN' },
  { locale: 'en', dir: 'en' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function capture({ width, height, setup, settleMs = 6500, afterSetupMs = 6000, out }) {
  const tab = await (await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, {
    method: 'PUT',
  })).json()
  const client = connect(tab.webSocketDebuggerUrl)
  try {
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    })
    await client.send('Page.navigate', { url: APP_URL })
    await sleep(settleMs)
    if (setup) {
      await client.send('Runtime.evaluate', { expression: setup, awaitPromise: true })
      // `setup` normally ends in location.reload(); the app refetches its
      // session list afterwards. Screenshotting too soon photographs the
      // previous render, which looks like a stale fixture rather than a race.
      await sleep(afterSetupMs)
    }
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    await Bun.write(out, Buffer.from(shot.data, 'base64'))
  } finally {
    client.close()
    await fetch(`${CDP}/json/close/${tab.id}`).catch(() => {})
  }
}

// ------------------------------------------------------------------ fixtures

/** Neutral, invented projects. Never the repository itself, never real work. */
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

async function createSessions() {
  const ids = {}
  for (const session of SESSIONS) {
    const response = await fetch(`${API}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDir: path.join(SCRATCH, 'projects', session.project) }),
    })
    if (!response.ok) throw new Error(`create session ${session.key}: ${response.status}`)
    ids[session.key] = (await response.json()).sessionId
  }
  return ids
}

async function setTitles(ids, locale) {
  for (const session of SESSIONS) {
    const response = await fetch(`${API}/api/sessions/${ids[session.key]}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: session[locale] }),
    })
    if (!response.ok) throw new Error(`title ${session.key}: ${response.status}`)
    // Two sessions in one project race each other if written back to back and
    // one title is silently dropped, so these are deliberately spaced. Remove
    // the wait once that lost update is fixed, not before — without it this
    // script produces screenshots with a title in the wrong language.
    await sleep(1600)
  }
  // Spacing makes it likely, not certain. Assert before spending a capture.
  for (let attempt = 0; attempt < 30; attempt++) {
    const listing = await (await fetch(`${API}/api/sessions`)).json()
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

/**
 * Each entry produces docs/images/app/<dir>/<name>.webp for both locales.
 * `width`/`height` must match what check-docs pins for that name.
 */
const SHOTS = {
  'session-new': {
    width: 2000, height: 1436,
    setup: (locale) => prelude(locale),
  },
}

async function shoot(name, ids) {
  const shot = SHOTS[name]
  if (!shot) throw new Error(`unknown shot: ${name}`)
  const sharp = (await import(path.join(REPO, 'desktop/node_modules/sharp/lib/index.js'))).default

  for (const { locale, dir } of LOCALES) {
    await setTitles(ids, locale)
    const png = path.join(SCRATCH, `${name}.${dir}.png`)
    await capture({ width: shot.width, height: shot.height, setup: shot.setup(locale), out: png })
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

function usage() {
  console.log(`Re-capture documentation screenshots.

  bun run scripts/docs/capture-screenshots.mjs --list
  bun run scripts/docs/capture-screenshots.mjs <name>...
  bun run scripts/docs/capture-screenshots.mjs --all

Start these first, all three pointed at a throwaway directory:

  mkdir -p ${SCRATCH}/home ${SCRATCH}/claude
  HOME=${SCRATCH}/home CLAUDE_CONFIG_DIR=${SCRATCH}/claude SERVER_PORT=8791 \\
    bun run src/server/index.ts --port 8791 --host 127.0.0.1
  (cd desktop && bun run dev -- --host 127.0.0.1 --port 8792)
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \\
    --user-data-dir=${SCRATCH}/chrome --remote-debugging-port=9222 about:blank
`)
}

const args = process.argv.slice(2)
if (args.length === 0 || args.includes('--help')) { usage(); process.exit(0) }
if (args.includes('--list')) { console.log(Object.keys(SHOTS).join('\n')); process.exit(0) }

const names = args.includes('--all') ? Object.keys(SHOTS) : args.filter((a) => !a.startsWith('-'))

for (const [name, url] of [['API', `${API}/health`], ['web', WEB], ['CDP', `${CDP}/json/version`]]) {
  const ok = await fetch(url).then((r) => r.ok).catch(() => false)
  if (!ok) { console.error(`${name} is not reachable at ${url}\n`); usage(); process.exit(1) }
}

// The whole point is that a published screenshot cannot contain real work.
const configDir = await (await fetch(`${API}/health`)).ok && process.env.SDX_SHOT_ASSUME_ISOLATED
if (!configDir && !existsSync(path.join(SCRATCH, 'claude'))) {
  console.error(`Refusing to run: ${SCRATCH}/claude does not exist, which means the server`)
  console.error('is probably reading the real ~/.claude. Screenshots get published; start')
  console.error('the server with HOME and CLAUDE_CONFIG_DIR redirected first (--help).')
  process.exit(1)
}

mkdirSync(SCRATCH, { recursive: true })
buildFixtureProjects()
const ids = await createSessions()
for (const name of names) {
  console.log(name)
  await shoot(name, ids)
}
console.log('\nNow run: bun run check:docs')
