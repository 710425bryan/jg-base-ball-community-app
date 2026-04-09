import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import type { User, Session } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const profile = ref<any | null>(null)
  const isInitializing = ref(true)

  const isAuthenticated = computed(() => !!user.value)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    profile.value = data || null
  }

  const initializeAuth = async () => {
    isInitializing.value = true
    try {
      const { data: { session: existingSession } } = await supabase.auth.getSession()
      session.value = existingSession
      user.value = existingSession?.user ?? null
      if (user.value) await fetchProfile(user.value.id)

      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        session.value = newSession
        user.value = newSession?.user ?? null
        if (user.value) {
          await fetchProfile(user.value.id)
        } else {
          profile.value = null
        }
      })
    } catch (error) {
      console.error('Failed to initialize auth', error)
    } finally {
      isInitializing.value = false
    }
  }

  const sendMagicLink = async (email: string) => {
    // 登入前安全檢查：確認該信箱是否存在於使用者名單 (profiles) 中，若無則不發送信件並接阻擋
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (profileError || !userProfile) {
      throw new Error('此信箱不存在於系統使用者名單中，無法登入。')
    }

    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    })
    if (error) throw error
  }

  const verifyOtpCode = async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    })
    if (error) throw error
    
    // 強制立即將登入狀態寫入，避免 router.push 觸發時 onAuthStateChange 還沒跑完被導回首頁
    session.value = data.session
    user.value = data.user || data.session?.user || null
    if (user.value) {
      await fetchProfile(user.value.id)
    }
    
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    user.value = null
    session.value = null
  }

  return {
    user,
    session,
    profile,
    isInitializing,
    isAuthenticated,
    initializeAuth,
    sendMagicLink,
    verifyOtpCode,
    signOut
  }
})
