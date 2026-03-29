import { createRouter, createWebHashHistory } from 'vue-router'
import PublicLayout from '../layouts/PublicLayout.vue'
import MainLayout from '../layouts/MainLayout.vue'
import { useAuthStore } from '../stores/auth'

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
          path: 'leave-requests',
          name: 'LeaveRequests',
          component: () => import('../views/LeaveRequestsView.vue')
        },
        {
          path: 'players',
          name: 'Players',
          component: () => import('../views/PlayersView.vue')
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('../views/UsersView.vue')
        },
        {
          path: 'join-inquiries',
          name: 'JoinInquiries',
          component: () => import('../views/JoinInquiriesView.vue')
        },
        {
          path: 'announcements',
          name: 'Announcements',
          component: () => import('../views/AnnouncementsView.vue')
        },
        {
          path: 'attendance',
          name: 'Attendance',
          component: () => import('../views/AttendanceListView.vue')
        },
        {
          path: 'attendance/:id',
          name: 'RollCall',
          component: () => import('../views/RollCallView.vue')
        },
        {
          path: 'match-records',
          name: 'MatchRecords',
          component: () => import('../views/MatchRecordsView.vue')
        },
        {
          path: 'fees',
          name: 'Fees',
          component: () => import('../views/FeesView.vue')
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
    await authStore.initializeAuth()
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/')
  } else {
    // 若欲避免已登入會員繼續卡在對外的登入首頁(如果有這種預期)，可在這裡加入 else if。
    // 不過由於使用者已經有 public首頁，保留原本架構。
    next()
  }
})

export default router
