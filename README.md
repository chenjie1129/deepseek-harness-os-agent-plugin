# OS Agent Plugin

English | [中文](README.zh.md)

A self-contained DeepSeek Harness plugin for Volcengine Mobile Use Agent. One installed package contributes both the Cordis runtime and its browser configuration surface; it does not require patches or copied files in the Harness repository.

## Features

- `mobile_use_start_task` starts a one-step Mobile Use run and returns its `RunId`.
- `mobile_use_get_status` reads the run's current step.
- `mobile_use_get_result` fetches the completed result.
- **Settings → Plugins → OS Agent** configures AccessKey, Secret Key, Product Id, PodId, maximum steps, timeout, SystemPrompt, and TOS output.
- AccessKey and Secret Key are write-only in the browser and remain in the Harness credential store.

## Compatibility

The current release is integration-tested with DeepSeek Harness `0.1.1-rc.2` and uses extension surfaces also present in `0.1.0-rc.5`. Node.js `^22.19.0 || >=24.0.0` is required. The package uses Harness's external dual-face plugin protocol: `cordis.patch.yml` mounts the Node runtime, while `dsh.client` publishes the prebuilt browser module.

## Install

From any directory with the `dsh` CLI available:

```sh
pnpm dsh plugin --profile web add git+https://github.com/chenjie1129/deepseek-harness-os-agent-plugin.git
pnpm dsh --profile web --dump-config
pnpm dsh --profile web
```

Open the URL printed by Harness, then go to **Settings → Plugins → OS Agent**. To remove the plugin:

```sh
pnpm dsh plugin --profile web remove dsh-os-agent-plugin
```

## Configuration

- AccessKey and Secret Key use the `VOLC_ACCESSKEY` and `VOLC_SECRETKEY` credential references by default.
- Product Id and PodId select the cloud-phone business and instance.
- Max steps accepts 1–500; timeout accepts 1–86,400 seconds.
- SystemPrompt is optional.
- TOS bucket, endpoint, and region are optional but must be configured together.

The Volcengine account must have Mobile Use Agent enabled and permission to operate the configured cloud phone. TOS must be accessible when screen recording is requested.

## Development and verification

The repository installs, builds, and tests without a parent Harness checkout:

```sh
corepack pnpm install
pnpm build
pnpm test
pnpm audit --audit-level high
```

The committed `lib/client.js` is required for Git installation. GitHub Actions repeats the standalone checks and installs the packed artifact into a clean, pinned Harness checkout on every push and pull request.

Volcengine references: [Mobile Use OpenAPI](https://docs.volcengine.com/docs/6394/1953040?lang=zh) and [Python sample](https://github.com/volcengine/vePhone/blob/main/Quick%20Start/MobileUse/openapi_sample/python_openapi_sample.py).
