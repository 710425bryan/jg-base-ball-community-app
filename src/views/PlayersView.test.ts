import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./PlayersView.vue', import.meta.url), 'utf8')

describe('PlayersView soft deletion integration', () => {
  it('uses the tested soft-delete workflow and retains the original permission boundaries', () => {
    expect(source).toContain("from '@/services/playerRosterMutations'")
    expect(source).toContain("from '@/composables/usePlayerSoftDelete'")
    expect(source).toContain('v-if="isEditing && canDeletePlayers" @click="confirmSoftDelete"')
    expect(source).toContain('canDelete: () => canDeletePlayers.value')
    expect(source).toContain('softDeleteMember: softDeletePlayer')
    expect(source).not.toMatch(/from\('team_members'\)\.delete\(/)
    expect(source).toContain('refreshRoster: () => playerRosterStore.refreshRoster(')
    expect(source).toContain('invalidateRoster: () => playerRosterStore.clearRosterCache()')
    expect(source).toContain('未儲存的表單修改不會一併儲存')
    expect(source).toContain('所有名單（含退隊名單）隱藏')
  })

  it('deduplicates synchronization against deleted members and does not change their history or links', () => {
    const sync = source.slice(source.indexOf('const syncFromGoogleSheet ='), source.indexOf('const fetchData ='))
    expect(sync).toContain('const syncSnapshot = await fetchPlayerRosterSyncRows()')
    expect(sync).toContain('const existingMap = buildPlayerSyncMemberMap<any>(syncSnapshot)')
    expect(sync).not.toContain('members.value.forEach')
    expect(sync.indexOf('if (existingMember?.deleted_at) continue')).toBeLessThan(sync.indexOf('syncRows.push('))
    expect(sync.indexOf('if (existingMember?.deleted_at) continue')).toBeLessThan(sync.indexOf('guardianAccountInputs.push('))
    expect(source).toContain('getWritablePlayerSyncMembers(normalizedMembers).filter(')
    expect(source).toContain('getWritablePlayerSyncMembers(memberList)')
    expect(source).toContain('is_half_price, sibling_ids, deleted_at')
    expect(source).toContain('const halfPriceCleanupIds = filterWritablePlayerSyncMemberIds(')
    expect(source).toContain('buildSiblingHalfPriceCleanupIds(savedMember.id, normalizedMembers),')
  })

  it('preserves hidden sibling relations in display and drafts while keeping hidden IDs out of selectors', () => {
    expect(source).toContain('buildMembersWithNormalizedSiblings(playerRosterStore.members, { preserveHiddenReferences: true })')
    expect(source).toContain('const normalizedMembers = buildMembersWithNormalizedSiblings(memberList)')
    expect(source).toContain('v-model="visibleFormSiblingIds"')
    expect(source).toContain('getVisiblePlayerSiblingIds(form.sibling_ids, siblingOptionIds.value)')
    expect(source).toContain('form.sibling_ids = mergeVisiblePlayerSiblingIds(form.sibling_ids, selectedIds, siblingOptionIds.value)')
    expect(source).not.toContain('v-model="form.sibling_ids"')
  })

  it('keeps errors visible and clears them when opening another form or closing', () => {
    expect(source).toContain('<el-alert v-if="removalError"')
    expect(source).toContain('@closed="clearRemovalError"')
    const createForm = source.slice(source.indexOf('const openCreateModal ='), source.indexOf('const openEditModal ='))
    const editForm = source.slice(source.indexOf('const openEditModal ='), source.indexOf('const submitForm ='))
    expect(createForm).toContain('clearRemovalError()')
    expect(editForm).toContain('clearRemovalError()')
    expect(source).toContain('if (!formRef.value || isSubmitting.value || isRemoving.value) return')
    expect(source).toContain('if (isSubmitting.value || isRemoving.value) return')
    expect(source.match(/:disabled="isSubmitting \|\| isRemoving"/g)).toHaveLength(3)
    expect(source).toContain(':close-on-click-modal="!isRemoving"')
    expect(source).toContain(':close-on-press-escape="!isRemoving"')
  })
})

describe('PlayersView guardian account role integration', () => {
  it('resolves new-account permissions from stable keys and retains the reload and fallback paths', () => {
    expect(source).toContain("from '@/utils/guardianAccountRole'")
    expect(source).toContain('resolveGeneralMemberRoleKeyFromRoles(permissionsStore.roles)')
    expect(source).toContain(".select('role_key')")
    expect(source).toContain('resolveGeneralMemberRoleKeyFromRoles(data || []) || GENERAL_MEMBER_ROLE_FALLBACK')
    expect(source).not.toContain("role.role_name === '一般成員'")
  })
})

describe('PlayersView independent match billing integration', () => {
  it('hydrates and saves match billing separately while leaving the date to the database', () => {
    expect(source).toContain('<PlayerBillingFields')
    expect(source).toContain('v-model:match-fee-enabled="form.match_fee_enabled"')
    expect(source).toContain('Object.assign(form, getPlayerMatchBillingForm(member))')
    expect(source).toContain('payload.match_fee_enabled = getPlayerMatchFeeEnabled(payload)')
    expect(source).toContain('delete payload.match_fee_start_date')
    expect(source).toContain('getPlayerMatchFeeLabel(row)')
    expect(source).toContain('getPlayerMatchFeeLabel(member)')
    expect(source).not.toContain('不收費成員不會產生新的隊費與比賽費')
  })
})

describe('PlayersView new member notification ownership', () => {
  it('leaves new member notification delivery to the database outbox', () => {
    expect(source).not.toContain('notifyInsertedMembers')
    expect(source).not.toContain("buildPushEventKey('team_member'")
    expect(source).not.toContain('dispatchPushNotification')
    expect(source).not.toContain(".insert(dedupedInserts)\n        .select")
    expect(source).not.toContain(".insert(payload)\n        .select")
  })
})

describe('PlayersView mobile filters', () => {
  it('shows advanced selects only in the bottom sheet on narrow screens', () => {
    expect(source).toContain('players-toolbar-filters hidden')

    const narrowScreenStyles = source.slice(source.indexOf('@media (max-width: 639px)'))
    expect(narrowScreenStyles).toMatch(/\.players-toolbar-filters\s*\{\s*display:\s*none;/)
    expect(narrowScreenStyles).not.toMatch(/\.players-toolbar-filters\s*\{\s*display:\s*grid;/)
  })
})

describe('PlayersView school-team identity terminology', () => {
  it('shows the junior-high program as 國中部', () => {
    const identitySource = readFileSync(new URL('../utils/playerIdentity.ts', import.meta.url), 'utf8')
    expect(identitySource).toContain("{ label: '國中部', value: XINTAI_PLAYER_IDENTITY }")
    expect(identitySource).not.toContain("{ label: '新泰校隊', value: XINTAI_PLAYER_IDENTITY }")
  })
})

describe('PlayersView custom identity integration', () => {
  it('applies business mapping only on user selection and retains the persisted label in the payload', () => {
    expect(source).toContain('@update:model-value="applyMemberIdentityToForm"')
    expect(source).not.toContain('() => form.member_identity')
    expect(source).toContain('form.member_identity = getMemberIdentityValue(member)')
    expect(source).toContain('getPlayerIdentityFormPatch(identity, form, defaultCommunityTeamGroupValue.value)')
    expect(source).toContain('delete payload.member_identity')
    expect(source).not.toContain('delete payload.member_identity_label')
  })
  it('uses the saved identity label for rendering, searching, exporting and sync protection', () => {
    expect(source).toContain('getMemberIdentityLabel(m).toLowerCase()')
    expect(source).toContain('getValue: (member) => getMemberIdentityLabel(member)')
    expect(source).toContain('getPlayerRoleForGoogleFormSync(rawRole,')
    expect(source).toContain('buildPlayerIdentityOptions(savedIdentityLabels.value, members.value)')
    expect(source).toContain('Promise.all([fetchData({ force: true }), loadIdentityLabels()])')
  })
})
