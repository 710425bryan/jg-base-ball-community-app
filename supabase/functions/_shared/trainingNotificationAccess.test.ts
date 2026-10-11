import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { canReceiveTrainingNotification, isActiveTrainingProfile } from './trainingNotificationAccess'

const now = new Date('2026-10-11T10:00:00Z')
const profile = (id: string, role: string, extra = {}) => ({
  id, role, is_active: true, linked_team_member_ids: ['member-1'], ...extra
})
const viewRoles = new Set(['MEMBER'])

describe('training notification access', () => {
  it('requires VIEW even for a linked profile and preserves the ADMIN bypass', () => {
    expect(canReceiveTrainingNotification(profile('linked', 'COMMITTEE'), viewRoles, now)).toBe(false)
    expect(canReceiveTrainingNotification(profile('member', 'MEMBER'), viewRoles, now)).toBe(true)
    expect(canReceiveTrainingNotification(profile('admin', 'ADMIN'), new Set(), now)).toBe(true)
    expect(canReceiveTrainingNotification(profile('missing-role', ''), viewRoles, now)).toBe(false)
  })

  it.each([
    { is_active: false },
    { is_active: null },
    { is_active: undefined },
    { access_start: '2026-10-12T00:00:00Z' },
    { access_end: '2026-10-10T00:00:00Z' },
    { access_start: 'invalid' },
    { access_end: 'invalid' },
  ])('rejects invalid profile access including ADMIN: %j', extra => {
    expect(canReceiveTrainingNotification(profile('member', 'MEMBER', extra), viewRoles, now)).toBe(false)
    expect(canReceiveTrainingNotification(profile('admin', 'ADMIN', extra), viewRoles, now)).toBe(false)
  })

  it('keeps inclusive access boundaries and rejects a missing profile or invalid clock', () => {
    expect(isActiveTrainingProfile(profile('member', 'MEMBER', {
      access_start: now.toISOString(), access_end: now.toISOString()
    }), now)).toBe(true)
    expect(isActiveTrainingProfile(null, now)).toBe(false)
    expect(isActiveTrainingProfile(profile('member', 'MEMBER'), new Date('invalid'))).toBe(false)
  })
})

