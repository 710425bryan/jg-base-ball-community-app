import {
  BASEBALL_ABILITY_FEATURE,
  PHYSICAL_TESTS_FEATURE,
  type PerformanceMetricDefinition,
  type PerformanceRecordKind
} from '@/types/performance'

export type PerformanceModuleConfig = {
  kind: PerformanceRecordKind
  feature: PerformanceRecordKind
  routeBase: string
  title: string
  shortTitle: string
  description: string
  addButtonLabel: string
  emptyTitle: string
  primaryMetric: string
  primaryMetricLabel: string
  primaryMetricUnit?: string
  metrics: PerformanceMetricDefinition[]
}

export const performanceConfigs: Record<PerformanceRecordKind, PerformanceModuleConfig> = {
  [BASEBALL_ABILITY_FEATURE]: {
    kind: BASEBALL_ABILITY_FEATURE,
    feature: BASEBALL_ABILITY_FEATURE,
    routeBase: '/baseball-ability',
    title: '棒球能力數據',
    shortTitle: '棒球能力',
    description: '記錄跑壘、球速、擊球初速與傳接球測驗表現',
    addButtonLabel: '新增能力紀錄',
    emptyTitle: '尚無棒球能力紀錄',
    primaryMetric: 'pitch_speed',
    primaryMetricLabel: '球速',
    primaryMetricUnit: 'km/h',
    metrics: [
      { key: 'pitch_speed', label: '球速', unit: 'km/h', precision: 1 },
      { key: 'exit_velocity', label: '擊球初速', unit: 'km/h', precision: 1 },
      { key: 'home_to_first', label: '本壘到一壘', unit: '秒', precision: 2 },
      { key: 'home_to_home', label: '全壘跑速', unit: '秒', precision: 2 },
      { key: 'catch_count', label: '接球次數', unit: '次', precision: 0 },
      { key: 'relay_throw_count', label: '接力傳球', unit: '次', precision: 0 },
      { key: 'base_run_180s_laps', label: '壘間180秒', unit: '圈', precision: 1 }
    ]
  },
  [PHYSICAL_TESTS_FEATURE]: {
    kind: PHYSICAL_TESTS_FEATURE,
    feature: PHYSICAL_TESTS_FEATURE,
    routeBase: '/physical-tests',
    title: '體能測驗數據',
    shortTitle: '體能測驗',
    description: '追蹤身高體重、BMI、折返跑、柔軟度與爆發力表現',
    addButtonLabel: '新增體能紀錄',
    emptyTitle: '尚無體能測驗紀錄',
    primaryMetric: 'bmi',
    primaryMetricLabel: 'BMI',
    metrics: [
      { key: 'height', label: '身高', unit: 'cm', precision: 1 },
      { key: 'weight', label: '體重', unit: 'kg', precision: 1 },
      { key: 'bmi', label: 'BMI', precision: 1 },
      { key: 'arm_span', label: '臂展', unit: 'cm', precision: 1 },
      { key: 'shuttle_run', label: '折返跑', unit: '秒', precision: 2 },
      { key: 'sit_and_reach', label: '坐姿體前彎', unit: 'cm', precision: 1 },
      { key: 'sit_ups', label: '仰臥起坐', unit: '次/分', precision: 0 },
      { key: 'standing_long_jump', label: '立定跳遠', unit: 'cm', precision: 1 },
      { key: 'vertical_jump', label: '垂直摸高', unit: 'cm', precision: 1 }
    ]
  }
}

export const getPerformanceConfig = (kind: PerformanceRecordKind) => performanceConfigs[kind]

export const formatPerformanceValue = (
  value: unknown,
  metric: Pick<PerformanceMetricDefinition, 'precision' | 'unit'>
) => {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return '-'
  }

  const precision = metric.precision ?? 1
  const formatted = numericValue.toLocaleString('zh-TW', {
    minimumFractionDigits: precision === 0 ? 0 : 0,
    maximumFractionDigits: precision
  })

  return metric.unit ? `${formatted} ${metric.unit}` : formatted
}
