import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import type { User, Session } from '@supabase/supabase-js'
import { usePermissionsStore } from './permissions'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const profile = ref<any | null>(null)
  const isInitializing = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const permissionsStore = usePermissionsStore()

  let initializationPromise: Promise<void> | null = null
  let authStateSubscription: { unsubscribe: () => void } | null = null
  let hydratedProfileUserId: string | null = null

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    profile.value = data || null
  }

  const syncAuthContext = async (
    nextSession: Session | null,
    options: { forceProfileReload?: boolean } = {}
  ) => {
    session.value = nextSession
    user.value = nextSession?.user ?? null

    if (!user.value) {
      profile.value = null
      hydratedProfileUserId = null
      if (permissionsStore.currentRole !== '') {
        await permissionsStore.fetchPermissions('')
      }
      return
    }

    const shouldReloadProfile =
      options.forceProfileReload || hydratedProfileUserId !== user.value.id || !profile.value

    if (shouldReloadProfile) {
      await fetchProfile(user.value.id)
      hydratedProfileUserId = user.value.id
    }

    const nextRole = profile.value?.role || ''
    if (permissionsStore.currentRole !== nextRole) {
      await permissionsStore.fetchPermissions(nextRole)
    }
  }

  const registerAuthStateListener = () => {
    if (authStateSubscription) return

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void syncAuthContext(newSession)
    })

    authStateSubscription = data.subscription
  }

  const initializeAuth = async () => {
    isInitializing.value = true

    try {
      const {
        data: { session: existingSession }
      } = await supabase.auth.getSession()

      await syncAuthContext(existingSession, { forceProfileReload: true })
      registerAuthStateListener()
    } catch (error) {
      console.error('Failed to initialize auth', error)
    } finally {
      isInitializing.value = false
    }
  }

  const ensureInitialized = async () => {
    if (!initializationPromise) {
      initializationPromise = initializeAuth().finally(() => {
        initializationPromise = null
      })
    }

    return initializationPromise
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
    
    await syncAuthContext(data.session, { forceProfileReload: true })
    
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    await syncAuthContext(null, { forceProfileReload: true })
  }

  return {
    user,
    session,
    profile,
    isInitializing,
    isAuthenticated,
    initializeAuth,
    ensureInitialized,
    sendMagicLink,
    verifyOtpCode,
    signOut
  }
})
