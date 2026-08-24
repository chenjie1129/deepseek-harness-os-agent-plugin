/** Pure validation and text projection for the Mobile Use Tool result card. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export function screenshotsFromMeta(meta: unknown): ImageAttachmentRef[] {
  if (!isRecord(meta) || !Array.isArray(meta.osAgentScreenshots)) return []
  return meta.osAgentScreenshots.filter(isImageRef).slice(0, 100)
}

export function resultText(content: readonly unknown[]): string {
  return content.flatMap((block) => {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') return [block.text]
    return []
  }).join('\n')
}

function isImageRef(value: unknown): value is ImageAttachmentRef {
  if (!isRecord(value)) return false
  return typeof value.attachmentId === 'string' && value.attachmentId !== ''
    && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(value.mediaType))
    && positiveInteger(value.bytes) && positiveInteger(value.width) && positiveInteger(value.height)
    && (value.name === undefined || typeof value.name === 'string')
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
