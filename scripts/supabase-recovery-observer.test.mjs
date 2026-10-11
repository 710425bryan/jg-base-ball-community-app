import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PROJECT_REF, SNAPSHOT_SQL, RETENTION_SQL, parseRows, collectSnapshot,
  evaluateSnapshot, validateProject, outputPath, parseSnapshotInput, parseArguments, loadSnapshot
} from './supabase-recovery-observer.mjs'

const sample = (overrides = {}) => ({
  project_ref: PROJECT_REF, recorded_at: '2026-10-09T05:00:00Z',
  stats_reset: '2026-06-08T00:00:00Z', server_started_at: '2026-06-08T00:00:00Z', block_size: 8192,
  cleanup: { entries: 1, calls: 100, total_exec_ms: 10000, read_blocks: 1000, hit_blocks: 2000, deleted_rows: 500 },
  queue_rows_observed: 0, expired_rows_observed: 0, retention_state_exists: true, workers: [],
  maintenance_jobs: [
    { name: 'cron-run-history-retention', active: true, last_run: null },
    { name: 'pg-net-response-maintenance', active: true, last_run: null }
  ], ...overrides
})

const inputSample = () => ({
  ...sample(), http_response: { heap_bytes: 1, total_bytes: 2, estimated_live_rows: 10, estimated_dead_rows: 0,
    last_vacuum: null, last_autovacuum: null, last_analyze: null, last_autoanalyze: null },
  retention: { sweep_started_at: null, last_sweep_completed_at: null, last_batch_at: null,
    total_scanned: 1, total_deleted: 0, last_batch_scanned: 1, last_batch_deleted: 0, sweep_in_progress: true },
  maintenance_jobs: sample().maintenance_jobs.map(job => ({ ...job, schedule: '30 19 * * *', last_run_observation: 'not_probed' }))
})

test('stdin mode accepts only sanitized aggregate fields and never invokes the database collector', async () => {
  const snapshot = await loadSnapshot({ snapshotStdin: true }, async () => JSON.stringify(inputSample()),
    () => { throw new Error('database collector must not run') })
  assert.equal(snapshot.project_ref, PROJECT_REF)
  assert.equal(snapshot.cleanup.calls, 100)
  assert.equal(snapshot.retention.total_scanned, 1)
  assert.equal(Object.hasOwn(snapshot, 'client_elapsed_ms'), false)
  assert.equal(evaluateSnapshot(snapshot).status, 'unknown')
})

test('stdin schema rejects extra fields at every level, foreign projects, and forged timing', () => {
  for (const mutate of [
    value => { value.email = 'private@example.test' },
    value => { value.cleanup.query = 'secret query' },
    value => { value.retention.command = 'secret command' },
    value => { value.http_response.body = 'private body' },
    value => { value.maintenance_jobs[0].last_run = { status: 'failed', start_time: null, end_time: null, return_message: 'private' } },
    value => { value.project_ref = 'different-project' },
    value => { value.client_elapsed_ms = { total: 1 } },
    value => { value.workers = [{ state: 'active', wait_type: 'IO', wait_event: 'private@example.test' }] }
  ]) {
    const snapshot = inputSample()
    mutate(snapshot)
    assert.throws(() => parseSnapshotInput(JSON.stringify(snapshot)), /sanitized schema/)
  }
  assert.throws(() => parseSnapshotInput('x'.repeat(128 * 1024 + 1)), /too large/)
})

test('offline mode can be combined with an output file and invalid arguments are rejected', () => {
  assert.deepEqual(parseArguments(['--snapshot-stdin', '--output', 'mcp.json']), { snapshotStdin: true, output: 'mcp.json' })
  assert.deepEqual(parseArguments(['--output', 'mcp.json', '--snapshot-stdin']), { snapshotStdin: true, output: 'mcp.json' })
  assert.deepEqual(parseArguments([]), { snapshotStdin: false, output: undefined })
  for (const args of [['--output'], ['--snapshot-stdin', '--snapshot-stdin'], ['--retry'], ['--output', '--snapshot-stdin']]) {
    assert.throws(() => parseArguments(args), /Usage:/)
  }
})

test('parses CLI rows and warning envelopes without using envelope content', () => {
  assert.deepEqual(parseRows('[{"snapshot":{"calls":1}}]'), [{ snapshot: { calls: 1 } }])
  assert.deepEqual(parseRows(JSON.stringify({ boundary: 'ignored', warning: 'untrusted text', rows: [{ a: 1 }] })), [{ a: 1 }])
  assert.throws(() => parseRows('{"data":"not rows"}'))
})

test('collects only snapshot and retention objects, skipping absent retention state', () => {
  const calls = []
  const snapshot = collectSnapshot(sql => {
    calls.push(sql)
    return JSON.stringify({ rows: sql === SNAPSHOT_SQL ? [{ snapshot: sample() }] : [{ retention: { total_deleted: 5 } }] })
  })
  assert.deepEqual(calls, [SNAPSHOT_SQL, RETENTION_SQL])
  assert.equal(snapshot.project_ref, PROJECT_REF)
  assert.equal(snapshot.retention.total_deleted, 5)
  assert.ok(snapshot.client_elapsed_ms.core >= 0)
  assert.ok(snapshot.client_elapsed_ms.retention >= 0)
  assert.ok(snapshot.client_elapsed_ms.total >= snapshot.client_elapsed_ms.core)
  let count = 0
  collectSnapshot(() => { count++; return JSON.stringify([{ snapshot: sample({ retention_state_exists: false }) }]) })
  assert.equal(count, 1)
})

