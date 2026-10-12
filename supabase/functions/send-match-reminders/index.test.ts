import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { buildManualMatchReminderEventKey } from '../../../src/utils/matchReminderNotification'
import { buildMatchReminderScheduleEventKey, type DueMatchReminderScheduleRule } from '../../../src/utils/matchReminderSchedule'

// Exercise the actual query/guard declarations without remote modules, secrets,
// a listening server, recipient lookup, or any push provider.
const createHarness = (matches: Array<Record<string, unknown>>, queryError: unknown = null) => {
  const names = ['fetchMatchesByDate', 'fetchHealthMatchesByDates', 'fetchMatchById', 'getMatchDispatchState']
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
  const declarations = parsed.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name)
      && names.includes(declaration.name.text)))
  expect(declarations).toHaveLength(names.length)
  const script = declarations.map(statement => statement.getText(parsed)).join('\n')
  const runtime = ts.transpileModule(`${script}\nglobalThis.queries = { ${names.join(', ')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText
  const readTables: string[] = []
  const context: any = {
    supabase: {
      from: (table: string) => {
        readTables.push(table)
        let rows = [...matches]
        const query: any = {
          select: () => query,
          eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query },
          is: (key: string, value: unknown) => { rows = rows.filter(row => (row[key] ?? null) === value); return query },
          in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query },
          order: () => query,
          limit: (limit: number) => { rows = rows.slice(0, limit); return query },
          maybeSingle: async () => ({ data: rows[0] || null, error: queryError }),
          then: (resolve: (value: any) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: queryError }).then(resolve, reject)
        }
        return query
      }
    },
    jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status })
  }
  runInNewContext(runtime, context)
  return { queries: context.queries, readTables }
}

const active = { id: 'active', match_date: '2026-10-18', match_name: '友誼賽', match_time: '09:00', cancelled_at: null }
const cancelled = { ...active, id: 'cancelled', cancelled_at: '2026-10-12T01:00:00Z' }

describe('send-match-reminders cancellation', () => {
  it('preserves production JWT gateway verification in release configuration', () => {
    const config = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8')
    expect(config).toMatch(/\[functions\.send-match-reminders\]\s+verify_jwt = true/)
  })

  it('returns a restored match to normal scheduled, manual and health eligibility', async () => {
    const match = { ...cancelled, cancellation_reason: '誤取消' as string | null, cancelled_by: 'admin-id' as string | null }
    const { queries } = createHarness([match])
    expect(await queries.fetchMatchesByDate(match.match_date)).toEqual([])
    expect(await queries.getMatchDispatchState(match.id)).toBe('cancelled')
    Object.assign(match, { cancelled_at: null, cancellation_reason: null, cancelled_by: null })

    expect(await queries.fetchMatchesByDate(match.match_date)).toEqual([match])
    expect((await queries.fetchHealthMatchesByDates([match.match_date])).get(match.match_date)).toEqual([match])
    expect(await queries.fetchMatchById(match.id)).toEqual([match])
    expect(await queries.getMatchDispatchState(match.id)).toBe('active')
  })

  it('excludes cancelled games from scheduled reminders and missing-event health checks', async () => {
    const { queries } = createHarness([active, cancelled])
    expect(await queries.fetchMatchesByDate('2026-10-18')).toEqual([active])
    const healthMatches = await queries.fetchHealthMatchesByDates(['2026-10-18'])
    expect(healthMatches.get('2026-10-18')).toEqual([active])
    expect((await queries.fetchHealthMatchesByDates([])).size).toBe(0)
  })

  it('rejects a manual cancelled reminder before any recipient or event lookup', async () => {
    const { queries, readTables } = createHarness([active, cancelled])
    const response = await queries.fetchMatchById('cancelled').catch((error: Response) => error)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: '此賽事已取消，無法發送賽事提醒' })
    expect(readTables).toEqual(['matches'])
    expect(await queries.fetchMatchById('active')).toEqual([active])
  })

  it('fails closed if cancellation status cannot be read', async () => {
    const error = { message: 'database query failed' }
    const { queries } = createHarness([cancelled], error)
    await expect(queries.fetchMatchById('cancelled')).rejects.toEqual(error)
    await expect(queries.fetchMatchesByDate('2026-10-18')).rejects.toEqual(error)
    await expect(queries.fetchHealthMatchesByDates(['2026-10-18'])).rejects.toEqual(error)
    await expect(queries.getMatchDispatchState('cancelled')).resolves.toBe('unavailable')
  })

  it('rechecks the current saved cancellation state, including a deleted match', async () => {
    const { queries } = createHarness([active, cancelled])
    await expect(queries.getMatchDispatchState('active')).resolves.toBe('active')
    await expect(queries.getMatchDispatchState('cancelled')).resolves.toBe('cancelled')
    await expect(queries.getMatchDispatchState('deleted')).resolves.toBe('unavailable')
  })
})

const runDispatchLoop = async (states: string[], options: {
  match?: typeof active
  rule?: DueMatchReminderScheduleRule
  existingEventKeys?: Set<string>
} = {}) => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
  let loop: ts.ForOfStatement | undefined
  const visit = (node: ts.Node) => {
    if (ts.isForOfStatement(node) && node.expression.getText(parsed) === 'jobs') loop = node
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  expect(loop).toBeDefined()
  const eventDeclaration = parsed.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name)
      && declaration.name.text === 'createReminderEvent'))
  expect(eventDeclaration).toBeDefined()
  const eventKeys = options.existingEventKeys ?? new Set<string>()
  const eventContext: any = {
    supabase: {
      from: (table: string) => {
        expect(table).toBe('push_dispatch_events')
        return { insert: (payload: { event_key: string }) => ({ select: () => ({ single: async () => {
          if (eventKeys.has(payload.event_key)) return { data: null, error: { code: '23505' } }
          eventKeys.add(payload.event_key)
          return { data: { id: 'event-1' }, error: null }
        } }) }) }
      }
    }
  }
  runInNewContext(ts.transpileModule(`${eventDeclaration!.getText(parsed)}\nglobalThis.eventWriter = createReminderEvent;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText, eventContext)
  const calls: string[] = []
  const createReminderEvent = vi.fn(async (...args: unknown[]) => { calls.push('create'); return eventContext.eventWriter(...args) })
  const sendPushToSubscriptions = vi.fn(async () => {
    calls.push('send')
    return { dispatched_count: 1, expired_count: 0, failed_count: 0, provider_counts: {} }
  })
  const runtime = ts.transpileModule(`(async () => {
    let createdCount = 0, duplicateCount = 0, dispatchedCount = 0, expiredCount = 0, failedCount = 0;
    const providerCounts = {}, matchResults = [];
    ${loop!.getText(parsed)}
    return { createdCount, duplicateCount, dispatchedCount, matchResults };
  })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const result = await runInNewContext(runtime, {
    jobs: [{ match: options.match ?? active, rule: options.rule ?? null }],
    targetMatchId: options.rule ? null : (options.match ?? active).id, dryRun: false,
    buildMatchNotificationTitle: () => 'title', buildMatchReminderBody: () => 'body',
    buildMatchReminderTitleForDaysBefore: () => 'scheduled title',
    buildMatchReminderUrl: () => '/calendar', buildManualMatchReminderEventKey, buildMatchReminderScheduleEventKey,
    getMatchDispatchState: async () => { calls.push('state'); return states.shift() },
    createReminderEvent, sendPushToSubscriptions, supabase: {}, subscriptions: [{}]
  })
  return { result, calls, createReminderEvent, sendPushToSubscriptions }
}

describe('send-match-reminders in-flight cancellation', () => {
  it.each(['cancelled', 'unavailable'])('skips an event if the match becomes %s after initial selection', async state => {
    const { result, calls, createReminderEvent, sendPushToSubscriptions } = await runDispatchLoop([state])
    expect(calls).toEqual(['state'])
    expect(createReminderEvent).not.toHaveBeenCalled()
    expect(sendPushToSubscriptions).not.toHaveBeenCalled()
    expect(result.matchResults[0]).toMatchObject({ skipped: true, created: false, reason: state })
  })

  it.each(['cancelled', 'unavailable'])('skips Web Push if the match becomes %s after recording the event', async state => {
    const { result, calls, sendPushToSubscriptions } = await runDispatchLoop(['active', state])
    expect(calls).toEqual(['state', 'create', 'state'])
    expect(sendPushToSubscriptions).not.toHaveBeenCalled()
    expect(result.matchResults[0]).toMatchObject({ skipped: true, created: true, reason: state })
  })

  it('only dispatches after both current-state checks remain active', async () => {
    const { result, calls } = await runDispatchLoop(['active', 'active'])
    expect(calls).toEqual(['state', 'create', 'state', 'send'])
    expect(result.dispatchedCount).toBe(1)
  })
})

const restoredMatch = { ...cancelled, cancelled_at: null }
const reminderRule: DueMatchReminderScheduleRule = {
  id: 'one-day-before', enabled: true, days_before: 1, time: '20:00', scheduled_date: '2026-10-17', target_date: '2026-10-18'
}

describe('send-match-reminders restored match dedupe', () => {
  it.each([false, true])('keeps an already dispatched key after restoration and sends nothing again (scheduled: %s)', async scheduled => {
    const rule = scheduled ? reminderRule : undefined
    const originalEventKey = rule
      ? buildMatchReminderScheduleEventKey(cancelled, rule) : buildManualMatchReminderEventKey(cancelled)
    const existingEventKeys = new Set([originalEventKey])
    const { result, sendPushToSubscriptions } = await runDispatchLoop(['active', 'active'], {
      match: restoredMatch, rule, existingEventKeys
    })
    expect(result).toMatchObject({ createdCount: 0, dispatchedCount: 0, duplicateCount: 1 })
    expect(result.matchResults[0]).toMatchObject({ event_key: originalEventKey, skipped: true, reason: 'duplicate_event' })
    expect(sendPushToSubscriptions).not.toHaveBeenCalled()
    expect([...existingEventKeys]).toEqual([originalEventKey])
  })

  it('allows the next normal scheduled reminder after restoration, with normal dedupe on its retry', async () => {
    const existingEventKeys = new Set<string>()
    const options = { match: restoredMatch, rule: reminderRule, existingEventKeys }
    const first = await runDispatchLoop(['active', 'active'], options)
    expect(first.result).toMatchObject({ createdCount: 1, dispatchedCount: 1, duplicateCount: 0 })
    expect(first.sendPushToSubscriptions).toHaveBeenCalledOnce()
    expect([...existingEventKeys]).toEqual([buildMatchReminderScheduleEventKey(restoredMatch, reminderRule)])

    const retry = await runDispatchLoop(['active', 'active'], options)
    expect(retry.result).toMatchObject({ createdCount: 0, dispatchedCount: 0, duplicateCount: 1 })
    expect(retry.sendPushToSubscriptions).not.toHaveBeenCalled()
  })
})
