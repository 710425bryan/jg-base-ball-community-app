import { createRouter, createWebHashHistory } from 'vue-router'
import PublicLayout from '../layouts/PublicLayout.vue'
import MainLayout from '../layouts/MainLayout.vue'
import PushEntryView from '../views/PushEntryView.vue'
import { useAuthStore } from '../stores/auth'
import { usePermissionsStore } from '../stores/permissions'
import { getCurrentRouteFullPathFromLocation, refreshAppShell } from '../utils/appUpdate'

const CHUNK_RELOAD_SESSION_KEY = 'router:chunk-reload-target'
const LINKED_MEMBER_VIEW_FEATURES = new Set(['baseball_ability', 'physical_tests'])
const PERFORMANCE_MANAGE_ACTIONS = ['CREATE', 'EDIT', 'DELETE'] as const

const isDynamicImportError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)

  return [
    'Failed to fetch dynamically imported module',
    'Failed to load module script',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'ChunkLoadError',
    'Load failed',
    'Unable to preload CSS'
  ].some((pattern) => message.includes(pattern))
}

const getFallbackFullPath = () => {
  if (typeof window === 'undefined') return '/dashboard'

  return getCurrentRouteFullPathFromLocation()
}

const hasLinkedTeamMembers = (profile: any) => {
  const linkedIds = profile?.linked_team_member_ids
  return Array.isArray(linkedIds) && linkedIds.filter(Boolean).length > 0
}

const canManagePerformanceFeature = (
  permissionsStore: ReturnType<typeof usePermissionsStore>,
  feature: string
) => PERFORMANCE_MANAGE_ACTIONS.some((action) => permissionsStore.can(feature, action))

const router = createRouter({
  history: createWebHashHistory(), // 必須符合舊版WebView設定
  routes: [
    {
      path: '/',
      component: PublicLayout,
      children: [
        {
          path: '',
          name: 'Landing',
          component: () => import('../views/LandingView.vue')
        },
        {
          path: 'push-entry',
          name: 'PushEntry',
          component: PushEntryView
        }
      ]
    },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('../views/HomeView.vue')
        },
        {
          path: 'calendar',
          name: 'Calendar',
          component: () => import('../views/CalendarView.vue')
        },
        {
          path: 'profile',
          name: 'ProfileSettings',
          component: () => import('../views/ProfileSettingsView.vue')
        },
        {
          path: 'my-payments',
          name: 'MyPayments',
          component: () => import('../views/MyPaymentsView.vue')
        },
        {
          path: 'equipment-addons',
          name: 'EquipmentAddons',
          component: () => import('../views/EquipmentAddonsView.vue')
        },
        {
          path: 'my-leave-requests',
          name: 'MyLeaveRequests',
          component: () => import('../views/MyLeaveRequestsView.vue')
        },
        {
          path: 'leave-requests',
          name: 'LeaveRequests',
          component: () => import('../views/LeaveRequestsView.vue'),
          meta: { feature: 'leave_requests' }
        },
        {
          path: 'players',
          name: 'Players',
          component: () => import('../views/PlayersView.vue'),
          meta: { feature: 'players' }
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('../views/UsersView.vue'),
          meta: { feature: 'users' }
        },
        {
          path: 'join-inquiries',
          name: 'JoinInquiries',
          component: () => import('../views/JoinInquiriesView.vue'),
          meta: { feature: 'join_inquiries' }
        },
        {
          path: 'announcements',
          name: 'Announcements',
          component: () => import('../views/AnnouncementsView.vue'),
          meta: { feature: 'announcements' }
        },
        {
          path: 'holiday-theme-settings',
          name: 'HolidayThemeSettings',
          component: () => import('../views/HolidayThemeSettingsView.vue'),
          meta: { feature: 'holiday_theme_settings' }
        },
        {
          path: 'attendance',
          name: 'Attendance',
          component: () => import('../views/AttendanceListView.vue'),
          meta: { feature: 'attendance' }
        },
        {
          path: 'attendance/:id',
          name: 'RollCall',
          component: () => import('../views/RollCallView.vue'),
          meta: { feature: 'attendance' }
        },
        {
          path: 'match-records',
          name: 'MatchRecords',
          component: () => import('../views/MatchRecordsView.vue'),
          meta: { feature: 'matches' }
        },
        {
          path: 'fees',
          name: 'Fees',
          component: () => import('../views/FeesView.vue'),
          meta: { feature: 'fees' }
        },
        {
          path: 'baseball-ability',
          name: 'BaseballAbility',
          component: () => import('../views/BaseballAbilityView.vue'),
          meta: { feature: 'baseball_ability', allowLinkedMemberView: true }
        },
        {
          path: 'baseball-ability/:memberId',
          name: 'BaseballAbilityDetail',
          component: () => import('../views/BaseballAbilityDetailView.vue'),
          meta: { feature: 'baseball_ability', allowLinkedMemberView: true }
        },
        {
          path: 'physical-tests',
          name: 'PhysicalTests',
          component: () => import('../views/PhysicalTestsView.vue'),
          meta: { feature: 'physical_tests', allowLinkedMemberView: true }
        },
        {
          path: 'physical-tests/:memberId',
          name: 'PhysicalTestsDetail',
          component: () => import('../views/PhysicalTestsDetailView.vue'),
          meta: { feature: 'physical_tests', allowLinkedMemberView: true }
        },
        {
          path: 'equipment',
          name: 'Equipment',
          component: () => import('../views/EquipmentView.vue'),
          meta: { feature: 'equipment' }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // Wait for auth init if doing direct navigation
  if (authStore.isInitializing) {
    await authStore.ensureInitialized()
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/')
  } else if (to.meta.requiresAuth && to.meta.feature) {
    const permissionsStore = usePermissionsStore()
    const feature = to.meta.feature as string
    const isLinkedMemberViewFeature =
      to.meta.allowLinkedMemberView === true &&
      LINKED_MEMBER_VIEW_FEATURES.has(feature)

    if (isLinkedMemberViewFeature) {
      const canAccessPerformanceData =
        canManagePerformanceFeature(permissionsStore, feature) ||
        hasLinkedTeamMembers(authStore.profile)

      if (!canAccessPerformanceData) {
        next('/dashboard')
      } else {
        next()
      }
    } else if (!permissionsStore.can(feature, 'VIEW')) {
      next('/dashboard')
    } else {
      next()
    }
  } else {
    // 落入這裡的包含 dashboard、calendar 等無特別要求 meta.feature 的頁面
    next()
  }
})

router.onError((error, to) => {
  console.error('Router navigation failed:', error)

  if (!isDynamicImportError(error) || typeof window === 'undefined') {
    return
  }

  const targetFullPath =
    typeof to?.fullPath === 'string' && to.fullPath
      ? to.fullPath
      : getFallbackFullPath()

  const lastReloadTarget = window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)
  if (lastReloadTarget === targetFullPath) {
    window.sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY)
    return
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, targetFullPath)
  void refreshAppShell(targetFullPath)
})

router.afterEach((to) => {
  if (typeof window === 'undefined') return

  const lastReloadTarget = window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)
  if (lastReloadTarget === to.fullPath) {
    window.sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY)
  }
})

export default router
