<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  src?: string | null
  alt?: string
  fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
  previewSrcList?: string[]
  lazy?: boolean
}>(), {
  src: null,
  alt: '照片',
  fit: 'cover',
  previewSrcList: undefined,
  lazy: false
})

const previewSources = computed(() => {
  if (props.previewSrcList?.length) return props.previewSrcList
  return props.src ? [props.src] : []
})
</script>

<template>
  <el-image
    v-if="src"
    :src="src"
    :alt="alt"
    :fit="fit"
    :lazy="lazy"
    :preview-src-list="previewSources"
    :preview-teleported="true"
    hide-on-click-modal
    class="previewable-image"
    @click.stop
  />
</template>

<style scoped>
.previewable-image {
  display: block;
  cursor: zoom-in;
}

.previewable-image :deep(.el-image__inner),
.previewable-image :deep(.el-image__error),
.previewable-image :deep(.el-image__placeholder) {
  width: 100%;
  height: 100%;
}

.previewable-image :deep(.el-image__inner) {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
