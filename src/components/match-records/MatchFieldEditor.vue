<template>
  <div class="match-field-editor flex flex-col gap-4">
    <div
      class="match-field-editor__surface"
      :class="{ 'match-field-editor__surface--mobile-edge': mobileEdgeToEdge }"
      data-testid="field-editor-surface"
    >
      <div v-if="showHeader" class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="text-base font-black text-slate-800">{{ title }}</div>
          <div class="text-sm text-slate-500">桌機可直接拖拉守位；平板可點選球員後再點球場位置完成指派。</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="!isReadonly">
            <el-tag round effect="light" type="success">拖拉換守位</el-tag>
            <el-tag round effect="light" type="warning">拖拉重排棒次</el-tag>
            <el-button v-if="selectedPlayer" size="small" plain class="font-bold" @click="clearSelection">
              取消選取 {{ selectedPlayer.name }}
            </el-button>
          </template>
          <el-tag v-else round effect="light" type="info">唯讀檢視</el-tag>
        </div>
      </div>

      <div
        v-if="editorPlayers.length === 0"
        class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500"
      >
        目前場上守備還沒有可視化球員，先在下方細修區輸入姓名後，這裡就會同步出現。
      </div>

      <div
        v-else
        class="match-field-editor__workspace"
        :class="{
          'is-drawer-visible': isDrawerVisible,
          'is-drawer-docked': isDrawerDocked,
          'is-drawer-overlay': isOverlayDrawer,
          'is-drawer-pinned': isDrawerPinnedOpen,
          'is-drawer-preview': isDrawerPreviewOpen && !isDrawerPinnedOpen,
          'is-hover-capable': supportsHoverPreview,
          'is-readonly': isReadonly
        }"
        @keydown.esc.stop="handleDrawerEscape"
      >
        <button
          v-if="showOverlayBackdrop"
          type="button"
          class="match-field-editor__drawer-backdrop"
          data-testid="field-drawer-backdrop"
          aria-label="關閉攻守名單抽屜"
          @click="closeDrawer"
        />

        <div class="match-field-editor__field-panel rounded-[30px] border border-emerald-900/20 bg-slate-900 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <div class="match-field-editor__turf relative mx-auto aspect-[4/5] w-full max-w-[720px] overflow-hidden rounded-[26px] border border-white/10">
            <img
              :src="fieldBackdropUrl"
              alt=""
              class="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.18),transparent_30%),linear-gradient(180deg,rgba(5,18,17,0.04),rgba(2,8,13,0.32))]" />
            <div class="pointer-events-none absolute inset-x-[10%] top-[5%] h-[18%] rounded-full bg-white/10 blur-3xl" />
            <div class="pointer-events-none absolute inset-x-[8%] bottom-[2%] h-[20%] rounded-full bg-slate-950/55 blur-3xl" />
            <div class="pointer-events-none absolute inset-0 rounded-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-20px_60px_rgba(2,10,14,0.34)]" />

            <div
              v-for="slot in FIELD_SLOT_LAYOUT"
              :key="slot.key"
              role="button"
              tabindex="0"
              class="match-field-editor__slot absolute -translate-x-1/2 -translate-y-1/2 text-left"
              :class="{ 'pointer-events-none': isReadonly }"
              :style="{ top: slot.top, left: slot.left }"
              :data-testid="`field-slot-${slot.key}`"
              @dragover.prevent
              @drop.prevent="handleZoneDrop(slot.key)"
              @click="handleSlotTap(slot.key)"
              @keydown.enter.prevent="handleSlotTap(slot.key)"
              @keydown.space.prevent="handleSlotTap(slot.key)"
            >
              <div
                class="match-field-editor__slot-card rounded-[22px] border px-3 py-2.5 shadow-[0_18px_38px_rgba(2,8,13,0.28)] backdrop-blur-md transition-all"
                :class="getZoneClasses(slot.key)"
              >
                <div class="match-field-editor__slot-header mb-2 flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="match-field-editor__slot-short text-[10px] font-black uppercase text-white/72">{{ slot.shortLabel }}</div>
                    <div class="match-field-editor__slot-label mt-1 truncate text-[12px] font-bold text-white/88">{{ formatFieldSlotLabel(slot) }}</div>
                  </div>
                  <span class="match-field-editor__slot-badge">{{ slot.key }}</span>
                </div>

                <div v-if="fieldSlotMap[slot.key]" class="match-field-editor__slot-player-row flex items-center gap-2">
                  <button
                    type="button"
                    class="match-field-editor__slot-player-button flex flex-1 items-center gap-2 text-left"
                    :class="{ 'pointer-events-none': isReadonly }"
                    :draggable="!isReadonly"
                    :data-testid="`field-player-${fieldSlotMap[slot.key]?.editorId}`"
                    @dragstart="fieldSlotMap[slot.key] && handleDragStart(fieldSlotMap[slot.key]!.editorId, $event)"
                    @dragend="clearDragState"
                    @click.stop="fieldSlotMap[slot.key] && toggleSelectedPlayer(fieldSlotMap[slot.key]!.editorId)"
                  >
                    <div class="match-field-editor__slot-player-meta min-w-0">
                      <div class="match-field-editor__slot-player-name truncate text-sm font-black text-white">{{ fieldSlotMap[slot.key]?.name }}</div>
                      <div class="match-field-editor__slot-player-subline text-[11px] font-mono text-white/70">
                        #{{ fieldSlotMap[slot.key]?.number || '--' }} ・ {{ fieldSlotMap[slot.key]?.order }}棒
                      </div>
                    </div>
                  </button>
                </div>

                <div v-else class="match-field-editor__slot-empty rounded-xl border border-dashed border-white/20 bg-white/5 px-2 py-3 text-center text-xs font-bold text-white/55">
                  {{ isReadonly ? '目前未配置守位' : selectedPlayer ? '指派到這裡' : '拖到這裡' }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="showCollapsedBenchZone"
            data-testid="field-inline-bench-zone"
            role="button"
            tabindex="0"
            class="mt-3 rounded-[24px] border p-3 transition-all"
            :class="getZoneClasses('預備', true)"
            @dragover.prevent
            @drop.prevent="handleZoneDrop('預備')"
            @click="handleSlotTap('預備')"
            @keydown.enter.prevent="handleSlotTap('預備')"
            @keydown.space.prevent="handleSlotTap('預備')"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <div>
                <div class="text-xs font-black uppercase" :class="isFieldDragActive ? 'text-orange-600' : 'text-slate-500'">Bench</div>
                <div class="text-sm font-bold" :class="isFieldDragActive ? 'text-orange-900' : 'text-slate-800'">替補 / 預備區</div>
                <div class="mt-1 text-[11px] leading-5" :class="isFieldDragActive ? 'text-orange-700' : 'text-slate-500'">
                  {{ isFieldDragActive ? '拖曳到球場守位就能直接上場。' : '抽屜收起時，這裡會保留替補區方便直接換人。' }}
                </div>
              </div>
              <el-tag size="small" round effect="light" type="info">{{ benchPlayers.length }} 位</el-tag>
            </div>

            <div v-if="benchPlayers.length > 0" class="flex gap-2 overflow-x-auto pb-1">
              <div
                v-for="player in benchPlayers"
                :key="player.editorId"
                class="min-w-[150px] rounded-2xl border bg-white/90 px-3 py-2 shadow-sm transition-all"
                :class="isSelected(player.editorId) ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/10' : 'border-slate-200/90'"
                :data-testid="`field-inline-bench-player-${player.editorId}`"
                :draggable="!isReadonly"
                @dragstart="handleDragStart(player.editorId, $event)"
                @dragend="clearDragState"
                @click.stop="toggleSelectedPlayer(player.editorId)"
              >
                <div class="flex items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-black text-slate-900">{{ player.name }}</div>
                    <div class="text-xs font-mono text-slate-500">#{{ player.number || '--' }} ・ {{ player.order }}棒</div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="rounded-xl border border-dashed border-slate-300 bg-white/80 px-3 py-5 text-center text-xs font-bold text-slate-400">
              {{ selectedPlayer ? '點這裡移到替補區' : '目前沒有替補球員，拖到這裡可改成替補' }}
            </div>
          </div>
        </div>

        <template v-if="showDrawer">
          <div
            ref="drawerShellRef"
            class="match-field-editor__drawer-shell"
            :class="{ 'is-open': isDrawerVisible }"
            :data-state="drawerState"
            data-testid="field-drawer-shell"
            @pointerenter="handleDrawerShellEnter"
            @pointerleave="handleDrawerShellLeave"
            @focusin="handleDrawerFocusIn"
            @focusout="handleDrawerFocusOut"
          >
            <button
              type="button"
              class="match-field-editor__drawer-handle"
              data-testid="field-drawer-handle"
              :aria-controls="drawerPanelId"
              :aria-expanded="isDrawerVisible ? 'true' : 'false'"
              :title="drawerHandleTitle"
              @click.stop="toggleDrawerPin"
            >
              <span class="match-field-editor__drawer-handle-arrow" aria-hidden="true">{{ drawerHandleArrow }}</span>
              <span class="match-field-editor__drawer-handle-label">名單</span>
              <span class="match-field-editor__drawer-handle-count">{{ editorPlayers.length }}</span>
            </button>

            <div
              v-show="isDrawerVisible"
              :id="drawerPanelId"
              class="match-field-editor__drawer-panel"
              data-testid="field-drawer"
              :data-mode="isDrawerDocked ? 'docked' : 'overlay'"
              tabindex="-1"
              :aria-hidden="isDrawerVisible ? 'false' : 'true'"
            >
              <div class="match-field-editor__drawer-header">
                <div class="min-w-0">
                  <div class="text-xs font-black uppercase text-slate-500">Field Tools</div>
                  <div class="mt-1 text-sm font-black text-slate-900">攻守名單抽屜</div>
                  <div class="mt-1 text-xs leading-5 text-slate-500">{{ drawerHelperText }}</div>
                </div>
                <el-button
                  type="info"
                  plain
                  size="small"
                  class="match-field-editor__drawer-close font-bold"
                  data-testid="field-drawer-close"
                  @click.stop="closeDrawer"
                >
                  收起
                </el-button>
              </div>

              <div class="match-field-editor__drawer-scroll">
                <div
                  role="button"
                  tabindex="0"
                  data-testid="field-slot-DH"
                  class="rounded-2xl border p-4 text-left shadow-sm transition-all"
                  :class="getZoneClasses('DH', true)"
                  @dragover.prevent
                  @drop.prevent="handleZoneDrop('DH')"
                  @click="handleSlotTap('DH')"
                  @keydown.enter.prevent="handleSlotTap('DH')"
                  @keydown.space.prevent="handleSlotTap('DH')"
                >
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div class="text-xs font-black uppercase text-slate-500">DH</div>
                      <div class="text-sm font-bold text-slate-800">指定打擊</div>
                    </div>
                    <el-tag size="small" round effect="light" type="warning">非守備位</el-tag>
                  </div>

                  <div v-if="dhPlayer" class="flex items-center gap-2">
                    <button
                      type="button"
                      class="flex flex-1 items-center gap-2 text-left"
                      draggable="true"
                      :data-testid="`field-dh-player-${dhPlayer.editorId}`"
                      @dragstart="handleDragStart(dhPlayer.editorId, $event)"
                      @dragend="clearDragState"
                      @click.stop="toggleSelectedPlayer(dhPlayer.editorId)"
                    >
                      <div class="min-w-0">
                        <div class="truncate font-black text-slate-900">{{ dhPlayer.name }}</div>
                        <div class="text-xs font-mono text-slate-500">#{{ dhPlayer.number || '--' }} ・ {{ dhPlayer.order }}棒</div>
                      </div>
                    </button>
                  </div>

                  <div v-else class="rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-5 text-center text-xs font-bold text-slate-400">
                    {{ selectedPlayer ? '點這裡設為 DH' : '拖到這裡設為 DH' }}
                  </div>
                </div>

                <div
                  role="button"
                  tabindex="0"
                  data-testid="field-bench-zone"
                  class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition-all"
                  :class="getZoneClasses('預備', true)"
                  @dragover.prevent
                  @drop.prevent="handleZoneDrop('預備')"
                  @click="handleSlotTap('預備')"
                  @keydown.enter.prevent="handleSlotTap('預備')"
                  @keydown.space.prevent="handleSlotTap('預備')"
                >
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div class="text-xs font-black uppercase text-slate-500">Bench</div>
                      <div class="text-sm font-bold text-slate-800">替補 / 預備區</div>
                    </div>
                    <el-tag size="small" round effect="light" type="info">{{ benchPlayers.length }} 位</el-tag>
                  </div>

                  <div v-if="benchPlayers.length > 0" class="grid gap-2">
                    <div
                      v-for="player in benchPlayers"
                      :key="player.editorId"
                      class="rounded-2xl border border-white bg-white/80 px-3 py-2 shadow-sm transition-all"
                      :class="isSelected(player.editorId) ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/10' : 'border-slate-200'"
                      :data-testid="`field-bench-player-${player.editorId}`"
                      draggable="true"
                      @dragstart="handleDragStart(player.editorId, $event)"
                      @dragend="clearDragState"
                      @click.stop="toggleSelectedPlayer(player.editorId)"
                    >
                      <div class="flex items-center gap-2">
                        <div class="min-w-0 flex-1">
                          <div class="truncate font-black text-slate-900">{{ player.name }}</div>
                          <div class="text-xs font-mono text-slate-500">#{{ player.number || '--' }} ・ {{ player.order }}棒</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else class="rounded-xl border border-dashed border-slate-300 bg-white/80 px-3 py-6 text-center text-xs font-bold text-slate-400">
                    {{ selectedPlayer ? '點這裡移到替補區' : '拖到這裡改成替補' }}
                  </div>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div class="text-sm font-black text-slate-800">攻守名單排序</div>
                      <div class="text-xs text-slate-500">拖拉這份清單可直接調整棒次，守位與 DH/替補設定會同步保留。</div>
                    </div>
                    <el-tag round effect="light" type="success">{{ editorPlayers.length }} 位已顯示</el-tag>
                  </div>

                  <div class="grid gap-2">
                    <div
                      v-for="player in editorPlayers"
                      :key="player.editorId"
                      class="flex items-center gap-3 rounded-2xl border bg-slate-50 px-3 py-3 shadow-sm transition-all"
                      :class="[
                        isSelected(player.editorId) ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/15 bg-orange-50/30' : 'border-slate-200',
                        draggedOrderOverId === player.editorId ? 'border-dashed border-[var(--color-primary)] bg-orange-50/40' : ''
                      ]"
                      :data-testid="`field-order-item-${player.editorId}`"
                      @dragover.prevent="handleOrderDragOver(player.editorId)"
                      @drop.prevent="handleOrderDrop(player.editorId)"
                      @click="toggleSelectedPlayer(player.editorId)"
                    >
                      <button
                        type="button"
                        draggable="true"
                        class="match-field-editor__order-handle flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm"
                        @dragstart.stop="handleOrderDragStart(player.editorId, $event)"
                        @dragend.stop="clearOrderDragState"
                      >
                        <span class="text-lg leading-none">::</span>
                      </button>
                      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm">
                        {{ player.order }}
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-black text-slate-900">{{ player.name }}</div>
                        <div class="text-xs font-mono text-slate-500">
                          #{{ player.number || '--' }}<span v-if="player.remark"> ・ {{ player.remark }}</span>
                        </div>
                      </div>
                      <div class="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">
                        {{ formatPositionChip(player.position) }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
                  <div class="text-xs font-black uppercase text-slate-500">Touch Assist</div>
                  <div class="mt-1 text-sm font-bold text-slate-800">
                    {{ selectedPlayer ? `已選取 ${selectedPlayer.name}` : '平板可先點選球員，再點球場位置完成換守位' }}
                  </div>
                  <div class="mt-2 text-xs leading-5 text-slate-500">
                    拖到已有人守備的位置會自動互換；拖到 DH 或替補區時，不會改變原本棒次。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElTag } from 'element-plus'
