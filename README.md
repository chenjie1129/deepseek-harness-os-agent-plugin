# OS Agent Plugin

[![Verify plugin](https://github.com/chenjie1129/deepseek-harness-os-agent-plugin/actions/workflows/verify.yml/badge.svg)](https://github.com/chenjie1129/deepseek-harness-os-agent-plugin/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-blue)](https://github.com/deepseek-ai)
[![Node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24-brightgreen)](https://nodejs.org)
[![Volcengine Mobile Use](https://img.shields.io/badge/Volcengine-Mobile%20Use%20Agent-orange)](https://www.volcengine.com/product/MobileUseAgent)

English | [中文](README.zh.md)

Give your DeepSeek Harness agent a real phone. This is a self-contained Harness plugin for [Volcengine Mobile Use Agent](https://www.volcengine.com/product/MobileUseAgent): one installed package contributes both the Cordis runtime and its browser configuration surface, so your model can drive a cloud phone in natural language. It does not require patches or copied files in the Harness repository.

```
You:    Open the shopping app, search for wireless earbuds, and report the top 3 prices.
Agent:  mobile_use_start_task  → RunId: run-8f2c...
        mobile_use_get_status  → step 7/100, tapping search result
        mobile_use_get_result  → "1. ¥299  2. ¥349  3. ¥429"
```

## Why this plugin

- **No device lab.** Volcengine hosts the phone; you need no USB cable, emulator, or Appium grid.
- **No Harness fork.** Installs as an external dual-face plugin — no patch, no vendored files.
- **Natural language in, result out.** Three tools cover the whole run lifecycle.
- **Credentials stay server-side.** AccessKey and Secret Key are write-only in the browser and live in the Harness credential store.

## Architecture

![OS Agent Plugin architecture](https://raw.githubusercontent.com/chenjie1129/deepseek-harness-os-agent-plugin/main/docs/assets/architecture.svg)

| Layer | What it does |
|---|---|
| `index.js` | Registers settings, the system-prompt section, and the three model-facing tools |
| `volcengine.js` | Signed (HMAC-SHA256) transport for the Mobile Use OpenAPI |
| `web-config.js` + `src/client` | **Settings → Plugins → OS Agent** configuration tab |
| `cordis.patch.yml` | Mounts the Node runtime into Harness |

## Quick start

Five minutes from zero to your first cloud-phone run.

### 1. Prepare Volcengine (once)

1. Enable [Mobile Use Agent](https://www.volcengine.com/product/MobileUseAgent) on your Volcengine account.
2. Create or pick a cloud phone, and note its **Product Id** and **PodId**.
3. Create an AccessKey / Secret Key pair with permission to operate that cloud phone.

### 2. Install the plugin

From any directory with the `dsh` CLI available:

```sh
pnpm dsh plugin --profile web add git+https://github.com/chenjie1129/deepseek-harness-os-agent-plugin.git
pnpm dsh --profile web --dump-config
pnpm dsh --profile web
```

### 3. Configure it in the browser

Open the URL printed by Harness, then go to **Settings → Plugins → OS Agent** and fill in AccessKey, Secret Key, Product Id, and PodId. Leave everything else at its default for now.

### 4. Run your first task

Ask your Harness agent, in plain language:

```
Use the cloud phone to open Settings and tell me the Android version.
```

The agent calls `mobile_use_start_task`, keeps the returned `RunId`, polls `mobile_use_get_status`, and reports what `mobile_use_get_result` returns. That is the whole loop.

> Prefer to verify credentials without an agent? Run the headless smoke script:
> ```sh
> VOLC_ACCESSKEY=... VOLC_SECRETKEY=... \
> OS_AGENT_PRODUCT_ID=... OS_AGENT_POD_ID=... \
> node examples/headless-run.mjs "Open Settings and report the Android version"
> ```

## Examples

Copy-paste recipes live in [`examples/`](examples/):

| Recipe | Scenario |
|---|---|
| [App regression walkthrough](examples/README.md#1-app-regression-walkthrough) | Drive a sign-up or checkout flow end to end, with screen recording |
| [App store competitive scan](examples/README.md#2-app-store-competitive-scan) | Search the store and extract ranking or pricing data |
| [Cross-app data handoff](examples/README.md#3-cross-app-data-handoff) | Move content between two apps and verify it arrived |
| [`headless-run.mjs`](examples/headless-run.mjs) | Start → poll → result, without Harness, for credential checks |

## Tools

| Tool | Purpose | Key arguments |
|---|---|---|
| `mobile_use_start_task` | Start one Mobile Use run, return its `RunId` | `task` (required), `run_name`, `thread_id`, `screen_record` |
| `mobile_use_get_status` | Read the run's current step | `run_id` (required) |
| `mobile_use_get_result` | Fetch the completed result | `run_id` (required) |

`screen_record: true` requires the TOS options below.

## Configuration

Configured under **Settings → Plugins → OS Agent**.

| Field | Notes |
|---|---|
| AccessKey / Secret Key | Default to the `VOLC_ACCESSKEY` and `VOLC_SECRETKEY` credential references; write-only in the browser |
| Product Id / PodId | Select the cloud-phone business and instance |
| Max steps | Integer, 1–500 (default 100) |
| Timeout | Seconds, 1–86,400 (default 120) |
| SystemPrompt | Optional extra instruction passed to Mobile Use |
| TOS bucket / endpoint / region | Optional, but all three must be set together; required for screen recording |

The Volcengine account must have Mobile Use Agent enabled and permission to operate the configured cloud phone. TOS must be accessible when screen recording is requested.

## Compatibility

Integration-tested with DeepSeek Harness `0.1.1-rc.2`, using extension surfaces also present in `0.1.0-rc.5`. Node.js `^22.19.0 || >=24.0.0` is required. The package uses Harness's external dual-face plugin protocol: `cordis.patch.yml` mounts the Node runtime, while `dsh.client` publishes the prebuilt browser module.

## Troubleshooting

| Message | Fix |
|---|---|
| `OS Agent Plugin is not configured: AccessKey is missing.` | Set AccessKey in the settings tab, or provide the `VOLC_ACCESSKEY` credential |
| `... Product Id is missing.` / `... PodId is missing.` | Both are required before starting a task |
| `TOS bucket, endpoint, and region must be configured together.` | Set all three, or clear all three |
| `Screen recording requires TOS bucket, endpoint, and region.` | Configure TOS before passing `screen_record: true` |
| `Volcengine Mobile Use API rejected the request (...)` | Check that Mobile Use Agent is enabled and the key can operate that PodId |

## Uninstall

```sh
pnpm dsh plugin --profile web remove dsh-os-agent-plugin
```

## Development and verification

The repository installs, builds, and tests without a parent Harness checkout:

```sh
corepack pnpm install
pnpm build
pnpm test
pnpm audit --audit-level high
```

The committed `lib/client.js` is required for Git installation. GitHub Actions repeats the standalone checks and installs the packed artifact into a clean, pinned Harness checkout on every push and pull request.

## References

- [Volcengine Mobile Use Agent product page](https://www.volcengine.com/product/MobileUseAgent)
- [Mobile Use OpenAPI](https://docs.volcengine.com/docs/6394/1953040?lang=zh)
- [Python sample](https://github.com/volcengine/vePhone/blob/main/Quick%20Start/MobileUse/openapi_sample/python_openapi_sample.py)

## License

[MIT](LICENSE)
