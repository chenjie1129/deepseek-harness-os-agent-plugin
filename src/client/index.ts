/** Browser half: a plugin-owned OS Agent tab inside the shared Plugins section. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OsAgentCardController } from './controller.ts'
import { OsAgentTab } from './OsAgentTab.tsx'
import { STYLES, STYLE_ID } from './styles.ts'

export const inject = ['slots', 'locale']
const NS = 'os-agent-plugin'

const en = {
  tab: 'OS Agent', title: 'OS Agent Plugin', description: 'Volcengine Mobile Use Agent for the configured cloud phone.',
  loading: 'Loading OS Agent configuration…', loadFailed: 'Could not load OS Agent configuration.', retry: 'Retry',
  accessKey: 'AccessKey', accessKeyHint: 'Stored in Harness credentials. Leave blank to keep the current key.',
  secretKey: 'Secret Key', secretKeyHint: 'Stored in Harness credentials. Leave blank to keep the current secret.',
  configured: 'Configured', notConfigured: 'Not configured', productId: 'Product Id', productIdHint: 'Cloud-phone business identifier.',
  podId: 'PodId', podIdHint: 'Cloud-phone instance operated by Mobile Use Agent.', maxSteps: 'Max steps', maxStepsHint: 'Integer from 1 to 500.',
  timeout: 'Timeout (seconds)', timeoutHint: 'Integer from 1 to 86,400.', systemPrompt: 'SystemPrompt', systemPromptHint: 'Optional system instructions for every run.',
  tosBucket: 'TOS bucket', tosEndpoint: 'TOS endpoint', tosRegion: 'TOS region', tosGroupHint: 'Bucket, endpoint, and region must be configured together.',
  tosEndpointHint: 'For example, tos-cn-beijing.volces.com.', tosRegionHint: 'For example, cn-beijing.',
  invalid: 'Check the numeric ranges and configure either all three TOS fields or none.', readOnly: 'This Harness settings provider is read-only.',
  discard: 'Discard', save: 'Save', saving: 'Saving…',
}

const zh = {
  tab: 'OS Agent', title: 'OS Agent 插件', description: '使用火山引擎 Mobile Use Agent 操作已配置的云手机。',
  loading: '正在加载 OS Agent 配置…', loadFailed: '无法加载 OS Agent 配置。', retry: '重试',
  accessKey: 'AccessKey', accessKeyHint: '保存在 Harness credentials 中；留空表示保留当前密钥。',
  secretKey: 'Secret Key', secretKeyHint: '保存在 Harness credentials 中；留空表示保留当前密钥。',
  configured: '已配置', notConfigured: '未配置', productId: 'Product Id', productIdHint: '云手机业务标识。',
  podId: 'PodId', podIdHint: 'Mobile Use Agent 操作的云手机实例。', maxSteps: '最大步骤数', maxStepsHint: '1 到 500 的整数。',
  timeout: '超时时间（秒）', timeoutHint: '1 到 86,400 的整数。', systemPrompt: 'SystemPrompt', systemPromptHint: '应用于每次运行的可选系统指令。',
  tosBucket: 'TOS Bucket', tosEndpoint: 'TOS Endpoint', tosRegion: 'TOS Region', tosGroupHint: 'Bucket、Endpoint 和 Region 必须一起配置。',
  tosEndpointHint: '例如 tos-cn-beijing.volces.com。', tosRegionHint: '例如 cn-beijing。',
  invalid: '请检查数值范围，并同时填写全部三个 TOS 字段或全部留空。', readOnly: '当前 Harness settings provider 为只读。',
  discard: '放弃', save: '保存', saving: '保存中…',
}

/** Register locale, styles, and the standalone settings tab. */
export function apply(ctx: ClientContext): void {
  const controller = new OsAgentCardController()
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
}
