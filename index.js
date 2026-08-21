/**
 * Volcengine Mobile Use Agent tools for DeepSeek Harness.
 *
 * The plugin keeps credentials in Harness's credential store, exposes the
 * remaining options through the `os-agent` live-settings namespace, signs
 * calls with Volcengine's official Node SDK, and maps the asynchronous API to
 * start/status/result tools.
 */

import { createHash, createHmac, randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'os-agent-plugin'
export const inject = ['tools', 'systemPrompt']

const API_HOST = 'open.volcengineapi.com'
const API_ORIGIN = `https://${API_HOST}`
const API_VERSION = '2023-08-01'
const API_REGION = 'cn-north-1'
const API_SERVICE = 'ipaas'

export const DEFAULT_ACCESS_KEY_REF = 'VOLC_ACCESSKEY'
export const DEFAULT_SECRET_KEY_REF = 'VOLC_SECRETKEY'
export const DEFAULT_MAX_STEPS = 100
export const DEFAULT_TIMEOUT_SECONDS = 120
export const OS_AGENT_SETTINGS_NAMESPACE = settingsNamespace('os-agent')

/** @typedef {{
 * accessKey?: string,
 * accessKeyEnv?: string,
 * secretKey?: string,
 * secretKeyEnv?: string,
 * productId?: string,
 * podId?: string,
 * maxSteps?: number,
 * timeout?: number,
 * systemPrompt?: string,
 * tosBucket?: string,
 * tosEndpoint?: string,
 * tosRegion?: string,
 * }} Config */

/** Runtime and settings schema. Secret literals exist for headless composition;
 * the web card writes them through the credential service instead. */
export const Config = z.object({
  accessKey: z.string().role('secret'),
  accessKeyEnv: z.string().role('credential-ref').default(DEFAULT_ACCESS_KEY_REF),
  secretKey: z.string().role('secret'),
  secretKeyEnv: z.string().role('credential-ref').default(DEFAULT_SECRET_KEY_REF),
  productId: z.string().default(''),
  podId: z.string().default(''),
  maxSteps: z.number().step(1).min(1).max(500).default(DEFAULT_MAX_STEPS),
  timeout: z.number().step(1).min(1).max(86_400).default(DEFAULT_TIMEOUT_SECONDS),
  systemPrompt: z.string().default(''),
  tosBucket: z.string().default(''),
  tosEndpoint: z.string().default(''),
  tosRegion: z.string().default(''),
})

/** A stable, model-readable output contract for all three tools. */
const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

/** Error whose public message never includes a credential or signed header. */
export class MobileUseError extends Error {
  constructor(message, code = 'MOBILE_USE_ERROR') {
    super(message)
    this.name = 'MobileUseError'
    this.code = code
  }
}

/**
 * Minimal signed Volcengine OpenAPI client. Node's crypto implementation follows
 * Volcengine's HMAC-SHA256 canonical-request format, while native fetch supplies
 * cancellation without bringing the SDK's unrelated service dependencies into
 * the Harness process.
 */
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

/**
 * Apply Volcengine's HMAC-SHA256 request signature in place.
 * @param {Record<string, any>} request - canonical request inputs.
 * @param {{ accessKeyId: string, secretKey: string }} credentials - Volcengine credentials.
 * @param {Date} date - signing timestamp.
 */
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

/** Register the live settings and the model-facing tools. */
export function apply(ctx, config = {}) {
  let current = () => config
  installSettingsSection(ctx, OS_AGENT_SETTINGS_NAMESPACE, Config, config, {
    setSource: source => { current = source },
    onChange: () => {},
  })

  ctx.systemPrompt.section({
    name: 'tool:os-agent-mobile-use',
    order: 116,
    text: 'Use mobile_use_start_task to start a Volcengine cloud-phone task. Save the returned RunId, inspect progress with mobile_use_get_status, and call mobile_use_get_result when the task is complete. Never invent ProductId, PodId, or credentials.',
  })

  ctx.tools.register(defineTool({
    name: 'mobile_use_start_task',
    description: 'Start one Volcengine Mobile Use Agent task on the configured cloud phone. Returns a RunId for later status and result calls.',
    parameters: {
      task: { type: 'string', required: true, description: 'Natural-language task for the mobile agent to complete.' },
      run_name: { type: 'string', description: 'Optional caller-visible run name. A unique name is generated when omitted.' },
      thread_id: { type: 'string', description: 'Optional thread id for continuing a prior Mobile Use conversation.' },
      screen_record: { type: 'boolean', description: 'Whether Volcengine should record the run. TOS configuration is required when true.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const options = await resolveOptions(ctx, current())
      const body = buildRunAgentTaskOneStepBody(options, args)
      const response = await options.client.call('RunAgentTaskOneStep', 'POST', body, exec.signal)
      return JSON.stringify({ action: 'RunAgentTaskOneStep', ...response }, null, 2)
    },
    presentCall: args => ({ card: 'generic', title: `Start mobile task: ${truncate(args.task, 72)}`, kind: 'execute' }),
  }))

  ctx.tools.register(defineTool({
    name: 'mobile_use_get_status',
    description: 'Read the current step and status of a Volcengine Mobile Use Agent run.',
    parameters: {
      run_id: { type: 'string', required: true, description: 'RunId returned by mobile_use_start_task.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const options = await resolveOptions(ctx, current(), { requireDevice: false })
      const response = await options.client.call('ListAgentRunCurrentStep', 'GET', { RunId: requireText(args.run_id, 'run_id') }, exec.signal)
      return JSON.stringify({ action: 'ListAgentRunCurrentStep', ...response }, null, 2)
    },
    presentCall: args => ({ card: 'generic', title: `Check mobile task ${truncate(args.run_id, 36)}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'mobile_use_get_result',
    description: 'Fetch the final result of a completed Volcengine Mobile Use Agent run.',
    parameters: {
      run_id: { type: 'string', required: true, description: 'RunId returned by mobile_use_start_task.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const options = await resolveOptions(ctx, current(), { requireDevice: false })
      const response = await options.client.call('GetAgentResult', 'GET', { RunId: requireText(args.run_id, 'run_id') }, exec.signal)
      return JSON.stringify({ action: 'GetAgentResult', ...response }, null, 2)
    },
    presentCall: args => ({ card: 'generic', title: `Read mobile result ${truncate(args.run_id, 36)}`, kind: 'read' }),
  }))
}

/** Resolve live settings and write-only credentials immediately before a call. */
export async function resolveOptions(ctx, config, behavior = {}) {
  const accessKey = await resolveCredential(ctx, config.accessKey, config.accessKeyEnv, DEFAULT_ACCESS_KEY_REF)
  const secretKey = await resolveCredential(ctx, config.secretKey, config.secretKeyEnv, DEFAULT_SECRET_KEY_REF)
  if (accessKey === '') throw new MobileUseError('OS Agent Plugin is not configured: AccessKey is missing.', 'MOBILE_USE_NOT_CONFIGURED')
  if (secretKey === '') throw new MobileUseError('OS Agent Plugin is not configured: Secret Key is missing.', 'MOBILE_USE_NOT_CONFIGURED')

  const productId = trimmed(config.productId)
  const podId = trimmed(config.podId)
  if (behavior.requireDevice !== false && productId === '') {
    throw new MobileUseError('OS Agent Plugin is not configured: Product Id is missing.', 'MOBILE_USE_NOT_CONFIGURED')
  }
  if (behavior.requireDevice !== false && podId === '') {
    throw new MobileUseError('OS Agent Plugin is not configured: PodId is missing.', 'MOBILE_USE_NOT_CONFIGURED')
  }

  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS
  const timeout = config.timeout ?? DEFAULT_TIMEOUT_SECONDS
  assertIntegerRange(maxSteps, 1, 500, 'max steps')
  assertIntegerRange(timeout, 1, 86_400, 'timeout')

  const tos = {
    bucket: trimmed(config.tosBucket),
    endpoint: trimmed(config.tosEndpoint),
    region: trimmed(config.tosRegion),
  }
  const tosCount = Object.values(tos).filter(Boolean).length
  if (tosCount !== 0 && tosCount !== 3) {
    throw new MobileUseError('TOS bucket, endpoint, and region must be configured together.', 'MOBILE_USE_INVALID_TOS_CONFIG')
  }

  return {
    client: new VolcengineMobileUseClient({ accessKeyId: accessKey, secretKey }),
    productId,
    podId,
    maxSteps,
    timeout,
    systemPrompt: trimmed(config.systemPrompt),
    tos: tosCount === 3 ? tos : undefined,
  }
}

/** Build exactly the current RunAgentTaskOneStep body described by Volcengine. */
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

async function resolveCredential(ctx, literal, declaredRef, fallbackRef) {
  const configuredLiteral = trimmed(literal)
  if (configuredLiteral !== '') return configuredLiteral
  const ref = credentialRef(trimmed(declaredRef) || fallbackRef)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(ref))?.value ?? ''
  return launchEnvironmentOf(ctx).get(ref)?.value ?? ''
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

function assertIntegerRange(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MobileUseError(`${label} must be an integer from ${min} to ${max}.`, 'MOBILE_USE_INVALID_CONFIG')
  }
}

function requireText(value, label) {
  const text = trimmed(value)
  if (text === '') throw new MobileUseError(`${label} must be a non-empty string.`, 'MOBILE_USE_INVALID_ARGUMENT')
  return text
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
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

function truncate(value, length) {
  const text = typeof value === 'string' ? value : ''
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`
}