import fieldBackdropUrl from '@/assets/match-field-backdrop.svg'
import type { LineupEntry } from '@/types/match'
import {
  FIELD_SLOT_LAYOUT,
  buildEditableFieldPlayers,
  buildFieldSlotMap,
  mergeEditablePlayersWithHiddenEntries,
  moveEditablePlayerToSlot,
  reorderEditablePlayers,
  type EditableFieldPlayer,
  type FieldSlotLayout,
  type HiddenLineupEntry,
  type LineupPositionKey,
  type PlayerMeta
} from '@/utils/matchFieldEditor'

defineOptions({
  name: 'MatchFieldEditor'
})

const props = withDefaults(defineProps<{
  lineup: LineupEntry[]
  playerMetaByName?: Record<string, PlayerMeta>
  title?: string
  readonly?: boolean
  showHeader?: boolean
  mobileEdgeToEdge?: boolean
}>(), {
  playerMetaByName: () => ({}),
  title: '守備球場編輯器',
  readonly: false,
  showHeader: true,
  mobileEdgeToEdge: false
})

const emit = defineEmits<{
  (event: 'update:lineup', lineup: LineupEntry[]): void
}>()

const HOVER_CAPABILITY_QUERY = '(hover: hover) and (pointer: fine)'
const drawerPanelId = `match-field-editor-drawer-panel-${Math.random().toString(36).slice(2, 10)}`

