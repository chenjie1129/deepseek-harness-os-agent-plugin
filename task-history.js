/** Build a safe, ordered history from Volcengine's current-step snapshots. */

const MAX_HISTORY_STEPS = 500
const MAX_STEP_ID_LENGTH = 512
const MAX_ACTION_LENGTH = 128
const MAX_SUMMARY_LENGTH = 500
const URL = /https?:\/\/\S+/gi

export function createTaskHistory() {
  const observations = []
  const seen = new Set()
  let reportedTotalSteps

  return {
    ingest(value) {
      const total = readReportedTotalSteps(value)
      if (total !== undefined) reportedTotalSteps = Math.max(reportedTotalSteps ?? 0, total)
      const payload = findCurrentStepPayload(value)
      if (payload === undefined || !Array.isArray(payload.Results)) return
      const stepId = safeText(payload.StepId, MAX_STEP_ID_LENGTH)
      payload.Results.forEach((result, resultIndex) => {
        if (!isRecord(result) || observations.length >= MAX_HISTORY_STEPS) return
        const action = safeText(result.Action, MAX_ACTION_LENGTH) || 'unknown'
        const timestamp = safeTimestamp(result.Timestamp)
        const summary = stepSummary(result)
        const identity = [stepId, action, timestamp, resultIndex, summary].join('\u0000')
        if (seen.has(identity)) return
        seen.add(identity)
        observations.push({
          sequence: observations.length + 1,
          ...(stepId === '' ? {} : { stepId }),
          action,
          ...(timestamp === '' ? {} : { timestamp }),
          ...(typeof result.StepResult?.IsSuccess === 'boolean'
            ? { success: result.StepResult.IsSuccess }
            : {}),
          ...(summary === '' ? {} : { summary }),
        })
      })
    },
    snapshot() {
      return {
        steps: observations.map(step => ({ ...step })),
        ...(reportedTotalSteps === undefined ? {} : { reportedTotalSteps }),
      }
    },
  }
}

/** Append the run history to the model-safe text and UI-only structured output. */
export function addTaskHistory(result, history) {
  const snapshot = history.snapshot()
  const section = formatTaskHistory(snapshot)
  return {
    ...result,
    text: section === '' ? result.text : `${result.text}\n\n${section}`,
    steps: snapshot.steps,
    ...(snapshot.reportedTotalSteps === undefined
      ? {}
      : { reportedTotalSteps: snapshot.reportedTotalSteps }),
  }
}

export function readReportedTotalSteps(value, depth = 0) {
  if (depth > 32 || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    return value.reduce((largest, item) => {
      const found = readReportedTotalSteps(item, depth + 1)
      return found === undefined ? largest : Math.max(largest ?? 0, found)
    }, undefined)
  }
  if (!isRecord(value)) return undefined
  for (const [key, child] of Object.entries(value)) {
    if (/^total_?steps$/i.test(key) && Number.isSafeInteger(child) && child >= 0) return child
  }
  for (const child of Object.values(value)) {
    const found = readReportedTotalSteps(child, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function findCurrentStepPayload(value, depth = 0) {
  if (depth > 24 || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findCurrentStepPayload(child, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  if (Array.isArray(value.Results)
    && ('StepId' in value || 'RunId' in value || 'Status' in value)) return value
  for (const child of Object.values(value)) {
    const found = findCurrentStepPayload(child, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function stepSummary(result) {
  const paramContent = isRecord(result.Param) ? safeContent(result.Param.content) : ''
  if (paramContent !== '') return paramContent
  if (!isRecord(result.StepResult)) return ''
  const raw = result.StepResult.Result
  if (typeof raw !== 'string') return ''
  const parsed = parseJson(raw)
  if (isRecord(parsed)) {
    const content = safeContent(parsed.content)
    if (content !== '') return content
    const nestedResult = safeContent(parsed.result)
    if (nestedResult !== '') return nestedResult
    return ''
  }
  return safeContent(raw)
}

function formatTaskHistory(snapshot) {
  if (snapshot.steps.length === 0 && snapshot.reportedTotalSteps === undefined) return ''
  const lines = ['Task step history:']
  if (snapshot.steps.length === 0) {
    lines.push('No historical step snapshots are available for this completed run.')
  } else {
    for (const step of snapshot.steps) {
      const state = step.success === undefined ? '' : step.success ? ' [success]' : ' [pending/failed]'
      const at = step.timestamp === undefined ? '' : ` @ ${step.timestamp}`
      const summary = step.summary === undefined ? '' : ` — ${step.summary}`
      lines.push(`${step.sequence}. ${step.action}${state}${at}${summary}`)
    }
  }
  if (snapshot.reportedTotalSteps !== undefined) {
    lines.push(`Volcengine reported TotalSteps: ${snapshot.reportedTotalSteps}.`)
  }
  return lines.join('\n')
}

function safeContent(value) {
  if (typeof value !== 'string') return ''
  const text = value.replace(URL, '[URL omitted]').replace(/\s+/g, ' ').trim()
  if (text === '' || /^(?:data:image\/|[A-Za-z0-9+/]{128})/i.test(text)) return ''
  return safeText(text, MAX_SUMMARY_LENGTH)
}

function safeTimestamp(value) {
  if (typeof value !== 'string' || value.length > 64) return ''
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? value : ''
}

function safeText(value, maxLength) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
