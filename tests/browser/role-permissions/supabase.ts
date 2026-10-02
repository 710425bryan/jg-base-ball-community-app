type FixtureRole = { role_key: string; role_name: string; is_system: boolean; weight: number }
type FixturePermission = { role_key: string; feature: string; action: string }
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const defaultRoles: FixtureRole[] = [
  { role_key: 'ADMIN', role_name: '系統管理員', is_system: true, weight: 1 },
  { role_key: 'MANAGER', role_name: '管理員', is_system: true, weight: 9 },
  { role_key: 'HEAD_COACH', role_name: '總教練', is_system: true, weight: 10 },
  { role_key: 'SCHEDULINGCOACH', role_name: '排班教練', is_system: false, weight: 15 },
  { role_key: 'COACH', role_name: '教練', is_system: true, weight: 16 },
  { role_key: 'FINANCE', role_name: '財務', is_system: true, weight: 20 },
  { role_key: 'COMMITTEE', role_name: '委員', is_system: true, weight: 21 },
  { role_key: 'MEMBER', role_name: '一般成員', is_system: true, weight: 99 },
  { role_key: 'CUSTOM_LONG', role_name: '協助週末訓練行政聯絡與場地維護的客製化角色', is_system: false, weight: 100 }
]
const usersMode = new URLSearchParams(location.search).get('view') === 'users'

export const fixture = {
  roles: (usersMode ? defaultRoles : [
    { role_key: 'ADMIN', role_name: '系統管理員', is_system: true, weight: 1 },
    { role_key: 'COACH', role_name: '教練', is_system: true, weight: 2 },
    { role_key: 'PARENT', role_name: '家長', is_system: true, weight: 3 },
    { role_key: 'CUSTOM_LONG', role_name: '協助週末訓練行政聯絡與場地維護的客製化角色', is_system: false, weight: 4 }
  ]) as FixtureRole[],
  users: defaultRoles.map((role) => ({
    id: `fixture-${role.role_key}`, name: `${role.role_name}測試帳號`,
    email: `${role.role_key.toLowerCase()}@example.test`, role: role.role_key,
    nickname: null, avatar_url: null, is_active: true,
    access_start: null, access_end: null, linked_team_member_ids: [],
    created_at: '2026-10-02T02:00:00Z', last_seen_at: null
  })),
  permissions: [
    { role_key: 'COACH', feature: 'players', action: 'VIEW' },
    { role_key: 'COACH', feature: 'players', action: 'EDIT' },
    { role_key: 'COACH', feature: 'matches', action: 'VIEW' },
    { role_key: 'CUSTOM_LONG', feature: 'training_locations', action: 'VIEW' }
  ] as FixturePermission[],
  calls: [] as Array<{ action: string; data: unknown }>,
  holdNext: false,
  failNext: false,
  releasePending: (() => {}) as () => void
}

export const supabase = {
  from(table: string) {
    if (!['app_roles', 'app_role_permissions', 'profiles', 'team_members'].includes(table)) {
      throw new Error(`Unexpected API table in isolated fixture: ${table}`)
    }
    const filters: Record<string, unknown> = {}
    const orders: Array<{ key: string; ascending: boolean }> = []
    const query = {
      select() { return query },
      order(key: string, options: { ascending?: boolean } = {}) { orders.push({ key, ascending: options.ascending !== false }); return query },
      eq(key: string, value: unknown) { filters[key] = value; return query },
      in(key: string, values: unknown[]) { filters[key] = values; return query },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        fixture.calls.push({ action: `read:${table}`, data: copy(filters) })
        const rows = table === 'app_roles' ? fixture.roles
          : table === 'app_role_permissions' ? fixture.permissions
            : table === 'profiles' ? fixture.users : []
        const data = rows.filter((row) => Object.entries(filters).every(([key, value]) => {
          const field = (row as unknown as Record<string, unknown>)[key]
          return Array.isArray(value) ? value.includes(field) : field === value
        })).sort((a, b) => {
          for (const order of orders) {
            const left = (a as unknown as Record<string, unknown>)[order.key] as string | number
            const right = (b as unknown as Record<string, unknown>)[order.key] as string | number
            if (left === right) continue
            return (left < right ? -1 : 1) * (order.ascending ? 1 : -1)
          }
          return 0
        })
        return Promise.resolve({ data: copy(data), error: null }).then(resolve, reject)
      }
    }
    return query
  },
  rpc(name: string, params: { p_role_key: string; p_role_name?: string; p_copy_from_role_key?: string | null; p_weight?: number }) {
    if (!['create_app_role', 'update_app_role_weight'].includes(name)) throw new Error(`Unexpected RPC in isolated fixture: ${name}`)
    fixture.calls.push({ action: name, data: copy(params) })
    return {
      async single() {
        if (fixture.holdNext) {
          fixture.holdNext = false
          await new Promise<void>((resolve) => { fixture.releasePending = resolve })
        }
        if (fixture.failNext) {
          fixture.failNext = false
          return { data: null, error: { message: name === 'update_app_role_weight' ? '測試排序儲存失敗，請稍後再試' : '測試建立失敗，請稍後再試', code: 'TEST_FAILURE' } }
        }
        if (name === 'update_app_role_weight') {
          const role = fixture.roles.find((row) => row.role_key === params.p_role_key)
          if (!role) return { data: null, error: { message: '角色不存在', code: 'TEST_FAILURE' } }
          role.weight = params.p_weight!
          return { data: copy(role), error: null }
        }
        if (params.p_copy_from_role_key === 'ADMIN') {
          return { data: null, error: { message: '最高權限無法複製', code: '42501' } }
        }
        const role = { role_key: params.p_role_key, role_name: params.p_role_name!, is_system: false, weight: 100 }
        fixture.roles.push(role)
        fixture.permissions.push(...fixture.permissions.filter((row) => row.role_key === params.p_copy_from_role_key)
          .map((row) => ({ ...row, role_key: role.role_key })))
        return { data: copy(role), error: null }
      }
    }
  }
}
