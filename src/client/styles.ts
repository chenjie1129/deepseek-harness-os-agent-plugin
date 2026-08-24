/** Plugin-owned stylesheet injected and removed with the client fiber. */

export const STYLE_ID = 'dsh-os-agent-plugin/client'

export const STYLES = `
.osa-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);padding:18px;max-width:920px}
.osa-header h2{margin:0;color:var(--dsw-alias-label-primary);font-size:18px;line-height:1.4}
.osa-header p,.osa-field p,.osa-muted,.osa-status{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.osa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px;margin-top:20px}
.osa-field{display:flex;min-width:0;flex-direction:column;gap:6px}
.osa-wide{grid-column:1/-1}
.osa-field label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.osa-label-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.osa-field input,.osa-field textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}
.osa-field input{height:36px;padding:0 11px}
.osa-field textarea{min-height:104px;padding:8px 11px;resize:vertical}
.osa-field input:focus-visible,.osa-field textarea:focus-visible,.osa-card button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.osa-field input:disabled,.osa-field textarea:disabled{cursor:default;color:var(--dsw-alias-label-tertiary)}
.osa-switch-row{display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px}
.osa-switch-row>div{min-width:0}.osa-switch-row p{margin-top:2px}
.osa-switch-row input[type=checkbox]{position:relative;flex:0 0 auto;appearance:none;width:42px;height:24px;padding:0;border-radius:999px;background:var(--dsw-alias-bg-module-platform);cursor:pointer;transition:background-color .15s ease}
.osa-switch-row input[type=checkbox]::after{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-tertiary);content:"";transition:transform .15s ease,background-color .15s ease}
.osa-switch-row input[type=checkbox]:checked{background:var(--dsw-alias-brand-primary)}
.osa-switch-row input[type=checkbox]:checked::after{transform:translateX(18px);background:var(--dsw-alias-bg-layer-3)}
.osa-switch-row input[type=checkbox]:disabled{cursor:default;opacity:.45}
.osa-badge{white-space:nowrap;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);padding:1px 8px;font-size:11px;line-height:17px}
.osa-error{color:var(--dsw-alias-label-error);font-size:12px;line-height:1.5}
.osa-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2)}
.osa-card button,.osa-status button{appearance:none;border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.osa-primary{border:1px solid transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.osa-secondary,.osa-status button{border:1px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
.osa-card button:disabled{cursor:default;opacity:.4}
.osa-tool-result{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);padding:12px;min-width:0;color:var(--dsw-alias-label-primary)}
.osa-tool-result[data-failed]{border-color:var(--dsw-alias-label-error)}
.osa-tool-result-header{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;font-weight:500}
.osa-tool-result-count,.osa-tool-result-running{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}
.osa-tool-result-images{margin-top:12px}
.osa-tool-result-steps{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}
.osa-tool-result-steps-header{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}
.osa-tool-result-steps-header span:last-child,.osa-tool-result-total{color:var(--dsw-alias-label-tertiary);font-weight:400}
.osa-tool-result-steps ol{display:grid;gap:8px;margin:9px 0 0;padding-left:24px}
.osa-tool-result-steps li{min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.osa-tool-result-steps li>div{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.osa-tool-result-steps strong{color:var(--dsw-alias-label-primary);font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.osa-tool-result-steps time{color:var(--dsw-alias-label-tertiary);font-size:11px}
.osa-tool-result-steps [data-success]{border-radius:999px;background:var(--dsw-alias-bg-module-platform);padding:0 6px;font-size:10px;line-height:18px}
.osa-tool-result-steps [data-success=false]{color:var(--dsw-alias-label-error)}
.osa-tool-result-steps li p,.osa-tool-result-total{margin:2px 0 0;overflow-wrap:anywhere;line-height:1.5}
.osa-tool-result-text{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}
.osa-tool-result-text summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}
.osa-tool-result-text pre{box-sizing:border-box;max-height:320px;overflow:auto;margin:8px 0 0;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.osa-tool-result-running{margin:8px 0 0}
.osa-inspect{margin-top:10px;border:1px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
@media(max-width:640px){.osa-card{padding:14px}.osa-grid{grid-template-columns:1fr}.osa-wide{grid-column:auto}.osa-footer{position:sticky;bottom:0;background:var(--dsw-alias-bg-layer-3);padding-bottom:4px}}
`
