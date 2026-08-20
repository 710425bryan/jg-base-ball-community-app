<script lang="ts">
import { defineComponent, h, nextTick, onBeforeUnmount, ref } from 'vue'
import { ElSelect } from 'element-plus'

const SEARCH_INPUT_POLL_INTERVAL_MS = 50

type SelectSearchInstance = {
  states?: {
    inputValue: string
  }
  updateOptions?: () => void
  inputRef?: HTMLInputElement | null
  focus?: () => void
  blur?: () => void
}

const callEventHandler = (handler: unknown, payload: unknown) => {
  if (Array.isArray(handler)) {
    handler.forEach((callback) => {
      if (typeof callback === 'function') callback(payload)
    })
    return
  }

  if (typeof handler === 'function') {
    handler(payload)
  }
}

export default defineComponent({
  name: 'AppGlobalSelect',
  inheritAttrs: false,
  setup(_, { attrs, expose, slots }) {
    const selectRef = ref<SelectSearchInstance | null>(null)
    let activeSearchInput: HTMLInputElement | null = null
    let lastSyncedSearchValue = ''
    let searchInputPollId: number | null = null

    const getSearchInput = (event: Event) => {
      const target = event.target

      if (!(target instanceof HTMLInputElement)) return null
      if (!target.classList.contains('el-select__input')) return null

      return target
    }

    const syncSearchValue = (input: HTMLInputElement, force = false) => {
      const searchValue = input.value
      if (!force && searchValue === lastSyncedSearchValue) return

      lastSyncedSearchValue = searchValue

      const select = selectRef.value
      if (select?.states) {
        select.states.inputValue = searchValue
      }

      const filterMethod = attrs.filterMethod ?? attrs['filter-method']
      if (typeof filterMethod === 'function') {
        filterMethod(searchValue)
        return
      }

      if (!select?.states) return

      select.updateOptions?.()
    }

    const refreshSearchFromEvent = (event: Event) => {
      const input = getSearchInput(event)
      if (input) syncSearchValue(input)
    }

    const stopSearchInputPolling = () => {
      if (searchInputPollId !== null && typeof window !== 'undefined') {
        window.clearInterval(searchInputPollId)
      }

      searchInputPollId = null
      activeSearchInput = null
    }

    const startSearchInputPolling = (input: HTMLInputElement) => {
      stopSearchInputPolling()
      activeSearchInput = input
      lastSyncedSearchValue = input.value

      if (typeof window === 'undefined') return

      searchInputPollId = window.setInterval(() => {
        if (!activeSearchInput || !activeSearchInput.isConnected) {
          stopSearchInputPolling()
          return
        }

        syncSearchValue(activeSearchInput)
      }, SEARCH_INPUT_POLL_INTERVAL_MS)
    }

    const startSearchInputPollingFromSelect = () => {
      const input = selectRef.value?.inputRef
      if (!(input instanceof HTMLInputElement)) return false

      startSearchInputPolling(input)
      return true
    }

    const handleCompositionStart = (event: Event) => {
      callEventHandler(attrs.onCompositionstart, event)
    }

    const handleCompositionUpdate = (event: Event) => {
      callEventHandler(attrs.onCompositionupdate, event)
      refreshSearchFromEvent(event)
    }

    const handleCompositionEnd = (event: Event) => {
      callEventHandler(attrs.onCompositionend, event)
      refreshSearchFromEvent(event)
    }

    const handleInput = (event: Event) => {
      callEventHandler(attrs.onInput, event)
      refreshSearchFromEvent(event)
    }

    const handleFocus = (event: Event) => {
      callEventHandler(attrs.onFocus, event)

      const input = getSearchInput(event)
      if (input) startSearchInputPolling(input)
    }

    const handleFocusIn = (event: Event) => {
      callEventHandler(attrs.onFocusin, event)

      const input = getSearchInput(event)
      if (input) startSearchInputPolling(input)
    }

    const handleBlur = (event: Event) => {
      callEventHandler(attrs.onBlur, event)
      stopSearchInputPolling()
    }

    const handleVisibleChange = (visible: boolean) => {
      callEventHandler(attrs.onVisibleChange, visible)

      if (!visible) {
        stopSearchInputPolling()
        return
      }

      if (!startSearchInputPollingFromSelect()) {
        void nextTick(startSearchInputPollingFromSelect)
      }
    }

    onBeforeUnmount(stopSearchInputPolling)

    expose({
      focus: () => selectRef.value?.focus?.(),
      blur: () => selectRef.value?.blur?.()
    })

    return () => h(ElSelect, {
      ...attrs,
      ref: selectRef,
      onCompositionstart: handleCompositionStart,
      onCompositionupdate: handleCompositionUpdate,
      onCompositionend: handleCompositionEnd,
      onInput: handleInput,
      onFocus: handleFocus,
      onFocusin: handleFocusIn,
      onBlur: handleBlur,
      onVisibleChange: handleVisibleChange
    }, slots)
  }
})
</script>
