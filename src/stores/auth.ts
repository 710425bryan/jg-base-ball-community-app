import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import type { User, Session } from '@supabase/supabase-js'
import { usePermissionsStore } from './permissions'
import { getProfileAccessState } from '@/utils/profileAccess'

const LAST_SEEN_SYNC_INTERVAL_MS = 5 * 60 * 1000
const lastSeenSyncCache = new Map<string, number>()

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

  const clearLocalAuthContext = async () => {
    session.value = null
    user.value = null
    profile.value = null
    hydratedProfileUserId = null

    if (permissionsStore.currentRole !== '') {
      await permissionsStore.fetchPermissions('')
    }
  }

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    profile.value = data || null
    return profile.value
  }

  const rejectInvalidProfileAccess = async () => {
    const accessState = getProfileAccessState(profile.value)

    if (accessState.allowed) {
      return
    }

    try {
      await supabase.auth.signOut()
    } finally {
      await clearLocalAuthContext()
    }

    throw new Error(accessState.message)
  }

  const maybeTouchLastSeen = async (userId: string) => {
    const cachedLastSeenAt = lastSeenSyncCache.get(userId) ?? 0
    const profileLastSeenAt = profile.value?.last_seen_at ? new Date(profile.value.last_seen_at).getTime() : 0
    const newestKnownSeenAt = Math.max(cachedLastSeenAt, profileLastSeenAt)

    if (newestKnownSeenAt && Date.now() - newestKnownSeenAt < LAST_SEEN_SYNC_INTERVAL_MS) {
      return
    }

    const nextSeenAt = new Date().toISOString()
    const { error } = await supabase.rpc('touch_profile_last_seen')

    if (error) {
      console.warn('Failed to touch profile last seen', error)
      return
    }

    lastSeenSyncCache.set(userId, Date.now())

    if (profile.value?.id === userId) {
      profile.value = {
        ...profile.value,
        last_seen_at: nextSeenAt
      }
    }
  }

  const syncAuthContext = async (
    nextSession: Session | null,
    options: { forceProfileReload?: boolean } = {}
  ) => {
    session.value = nextSession
    user.value = nextSession?.user ?? null

    if (!user.value) {
      await clearLocalAuthContext()
      return
    }

    const shouldReloadProfile =
      options.forceProfileReload || hydratedProfileUserId !== user.value.id || !profile.value

    if (shouldReloadProfile) {
      await fetchProfile(user.value.id)
      hydratedProfileUserId = user.value.id
    }

    await rejectInvalidProfileAccess()

    const nextRole = profile.value?.role || ''
    if (permissionsStore.currentRole !== nextRole) {
      await permissionsStore.fetchPermissions(nextRole)
    }

    void maybeTouchLastSeen(user.value.id)
  }

  const registerAuthStateListener = () => {
    if (authStateSubscription) return

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void syncAuthContext(newSession).catch((error) => {
        console.warn('Failed to sync auth state', error)
      })
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
    } catch (error) {
      console.error('Failed to initialize auth', error)
    } finally {
      registerAuthStateListener()
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
    const normalizedEmail = email.trim().toLowerCase()
    const { data: canRequest, error: permissionError } = await supabase.rpc('can_request_magic_link', {
      p_email: normalizedEmail
    })

    if (permissionError || !canRequest) {
      throw new Error('此信箱不存在、已停權或不在可登入時間內，無法登入。')
    }

    const { error } = await supabase.auth.signInWithOtp({ 
      email: normalizedEmail,
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
    await clearLocalAuthContext()
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