const resolveHoverCapability = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  return window.matchMedia(HOVER_CAPABILITY_QUERY).matches
}

const editorPlayers = ref<EditableFieldPlayer[]>([])
const hiddenEntries = ref<HiddenLineupEntry[]>([])
const selectedPlayerId = ref('')
const draggingPlayerId = ref('')
const draggedOrderPlayerId = ref('')
const draggedOrderOverId = ref('')
const supportsHoverPreview = ref(resolveHoverCapability())
const isDrawerPinnedOpen = ref(supportsHoverPreview.value)
const isDrawerPreviewOpen = ref(false)
const drawerShellRef = ref<HTMLElement | null>(null)
const fieldSlotMetaByKey = Object.fromEntries(FIELD_SLOT_LAYOUT.map((slot) => [slot.key, slot])) as Record<string, FieldSlotLayout>

let hoverCapabilityMediaQuery: MediaQueryList | null = null
let removeHoverCapabilityListener: (() => void) | null = null

const POSITION_CHIP_LABELS: Record<string, string> = {
  '1': 'P',
  '2': 'C',
  '3': '1B',
  '4': '2B',
  '5': '3B',
  '6': 'SS',
  '7': 'LF',
  '8': 'CF',
  '9': 'RF',
  DH: 'DH',
  預備: 'BENCH'
}

