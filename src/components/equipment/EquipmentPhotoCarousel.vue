<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import PreviewableImage from '@/components/common/PreviewableImage.vue'

const props = withDefaults(defineProps<{
  photos?: Array<string | null | undefined>
  alt?: string
  fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
  lazy?: boolean
  preview?: boolean
  showCounter?: boolean
  showControls?: boolean
}>(), {
  photos: () => [],
  alt: '照片',
  fit: 'cover',
  lazy: false,
  preview: true,
  showCounter: true,
  showControls: true
})

const currentIndex = ref(0)
const touchStartX = ref(0)
const touchStartY = ref(0)

const photoUrls = computed(() =>
  (props.photos || [])
    .map((photo) => String(photo || '').trim())
    .filter(Boolean)
)

const currentPhoto = computed(() => photoUrls.value[currentIndex.value] || '')
const hasMultiplePhotos = computed(() => photoUrls.value.length > 1)

const setIndex = (nextIndex: number) => {
  const count = photoUrls.value.length
  if (count === 0) {
    currentIndex.value = 0
    return
  }

  currentIndex.value = (nextIndex + count) % count
}

const previous = () => setIndex(currentIndex.value - 1)
const next = () => setIndex(currentIndex.value + 1)

const handleTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0]
  if (!touch) return
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
}

const handleTouchEnd = (event: TouchEvent) => {
  if (!hasMultiplePhotos.value) return

  const touch = event.changedTouches[0]
  if (!touch) return

  const diffX = touch.clientX - touchStartX.value
  const diffY = touch.clientY - touchStartY.value

  if (Math.abs(diffX) < 36 || Math.abs(diffX) < Math.abs(diffY)) return
  if (diffX > 0) previous()
  else next()
}

watch(photoUrls, (photos) => {
  if (currentIndex.value >= photos.length) currentIndex.value = 0
})
</script>

<template>
  <div
    v-if="photoUrls.length > 0"
    class="equipment-photo-carousel relative overflow-hidden"
    @click.stop
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
  >
    <PreviewableImage
      v-if="preview"
      :src="currentPhoto"
      :alt="alt"
      :fit="fit"
      :lazy="lazy"
      :preview-src-list="photoUrls"
      class="h-full w-full"
    />
    <img
      v-else
      :src="currentPhoto"
      :alt="alt"
      class="h-full w-full select-none object-cover"
      draggable="false"
    />

    <template v-if="hasMultiplePhotos && showControls">
      <button
        type="button"
        class="absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur transition-colors hover:bg-black/60"
        title="上一張"
        @click.stop="previous"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <button
        type="button"
        class="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur transition-colors hover:bg-black/60"
        title="下一張"
        @click.stop="next"
      >
        <el-icon><ArrowRight /></el-icon>
      </button>
    </template>
    <div
      v-if="hasMultiplePhotos && showCounter"
      class="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-black text-white shadow-sm backdrop-blur"
    >
      {{ currentIndex + 1 }} / {{ photoUrls.length }}
    </div>
  </div>
  <slot v-else name="fallback" />
</template>

<style scoped>
.equipment-photo-carousel {
  touch-action: pan-y;
}
</style>
