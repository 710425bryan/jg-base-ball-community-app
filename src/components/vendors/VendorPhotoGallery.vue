<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Picture } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  photos?: string[]
  alt?: string
  showControls?: boolean
}>(), {
  photos: () => [],
  alt: '廠商照片',
  showControls: true
})

const activeIndex = ref(0)

const validPhotos = computed(() => props.photos.filter(Boolean))
const activePhoto = computed(() => validPhotos.value[activeIndex.value] || '')
const hasMultiplePhotos = computed(() => validPhotos.value.length > 1)

const goPrevious = () => {
  if (!hasMultiplePhotos.value) return
  activeIndex.value = (activeIndex.value - 1 + validPhotos.value.length) % validPhotos.value.length
}

const goNext = () => {
  if (!hasMultiplePhotos.value) return
  activeIndex.value = (activeIndex.value + 1) % validPhotos.value.length
}

watch(validPhotos, (photos) => {
  if (activeIndex.value >= photos.length) {
    activeIndex.value = 0
  }
})
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl bg-gray-100">
    <el-image
      v-if="activePhoto"
      :src="activePhoto"
      :alt="alt"
      :preview-src-list="validPhotos"
      :initial-index="activeIndex"
      fit="cover"
      class="vendor-photo-image h-full w-full cursor-zoom-in"
      preview-teleported
      hide-on-click-modal
    />
    <div v-else class="flex h-full w-full items-center justify-center text-gray-300">
      <el-icon class="text-4xl"><Picture /></el-icon>
    </div>

    <template v-if="showControls && hasMultiplePhotos">
      <button
        type="button"
        class="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-primary"
        aria-label="上一張廠商照片"
        @click.stop="goPrevious"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <button
        type="button"
        class="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-primary"
        aria-label="下一張廠商照片"
        @click.stop="goNext"
      >
        <el-icon><ArrowRight /></el-icon>
      </button>
      <div class="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-1 text-xs font-bold text-white">
        {{ activeIndex + 1 }} / {{ validPhotos.length }}
      </div>
    </template>
  </div>
</template>

<style scoped>
:deep(.vendor-photo-image .el-image__inner) {
  height: 100%;
  width: 100%;
}
</style>