const fieldSlotMap = computed(() => buildFieldSlotMap(editorPlayers.value))
const dhPlayer = computed(() => editorPlayers.value.find((player) => player.position === 'DH') || null)
const benchPlayers = computed(() => editorPlayers.value.filter((player) => player.position === '預備'))
const selectedPlayer = computed(() => editorPlayers.value.find((player) => player.editorId === selectedPlayerId.value) || null)
const isReadonly = computed(() => props.readonly)
const showDrawer = computed(() => !isReadonly.value)
const isDrawerVisible = computed(() => showDrawer.value && (isDrawerPinnedOpen.value || isDrawerPreviewOpen.value))
const isDrawerDocked = computed(() => showDrawer.value && supportsHoverPreview.value && isDrawerPinnedOpen.value)
const isOverlayDrawer = computed(() => isDrawerVisible.value && !isDrawerDocked.value)
const showOverlayBackdrop = computed(() => showDrawer.value && !supportsHoverPreview.value && isDrawerPinnedOpen.value)
const showCollapsedBenchZone = computed(() => showDrawer.value && !isDrawerVisible.value)
const isFieldDragActive = computed(() => Boolean(draggingPlayerId.value))
const drawerState = computed(() => {
  if (isDrawerPinnedOpen.value) return 'pinned'
  if (isDrawerPreviewOpen.value) return 'preview'
  return 'collapsed'
})
const drawerHandleArrow = computed(() => (isDrawerVisible.value ? '>' : '<'))
const drawerHandleTitle = computed(() => {
  if (isDrawerPinnedOpen.value) return '收起攻守名單抽屜'
  return supportsHoverPreview.value ? '展開並固定攻守名單抽屜' : '展開攻守名單抽屜'
})
const drawerHelperText = computed(() => {
  if (selectedPlayer.value) {
    return `${selectedPlayer.value.name} 已選取，可直接拖曳或指派到守位、DH、替補區。`
  }

  return supportsHoverPreview.value
    ? '滑鼠移到右側把手可預覽，點一下可固定展開。'
    : '點右側把手可展開抽屜，操作完再收回讓球場保留最大視野。'
})

