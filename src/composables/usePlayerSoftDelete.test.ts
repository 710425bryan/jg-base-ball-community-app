import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { usePlayerSoftDelete, type PlayerSoftDeleteTarget } from './usePlayerSoftDelete'

function deferred() {
  let resolve!: (value?: unknown) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function setup() {
  const member = ref<PlayerSoftDeleteTarget | null>({ id: 'member-1', name: '測試隊員' })
  const canDelete = ref(true)
  const saving = ref(false)
  const options = {
    getMember: () => member.value,
    canDelete: () => canDelete.value,
    isBusy: () => saving.value,
    confirm: vi.fn().mockResolvedValue('confirm'),
    softDeleteMember: vi.fn().mockResolvedValue(undefined),
    invalidateRoster: vi.fn(),
    onRemoved: vi.fn(),
    refreshRoster: vi.fn().mockResolvedValue([]),
    notifySuccess: vi.fn(), notifyError: vi.fn(), notifyWarning: vi.fn()
  }
  return { member, canDelete, saving, options, ...usePlayerSoftDelete(options) }
}

describe('usePlayerSoftDelete', () => {
  it('confirms the member, saves only their ID, closes and refreshes after success', async () => {
    const flow = setup()
    await flow.confirmSoftDelete()
    expect(flow.options.confirm).toHaveBeenCalledWith({ id: 'member-1', name: '測試隊員' })
    expect(flow.options.softDeleteMember).toHaveBeenCalledExactlyOnceWith('member-1')
    expect(flow.options.onRemoved).toHaveBeenCalledOnce()
    expect(flow.options.invalidateRoster).toHaveBeenCalledOnce()
    expect(flow.options.refreshRoster).toHaveBeenCalledOnce()
    expect(flow.options.notifySuccess).toHaveBeenCalledWith(expect.stringContaining('付款與歷史紀錄仍保留'))
    expect(flow.options.notifyError).not.toHaveBeenCalled()
    expect(flow.isRemoving.value).toBe(false)
  })

  it.each(['cancel', 'close'])('silently handles confirmation %s without a mutation', async (reason) => {
    const flow = setup()
    flow.options.confirm.mockRejectedValue(reason)
    await flow.confirmSoftDelete()
    expect(flow.options.softDeleteMember).not.toHaveBeenCalled()
    expect(flow.options.onRemoved).not.toHaveBeenCalled()
    expect(flow.options.notifyError).not.toHaveBeenCalled()
    expect(flow.removalError.value).toBe('')
    expect(flow.isRemoving.value).toBe(false)
  })

  it('requires DELETE permission before confirming', async () => {
    const flow = setup()
    flow.canDelete.value = false
    await flow.confirmSoftDelete()
    expect(flow.options.confirm).not.toHaveBeenCalled()
    expect(flow.options.softDeleteMember).not.toHaveBeenCalled()
  })

  it('rechecks DELETE permission after confirmation', async () => {
    const flow = setup()
    const confirmation = deferred()
    flow.options.confirm.mockReturnValue(confirmation.promise)
    const result = flow.confirmSoftDelete()
    flow.canDelete.value = false
    confirmation.resolve()
    await result
    expect(flow.options.softDeleteMember).not.toHaveBeenCalled()
    expect(flow.removalError.value).toContain('權限已變更')
    expect(flow.options.onRemoved).not.toHaveBeenCalled()
  })

  it('blocks duplicate attempts throughout confirmation, mutation and refresh', async () => {
    const flow = setup()
    const confirmation = deferred()
    const mutation = deferred()
    const refresh = deferred()
    flow.options.confirm.mockReturnValue(confirmation.promise)
    flow.options.softDeleteMember.mockReturnValue(mutation.promise)
    flow.options.refreshRoster.mockReturnValue(refresh.promise)
    const result = flow.confirmSoftDelete()
    await flow.confirmSoftDelete()
    expect(flow.options.confirm).toHaveBeenCalledOnce()
    confirmation.resolve()
    await Promise.resolve()
    await flow.confirmSoftDelete()
    expect(flow.options.softDeleteMember).toHaveBeenCalledOnce()
    mutation.resolve()
    await Promise.resolve()
    await flow.confirmSoftDelete()
    expect(flow.options.refreshRoster).toHaveBeenCalledOnce()
    expect(flow.isRemoving.value).toBe(true)
    refresh.resolve()
    await result
    expect(flow.isRemoving.value).toBe(false)
  })

  it('does not race a form save, including one begun while confirmation was open', async () => {
    const flow = setup()
    flow.saving.value = true
    await flow.confirmSoftDelete()
    expect(flow.options.confirm).not.toHaveBeenCalled()
    flow.saving.value = false
    const confirmation = deferred()
    flow.options.confirm.mockReturnValue(confirmation.promise)
    const result = flow.confirmSoftDelete()
    flow.saving.value = true
    confirmation.resolve()
    await result
    expect(flow.options.softDeleteMember).not.toHaveBeenCalled()
  })

  it.each([null, { id: 'member-2', name: '其他隊員' }])('cancels when the dialog target changes before confirmation returns', async (nextMember) => {
    const flow = setup()
    const confirmation = deferred()
    flow.options.confirm.mockReturnValue(confirmation.promise)
    const result = flow.confirmSoftDelete()
    flow.member.value = nextMember
    confirmation.resolve()
    await result
    expect(flow.options.softDeleteMember).not.toHaveBeenCalled()
    expect(flow.options.onRemoved).not.toHaveBeenCalled()
  })

  it('does not close another member dialog when the original request completes', async () => {
    const flow = setup()
    const mutation = deferred()
    flow.options.softDeleteMember.mockReturnValue(mutation.promise)
    const result = flow.confirmSoftDelete()
    await Promise.resolve()
    flow.member.value = { id: 'member-2', name: '其他隊員' }
    mutation.resolve()
    await result
    expect(flow.options.softDeleteMember).toHaveBeenCalledWith('member-1')
    expect(flow.options.onRemoved).not.toHaveBeenCalled()
    expect(flow.options.notifySuccess).toHaveBeenCalledWith(expect.stringContaining('測試隊員'))
    expect(flow.options.refreshRoster).toHaveBeenCalledOnce()
  })

  it('retains the form and persistent error after failure and allows clearing on reopen or retry', async () => {
    const flow = setup()
    flow.options.softDeleteMember.mockRejectedValueOnce(new Error('資料已異動或您沒有刪除權限'))
    await flow.confirmSoftDelete()
    expect(flow.removalError.value).toContain('資料已異動或您沒有刪除權限')
    expect(flow.options.onRemoved).not.toHaveBeenCalled()
    expect(flow.options.refreshRoster).not.toHaveBeenCalled()
    expect(flow.options.invalidateRoster).not.toHaveBeenCalled()
    expect(flow.options.notifySuccess).not.toHaveBeenCalled()
    expect(flow.isRemoving.value).toBe(false)
    flow.clearRemovalError()
    expect(flow.removalError.value).toBe('')
    await flow.confirmSoftDelete()
    expect(flow.options.onRemoved).toHaveBeenCalledOnce()
    expect(flow.removalError.value).toBe('')
  })

  it('does not put a stale failure into another member form', async () => {
    const flow = setup()
    const mutation = deferred()
    flow.options.softDeleteMember.mockReturnValue(mutation.promise)
    const result = flow.confirmSoftDelete()
    await Promise.resolve()
    flow.member.value = { id: 'member-2', name: '其他隊員' }
    mutation.reject(new Error('failed'))
    await result
    expect(flow.removalError.value).toBe('')
    expect(flow.options.notifyError).not.toHaveBeenCalled()
    expect(flow.options.onRemoved).not.toHaveBeenCalled()
  })

  it('reports refresh failure separately after a successful soft deletion', async () => {
    const flow = setup()
    flow.options.refreshRoster.mockRejectedValue(new Error('network'))
    await flow.confirmSoftDelete()
    expect(flow.options.onRemoved).toHaveBeenCalledOnce()
    expect(flow.options.notifySuccess).toHaveBeenCalledOnce()
    expect(flow.options.notifyWarning).toHaveBeenCalledWith('已完成刪除，但名單更新失敗，請重新整理頁面。')
    expect(flow.options.invalidateRoster).toHaveBeenCalledOnce()
    expect(flow.options.notifyError).not.toHaveBeenCalled()
    expect(flow.removalError.value).toBe('')
  })

  it('does not treat unexpected confirmation errors as cancellation', async () => {
    const flow = setup()
    flow.options.confirm.mockRejectedValue(new Error('confirmation unavailable'))
    await flow.confirmSoftDelete()
    expect(flow.removalError.value).toContain('無法開啟刪除確認')
    expect(flow.options.softDeleteMember).not.toHaveBeenCalled()
    expect(flow.isRemoving.value).toBe(false)
  })
})
