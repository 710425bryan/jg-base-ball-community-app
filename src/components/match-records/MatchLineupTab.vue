<template>
  <div class="mt-2 flex flex-col gap-4">
    <div v-if="showHeader" class="rounded-lg border border-slate-200 bg-slate-100 p-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          v-if="collapsible"
          type="button"
          class="flex items-center gap-2 text-left text-sm font-bold text-slate-700"
          @click="isCollapsed = !isCollapsed"
        >
          <el-icon><List /></el-icon>
          <span>{{ title }}</span>
          <el-icon class="transition-transform duration-200" :class="{ 'rotate-180': !isCollapsed }">
            <ArrowDown />
          </el-icon>
        </button>
        <span v-else class="flex items-center gap-2 text-sm font-bold text-slate-700">
          <el-icon><List /></el-icon>
          {{ title }}
        </span>

        <div class="flex flex-wrap justify-end gap-2">
          <el-button
            v-if="showScanActions && photoUrl"
            size="small"
            type="success"
            plain
            class="font-bold shadow-sm"
            :loading="isScanningLineup"
            @click="$emit('scanExisting')"
          >
            <el-icon class="mr-1"><Picture /></el-icon>
            解析賽事照片
          </el-button>
          <el-button
            v-if="showScanActions"
            size="small"
            type="primary"
            plain
            class="font-bold shadow-sm"
            :loading="isScanningLineup"
            @click="$emit('triggerScan')"
          >
            <el-icon class="mr-1"><Camera /></el-icon>
            {{ isScanningLineup ? 'AI 解析中...' : '匯入書面名單' }}
          </el-button>
          <el-button
            size="small"
            color="#D99026"
            class="!text-white font-bold shadow-md"
            @click="$emit('addPlayer')"
          >
            <el-icon class="mr-1"><Plus /></el-icon>
            {{ addButtonLabel }}
          </el-button>
        </div>
      </div>
    </div>

    <el-collapse-transition>
      <div v-show="!collapsible || !isCollapsed" class="flex flex-col gap-3">
        <div
          v-for="(player, idx) in lineup"
          :key="idx"
          class="group relative rounded-lg border border-slate-200 bg-white p-3 pr-10 shadow-sm transition-all hover:border-primary sm:p-4 sm:pr-14"
        >
          <div class="flex flex-col items-start gap-2 lg:flex-row lg:items-center lg:gap-3">
            <div class="flex w-full shrink-0 gap-2 lg:w-auto">
              <el-input-number
                :model-value="player.order"
                :min="1"
                :max="99"
                controls-position="right"
                class="!w-[100px] shrink-0"
                placeholder="棒次"
                @update:model-value="(value: number | undefined) => updateOrder(idx, value)"
              />
              <el-select
                :model-value="player.position"
                placeholder="守備位置"
                class="flex-1 font-bold lg:!w-[148px]"
                filterable
                allow-create
                @update:model-value="(value: string) => handlePositionChange(idx, value)"
              >
                <el-option v-for="pos in positions" :key="pos.value" :label="pos.label" :value="pos.value" />
              </el-select>
            </div>

            <div class="flex w-full min-w-0 gap-2 lg:flex-1">
              <el-select
                :model-value="player.name"
                filterable
                allow-create
                clearable
                placeholder="球員姓名"
                class="min-w-0 flex-1 lg:min-w-[150px]"
                @update:model-value="(value: string) => updatePlayerName(idx, value)"
              >
                <el-option
                  v-for="option in getAvailableLineupPlayers(idx)"
                  :key="option.id || option.name"
                  :label="formatPlayerOptionLabel(option)"
                  :value="option.name"
                />
              </el-select>
              <el-input
                :model-value="player.number"
                placeholder="背號"
                class="!w-[70px] shrink-0 text-center font-mono font-bold text-slate-600"
                @update:model-value="(value: string) => updateNumber(idx, value)"
              />
            </div>

            <div class="w-full shrink-0 lg:w-[132px]">
              <el-input
                :model-value="player.remark"
                placeholder="備註"
                class="w-full"
                @update:model-value="(value: string) => updateRemark(idx, value)"
              />
            </div>
          </div>

          <div class="absolute right-2 top-3 flex flex-col gap-1 sm:top-1/2 sm:-translate-y-1/2">
            <el-button size="small" text :disabled="idx === 0" @click="$emit('movePlayer', idx, -1)">▲</el-button>
            <el-button size="small" text :disabled="idx === lineup.length - 1" @click="$emit('movePlayer', idx, 1)">▼</el-button>
            <el-button
              type="danger"
              circle
              plain
              size="small"
              class="bg-white opacity-80 shadow-sm transition-opacity group-hover:opacity-100 sm:opacity-50"
              @click="$emit('removePlayer', idx)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>

        <div
          v-if="!lineup.length"
          class="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400"
        >
          尚未建立攻守名單
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ArrowDown, Camera, Delete, List, Picture, Plus } from '@element-plus/icons-vue'
import type { LineupEntry } from '@/types/match'
import type { LineupPlayerOption } from '@/utils/lineupPhotoParser'

