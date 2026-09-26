import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { MyPaymentMember } from '@/types/payments'
import { usePaymentSubmissionAccess } from './usePaymentSubmissionAccess'

const member = (member_id: string, is_linked: boolean, billing_mode = 'quarterly') =>
  ({ member_id, name: member_id, is_linked, billing_mode } as MyPaymentMember)

function setup(role = 'ADMIN', linked = false) {
  const profile = ref({ role, is_active: true, access_start: null as string | null, access_end: null as string | null })
  const members = ref([member('older', linked), member('younger', linked), member('monthly', false, 'monthly')])
  const selected = ref<MyPaymentMember | null>(members.value[1]!)
  return { profile, members, selected, ...usePaymentSubmissionAccess(() => profile.value, () => members.value, () => selected.value) }
}

describe('payment submission member access', () => {
  it('lets an unlinked admin report the selected player without loading all roster fees', () => {
    const access = setup()
    expect(access.linkedMembers.value).toEqual([])
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(true)
    expect(access.defaultSubmissionMember.value?.member_id).toBe('younger')
    expect(access.submissionMembers.value).toHaveLength(3)
    expect(access.quarterlySubmissionMembers.value.map(m => m.member_id)).toEqual(['younger'])
    expect(access.createSubmissionAccessHint.value).toBe('')
    access.selected.value = access.members.value[2]!
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(true)
    expect(access.defaultSubmissionMember.value?.billing_mode).toBe('monthly')
  })

  it('keeps linked-family combined payments and supports switching to an unlinked member', () => {
    const access = setup('ADMIN', true)
    expect(access.quarterlySubmissionMembers.value).toHaveLength(2)
    access.selected.value = access.members.value[2]!
    expect(access.defaultSubmissionMember.value?.member_id).toBe('monthly')
    expect(access.quarterlySubmissionMembers.value).toHaveLength(1)
  })

  it.each(['PARENT', 'MANAGER', 'COACH'])('does not grant %s admin submission privileges', (role) => {
    const access = setup(role, true)
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(true)
    expect(access.quarterlySubmissionMembers.value).toHaveLength(2)
    access.selected.value = access.members.value[2]!
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
    expect(access.submissionMembers.value.map(m => m.member_id)).toEqual(['older', 'younger'])
    expect(access.createSubmissionAccessHint.value).toContain('僅限自己的綁定成員')
    access.members.value = access.members.value.map(m => ({ ...m, is_linked: false }))
    expect(access.defaultSubmissionMember.value).toBeNull()
  })

  it('reacts to role changes and requires an active account within its access window', () => {
    const access = setup()
    access.profile.value.is_active = false
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
    access.profile.value.is_active = true
    access.profile.value.access_start = '2999-01-01'
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
    access.profile.value.access_start = null
    access.profile.value.access_end = '2000-01-01'
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
    access.profile.value.access_end = null
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(true)
    access.profile.value.role = 'PARENT'
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
  })

  it('requires a signed-in profile and a selected member from the available list', () => {
    const access = setup()
    access.selected.value = member('unknown', false)
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
    access.selected.value = null
    expect(access.canCreateSubmissionForSelectedMember.value).toBe(false)
    const anonymous = usePaymentSubmissionAccess(() => null, () => [member('older', true)], () => member('older', true))
    expect(anonymous.canCreateSubmissionForSelectedMember.value).toBe(false)
  })
})
