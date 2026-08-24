/** Extract, redact, and persist Volcengine Mobile Use task screenshots. */

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_IMAGES = 20
const DEFAULT_MAX_TOTAL_BYTES = 20 * 1024 * 1024
const SCREENSHOT_KEY = /(?:screen[\s_-]*shot|image|base64)/i
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Turn a Mobile Use response into text plus durable Harness image references.
 * Screenshot bytes are always removed from the text projection, including when
 * an attachment cannot be saved.
 */
export async function createScreenshotResult(value, attachments) {
  const limits = imageLimits(attachments)
  const state = {
    candidates: [],
    seen: new Set(),
    found: 0,
    invalid: 0,
    oversized: 0,
    candidateBytes: 0,
    maxImageBytes: limits.maxImageBytes,
    maxImages: limits.maxImages,
    maxTotalBytes: limits.maxTotalBytes,
    mediaTypes: limits.mediaTypes,
  }
  const redacted = redactScreenshots(value, false, state, 0)
  const admitted = []
  let admittedBytes = 0
  for (const candidate of state.candidates) {
    if (admitted.length >= limits.maxImages || admittedBytes + candidate.data.byteLength > limits.maxTotalBytes) {
      state.oversized += 1
      continue
    }
    admitted.push(candidate)
    admittedBytes += candidate.data.byteLength
  }

  const screenshots = attachments === undefined
    ? []
    : (await Promise.all(admitted.map(async (candidate, index) => {
        try {
          return await attachments.saveImage({
            data: candidate.data,
            mediaType: candidate.mediaType,
            name: `mobile-use-step-${String(index + 1)}.${extension(candidate.mediaType)}`,
          })
        } catch {
          return undefined
        }
      }))).filter(Boolean)

  const warnings = []
  if (attachments === undefined && state.found > 0) {
    warnings.push('Harness attachment storage is unavailable; screenshots could not be displayed.')
  }
  const saveFailures = attachments === undefined ? 0 : admitted.length - screenshots.length
  if (saveFailures > 0) warnings.push(`${saveFailures} screenshot(s) failed Harness image validation or storage.`)
  if (state.oversized > 0) warnings.push(`${state.oversized} screenshot(s) exceeded the Harness count or byte limits.`)
  if (state.invalid > 0) warnings.push(`${state.invalid} screenshot field(s) were not a supported PNG, JPEG, WebP, or GIF image.`)

  const summary = state.found === 0
    ? 'No screenshots were present in the Volcengine response.'
    : `Harness stored ${screenshots.length} of ${state.found} screenshot(s) for Web UI display.`
  return {
    text: `${JSON.stringify(redacted, null, 2)}\n\n${summary}${warnings.length === 0 ? '' : `\n${warnings.join('\n')}`}`,
    screenshots,
    screenshotsFound: state.found,
    warnings,
  }
}

function redactScreenshots(value, screenshotContext, state, depth) {
  if (depth > 64) return '[nested response omitted]'
  if (Array.isArray(value)) {
    return value.map(item => redactScreenshots(item, screenshotContext, state, depth + 1))
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      redactScreenshots(child, screenshotContext || SCREENSHOT_KEY.test(key), state, depth + 1),
    ]))
  }
  if (!screenshotContext || typeof value !== 'string') return value

  const nested = parseNestedJson(value)
  if (nested !== undefined) {
    return JSON.stringify(redactScreenshots(nested, true, state, depth + 1))
  }

  const parsed = parseEncodedImage(value, state.maxImageBytes)
  if (parsed.kind === 'image') {
    if (!state.seen.has(parsed.identity)) {
      state.seen.add(parsed.identity)
      state.found += 1
      if (!state.mediaTypes.includes(parsed.mediaType)) {
        state.invalid += 1
      } else if (parsed.data === undefined
        || state.candidates.length >= state.maxImages
        || state.candidateBytes + parsed.data.byteLength > state.maxTotalBytes) {
        state.oversized += 1
      } else {
        state.candidates.push(parsed)
        state.candidateBytes += parsed.data.byteLength
      }
    }
    return parsed.data === undefined
      ? '[screenshot omitted: exceeds Harness image limit]'
      : '[screenshot stored separately by Harness]'
  }
  if (parsed.kind === 'invalid') {
    state.invalid += 1
    return '[screenshot omitted: invalid or unsupported image data]'
  }
  if (/^https?:\/\//i.test(value)) {
    state.invalid += 1
    return '[remote screenshot URL omitted; enable base64 screenshots for safe display]'
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
    return { kind: 'image', identity: encoded, mediaType, data: undefined }
  }
  const data = Buffer.from(encoded, 'base64')
  return { kind: 'image', identity: encoded, mediaType, data }
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
