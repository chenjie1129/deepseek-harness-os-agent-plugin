import { describe, expect, it, vi } from 'vitest'
import { OsAgentCardController, parseDraft } from '../src/client/controller.ts'

const VIEW = {
  ok: true as const,
  revision: 2,
  writable: true,
  config: {
    productId: 'product-1', podId: 'pod-1', maxSteps: 100, timeout: 120,
    systemPrompt: '', tosBucket: '', tosEndpoint: '', tosRegion: '',
  },
  credentials: {
    accessKey: { configured: true, writable: true },
    secretKey: { configured: false, writable: true },
  },
}

describe('OS Agent browser controller', () => {
  it('loads, validates, stages secrets, and saves without reading them back', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(VIEW), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...VIEW, revision: 3 }), { status: 200 }))
    const controller = new OsAgentCardController(fetchImpl)
    const face = controller.inject()
    await vi.waitFor(() => { expect(face.hooks.osAgentCard.getSnapshot().status).toBe('ready') })

    face.edit('maxSteps', '0')
    expect(face.hooks.osAgentCard.getSnapshot().invalid).toBe(true)
    face.edit('maxSteps', '40')
    face.edit('accessKey', 'new-access')
    expect(face.hooks.osAgentCard.getSnapshot()).toMatchObject({ dirty: true, invalid: false })
    face.save()
    await vi.waitFor(() => { expect(fetchImpl).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(face.hooks.osAgentCard.getSnapshot().saving).toBe(false) })

    const [, init] = fetchImpl.mock.calls[1]!
    const payload = JSON.parse(String(init.body))
    expect(payload).toMatchObject({ expectedRevision: 2, accessKey: 'new-access', config: { maxSteps: 40 } })
    expect(face.hooks.osAgentCard.getSnapshot().accessKey).toBe('')
    controller.dispose()
  })

  it('requires all TOS fields together', () => {
    expect(parseDraft({
      productId: '', podId: '', maxSteps: '100', timeout: '120', systemPrompt: '',
      tosBucket: 'bucket', tosEndpoint: '', tosRegion: '',
    })).toBeUndefined()
  })
})
