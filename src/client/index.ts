/** Browser half: a plugin-owned OS Agent tab inside the shared Plugins section. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { OsAgentCardController } from './controller.ts'
import { OsAgentResultCard } from './OsAgentResultCard.tsx'
import { OsAgentTab } from './OsAgentTab.tsx'
import { STYLES, STYLE_ID } from './styles.ts'

export const inject = ['slots', 'locale', 'conversation']
const NS = 'os-agent-plugin'

const en = {
  tab: 'OS Agent', title: 'OS Agent Plugin', description: 'Volcengine Mobile Use Agent for the configured cloud phone.',
  loading: 'Loading OS Agent configuration…', loadFailed: 'Could not load OS Agent configuration.', retry: 'Retry',
  accessKey: 'AccessKey', accessKeyHint: 'Stored in Harness credentials. Leave blank to keep the current key.',
  secretKey: 'Secret Key', secretKeyHint: 'Stored in Harness credentials. Leave blank to keep the current secret.',
  configured: 'Configured', notConfigured: 'Not configured', productId: 'Product Id', productIdHint: 'Cloud-phone business identifier.',
  podId: 'PodId', podIdHint: 'Cloud-phone instance operated by Mobile Use Agent.', maxSteps: 'Max steps', maxStepsHint: 'Integer from 1 to 500.',
  timeout: 'Timeout (seconds)', timeoutHint: 'Integer from 1 to 86,400.', systemPrompt: 'SystemPrompt', systemPromptHint: 'Optional system instructions for every run.',
  showScreenshots: 'Show task screenshots', showScreenshotsHint: 'Off by default. Captures validated step screenshots as Harness attachments for Web UI display.',
  tosBucket: 'TOS bucket', tosEndpoint: 'TOS endpoint', tosRegion: 'TOS region', tosGroupHint: 'Bucket, endpoint, and region must be configured together.',
  tosEndpointHint: 'For example, tos-cn-beijing.volces.com.', tosRegionHint: 'For example, cn-beijing.',
  invalid: 'Check the numeric ranges and configure either all three TOS fields or none.', readOnly: 'This Harness settings provider is read-only.',
  discard: 'Discard', save: 'Save', saving: 'Saving…',
  resultCard: 'Mobile Use result', statusCard: 'Mobile Use status', running: 'Running…', waitingForResult: 'Waiting for the API response…',
  screenshot: 'Mobile Use screenshot', oneScreenshot: '1 screenshot', manyScreenshots: '{count} screenshots', textResult: 'Text result', inspect: 'Inspect',
  taskSteps: 'Task steps', observedSteps: '{count} observed', reportedTotalSteps: 'Volcengine reported {count} agent steps.',
  stepSucceeded: 'Succeeded', stepNotSucceeded: 'Pending / failed', historyUnavailable: 'Historical current-step snapshots are unavailable for this completed run.',
  openScreenshot: 'Open screenshot', loadingScreenshot: 'Loading…', screenshotLoadFailed: 'Could not load screenshot. Retry', screenshotPreview: 'Screenshot preview', closeScreenshot: 'Close screenshot',
}

const zh = {
  tab: 'OS Agent', title: 'OS Agent 插件', description: '使用火山引擎 Mobile Use Agent 操作已配置的云手机。',
  loading: '正在加载 OS Agent 配置…', loadFailed: '无法加载 OS Agent 配置。', retry: '重试',
  accessKey: 'AccessKey', accessKeyHint: '保存在 Harness credentials 中；留空表示保留当前密钥。',
  secretKey: 'Secret Key', secretKeyHint: '保存在 Harness credentials 中；留空表示保留当前密钥。',
  configured: '已配置', notConfigured: '未配置', productId: 'Product Id', productIdHint: '云手机业务标识。',
  podId: 'PodId', podIdHint: 'Mobile Use Agent 操作的云手机实例。', maxSteps: '最大步骤数', maxStepsHint: '1 到 500 的整数。',
  timeout: '超时时间（秒）', timeoutHint: '1 到 86,400 的整数。', systemPrompt: 'SystemPrompt', systemPromptHint: '应用于每次运行的可选系统指令。',
  showScreenshots: '显示任务截图', showScreenshotsHint: '默认关闭。开启后捕获任务步骤截图，并将通过校验的图片存入 Harness attachments，在网页界面中显示。',
  tosBucket: 'TOS Bucket', tosEndpoint: 'TOS Endpoint', tosRegion: 'TOS Region', tosGroupHint: 'Bucket、Endpoint 和 Region 必须一起配置。',
  tosEndpointHint: '例如 tos-cn-beijing.volces.com。', tosRegionHint: '例如 cn-beijing。',
  invalid: '请检查数值范围，并同时填写全部三个 TOS 字段或全部留空。', readOnly: '当前 Harness settings provider 为只读。',
  discard: '放弃', save: '保存', saving: '保存中…',
  resultCard: 'Mobile Use 结果', statusCard: 'Mobile Use 状态', running: '运行中…', waitingForResult: '正在等待接口响应…',
  screenshot: 'Mobile Use 截图', oneScreenshot: '1 张截图', manyScreenshots: '{count} 张截图', textResult: '文字结果', inspect: '检查详情',
  taskSteps: '任务步骤', observedSteps: '已捕获 {count} 条', reportedTotalSteps: '火山引擎报告共 {count} 个 Agent 步骤。',
  stepSucceeded: '成功', stepNotSucceeded: '进行中 / 失败', historyUnavailable: '该已完成任务没有可用的历史当前步骤快照。',
  openScreenshot: '打开截图', loadingScreenshot: '加载中…', screenshotLoadFailed: '截图加载失败，点击重试', screenshotPreview: '截图预览', closeScreenshot: '关闭截图',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'os-agent-plugin': string
  }
}

/** Register locale, styles, and the standalone settings tab. */
export function apply(ctx: ClientContext): void {
  const controller = new OsAgentCardController()
  const conversation = ctx.get('conversation') as unknown as {
    resolveImage(sessionId: SessionId, attachment: ImageAttachmentRef): Promise<string>
  }
  const loadOsAgentImage = (sessionId: SessionId, attachment: ImageAttachmentRef) => conversation.resolveImage(sessionId, attachment)
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'os-agent-plugin: dictionaries')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-os-agent-plugin'
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = STYLES
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'os-agent-plugin: styles')
  ctx.effect(() => () => { controller.dispose() }, 'os-agent-plugin: controller')
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'os-agent',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: () => controller.inject(),
  }, OsAgentTab))
  ctx.slots.inject('tool.call.toolview', function* () {
    const inject = () => ({ loadOsAgentImage })
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mobile_use_get_status', locale: NS, inject }, OsAgentResultCard)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mobile_use_get_result', locale: NS, inject }, OsAgentResultCard)
  })
}
