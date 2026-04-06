<template>
  <div class="flex flex-col gap-4 animate-fade-in max-w-2xl mx-auto">
    <div class="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex gap-3 text-primary text-sm font-bold items-start leading-relaxed">
      <el-icon class="mt-0.5 text-lg"><InfoFilled /></el-icon>
      <div>在此設定每位校隊球員「計次月費」的基準金額。防呆預設為 500 元。若有特殊成員（如圖示的簡亦秀為 250 元），可在此覆寫設定。下次結算該月費用時將自動帶入此費率。</div>
    </div>

    <!-- Data Table -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" v-loading="isLoading">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50/80 border-b border-gray-100">
            <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm w-1/2">校隊成員姓名</th>
            <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm">單次收費金額 (元)</th>
            <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm w-32">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="member in members" :key="member.id" class="hover:bg-gray-50/50 transition-colors">
            <td class="py-3 px-4 flex items-center gap-2">
              <span class="font-black text-gray-800">{{ member.name }}</span>
              <span v-if="member.sibling_ids && member.sibling_ids.length > 0" class="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded whitespace-nowrap">半價優惠</span>
            </td>
            <td class="py-3 px-4">
              <el-input-number 
                v-model="feeMap[member.id]" 
                :min="0" :step="50" 
                size="large" 
                class="!w-32 font-mono font-bold"
                @change="markDirty(member.id)"
              />
            </td>
            <td class="py-3 px-4 text-center">
              <button 
                @click="updateFeeSetting(member.id)"
                :disabled="isSaving[member.id] || !isDirty[member.id]"
                class="px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
                :class="isDirty[member.id] ? 'bg-primary text-white hover:bg-primary/90' : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
              >
                {{ isSaving[member.id] ? '儲存中...' : '儲存' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'

const isLoading = ref(true)
const members = ref<any[]>([])
const feeMap = ref<Record<string, number>>({})
const isSaving = ref<Record<string, boolean>>({})
const isDirty = ref<Record<string, boolean>>({})

const markDirty = (memberId: string) => {
  isDirty.value[memberId] = true
}

const fetchData = async () => {
  isLoading.value = true
  try {
    // 1. 撈取校隊名單
    const { data: teamMembers, error: mErr } = await supabase
      .from('team_members')
      .select('id, name, status, sibling_ids')
      .eq('role', '校隊')
      .order('name')
    if (mErr) throw mErr
    members.value = teamMembers?.filter(m => m.status !== '退隊') || []
    
    // 初始化防呆預設值
    members.value.forEach(m => {
      feeMap.value[m.id] = 500
    })

    // 2. 撈取已設定的費率
    const { data: settings, error: sErr } = await supabase
      .from('fee_settings')
      .select('member_id, per_session_fee')
    if (sErr) throw sErr
    
    // 覆寫預設值
    settings?.forEach(s => {
      if (feeMap.value[s.member_id] !== undefined) {
          feeMap.value[s.member_id] = s.per_session_fee
        }
      })

      // 初始化 dirty 狀態
      members.value.forEach(m => {
        isDirty.value[m.id] = false
        isSaving.value[m.id] = false
      })

    } catch (e: any) {
      ElMessage.error('載入設定失敗: ' + e.message)
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  const updateFeeSetting = async (memberId: string) => {
    isSaving.value[memberId] = true
    const newFee = feeMap.value[memberId]
    try {
      const { error } = await supabase
        .from('fee_settings')
        .upsert({ 
          member_id: memberId, 
          per_session_fee: newFee,
          updated_at: new Date().toISOString()
        }, { onConflict: 'member_id' })
        
      if (error) throw error
      ElMessage.success('儲存成功')
      isDirty.value[memberId] = false
    } catch(e: any) {
      ElMessage.error('儲存紀錄失敗: ' + e.message)
      console.error(e)
    } finally {
      isSaving.value[memberId] = false
    }
  }

onMounted(() => {
  fetchData()
})
</script>
