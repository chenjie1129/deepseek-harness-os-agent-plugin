import { describe, expect, it } from 'vitest'
import { resultText, screenshotsFromMeta } from '../src/client/result-model.ts'

describe('Mobile Use result card model', () => {
  it('accepts only complete Harness attachment references', () => {
    const valid = {
      attachmentId: 'att-1', mediaType: 'image/png', bytes: 72,
      width: 1, height: 1, name: 'mobile-use-step-1.png',
    }
    expect(screenshotsFromMeta({
      osAgentScreenshots: [valid, { ...valid, attachmentId: '' }, { ...valid, mediaType: 'image/svg+xml' }],
    })).toEqual([valid])
    expect(screenshotsFromMeta({ osAgentScreenshots: 'not-an-array' })).toEqual([])
  })

  it('renders text blocks without serializing non-text payloads', () => {
    expect(resultText([
      { type: 'text', text: 'first' },
      { type: 'image', data: 'must-not-render' },
      { type: 'text', text: 'second' },
    ])).toBe('first\nsecond')
  })
})
