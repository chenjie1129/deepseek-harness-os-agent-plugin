import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createConfigRoute, normalizeConfig } from '../web-config.js'

const BASE_CONFIG = {
  productId: 'product-1', podId: 'pod-1', maxSteps: 100, timeout: 120,
  systemPrompt: '', tosBucket: '', tosEndpoint: '', tosRegion: '',
}

describe('plugin-owned configuration endpoint', () => {
  it('rejects incomplete TOS and invalid numeric ranges', () => {
    expect(() => normalizeConfig({ ...BASE_CONFIG, maxSteps: 0 })).toThrow(/maxSteps/)
    expect(() => normalizeConfig({ ...BASE_CONFIG, tosBucket: 'bucket' })).toThrow(/configured together/)
  })

  it('returns only redacted settings and credential status', async () => {
    const harness = createHarness()
    const route = createConfigRoute(harness.options)
    const response = createResponse()
    await route(createRequest('GET'), response)
    const body = JSON.parse(response.body)
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true, revision: 3, config: BASE_CONFIG,
      credentials: { accessKey: { configured: true }, secretKey: { configured: false } },
    })
    expect(response.body).not.toContain('stored-access-key')
  })

  it('persists validated settings and write-only credentials', async () => {
    const harness = createHarness()
    const route = createConfigRoute(harness.options)
    const response = createResponse()
    await route(createRequest('PUT', {
      expectedRevision: 3,
      config: { ...BASE_CONFIG, maxSteps: 40, systemPrompt: 'Be careful' },
      accessKey: 'new-access', secretKey: 'new-secret',
    }), response)
    expect(response.status).toBe(200)
    expect(harness.mutate).toHaveBeenCalledOnce()
    expect(harness.set).toHaveBeenCalledWith('VOLC_ACCESSKEY', 'new-access')
    expect(harness.set).toHaveBeenCalledWith('VOLC_SECRETKEY', 'new-secret')
    expect(response.body).not.toContain('new-access')
    expect(response.body).not.toContain('new-secret')
  })

  it('requires the plugin request header', async () => {
    const harness = createHarness()
    const route = createConfigRoute(harness.options)
    const response = createResponse()
    await route(createRequest('GET', undefined, false), response)
    expect(response.status).toBe(403)
  })
})

function createHarness() {
  let revision = 3
  let config = { ...BASE_CONFIG }
  const mutate = vi.fn(async (_ns, ops) => {
    for (const op of ops) config = { ...config, [op.path[0]]: op.value }
    revision += 1
  })
  const set = vi.fn(async () => {})
  return {
    mutate,
    set,
    options: {
      namespace: 'os-agent',
      settings: {
        writable: true,
        describe: () => [{ ns: 'os-agent', revision, value: { ...config, accessKey: 'stored-access-key' } }],
        mutate,
      },
      credentials: {
        describe: vi.fn(async ref => ({ configured: ref === 'VOLC_ACCESSKEY', writable: true })),
        set,
      },
      credentialRefs: () => ({ accessKey: 'VOLC_ACCESSKEY', secretKey: 'VOLC_SECRETKEY' }),
    },
  }
}

function createRequest(method: string, body?: unknown, trusted = true) {
  const json = body === undefined ? '' : JSON.stringify(body)
  return Object.assign(Readable.from(json === '' ? [] : [json]), {
    method,
    headers: {
      ...(trusted ? { 'x-os-agent-plugin': '1' } : {}),
      host: '127.0.0.1:3081',
      origin: 'http://127.0.0.1:3081',
      ...(json === '' ? {} : { 'content-length': String(Buffer.byteLength(json)) }),
    },
  })
}

function createResponse() {
  return {
    status: 0,
    body: '',
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) { this.headers.set(name, value) },
    writeHead(status: number) { this.status = status },
    end(body = '') { this.body = body },
  }
}
