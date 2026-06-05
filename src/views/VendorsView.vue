<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Edit,
  Filter,
  Link,
  Location,
  OfficeBuilding,
  Phone,
  Picture,
  Plus,
  Refresh
} from '@element-plus/icons-vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import VendorFormDialog from '@/components/vendors/VendorFormDialog.vue'
import VendorPhotoGallery from '@/components/vendors/VendorPhotoGallery.vue'
import { usePermissionsStore } from '@/stores/permissions'
import { useVendorsStore } from '@/stores/vendors'
import type { Vendor } from '@/types/vendor'
import { normalizeExternalUrl } from '@/utils/externalUrl'
import {
  ALL_VENDOR_CATEGORIES,
  filterVendors,
  groupVendorsByCategory
} from '@/utils/vendors'

const vendorsStore = useVendorsStore()
const permissionsStore = usePermissionsStore()

const searchKeyword = ref('')
const selectedCategory = ref(ALL_VENDOR_CATEGORIES)
const viewMode = ref<'grid' | 'table'>('table')
const isMobileFiltersOpen = ref(false)
const isFormDialogOpen = ref(false)
const editingVendor = ref<Vendor | null>(null)

const canCreate = computed(() => permissionsStore.can('vendors', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('vendors', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('vendors', 'DELETE'))

const categoryOptions = computed(() => {
  const names = [
    ...vendorsStore.categories.map((category) => category.name),
    ...vendorsStore.vendors.map((vendor) => vendor.trade_category)
  ].map((value) => value.trim()).filter(Boolean)

  return [ALL_VENDOR_CATEGORIES, ...new Set(names)]
})

const filteredVendors = computed(() =>
  filterVendors(vendorsStore.vendors, {
    keyword: searchKeyword.value,
    category: selectedCategory.value
  })
)
const groupedVendors = computed(() => groupVendorsByCategory(filteredVendors.value))
const hasActiveFilters = computed(() =>
  searchKeyword.value.trim().length > 0 || selectedCategory.value !== ALL_VENDOR_CATEGORIES
)
const mobileFilterLabel = computed(() =>
  selectedCategory.value === ALL_VENDOR_CATEGORIES ? '篩選' : selectedCategory.value
)
const summary = computed(() => ({
  total: vendorsStore.vendors.length,
  categories: categoryOptions.value.length - 1,
  withPhotos: vendorsStore.vendors.filter((vendor) => vendor.image_paths.length > 0).length
}))

const clearFilters = () => {
  searchKeyword.value = ''
  selectedCategory.value = ALL_VENDOR_CATEGORIES
  isMobileFiltersOpen.value = false
}

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

const openCreateDialog = () => {
  editingVendor.value = null
  isFormDialogOpen.value = true
}

const openEditDialog = (vendor: Vendor) => {
  editingVendor.value = vendor
  isFormDialogOpen.value = true
}

const removeVendor = async (vendor: Vendor) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${vendor.name}」嗎？`,
      '刪除廠商',
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await vendorsStore.removeVendor(vendor)
    ElMessage.success('已刪除廠商')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除廠商失敗')
    }
  }
}

const refresh = async () => {
  try {
    await vendorsStore.loadVendors()
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入廠商資料')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-3 py-3 md:px-6 md:py-4 border-b border-gray-200 shadow-sm shrink-0 z-10">
      <div class="max-w-7xl mx-auto flex flex-col gap-3 md:gap-4">
        <AppPageHeader
          title="廠商名單"
          subtitle="管理採購合作廠商、交易類別與聯絡資訊"
          :icon="OfficeBuilding"
          as="h2"
        >
          <template #actions>
            <button
              type="button"
              class="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-70 md:w-auto md:px-4"
              :disabled="vendorsStore.isLoading"
              title="重新整理"
              @click="refresh"
            >
              <el-icon :class="{ 'is-loading': vendorsStore.isLoading }"><Refresh /></el-icon>
              <span class="hidden md:inline">重新整理</span>
            </button>
            <button
              v-if="canCreate"
              type="button"
              class="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover md:px-5"
              @click="openCreateDialog"
            >
              <el-icon><Plus /></el-icon>
              <span class="md:hidden">新增</span>
              <span class="hidden md:inline">新增廠商</span>
            </button>
          </template>
        </AppPageHeader>

        <div class="grid grid-cols-3 gap-1.5 md:gap-3">
          <section class="rounded-xl border border-primary/15 bg-primary/5 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-primary/70 md:text-[11px]">廠商</p>
            <p class="mt-0.5 text-lg font-black text-primary md:mt-2 md:text-2xl">{{ summary.total }}</p>
          </section>
          <section class="rounded-xl border border-sky-100 bg-sky-50 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-sky-700 md:text-[11px]">交易類別</p>
            <p class="mt-0.5 text-lg font-black text-sky-800 md:mt-2 md:text-2xl">{{ summary.categories }}</p>
          </section>
          <section class="rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-emerald-700 md:text-[11px]">有照片</p>
            <p class="mt-0.5 text-lg font-black text-emerald-700 md:mt-2 md:text-2xl">{{ summary.withPhotos }}</p>
          </section>
        </div>

        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex gap-2 md:grid md:grid-cols-[minmax(0,1fr)_220px] lg:min-w-[560px]">
            <el-input v-model="searchKeyword" size="large" clearable placeholder="搜尋廠商、類別、聯絡人、電話或地址" />
            <button
              type="button"
              class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3 text-sm font-bold transition-colors md:hidden"
              :class="hasActiveFilters ? 'border-primary/30 bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-600'"
              @click="isMobileFiltersOpen = !isMobileFiltersOpen"
            >
              <el-icon><Filter /></el-icon>
              <span class="max-w-[4.5rem] truncate">{{ mobileFilterLabel }}</span>
            </button>
            <el-select v-model="selectedCategory" size="large" class="hidden w-full md:block">
              <el-option
                v-for="category in categoryOptions"
                :key="category"
                :label="category === ALL_VENDOR_CATEGORIES ? '全部類別' : category"
                :value="category"
              />
            </el-select>
          </div>

          <ViewModeSwitch v-model="viewMode" grid-label="卡片" table-label="表格" class="hidden md:inline-flex" />

          <div class="flex items-center justify-between text-xs font-bold text-gray-400 md:hidden">
            <span>顯示 {{ filteredVendors.length }} / {{ summary.total }}</span>
            <button v-if="hasActiveFilters" type="button" class="text-primary" @click="clearFilters">清除篩選</button>
          </div>

          <div
            v-show="isMobileFiltersOpen"
            class="grid gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-2 md:hidden"
          >
            <el-select v-model="selectedCategory" size="large" class="w-full" @change="isMobileFiltersOpen = false">
              <el-option
                v-for="category in categoryOptions"
                :key="category"
                :label="category === ALL_VENDOR_CATEGORIES ? '全部類別' : category"
                :value="category"
              />
            </el-select>
            <div class="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
              <span class="text-xs font-bold text-gray-400">顯示模式</span>
              <ViewModeSwitch v-model="viewMode" grid-label="卡片" table-label="表格" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-3 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div class="max-w-7xl mx-auto">
        <AppLoadingState v-if="vendorsStore.isLoading" text="廠商資料載入中..." />

        <section v-else-if="filteredVendors.length === 0" class="rounded-lg border border-gray-100 bg-white p-10 text-center shadow-sm">
          <el-icon class="text-6xl text-gray-200"><OfficeBuilding /></el-icon>
          <h3 class="mt-4 text-lg font-black text-slate-800">沒有符合條件的廠商</h3>
          <p class="mt-2 text-sm text-gray-400">調整搜尋條件，或新增第一筆廠商資料。</p>
        </section>

        <div v-else class="space-y-6">
          <section
            v-for="group in groupedVendors"
            :key="group.category"
            class="space-y-3"
          >
            <div class="flex items-center justify-between gap-3 px-1">
              <div class="min-w-0">
                <h3 class="text-base font-black text-slate-800">{{ group.category }}</h3>
                <p class="mt-0.5 text-xs font-bold text-gray-400">{{ group.vendors.length }} 筆廠商</p>
              </div>
            </div>

            <div v-if="viewMode === 'grid'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article
                v-for="vendor in group.vendors"
                :key="vendor.id"
                class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
              >
                <VendorPhotoGallery
                  :photos="vendor.image_urls"
                  :alt="vendor.name"
                  class="aspect-[16/9] w-full"
                />

                <div class="p-5">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <h4 class="truncate text-lg font-black text-slate-800">{{ vendor.name }}</h4>
                      <p class="mt-1 text-xs font-bold text-gray-400">{{ vendor.trade_category }}</p>
                    </div>
                    <span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      {{ vendor.image_paths.length }} 張
                    </span>
                  </div>

                  <div class="mt-4 space-y-2 text-sm font-bold text-gray-500">
                    <div v-if="vendor.contact_name || vendor.phone" class="flex items-center gap-2">
                      <el-icon class="text-gray-300"><Phone /></el-icon>
                      <span class="min-w-0 break-words">{{ vendor.contact_name || '未填聯絡人' }}{{ vendor.phone ? `｜${vendor.phone}` : '' }}</span>
                    </div>
                    <div v-if="vendor.address" class="flex items-start gap-2">
                      <el-icon class="mt-0.5 text-gray-300"><Location /></el-icon>
                      <span class="min-w-0 break-words">{{ vendor.address }}</span>
                    </div>
                    <div v-if="vendor.purchase_price_note" class="rounded-2xl bg-amber-50 px-3 py-2 text-amber-700">
                      {{ vendor.purchase_price_note }}
                    </div>
                  </div>

                  <div class="mt-5 flex flex-wrap gap-2">
                    <a
                      v-if="normalizeExternalUrl(vendor.website_url)"
                      :href="normalizeExternalUrl(vendor.website_url)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      <el-icon><Link /></el-icon>
                      官網
                    </a>
                    <button
                      v-if="canEdit"
                      type="button"
                      class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary"
                      @click="openEditDialog(vendor)"
                    >
                      編輯
                    </button>
                    <button
                      v-if="canDelete"
                      type="button"
                      class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-100"
                      @click="removeVendor(vendor)"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <section v-else class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[920px] text-left md:min-w-[980px]">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50 text-sm text-gray-500">
                      <th class="sticky left-0 z-20 w-[168px] min-w-[168px] max-w-[168px] bg-gray-50 px-3 py-3 font-bold shadow-[6px_0_14px_-14px_rgba(15,23,42,0.45)] md:w-[280px] md:min-w-[280px] md:max-w-[280px] md:px-5">廠商</th>
                      <th class="px-5 py-3 font-bold">聯絡資訊</th>
                      <th class="px-5 py-3 font-bold">採購價</th>
                      <th class="px-5 py-3 font-bold">地址 / 官網</th>
                      <th class="px-5 py-3 font-bold">照片</th>
                      <th class="px-5 py-3 font-bold">更新</th>
                      <th class="px-5 py-3 font-bold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="vendor in group.vendors" :key="vendor.id" class="group hover:bg-gray-50/60">
                      <td class="sticky left-0 z-10 w-[168px] min-w-[168px] max-w-[168px] bg-white px-3 py-4 shadow-[6px_0_14px_-14px_rgba(15,23,42,0.45)] transition-colors group-hover:bg-gray-50 md:w-[280px] md:min-w-[280px] md:max-w-[280px] md:px-5">
                        <div class="flex items-center gap-2 md:gap-3">
                          <div class="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-gray-100 md:h-12 md:w-12 md:rounded-2xl">
                            <VendorPhotoGallery
                              :photos="vendor.image_urls"
                              :alt="vendor.name"
                              :show-controls="false"
                              class="h-full w-full"
                            />
                          </div>
                          <div class="min-w-0">
                            <div class="truncate font-black text-slate-800">{{ vendor.name }}</div>
                            <div class="mt-1 truncate text-xs font-bold text-gray-400">{{ vendor.trade_category }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="px-5 py-4 text-sm font-bold text-gray-600">
                        <div>{{ vendor.contact_name || '-' }}</div>
                        <div class="mt-1 text-xs text-gray-400">{{ vendor.phone || '-' }}</div>
                      </td>
                      <td class="px-5 py-4 text-sm font-bold text-amber-700">{{ vendor.purchase_price_note || '-' }}</td>
                      <td class="px-5 py-4 text-sm font-bold text-gray-600">
                        <div class="max-w-[18rem] break-words">{{ vendor.address || '-' }}</div>
                        <a
                          v-if="normalizeExternalUrl(vendor.website_url)"
                          :href="normalizeExternalUrl(vendor.website_url)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700"
                        >
                          <el-icon><Link /></el-icon>
                          官網
                        </a>
                      </td>
                      <td class="px-5 py-4 text-sm font-bold text-gray-500">
                        <span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1">
                          <el-icon><Picture /></el-icon>
                          {{ vendor.image_paths.length }}
                        </span>
                      </td>
                      <td class="px-5 py-4 text-sm font-bold text-gray-500">{{ formatDate(vendor.updated_at) }}</td>
                      <td class="px-5 py-4">
                        <div class="flex justify-end gap-2">
                          <button
                            v-if="canEdit"
                            type="button"
                            class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary"
                            title="編輯"
                            @click="openEditDialog(vendor)"
                          >
                            <el-icon><Edit /></el-icon>
                          </button>
                          <button
                            v-if="canDelete"
                            type="button"
                            class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-100"
                            title="刪除"
                            @click="removeVendor(vendor)"
                          >
                            <el-icon><Delete /></el-icon>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      </div>
    </div>

    <VendorFormDialog
      v-model="isFormDialogOpen"
      :vendor="editingVendor"
      :categories="vendorsStore.categories"
      @saved="refresh"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
