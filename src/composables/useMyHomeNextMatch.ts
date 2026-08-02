import dayjs, { type Dayjs } from 'dayjs'
import { ref, type Ref } from 'vue'
import { getMyHomeNextEvent } from '@/services/myHome'
import type { MyHomeNextEvent, MyHomeSnapshot } from '@/types/myHome'
import { isMyHomeNextMatchEligibleForMember } from '@/utils/myHomeSnapshot'

type UseMyHomeNextMatchOptions = {
  snapshot: Ref<MyHomeSnapshot>
  selectedMemberId: Ref<string>
  enabled: Readonly<Ref<boolean>>
  now: Readonly<Ref<Dayjs>>
}

export const useMyHomeNextMatch = ({
  snapshot,
  selectedMemberId,
  enabled,
  now
}: UseMyHomeNextMatchOptions) => {
  const nextMatch = ref<MyHomeNextEvent | null>(null)
  let requestId = 0

  const clearNextMatch = () => {
    requestId += 1
    nextMatch.value = null
  }

  const fetchNextMatch = async (memberId = selectedMemberId.value) => {
    const currentRequestId = ++requestId
    nextMatch.value = null

    if (!enabled.value || !memberId) return null

    const member = snapshot.value.members.find((item) => item.id === memberId) || null
    if (!member) return null

    try {
      const event = await getMyHomeNextEvent({
        memberId,
        today: now.value.format('YYYY-MM-DD')
      })
      const verifiedMatch = isMyHomeNextMatchEligibleForMember(event, member, now.value)
        ? event
        : null

      if (currentRequestId === requestId) {
        nextMatch.value = verifiedMatch
      }

      return verifiedMatch
    } catch (error) {
      console.warn('Error fetching personalized my home Next Up match:', error)
      if (currentRequestId === requestId) {
        nextMatch.value = null
      }
      return null
    }
  }

  return {
    nextMatch,
    fetchNextMatch,
    clearNextMatch
  }
}

