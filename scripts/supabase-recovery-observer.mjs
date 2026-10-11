#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PROJECT_REF = 'qwxzwomzoyfkorbwsscv'
export const CLEANUP_QUERY_ID = '-4010647274366224293'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUNTIME = resolve(ROOT, '.codex/runtime/supabase-recovery')
const JOB_NAMES = ['cron-run-history-retention', 'pg-net-response-maintenance']
// READ ONLY prevents accidental writes. Core reads catalogs/shared statistics;
// the CLI timeout bounds the client, not server work after a disconnected client.
const readonly = sql => `begin read only; set local lock_timeout = '500ms'; set local jit = off; ${sql}; commit;`

export const SNAPSHOT_SQL = readonly(`
select jsonb_build_object(
  'recorded_at', clock_timestamp(),
  'observation_scope', 'catalogs_and_statistics',
  'stats_reset', (select stats_reset from pg_stat_statements_info),
  'server_started_at', pg_postmaster_start_time(),
  'block_size', current_setting('block_size')::integer,
  'cleanup', (select jsonb_build_object('entries', count(*), 'calls', coalesce(sum(calls), 0),
    'total_exec_ms', coalesce(sum(total_exec_time), 0), 'read_blocks', coalesce(sum(shared_blks_read), 0),
    'hit_blocks', coalesce(sum(shared_blks_hit), 0), 'deleted_rows', coalesce(sum(rows), 0))
    from pg_stat_statements(false) where userid = 'postgres'::regrole
      and dbid = (select oid from pg_database where datname = current_database())
      and queryid = ${CLEANUP_QUERY_ID}),
  'http_response', (select jsonb_build_object('heap_bytes', pg_relation_size(relid),
    'total_bytes', pg_total_relation_size(relid), 'estimated_live_rows', n_live_tup,
    'estimated_dead_rows', n_dead_tup, 'last_vacuum', last_vacuum, 'last_autovacuum', last_autovacuum,
    'last_analyze', last_analyze, 'last_autoanalyze', last_autoanalyze)
    from pg_stat_all_tables where relid = 'net._http_response'::regclass),
  'workers', coalesce((select jsonb_agg(jsonb_build_object('state', state,
    'wait_type', wait_event_type, 'wait_event', wait_event)) from pg_stat_activity
    where backend_type like 'pg_net%' or application_name like 'pg_net%'), '[]'::jsonb),
  'queue_rows_observed', null,
  'expired_rows_observed', null,
  'retention_state_exists', to_regclass('private.cron_history_retention_state') is not null,
  'maintenance_jobs', coalesce((select jsonb_agg(jsonb_build_object('name', j.jobname,
    'active', j.active, 'schedule', j.schedule, 'last_run', null, 'last_run_observation', 'not_probed'))
    from cron.job j where j.jobname in ('cron-run-history-retention', 'pg-net-response-maintenance')), '[]'::jsonb)
) as snapshot`)

export const RETENTION_SQL = readonly(`select jsonb_build_object(
  'sweep_started_at', sweep_started_at, 'last_sweep_completed_at', last_sweep_completed_at,
  'last_batch_at', last_batch_at, 'total_scanned', total_scanned, 'total_deleted', total_deleted,
  'last_batch_scanned', last_batch_scanned, 'last_batch_deleted', last_batch_deleted,
  'sweep_in_progress', sweep_ceiling_runid is not null
) as retention from private.cron_history_retention_state where singleton limit 1`)

export function parseRows(output) {
  const parsed = JSON.parse(output)
  const rows = Array.isArray(parsed) ? parsed : parsed.rows
  if (!Array.isArray(rows)) throw new Error('Unexpected CLI JSON shape')
  return rows
}

const nullable = validator => value => value === null || validator(value)
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const object = (schema, required = Object.keys(schema)) => value => Boolean(value && !Array.isArray(value)
  && typeof value === 'object' && required.every(key => Object.hasOwn(value, key))
  && Object.entries(value).every(([key, field]) => Object.hasOwn(schema, key) && schema[key](field)))
