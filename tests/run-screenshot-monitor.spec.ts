import { describe, expect, it, vi } from 'vitest'
import { isTerminalRunStatus, readRunId, RunScreenshotMonitor } from '../run-screenshot-monitor.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='

describe('run-scoped screenshot monitor', () => {
  it('captures an intermediate screenshot without any foreground status polling', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-background', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1, name: input.name,
    }))
    const responses = [
      { requestId: 'status-1', result: { Status: 2, Results: [{ Action: 'start' }] } },
      { requestId: 'status-2', result: { Status: 2, Results: [{ Action: 'take_screenshot', Screenshot: PNG }] } },
      { requestId: 'status-3', result: { Status: 3, Results: [{ Action: 'take_screenshot', Screenshot: PNG }] } },
    ]
    const client = { call: vi.fn(async () => responses.shift()) }
    const monitor = new RunScreenshotMonitor({
      attachments: () => attachmentStore(saveImage),
      pollIntervalMs: 1,
      wait: async () => {},
    })

    await monitor.start({ runId: 'run-background', client, timeoutSeconds: 10 })
    await vi.waitFor(() => expect(client.call).toHaveBeenCalledTimes(3))
    const result = await monitor.format('run-background', {
      action: 'GetAgentResult', result: { Status: 3, Summary: 'done' },
    }, true)

    expect(saveImage).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ screenshotsFound: 1 })
    expect(result?.screenshots).toHaveLength(1)
    expect(result?.text).not.toContain(PNG)
    await monitor.dispose()
  })

  it('falls back to the current response for runs started before the monitor existed', async () => {
    const saveImage = vi.fn(async input => ({
      attachmentId: 'attachment-fallback', mediaType: input.mediaType, bytes: input.data.byteLength,
      width: 1, height: 1,
    }))
    const monitor = new RunScreenshotMonitor({ attachments: () => attachmentStore(saveImage) })

    const result = await monitor.format('older-run', { Screenshot: PNG }, true)

    expect(result?.screenshotsFound).toBe(1)
    expect(saveImage).toHaveBeenCalledOnce()
    await monitor.dispose()
  })

  it('recognizes provider terminal status shapes and nested run ids', () => {
    expect(isTerminalRunStatus({ result: { Status: 2, Results: [{ Action: 'take_screenshot' }] } })).toBe(false)
    expect(isTerminalRunStatus({ result: { Status: 3, Results: [{ Action: 'take_screenshot' }] } })).toBe(true)
    expect(isTerminalRunStatus({ result: { Status: 5 } })).toBe(true)
    expect(isTerminalRunStatus({ result: { Status: 6 } })).toBe(true)
    expect(isTerminalRunStatus({ result: { Status: 7 } })).toBe(true)
    expect(isTerminalRunStatus({ result: { Status: 3, Results: [{ Action: 'finished' }] } })).toBe(true)
    expect(isTerminalRunStatus({ result: { RunState: 'timed_out' } })).toBe(true)
    expect(readRunId({ result: { RunId: 'run-123' } })).toBe('run-123')
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
