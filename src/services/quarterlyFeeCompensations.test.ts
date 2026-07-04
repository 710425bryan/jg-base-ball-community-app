import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('quarterlyFeeCompensations service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and saves normalized compensation defaults', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { regular_daily_credit: '200', discount_daily_credit: '100' }, error: null })
      .mockResolvedValueOnce({ data: { regular_daily_credit: '300', discount_daily_credit: '150' }, error: null })

    const {
      getQuarterlyFeeCompensationDefaults,
      saveQuarterlyFeeCompensationDefaults
    } = await import('./quarterlyFeeCompensations')

    expect(await getQuarterlyFeeCompensationDefaults()).toEqual({
      regularDailyCredit: 200,
      discountDailyCredit: 100
    })
    expect(await saveQuarterlyFeeCompensationDefaults({
      regularDailyCredit: 300,
      discountDailyCredit: 150
    })).toEqual({
      regularDailyCredit: 300,
      discountDailyCredit: 150
    })
    expect(rpcMock).toHaveBeenLastCalledWith('save_quarterly_fee_compensation_defaults', {
      p_regular_daily_credit: 300,
      p_discount_daily_credit: 150
    })
  })

  it('normalizes compensation item rows and RPC month arguments', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: 1, period_key: '2026-Q3', month_start: '2026-07-01', suggested_amount: '400' }],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ id: 1, approved_amount: '321' }],
        error: null
      })

    const {
      approveQuarterlyFeeCompensationItem,
      listQuarterlyFeeCompensationItems
    } = await import('./quarterlyFeeCompensations')

    expect(await listQuarterlyFeeCompensationItems({
      periodKey: '2026-Q3',
      month: '2026-07'
    })).toEqual([
      expect.objectContaining({
        id: '1',
        month: '2026-07',
        suggested_amount: 400
      })
    ])
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'list_quarterly_fee_compensation_items', {
      p_period_key: '2026-Q3',
      p_month: '2026-07-01'
    })

    await approveQuarterlyFeeCompensationItem({
      itemId: 'item-1',
      approvedAmount: 321.9,
      note: ''
    })
    expect(rpcMock).toHaveBeenLastCalledWith('approve_quarterly_fee_compensation_item', {
      p_item_id: 'item-1',
      p_approved_amount: 321,
      p_note: null
    })
  })
})
