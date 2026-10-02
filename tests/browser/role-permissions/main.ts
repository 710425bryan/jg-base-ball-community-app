import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import 'element-plus/dist/index.css'
import '@/style.css'
import RolePermissionsManager from '@/components/RolePermissionsManager.vue'
import UsersView from '@/views/UsersView.vue'
import AppGlobalDialog from '@/components/common/AppGlobalDialog.vue'
import AppGlobalSelect from '@/components/common/AppGlobalSelect.vue'
import { usePermissionsStore } from '@/stores/permissions'
import { fixture } from './supabase'

const App = defineComponent({
  setup() {
    const permissions = usePermissionsStore()
    permissions.currentRole = 'ADMIN'
    Object.assign(window, { __roleFixture: fixture, __roleAssignableRoles: () => permissions.roles })
    return () => h('div', { style: 'height:100dvh;display:flex;flex-direction:column;min-width:0;' }, [
      h('main', { class: 'app-main-scroll', style: 'flex:1;min-height:0;overflow:auto;padding:16px;' },
        [h(new URLSearchParams(location.search).get('view') === 'users' ? UsersView : RolePermissionsManager)]),
      h('div', { style: 'height:4.5rem;flex:none;background:white;display:flex;align-items:center;justify-content:center;' }, '測試行動導覽（隔離資料）')
    ])
  }
})

const app = createApp(App)
app.use(createPinia()).use(ElementPlus, { locale: zhTw })
app.component('el-dialog', AppGlobalDialog).component('el-select', AppGlobalSelect)
app.mount('#app')
