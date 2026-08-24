import { describe, expect, it, vi } from 'vitest'
import { createScreenshotResult } from '../screenshots.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='

describe('Mobile Use screenshot projection', () => {
  it('redacts base64, deduplicates screenshots, and stores durable attachments', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-1', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1, name: input.name,
    }))
    const result = await createScreenshotResult({
      Result: {
        Steps: [
          { Step: 1, ScreenshotBase64: PNG },
          { Step: 2, Screenshot: `data:image/png;base64,${PNG}` },
        ],
        RawBase64: PNG,
      },
    }, attachmentStore(saveImage))

    expect(saveImage).toHaveBeenCalledOnce()
    expect(saveImage).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/png' }))
    expect(result.screenshots).toHaveLength(1)
    expect(result.screenshotsFound).toBe(1)
    expect(result.text).not.toContain(PNG)
    expect(result.text).toContain('[screenshot stored separately by Harness]')
    expect(result.text).toContain('Harness stored 1 of 1 screenshot(s)')
  })

  it('handles screenshot JSON strings and strips bearer-style remote URLs', async () => {
    const result = await createScreenshotResult({
      CurrentStepScreenshot: JSON.stringify({ Base64: PNG }),
      ScreenshotUrl: 'https://example.com/private.png?token=secret',
    }, attachmentStore(vi.fn(async input => ({
      attachmentId: 'attachment-2', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1,
    }))))

    expect(result.screenshots).toHaveLength(1)
    expect(result.text).not.toContain('token=secret')
    expect(result.text).toContain('[remote screenshot URL omitted')
  })

  it('returns useful text when attachment storage is unavailable', async () => {
    const result = await createScreenshotResult({ Screenshot: PNG }, undefined)

    expect(result.screenshots).toEqual([])
    expect(result.screenshotsFound).toBe(1)
    expect(result.text).not.toContain(PNG)
    expect(result.warnings).toContain('Harness attachment storage is unavailable; screenshots could not be displayed.')
  })

  it('caps decoded screenshot buffers before persistence', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-limited', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1,
    }))
    const store = attachmentStore(saveImage)
    store.imageLimits.maxImagesPerMessage = 1
    const secondPng = `${PNG.slice(0, -4)}AAAA`

    const result = await createScreenshotResult({ Screenshot: PNG, NextScreenshot: secondPng }, store)

    expect(saveImage).toHaveBeenCalledOnce()
    expect(result.screenshotsFound).toBe(2)
    expect(result.warnings).toContain('1 screenshot(s) exceeded the Harness count or byte limits.')
  })
})

function attachmentStore(saveImage: ReturnType<typeof vi.fn>) {
  return {
    imageLimits: {
      maxImageBytes: 1024 * 1024,
      maxImagesPerMessage: 10,
      maxMessageImageBytes: 5 * 1024 * 1024,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    },
    saveImage,
  }
}
