/** Pure validation and text projection for the Mobile Use Tool result card. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export interface OsAgentScreenshotPreview {
  attachment: ImageAttachmentRef
  dataUrl: string
}

export function screenshotsFromMeta(meta: unknown): OsAgentScreenshotPreview[] {
  if (!isRecord(meta) || !Array.isArray(meta.osAgentScreenshots)) return []
  return meta.osAgentScreenshots.flatMap((value) => {
    if (!isImageRef(value) || !isImageDataUrl(value.dataUrl, value.mediaType)) return []
    const { dataUrl, ...attachment } = value
    return [{ attachment, dataUrl }]
  }).slice(0, 10)
}

export function resultText(content: readonly unknown[]): string {
  return content.flatMap((block) => {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') return [block.text]
    return []
  }).join('\n')
}

function isImageRef(value: unknown): value is ImageAttachmentRef & Record<string, unknown> {
  if (!isRecord(value)) return false
  return typeof value.attachmentId === 'string' && value.attachmentId !== ''
    && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(value.mediaType))
    && positiveInteger(value.bytes) && positiveInteger(value.width) && positiveInteger(value.height)
    && (value.name === undefined || typeof value.name === 'string')
}

function isImageDataUrl(value: unknown, mediaType: unknown): value is string {
  if (typeof value !== 'string' || typeof mediaType !== 'string' || value.length > 7_000_000) return false
  const prefix = `data:${mediaType};base64,`
  if (!value.startsWith(prefix)) return false
  const encoded = value.slice(prefix.length)
  return encoded.length > 0 && encoded.length % 4 !== 1 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
