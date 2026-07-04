// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { defineComponent, h, markRaw } from 'vue'
import { mount } from '@vue/test-utils'
import AppPageHeader from './AppPageHeader.vue'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup: () => () => h('svg', { 'data-testid': 'test-icon' })
})
const RawTestIcon = markRaw(TestIcon)

describe('AppPageHeader', () => {
  it('renders title, subtitle, icon, and action slots', () => {
    const wrapper = mount(AppPageHeader, {
      props: {
        title: '廠商名單',
        subtitle: '管理採購與交易類別',
        icon: RawTestIcon
      },
      slots: {
        before: '<button>返回</button>',
        'title-suffix': '<span>3 筆</span>',
        actions: '<button>新增</button>'
      },
      global: {
        stubs: {
          'el-icon': {
            template: '<span class="el-icon-stub"><slot /></span>'
          }
        }
      }
    })

    expect(wrapper.find('h1').text()).toContain('廠商名單')
    expect(wrapper.text()).toContain('管理採購與交易類別')
    expect(wrapper.text()).toContain('3 筆')
    expect(wrapper.text()).toContain('返回')
    expect(wrapper.text()).toContain('新增')
    expect(wrapper.find('[data-testid="test-icon"]').exists()).toBe(true)
  })

  it('supports h2 headings and subtitle slot override', () => {
    const wrapper = mount(AppPageHeader, {
      props: {
        title: '付款審核',
        subtitle: '不應顯示',
        icon: RawTestIcon,
        as: 'h2'
      },
      slots: {
        subtitle: '<span>自訂副標題</span>'
      },
      global: {
        stubs: {
          'el-icon': true
        }
      }
    })

    expect(wrapper.find('h2').text()).toContain('付款審核')
    expect(wrapper.text()).toContain('自訂副標題')
    expect(wrapper.text()).not.toContain('不應顯示')
  })
})
