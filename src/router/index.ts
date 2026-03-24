import { createRouter, createWebHashHistory } from 'vue-router'
import AuthLayout from '../layouts/AuthLayout.vue'
import MainLayout from '../layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHashHistory(), // 必須符合舊版WebView設定
  routes: [
    {
      path: '/',
      redirect: '/login'
    },
    {
      path: '/',
      component: AuthLayout,
      children: [
        {
          path: 'login',
          name: 'Login',
          component: () => import('../views/LoginView.vue')
        }
      ]
    },
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: 'home',
          name: 'Home',
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
        }
      ]
    }
  ]
})

export default router
