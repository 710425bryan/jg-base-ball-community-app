<template>
  <el-dialog
    v-model="dialogVisible"
    title="聯絡我們 / 加入球隊"
    width="90%"
    style="max-width: 640px; border-radius: 16px;"
    class="custom-dialog"
  >
    <p class="mb-5 text-sm leading-relaxed text-slate-600">
      歡迎對棒球有熱誠的孩子加入我們！請掃描下方任一 QR Code，或點擊「開啟 LINE」加入好友，再傳訊息預約體驗。
    </p>

    <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
      <figure
        v-for="contact in lineContacts"
        :key="contact.url"
        class="mx-auto w-full max-w-[280px] rounded-2xl border border-slate-200 bg-white p-4 text-center"
      >
        <figcaption class="font-bold text-slate-800">{{ contact.label }}</figcaption>
        <div class="bg-white p-5">
          <div class="line-qr-viewport">
            <img
              :src="contact.image"
              :alt="`${contact.label} 加好友 QR Code`"
              :width="contact.width"
              :height="contact.height"
              class="line-qr-image"
              :class="{ 'line-qr-image--screenshot': contact.isScreenshot }"
            />
          </div>
        </div>
        <a
          :href="contact.url"
          :aria-label="`開啟 LINE：${contact.label}`"
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 transition-colors hover:border-primary hover:text-primary active:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          開啟 LINE
        </a>
      </figure>
    </div>

    <template #footer>
      <div class="app-dialog-footer">
        <div class="app-dialog-footer-actions app-dialog-footer-actions--single">
          <button
            type="button"
            class="app-dialog-footer-button bg-primary py-2 text-white transition-colors hover:bg-primary-hover active:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            @click="dialogVisible = false"
          >
            關閉
          </button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import firstLineQr from '@/assets/line-contact/contact-1.jpg'
import secondLineQr from '@/assets/line-contact/contact-2.png'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

// Links decoded from the supplied QR codes; contact names confirmed by the user.
const lineContacts = [
  { label: 'LINE 聯絡窗口 1｜劉爸', image: firstLineQr, url: 'https://line.me/ti/p/UaQT4myIvS', width: 900, height: 900, isScreenshot: false },
  { label: 'LINE 聯絡窗口 2｜秀媽', image: secondLineQr, url: 'https://line.me/ti/p/xdXQGLddCW', width: 1320, height: 1746, isScreenshot: true }
]
</script>

<style scoped>
.line-qr-viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
}

.line-qr-image {
  display: block;
  width: 100%;
  height: auto;
}

/* Show only (375, 277, 571, 571) of the 1320 × 1746 screenshot.
   Preserve the original QR pixels; exclude the outer frame and all LINE controls.
   The surrounding white padding provides a clear scan margin for both images. */
.line-qr-image--screenshot {
  position: absolute;
  max-width: none;
  width: 231.173380%;
  left: -65.674256%;
  top: -48.511384%;
}
</style>
