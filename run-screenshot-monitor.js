/** Capture screenshot-bearing Mobile Use steps independently of model timing. */

import { createScreenshotCollector, createScreenshotResult } from './screenshots.js'
import { addTaskHistory, createTaskHistory } from './task-history.js'

export const DEFAULT_SCREENSHOT_POLL_INTERVAL_MS = 250
const DEFAULT_COMPLETED_RETENTION_MS = 30 * 60 * 1_000
const DEFAULT_MAX_RETAINED_RUNS = 32
const TERMINAL_TEXT = new Set([
  'succeeded', 'success', 'finished', 'completed', 'done',
  'failed', 'failure', 'error', 'cancelled', 'canceled', 'timeout', 'timedout',
])
const TERMINAL_NUMERIC_STATUS = new Set([3, 5, 6, 7])
const STATUS_KEYS = /^(?:status|state|runstatus|runstate|phase|action)$/i

export class RunScreenshotMonitor {
  constructor(options = {}) {
    this.attachments = options.attachments ?? (() => undefined)
    this.pollIntervalMs = positiveInteger(options.pollIntervalMs) ?? DEFAULT_SCREENSHOT_POLL_INTERVAL_MS
    this.completedRetentionMs = positiveInteger(options.completedRetentionMs) ?? DEFAULT_COMPLETED_RETENTION_MS
    this.maxRetainedRuns = positiveInteger(options.maxRetainedRuns) ?? DEFAULT_MAX_RETAINED_RUNS
    this.wait = options.wait ?? abortableDelay
    this.now = options.now ?? Date.now
    this.runs = new Map()
    this.disposed = false
  }

  async start({ runId, client, timeoutSeconds }) {
    if (this.disposed) return
    await this.stopPolling(runId)
    await this.prune(true)
    const controller = new AbortController()
    const state = {
      runId,
      collector: createScreenshotCollector(this.attachments()),
      history: createTaskHistory(),
      controller,
      pollTask: undefined,
      polling: true,
      completedAt: undefined,
      lastTouched: this.now(),
    }
    this.runs.set(runId, state)
    state.pollTask = this.poll(state, client, timeoutSeconds)
    void state.pollTask.catch(() => undefined)
  }

  async format(runId, value, fallbackEnabled) {
    await this.prune(false)
    const state = this.runs.get(runId)
    if (state === undefined) {
      if (!fallbackEnabled) return undefined
      const history = createTaskHistory()
      history.ingest(value)
      return addTaskHistory(await createScreenshotResult(value, this.attachments()), history)
    }
    state.lastTouched = this.now()
    state.history.ingest(value)
    return addTaskHistory(await state.collector.ingest(value), state.history)
  }

  async stopPolling(runId) {
    const state = this.runs.get(runId)
    if (state === undefined || !state.polling) return
    state.controller.abort()
    await state.pollTask?.catch(() => undefined)
  }

  async dispose() {
    this.disposed = true
    const states = [...this.runs.values()]
    for (const state of states) state.controller.abort()
    await Promise.allSettled(states.map(state => state.pollTask))
    this.runs.clear()
  }

  async poll(state, client, timeoutSeconds) {
    const timeoutMs = Math.max(1, Number(timeoutSeconds) || 1) * 1_000
    const maxPolls = Math.ceil(timeoutMs / this.pollIntervalMs) + 5
    let polls = 0
    try {
      while (!state.controller.signal.aborted && polls < maxPolls) {
        await this.wait(this.pollIntervalMs, state.controller.signal)
        if (state.controller.signal.aborted) break
        polls += 1
        try {
          const response = await client.call(
            'ListAgentRunCurrentStep',
            'GET',
            { RunId: state.runId },
            state.controller.signal,
          )
          const value = { action: 'ListAgentRunCurrentStep', ...response }
          state.history.ingest(value)
          await state.collector.ingest(value)
          state.lastTouched = this.now()
          if (isTerminalRunStatus(value)) break
        } catch (_error) {
          if (state.controller.signal.aborted) break
          state.collector.warn('Background screenshot polling encountered an error; captured screenshots may be incomplete.')
        }
      }
      if (polls >= maxPolls && !state.controller.signal.aborted) {
        state.collector.warn('Background screenshot polling reached the configured task timeout; captured screenshots may be incomplete.')
      }
    } finally {
      state.polling = false
      state.completedAt = this.now()
      state.lastTouched = state.completedAt
    }
  }

  async prune(makeRoom) {
    const now = this.now()
    for (const [runId, state] of this.runs) {
      if (!state.polling && state.completedAt !== undefined
        && now - state.completedAt >= this.completedRetentionMs) {
        this.runs.delete(runId)
      }
    }
    if (!makeRoom || this.runs.size < this.maxRetainedRuns) return
    const oldest = [...this.runs.values()].sort((left, right) => left.lastTouched - right.lastTouched)[0]
    if (oldest === undefined) return
    oldest.controller.abort()
    await oldest.pollTask?.catch(() => undefined)
    this.runs.delete(oldest.runId)
  }
}

export function isTerminalRunStatus(value, depth = 0) {
  if (depth > 32 || value === null || value === undefined) return false
  if (Array.isArray(value)) return value.some(item => isTerminalRunStatus(item, depth + 1))
  if (typeof value !== 'object') return false
  for (const [key, child] of Object.entries(value)) {
    if (STATUS_KEYS.test(key)) {
      if (typeof child === 'string' && TERMINAL_TEXT.has(child.toLowerCase().replace(/[\s_-]+/g, ''))) return true
      if (typeof child === 'number' && TERMINAL_NUMERIC_STATUS.has(child)) return true
    }
    if (typeof child === 'object' && isTerminalRunStatus(child, depth + 1)) return true
  }
  return false
}

export function readRunId(value, depth = 0) {
  if (depth > 16 || value === null || value === undefined) return undefined
  if (typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value)) {
    if (/^run_?id$/i.test(key) && typeof child === 'string' && child.trim() !== '') return child.trim()
  }
  for (const child of Object.values(value)) {
    const found = readRunId(child, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function abortableDelay(milliseconds, signal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const timer = setTimeout(done, milliseconds)
    timer.unref?.()
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}
