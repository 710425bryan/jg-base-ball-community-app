import { supabase } from '@/services/supabase'
import type { FeeManagementReminderSnapshot } from '@/types/feeManagementReminders'
import { normalizeFeeManagementReminderSnapshot } from '@/utils/feeManagementReminders'

export const getFeeManagementReminders = async (): Promise<FeeManagementReminderSnapshot> => {
  const { data, error } = await supabase.rpc('get_fee_management_reminders')

  if (error) {
    throw error
  }

  return normalizeFeeManagementReminderSnapshot(data)
}
