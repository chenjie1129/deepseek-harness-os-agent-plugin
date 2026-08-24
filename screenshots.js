/** Extract, redact, and persist Volcengine Mobile Use task screenshots. */

import { createHash } from 'node:crypto'

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_IMAGES = 20
const DEFAULT_MAX_TOTAL_BYTES = 20 * 1024 * 1024
const DEFAULT_MAX_PRESENTATION_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_PRESENTATION_IMAGES = 10
const DEFAULT_REMOTE_TIMEOUT_MS = 15_000
const SCREENSHOT_KEY = /(?:screen[\s_-]*shot|image|base64)/i
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Turn a Mobile Use response into text plus durable Harness image references.
 * Screenshot bytes are always removed from the text projection, including when
 * an attachment cannot be saved.
 */
export async function createScreenshotResult(value, attachments, options) {
  return createScreenshotCollector(attachments, options).ingest(value)
}

/** Keep the model-facing tool result text-only; screenshot bytes live only in presentation metadata. */
export function renderScreenshotOutput(value) {
  if (typeof value === 'string') return [{ type: 'text', text: value }]
  return [{ type: 'text', text: value.text }]
}

/** Build the bounded, UI-only projection persisted with the Tool result event. */
export function createScreenshotPresentationMeta(value) {
  if (typeof value === 'string') return { osAgentScreenshots: [], screenshotsFound: 0 }
  const previews = new Map(value.screenshotPreviews.map(preview => [preview.attachmentId, preview.dataUrl]))
  return {
    osAgentScreenshots: value.screenshots.flatMap(attachment => {
      const dataUrl = previews.get(String(attachment.attachmentId))
      return dataUrl === undefined ? [] : [{ ...attachment, dataUrl }]
    }),
    screenshotsFound: value.screenshotsFound,
    osAgentSteps: Array.isArray(value.steps) ? value.steps : [],
    ...(Number.isSafeInteger(value.reportedTotalSteps)
      ? { osAgentReportedTotalSteps: value.reportedTotalSteps }
      : {}),
  }
}

/**
 * Create one run-scoped collector. Reusing it across status calls makes image
 * capture independent of whichever individual response the model happens to
 * inspect, while retaining only hashes and durable attachment references.
 */
export function createScreenshotCollector(attachments, options = {}) {
  const limits = imageLimits(attachments)
  const aggregate = {
    seen: new Set(),
    seenRemote: new Set(),
    seenRejected: new Set(),
    screenshots: [],
    screenshotPreviews: [],
    presentationBytes: 0,
    found: 0,
    invalid: 0,
    oversized: 0,
    remoteFailures: 0,
    saveFailures: 0,
    admittedImages: 0,
    admittedBytes: 0,
    extraWarnings: new Set(),
  }
  let queue = Promise.resolve()

  return {
    ingest(value) {
      const result = queue.then(() => projectScreenshotResponse(value, attachments, limits, aggregate, options))
      queue = result.then(() => undefined, () => undefined)
      return result
    },
    warn(message) {
      if (typeof message === 'string' && message.trim() !== '') aggregate.extraWarnings.add(message.trim())
    },
  }
}

