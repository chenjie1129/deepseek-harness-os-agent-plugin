window.__ModuleLoader__.load({
  id: "dsh-os-agent-plugin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/controller.ts
var CONFIG_ENDPOINT = "/api/os-agent-plugin/config";
var EMPTY_DRAFT = {
  productId: "",
  podId: "",
  maxSteps: "100",
  timeout: "120",
  systemPrompt: "",
  showScreenshots: false,
  tosBucket: "",
  tosEndpoint: "",
  tosRegion: ""
};
var OsAgentCardController = class {
  constructor(fetchImpl = globalThis.fetch.bind(globalThis)) {
    this.fetchImpl = fetchImpl;
    void this.load();
  }
  fetchImpl;
  baseline = { ...EMPTY_DRAFT };
  state = {
    status: "loading",
    revision: 0,
    writable: false,
    draft: { ...EMPTY_DRAFT },
    accessKey: "",
    secretKey: "",
    accessKeyConfigured: false,
    secretKeyConfigured: false,
    accessKeyWritable: true,
    secretKeyWritable: true,
    dirty: false,
    invalid: false,
    saving: false
  };
  listeners = /* @__PURE__ */ new Set();
  abort = new AbortController();
  disposed = false;
  inject() {
    return {
      hooks: {
        osAgentCard: {
          getSnapshot: () => this.state,
          subscribe: (listener) => {
            this.listeners.add(listener);
            return () => {
              this.listeners.delete(listener);
            };
          }
        }
      },
      edit: (field, value) => {
        this.edit(field, value);
      },
      save: () => {
        void this.save();
      },
      discard: () => {
        this.discard();
      },
      reload: () => {
        void this.load();
      }
    };
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.listeners.clear();
  }
  edit(field, value) {
    if (field === "accessKey" || field === "secretKey") {
      if (typeof value !== "string") return;
      this.publish({ ...this.state, [field]: value, error: void 0 });
      return;
    }
    if (field === "showScreenshots") {
      if (typeof value !== "boolean") return;
    } else if (typeof value !== "string") return;
    this.publish({
      ...this.state,
      draft: { ...this.state.draft, [field]: value },
      error: void 0
    });
  }
  discard() {
    this.publish({
      ...this.state,
      draft: { ...this.baseline },
      accessKey: "",
      secretKey: "",
      error: void 0
    });
  }
  async load() {
    this.publish({ ...this.state, status: "loading", error: void 0 });
    try {
      const view = await request(this.fetchImpl, "GET", void 0, this.abort.signal);
      this.accept(view);
    } catch (error) {
      if (this.disposed) return;
      this.publish({
        ...this.state,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  async save() {
    const parsed = parseDraft(this.state.draft);
    if (!this.state.writable || this.state.saving || parsed === void 0) return;
    this.publish({ ...this.state, saving: true, error: void 0 });
    try {
      const view = await request(this.fetchImpl, "PUT", {
        expectedRevision: this.state.revision,
        config: parsed,
        ...this.state.accessKey === "" ? {} : { accessKey: this.state.accessKey },
        ...this.state.secretKey === "" ? {} : { secretKey: this.state.secretKey }
      }, this.abort.signal);
      this.accept(view);
    } catch (error) {
      if (this.disposed) return;
      this.publish({
        ...this.state,
        saving: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  accept(view) {
    if (this.disposed) return;
    const draft = toDraft(view.config);
    this.baseline = draft;
    this.publish({
      status: "ready",
      revision: view.revision,
      writable: view.writable,
      draft: { ...draft },
      accessKey: "",
      secretKey: "",
      accessKeyConfigured: view.credentials.accessKey.configured,
      secretKeyConfigured: view.credentials.secretKey.configured,
      accessKeyWritable: view.credentials.accessKey.writable,
      secretKeyWritable: view.credentials.secretKey.writable,
      dirty: false,
      invalid: false,
      saving: false
    });
  }
  publish(next) {
    const dirty = next.accessKey !== "" || next.secretKey !== "" || !sameDraft(next.draft, this.baseline);
    const state = { ...next, dirty, invalid: parseDraft(next.draft) === void 0 };
    this.state = state;
    for (const listener of this.listeners) listener();
  }
};
function parseDraft(draft) {
  const maxSteps = integer(draft.maxSteps, 1, 500);
  const timeout = integer(draft.timeout, 1, 86400);
  if (maxSteps === void 0 || timeout === void 0) return void 0;
  const tos = [draft.tosBucket, draft.tosEndpoint, draft.tosRegion].map((value) => value.trim());
  const tosCount = tos.filter(Boolean).length;
  if (tosCount !== 0 && tosCount !== 3) return void 0;
  return {
    productId: draft.productId.trim(),
    podId: draft.podId.trim(),
    maxSteps,
    timeout,
    systemPrompt: draft.systemPrompt.trim(),
    showScreenshots: draft.showScreenshots,
    tosBucket: tos[0],
    tosEndpoint: tos[1],
    tosRegion: tos[2]
  };
}
async function request(fetchImpl, method, body, signal) {
  const response = await fetchImpl(CONFIG_ENDPOINT, {
    method,
    headers: {
      "x-os-agent-plugin": "1",
      ...body === void 0 ? {} : { "content-type": "application/json" }
    },
    ...body === void 0 ? {} : { body: JSON.stringify(body) },
    signal
  });
  const value = await response.json();
  if (!response.ok || value.ok !== true) {
    throw new Error(value.ok === false && value.error !== void 0 ? value.error : `request failed with HTTP ${response.status}`);
  }
  return value;
}
function toDraft(config) {
  return {
    productId: config.productId,
    podId: config.podId,
    maxSteps: String(config.maxSteps),
    timeout: String(config.timeout),
    systemPrompt: config.systemPrompt,
    showScreenshots: config.showScreenshots === true,
    tosBucket: config.tosBucket,
    tosEndpoint: config.tosEndpoint,
    tosRegion: config.tosRegion
  };
}
function integer(value, min, max) {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : void 0;
}
function sameDraft(left, right) {
  return Object.keys(left).every((field) => left[field] === right[field]);
}

// src/client/OsAgentResultCard.tsx
var import_react = require("react");
var import_dsh_client_ui_attachment = require("@deepseek-ai/dsh-client-ui-attachment");

// src/client/result-model.ts
function screenshotsFromMeta(meta) {
  if (!isRecord(meta) || !Array.isArray(meta.osAgentScreenshots)) return [];
  return meta.osAgentScreenshots.filter(isImageRef).slice(0, 100);
}
function resultText(content) {
  return content.flatMap((block) => {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") return [block.text];
    return [];
  }).join("\n");
}
function isImageRef(value) {
  if (!isRecord(value)) return false;
  return typeof value.attachmentId === "string" && value.attachmentId !== "" && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(value.mediaType)) && positiveInteger(value.bytes) && positiveInteger(value.width) && positiveInteger(value.height) && (value.name === void 0 || typeof value.name === "string");
}
function positiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/client/OsAgentResultCard.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function OsAgentResultCard(props) {
  const result = settledResult(props.block);
  const screenshots = result === void 0 ? [] : screenshotsFromMeta(result.meta);
  const load = (0, import_react.useCallback)(
    (attachment) => props.loadOsAgentImage(props.sessionId, attachment),
    [props.loadOsAgentImage, props.sessionId]
  );
  const labels = (0, import_react.useMemo)(() => ({
    image: props.t("screenshot"),
    open: props.t("openScreenshot"),
    openNamed: (name) => `${props.t("openScreenshot")}: ${name}`,
    loading: props.t("loadingScreenshot"),
    loadFailed: props.t("screenshotLoadFailed"),
    lightbox: { dialog: props.t("screenshotPreview"), close: props.t("closeScreenshot") }
  }), [props.t]);
  const output = result === void 0 ? "" : resultText(result.content);
  const failed = result?.isError === true;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "osa-tool-result", "data-failed": failed || void 0, "aria-label": props.t("resultCard"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "osa-tool-result-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: props.t(props.toolName === "mobile_use_get_status" ? "statusCard" : "resultCard") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "osa-tool-result-count", children: result !== void 0 ? props.t(screenshots.length === 1 ? "oneScreenshot" : "manyScreenshots").replace("{count}", String(screenshots.length)) : props.t("running") })
    ] }),
    screenshots.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "osa-tool-result-images", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_attachment.ImageGallery, { images: screenshots.map((attachment) => ({ attachment })), load, align: "start", labels }) }) : null,
    result !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "osa-tool-result-text", open: failed || void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: props.t("textResult") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: output })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "osa-tool-result-running", children: props.t("waitingForResult") }),
    props.inspect !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "osa-inspect", onClick: props.inspect, children: props.t("inspect") }) : null
  ] });
}
function settledResult(block) {
  return "kind" in block ? block : void 0;
}

