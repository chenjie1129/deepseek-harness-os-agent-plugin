# OS Agent Plugin

[English](README.md) | 中文

这个可安装的 DeepSeek Harness 组合包把火山引擎 Mobile Use Agent 暴露为三个面向模型的工具：

- `mobile_use_start_task` 启动一次一键运行 API 调用并返回其 `RunId`。
- `mobile_use_get_status` 读取运行的当前步骤。
- `mobile_use_get_result` 获取已完成运行的结果。

## 配置

打开**设置 → 插件 → 插件配置 → OS Agent 插件**。配置以下内容：

- AccessKey 和 Secret Key（通过 Harness credentials 存储保存，绝不会由 settings API 返回）
- Product Id 和 PodId
- 最大步骤数（1–500）和任务超时时间（1–86,400 秒）
- 可选 SystemPrompt
- 可选 TOS Bucket、Endpoint 与 Region；这三个值必须一起设置

对于无界面部署，插件也接受 `VOLC_ACCESSKEY` 和 `VOLC_SECRETKEY` credential 引用。

## 安装到 DeepSeek Harness checkout

在兼容的 DeepSeek Harness 仓库中，将本仓库克隆为 `os-agent-plugin`，然后在 Harness 仓库根目录中运行：

```sh
git clone https://github.com/chenjie1129/deepseek-harness-os-agent-plugin.git os-agent-plugin
pnpm --dir os-agent-plugin install
pnpm dsh plugin --profile web add ./os-agent-plugin
pnpm dsh --profile web --dump-config
pnpm dsh --profile web
```

火山引擎账号必须已经开通 Mobile Use Agent，并拥有操作所配置云手机业务与 Pod 的权限。启用 TOS 输出或录屏时，TOS 必须可访问。

API 参考：<https://www.volcengine.com/docs/6394/2105943>
