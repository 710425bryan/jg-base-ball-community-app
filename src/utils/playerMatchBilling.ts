import type { PlayerMatchBilling } from '@/types/playerBilling'
import { isNoFeeBillingMember } from './memberBilling'

// Older roster responses do not contain the independent setting yet.
export const getPlayerMatchFeeEnabled = (member: PlayerMatchBilling): boolean => {
  if (member.role !== '球員' && member.role !== '校隊') return false
  return typeof member.match_fee_enabled === 'boolean'
    ? member.match_fee_enabled
    : !isNoFeeBillingMember(member)
}

export const getPlayerMatchFeeLabel = (member: PlayerMatchBilling) =>
  getPlayerMatchFeeEnabled(member) ? '比賽依參賽收費' : '免收比賽費'

export const getPlayerMatchBillingForm = (member: PlayerMatchBilling) => ({
  match_fee_enabled: getPlayerMatchFeeEnabled(member),
  match_fee_start_date: member.match_fee_start_date || null
})
