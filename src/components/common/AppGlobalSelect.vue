<script lang="ts">
import { defineComponent, h, ref } from 'vue'
import { ElSelect } from 'element-plus'

type SelectSearchInstance = {
  states?: {
    inputValue: string
  }
  updateOptions?: () => void
  focus?: () => void
  blur?: () => void
}

const callEventHandler = (handler: unknown, event: Event) => {
  if (Array.isArray(handler)) {
    handler.forEach((callback) => {
      if (typeof callback === 'function') callback(event)
    })
    return
  }

  if (typeof handler === 'function') {
    handler(event)
  }
}

export default defineComponent({
  name: 'AppGlobalSelect',
  inheritAttrs: false,
  setup(_, { attrs, expose, slots }) {
    const selectRef = ref<SelectSearchInstance | null>(null)
    let isComposing = false

    const refreshComposingSearch = (event: Event) => {
      const target = event.target
      const inputEvent = event as InputEvent

      if (!(target instanceof HTMLInputElement)) return
      if (!target.classList.contains('el-select__input')) return
      if (!isComposing && !inputEvent.isComposing) return

      const filterMethod = attrs.filterMethod ?? attrs['filter-method']
      if (typeof filterMethod === 'function') {
        filterMethod(target.value)
        return
      }

      const select = selectRef.value
      if (!select?.states) return

      select.states.inputValue = target.value
      select.updateOptions?.()
    }

    const handleCompositionStart = (event: Event) => {
      isComposing = true
      callEventHandler(attrs.onCompositionstart, event)
    }

    const handleCompositionEnd = (event: Event) => {
      isComposing = false
      callEventHandler(attrs.onCompositionend, event)
    }

    const handleInput = (event: Event) => {
      callEventHandler(attrs.onInput, event)
      refreshComposingSearch(event)
    }

    expose({
      focus: () => selectRef.value?.focus?.(),
      blur: () => selectRef.value?.blur?.()
    })

    return () => h(ElSelect, {
      ...attrs,
      ref: selectRef,
      onCompositionstart: handleCompositionStart,
      onCompositionend: handleCompositionEnd,
      onInput: handleInput
    }, slots)
  }
})
</script>