const syncEditorState = () => {
  const { editorPlayers: nextPlayers, hiddenEntries: nextHiddenEntries } = buildEditableFieldPlayers(
    props.lineup,
    props.playerMetaByName,
    editorPlayers.value
  )

  editorPlayers.value = nextPlayers
  hiddenEntries.value = nextHiddenEntries

  if (selectedPlayerId.value && !editorPlayers.value.some((player) => player.editorId === selectedPlayerId.value)) {
    selectedPlayerId.value = ''
  }
}

const syncHoverCapability = () => {
  supportsHoverPreview.value = resolveHoverCapability()
  if (!supportsHoverPreview.value) {
    isDrawerPreviewOpen.value = false
  }
}

watch(() => props.lineup, syncEditorState, { immediate: true, deep: true })
watch(() => props.playerMetaByName, syncEditorState, { deep: true })

const emitLineupUpdate = () => {
  emit('update:lineup', mergeEditablePlayersWithHiddenEntries(editorPlayers.value, hiddenEntries.value))
}

const formatFieldSlotLabel = (slot: FieldSlotLayout) => `${slot.key}號 ${slot.label}`

const formatPositionChip = (position: LineupPositionKey) => {
  const slotMeta = fieldSlotMetaByKey[position]
  if (slotMeta) return formatFieldSlotLabel(slotMeta)
  return POSITION_CHIP_LABELS[position] || POSITION_CHIP_LABELS.預備
}

const isSelected = (editorId: string) => selectedPlayerId.value === editorId

const clearSelection = () => {
  selectedPlayerId.value = ''
}

const clearDragState = () => {
  draggingPlayerId.value = ''
}

const clearOrderDragState = () => {
  draggedOrderPlayerId.value = ''
  draggedOrderOverId.value = ''
}

watch(isReadonly, (readonly) => {
  if (readonly) {
    selectedPlayerId.value = ''
    draggingPlayerId.value = ''
    draggedOrderPlayerId.value = ''
    draggedOrderOverId.value = ''
    isDrawerPinnedOpen.value = false
    isDrawerPreviewOpen.value = false
    return
  }

  isDrawerPinnedOpen.value = supportsHoverPreview.value
}, { immediate: true })

