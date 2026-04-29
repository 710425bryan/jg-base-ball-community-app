// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MatchLiveController from '../MatchLiveController.vue'

const ElButtonStub = {
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
}

const ElSelectStub = {
  props: ['modelValue'],
  emits: ['update:modelValue', 'change'],
  template: `
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"
    >
      <slot />
    </select>
  `
}

const ElOptionStub = {
  props: ['label', 'value'],
  template: '<option :value="value">{{ label }}</option>'
}

const ElOptionGroupStub = {
  props: ['label'],
  template: '<optgroup :label="label"><slot /></optgroup>'
}

const mountController = (props = {}) => mount(MatchLiveController, {
  props: {
    batterOptions: [
      {
        label: '打擊線與守備員',
        options: [
          { name: '王大雷', label: '#18 王大雷', number: '18' }
        ]
      }
    ],
    initialBatter: '王大雷',
    initialBatFirst: true,
    initialInning: '一上',
    ...props
  },
  global: {
    stubs: {
      ElButton: ElButtonStub,
      ElIcon: { template: '<span><slot /></span>' },
      ElOption: ElOptionStub,
      ElOptionGroup: ElOptionGroupStub,
      ElRadioButton: { template: '<button type="button"><slot /></button>' },
      ElRadioGroup: { template: '<div><slot /></div>' },
      ElSelect: ElSelectStub,
      ElTag: { template: '<span><slot /></span>' }
    }
  }
})

const findButtonByText = (wrapper: VueWrapper, text: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes(text))

  if (!button) {
    throw new Error(`Missing button: ${text}`)
  }

  return button
}

const latestUpdatePayload = (wrapper: VueWrapper) => {
  const payload = wrapper.emitted('update')?.at(-1)?.[0]

  if (!payload) {
    throw new Error('Expected update event')
  }

  return payload as any
}

describe('MatchLiveController scoreboard automation', () => {
  it('fills a scoreless half inning with zero when advancing', async () => {
    const wrapper = mountController()

    await findButtonByText(wrapper, '換半局').trigger('click')

    const payload = latestUpdatePayload(wrapper)
    expect(payload.current_inning).toBe('一下')
    expect(payload.line_score_data.innings[0].home).toBe(0)
  })

  it('fills a scoreless previous half inning with zero when the inning is changed manually', async () => {
    const wrapper = mountController()
    const inningSelect = wrapper.findAll('select').find((select) => select.text().includes('九下'))

    if (!inningSelect) {
      throw new Error('Missing inning select')
    }

    await inningSelect.setValue('一下')

    const payload = latestUpdatePayload(wrapper)
    expect(payload.current_inning).toBe('一下')
    expect(payload.line_score_data.innings[0].home).toBe(0)
  })

  it('counts a home run as both a hit and a run-scoring play', async () => {
    const wrapper = mountController()

    await findButtonByText(wrapper, 'HR 全壘打').trigger('click')

    const payload = latestUpdatePayload(wrapper)
    expect(payload.home_score).toBe(1)
    expect(payload.line_score_data.home_h).toBe(1)
    expect(payload.line_score_data.innings[0].home).toBe(1)
  })

  it('counts an allowed home run as opponent hit and score while defending', async () => {
    const wrapper = mountController({
      isDefending: true,
      initialInning: '一下'
    })

    await findButtonByText(wrapper, '被全壘打').trigger('click')

    const payload = latestUpdatePayload(wrapper)
    expect(payload.opponent_score).toBe(1)
    expect(payload.line_score_data.opponent_h).toBe(1)
    expect(payload.line_score_data.innings[0].opponent).toBe(1)
  })

  it('adds an error to the defensive team on error reach while batting', async () => {
    const wrapper = mountController()

    await findButtonByText(wrapper, 'E 失誤上壘').trigger('click')

    const payload = latestUpdatePayload(wrapper)
    expect(payload.base_1).toBe(true)
    expect(payload.line_score_data.opponent_e).toBe(1)
    expect(payload.line_score_data.home_h).toBe(0)
  })

  it('adds an error to our team on opponent error reach while defending', async () => {
    const wrapper = mountController({
      isDefending: true,
      initialInning: '一下'
    })

    await findButtonByText(wrapper, '失誤上壘').trigger('click')

    const payload = latestUpdatePayload(wrapper)
    expect(payload.base_1).toBe(true)
    expect(payload.line_score_data.home_e).toBe(1)
    expect(payload.line_score_data.opponent_h).toBe(0)
  })
})
