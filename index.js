/** Volcengine Mobile Use Agent runtime plugin for DeepSeek Harness. */

import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createScreenshotPresentationMeta, createScreenshotResult, renderScreenshotOutput } from './screenshots.js'
import { isTerminalRunStatus, readRunId, RunScreenshotMonitor } from './run-screenshot-monitor.js'
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_TIMEOUT_SECONDS,
  MobileUseError,
  VolcengineMobileUseClient,
  assertIntegerRange,
  buildGetAgentResultQuery,
  buildRunAgentTaskOneStepBody,
  trimmed,
} from './volcengine.js'
import { CONFIG_ENDPOINT, createConfigRoute } from './web-config.js'

export {
  DEFAULT_MAX_STEPS,
  DEFAULT_TIMEOUT_SECONDS,
  MobileUseError,
  VolcengineMobileUseClient,
  buildRunAgentTaskOneStepBody,
  buildGetAgentResultQuery,
  signRequest,
} from './volcengine.js'
export { CONFIG_ENDPOINT, createConfigRoute, normalizeConfig } from './web-config.js'

export const name = 'os-agent-plugin'
export const inject = ['tools', 'systemPrompt']

export const DEFAULT_ACCESS_KEY_REF = 'VOLC_ACCESSKEY'
export const DEFAULT_SECRET_KEY_REF = 'VOLC_SECRETKEY'
export const OS_AGENT_SETTINGS_NAMESPACE = settingsNamespace('os-agent')

/** Runtime and settings schema. Secret literals remain available for headless composition. */
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
  showScreenshots: z.boolean().default(false),
  tosBucket: z.string().default(''),
  tosEndpoint: z.string().default(''),
  tosRegion: z.string().default(''),
})

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

const IMAGE_REF_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
    name: { type: 'string' },
  },
}

const SCREENSHOT_PREVIEW_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    dataUrl: { type: 'string', required: true },
  },
}

const TASK_STEP_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sequence: { type: 'integer', required: true },
    stepId: { type: 'string' },
    action: { type: 'string', required: true },
    timestamp: { type: 'string' },
    success: { type: 'boolean' },
    summary: { type: 'string' },
  },
}

const SCREENSHOT_OUTPUT = {
  schema: {
    oneOf: [
      { type: 'string' },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          screenshots: { type: 'array', items: IMAGE_REF_ITEM_SCHEMA, required: true },
          screenshotPreviews: { type: 'array', items: SCREENSHOT_PREVIEW_ITEM_SCHEMA, required: true },
          screenshotsFound: { type: 'integer', required: true },
          warnings: { type: 'array', items: { type: 'string' }, required: true },
          steps: { type: 'array', items: TASK_STEP_ITEM_SCHEMA, required: true },
          reportedTotalSteps: { type: 'integer' },
        },
      },
    ],
  },
  render: (_args, value) => renderScreenshotOutput(value),
  presentationMeta: (_args, value) => createScreenshotPresentationMeta(value),
}

