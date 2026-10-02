import { supabase } from '@/services/supabase'
import type { AppRole, CreateAppRoleInput } from '@/types/appRole'

export const createAppRole = async (input: CreateAppRoleInput): Promise<AppRole> => {
  const { data, error } = await supabase.rpc('create_app_role', {
    p_role_key: input.role_key.trim(),
    p_role_name: input.role_name.trim(),
    p_copy_from_role_key: input.copy_from_role_key?.trim() || null
  }).single()

  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('角色建立功能尚未更新，請先部署角色權限複製的資料庫 migration。')
    }
    throw error
  }
  if (!data) throw new Error('建立角色未回傳結果，請重新整理角色名單。')
  return data as AppRole
}

export const updateAppRoleWeight = async (roleKey: string, weight: number): Promise<AppRole> => {
  if (!Number.isInteger(weight) || weight < 1 || weight > 2147483647) {
    throw new Error('排序數字請輸入 1 到 2147483647 的整數。')
  }
  const { data, error } = await supabase.rpc('update_app_role_weight', {
    p_role_key: roleKey.trim(), p_weight: weight
  }).single()
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('角色排序功能尚未更新，請先部署角色排序的資料庫 migration。')
    }
    throw error
  }
  if (!data) throw new Error('儲存排序未回傳結果，請重新整理角色名單。')
  return data as AppRole
}
