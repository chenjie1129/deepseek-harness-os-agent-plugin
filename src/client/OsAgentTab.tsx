/** OS Agent configuration tab contributed by the external client plugin. */

import type { ChangeEvent } from 'react'
import type { OsAgentCardFace, OsAgentCardState } from './controller.ts'

type Translator = (key: string) => string

export interface OsAgentTabProps extends OsAgentCardFace {
  t: Translator
  useOsAgentCard<T>(selector: (state: OsAgentCardState) => T): T
}

/** Render the complete plugin-owned configuration surface. */
export function OsAgentTab(props: OsAgentTabProps) {
  const state = props.useOsAgentCard(value => value)
  const disabled = !state.writable || state.saving
  if (state.status === 'loading') return <p className="osa-status">{props.t('loading')}</p>
  if (state.status === 'failed') {
    return (
      <div className="osa-status osa-error" role="alert">
        <p>{state.error ?? props.t('loadFailed')}</p>
        <button type="button" onClick={props.reload}>{props.t('retry')}</button>
      </div>
    )
  }
  return (
    <section className="osa-card" aria-labelledby="osa-title">
      <header className="osa-header">
        <div>
          <h2 id="osa-title">{props.t('title')}</h2>
          <p>{props.t('description')}</p>
        </div>
      </header>
      <div className="osa-grid">
        <SecretField
          id="osa-access-key"
          label={props.t('accessKey')}
          hint={props.t('accessKeyHint')}
          value={state.accessKey}
          configured={state.accessKeyConfigured}
          configuredText={props.t(state.accessKeyConfigured ? 'configured' : 'notConfigured')}
          disabled={!state.accessKeyWritable || state.saving}
          onChange={value => { props.edit('accessKey', value) }}
        />
        <SecretField
          id="osa-secret-key"
          label={props.t('secretKey')}
          hint={props.t('secretKeyHint')}
          value={state.secretKey}
          configured={state.secretKeyConfigured}
          configuredText={props.t(state.secretKeyConfigured ? 'configured' : 'notConfigured')}
          disabled={!state.secretKeyWritable || state.saving}
          onChange={value => { props.edit('secretKey', value) }}
        />
        <Field id="osa-product-id" label={props.t('productId')} hint={props.t('productIdHint')} value={state.draft.productId} disabled={disabled} onChange={value => { props.edit('productId', value) }} />
        <Field id="osa-pod-id" label={props.t('podId')} hint={props.t('podIdHint')} value={state.draft.podId} disabled={disabled} onChange={value => { props.edit('podId', value) }} />
        <Field id="osa-max-steps" label={props.t('maxSteps')} hint={props.t('maxStepsHint')} value={state.draft.maxSteps} disabled={disabled} inputMode="numeric" onChange={value => { props.edit('maxSteps', value) }} />
        <Field id="osa-timeout" label={props.t('timeout')} hint={props.t('timeoutHint')} value={state.draft.timeout} disabled={disabled} inputMode="numeric" onChange={value => { props.edit('timeout', value) }} />
        <Field id="osa-system-prompt" label={props.t('systemPrompt')} hint={props.t('systemPromptHint')} value={state.draft.systemPrompt} disabled={disabled} multiline onChange={value => { props.edit('systemPrompt', value) }} />
        <Field id="osa-tos-bucket" label={props.t('tosBucket')} hint={props.t('tosGroupHint')} value={state.draft.tosBucket} disabled={disabled} onChange={value => { props.edit('tosBucket', value) }} />
        <Field id="osa-tos-endpoint" label={props.t('tosEndpoint')} hint={props.t('tosEndpointHint')} value={state.draft.tosEndpoint} disabled={disabled} onChange={value => { props.edit('tosEndpoint', value) }} />
        <Field id="osa-tos-region" label={props.t('tosRegion')} hint={props.t('tosRegionHint')} value={state.draft.tosRegion} disabled={disabled} onChange={value => { props.edit('tosRegion', value) }} />
      </div>
      {state.invalid ? <p className="osa-error" role="alert">{props.t('invalid')}</p> : null}
      {state.error !== undefined ? <p className="osa-error" role="alert">{state.error}</p> : null}
      {!state.writable ? <p className="osa-muted">{props.t('readOnly')}</p> : null}
      <footer className="osa-footer">
        <button type="button" className="osa-secondary" disabled={!state.dirty || state.saving} onClick={props.discard}>{props.t('discard')}</button>
        <button type="button" className="osa-primary" disabled={!state.dirty || state.invalid || disabled} onClick={props.save}>{state.saving ? props.t('saving') : props.t('save')}</button>
      </footer>
    </section>
  )
}

interface FieldProps {
  id: string
  label: string
  hint: string
  value: string
  disabled: boolean
  multiline?: boolean
  inputMode?: 'numeric'
  onChange(value: string): void
}

function Field(props: FieldProps) {
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { props.onChange(event.currentTarget.value) }
  return (
    <div className={`osa-field${props.multiline ? ' osa-wide' : ''}`}>
      <label htmlFor={props.id}>{props.label}</label>
      {props.multiline
        ? <textarea id={props.id} value={props.value} disabled={props.disabled} onChange={change} />
        : <input id={props.id} value={props.value} disabled={props.disabled} inputMode={props.inputMode} onChange={change} />}
      <p>{props.hint}</p>
    </div>
  )
}

function SecretField(props: Omit<FieldProps, 'multiline' | 'inputMode'> & {
  configured: boolean
  configuredText: string
}) {
  return (
    <div className="osa-field">
      <div className="osa-label-row">
        <label htmlFor={props.id}>{props.label}</label>
        <span className={props.configured ? 'osa-badge' : 'osa-muted'}>{props.configuredText}</span>
      </div>
      <input id={props.id} type="password" autoComplete="off" value={props.value} disabled={props.disabled} onChange={(event) => { props.onChange(event.currentTarget.value) }} />
      <p>{props.hint}</p>
    </div>
  )
}
