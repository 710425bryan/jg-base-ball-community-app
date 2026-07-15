<script lang="ts">
import { defineComponent, h } from 'vue'
import { ElDialog } from 'element-plus'

export default defineComponent({
  name: 'AppGlobalDialog',
  inheritAttrs: false,
  props: {
    appendToBody: {
      type: Boolean,
      default: true
    }
  },
  setup(props, { attrs, slots }) {
    return () => h(ElDialog, {
      ...attrs,
      appendToBody: props.appendToBody
    }, slots)
  }
})
</script>
