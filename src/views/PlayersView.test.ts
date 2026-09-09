import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./PlayersView.vue', import.meta.url), 'utf8')

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
