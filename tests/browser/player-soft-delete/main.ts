import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import 'element-plus/dist/index.css'
import '@/style.css'
import PlayersView from '@/views/PlayersView.vue'
import AppGlobalDialog from '@/components/common/AppGlobalDialog.vue'
import AppGlobalSelect from '@/components/common/AppGlobalSelect.vue'
import { usePermissionsStore } from './stores'
import { state } from './supabase'

const app = createApp(defineComponent({ setup() {
  return () => h('main', { class: 'app-main-scroll', style: 'height:100dvh;overflow:auto;' }, [h(PlayersView)])
} }))
const pinia = createPinia()
app.use(pinia).use(ElementPlus, { locale: zhTw })
app.component('el-dialog', AppGlobalDialog).component('el-select', AppGlobalSelect)
Object.assign(window, { __playerFixture: state, __playerPermissions: usePermissionsStore(pinia) })
app.mount('#app')
