<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerIdentityOption } from '@/types/playerIdentity'
import { getPlayerIdentityError, normalizePlayerIdentity } from '@/utils/playerIdentity'

const props = defineProps<{ modelValue: string; options: PlayerIdentityOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const error = computed(() => getPlayerIdentityError(props.modelValue))
</script>

<template>
  <div class="w-full min-w-0" role="group" aria-label="身分" aria-describedby="player-identity-hint" :aria-invalid="!!error">
    <el-select
      :model-value="modelValue"
      class="players-identity-select w-full"
      popper-class="players-identity-select-popper"
      filterable
      allow-create
      default-first-option
      placeholder="選擇或輸入身分"
      aria-label="身分"
      :title="options.find(option => option.value === modelValue)?.label || modelValue"
      @update:model-value="emit('update:modelValue', normalizePlayerIdentity($event))"
    >
      <el-option v-for="option in options" :key="option.value" :label="option.label" :value="option.value" />
    </el-select>
    <p id="player-identity-hint" class="mt-1 text-xs font-normal leading-5 text-slate-500">
      可輸入球隊名稱（例如：新太陽社區棒球隊），最多 60 字。輸入後請選取新選項；儲存球員後會保留在選單中。自訂身分沿用社區球員規則，收費依下方設定。
    </p>
  </div>
</template>

<style>
.players-identity-select .el-select__selected-item,
.players-identity-select .el-select__placeholder,
.players-identity-select .el-select__input {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

.players-identity-select-popper .el-select-dropdown__item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 40px;
  height: auto;
  line-height: 1.4;
  padding: 8px 12px;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}

.players-identity-select-popper .el-select-dropdown__item span {
  width: 100%;
  text-align: left;
}


.players-identity-select .el-select__wrapper {
  min-height: 44px;
}
</style>
