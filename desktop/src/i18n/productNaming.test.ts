import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Two ways to get the product's name wrong in the UI, and a guard for each.
 *
 * This app drives whatever model provider you configure — Qwen, OpenAI, Anthropic.
 * So a string like "Claude is ready to help you build" is not a stale brand name,
 * it is factually wrong for most users: it puts one vendor's name on the agent
 * doing the work. Those strings name the product instead.
 *
 * The opposite mistake is the likelier one on the next pass. "Claude" is also
 * correct in this UI wherever it means Anthropic's actual product or service —
 * the "Claude Official" provider, signing in to Claude.ai, `Claude Code` the CLI
 * this wraps, the `~/.claude` config directory. A bulk find-and-replace that
 * does not know the difference turns the provider list into a lie about what it
 * connects to. So the vendor strings are pinned as *required* to contain
 * "Claude", not merely allowed to.
 */
const localesDir = join(import.meta.dirname, 'locales')
const LOCALES = ['zh', 'en', 'zh-TW', 'jp', 'kr'] as const

/** Keys where "Claude" would mean the agent working for the user. */
const AGENT_KEYS = [
  'settings.agents.description',
  'settings.skills.description',
  'settings.memory.description',
  'settings.computerUse.description',
  'settings.computerUse.enableRiskSummary',
  'settings.computerUse.enableRiskScreen',
  'settings.computerUse.enableRiskActions',
  'settings.computerUse.enableRiskAllApps',
  'settings.computerUse.appsDescription',
  'settings.computerUse.controlSubtitle',
  'settings.computerUse.anyAppDesc',
  'settings.computerUse.osPermHint',
  'settings.computerUse.allowedAppsDesc',
  'settings.general.responseLangDescription',
  'settings.general.outputStyleDescription',
  'settings.general.outputStyleBuiltin.default.description',
  'settings.general.outputStyleBuiltin.explanatory.description',
  'settings.general.outputStyleBuiltin.learning.description',
  'empty.subtitle',
  'chat.placeholder',
  'chat.placeholderQuestionPending',
  'chat.capabilities.computerUseDescription',
  'permission.planPreviewTitle',
  'permission.planFeedbackPlaceholder',
  'question.needsInput',
  'question.chatAboutThisHint',
  'question.chatRequested',
  'question.expiredNotice',
  'permMode.autoAcceptDesc',
  'permMode.autoModeDesc',
  'permMode.enableBypassBody',
  'permMode.enableAutoDetail',
] as const

/** Keys where "Claude" is Anthropic's product or service and must survive. */
const VENDOR_KEYS = [
  'settings.claudeOfficialLogin.loginButton',
  'settings.providers.officialName',
  'settings.providers.ccSwitch.appTypeClaude',
  'settings.providers.ccSwitch.appTypeClaudeDesktop',
  'settings.mcp.scope.claudeai',
  'settings.general.webSearch.mode.anthropic',
  'settings.general.storageSystemDescription',
  'settings.plugins.emptyHint',
] as const

function readLocale(locale: string): Map<string, string> {
  const source = readFileSync(join(localesDir, `${locale}.ts`), 'utf8')
  const entries = new Map<string, string>()
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*'([^']+)':\s*(.*)$/)
    const [, key, value] = match ?? []
    if (key !== undefined && value !== undefined) entries.set(key, value)
  }
  return entries
}

const localeEntries = new Map(LOCALES.map((locale) => [locale, readLocale(locale)] as const))

describe('product naming in UI strings', () => {
  it.each(LOCALES)('%s does not put a vendor name on the agent', (locale) => {
    const entries = localeEntries.get(locale)!
    const offenders: string[] = []
    for (const key of AGENT_KEYS) {
      const value = entries.get(key)
      // A key missing from a locale is that locale's business, not this test's.
      if (value === undefined) continue
      if (/Claude/.test(value)) offenders.push(`${key}: ${value}`)
    }
    expect(offenders).toEqual([])
  })

  it.each(LOCALES)('%s keeps saying Claude where it means Anthropic', (locale) => {
    // Guards the over-correction. Losing these makes the provider list describe
    // a service it does not connect to.
    const entries = localeEntries.get(locale)!
    const lost: string[] = []
    for (const key of VENDOR_KEYS) {
      const value = entries.get(key)
      if (value === undefined) continue
      if (!/Claude/.test(value)) lost.push(`${key}: ${value}`)
    }
    expect(lost).toEqual([])
  })

  it('leaves the ~/.claude config path alone', () => {
    // Lowercase and load-bearing: it is the real directory on disk, shared with
    // the Claude Code CLI. Renaming it is a migration, not a copy edit — see
    // NOTICE.md's deferred list.
    for (const locale of LOCALES) {
      const entries = localeEntries.get(locale)!
      const skills = entries.get('settings.skills.description')
      if (skills) expect(skills).toContain('~/.claude/skills/')
    }
  })
})