const openDrawerPreview = () => {
  if (!showDrawer.value) return
  if (!supportsHoverPreview.value || isDrawerPinnedOpen.value) return
  isDrawerPreviewOpen.value = true
}

const closeDrawerPreview = () => {
  if (isDrawerPinnedOpen.value) return
  isDrawerPreviewOpen.value = false
}

const openDrawerPinned = () => {
  if (!showDrawer.value) return
  isDrawerPinnedOpen.value = true
  isDrawerPreviewOpen.value = false
}

const closeDrawer = () => {
  isDrawerPinnedOpen.value = false
  isDrawerPreviewOpen.value = false
}

const toggleDrawerPin = () => {
  if (!showDrawer.value) return
  if (isDrawerPinnedOpen.value) {
    closeDrawer()
    return
  }

  openDrawerPinned()
}

const toggleSelectedPlayer = (editorId: string) => {
  if (isReadonly.value) return
  selectedPlayerId.value = isSelected(editorId) ? '' : editorId
}

const assignPlayerToSlot = (editorId: string, slotKey: string) => {
  if (isReadonly.value) return
  editorPlayers.value = moveEditablePlayerToSlot(editorPlayers.value, editorId, slotKey)
  emitLineupUpdate()
}

const handleSlotTap = (slotKey: string) => {
  if (isReadonly.value || !selectedPlayerId.value) return
  assignPlayerToSlot(selectedPlayerId.value, slotKey)
  selectedPlayerId.value = ''
}

const handleZoneDrop = (slotKey: string) => {
  if (isReadonly.value || !draggingPlayerId.value) return
  assignPlayerToSlot(draggingPlayerId.value, slotKey)
  clearDragState()
}

const handleDragStart = (editorId: string, event: DragEvent) => {
  if (isReadonly.value) return
  draggingPlayerId.value = editorId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', editorId)
  }
}

const applyOrderByIds = (orderedIds: string[]) => {
  if (isReadonly.value) return
  editorPlayers.value = reorderEditablePlayers(editorPlayers.value, orderedIds)
  emitLineupUpdate()
}

const handleOrderDragStart = (editorId: string, event: DragEvent) => {
  if (isReadonly.value) return
  draggedOrderPlayerId.value = editorId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', editorId)
  }
}

const handleOrderDragOver = (targetEditorId: string) => {
  if (isReadonly.value) return
  if (!draggedOrderPlayerId.value || draggedOrderPlayerId.value === targetEditorId) return
  draggedOrderOverId.value = targetEditorId
}

const handleOrderDrop = (targetEditorId: string) => {
  if (isReadonly.value) return
  const draggedId = draggedOrderPlayerId.value
  if (!draggedId || draggedId === targetEditorId) {
    clearOrderDragState()
    return
  }

  const orderedIds = editorPlayers.value.map((player) => player.editorId)
  const fromIndex = orderedIds.indexOf(draggedId)
  const targetIndex = orderedIds.indexOf(targetEditorId)

  if (fromIndex === -1 || targetIndex === -1) {
    clearOrderDragState()
    return
  }

  orderedIds.splice(fromIndex, 1)
  orderedIds.splice(targetIndex, 0, draggedId)
  applyOrderByIds(orderedIds)
  clearOrderDragState()
}

const handleDrawerShellEnter = () => {
  openDrawerPreview()
}

const handleDrawerShellLeave = (event: PointerEvent) => {
  if (!supportsHoverPreview.value || isDrawerPinnedOpen.value) return

  const nextTarget = event.relatedTarget as Node | null
  if (nextTarget && drawerShellRef.value?.contains(nextTarget)) return

  closeDrawerPreview()
}

const handleDrawerFocusIn = () => {
  if (!showDrawer.value) return
  if (!isDrawerPinnedOpen.value) {
    isDrawerPreviewOpen.value = true
  }
}

const handleDrawerFocusOut = () => {
  if (typeof window === 'undefined') return

  window.setTimeout(() => {
    if (isDrawerPinnedOpen.value) return
    if (!drawerShellRef.value?.contains(document.activeElement)) {
      closeDrawerPreview()
    }
  }, 0)
}

const handleDrawerEscape = () => {
  if (!showDrawer.value || !isDrawerVisible.value) return

  closeDrawer()
  drawerShellRef.value?.querySelector<HTMLElement>('[data-testid="field-drawer-handle"]')?.focus()
}