// Execute the actual recipient/caller functions from all three entry points.
// Selecting only these declarations avoids loading remote imports, credentials,
// a server listener, or any Web Push provider in unit tests.
const createEdgeHarness = (folder: string, names: string[], tables: Record<string, any[]>, userId = 'caller') => {
  const file = readFileSync(new URL(`../${folder}/index.ts`, import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('index.ts', file, ts.ScriptTarget.Latest, true)
  const declarations = parsed.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name)
      && names.includes(declaration.name.text)))
  expect(declarations).toHaveLength(names.length)
  const script = declarations.map(statement => statement.getText(parsed)).join('\n')
  const runtime = ts.transpileModule(`${script}\nglobalThis.access = { ${names.join(', ')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText
  const reads: string[] = []
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    from: (table: string) => {
      reads.push(table)
      let rows = [...(tables[table] || [])]
      const result = () => ({ data: rows, error: null })
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query },
        in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query },
        contains: (key: string, values: unknown[]) => { rows = rows.filter(row => values.every(value => row[key]?.includes(value))); return query },
        single: async () => ({ data: rows[0] || null, error: null }),
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve: (value: any) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      }
      return query
    }
  }
  const context: any = {
    supabase, canReceiveTrainingNotification, isActiveTrainingProfile,
    Date: class extends Date { constructor(value?: any) { super(value === undefined ? now : value) } },
    jsonResponse: (value: unknown, status: number) => new Response(JSON.stringify(value), { status }),
    console: { warn: vi.fn() },
  }
  runInNewContext(runtime, context)
  return { access: context.access, reads }
}

const permission = (role_key: string, action: string) => ({ role_key, feature: 'training', action })
const recipients = [
  profile('linked-only', 'COMMITTEE'),
  profile('editor-only', 'EDITOR'),
  profile('viewer', 'MEMBER'),
  profile('unlinked-viewer', 'MEMBER', { linked_team_member_ids: [] }),
  profile('admin', 'ADMIN'),
  profile('suspended', 'ADMIN', { is_active: false }),
  profile('expired', 'MEMBER', { access_end: '2026-10-10' }),
  profile('future', 'MEMBER', { access_start: '2026-10-12' }),
]

describe.each(['send-training-registration-notifications', 'send-training-selection-notifications'])('%s recipients', folder => {
  it('only targets active VIEW profiles and ADMIN, never linked-only or EDIT-only profiles', async () => {
    const { access, reads } = createEdgeHarness(folder, ['fetchTrainingPermissionRoles', 'fetchTrainingTargetUserIds'], {
      profiles: recipients,
      app_role_permissions: [permission('MEMBER', 'VIEW'), permission('EDITOR', 'EDIT')],
    })
    expect(await access.fetchTrainingTargetUserIds(now)).toEqual(['viewer', 'unlinked-viewer', 'admin'])
    expect(reads).not.toContain('team_members_safe')
  })
})

describe('training selection caller', () => {
  it.each([
    ['MEMBER', ['VIEW'], {}, false],
    ['EDITOR', ['EDIT'], {}, false],
    ['COACH', ['VIEW', 'EDIT'], {}, true],
    ['ADMIN', [], {}, true],
    ['ADMIN', [], { is_active: false }, false],
    ['ADMIN', [], { access_end: '2026-10-10' }, false],
  ])('requires active VIEW plus EDIT for role %s with %j', async (role, actions, extra, expected) => {
    const { access } = createEdgeHarness('send-training-selection-notifications', ['canCallerManageTraining'], {
      profiles: [profile('caller', role, extra)],
      app_role_permissions: actions.map(action => permission(role, action)),
    })
    const request = new Request('https://test.invalid', { headers: { Authorization: 'Bearer test-only' } })
    expect(await access.canCallerManageTraining(request)).toBe(expected)
  })
})

const statusNames = ['fetchCaller', 'callerOwnsRegistration', 'assertAuthorized', 'fetchTrainingViewRoles',
  'fetchTrainingEditTargetUserIds', 'fetchProfileById', 'fetchLinkedTargetUserIds', 'fetchTargetUserIds']
const statusHarness = (profiles = recipients) => createEdgeHarness('send-training-registration-status-notifications', statusNames, {
  profiles,
  app_role_permissions: [permission('MEMBER', 'VIEW'), permission('EDITOR', 'EDIT'),
    permission('COACH', 'VIEW'), permission('COACH', 'EDIT')],
})

describe('training registration status notifications', () => {
  it('requires VIEW plus EDIT for submitted recipients', async () => {
    const { access } = statusHarness([...recipients, profile('coach', 'COACH')])
    expect(await access.fetchTargetUserIds({ member_id: 'member-1' }, 'submitted', now)).toEqual(['admin', 'coach'])
  })

  it('keeps selected notifications targeted to the authorized original applicant', async () => {
    const { access } = statusHarness()
    expect(await access.fetchTargetUserIds({ applied_by: 'viewer', member_id: 'member-1' }, 'selected', now)).toEqual(['viewer'])
  })

  it('only falls back to linked users that still have VIEW', async () => {
    const { access } = statusHarness()
    expect(await access.fetchTargetUserIds({ applied_by: 'linked-only', member_id: 'member-1' }, 'selected', now)).toEqual(['viewer', 'admin'])
    expect(await access.fetchTargetUserIds({ member_id: 'other-member' }, 'selected', now)).toEqual([])
  })

  it.each(['COMMITTEE', 'EDITOR'])('rejects a linked caller without VIEW (%s)', async role => {
    const { access } = statusHarness([profile('caller', role)])
    const request = new Request('https://test.invalid', { headers: { Authorization: 'Bearer test-only' } })
    const caller = await access.fetchCaller(request)
    expect(caller.canViewTraining).toBe(false)
    expect(() => access.assertAuthorized(caller, { applied_by: 'caller', member_id: 'member-1' })).toThrow()
  })

  it('allows authorized owners but refuses unrelated registrations and expired admins', async () => {
    const { access } = statusHarness([profile('caller', 'MEMBER')])
    const request = new Request('https://test.invalid', { headers: { Authorization: 'Bearer test-only' } })
    const caller = await access.fetchCaller(request)
    expect(() => access.assertAuthorized(caller, { member_id: 'member-1' })).not.toThrow()
    expect(() => access.assertAuthorized(caller, { member_id: 'other-member' })).toThrow()
    const expired = statusHarness([profile('caller', 'ADMIN', { access_end: '2026-10-10' })])
    expect(await expired.access.fetchCaller(request)).toBeNull()
  })
})
