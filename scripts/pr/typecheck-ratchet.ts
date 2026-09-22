#!/usr/bin/env bun
/**
 * Type-check src/ and ratchet the error count downward.
 *
 * The CLI core has never been type-checked: the root had no working tsc setup
 * (it referenced an uninstalled `bun-types` and no typescript was installed),
 * so `src/` accumulated errors that only ever surfaced at runtime. Turning on a
 * strict, zero-error gate over ~790k lines in one step is not realistic, and it
 * would block every unrelated PR behind a multi-week cleanup.
 *
 * So instead: record today's count as a baseline and fail only when a change
 * pushes the count ABOVE it. New code cannot add type errors; existing ones get
 * paid down over time, and each time the count drops the baseline is tightened
 * (pass --update, or set TYPECHECK_UPDATE_BASELINE=1) so the gains are locked in.
 *
 * A large share of the current baseline is not written-code bugs: 137 modules
 * under src/ are reconstruction stubs (`export default stub; export const
 * __stubMissing = true`), and every import of a specific named export from one
 * is a TS2614. Those clear when the stubs are filled in, not by editing callers.
 *
 * Usage:
 *   bun run typecheck            # check against the baseline, fail if worse
 *   bun run typecheck --update   # re-record the baseline (only allowed to drop)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..', '..')
const baselinePath = join(repoRoot, 'scripts', 'pr', 'typecheck-baseline.json')
const tsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')

type Baseline = { errors: number; note: string }

function runTypecheck(): { count: number; output: string } {
  const result = spawnSync('node', [tsc, '-p', 'tsconfig.typecheck.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error) {
    console.error(`[typecheck] could not run tsc: ${result.error.message}`)
    process.exit(2)
  }
  // tsc exits non-zero when it reports errors; that is expected here. A crash
  // (no "error TS" lines but a failure) is different and must not read as zero.
  const count = (output.match(/error TS\d+/g) ?? []).length
  if (count === 0 && result.status !== 0) {
    console.error('[typecheck] tsc failed without emitting diagnostics:')
    console.error(output.slice(0, 2000))
    process.exit(2)
  }
  return { count, output }
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
}

const update = process.argv.includes('--update') || process.env.TYPECHECK_UPDATE_BASELINE === '1'
const { count } = runTypecheck()
const baseline = readBaseline()

if (update) {
  if (count > baseline.errors) {
    console.error(
      `[typecheck] refusing to raise the baseline: ${baseline.errors} -> ${count}. ` +
        'The baseline only ratchets down. Fix the new errors first.',
    )
    process.exit(1)
  }
  const next: Baseline = { ...baseline, errors: count }
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`[typecheck] baseline updated: ${baseline.errors} -> ${count}`)
  process.exit(0)
}

if (count > baseline.errors) {
  console.error(
    `[typecheck] ${count} errors, baseline is ${baseline.errors}. ` +
      `This change adds ${count - baseline.errors}. Type-check src/ and fix them, ` +
      'or if you removed errors, run `bun run typecheck --update` to lock in the drop.',
  )
  process.exit(1)
}

if (count < baseline.errors) {
  console.log(
    `[typecheck] ${count} errors, below the baseline of ${baseline.errors}. ` +
      'Run `bun run typecheck --update` to lock in the improvement.',
  )
  process.exit(0)
}

console.log(`[typecheck] ${count} errors, at baseline. No regression.`)