const array = (validator, max) => value => Array.isArray(value) && value.length <= max && value.every(validator)
const oneOf = values => value => values.includes(value)
const counterSchema = Object.fromEntries(['entries', 'calls', 'total_exec_ms', 'read_blocks', 'hit_blocks', 'deleted_rows'].map(key => [key, number]))
const dateFields = keys => Object.fromEntries(keys.map(key => [key, nullable(timestamp)]))
const retentionSchema = object({
  ...dateFields(['sweep_started_at', 'last_sweep_completed_at', 'last_batch_at']),
  ...Object.fromEntries(['total_scanned', 'total_deleted', 'last_batch_scanned', 'last_batch_deleted'].map(key => [key, number])),
  sweep_in_progress: value => typeof value === 'boolean'
})
const snapshotSchema = {
  project_ref: value => value === PROJECT_REF, query_id: value => value === CLEANUP_QUERY_ID,
  recorded_at: timestamp, ...dateFields(['stats_reset', 'server_started_at']),
  observation_scope: value => value === 'catalogs_and_statistics',
  block_size: value => Number.isInteger(value) && value > 0 && value <= 65536,
  cleanup: object(counterSchema),
  http_response: nullable(object({
    ...Object.fromEntries(['heap_bytes', 'total_bytes', 'estimated_live_rows', 'estimated_dead_rows'].map(key => [key, number])),
    ...dateFields(['last_vacuum', 'last_autovacuum', 'last_analyze', 'last_autoanalyze'])
  })),
  workers: array(object({
    state: nullable(oneOf(['active', 'idle', 'idle in transaction', 'idle in transaction (aborted)', 'fastpath function call', 'disabled'])),
    wait_type: nullable(oneOf(['Activity', 'BufferPin', 'Client', 'Extension', 'IO', 'IPC', 'LWLock', 'Lock', 'Timeout', 'InjectionPoint'])),
    wait_event: nullable(value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_ ]{0,63}$/.test(value))
  }), 32),
  queue_rows_observed: nullable(number), expired_rows_observed: nullable(number),
  retention_state_exists: value => typeof value === 'boolean', retention: nullable(retentionSchema),
  retention_probe_error: oneOf(['cli_timeout', 'query_or_parse_failed']),
  maintenance_jobs: array(object({
    name: oneOf(JOB_NAMES), active: value => typeof value === 'boolean',
    schedule: value => typeof value === 'string' && /^[\d*/ ,\-]{1,64}$/.test(value),
    last_run: nullable(object({ status: oneOf(['succeeded', 'failed', 'running', 'starting', 'connecting', 'sending']),
      ...dateFields(['start_time', 'end_time']) })),
    last_run_observation: value => value === 'not_probed'
  }, ['name', 'active', 'schedule', 'last_run']), 2)
}

export function parseSnapshotInput(text) {
  if (Buffer.byteLength(text) > 128 * 1024) throw new Error('Snapshot input too large')
  const snapshot = JSON.parse(text)
  const required = ['recorded_at', 'stats_reset', 'server_started_at', 'block_size', 'cleanup', 'http_response',
    'workers', 'queue_rows_observed', 'expired_rows_observed', 'retention_state_exists', 'maintenance_jobs']
  if (!object(snapshotSchema, required)(snapshot)) throw new Error('Snapshot does not match the sanitized schema')
  return { ...snapshot, project_ref: PROJECT_REF, query_id: CLEANUP_QUERY_ID }
}

export function parseArguments(args) {
  const options = { snapshotStdin: false, output: undefined }
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--snapshot-stdin' && !options.snapshotStdin) options.snapshotStdin = true
    else if (args[index] === '--output' && options.output === undefined && args[index + 1] && !args[index + 1].startsWith('--')) options.output = args[++index]
    else throw new Error('Usage: node scripts/supabase-recovery-observer.mjs [--snapshot-stdin] [--output filename.json]')
  }
  return options
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk.toString()
    if (Buffer.byteLength(text) > 128 * 1024) throw new Error('Snapshot input too large')
  }
  return text
}

export async function loadSnapshot(options, input = readStdin, collect = collectSnapshot) {
  return options.snapshotStdin ? parseSnapshotInput(await input()) : collect()
}

export function collectSnapshot(run = sql => execFileSync('supabase',
  ['db', 'query', '--linked', '--workdir', ROOT, '--agent=yes', '--output', 'json', sql],
  { cwd: ROOT, encoding: 'utf8', timeout: 15_000, maxBuffer: 512 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })) {
  const started = performance.now()
  const snapshot = parseRows(run(SNAPSHOT_SQL))[0]?.snapshot
  if (!snapshot || !Number.isFinite(Date.parse(snapshot.recorded_at))) throw new Error('Invalid snapshot')
  const coreMs = performance.now() - started
  let retentionMs = null
  if (snapshot.retention_state_exists) {
    const retentionStarted = performance.now()
    try { snapshot.retention = parseRows(run(RETENTION_SQL))[0]?.retention ?? null } catch (error) {
      snapshot.retention_probe_error = error.code === 'ETIMEDOUT' ? 'cli_timeout' : 'query_or_parse_failed'
    }
    retentionMs = performance.now() - retentionStarted
  }
  return { ...snapshot, project_ref: PROJECT_REF, query_id: CLEANUP_QUERY_ID,
    client_elapsed_ms: { core: coreMs, retention: retentionMs, total: performance.now() - started } }
}

