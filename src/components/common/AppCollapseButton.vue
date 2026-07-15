<script setup lang="ts">
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'

const props = defineProps<{
  expanded: boolean
  controls: string
  label: string
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    type="button"
    class="inline-flex min-h-11 items-center justify-center gap-1.5 transition-colors"
    :aria-controls="controls"
    :aria-expanded="expanded"
    :aria-label="`${expanded ? '收合' : '展開'}${props.label}`"
    @click="$emit('toggle')"
  >
    <el-icon>
      <ArrowDown v-if="expanded" />
      <ArrowRight v-else />
    </el-icon>
    {{ expanded ? '收合' : '展開' }}
  </button>
</template>
