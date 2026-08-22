# OS Agent Plugin

[![Verify plugin](https://github.com/chenjie1129/deepseek-harness-os-agent-plugin/actions/workflows/verify.yml/badge.svg)](https://github.com/chenjie1129/deepseek-harness-os-agent-plugin/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-blue)](https://github.com/deepseek-ai)
[![Node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24-brightgreen)](https://nodejs.org)
[![Volcengine Mobile Use](https://img.shields.io/badge/Volcengine-Mobile%20Use%20Agent-orange)](https://www.volcengine.com/product/MobileUseAgent)

[English](README.md) | 中文

给你的 DeepSeek Harness 智能体配一台真手机。这是一个完整、自包含的 [火山引擎 Mobile Use Agent](https://www.volcengine.com/product/MobileUseAgent) Harness 插件：安装一个包即可同时提供 Cordis 运行时与浏览器配置界面，让模型用自然语言驱动云手机。不需要修改 Harness 仓库或复制补丁文件。

```
你：    打开购物 App，搜索无线耳机，告诉我前三名的价格。
智能体：mobile_use_start_task  → RunId: run-8f2c...
        mobile_use_get_status  → 第 7/100 步，正在点击搜索结果
        mobile_use_get_result  → "1. ¥299  2. ¥349  3. ¥429"
```

## 为什么用这个插件

- **不用设备实验室。** 手机由火山引擎托管，不需要数据线、模拟器或 Appium 集群。
- **不用改 Harness。** 以外部双端插件方式安装——不打补丁、不复制文件。
- **自然语言进，结果出。** 三个工具覆盖完整运行生命周期。
- **密钥不出服务端。** AccessKey 与 Secret Key 在浏览器中只能写入，保存在 Harness credential store。

## 架构

![OS Agent Plugin 架构](https://raw.githubusercontent.com/chenjie1129/deepseek-harness-os-agent-plugin/main/docs/assets/architecture.svg)

| 层 | 职责 |
|---|---|
| `index.js` | 注册设置项、system prompt 段落与三个面向模型的工具 |
| `volcengine.js` | Mobile Use OpenAPI 的签名（HMAC-SHA256）传输层 |
| `web-config.js` + `src/client` | **设置 → 插件 → OS Agent** 配置页 |
| `cordis.patch.yml` | 把 Node 运行时挂载进 Harness |

## 快速开始

五分钟从零跑通第一个云手机任务。

### 1. 准备火山引擎（一次性）

1. 在火山引擎账号上开通 [Mobile Use Agent](https://www.volcengine.com/product/MobileUseAgent)。
2. 创建或选定一台云手机，记下它的 **Product Id** 与 **PodId**。
3. 创建一对有权操作该云手机的 AccessKey / Secret Key。

### 2. 安装插件

在可以使用 `dsh` CLI 的任意目录中运行：

```sh
pnpm dsh plugin --profile web add git+https://github.com/chenjie1129/deepseek-harness-os-agent-plugin.git
pnpm dsh --profile web --dump-config
pnpm dsh --profile web
```

### 3. 在浏览器中配置

打开 Harness 输出的网址，进入**设置 → 插件 → OS Agent**，填入 AccessKey、Secret Key、Product Id 与 PodId。其余项先保持默认。

### 4. 跑第一个任务

用自然语言对 Harness 智能体说：

```
用云手机打开设置，告诉我 Android 版本号。
```

智能体会调用 `mobile_use_start_task`，保存返回的 `RunId`，用 `mobile_use_get_status` 轮询进度，最后汇报 `mobile_use_get_result` 的结果。整个循环就这么简单。

> 想先不经过智能体、直接验证密钥？运行无头冒烟脚本：
> ```sh
> VOLC_ACCESSKEY=... VOLC_SECRETKEY=... \
> OS_AGENT_PRODUCT_ID=... OS_AGENT_POD_ID=... \
> node examples/headless-run.mjs "打开设置并报告 Android 版本号"
> ```

## 示例

可直接复制使用的场景配方见 [`examples/`](examples/)：

| 配方 | 场景 |
|---|---|
| [App 回归流程走查](examples/README.zh.md#1-app-回归流程走查) | 端到端跑通注册或下单流程，并录屏 |
| [应用商店竞品扫描](examples/README.zh.md#2-应用商店竞品扫描) | 在商店中搜索并提取排名或价格数据 |
| [跨 App 数据流转](examples/README.zh.md#3-跨-app-数据流转) | 在两个 App 之间搬运内容并校验是否到达 |
| [`headless-run.mjs`](examples/headless-run.mjs) | 启动 → 轮询 → 取结果，不依赖 Harness，用于校验密钥 |

## 工具

| 工具 | 用途 | 主要参数 |
|---|---|---|
| `mobile_use_start_task` | 启动一次 Mobile Use 运行，返回 `RunId` | `task`（必填）、`run_name`、`thread_id`、`screen_record` |
| `mobile_use_get_status` | 读取运行的当前步骤 | `run_id`（必填） |
| `mobile_use_get_result` | 获取已完成运行的结果 | `run_id`（必填） |

`screen_record: true` 需要下方的 TOS 配置。

## 配置

在**设置 → 插件 → OS Agent**中配置。

| 配置项 | 说明 |
|---|---|
| AccessKey / Secret Key | 默认使用 `VOLC_ACCESSKEY` 与 `VOLC_SECRETKEY` credential 引用；浏览器中只能写入 |
| Product Id / PodId | 选择云手机业务与实例 |
| 最大步骤数 | 整数，1–500（默认 100） |
| 超时时间 | 秒，1–86,400（默认 120） |
| SystemPrompt | 可选，传给 Mobile Use 的额外指令 |
| TOS Bucket / Endpoint / Region | 可选，但必须同时配置；录屏时必填 |

火山引擎账号必须已开通 Mobile Use Agent，并拥有操作所配置云手机的权限。需要录屏时，TOS 必须可访问。

## 兼容性

当前版本已在 DeepSeek Harness `0.1.1-rc.2` 完成集成测试，并使用 `0.1.0-rc.5` 同样具备的扩展接口；要求 Node.js `^22.19.0 || >=24.0.0`。插件使用 Harness 的外部双端插件协议：`cordis.patch.yml` 挂载 Node 运行时，`dsh.client` 发布预构建浏览器模块。

## 故障排查

| 报错信息 | 处理方式 |
|---|---|
| `OS Agent Plugin is not configured: AccessKey is missing.` | 在设置页填入 AccessKey，或提供 `VOLC_ACCESSKEY` credential |
| `... Product Id is missing.` / `... PodId is missing.` | 启动任务前两者都必须填写 |
| `TOS bucket, endpoint, and region must be configured together.` | 三项全部填写，或全部留空 |
| `Screen recording requires TOS bucket, endpoint, and region.` | 传 `screen_record: true` 前先配好 TOS |
| `Volcengine Mobile Use API rejected the request (...)` | 检查是否已开通 Mobile Use Agent，以及密钥是否有权操作该 PodId |

## 卸载

```sh
pnpm dsh plugin --profile web remove dsh-os-agent-plugin
```

## 开发与验证

本仓库无需父级 Harness checkout 即可安装依赖、构建和测试：

```sh
corepack pnpm install
pnpm build
pnpm test
pnpm audit --audit-level high
```

通过 Git 安装时必须包含已提交的 `lib/client.js`。GitHub Actions 会在每次 push 和 pull request 时重复执行独立检查，并把打包产物安装到固定版本的干净 Harness 中完成启动验证。

## 参考

- [火山引擎 Mobile Use Agent 产品页](https://www.volcengine.com/product/MobileUseAgent)
- [Mobile Use OpenAPI](https://docs.volcengine.com/docs/6394/1953040?lang=zh)
- [Python 示例](https://github.com/volcengine/vePhone/blob/main/Quick%20Start/MobileUse/openapi_sample/python_openapi_sample.py)

## 许可

[MIT](LICENSE)
