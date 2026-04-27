// @vitest-environment jsdom
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

import HolidayThemeSettingsView from './HolidayThemeSettingsView.vue'

const storedConfig = vi.hoisted(() => ({ value: null as any }))

const supabaseMocks = vi.hoisted(() => {
  const rpc = vi.fn()
  const invoke = vi.fn()
  const getSession = vi.fn()

  return { rpc, invoke, getSession }
})

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

const confirmMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: supabaseMocks.rpc,
    auth: {
      getSession: supabaseMocks.getSession,
    },
    functions: {
      invoke: supabaseMocks.invoke,
    },
  },
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => ({
    can: (feature: string, action: string) => feature === 'holiday_theme_settings' && ['VIEW', 'EDIT'].includes(action),
  }),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: messageMocks,
    ElMessageBox: {
      confirm: confirmMock,
    },
  }
})

const ElButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
})

const ElInputStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: '' },
    type: { type: String, default: 'text' },
  },
  emits: ['update:modelValue'],
  template: `
    <textarea
      v-if="type === 'textarea'"
      v-bind="$attrs"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea>
    <input
      v-else
      v-bind="$attrs"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
})

const ElSelectStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number, null], default: '' },
  },
  emits: ['update:modelValue'],
  template: `
    <select
      v-bind="$attrs"
      :value="modelValue ?? ''"
      @change="$emit('update:modelValue', $event.target.value || null)"
    >
      <slot />
    </select>
  `,
})

const ElOptionStub = defineComponent({
  props: {
    label: { type: String, default: '' },
    value: { type: [String, Number], default: '' },
  },
  template: '<option :value="value">{{ label }}</option>',
})

const ElSwitchStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: `
    <input
      type="checkbox"
      :checked="modelValue"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
  `,
})

const mountView = async (config = null) => {
  storedConfig.value = config
  const wrapper = mount(HolidayThemeSettingsView, {
    global: {
      stubs: {
        'el-button': ElButtonStub,
        'el-input': ElInputStub,
        'el-select': ElSelectStub,
        'el-option': ElOptionStub,
        'el-switch': ElSwitchStub,
        'el-date-picker': ElInputStub,
        'el-form-item': { template: '<label><slot /></label>' },
        'el-icon': { template: '<span><slot /></span>' },
        HolidayThemePreviewStage: {
          props: ['theme'],
          template: '<div data-test="holiday-preview">{{ theme.title }}</div>',
        },
      },
    },
  })

  await flushPromises()
  return wrapper
}

describe('HolidayThemeSettingsView', () => {
  beforeEach(() => {
    storedConfig.value = null
    supabaseMocks.rpc.mockImplementation((name: string, args?: any) => {
      if (name === 'get_public_holiday_theme_config') {
        return Promise.resolve({ data: storedConfig.value, error: null })
      }
      if (name === 'get_holiday_theme_player_options') {
        return Promise.resolve({
          data: [
            { id: 'p1', name: 'Player One', role: '球員', team_group: 'A', status: '在隊' },
            { id: 'p2', name: 'Player Two', role: '校隊', team_group: 'B', status: '在隊' },
          ],
          error: null,
        })
      }
      if (name === 'save_holiday_theme_config') {
        storedConfig.value = args?.p_config
        return Promise.resolve({ data: args?.p_config, error: null })
      }

      return Promise.resolve({ data: null, error: null })
    })
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        success: true,
        total_targets: 1,
        dispatched_count: 1,
        expired_count: 0,
        failed_count: 0,
        provider_counts: { 'Web Push': 1 },
      },
      error: null,
    })
    supabaseMocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
    })
    messageMocks.success.mockClear()
    messageMocks.error.mockClear()
    messageMocks.warning.mockClear()
    confirmMock.mockReset()
    confirmMock.mockResolvedValue(true)
  })

  it('saves activities through the protected RPC as a v2 payload', async () => {
    const wrapper = await mountView({
      enabled: true,
      activeTheme: 'mothers_day',
      title: 'Mothers Day',
      messages: ['Celebrate today'],
      palette: 'mothers_day',
      motionPreset: 'soft_petals',
      showGlobalRibbon: true,
    })

    await wrapper.get('[data-test="holiday-add-activity"]').trigger('click')
    await wrapper.get('[data-test="holiday-save"]').trigger('click')
    await flushPromises()

    const saveCall = supabaseMocks.rpc.mock.calls.find(([name]) => name === 'save_holiday_theme_config')
    expect(saveCall?.[1].p_config).toMatchObject({ version: 2 })
    expect(saveCall?.[1].p_config.activities).toHaveLength(2)
    expect(messageMocks.success).toHaveBeenCalledWith('節日主題設定已儲存')
  })

  it('sends the selected activity through notify-holiday-theme manual mode', async () => {
    const wrapper = await mountView({
      version: 2,
      activities: [
        {
          id: 'notify-1',
          manualEnabled: true,
          activeTheme: 'player_first_hit',
          playerId: 'p1',
          playerName: 'Player One',
          title: 'Player One First Hit',
          messages: ['First hit celebration is live now'],
          palette: 'player_first_hit',
          motionPreset: 'soft_petals',
          showGlobalRibbon: true,
          notifyOnStart: true,
        },
      ],
    })

    await wrapper.get('[data-test="holiday-send-notification"]').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(supabaseMocks.invoke).toHaveBeenCalledWith('notify-holiday-theme', {
      body: {
        mode: 'manual',
        activity: expect.objectContaining({
          id: 'notify-1',
          activeTheme: 'player_first_hit',
          title: 'Player One First Hit',
          messages: expect.arrayContaining(['First hit celebration is live now']),
        }),
        request_key: expect.any(String),
      },
      headers: {
        Authorization: 'Bearer test-access-token',
      },
    })
    expect(messageMocks.success).toHaveBeenCalledWith('主題通知已發送')
  })
})
