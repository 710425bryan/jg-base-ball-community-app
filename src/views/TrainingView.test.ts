import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TrainingView.vue', import.meta.url), 'utf8')

describe('TrainingView mobile point member search contract', () => {
  it('delegates point-member selection to the responsive searchable component', () => {
    expect(source).toContain("import TrainingPointMemberSelector from '@/components/training/TrainingPointMemberSelector.vue'")
    expect(source).toMatch(/<TrainingPointMemberSelector\s+v-model="pointForm\.member_ids"\s+:members="rosterOptions"\s*\/>/)
    expect(source).not.toMatch(/<el-select[\s\S]{0,300}v-model="pointForm\.member_ids"/)
  })
})