async function projectScreenshotResponse(value, attachments, limits, aggregate, options) {
  const remainingImages = Math.max(0, limits.maxImages - aggregate.admittedImages)
  const remainingBytes = Math.max(0, limits.maxTotalBytes - aggregate.admittedBytes)
  const state = {
    candidates: [],
    remoteCandidates: [],
    seen: aggregate.seen,
    seenRemote: aggregate.seenRemote,
    seenRejected: aggregate.seenRejected,
    found: 0,
    invalid: 0,
    oversized: 0,
    remoteFailures: 0,
    candidateBytes: 0,
    maxImageBytes: limits.maxImageBytes,
    maxImages: remainingImages,
    maxTotalBytes: remainingBytes,
    mediaTypes: limits.mediaTypes,
  }
  const redacted = redactScreenshots(value, false, state, 0)
  await downloadRemoteScreenshots(state, attachments, options)
  aggregate.found += state.found
  aggregate.invalid += state.invalid
  aggregate.oversized += state.oversized
  aggregate.remoteFailures += state.remoteFailures

  const firstImageNumber = aggregate.admittedImages + 1
  aggregate.admittedImages += state.candidates.length
  aggregate.admittedBytes += state.candidates.reduce((total, candidate) => total + candidate.data.byteLength, 0)
  const saved = attachments === undefined
    ? []
    : (await Promise.all(state.candidates.map(async (candidate, index) => {
        try {
          const attachment = await attachments.saveImage({
            data: candidate.data,
            mediaType: candidate.mediaType,
            name: `mobile-use-step-${String(firstImageNumber + index)}.${extension(candidate.mediaType)}`,
          })
          return { attachment, candidate }
        } catch {
          return undefined
        }
      }))).filter(Boolean)
  for (const item of saved) {
    aggregate.screenshots.push(item.attachment)
    if (aggregate.screenshotPreviews.length < DEFAULT_MAX_PRESENTATION_IMAGES
      && aggregate.presentationBytes + item.candidate.data.byteLength <= DEFAULT_MAX_PRESENTATION_BYTES) {
      aggregate.screenshotPreviews.push({
        attachmentId: String(item.attachment.attachmentId),
        dataUrl: `data:${item.candidate.mediaType};base64,${item.candidate.data.toString('base64')}`,
      })
      aggregate.presentationBytes += item.candidate.data.byteLength
    }
  }
  if (attachments !== undefined) aggregate.saveFailures += state.candidates.length - saved.length

  const warnings = []
  if (attachments === undefined && aggregate.found > 0) {
    warnings.push('Harness attachment storage is unavailable; screenshots could not be displayed.')
  }
  if (aggregate.saveFailures > 0) warnings.push(`${aggregate.saveFailures} screenshot(s) failed Harness image validation or storage.`)
  if (aggregate.oversized > 0) warnings.push(`${aggregate.oversized} screenshot(s) exceeded the Harness count or byte limits.`)
  if (aggregate.invalid > 0) warnings.push(`${aggregate.invalid} screenshot field(s) were not a supported PNG, JPEG, WebP, or GIF image.`)
  if (aggregate.remoteFailures > 0) warnings.push(`${aggregate.remoteFailures} Volcengine screenshot URL(s) could not be downloaded safely.`)
  warnings.push(...aggregate.extraWarnings)

  const summary = aggregate.found === 0
    ? 'No screenshots have been captured for this run yet.'
    : `Harness stored ${aggregate.screenshots.length} of ${aggregate.found} screenshot(s) captured for this run.`
  return {
    text: `${JSON.stringify(redacted, null, 2)}\n\n${summary}${warnings.length === 0 ? '' : `\n${warnings.join('\n')}`}`,
    screenshots: [...aggregate.screenshots],
    screenshotPreviews: [...aggregate.screenshotPreviews],
    screenshotsFound: aggregate.found,
    warnings,
  }
}

function redactScreenshots(value, screenshotContext, state, depth) {
  if (depth > 64) return '[nested response omitted]'
  if (Array.isArray(value)) {
    return value.map(item => redactScreenshots(item, screenshotContext, state, depth + 1))
  }
  if (isRecord(value)) {
    const recordScreenshotContext = screenshotContext
      || Object.keys(value).some(key => SCREENSHOT_KEY.test(key))
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (typeof value.screenshot === 'string'
        && (/^download_?url$/i.test(key) || /^original_(?:screenshot|download_?url)$/i.test(key))) {
        return [key, '[redundant screenshot URL omitted; processed screenshot stored separately by Harness]']
      }
      return [
        key,
        redactScreenshots(child, recordScreenshotContext || SCREENSHOT_KEY.test(key), state, depth + 1),
      ]
    }))
  }
  if (typeof value !== 'string') return value

  const nested = parseNestedJson(value)
  if (nested !== undefined) {
    return JSON.stringify(redactScreenshots(nested, screenshotContext, state, depth + 1))
  }
  if (!screenshotContext) return value

  const parsed = parseEncodedImage(value, state.maxImageBytes)
  if (parsed.kind === 'image') {
    admitCandidate(parsed, state)
    return parsed.data === undefined
      ? '[screenshot omitted: exceeds Harness image limit]'
      : '[screenshot stored separately by Harness]'
  }
  if (parsed.kind === 'invalid') {
    const identity = digest(value)
    if (!state.seenRejected.has(identity)) {
      state.seenRejected.add(identity)
      state.invalid += 1
    }
    return '[screenshot omitted: invalid or unsupported image data]'
  }
  if (/^https?:\/\//i.test(value)) {
    const remote = parseRemoteScreenshotUrl(value)
    if (remote !== undefined) {
      if (!state.seenRemote.has(remote.identity)) {
        state.seenRemote.add(remote.identity)
        state.remoteCandidates.push(remote)
      }
      return '[Volcengine screenshot URL omitted from text output]'
    }
    const identity = digest(value)
    if (!state.seenRejected.has(identity)) {
      state.seenRejected.add(identity)
      state.invalid += 1
    }
    return '[remote screenshot URL omitted: host is not allowed]'
  }
  return value
}

