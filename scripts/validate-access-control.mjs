import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const cwd = process.cwd()
const args = new Set(process.argv.slice(2))
const envFileArg = process.argv.slice(2).find((arg) => arg.startsWith('--env='))
const envPath = envFileArg
  ? path.resolve(cwd, envFileArg.slice('--env='.length))
  : path.join(cwd, '.env')

function loadEnv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const pairs = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    })

  return Object.fromEntries(pairs)
}

function assertEnv(value, key) {
  if (!value) {
    throw new Error(`Missing required env var: ${key}`)
  }

  return value
}

function collectKeys(value, prefix = '', acc = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectKeys(entry, prefix, acc)
    }

    return acc
  }

  if (!value || typeof value !== 'object') {
    return acc
  }

  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key
    acc.add(next)
    collectKeys(child, next, acc)
  }

  return acc
}

async function main() {
  const env = loadEnv(envPath)
  const supabaseUrl = assertEnv(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL')
  const supabaseAnonKey = assertEnv(env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY')
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })

  const protectedTables = [
    'profiles',
    'team_members',
    'leave_requests',
    'announcements',
    'attendance_events',
    'attendance_records',
    'matches'
  ]

  const tableChecks = []

  for (const table of protectedTables) {
    const startedAt = Date.now()
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .limit(1)

    tableChecks.push({
      table,
      ok: !error,
      error: error
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          }
        : null,
      rowCount: Array.isArray(data) ? data.length : null,
      count,
      sampleKeys: Array.isArray(data) && data[0] ? Object.keys(data[0]) : [],
      elapsedMs: Date.now() - startedAt
    })
  }

  const helperChecks = {
    currentRole: await supabase.rpc('current_profile_role'),
    usersView: await supabase.rpc('has_app_permission', { p_feature: 'users', p_action: 'VIEW' }),
    playersView: await supabase.rpc('has_app_permission', { p_feature: 'players', p_action: 'VIEW' }),
    attendanceView: await supabase.rpc('has_app_permission', { p_feature: 'attendance', p_action: 'VIEW' }),
    anyCoreView: await supabase.rpc('has_any_app_permission', {
      p_features: ['players', 'users', 'attendance', 'matches'],
      p_action: 'VIEW'
    })
  }

  const publicLanding = await supabase.rpc('get_public_landing_snapshot')
  const publicLandingKeys = Array.from(collectKeys(publicLanding.data)).sort()
  const sensitiveLandingKeys = publicLandingKeys.filter((key) =>
    ['email', 'national_id', 'guardian_phone', 'contact_line_id', 'reason'].some((needle) =>
      key.toLowerCase().includes(needle)
    )
  )

  const magicLinkNonexistent = await supabase.rpc('can_request_magic_link', {
    p_email: 'codex-validation-nonexistent@example.com'
  })

  const firstProfile = await supabase.from('profiles').select('email').limit(1).single()
  let magicLinkExisting = null

  if (!firstProfile.error && firstProfile.data?.email) {
    const response = await supabase.rpc('can_request_magic_link', {
      p_email: firstProfile.data.email
    })

    magicLinkExisting = {
      ok: !response.error,
      error: response.error
        ? {
            code: response.error.code,
            message: response.error.message,
            details: response.error.details,
            hint: response.error.hint
          }
        : null,
      resultType: typeof response.data,
      result: response.data
    }
  }

  let joinInquiryInsert = {
    attempted: false
  }

  if (args.has('--write-join-inquiry')) {
    const token = new Date().toISOString()
    const { data, error } = await supabase
      .from('join_inquiries')
      .insert({
        parent_name: `[Codex validation] ${token}`,
        phone: '0900-000-000',
        child_age_or_grade: 'validation-only',
        message: 'Automated anonymous join inquiry smoke test.'
      })
      .select('id, parent_name')
      .single()

    joinInquiryInsert = {
      attempted: true,
      ok: !error,
      error: error
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          }
        : null,
      insertedId: data?.id ?? null
    }
  }

  const output = {
    envPath,
    anonymousTableChecks: tableChecks,
    helperChecks: Object.fromEntries(
      Object.entries(helperChecks).map(([key, response]) => [
        key,
        {
          ok: !response.error,
          error: response.error
            ? {
                code: response.error.code,
                message: response.error.message,
                details: response.error.details,
                hint: response.error.hint
              }
            : null,
          result: response.data
        }
      ])
    ),
    publicLanding: {
      ok: !publicLanding.error,
      error: publicLanding.error
        ? {
            code: publicLanding.error.code,
            message: publicLanding.error.message,
            details: publicLanding.error.details,
            hint: publicLanding.error.hint
          }
        : null,
      topLevelKeys: publicLanding.data && typeof publicLanding.data === 'object' ? Object.keys(publicLanding.data) : [],
      allKeys: publicLandingKeys,
      sensitiveHits: sensitiveLandingKeys,
      payload: publicLanding.data
    },
    magicLinkChecks: {
      nonexistentEmail: {
        ok: !magicLinkNonexistent.error,
        error: magicLinkNonexistent.error
          ? {
              code: magicLinkNonexistent.error.code,
              message: magicLinkNonexistent.error.message,
              details: magicLinkNonexistent.error.details,
              hint: magicLinkNonexistent.error.hint
            }
          : null,
        resultType: typeof magicLinkNonexistent.data,
        result: magicLinkNonexistent.data
      },
      existingEmailWithoutReveal: magicLinkExisting
    },
    joinInquiryInsert
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      },
      null,
      2
    )
  )
  process.exit(1)
})
