import { createRouter, createWebHashHistory } from 'vue-router'
import PublicLayout from '../layouts/PublicLayout.vue'
import MainLayout from '../layouts/MainLayout.vue'
import { useAuthStore } from '../stores/auth'
import { usePermissionsStore } from '../stores/permissions'

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
    if (!permissionsStore.can(to.meta.feature as string, 'VIEW')) {
      next('/dashboard')
    } else {
      next()
    }
  } else {
    // 落入這裡的包含 dashboard、calendar 等無特別要求 meta.feature 的頁面
    next()
  }
})

export default router
