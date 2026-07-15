<script setup lang="ts">
withDefaults(defineProps<{
  cancelLabel?: string
  confirmLabel?: string
  showCancel?: boolean
  loading?: boolean
  confirmDisabled?: boolean
  confirmDataTest?: string
  danger?: boolean
}>(), {
  cancelLabel: '取消',
  confirmLabel: '確認',
  showCancel: true,
  loading: false,
  confirmDisabled: false,
  danger: false
})

defineEmits<{
  (event: 'cancel'): void
  (event: 'confirm'): void
}>()
</script>

<template>
  <div class="app-dialog-footer">
    <div v-if="$slots.leading" class="app-dialog-footer-leading">
      <slot name="leading" />
    </div>

    <div class="app-dialog-footer-actions" :class="{ 'app-dialog-footer-actions--single': !showCancel }">
      <el-button v-if="showCancel" class="app-dialog-footer-button" @click="$emit('cancel')">
        {{ cancelLabel }}
      </el-button>
      <el-button
        class="app-dialog-footer-button"
        :data-test="confirmDataTest"
        :type="danger ? 'danger' : 'primary'"
        :loading="loading"
        :disabled="confirmDisabled"
        @click="$emit('confirm')"
      >
        {{ confirmLabel }}
      </el-button>
    </div>
  </div>
</template>
