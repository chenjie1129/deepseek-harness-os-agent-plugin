import { describe, expect, it, vi } from 'vitest'
import {
  createScreenshotCollector,
  createScreenshotPresentationMeta,
  createScreenshotResult,
  renderScreenshotOutput,
} from '../screenshots.js'

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
    expect(result.screenshotPreviews).toEqual([{
      attachmentId: 'attachment-1', dataUrl: `data:image/png;base64,${PNG}`,
    }])
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

  it('extracts the JSON-encoded StepResult shape returned by Volcengine', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-provider-shape', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1,
    }))
    const result = await createScreenshotResult({
      Results: [{
        StepResult: {
          Result: JSON.stringify({
            download_url: `data:image/png;base64,${PNG}`,
            screenshot_dimensions: [1080, 1920],
            screenshot_id: 'screenshot-1',
          }),
        },
      }],
    }, attachmentStore(saveImage))

    expect(saveImage).toHaveBeenCalledOnce()
    expect(result.screenshots).toHaveLength(1)
    expect(result.text).not.toContain(PNG)
    expect(result.text).toContain('[screenshot stored separately by Harness]')
  })

  it('downloads signed screenshot URLs only from allowlisted Volcengine hosts', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-remote', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1,
    }))
    const fetchImpl = vi.fn(async () => new Response(Buffer.from(PNG, 'base64'), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '68' },
    }))
    const signedUrl = 'https://test.vegamews.volces.com:9924/screenshot?token=private'

    const result = await createScreenshotResult({ ScreenshotUrl: signedUrl }, attachmentStore(saveImage), { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(signedUrl, expect.objectContaining({
      method: 'GET', redirect: 'error', signal: expect.any(AbortSignal),
    }))
    expect(saveImage).toHaveBeenCalledOnce()
    expect(result.screenshotsFound).toBe(1)
    expect(result.screenshots).toHaveLength(1)
    expect(result.text).not.toContain('token=private')
    expect(result.text).toContain('[Volcengine screenshot URL omitted from text output]')
  })

  it('does not fetch lookalike or non-HTTPS screenshot hosts', async () => {
    const fetchImpl = vi.fn()
    const collector = createScreenshotCollector(attachmentStore(vi.fn()), { fetchImpl })

    const lookalike = await collector.ingest({ ScreenshotUrl: 'https://volces.com.example.com/private.png?token=secret' })
    const insecure = await collector.ingest({ ScreenshotUrl: 'http://phone.vegamews.volces.com:9924/private.png?token=secret' })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(lookalike.text).not.toContain('token=secret')
    expect(insecure.text).not.toContain('token=secret')
    expect(insecure.screenshotsFound).toBe(0)
  })

  it('returns useful text when attachment storage is unavailable', async () => {
    const result = await createScreenshotResult({ Screenshot: PNG }, undefined)

    expect(result.screenshots).toEqual([])
    expect(result.screenshotPreviews).toEqual([])
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

  it('accumulates and deduplicates screenshots across multiple status responses', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-run', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1, name: input.name,
    }))
    const collector = createScreenshotCollector(attachmentStore(saveImage))

    await collector.ingest({ Status: 2, Step: 'start' })
    await collector.ingest({ Status: 2, Step: 'take_screenshot', Screenshot: PNG })
    const result = await collector.ingest({ Status: 3, Step: 'finished', Screenshot: PNG })

    expect(saveImage).toHaveBeenCalledOnce()
    expect(result.screenshots).toHaveLength(1)
    expect(result.screenshotsFound).toBe(1)
    expect(result.text).toContain('captured for this run')
    expect(result.text).not.toContain(PNG)
  })

  it('keeps model output text-only and puts bounded previews in UI-only metadata', () => {
    const attachment = {
      attachmentId: 'sha256:test', mediaType: 'image/png', bytes: 68,
      width: 1, height: 1, name: 'mobile-use-step-1.png',
    }

    const value = {
      text: 'redacted status', screenshots: [attachment], screenshotsFound: 1, warnings: [],
      screenshotPreviews: [{ attachmentId: 'sha256:test', dataUrl: `data:image/png;base64,${PNG}` }],
    }

    expect(renderScreenshotOutput(value)).toEqual([{ type: 'text', text: 'redacted status' }])
    expect(createScreenshotPresentationMeta(value)).toEqual({
      osAgentScreenshots: [{ ...attachment, dataUrl: `data:image/png;base64,${PNG}` }],
      screenshotsFound: 1,
      osAgentSteps: [],
    })
  })

  it('keeps processed detailed-result screenshots and skips duplicate originals', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: `attachment-${saveImage.mock.calls.length}`, mediaType: input.mediaType,
      bytes: input.data.byteLength, width: 1, height: 1, name: input.name,
    }))
    const fetchImpl = vi.fn(async () => new Response(Buffer.from(PNG, 'base64'), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '68' },
    }))
    const result = await createScreenshotResult({ ScreenShots: {
      'run-1-0': {
        id: 'run-1-0',
        download_url: 'https://mobile-use-openapi.tos-cn-beijing.volces.com/download.png?secret=0',
        original_download_url: 'https://mobile-use-openapi.tos-cn-beijing.volces.com/original-download.png?secret=00',
        original_screenshot: 'https://mobile-use-openapi.tos-cn-beijing.volces.com/original.png?secret=1',
        screenshot: 'https://mobile-use-openapi.tos-cn-beijing.volces.com/processed.png?secret=2',
      },
    } }, attachmentStore(saveImage), { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(result.screenshotsFound).toBe(1)
    expect(result.screenshots).toHaveLength(1)
    expect(result.text).not.toContain('secret=')
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
