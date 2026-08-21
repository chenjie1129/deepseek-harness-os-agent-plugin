import { describe, expect, it, vi } from 'vitest'
import {
  MobileUseError,
  VolcengineMobileUseClient,
  buildRunAgentTaskOneStepBody,
} from '../volcengine.js'

describe('Volcengine Mobile Use client', () => {
  it('matches the official signing fixture and sends every configured field', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ResponseMetadata: { RequestId: 'request-1' },
      Result: { RunId: 'run-1', RunName: 'configured-name', ThreadId: 'thread-1' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new VolcengineMobileUseClient(
      { accessKeyId: 'test-access', secretKey: 'test-secret' },
      { fetchImpl, now: () => new Date('2026-08-21T00:00:00.000Z') },
    )
    const body = buildRunAgentTaskOneStepBody({
      productId: 'product-1', podId: 'pod-1', maxSteps: 12, timeout: 90,
      systemPrompt: 'Be careful',
      tos: { bucket: 'bucket-1', endpoint: 'tos-cn-beijing.volces.com', region: 'cn-beijing' },
    }, {
      task: 'Open Settings', run_name: 'configured-name', thread_id: 'thread-1', screen_record: true,
    })

    const result = await client.call('RunAgentTaskOneStep', 'POST', body)

    expect(result).toEqual({
      requestId: 'request-1',
      result: { RunId: 'run-1', RunName: 'configured-name', ThreadId: 'thread-1' },
    })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://open.volcengineapi.com/?Action=RunAgentTaskOneStep&Version=2023-08-01')
    expect(init.method).toBe('POST')
    const authorization = new Headers(init.headers).get('authorization')
    expect(authorization).toMatch(/^HMAC-SHA256 Credential=test-access\/20260821\/cn-north-1\/ipaas\/request,/)
    expect(authorization).toContain('Signature=cf8bc2a432a777a4814d4976ccb98ff4f355c939eedfc230c4133493d5001a41')
    expect(JSON.parse(String(init.body))).toEqual({
      RunName: 'configured-name', PodId: 'pod-1', ProductId: 'product-1', UserPrompt: 'Open Settings',
      MaxStep: 12, Timeout: 90, ThreadId: 'thread-1', SystemPrompt: 'Be careful',
      TosBucket: 'bucket-1', TosEndpoint: 'tos-cn-beijing.volces.com', TosRegion: 'cn-beijing',
      IsScreenRecord: true,
    })
  })

  it('signs status reads as GET requests', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ Result: { Status: 2 } }), { status: 200 }))
    const client = new VolcengineMobileUseClient(
      { accessKeyId: 'test-access', secretKey: 'test-secret' },
      { fetchImpl, now: () => new Date('2026-08-21T00:00:00.000Z') },
    )
    await client.call('ListAgentRunCurrentStep', 'GET', { RunId: 'run-1' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toContain('Action=ListAgentRunCurrentStep')
    expect(url).toContain('RunId=run-1')
    expect(init.method).toBe('GET')
    expect(init).not.toHaveProperty('body')
  })

  it('returns a sanitized API error and never includes the secret', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ResponseMetadata: { RequestId: 'request-denied', Error: { Code: 'AccessDenied', Message: 'permission denied' } },
    }), { status: 403 }))
    const client = new VolcengineMobileUseClient(
      { accessKeyId: 'test-access', secretKey: 'super-secret-value' },
      { fetchImpl, now: () => new Date('2026-08-21T00:00:00.000Z') },
    )
    await expect(client.call('GetAgentResult', 'GET', { RunId: 'run-1' }))
      .rejects.toMatchObject<Partial<MobileUseError>>({ code: 'AccessDenied' })
    await expect(client.call('GetAgentResult', 'GET', { RunId: 'run-1' }))
      .rejects.not.toThrow('super-secret-value')
  })

  it('requires complete TOS configuration before screen recording', () => {
    expect(() => buildRunAgentTaskOneStepBody({
      productId: 'product-1', podId: 'pod-1', maxSteps: 100, timeout: 120,
      systemPrompt: '', tos: undefined,
    }, { task: 'Open Settings', screen_record: true })).toThrow(/requires TOS/i)
  })
})
