/** Browser-side staged form and plugin-owned configuration transport. */

export const CONFIG_ENDPOINT = '/api/os-agent-plugin/config'

export interface OsAgentConfig {
  productId: string
  podId: string
  maxSteps: number
  timeout: number
  systemPrompt: string
  tosBucket: string
  tosEndpoint: string
  tosRegion: string
}

type DraftField = keyof OsAgentConfig
type Draft = Record<DraftField, string>

interface CredentialState {
  configured: boolean
  writable: boolean
}

interface ApiView {
  ok: true
  revision: number
  writable: boolean
  config: OsAgentConfig
  credentials: {
    accessKey: CredentialState
    secretKey: CredentialState
  }
}

export interface OsAgentCardState {
  status: 'loading' | 'ready' | 'failed'
  revision: number
  writable: boolean
  draft: Draft
  accessKey: string
  secretKey: string
  accessKeyConfigured: boolean
  secretKeyConfigured: boolean
  accessKeyWritable: boolean
  secretKeyWritable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  error?: string
}

export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface OsAgentCardFace {
  hooks: { osAgentCard: SnapshotStore<OsAgentCardState> }
  edit(field: DraftField | 'accessKey' | 'secretKey', value: string): void
  save(): void
  discard(): void
  reload(): void
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const EMPTY_DRAFT: Draft = {
  productId: '',
  podId: '',
  maxSteps: '100',
  timeout: '120',
  systemPrompt: '',
  tosBucket: '',
  tosEndpoint: '',
  tosRegion: '',
}

/** Owns one card's load, draft, validation, and save lifecycle. */
export class OsAgentCardController {
  private baseline: Draft = { ...EMPTY_DRAFT }
  private state: OsAgentCardState = {
    status: 'loading',
    revision: 0,
    writable: false,
    draft: { ...EMPTY_DRAFT },
    accessKey: '',
    secretKey: '',
    accessKeyConfigured: false,
    secretKeyConfigured: false,
    accessKeyWritable: true,
    secretKeyWritable: true,
    dirty: false,
    invalid: false,
    saving: false,
  }
  private readonly listeners = new Set<() => void>()
  private readonly abort = new AbortController()
  private disposed = false

  constructor(private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)) {
    void this.load()
  }

  inject(): OsAgentCardFace {
    return {
      hooks: {
        osAgentCard: {
          getSnapshot: () => this.state,
          subscribe: listener => {
            this.listeners.add(listener)
            return () => { this.listeners.delete(listener) }
          },
        },
      },
      edit: (field, value) => { this.edit(field, value) },
      save: () => { void this.save() },
      discard: () => { this.discard() },
      reload: () => { void this.load() },
    }
  }

  dispose(): void {
    this.disposed = true
    this.abort.abort()
    this.listeners.clear()
  }

  private edit(field: DraftField | 'accessKey' | 'secretKey', value: string): void {
    if (field === 'accessKey' || field === 'secretKey') {
      this.publish({ ...this.state, [field]: value, error: undefined })
      return
    }
    this.publish({
      ...this.state,
      draft: { ...this.state.draft, [field]: value },
      error: undefined,
    })
  }

  private discard(): void {
    this.publish({
      ...this.state,
      draft: { ...this.baseline },
      accessKey: '',
      secretKey: '',
      error: undefined,
    })
  }

  private async load(): Promise<void> {
    this.publish({ ...this.state, status: 'loading', error: undefined })
    try {
      const view = await request(this.fetchImpl, 'GET', undefined, this.abort.signal)
      this.accept(view)
    } catch (error) {
      if (this.disposed) return
      this.publish({
        ...this.state,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async save(): Promise<void> {
    const parsed = parseDraft(this.state.draft)
    if (!this.state.writable || this.state.saving || parsed === undefined) return
    this.publish({ ...this.state, saving: true, error: undefined })
    try {
      const view = await request(this.fetchImpl, 'PUT', {
        expectedRevision: this.state.revision,
        config: parsed,
        ...(this.state.accessKey === '' ? {} : { accessKey: this.state.accessKey }),
        ...(this.state.secretKey === '' ? {} : { secretKey: this.state.secretKey }),
      }, this.abort.signal)
      this.accept(view)
    } catch (error) {
      if (this.disposed) return
      this.publish({
        ...this.state,
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private accept(view: ApiView): void {
    if (this.disposed) return
    const draft = toDraft(view.config)
    this.baseline = draft
    this.publish({
      status: 'ready',
      revision: view.revision,
      writable: view.writable,
      draft: { ...draft },
      accessKey: '',
      secretKey: '',
      accessKeyConfigured: view.credentials.accessKey.configured,
      secretKeyConfigured: view.credentials.secretKey.configured,
      accessKeyWritable: view.credentials.accessKey.writable,
      secretKeyWritable: view.credentials.secretKey.writable,
      dirty: false,
      invalid: false,
      saving: false,
    })
  }

  private publish(next: OsAgentCardState): void {
    const dirty = next.accessKey !== '' || next.secretKey !== '' || !sameDraft(next.draft, this.baseline)
    const state = { ...next, dirty, invalid: parseDraft(next.draft) === undefined }
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

export function parseDraft(draft: Draft): OsAgentConfig | undefined {
  const maxSteps = integer(draft.maxSteps, 1, 500)
  const timeout = integer(draft.timeout, 1, 86_400)
  if (maxSteps === undefined || timeout === undefined) return undefined
  const tos = [draft.tosBucket, draft.tosEndpoint, draft.tosRegion].map(value => value.trim())
  const tosCount = tos.filter(Boolean).length
  if (tosCount !== 0 && tosCount !== 3) return undefined
  return {
    productId: draft.productId.trim(),
    podId: draft.podId.trim(),
    maxSteps,
    timeout,
    systemPrompt: draft.systemPrompt.trim(),
    tosBucket: tos[0] as string,
    tosEndpoint: tos[1] as string,
    tosRegion: tos[2] as string,
  }
}

async function request(fetchImpl: FetchLike, method: 'GET' | 'PUT', body: unknown, signal: AbortSignal): Promise<ApiView> {
  const response = await fetchImpl(CONFIG_ENDPOINT, {
    method,
    headers: {
      'x-os-agent-plugin': '1',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  })
  const value = await response.json() as ApiView | { ok: false; error?: string }
  if (!response.ok || value.ok !== true) {
    throw new Error(value.ok === false && value.error !== undefined ? value.error : `request failed with HTTP ${response.status}`)
  }
  return value
}

function toDraft(config: OsAgentConfig): Draft {
  return {
    productId: config.productId,
    podId: config.podId,
    maxSteps: String(config.maxSteps),
    timeout: String(config.timeout),
    systemPrompt: config.systemPrompt,
    tosBucket: config.tosBucket,
    tosEndpoint: config.tosEndpoint,
    tosRegion: config.tosRegion,
  }
}

function integer(value: string, min: number, max: number): number | undefined {
  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined
}

function sameDraft(left: Draft, right: Draft): boolean {
  return (Object.keys(left) as DraftField[]).every(field => left[field] === right[field])
}
