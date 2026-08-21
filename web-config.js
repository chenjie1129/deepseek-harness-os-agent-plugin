/** Plugin-owned HTTP configuration endpoint for the browser client. */

export const CONFIG_ENDPOINT = '/api/os-agent-plugin/config'
const MAX_BODY_BYTES = 32 * 1024
const CONFIG_FIELDS = [
  'productId', 'podId', 'maxSteps', 'timeout', 'systemPrompt',
  'tosBucket', 'tosEndpoint', 'tosRegion',
]

/** Create the exact-route handler mounted by the runtime plugin. */
export function createConfigRoute(options) {
  return async (req, res) => {
    setCommonHeaders(res)
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden' })
      return
    }
    if (req.method === 'GET') {
      await sendCurrent(options, res)
      return
    }
    if (req.method !== 'PUT') {
      res.setHeader('allow', 'GET, PUT')
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const input = await readJson(req)
      if (!isRecord(input) || !Number.isSafeInteger(input.expectedRevision)) {
        throw new TypeError('expectedRevision must be an integer')
      }
      const config = normalizeConfig(input.config)
      const ops = CONFIG_FIELDS.map(field => ({ op: 'set', path: [field], value: config[field] }))
      await options.settings.mutate(options.namespace, ops, input.expectedRevision)
      const refs = options.credentialRefs()
      const accessKey = optionalSecret(input.accessKey, 'accessKey')
      const secretKey = optionalSecret(input.secretKey, 'secretKey')
      if (accessKey !== undefined) await options.credentials.set(refs.accessKey, accessKey)
      if (secretKey !== undefined) await options.credentials.set(refs.secretKey, secretKey)
      await sendCurrent(options, res)
    } catch (error) {
      const conflict = error?.code === 'SETTINGS_CONFLICT'
      const invalid = error instanceof TypeError || error?.code === 'MOBILE_USE_INVALID_TOS_CONFIG'
      sendJson(res, conflict ? 409 : invalid ? 400 : 500, {
        ok: false,
        error: conflict ? 'configuration changed; reload and try again' : invalid ? error.message : 'configuration update failed',
      })
    }
  }
}

/** Validate and normalize a browser-supplied non-secret configuration. */
export function normalizeConfig(value) {
  if (!isRecord(value)) throw new TypeError('config must be an object')
  const config = {
    productId: boundedString(value.productId, 'productId', 1024),
    podId: boundedString(value.podId, 'podId', 1024),
    maxSteps: boundedInteger(value.maxSteps, 'maxSteps', 1, 500),
    timeout: boundedInteger(value.timeout, 'timeout', 1, 86_400),
    systemPrompt: boundedString(value.systemPrompt, 'systemPrompt', 20_000),
    tosBucket: boundedString(value.tosBucket, 'tosBucket', 2048),
    tosEndpoint: boundedString(value.tosEndpoint, 'tosEndpoint', 2048),
    tosRegion: boundedString(value.tosRegion, 'tosRegion', 256),
  }
  const tosCount = [config.tosBucket, config.tosEndpoint, config.tosRegion].filter(Boolean).length
  if (tosCount !== 0 && tosCount !== 3) {
    const error = new TypeError('TOS bucket, endpoint, and region must be configured together')
    error.code = 'MOBILE_USE_INVALID_TOS_CONFIG'
    throw error
  }
  return config
}

async function sendCurrent(options, res) {
  const descriptor = options.settings.describe({ redactSecrets: true })
    .find(candidate => candidate.ns === options.namespace)
  if (descriptor === undefined || !isRecord(descriptor.value)) {
    sendJson(res, 503, { ok: false, error: 'OS Agent settings are unavailable' })
    return
  }
  const refs = options.credentialRefs()
  const [accessKey, secretKey] = await Promise.all([
    options.credentials.describe(refs.accessKey),
    options.credentials.describe(refs.secretKey),
  ])
  const source = descriptor.value
  sendJson(res, 200, {
    ok: true,
    revision: descriptor.revision,
    writable: options.settings.writable,
    config: Object.fromEntries(CONFIG_FIELDS.map(field => [field, source[field]])),
    credentials: {
      accessKey: { configured: accessKey.configured, writable: accessKey.writable },
      secretKey: { configured: secretKey.configured, writable: secretKey.writable },
    },
  })
}

function isTrustedRequest(req) {
  if (req.headers['x-os-agent-plugin'] !== '1') return false
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite !== undefined && !['same-origin', 'same-site', 'none'].includes(fetchSite)) return false
  const origin = req.headers.origin
  const host = req.headers.host
  return origin === undefined || host === undefined || origin === `http://${host}` || origin === `https://${host}`
}

async function readJson(req) {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new TypeError('request body is too large')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new TypeError('request body is too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new TypeError('request body must be JSON')
  }
}

function optionalSecret(value, label) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > 8192) throw new TypeError(`${label} must be a string of at most 8192 characters`)
  return value
}

function boundedString(value, label, maxLength) {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new TypeError(`${label} must be a string of at most ${maxLength} characters`)
  }
  return value.trim()
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer from ${min} to ${max}`)
  }
  return value
}

function setCommonHeaders(res) {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
}

function sendJson(res, status, value) {
  res.writeHead(status)
  res.end(JSON.stringify(value))
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
