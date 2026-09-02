import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('send-push-notification targeted feed event', () => {
  it('persists a single explicit target on the notification-center event', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

    expect(source).toContain('target_user_id: targetUserIds.length === 1 ? targetUserIds[0] : null')
    expect(source).toContain('event_key: eventKey')
    expect(source).toContain('explicit push targets are not allowed')
  })
})
