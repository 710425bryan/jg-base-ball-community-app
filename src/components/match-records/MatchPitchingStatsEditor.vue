<script setup lang="ts">
import { Minus, Plus } from '@element-plus/icons-vue'
import type { PitchingStat } from '@/types/match'
import {
  createEmptyPitchingStat,
  formatPitchingEra,
  formatPitchingInnings,
  isValidPitchingOuts
} from '@/utils/matchPitchingStats'

const stats = defineModel<PitchingStat[]>({ default: () => [] })
const emit = defineEmits<{
  (e: 'load-current'): void
  (e: 'recalculate'): void
}>()
</script>

<template>
  <div class="space-y-4 animate-fade-in pr-2">
    <div class="flex items-center justify-between bg-slate-100 p-4 rounded-xl border border-slate-200">
      <div>
        <h3 class="font-extrabold text-slate-800 text-sm">投手成績輸入</h3>
        <p class="text-xs text-slate-500 mt-0.5">局數、被安打、保送、三振、用球數</p>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <el-button @click="emit('load-current')" type="primary" plain size="small" class="!font-bold bg-white">
          載入目前投手
        </el-button>
        <el-button @click="emit('recalculate')" color="#D99026" size="small" class="!font-bold !text-white">
          從逐局重算
        </el-button>
      </div>
    </div>

    <p class="text-sm text-slate-600">
      出局數請填 0 以上整數，每 3 個出局數為 1 局。投 ⅔ 局請填 2，局數顯示 0.2；投 3 局請填 9，顯示 3.0。請勿填入 0.66。
    </p>

    <div class="overflow-x-auto min-h-[300px] custom-scrollbar border border-gray-200 rounded-xl">
      <table class="w-full text-[11px] text-center border-collapse whitespace-nowrap">
        <thead>
          <tr class="bg-gray-100 text-gray-600 font-black">
            <th class="p-2 border-b border-gray-200 text-left pl-3 sticky left-0 z-10 bg-gray-100">投手</th>
            <th class="p-2 border-b border-gray-200">局數</th>
            <th class="p-2 border-b border-gray-200">出局數</th>
            <th class="p-2 border-b border-gray-200">打數</th>
            <th class="p-2 border-b border-gray-200">被安</th>
            <th class="p-2 border-b border-gray-200">被二安</th>
            <th class="p-2 border-b border-gray-200">被三安</th>
            <th class="p-2 border-b border-gray-200">被全壘</th>
            <th class="p-2 border-b border-gray-200">失分</th>
            <th class="p-2 border-b border-gray-200">責失</th>
            <th class="p-2 border-b border-gray-200">四壞</th>
            <th class="p-2 border-b border-gray-200">三振</th>
            <th class="p-2 border-b border-gray-200">球數</th>
            <th class="p-2 border-b border-gray-200">滾出</th>
            <th class="p-2 border-b border-gray-200">飛出</th>
            <th class="p-2 border-b border-gray-200">防禦率</th>
            <th class="p-2 border-b border-gray-200">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(s, i) in stats" :key="`pitch-${i}`">
            <tr class="border-b border-gray-100/50 hover:bg-gray-50 transition-colors">
              <td class="p-1 pl-3 sticky left-0 z-10 bg-white">
                <div class="flex items-center gap-1 pr-2">
                  <el-input v-model="s.name" size="small" class="w-24" placeholder="姓名" />
                  <el-input v-model="s.number" size="small" class="!w-14" placeholder="#" />
                </div>
              </td>
              <td class="p-1 font-mono font-black text-primary" data-testid="pitching-innings">{{ formatPitchingInnings(s.ip) }}</td>
              <td class="p-1">
                <!-- Keep invalid decimals visible for correction; precision/step-strictly would silently round them. -->
                <el-input-number
                  v-model="s.ip"
                  :controls="false"
                  :min="0"
                  :step="1"
                  :aria-label="`${s.name || `第 ${i + 1} 位投手`}出局數`"
                  :aria-invalid="!isValidPitchingOuts(s.ip)"
                  :aria-describedby="!isValidPitchingOuts(s.ip) ? `pitching-outs-error-${i}` : undefined"
                  size="small"
                  class="!w-14 !px-0"
                  data-testid="pitching-outs"
                />
              </td>
              <td class="p-1"><el-input-number v-model="s.ab" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.h" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.h2" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.h3" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.hr" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.r" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.er" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.bb" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.so" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.np" :controls="false" :min="0" size="small" class="!w-12 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.go" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1"><el-input-number v-model="s.ao" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
              <td class="p-1 font-mono font-black text-primary" data-testid="pitching-era">{{ formatPitchingEra(s) }}</td>
              <td class="p-1"><el-button type="danger" size="small" text :aria-label="`刪除${s.name || '投手'}`" @click="stats.splice(i, 1)"><el-icon><Minus /></el-icon></el-button></td>
            </tr>
            <tr v-if="!isValidPitchingOuts(s.ip)">
              <td colspan="17" class="p-2 text-left text-red-600 whitespace-normal">
                <p :id="`pitching-outs-error-${i}`" role="alert">
                  {{ s.name || `第 ${i + 1} 位投手` }}：出局數請填 0 以上整數；投 ⅔ 局請填 2，不是 0.66。
                </p>
              </td>
            </tr>
          </template>
          <tr v-if="!stats.length">
            <td colspan="17" class="p-8 text-gray-400 font-bold italic">
              目前沒有投手成績，請先載入目前投手或手動新增。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex justify-end pt-2">
      <el-button @click="stats.push(createEmptyPitchingStat())" size="small" plain><el-icon class="mr-1.5"><Plus /></el-icon>新增投手</el-button>
    </div>
  </div>
</template>