// src/client/OsAgentTab.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function OsAgentTab(props) {
  const state = props.useOsAgentCard((value) => value);
  const disabled = !state.writable || state.saving;
  if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "osa-status", children: props.t("loading") });
  if (state.status === "failed") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "osa-status osa-error", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: state.error ?? props.t("loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: props.reload, children: props.t("retry") })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "osa-card", "aria-labelledby": "osa-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("header", { className: "osa-header", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { id: "osa-title", children: props.t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("description") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "osa-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        SecretField,
        {
          id: "osa-access-key",
          label: props.t("accessKey"),
          hint: props.t("accessKeyHint"),
          value: state.accessKey,
          configured: state.accessKeyConfigured,
          configuredText: props.t(state.accessKeyConfigured ? "configured" : "notConfigured"),
          disabled: !state.accessKeyWritable || state.saving,
          onChange: (value) => {
            props.edit("accessKey", value);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        SecretField,
        {
          id: "osa-secret-key",
          label: props.t("secretKey"),
          hint: props.t("secretKeyHint"),
          value: state.secretKey,
          configured: state.secretKeyConfigured,
          configuredText: props.t(state.secretKeyConfigured ? "configured" : "notConfigured"),
          disabled: !state.secretKeyWritable || state.saving,
          onChange: (value) => {
            props.edit("secretKey", value);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-product-id", label: props.t("productId"), hint: props.t("productIdHint"), value: state.draft.productId, disabled, onChange: (value) => {
        props.edit("productId", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-pod-id", label: props.t("podId"), hint: props.t("podIdHint"), value: state.draft.podId, disabled, onChange: (value) => {
        props.edit("podId", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-max-steps", label: props.t("maxSteps"), hint: props.t("maxStepsHint"), value: state.draft.maxSteps, disabled, inputMode: "numeric", onChange: (value) => {
        props.edit("maxSteps", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-timeout", label: props.t("timeout"), hint: props.t("timeoutHint"), value: state.draft.timeout, disabled, inputMode: "numeric", onChange: (value) => {
        props.edit("timeout", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-system-prompt", label: props.t("systemPrompt"), hint: props.t("systemPromptHint"), value: state.draft.systemPrompt, disabled, multiline: true, onChange: (value) => {
        props.edit("systemPrompt", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        SwitchField,
        {
          id: "osa-show-screenshots",
          label: props.t("showScreenshots"),
          hint: props.t("showScreenshotsHint"),
          checked: state.draft.showScreenshots,
          disabled,
          onChange: (value) => {
            props.edit("showScreenshots", value);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-tos-bucket", label: props.t("tosBucket"), hint: props.t("tosGroupHint"), value: state.draft.tosBucket, disabled, onChange: (value) => {
        props.edit("tosBucket", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-tos-endpoint", label: props.t("tosEndpoint"), hint: props.t("tosEndpointHint"), value: state.draft.tosEndpoint, disabled, onChange: (value) => {
        props.edit("tosEndpoint", value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { id: "osa-tos-region", label: props.t("tosRegion"), hint: props.t("tosRegionHint"), value: state.draft.tosRegion, disabled, onChange: (value) => {
        props.edit("tosRegion", value);
      } })
    ] }),
    state.invalid ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "osa-error", role: "alert", children: props.t("invalid") }) : null,
    state.error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "osa-error", role: "alert", children: state.error }) : null,
    !state.writable ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "osa-muted", children: props.t("readOnly") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { className: "osa-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "osa-secondary", disabled: !state.dirty || state.saving, onClick: props.discard, children: props.t("discard") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "osa-primary", disabled: !state.dirty || state.invalid || disabled, onClick: props.save, children: state.saving ? props.t("saving") : props.t("save") })
    ] })
  ] });
}
function Field(props) {
  const change = (event) => {
    props.onChange(event.currentTarget.value);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `osa-field${props.multiline ? " osa-wide" : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: props.id, children: props.label }),
    props.multiline ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { id: props.id, value: props.value, disabled: props.disabled, onChange: change }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: props.id, value: props.value, disabled: props.disabled, inputMode: props.inputMode, onChange: change }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.hint })
  ] });
}
function SwitchField(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "osa-field osa-wide osa-switch-field", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "osa-switch-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: props.id, children: props.label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { id: `${props.id}-hint`, children: props.hint })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "input",
      {
        id: props.id,
        type: "checkbox",
        role: "switch",
        "aria-describedby": `${props.id}-hint`,
        checked: props.checked,
        disabled: props.disabled,
        onChange: (event) => {
          props.onChange(event.currentTarget.checked);
        }
      }
    )
  ] }) });
}
function SecretField(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "osa-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "osa-label-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: props.id, children: props.label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: props.configured ? "osa-badge" : "osa-muted", children: props.configuredText })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: props.id, type: "password", autoComplete: "off", value: props.value, disabled: props.disabled, onChange: (event) => {
      props.onChange(event.currentTarget.value);
    } }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.hint })
  ] });
}

// src/client/styles.ts
var STYLE_ID = "dsh-os-agent-plugin/client";
var STYLES = `
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
.osa-tool-result-text{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}
.osa-tool-result-text summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}
.osa-tool-result-text pre{box-sizing:border-box;max-height:320px;overflow:auto;margin:8px 0 0;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.osa-tool-result-running{margin:8px 0 0}
.osa-inspect{margin-top:10px;border:1px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
@media(max-width:640px){.osa-card{padding:14px}.osa-grid{grid-template-columns:1fr}.osa-wide{grid-column:auto}.osa-footer{position:sticky;bottom:0;background:var(--dsw-alias-bg-layer-3);padding-bottom:4px}}
`;

// src/client/index.ts
var inject = ["slots", "locale", "conversation"];
var NS = "os-agent-plugin";
var en = {
  tab: "OS Agent",
  title: "OS Agent Plugin",
  description: "Volcengine Mobile Use Agent for the configured cloud phone.",
  loading: "Loading OS Agent configuration\u2026",
  loadFailed: "Could not load OS Agent configuration.",
  retry: "Retry",
  accessKey: "AccessKey",
  accessKeyHint: "Stored in Harness credentials. Leave blank to keep the current key.",
  secretKey: "Secret Key",
  secretKeyHint: "Stored in Harness credentials. Leave blank to keep the current secret.",
  configured: "Configured",
  notConfigured: "Not configured",
  productId: "Product Id",
  productIdHint: "Cloud-phone business identifier.",
  podId: "PodId",
  podIdHint: "Cloud-phone instance operated by Mobile Use Agent.",
  maxSteps: "Max steps",
  maxStepsHint: "Integer from 1 to 500.",
  timeout: "Timeout (seconds)",
  timeoutHint: "Integer from 1 to 86,400.",
  systemPrompt: "SystemPrompt",
  systemPromptHint: "Optional system instructions for every run.",
  showScreenshots: "Show task screenshots",
  showScreenshotsHint: "Off by default. Requests base64 step screenshots and stores validated images in Harness attachments for Web UI display.",
  tosBucket: "TOS bucket",
  tosEndpoint: "TOS endpoint",
  tosRegion: "TOS region",
  tosGroupHint: "Bucket, endpoint, and region must be configured together.",
  tosEndpointHint: "For example, tos-cn-beijing.volces.com.",
  tosRegionHint: "For example, cn-beijing.",
  invalid: "Check the numeric ranges and configure either all three TOS fields or none.",
  readOnly: "This Harness settings provider is read-only.",
  discard: "Discard",
  save: "Save",
  saving: "Saving\u2026",
  resultCard: "Mobile Use result",
  statusCard: "Mobile Use status",
  running: "Running\u2026",
  waitingForResult: "Waiting for the API response\u2026",
  screenshot: "Mobile Use screenshot",
  oneScreenshot: "1 screenshot",
  manyScreenshots: "{count} screenshots",
  textResult: "Text result",
  inspect: "Inspect",
  openScreenshot: "Open screenshot",
  loadingScreenshot: "Loading\u2026",
  screenshotLoadFailed: "Could not load screenshot. Retry",
  screenshotPreview: "Screenshot preview",
  closeScreenshot: "Close screenshot"
};
var zh = {
  tab: "OS Agent",
  title: "OS Agent \u63D2\u4EF6",
  description: "\u4F7F\u7528\u706B\u5C71\u5F15\u64CE Mobile Use Agent \u64CD\u4F5C\u5DF2\u914D\u7F6E\u7684\u4E91\u624B\u673A\u3002",
  loading: "\u6B63\u5728\u52A0\u8F7D OS Agent \u914D\u7F6E\u2026",
  loadFailed: "\u65E0\u6CD5\u52A0\u8F7D OS Agent \u914D\u7F6E\u3002",
  retry: "\u91CD\u8BD5",
  accessKey: "AccessKey",
  accessKeyHint: "\u4FDD\u5B58\u5728 Harness credentials \u4E2D\uFF1B\u7559\u7A7A\u8868\u793A\u4FDD\u7559\u5F53\u524D\u5BC6\u94A5\u3002",
  secretKey: "Secret Key",
  secretKeyHint: "\u4FDD\u5B58\u5728 Harness credentials \u4E2D\uFF1B\u7559\u7A7A\u8868\u793A\u4FDD\u7559\u5F53\u524D\u5BC6\u94A5\u3002",
  configured: "\u5DF2\u914D\u7F6E",
  notConfigured: "\u672A\u914D\u7F6E",
  productId: "Product Id",
  productIdHint: "\u4E91\u624B\u673A\u4E1A\u52A1\u6807\u8BC6\u3002",
  podId: "PodId",
  podIdHint: "Mobile Use Agent \u64CD\u4F5C\u7684\u4E91\u624B\u673A\u5B9E\u4F8B\u3002",
  maxSteps: "\u6700\u5927\u6B65\u9AA4\u6570",
  maxStepsHint: "1 \u5230 500 \u7684\u6574\u6570\u3002",
  timeout: "\u8D85\u65F6\u65F6\u95F4\uFF08\u79D2\uFF09",
  timeoutHint: "1 \u5230 86,400 \u7684\u6574\u6570\u3002",
  systemPrompt: "SystemPrompt",
  systemPromptHint: "\u5E94\u7528\u4E8E\u6BCF\u6B21\u8FD0\u884C\u7684\u53EF\u9009\u7CFB\u7EDF\u6307\u4EE4\u3002",
  showScreenshots: "\u663E\u793A\u4EFB\u52A1\u622A\u56FE",
  showScreenshotsHint: "\u9ED8\u8BA4\u5173\u95ED\u3002\u5F00\u542F\u540E\u8BF7\u6C42 Base64 \u6B65\u9AA4\u622A\u56FE\uFF0C\u5E76\u5C06\u901A\u8FC7\u6821\u9A8C\u7684\u56FE\u7247\u5B58\u5165 Harness attachments\uFF0C\u5728\u7F51\u9875\u754C\u9762\u4E2D\u663E\u793A\u3002",
  tosBucket: "TOS Bucket",
  tosEndpoint: "TOS Endpoint",
  tosRegion: "TOS Region",
  tosGroupHint: "Bucket\u3001Endpoint \u548C Region \u5FC5\u987B\u4E00\u8D77\u914D\u7F6E\u3002",
  tosEndpointHint: "\u4F8B\u5982 tos-cn-beijing.volces.com\u3002",
  tosRegionHint: "\u4F8B\u5982 cn-beijing\u3002",
  invalid: "\u8BF7\u68C0\u67E5\u6570\u503C\u8303\u56F4\uFF0C\u5E76\u540C\u65F6\u586B\u5199\u5168\u90E8\u4E09\u4E2A TOS \u5B57\u6BB5\u6216\u5168\u90E8\u7559\u7A7A\u3002",
  readOnly: "\u5F53\u524D Harness settings provider \u4E3A\u53EA\u8BFB\u3002",
  discard: "\u653E\u5F03",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  resultCard: "Mobile Use \u7ED3\u679C",
  statusCard: "Mobile Use \u72B6\u6001",
  running: "\u8FD0\u884C\u4E2D\u2026",
  waitingForResult: "\u6B63\u5728\u7B49\u5F85\u63A5\u53E3\u54CD\u5E94\u2026",
  screenshot: "Mobile Use \u622A\u56FE",
  oneScreenshot: "1 \u5F20\u622A\u56FE",
  manyScreenshots: "{count} \u5F20\u622A\u56FE",
  textResult: "\u6587\u5B57\u7ED3\u679C",
  inspect: "\u68C0\u67E5\u8BE6\u60C5",
  openScreenshot: "\u6253\u5F00\u622A\u56FE",
  loadingScreenshot: "\u52A0\u8F7D\u4E2D\u2026",
  screenshotLoadFailed: "\u622A\u56FE\u52A0\u8F7D\u5931\u8D25\uFF0C\u70B9\u51FB\u91CD\u8BD5",
  screenshotPreview: "\u622A\u56FE\u9884\u89C8",
  closeScreenshot: "\u5173\u95ED\u622A\u56FE"
};
function apply(ctx) {
  const controller = new OsAgentCardController();
  const conversation = ctx.get("conversation");
  const loadOsAgentImage = (sessionId, attachment) => conversation.resolveImage(sessionId, attachment);
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "os-agent-plugin: dictionaries");
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-os-agent-plugin";
    tag.dataset.pluginCss = STYLE_ID;
    tag.textContent = STYLES;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "os-agent-plugin: styles");
  ctx.effect(() => () => {
    controller.dispose();
  }, "os-agent-plugin: controller");
  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
    name: "settings.plugins.tab",
    id: "os-agent",
    order: 20,
    label: () => t("tab"),
    locale: NS,
    inject: () => controller.inject()
  }, OsAgentTab));
  ctx.slots.inject("tool.call.toolview", function* () {
    const inject2 = () => ({ loadOsAgentImage });
    yield ctx.slots.register({ name: "tool.call.toolview", key: "mobile_use_get_status", locale: NS, inject: inject2 }, OsAgentResultCard);
    yield ctx.slots.register({ name: "tool.call.toolview", key: "mobile_use_get_result", locale: NS, inject: inject2 }, OsAgentResultCard);
  });
}
    return module.exports;
  }
});