const getZoneClasses = (slotKey: string, isSpecial = false) => {
  const hasSelection = Boolean(selectedPlayerId.value)
  const isSelectedZone = slotKey === 'DH'
    ? dhPlayer.value?.editorId === selectedPlayerId.value
    : slotKey === '預備'
      ? selectedPlayer.value?.position === '預備'
      : fieldSlotMap.value[slotKey as keyof typeof fieldSlotMap.value]?.editorId === selectedPlayerId.value
  const hasPlayer = slotKey === 'DH'
    ? Boolean(dhPlayer.value)
    : slotKey === '預備'
      ? benchPlayers.value.length > 0
      : Boolean(fieldSlotMap.value[slotKey as keyof typeof fieldSlotMap.value])

  if (isSpecial) {
    if (isFieldDragActive.value) {
      return hasPlayer
        ? 'match-field-editor__drop-target--active border-dashed border-orange-300/80 bg-orange-50/70 ring-2 ring-orange-300/20'
        : 'match-field-editor__drop-target--active border-dashed border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/12 bg-orange-50/45'
    }

    if (isSelectedZone) {
      return 'border-sky-400 bg-sky-50 ring-2 ring-sky-400/35'
    }

    return hasPlayer
      ? 'border-slate-200 bg-white'
      : hasSelection
        ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/12 bg-orange-50/40'
        : 'border-slate-200 bg-white/80'
  }

  if (isFieldDragActive.value) {
    return hasPlayer
      ? 'match-field-editor__drop-target--active border-dashed border-amber-300/80 bg-slate-950/62 ring-2 ring-amber-300/20'
      : 'match-field-editor__drop-target--active border-dashed border-[#f59e0b]/70 bg-[#f59e0b]/12 ring-2 ring-[#f59e0b]/22'
  }

  if (isSelectedZone) {
    return 'border-sky-300 bg-slate-950/65 ring-2 ring-sky-300/45'
  }

  return hasPlayer
    ? 'border-white/12 bg-slate-950/55'
    : hasSelection
      ? 'border-[#f59e0b]/60 bg-[#f59e0b]/10 ring-2 ring-[#f59e0b]/20'
      : 'border-white/10 bg-slate-950/35'
}

const applyOrderByIdsForTest = (orderedIds: string[]) => {
  applyOrderByIds(orderedIds)
}

onMounted(() => {
  syncHoverCapability()

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }

  hoverCapabilityMediaQuery = window.matchMedia(HOVER_CAPABILITY_QUERY)
  const listener = () => syncHoverCapability()

  if (typeof hoverCapabilityMediaQuery.addEventListener === 'function') {
    hoverCapabilityMediaQuery.addEventListener('change', listener)
    removeHoverCapabilityListener = () => hoverCapabilityMediaQuery?.removeEventListener('change', listener)
    return
  }

  hoverCapabilityMediaQuery.addListener(listener)
  removeHoverCapabilityListener = () => hoverCapabilityMediaQuery?.removeListener(listener)
})

onBeforeUnmount(() => {
  removeHoverCapabilityListener?.()
})

defineExpose({
  editorPlayers,
  selectedPlayerId,
  supportsHoverPreview,
  isDrawerPinnedOpen,
  isDrawerPreviewOpen,
  isDrawerVisible,
  movePlayerToSlotForTest: assignPlayerToSlot,
  applyOrderByIdsForTest,
  openDrawerPreviewForTest: openDrawerPreview,
  closeDrawerPreviewForTest: closeDrawerPreview,
  toggleDrawerPinForTest: toggleDrawerPin
})
</script>

<style scoped>
.match-field-editor__surface {
  border-radius: 28px;
  border: 1px solid rgb(226, 232, 240);
  background: white;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.08);
}

.match-field-editor__slot {
  width: 110px;
}

@media (min-width: 640px) {
  .match-field-editor__slot {
    width: 114px;
  }
}

.match-field-editor__workspace {
  --drawer-width: min(340px, calc(100% - 2.5rem));
  --drawer-handle-width: 2rem;
  position: relative;
  display: grid;
  gap: 1rem;
  align-items: stretch;
  min-width: 0;
}

.match-field-editor__workspace.is-drawer-docked {
  grid-template-columns: minmax(0, 1fr) minmax(0, 340px);
}

.match-field-editor__field-panel {
  min-width: 0;
  position: relative;
  z-index: 1;
}

.match-field-editor__drawer-shell {
  position: absolute;
  inset: 0 0 0 auto;
  width: var(--drawer-handle-width);
  z-index: 4;
  display: flex;
  justify-content: flex-end;
  transition: width 0.24s ease;
}

.match-field-editor__drawer-shell.is-open {
  width: calc(var(--drawer-width) + var(--drawer-handle-width));
}

.match-field-editor__workspace.is-drawer-docked .match-field-editor__drawer-shell {
  position: relative;
  inset: auto;
  width: 100%;
  overflow: visible;
}

.match-field-editor__drawer-backdrop {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: 0;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.22));
  border-radius: 1.75rem;
}

