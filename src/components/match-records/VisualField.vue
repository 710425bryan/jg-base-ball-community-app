<script setup lang="ts">
import { computed } from 'vue'
import type { LineupEntry } from '@/types/match'

const props = defineProps<{
  lineup: LineupEntry[]
  isEditing?: boolean
}>()

const emit = defineEmits<{
  (e: 'edit-lineup'): void
}>()

// Position definitions (percentage for absolute positioning on field)
const POSITIONS: Record<string, { label: string; x: number; y: number }> = {
  '1': { label: 'P',  x: 50, y: 60 },
  '2': { label: 'C',  x: 50, y: 90 },
  '3': { label: '1B', x: 75, y: 55 },
  '4': { label: '2B', x: 65, y: 35 },
  '5': { label: '3B', x: 25, y: 55 },
  '6': { label: 'SS', x: 35, y: 35 },
  '7': { label: 'LF', x: 20, y: 15 },
  '8': { label: 'CF', x: 50, y: 10 },
  '9': { label: 'RF', x: 80, y: 15 },
}

const fieldPlayers = computed(() => {
  return props.lineup.filter(p => Object.keys(POSITIONS).includes(p.position))
})

const benchPlayers = computed(() => {
  return props.lineup.filter(p => !Object.keys(POSITIONS).includes(p.position))
})

const getPosStyle = (posId: string) => {
  const pos = POSITIONS[posId]
  if (!pos) return { display: 'none' }
  return {
    left: `${pos.x}%`,
    top: `${pos.y}%`,
    transform: 'translate(-50%, -50%)'
  }
}
</script>

<template>
  <div class="flex flex-col md:flex-row gap-6">
    <!-- Visual Field -->
    <div class="flex-1 max-w-md mx-auto relative group overflow-hidden rounded-2xl border border-gray-200 shadow-sm bg-green-50 aspect-[4/3] md:aspect-auto md:h-[450px]">
      <img src="/baseball-field.png" alt="Baseball Field" class="absolute inset-0 w-full h-full object-cover opacity-90" />
      
      <!-- Player Nodes on Field -->
      <div 
        v-for="p in fieldPlayers" 
        :key="p.order"
        class="absolute flex flex-col items-center justify-center cursor-default z-10 transition-transform hover:scale-110 drop-shadow-md"
        :style="getPosStyle(p.position)"
      >
        <div class="bg-gray-900 text-white w-6 h-6 md:w-7 md:h-7 rounded-sm flex items-center justify-center font-black text-[10px] md:text-xs tracking-tighter shadow-md border border-gray-700">
          {{ POSITIONS[p.position].label }}
        </div>
        <div class="mt-1 bg-white/95 px-2 py-0.5 rounded-full shadow-sm border border-gray-200 flex items-center space-x-1 whitespace-nowrap">
          <span class="text-[10px] text-primary font-black">{{ p.number || '-' }}</span>
          <span class="text-[10px] font-bold text-gray-800">{{ p.name }}</span>
        </div>
      </div>

      <!-- Edit Lineup Overlay -->
      <div v-if="isEditing" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center rounded-2xl backdrop-blur-sm">
         <el-button type="primary" size="large" @click="emit('edit-lineup')" class="!rounded-xl font-bold shadow-xl !px-8">
           <el-icon class="mr-2"><Edit /></el-icon>調整打序與守位
         </el-button>
      </div>
    </div>

    <!-- Lineup List & Bench -->
    <div class="w-full md:w-64 flex flex-col space-y-4">
      <!-- Starting 9 List -->
      <div class="bg-gray-50 rounded-xl border border-gray-100 p-4 shrink-0 flex-1">
        <h4 class="font-extrabold text-gray-800 mb-3 text-sm flex items-center">
          <span class="w-2 h-4 bg-primary rounded-sm mr-2"></span>
          先發打序 (Starting 9)
        </h4>
        <div class="space-y-1.5 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
           <div v-for="p in props.lineup" :key="p.order" class="flex items-center text-xs bg-white border border-gray-100 rounded-lg p-2 hover:border-primary/30 transition-colors">
              <span class="w-5 font-black text-gray-400 shrink-0 text-center">{{ p.order }}</span>
              <span class="w-8 font-bold text-gray-600 shrink-0 text-center" :class="{'text-primary bg-primary/10 rounded px-1': POSITIONS[p.position]}">{{ POSITIONS[p.position]?.label || p.position }}</span>
              <span class="font-bold text-gray-800 flex-1 px-2 line-clamp-1">{{ p.name }}</span>
              <span class="text-gray-400 font-bold w-6 text-right shrink-0">{{ p.number || '-' }}</span>
           </div>
        </div>
      </div>

      <!-- Bench / DH -->
      <div class="bg-gray-50 rounded-xl border border-gray-100 p-4 shrink-0">
        <h4 class="font-extrabold text-gray-800 mb-2 text-sm flex items-center">
           <span class="w-2 h-4 bg-gray-400 rounded-sm mr-2"></span>板凳 / 指定打擊
        </h4>
        <div v-if="benchPlayers.length > 0" class="flex flex-wrap gap-2">
          <div v-for="b in benchPlayers" :key="b.order" class="bg-white border border-gray-200 px-2 py-1 flex items-center rounded text-[10px] shadow-sm">
            <span class="text-primary font-bold mr-1">{{ b.position }}</span>
             <span class="text-gray-800 font-bold mr-1">{{ b.name }}</span>
             <span class="text-gray-400">#{{ b.number || '-' }}</span>
          </div>
        </div>
        <div v-else class="text-xs text-gray-400 text-center py-2 italic">無指定打擊或預備球員</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e5e7eb;
  border-radius: 4px;
}
</style>
