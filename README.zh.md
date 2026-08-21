# OS Agent Plugin

[English](README.md) | 中文

这是一个完整、自包含的 DeepSeek Harness 火山引擎 Mobile Use Agent 插件。安装一个包即可同时提供 Cordis 运行时与浏览器配置界面，不需要修改 Harness 仓库或复制补丁文件。

## 功能

- `mobile_use_start_task` 启动一次 Mobile Use 一键运行并返回 `RunId`。
- `mobile_use_get_status` 读取运行的当前步骤。
- `mobile_use_get_result` 获取已完成运行的结果。
- 在**设置 → 插件 → OS Agent**中配置 AccessKey、Secret Key、Product Id、PodId、最大步骤数、超时时间、SystemPrompt 与 TOS 输出。
- 浏览器只能写入 AccessKey 与 Secret Key；密钥保存在 Harness credential store 中，不会由配置接口返回。

## 兼容性

当前版本已在 DeepSeek Harness `0.1.1-rc.2` 完成集成测试，并使用 `0.1.0-rc.5` 同样具备的扩展接口；要求 Node.js `^22.19.0 || >=24.0.0`。插件使用 Harness 的外部双端插件协议：`cordis.patch.yml` 挂载 Node 运行时，`dsh.client` 发布预构建浏览器模块。

## 安装

在可以使用 `dsh` CLI 的任意目录中运行：

```sh
pnpm dsh plugin --profile web add git+https://github.com/chenjie1129/deepseek-harness-os-agent-plugin.git
pnpm dsh --profile web --dump-config
pnpm dsh --profile web
```

打开 Harness 输出的网址，然后进入**设置 → 插件 → OS Agent**。移除插件：

```sh
pnpm dsh plugin --profile web remove dsh-os-agent-plugin
```

## 配置

- AccessKey 与 Secret Key 默认使用 `VOLC_ACCESSKEY` 和 `VOLC_SECRETKEY` credential 引用。
- Product Id 与 PodId 选择云手机业务与实例。
- 最大步骤数范围为 1–500；超时时间范围为 1–86,400 秒。
- SystemPrompt 可选。
- TOS Bucket、Endpoint 和 Region 可选，但必须同时配置。

火山引擎账号必须已开通 Mobile Use Agent，并拥有操作所配置云手机的权限。需要录屏时，TOS 必须可访问。

## 开发与验证

本仓库无需父级 Harness checkout 即可安装依赖、构建和测试：

```sh
corepack pnpm install
pnpm build
pnpm test
pnpm audit --audit-level high
```

通过 Git 安装时必须包含已提交的 `lib/client.js`。GitHub Actions 会在每次 push 和 pull request 时重复执行独立检查，并把打包产物安装到固定版本的干净 Harness 中完成启动验证。

火山引擎参考：[Mobile Use OpenAPI](https://docs.volcengine.com/docs/6394/1953040?lang=zh)与 [Python 示例](https://github.com/volcengine/vePhone/blob/main/Quick%20Start/MobileUse/openapi_sample/python_openapi_sample.py)。
