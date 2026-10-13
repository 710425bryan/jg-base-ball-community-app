import { supabase } from '@/services/supabase'

/** Hide the member from roster lists while retaining the database row and its history. */
export const softDeletePlayer = async (memberId: string): Promise<void> => {
  if (!memberId.trim()) throw new Error('缺少隊職員資料，請重新開啟後再試。')

  const { data, error } = await supabase.rpc('soft_delete_team_member', { p_member_id: memberId })

  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('軟刪除功能尚未更新，請聯絡管理員完成更新後再試。')
    }
    throw error
  }
  if (data !== memberId) {
    throw new Error('無法確認刪除結果，請重新整理名單後再確認。')
  }
}
