/** Volcengine Mobile Use OpenAPI transport and request construction. */

import { createHash, createHmac, randomUUID } from 'node:crypto'

const API_HOST = 'open.volcengineapi.com'
const API_ORIGIN = `https://${API_HOST}`
const API_VERSION = '2023-08-01'
const API_REGION = 'cn-north-1'
const API_SERVICE = 'ipaas'

export const DEFAULT_MAX_STEPS = 100
export const DEFAULT_TIMEOUT_SECONDS = 120

/** Error whose public message never includes a credential or signed header. */
export class MobileUseError extends Error {
  constructor(message, code = 'MOBILE_USE_ERROR') {
    super(message)
    this.name = 'MobileUseError'
    this.code = code
  }
}

/** Minimal signed client for the three Mobile Use Agent operations. */
export class VolcengineMobileUseClient {
  constructor(credentials, options = {}) {
    this.credentials = credentials
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.now = options.now ?? (() => new Date())
    this.origin = options.origin ?? API_ORIGIN
  }

  async call(action, method, input, signal) {
    const body = method === 'POST' ? JSON.stringify(input) : undefined
    const request = {
      region: API_REGION,
      method,
      pathname: '/',
      params: {
        Action: action,
        Version: API_VERSION,
        ...(method === 'GET' ? input : {}),
      },
      headers: {
        ...(method === 'POST' ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      },
      ...(body === undefined ? {} : { body }),
    }
    signRequest(request, this.credentials, this.now())

    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(request.params)) {
      if (value !== undefined && value !== null) query.append(key, String(value))
    }

    let response
    try {
      response = await this.fetchImpl(`${this.origin}/?${query.toString()}`, {
        method,
        headers: request.headers,
        ...(body === undefined ? {} : { body }),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (error instanceof MobileUseError) throw error
      throw new MobileUseError(`Volcengine Mobile Use request failed: ${safeErrorText(error)}`, 'MOBILE_USE_REQUEST_FAILED')
    }

    const payload = await parseResponseBody(response)
    const metadata = isRecord(payload.ResponseMetadata) ? payload.ResponseMetadata : undefined
    const apiError = metadata !== undefined && isRecord(metadata.Error) ? metadata.Error : undefined
    if (!response.ok || apiError !== undefined) {
      const code = stringValue(apiError?.Code) ?? `HTTP_${response.status}`
      const message = stringValue(apiError?.Message) ?? `HTTP ${response.status}`
      const requestId = stringValue(metadata?.RequestId)
      throw new MobileUseError(
        `Volcengine Mobile Use API rejected the request (${code}): ${message}${requestId === undefined ? '' : ` [request ${requestId}]`}`,
        code,
      )
    }

    return {
      requestId: stringValue(metadata?.RequestId),
      result: payload.Result ?? payload,
    }
  }
}

/** Apply Volcengine's HMAC-SHA256 request signature in place. */
export function signRequest(request, credentials, date) {
  const datetime = date.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  request.params = Object.fromEntries(
    Object.entries(request.params ?? {})
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([left], [right]) => compareCodeUnits(left, right)),
  )
  request.headers['X-Date'] = datetime
  if (request.body !== undefined && request.body !== '') {
    request.headers['X-Content-Sha256'] = sha256(request.body)
  }

  const signableHeaders = Object.entries(request.headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).replace(/\s+/g, ' ').trim()])
    .filter(([key]) => !UNSIGNABLE_HEADERS.has(key))
    .sort(([left], [right]) => compareCodeUnits(left, right))
  const signedHeaderNames = signableHeaders.map(([key]) => key).join(';')
  const canonicalHeaders = signableHeaders.map(([key, value]) => `${key}:${value}`).join('\n')
  const canonicalRequest = [
    request.method.toUpperCase(),
    request.pathname ?? '/',
    canonicalQuery(request.params),
    `${canonicalHeaders}\n`,
    signedHeaderNames,
    request.headers['X-Content-Sha256'] ?? sha256(''),
  ].join('\n')
  const datePart = datetime.slice(0, 8)
  const scope = `${datePart}/${request.region}/${API_SERVICE}/request`
  const stringToSign = ['HMAC-SHA256', datetime, scope, sha256(canonicalRequest)].join('\n')
  const dateKey = hmac(credentials.secretKey, datePart)
  const regionKey = hmac(dateKey, request.region)
  const serviceKey = hmac(regionKey, API_SERVICE)
  const signingKey = hmac(serviceKey, 'request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  request.headers.Authorization = `HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`
}

const UNSIGNABLE_HEADERS = new Set([
  'authorization', 'content-type', 'content-length', 'user-agent',
  'presigned-expires', 'expect',
])

/** Build the RunAgentTaskOneStep request body from resolved options and tool arguments. */
export function buildRunAgentTaskOneStepBody(options, args) {
  const task = requireText(args.task, 'task')
  if (args.screen_record === true && options.tos === undefined) {
    throw new MobileUseError('Screen recording requires TOS bucket, endpoint, and region.', 'MOBILE_USE_INVALID_TOS_CONFIG')
  }
  return {
    RunName: trimmed(args.run_name) || `dsh-os-agent-${randomUUID()}`,
    PodId: options.podId,
    ProductId: options.productId,
    UserPrompt: task,
    MaxStep: options.maxSteps,
    Timeout: options.timeout,
    ...(trimmed(args.thread_id) === '' ? {} : { ThreadId: trimmed(args.thread_id) }),
    ...(options.systemPrompt === '' ? {} : { SystemPrompt: options.systemPrompt }),
    ...(options.tos === undefined
      ? {}
      : {
          TosBucket: options.tos.bucket,
          TosEndpoint: options.tos.endpoint,
          TosRegion: options.tos.region,
        }),
    ...(args.screen_record === true ? { IsScreenRecord: true } : {}),
  }
}

export function assertIntegerRange(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MobileUseError(`${label} must be an integer from ${min} to ${max}.`, 'MOBILE_USE_INVALID_CONFIG')
  }
}

export function requireText(value, label) {
  const text = trimmed(value)
  if (text === '') throw new MobileUseError(`${label} must be a non-empty string.`, 'MOBILE_USE_INVALID_ARGUMENT')
  return text
}

export function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function canonicalQuery(params) {
  return Object.entries(params)
    .flatMap(([key, value]) => Array.isArray(value)
      ? value.map(item => [key, item])
      : [[key, value]])
    .map(([key, value]) => `${uriEscape(key)}=${uriEscape(String(value))}`)
    .join('&')
}

function uriEscape(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest()
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

async function parseResponseBody(response) {
  const text = await response.text()
  if (text === '') return {}
  try {
    const value = JSON.parse(text)
    if (!isRecord(value)) throw new TypeError('response is not an object')
    return value
  } catch (_error) {
    throw new MobileUseError(`Volcengine Mobile Use returned a non-JSON response (HTTP ${response.status}).`, 'MOBILE_USE_MALFORMED_RESPONSE')
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function safeErrorText(error) {
  return error instanceof Error ? error.message : String(error)
}