export function evaluateSnapshot(current, previous = null) {
  const alerts = []
  let delta = null
  let comparison = 'baseline'
  const unknownChecks = []
  if (current.observation_error) return { status: 'unknown', core_status: 'unknown', comparison: 'gap', alerts: [], unknown_checks: ['core_snapshot'], delta }
  if (!Number.isFinite(current.queue_rows_observed)) unknownChecks.push('http_queue_actual_rows')
  if (!Number.isFinite(current.expired_rows_observed)) unknownChecks.push('expired_response_actual_rows')
  if (current.retention_probe_error || (current.retention_state_exists && !current.retention)) unknownChecks.push('retention_progress')
  if (!current.cleanup?.entries) alerts.push('cleanup_statistics_unavailable')
  if (current.queue_rows_observed >= 100) alerts.push('http_queue_backlog')
  if (current.expired_rows_observed >= 200) alerts.push('expired_response_backlog')
  if (!current.retention_state_exists) alerts.push('retention_state_missing')
  for (const name of JOB_NAMES) {
    const job = current.maintenance_jobs?.find(item => item.name === name)
    if (!job?.active) alerts.push(`${name}:inactive_or_missing`)
    if (!job?.last_run) unknownChecks.push(`${name}:last_run`)
    if (job?.last_run?.status === 'failed') alerts.push(`${name}:latest_observed_run_failed`)
  }
  const elapsedMs = Date.parse(current.recorded_at) - Date.parse(previous?.recorded_at)
  if (previous?.project_ref === PROJECT_REF && !previous.observation_error && previous.cleanup?.entries && current.cleanup?.entries) {
    const keys = ['calls', 'total_exec_ms', 'read_blocks', 'hit_blocks', 'deleted_rows']
    const reset = current.stats_reset !== previous.stats_reset || current.server_started_at !== previous.server_started_at
      || keys.some(key => current.cleanup[key] < previous.cleanup[key])
    comparison = reset ? 'counter_reset' : elapsedMs > 0 ? 'comparable' : 'non_increasing_timestamp'
    if (comparison === 'comparable') {
      delta = Object.fromEntries(keys.map(key => [key, current.cleanup[key] - previous.cleanup[key]]))
      delta.interval_seconds = elapsedMs / 1000
      delta.mean_cleanup_ms = delta.calls ? delta.total_exec_ms / delta.calls : null
      delta.read_mib = delta.read_blocks * current.block_size / 1024 ** 2
      if (delta.mean_cleanup_ms > 1000) alerts.push('cleanup_mean_over_1s')
      if (delta.calls && delta.read_mib / delta.calls > 16) alerts.push('cleanup_reads_over_16mib_per_call')
      if (!delta.calls && elapsedMs >= 60_000 && current.workers?.some(worker => worker.wait_type === 'IO')) {
        alerts.push('cleanup_not_completing_while_io_waiting')
      }
    }
  }
  const coreStatus = alerts.length ? 'attention' : comparison === 'comparable' ? 'ok' : 'unknown'
  return { status: alerts.length ? 'attention' : unknownChecks.length ? 'unknown' : coreStatus,
    core_status: coreStatus, comparison, alerts, unknown_checks: unknownChecks, delta }
}

export async function validateProject(root = ROOT) {
  if ((await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== PROJECT_REF) {
    throw new Error('Linked project does not match the approved recovery project')
  }
}

export function outputPath(arg, timestamp, runtime = RUNTIME) {
  const target = arg ? resolve(runtime, arg) : resolve(runtime, `${timestamp.replaceAll(':', '-')}.json`)
  const rel = relative(runtime, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !target.endsWith('.json') || rel === 'latest.json') {
    throw new Error('--output must be a new JSON file under the recovery runtime directory')
  }
  return target
}

async function main(args) {
  const options = parseArguments(args)
  await validateProject()
  const timestamp = new Date().toISOString()
  const target = outputPath(options.output, timestamp)
  await mkdir(RUNTIME, { recursive: true })
  await mkdir(dirname(target), { recursive: true })
  if (!relative(await realpath(RUNTIME), await realpath(dirname(target))).startsWith('..')) {
    let previous = null
    try { previous = JSON.parse(await readFile(resolve(RUNTIME, 'latest.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    let snapshot
    const collectionStarted = performance.now()
    try { snapshot = await loadSnapshot(options) } catch (error) {
      if (options.snapshotStdin) throw error
      // Never persist CLI stderr, SQL, HTTP payloads, cron commands, or credentials.
      snapshot = { project_ref: PROJECT_REF, recorded_at: timestamp,
        observation_error: error.code === 'ETIMEDOUT' ? 'cli_timeout' : 'query_or_parse_failed',
        client_elapsed_ms: { total: performance.now() - collectionStarted } }
    }
    snapshot.evaluation = evaluateSnapshot(snapshot, previous)
    const json = `${JSON.stringify(snapshot, null, 2)}\n`
    await writeFile(target, json, { flag: 'wx', mode: 0o600 })
    const temporary = resolve(RUNTIME, `latest-${process.pid}.tmp`)
    await writeFile(temporary, json, { mode: 0o600 })
    await rename(temporary, resolve(RUNTIME, 'latest.json'))
    console.log(JSON.stringify({ path: target, ...snapshot.evaluation }))
    if (snapshot.observation_error) process.exitCode = 1
  } else throw new Error('Output directory resolves outside the recovery runtime directory')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(() => { console.error('Recovery observer failed; check linked project, CLI access, and local output path.'); process.exitCode = 1 })
}
