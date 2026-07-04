// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppLoadingState from './AppLoadingState.vue'

describe('AppLoadingState', () => {
  it('renders the default accessible loading state', () => {
    const wrapper = mount(AppLoadingState, {
      global: {
        stubs: {
          'el-icon': true,
          Loading: true
        }
      }
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.text()).toContain('載入中...')
    expect(wrapper.attributes('style')).toContain('min-height: 45vh')
  })

  it('uses fixed and screen classes without inline min-height style', () => {
    const wrapper = mount(AppLoadingState, {
      props: {
        text: '資料讀取中',
        fixed: true,
        screen: true,
        minHeight: '20vh'
      },
      global: {
        stubs: {
          'el-icon': true,
          Loading: true
        }
      }
    })

    expect(wrapper.text()).toContain('資料讀取中')
    expect(wrapper.classes()).toContain('app-loading-state--fixed')
    expect(wrapper.classes()).toContain('app-loading-state--screen')
    expect(wrapper.attributes('style')).toBeUndefined()
  })
})
