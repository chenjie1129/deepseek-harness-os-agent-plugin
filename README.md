# OS Agent Plugin

English | [中文](README.zh.md)

This installable DeepSeek Harness bundle exposes Volcengine Mobile Use Agent as three model-facing tools:

- `mobile_use_start_task` starts a one-step API run and returns its `RunId`.
- `mobile_use_get_status` reads the run's current step.
- `mobile_use_get_result` fetches the completed run result.

## Configuration

Open **Settings → Plugins → Plugin configuration → OS Agent Plugin**. Configure:

- AccessKey and Secret Key (stored through the Harness credential store, never returned by the settings API)
- Product Id and PodId
- Max steps (1–500) and task timeout in seconds (1–86,400)
- Optional SystemPrompt
- Optional TOS bucket, endpoint, and region; all three must be set together

The plugin also accepts the `VOLC_ACCESSKEY` and `VOLC_SECRETKEY` credential references for headless deployments.

## Install into a DeepSeek Harness checkout

Clone this repository as `os-agent-plugin` under a compatible DeepSeek Harness repository, then run from the Harness repository root:

```sh
git clone https://github.com/chenjie1129/deepseek-harness-os-agent-plugin.git os-agent-plugin
pnpm --dir os-agent-plugin install
pnpm dsh plugin --profile web add ./os-agent-plugin
pnpm dsh --profile web --dump-config
pnpm dsh --profile web
```

The Volcengine account must have Mobile Use Agent enabled and permission to operate the configured cloud-phone product and pod. TOS must be accessible when TOS output or screen recording is enabled.

API reference: <https://www.volcengine.com/docs/6394/2105943>