test('retains core counters when the separate retention probe times out', () => {
  const result = collectSnapshot(sql => {
    if (sql === RETENTION_SQL) throw Object.assign(new Error('sensitive stderr must not persist'), { code: 'ETIMEDOUT' })
    return JSON.stringify({ rows: [{ snapshot: sample() }] })
  })
  assert.equal(result.cleanup.calls, 100)
  assert.equal(result.retention_probe_error, 'cli_timeout')
  assert.ok(evaluateSnapshot(result).unknown_checks.includes('retention_progress'))
  assert.doesNotMatch(JSON.stringify(result), /sensitive stderr/)
})

test('calculates interval deltas rather than reporting cumulative incident totals', () => {
  const old = sample()
  const current = sample({ recorded_at: '2026-10-09T05:05:00Z', cleanup: {
    ...old.cleanup, calls: 110, total_exec_ms: 11000, read_blocks: 1010, hit_blocks: 2100, deleted_rows: 520
  } })
  const result = evaluateSnapshot(current, old)
  assert.equal(result.core_status, 'ok')
  assert.equal(result.status, 'unknown')
  assert.equal(result.delta.calls, 10)
  assert.equal(result.delta.mean_cleanup_ms, 100)
  assert.equal(result.delta.read_mib, 10 * 8192 / 1024 ** 2)
  assert.equal(result.delta.interval_seconds, 300)
  assert.equal(evaluateSnapshot(current).status, 'unknown')
})

test('resets the comparison after stats reset, server restart, counter regression, or clock regression', () => {
  const previous = sample()
  for (const patch of [
    { stats_reset: '2026-10-09T05:01:00Z' },
    { server_started_at: '2026-10-09T05:01:00Z' },
    { cleanup: { ...previous.cleanup, calls: 1 } }
  ]) {
    const result = evaluateSnapshot(sample({ recorded_at: '2026-10-09T05:05:00Z', ...patch }), previous)
    assert.equal(result.comparison, 'counter_reset')
    assert.equal(result.delta, null)
  }
  assert.equal(evaluateSnapshot(previous, previous).comparison, 'non_increasing_timestamp')
  assert.equal(evaluateSnapshot(sample({ observation_error: 'cli_timeout' }), previous).comparison, 'gap')
})

test('flags slow cleanup, excessive reads, queue buildup, and failed maintenance', () => {
  const previous = sample()
  const current = sample({ recorded_at: '2026-10-09T05:05:00Z', queue_rows_observed: 1001, expired_rows_observed: 201,
    cleanup: { ...previous.cleanup, calls: 101, total_exec_ms: 22000, read_blocks: 5000 },
    maintenance_jobs: [{ name: 'cron-run-history-retention', active: true, last_run: { status: 'failed' } }]
  })
  const result = evaluateSnapshot(current, previous)
  assert.equal(result.status, 'attention')
  for (const alert of ['cleanup_mean_over_1s', 'cleanup_reads_over_16mib_per_call', 'http_queue_backlog',
    'expired_response_backlog', 'cron-run-history-retention:latest_observed_run_failed', 'pg-net-response-maintenance:inactive_or_missing']) {
    assert.ok(result.alerts.includes(alert), alert)
  }
})

test('does not interpret no completed cleanup as zero-cost recovery while worker waits on I/O', () => {
  const previous = sample()
  const current = sample({ recorded_at: '2026-10-09T05:05:00Z', workers: [{ wait_type: 'IO', wait_event: 'DataFileRead' }] })
  assert.ok(evaluateSnapshot(current, previous).alerts.includes('cleanup_not_completing_while_io_waiting'))
  assert.equal(evaluateSnapshot(current, previous).delta.mean_cleanup_ms, null)
  assert.equal(evaluateSnapshot(current).delta, null)
})

test('core reads text-free statement statistics without scanning HTTP or cron history tables', () => {
  assert.match(SNAPSHOT_SQL, /^begin read only;/)
  assert.match(SNAPSHOT_SQL, /set local jit = off/)
  assert.match(SNAPSHOT_SQL, /from pg_stat_statements\(false\)/)
  assert.doesNotMatch(SNAPSHOT_SQL, /enable_seqscan|cron\.job_run_details|from net\./i)
  assert.doesNotMatch(SNAPSHOT_SQL, /\b(command|return_message|headers|content|body)\b/i)
  assert.doesNotMatch(SNAPSHOT_SQL, /\b(update|delete|insert|truncate|vacuum|analyze)\s/i)
})

test('unmeasured queue counts and last runs remain unknown rather than reporting zero', () => {
  const current = sample({ recorded_at: '2026-10-09T05:05:00Z', queue_rows_observed: null, expired_rows_observed: null })
  const result = evaluateSnapshot(current, sample())
  assert.equal(result.core_status, 'ok')
  assert.equal(result.status, 'unknown')
  for (const name of ['http_queue_actual_rows', 'expired_response_actual_rows',
    'cron-run-history-retention:last_run', 'pg-net-response-maintenance:last_run']) {
    assert.ok(result.unknown_checks.includes(name))
  }
  assert.ok(!result.alerts.includes('http_queue_backlog'))
})

test('rejects another linked project and output paths outside ignored runtime storage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recovery-observer-'))
  try {
    await mkdir(join(root, 'supabase/.temp'), { recursive: true })
    const reference = join(root, 'supabase/.temp/project-ref')
    await writeFile(reference, 'wrong-project')
    await assert.rejects(validateProject(root), /does not match/)
    await writeFile(reference, PROJECT_REF)
    await validateProject(root)
    assert.equal(outputPath('sample.json', 'now', root), join(root, 'sample.json'))
    for (const value of ['../escape.json', '/tmp/escape.json', 'latest.json', 'sample.txt']) {
      assert.throws(() => outputPath(value, 'now', root))
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
