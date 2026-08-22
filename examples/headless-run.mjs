#!/usr/bin/env node
/**
 * Headless Mobile Use smoke run.
 *
 * Starts one Volcengine Mobile Use Agent task, polls its status until the run
 * settles, then prints the final result. Uses the same transport and request
 * builder as the Harness plugin, so a success here proves credentials, Product
 * Id, and PodId are wired correctly before you debug anything at the agent
 * layer.
 *
 * Usage:
 *   VOLC_ACCESSKEY=... VOLC_SECRETKEY=... \
 *   OS_AGENT_PRODUCT_ID=... OS_AGENT_POD_ID=... \
 *   node examples/headless-run.mjs "Open Settings and report the Android version"
 */
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_TIMEOUT_SECONDS,
  MobileUseError,
  VolcengineMobileUseClient,
  assertIntegerRange,
  buildRunAgentTaskOneStepBody,
} from '../volcengine.js'

const SETTLED_STATES = new Set([
  'succeeded', 'success', 'finished', 'completed', 'done',
  'failed', 'failure', 'error', 'cancelled', 'canceled', 'timeout', 'timedout',
])

function requireEnv(name) {
  const value = (process.env[name] ?? '').trim()
  if (value === '') {
    throw new MobileUseError(`Environment variable ${name} is required.`, 'MOBILE_USE_NOT_CONFIGURED')
  }
  return value
}

function intEnv(name, fallback, min, max) {
  const raw = (process.env[name] ?? '').trim()
  if (raw === '') return fallback
  const value = Number(raw)
  assertIntegerRange(value, min, max, name)
  return value
}

/** Pull a run state out of an arbitrarily shaped status payload. */
function readState(value) {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return undefined
  for (const key of ['Status', 'State', 'RunStatus', 'RunState', 'Phase']) {
    const found = value[key]
    if (typeof found === 'string' && found !== '') return found
  }
  for (const nested of Object.values(value)) {
    if (typeof nested === 'object' && nested !== null) {
      const found = readState(nested)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function readRunId(result) {
  if (typeof result !== 'object' || result === null) return undefined
  for (const key of ['RunId', 'runId', 'Id']) {
    const found = result[key]
    if (typeof found === 'string' && found !== '') return found
  }
  return undefined
}

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000))

async function main() {
  const task = process.argv.slice(2).join(' ').trim()
  if (task === '') {
    console.error('Usage: node examples/headless-run.mjs "<task in natural language>"')
    process.exit(2)
  }

  const maxSteps = intEnv('OS_AGENT_MAX_STEPS', DEFAULT_MAX_STEPS, 1, 500)
  const timeout = intEnv('OS_AGENT_TIMEOUT', DEFAULT_TIMEOUT_SECONDS, 1, 86_400)
  const pollInterval = intEnv('OS_AGENT_POLL_INTERVAL', 5, 1, 300)
  const pollLimit = intEnv('OS_AGENT_POLL_LIMIT', 60, 1, 10_000)

  const options = {
    client: new VolcengineMobileUseClient({
      accessKeyId: requireEnv('VOLC_ACCESSKEY'),
      secretKey: requireEnv('VOLC_SECRETKEY'),
    }),
    productId: requireEnv('OS_AGENT_PRODUCT_ID'),
    podId: requireEnv('OS_AGENT_POD_ID'),
    maxSteps,
    timeout,
    systemPrompt: (process.env.OS_AGENT_SYSTEM_PROMPT ?? '').trim(),
    tos: undefined,
  }

  const body = buildRunAgentTaskOneStepBody(options, { task })
  console.log(`Starting run "${body.RunName}" (max ${maxSteps} steps, ${timeout}s timeout)`)

  const started = await options.client.call('RunAgentTaskOneStep', 'POST', body)
  const runId = readRunId(started.result)
  if (runId === undefined) {
    console.log(JSON.stringify(started, null, 2))
    throw new MobileUseError('Start response did not contain a RunId.', 'MOBILE_USE_MALFORMED_RESPONSE')
  }
  console.log(`RunId: ${runId}`)

  let settled = false
  for (let attempt = 1; attempt <= pollLimit; attempt += 1) {
    await sleep(pollInterval)
    const status = await options.client.call('ListAgentRunCurrentStep', 'GET', { RunId: runId })
    const state = readState(status.result) ?? 'unknown'
    console.log(`poll ${attempt}/${pollLimit}: ${state}`)
    if (SETTLED_STATES.has(state.toLowerCase())) {
      settled = true
      break
    }
  }
  if (!settled) {
    console.warn(`Run did not settle after ${pollLimit} polls; fetching whatever result exists.`)
  }

  const finished = await options.client.call('GetAgentResult', 'GET', { RunId: runId })
  console.log('--- result ---')
  console.log(JSON.stringify(finished.result, null, 2))
}

main().catch((error) => {
  if (error instanceof MobileUseError) {
    console.error(`${error.code}: ${error.message}`)
  } else {
    console.error(error instanceof Error ? error.message : String(error))
  }
  process.exit(1)
})
