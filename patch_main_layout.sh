#!/bin/bash
sed -i '' -e "s/\['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH'\].includes(authStore.profile?.role)/permissionsStore.can('leave_requests', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "s/\['ADMIN', 'HEAD_COACH', 'COACH'\].includes(authStore.profile?.role)/permissionsStore.can('attendance', 'VIEW')/g" src/layouts/MainLayout.vue
# Line 24: players
sed -i '' -e "24s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('players', 'VIEW')/g" src/layouts/MainLayout.vue
# Line 27: dropdown
sed -i '' -e "27s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('join_inquiries') || permissionsStore.can('announcements') || permissionsStore.can('fees') || permissionsStore.can('users')/g" src/layouts/MainLayout.vue
# Line 35: fees dropdown item
sed -i '' -e "35s/authStore.profile?.role === 'ADMIN'/permissionsStore.can('fees', 'VIEW')/g" src/layouts/MainLayout.vue
# Mobile menu
sed -i '' -e "123s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('players', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "124s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('join_inquiries', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "125s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('announcements', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "126s/\['ADMIN'\].includes(authStore.profile?.role)/permissionsStore.can('fees', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "127s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('users', 'VIEW')/g" src/layouts/MainLayout.vue
# Bottom Nav (Mobile)
sed -i '' -e "173s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('players', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "179s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('users', 'VIEW')/g" src/layouts/MainLayout.vue
# Notifications
sed -i '' -e "297s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('players', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "342s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('join_inquiries', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "380s/\['ADMIN', 'MANAGER'\].includes(authStore.profile?.role)/permissionsStore.can('fees', 'VIEW')/g" src/layouts/MainLayout.vue
sed -i '' -e "574,582c\\
// 監聽權限變化，確保有權限的角色才會開啟 WebSocket\\
watch(() => authStore.profile?.role, (newRole) => {\\
  // 現在只要登入就啟動監聽，內部會有 \`can()\` 判斷\\
  if (Notification.permission === 'default') {\\
    Notification.requestPermission();\\
  }\\
  startListening();\\
}, { immediate: true });\\
" src/layouts/MainLayout.vue