.match-field-editor__drawer-handle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: var(--drawer-handle-width);
  min-height: 9rem;
  padding: 0.75rem 0.35rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.94));
  color: rgb(51, 65, 85);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.16);
  transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
  touch-action: manipulation;
}

.match-field-editor__workspace.is-drawer-docked .match-field-editor__drawer-handle {
  left: calc(var(--drawer-handle-width) * -0.76);
}

.match-field-editor__drawer-handle:hover,
.match-field-editor__drawer-handle:focus-visible {
  transform: translateY(-50%) translateX(-2px);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.98), rgba(254, 243, 199, 0.94));
  box-shadow: 0 22px 42px rgba(217, 144, 38, 0.24);
  outline: none;
}

.match-field-editor__drawer-handle-arrow {
  font-size: 1.1rem;
  font-weight: 900;
  line-height: 1;
}

.match-field-editor__drawer-handle-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0;
  font-size: 0.74rem;
  font-weight: 900;
}

.match-field-editor__drawer-handle-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.2rem;
  border-radius: 9999px;
  background: rgba(217, 144, 38, 0.16);
  color: rgb(146, 64, 14);
  font-size: 0.7rem;
  font-weight: 900;
}

.match-field-editor__drawer-panel {
  position: absolute;
  inset: 0 0 0 auto;
  width: var(--drawer-width);
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 1.75rem;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  box-shadow: 0 26px 60px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.match-field-editor__workspace.is-drawer-docked .match-field-editor__drawer-panel {
  position: relative;
  inset: auto;
  width: 100%;
  min-height: 100%;
}

.match-field-editor__drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.72), rgba(255, 255, 255, 0));
}

.match-field-editor__drawer-close {
  flex-shrink: 0;
}

.match-field-editor__drawer-scroll {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  overflow-y: auto;
  min-height: 0;
}

.match-field-editor__turf {
  background:
    radial-gradient(circle at 50% 22%, rgba(34, 197, 94, 0.22), transparent 30%),
    radial-gradient(circle at 50% 90%, rgba(4, 47, 46, 0.42), transparent 28%),
    linear-gradient(180deg, #1f8f4c 0%, #1a7d43 42%, #156739 100%);
}

.match-field-editor__slot-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 251, 235, 0.92);
  font-size: 0.75rem;
  font-weight: 900;
  line-height: 1;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.match-field-editor__drop-target--active {
  position: relative;
}

.match-field-editor__drop-target--active::after {
  content: '';
  position: absolute;
  inset: 0.35rem;
  border: 1.5px dashed rgba(251, 191, 36, 0.68);
  border-radius: 1rem;
  pointer-events: none;
}

@media (max-width: 639px) {
  .match-field-editor__surface--mobile-edge {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    margin-inline: 0;
  }

  .match-field-editor__workspace {
    --drawer-width: min(310px, calc(100% - 2rem));
  }

  .match-field-editor__field-panel {
    padding: 0.55rem;
    border-radius: 1.55rem;
  }

  .match-field-editor__surface--mobile-edge .match-field-editor__field-panel {
    padding: 0;
    border-color: transparent;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .match-field-editor__turf {
    border-radius: 1.3rem;
  }

  .match-field-editor__surface--mobile-edge .match-field-editor__turf {
    max-width: none;
    border-inline: 0;
    border-radius: 0;
  }

  .match-field-editor__slot {
    width: 92px;
  }

  .match-field-editor__slot-card {
    border-radius: 18px;
    padding: 0.5rem 0.55rem 0.55rem;
    box-shadow: 0 12px 24px rgba(2, 8, 13, 0.24);
  }

  .match-field-editor__slot-header {
    margin-bottom: 0.35rem;
    gap: 0.35rem;
  }

  .match-field-editor__slot-short {
    font-size: 0.5rem;
  }

  .match-field-editor__slot-label {
    margin-top: 0.1rem;
    font-size: 0.65rem;
    line-height: 1.1;
  }

  .match-field-editor__slot-badge {
    min-width: 1.45rem;
    height: 1.45rem;
    font-size: 0.68rem;
  }

  .match-field-editor__slot-player-row,
  .match-field-editor__slot-player-button {
    gap: 0.35rem;
    align-items: flex-start;
  }

  .match-field-editor__slot-player-name {
    font-size: 0.84rem;
    line-height: 1.05;
  }

  .match-field-editor__slot-player-subline {
    font-size: 0.62rem;
    line-height: 1.12;
  }

  .match-field-editor__slot-empty {
    padding: 0.55rem 0.35rem;
    font-size: 0.64rem;
    line-height: 1.15;
  }

  .match-field-editor__drawer-handle {
    min-height: 8rem;
  }
}
</style>