interface PositionOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  lineup: LineupEntry[]
  showHeader?: boolean
  title?: string
  photoUrl?: string
  showScanActions?: boolean
  isScanningLineup?: boolean
  addButtonLabel?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  positions: PositionOption[]
  getAvailableLineupPlayers: (idx: number) => LineupPlayerOption[]
  handlePlayerChange: (lineupEntry: LineupEntry, playerName: string) => void
}>(), {
  showHeader: true,
  title: '攻守名單',
  photoUrl: '',
  showScanActions: true,
  isScanningLineup: false,
  addButtonLabel: '新增打者',
  collapsible: false,
  defaultCollapsed: false
})

defineEmits<{
  (event: 'triggerScan'): void
  (event: 'scanExisting'): void
  (event: 'addPlayer'): void
  (event: 'removePlayer', index: number): void
  (event: 'movePlayer', index: number, direction: -1 | 1): void
}>()

const isCollapsed = ref(props.defaultCollapsed)

watch(() => props.defaultCollapsed, (nextValue) => {
  isCollapsed.value = nextValue
})

defineExpose({
  isCollapsed
})

const normalizeText = (value: unknown) => String(value ?? '').trim()

const formatPlayerOptionLabel = (player: LineupPlayerOption) => {
  if (player.label) return player.label
  return `${player.name || ''}${player.number ? ` #${player.number}` : ''}`.trim()
}

const updateOrder = (idx: number, value?: number) => {
  const player = props.lineup[idx]
  if (!player) return
  player.order = Number.isFinite(Number(value)) ? Number(value) : idx + 1
}

const updatePlayerName = (idx: number, value: string) => {
  const player = props.lineup[idx]
  if (!player) return
  player.name = normalizeText(value)
  props.handlePlayerChange(player, player.name)
}

const updateNumber = (idx: number, value: string) => {
  const player = props.lineup[idx]
  if (!player) return
  player.number = normalizeText(value)
}

const updateRemark = (idx: number, value: string) => {
  const player = props.lineup[idx]
  if (!player) return
  player.remark = normalizeText(value)
}

const handlePositionChange = (idx: number, newPositionValue: string) => {
  const player = props.lineup[idx]
  if (!player) return

  const newPosition = normalizeText(newPositionValue)
  const oldPosition = player.position
  const oldOrder = player.order
  player.position = newPosition

  if (!newPosition || newPosition === '預備') return

  const conflictIdx = props.lineup.findIndex((item, itemIdx) => itemIdx !== idx && item.position === newPosition)
  if (conflictIdx === -1) return

  const conflictedPlayer = props.lineup[conflictIdx]
  let targetPositionForConflicted = oldPosition || '預備'

  if (targetPositionForConflicted !== '預備') {
    const hasAnotherConflict = props.lineup.some((item, itemIdx) =>
      itemIdx !== idx &&
      itemIdx !== conflictIdx &&
      item.position === targetPositionForConflicted
    )

    if (hasAnotherConflict) {
      targetPositionForConflicted = '預備'
    }
  }

  conflictedPlayer.position = targetPositionForConflicted
  player.order = conflictedPlayer.order
  conflictedPlayer.order = oldOrder
}
</script>
