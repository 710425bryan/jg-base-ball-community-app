import { describe, expect, it } from 'vitest'
import { compressImage } from './imageCompressor'

describe('imageCompressor', () => {
  it('returns the original file for non-image files', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })

    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('returns the original file for gif and svg image types', async () => {
    const gif = new File(['gif'], 'motion.gif', { type: 'image/gif' })
    const svg = new File(['svg'], 'icon.svg', { type: 'image/svg+xml' })

    await expect(compressImage(gif)).resolves.toBe(gif)
    await expect(compressImage(svg)).resolves.toBe(svg)
  })
})