/** Register live settings, the optional Web configuration endpoint, and all three tools. */
export function apply(ctx, config = {}) {
  let current = () => config
  const screenshotMonitor = new RunScreenshotMonitor({ attachments: () => ctx.get('attachments') })
  ctx.effect(() => () => screenshotMonitor.dispose(), 'os-agent-plugin: screenshot monitor')
  installSettingsSection(ctx, OS_AGENT_SETTINGS_NAMESPACE, Config, config, {
    setSource: source => { current = source },
    onChange: () => {},
    validate: validateTosConfig,
  })

  ctx.inject(['webServer', 'settings', 'credentials'], (webCtx) => {
    const route = createConfigRoute({
      settings: webCtx.settings,
      credentials: webCtx.credentials,
      namespace: OS_AGENT_SETTINGS_NAMESPACE,
      credentialRefs: () => ({
        accessKey: credentialRef(trimmed(current().accessKeyEnv) || DEFAULT_ACCESS_KEY_REF),
        secretKey: credentialRef(trimmed(current().secretKeyEnv) || DEFAULT_SECRET_KEY_REF),
      }),
    })
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'exact', path: CONFIG_ENDPOINT, handler: route }),
      'os-agent-plugin: configuration endpoint',
    )
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
      const runId = readRunId(response.result)
      if (options.showScreenshots && runId !== undefined) {
        await screenshotMonitor.start({ runId, client: options.client, timeoutSeconds: options.timeout })
      }
      return JSON.stringify({ action: 'RunAgentTaskOneStep', ...response }, null, 2)
    },
    presentCall: args => ({ card: 'generic', title: `Start mobile task: ${truncate(args.task, 72)}`, kind: 'execute' }),
  }))

  ctx.tools.register(defineTool({
    name: 'mobile_use_get_status',
    description: 'Read the current step and status of a Volcengine Mobile Use Agent run. When screenshot display is enabled, Harness also shows screenshots returned for the step.',
    parameters: {
      run_id: { type: 'string', required: true, description: 'RunId returned by mobile_use_start_task.' },
    },
    output: SCREENSHOT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const options = await resolveOptions(ctx, current(), { requireDevice: false })
      const runId = requireText(args.run_id, 'run_id')
      const response = await options.client.call('ListAgentRunCurrentStep', 'GET', { RunId: runId }, exec.signal)
      const value = { action: 'ListAgentRunCurrentStep', ...response }
      const monitored = await screenshotMonitor.format(runId, value, options.showScreenshots)
      if (isTerminalRunStatus(value)) await screenshotMonitor.stopPolling(runId)
      return monitored ?? formatMobileUseResponse(ctx, false, value)
    },
    presentCall: args => ({ card: 'generic', title: `Check mobile task ${truncate(args.run_id, 36)}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'mobile_use_get_result',
    description: 'Fetch the final result of a completed Volcengine Mobile Use Agent run. When screenshot display is enabled, Harness also shows the returned task screenshots.',
    parameters: {
      run_id: { type: 'string', required: true, description: 'RunId returned by mobile_use_start_task.' },
    },
    output: SCREENSHOT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const options = await resolveOptions(ctx, current(), { requireDevice: false })
      const runId = requireText(args.run_id, 'run_id')
      const response = await options.client.call(
        'GetAgentResult',
        'GET',
        buildGetAgentResultQuery(runId, options.showScreenshots),
        exec.signal,
      )
      const value = { action: 'GetAgentResult', ...response }
      const monitored = await screenshotMonitor.format(runId, value, options.showScreenshots)
      await screenshotMonitor.stopPolling(runId)
      return monitored ?? formatMobileUseResponse(ctx, false, value)
    },
    presentCall: args => ({ card: 'generic', title: `Read mobile result ${truncate(args.run_id, 36)}`, kind: 'read' }),
  }))
}

/** Resolve live configuration and write-only credentials immediately before one tool call. */
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
  validateTosConfig(config)
  const tos = {
    bucket: trimmed(config.tosBucket),
    endpoint: trimmed(config.tosEndpoint),
    region: trimmed(config.tosRegion),
  }

  return {
    client: new VolcengineMobileUseClient({ accessKeyId: accessKey, secretKey }),
    productId,
    podId,
    maxSteps,
    timeout,
    systemPrompt: trimmed(config.systemPrompt),
    showScreenshots: config.showScreenshots === true,
    tos: Object.values(tos).every(Boolean) ? tos : undefined,
  }
}

/** Keep the exact legacy string output while screenshot display is disabled. */
export async function formatMobileUseResponse(ctx, showScreenshots, value) {
  if (!showScreenshots) return JSON.stringify(value, null, 2)
  return createScreenshotResult(value, ctx.get('attachments'))
}

function validateTosConfig(config) {
  const values = [config.tosBucket, config.tosEndpoint, config.tosRegion].map(trimmed)
  const count = values.filter(Boolean).length
  if (count !== 0 && count !== 3) {
    throw new MobileUseError('TOS bucket, endpoint, and region must be configured together.', 'MOBILE_USE_INVALID_TOS_CONFIG')
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

function requireText(value, label) {
  const text = trimmed(value)
  if (text === '') throw new MobileUseError(`${label} must be a non-empty string.`, 'MOBILE_USE_INVALID_ARGUMENT')
  return text
}

function truncate(value, length) {
  const text = typeof value === 'string' ? value : ''
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`
}