function parseEncodedImage(value, maxImageBytes) {
  let encoded = value.trim()
  let explicitImage = false
  const dataUrl = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.exec(encoded)
  if (dataUrl !== null) {
    explicitImage = true
    encoded = encoded.slice(dataUrl[0].length)
  }
  encoded = encoded.replace(/\s+/g, '')
  if (encoded === '' || !BASE64_BODY.test(encoded) || encoded.length % 4 === 1) {
    return explicitImage || looksLikeBase64(value) ? { kind: 'invalid' } : { kind: 'other' }
  }

  const prefix = Buffer.from(encoded.slice(0, 64), 'base64')
  const mediaType = sniffMediaType(prefix)
  if (mediaType === undefined) {
    return explicitImage || looksLikeBase64(encoded) ? { kind: 'invalid' } : { kind: 'other' }
  }
  const estimatedBytes = Math.floor((encoded.length * 3) / 4) - paddingLength(encoded)
  if (estimatedBytes > maxImageBytes) {
    return { kind: 'image', identity: digest(encoded), mediaType, data: undefined }
  }
  const data = Buffer.from(encoded, 'base64')
  return { kind: 'image', identity: digest(data), mediaType, data }
}

function admitCandidate(candidate, state) {
  if (state.seen.has(candidate.identity)) return
  state.seen.add(candidate.identity)
  state.found += 1
  if (!state.mediaTypes.includes(candidate.mediaType)) {
    state.invalid += 1
  } else if (candidate.data === undefined
    || state.candidates.length >= state.maxImages
    || state.candidateBytes + candidate.data.byteLength > state.maxTotalBytes) {
    state.oversized += 1
  } else {
    state.candidates.push(candidate)
    state.candidateBytes += candidate.data.byteLength
  }
}

async function downloadRemoteScreenshots(state, attachments, options) {
  if (state.remoteCandidates.length === 0) return
  if (attachments === undefined) {
    state.remoteFailures += state.remoteCandidates.length
    return
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = positiveInteger(options.remoteTimeoutMs) ?? DEFAULT_REMOTE_TIMEOUT_MS
  for (const candidate of state.remoteCandidates) {
    try {
      const downloaded = await downloadRemoteScreenshot(fetchImpl, candidate.url, state.maxImageBytes, timeoutMs)
      if (downloaded.kind === 'oversized') {
        state.oversized += 1
      } else if (downloaded.kind === 'invalid') {
        state.invalid += 1
      } else {
        admitCandidate(downloaded, state)
      }
    } catch {
      state.remoteFailures += 1
    }
  }
}

async function downloadRemoteScreenshot(fetchImpl, url, maxBytes, timeoutMs) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    headers: { accept: 'image/png, image/jpeg, image/webp, image/gif' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error('Volcengine screenshot download failed')
  const declaredBytes = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) return { kind: 'oversized' }
  const data = await readBoundedBody(response, maxBytes)
  if (data === undefined) return { kind: 'oversized' }
  const mediaType = sniffMediaType(data)
  if (mediaType === undefined) return { kind: 'invalid' }
  return { kind: 'image', identity: digest(data), mediaType, data }
}

async function readBoundedBody(response, maxBytes) {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    const data = Buffer.from(await response.arrayBuffer())
    return data.byteLength <= maxBytes ? data : undefined
  }
  const chunks = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return undefined
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, bytes)
}

function parseRemoteScreenshotUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  const hostAllowed = url.hostname === 'volces.com' || url.hostname.endsWith('.volces.com')
  const portAllowed = url.port === '' || url.port === '443' || url.port === '9924'
  if (url.protocol !== 'https:' || !hostAllowed || !portAllowed || url.username !== '' || url.password !== '') {
    return undefined
  }
  return { url: url.href, identity: digest(url.href) }
}

function sniffMediaType(data) {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

function imageLimits(attachments) {
  const source = attachments?.imageLimits
  return {
    maxImageBytes: positiveInteger(source?.maxImageBytes) ?? DEFAULT_MAX_IMAGE_BYTES,
    maxImages: positiveInteger(source?.maxImagesPerMessage) ?? DEFAULT_MAX_IMAGES,
    maxTotalBytes: positiveInteger(source?.maxMessageImageBytes) ?? DEFAULT_MAX_TOTAL_BYTES,
    mediaTypes: Array.isArray(source?.mediaTypes)
      ? source.mediaTypes.filter(value => typeof value === 'string')
      : ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  }
}

function parseNestedJson(value) {
  const trimmed = value.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function looksLikeBase64(value) {
  const compact = value.trim().replace(/\s+/g, '')
  return compact.length >= 64 && BASE64_BODY.test(compact)
}

function paddingLength(value) {
  return value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
}

function extension(mediaType) {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length)
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
