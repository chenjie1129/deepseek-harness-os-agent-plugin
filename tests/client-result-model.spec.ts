import { describe, expect, it } from 'vitest'
import { resultText, screenshotsFromMeta, taskHistoryFromMeta } from '../src/client/result-model.ts'

describe('Mobile Use result card model', () => {
  it('accepts only complete attachment references with validated inline previews', () => {
    const valid = {
      attachmentId: 'att-1', mediaType: 'image/png', bytes: 72,
      width: 1, height: 1, name: 'mobile-use-step-1.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    }
    expect(screenshotsFromMeta({
      osAgentScreenshots: [
        valid,
        { ...valid, attachmentId: '' },
        { ...valid, mediaType: 'image/svg+xml' },
        { ...valid, dataUrl: 'https://example.com/not-inline.png' },
      ],
    })).toEqual([{ attachment: {
      attachmentId: 'att-1', mediaType: 'image/png', bytes: 72,
      width: 1, height: 1, name: 'mobile-use-step-1.png',
    }, dataUrl: valid.dataUrl }])
    expect(screenshotsFromMeta({ osAgentScreenshots: 'not-an-array' })).toEqual([])
  })

  it('renders text blocks without serializing non-text payloads', () => {
    expect(resultText([
      { type: 'text', text: 'first' },
      { type: 'image', data: 'must-not-render' },
      { type: 'text', text: 'second' },
    ])).toBe('first\nsecond')
  })

  it('validates ordered task history and provider totals from presentation metadata', () => {
    expect(taskHistoryFromMeta({
      osAgentSteps: [
        { sequence: 1, stepId: 'step-1', action: 'tap', success: true, summary: 'Opened Settings' },
        { sequence: 0, action: 'invalid' },
      ],
      osAgentReportedTotalSteps: 3,
    })).toEqual({
      steps: [{ sequence: 1, stepId: 'step-1', action: 'tap', success: true, summary: 'Opened Settings' }],
      reportedTotalSteps: 3,
    })
  })
})
