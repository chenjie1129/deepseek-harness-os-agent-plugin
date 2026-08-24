/** Plugin-owned Tool result card for Mobile Use screenshots. */

import { useCallback, useMemo } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionId, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { resultText, screenshotsFromMeta } from './result-model.ts'

type LoadImage = (sessionId: SessionId, attachment: ImageAttachmentRef) => Promise<string>

export type OsAgentResultCardProps = ToolCallViewProps & {
  loadOsAgentImage: LoadImage
  t(key: string): string
}

/** Render task text and any persisted screenshots without exposing base64 data. */
export function OsAgentResultCard(props: OsAgentResultCardProps) {
  const result = settledResult(props.block)
  const screenshots = useMemo(
    () => (result === undefined ? [] : screenshotsFromMeta(result.meta)),
    [result],
  )
  const previewById = useMemo(
    () => new Map(screenshots.map(screenshot => [String(screenshot.attachment.attachmentId), screenshot.dataUrl])),
    [screenshots],
  )
  const load = useCallback(
    (attachment: ImageAttachmentRef) => Promise.resolve(previewById.get(String(attachment.attachmentId)))
      .then(dataUrl => dataUrl ?? props.loadOsAgentImage(props.sessionId, attachment)),
    [previewById, props.loadOsAgentImage, props.sessionId],
  )
  const labels = useMemo(() => ({
    image: props.t('screenshot'),
    open: props.t('openScreenshot'),
    openNamed: (name: string) => `${props.t('openScreenshot')}: ${name}`,
    loading: props.t('loadingScreenshot'),
    loadFailed: props.t('screenshotLoadFailed'),
    lightbox: { dialog: props.t('screenshotPreview'), close: props.t('closeScreenshot') },
  }), [props.t])

  const output = result === undefined ? '' : resultText(result.content)
  const failed = result?.isError === true
  return (
    <section className="osa-tool-result" data-failed={failed || undefined} aria-label={props.t('resultCard')}>
      <div className="osa-tool-result-header">
        <span>{props.t(props.toolName === 'mobile_use_get_status' ? 'statusCard' : 'resultCard')}</span>
        <span className="osa-tool-result-count">
          {result !== undefined ? props.t(screenshots.length === 1 ? 'oneScreenshot' : 'manyScreenshots').replace('{count}', String(screenshots.length)) : props.t('running')}
        </span>
      </div>
      {screenshots.length > 0 ? (
        <div className="osa-tool-result-images">
          <ImageGallery images={screenshots.map(screenshot => ({ attachment: screenshot.attachment }))} load={load} align="start" labels={labels} />
        </div>
      ) : null}
      {result !== undefined ? (
        <details className="osa-tool-result-text" open={failed || undefined}>
          <summary>{props.t('textResult')}</summary>
          <pre>{output}</pre>
        </details>
      ) : <p className="osa-tool-result-running">{props.t('waitingForResult')}</p>}
      {props.inspect !== undefined ? <button type="button" className="osa-inspect" onClick={props.inspect}>{props.t('inspect')}</button> : null}
    </section>
  )
}

function settledResult(block: ToolCallBlock): ToolResultNode | undefined {
  return 'kind' in block ? block : undefined
}
