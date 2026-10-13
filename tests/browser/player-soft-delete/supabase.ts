const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const member = {
  id: 'fixture-member', name: '軟刪除驗證球員', role: '球員', status: '在隊',
  member_identity_label: null, team_group: 'U10', training_program: null,
  is_inactive_or_graduated: false, birth_date: '2016-06-01', grade: '國小四年級',
  joined_date: '2026-02-01', school_name: '測試國小', jersey_number: '10',
  fee_billing_mode: 'monthly_fixed', match_fee_enabled: true, match_fee_start_date: '2026-09-27',
  is_primary_payer: false, is_half_price: true, sibling_ids: ['fixture-deleted-sibling'], avatar_url: null,
  notes: '已保存的備註', portrait_auth: false, deleted_at: null, deleted_by: null
}
const deletedSibling = {
  ...copy(member), id: 'fixture-deleted-sibling', name: '已刪除手足驗證姓名', status: '退隊',
  is_primary_payer: true, is_half_price: false, sibling_ids: ['fixture-member'],
  deleted_at: '2026-10-12T01:00:00Z', deleted_by: 'fixture-editor'
}
export const state = {
  members: [copy(member), copy(deletedSibling)], revision: 1, failNextUpdate: false, holdUpdate: false,
  // Related records intentionally stay unchanged; no query may mutate these tables.
  history: { equipmentPayment: { member_id: member.id, amount: 400 }, balance: 600, linkedMemberIds: [member.id] },
  calls: [] as Array<{ operation: string; table?: string; name?: string; payload?: unknown; options?: unknown; filters?: unknown }>,
  releaseUpdate: null as null | (() => void)
}
const executeQuery = async (query: { operation: string; table: string; payload?: any; options?: unknown; filters: Array<[string, unknown]> }) => {
  state.calls.push(copy(query))
  if (query.operation === 'DELETE') throw new Error('Fixture rejects physical member deletion')
  if (query.operation === 'UPDATE') throw new Error(`Unexpected direct mutation: ${query.table}`)
  // Production sources retain tombstones for history/synchronization; the real
  // playerRosterApi must exclude them from displayed roster rows.
  if (query.table === 'team_members_safe' || query.table === 'team_members') return { data: copy(state.members), error: null }
  if (query.table === 'player_identity_labels') return { data: [], error: null }
  throw new Error(`Unexpected fixture query: ${query.operation} ${query.table}`)
}
export const supabase = {
  async rpc(name: string, payload?: Record<string, unknown>) {
    state.calls.push({ operation: 'RPC', name, payload: payload ? copy(payload) : undefined })
    if (name === 'soft_delete_team_member') {
      if (state.holdUpdate) await new Promise<void>((resolve) => { state.releaseUpdate = resolve })
      if (state.failNextUpdate) {
        state.failNextUpdate = false
        return { data: null, error: { message: '測試連線失敗，請再試一次。' } }
      }
      const row = state.members.find((row) => row.id === payload?.p_member_id)
      if (!row) return { data: null, error: { message: '找不到隊職員資料。' } }
      Object.assign(row, { status: '退隊', deleted_at: '2026-10-13T01:00:00Z', deleted_by: 'fixture-editor' })
      state.revision++
      return { data: row.id, error: null }
    }
    if (name === 'list_team_members_for_edit') return { data: copy(state.members), error: null }
    if (name === 'get_team_members_cache_meta') return { data: { row_count: state.members.length, latest_changed_at: `fixture-${state.revision}` }, error: null }
    if (name === 'list_team_group_settings') return { data: [{ id: 'fixture-group', name: 'U10', sort_order: 1, member_count: 1 }], error: null }
    throw new Error(`Unexpected fixture RPC: ${name}`)
  },
  from(table: string) {
    const query = { operation: 'SELECT', table, filters: [] as Array<[string, unknown]>, payload: undefined as unknown, options: undefined as unknown }
    const builder = {
      select() { return builder }, order() { return builder },
      eq(key: string, value: unknown) { query.filters.push([key, value]); return builder },
      is() { return builder },
      update(payload: unknown, options?: unknown) { Object.assign(query, { operation: 'UPDATE', payload, options }); return builder },
      delete() { query.operation = 'DELETE'; return builder },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return executeQuery(query).then(resolve, reject) }
    }
    return builder
  }
}
