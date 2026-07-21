## SwarmStudio 1.8

基于 hermes-studio 0.6.31 + hermes-agent 0.19.0，升级 hermes-agent 至 Quicksilver Release。

### 本次更新

#### 上游升级 hermes-agent v0.18.2 → v0.19.0 (Quicksilver Release)

v0.19.0 是 hermes-agent 的 Quicksilver Release，官方 tag 描述：首次响应延迟（TTFT）在所有平台降低约 80%、桌面端性能浪潮（20+ 性能 PR）、终端计费、智能审批默认开启、可插拔密钥源、live subagent 转录、持久化投递与委派台账、gateway profile 路由，以及新 provider 和前沿模型。汇总约 2,245 次提交、1,065 个 PR、3,300+ issues 关闭、420+ 贡献者。

主要变更：

- **首轮流首 Token 延迟 -80%**：所有平台首轮 TTFT 大幅下降，打开会话即可见响应。
- **桌面端性能浪潮**：20+ 桌面性能 PR（启动、列表渲染、消息流、首屏）。
- **终端计费**：`/subscription` 与 `/topup` 命令在终端内直接查看订阅与充值。
- **Smart approvals 默认开启**：工具审批走向默认智能放行，减少打断。
- **可插拔 SecretSource**：Bitwarden / 1Password 作为凭据后端可插拔。
- **Live subagent transcripts**：子 agent 运行时实时回传 transcript，便于审计。
- **Durable delivery + delegation ledgers**：消息投递与任务委派具备持久化台账。
- **Gateway profile routing**：gateway 可按 profile 路由请求。
- **新 provider + 前沿模型**：Fireworks、DeepInfra 接入；GPT-5.6、grok-4.5、kimi-k3、Claude Sonnet 5 等前沿模型上架。
- **Matrix / Feishu / DingTalk / Bedrock / Kimi / WhatsApp** 等既有平台兼容性修复（共 ~1,687 个提交）。

#### Overlay Patch 兼容性

hermes-agent v0.19.0 的代码漂移未触及 overlay 已应用的 hermes-agent 路径：

- `117-agent-default-workspace-kind-dir`：`hermes_cli/kanban_db.py` / `kanban_swarm.py` / `plugins/kanban/dashboard/plugin_api.py` 的 `workspace_kind` 默认值改动上下文未变，patch 直接 apply 通过。
- `118-profile-default-run-trace`：`hermes_cli/profiles.py` 的 run-trace 种子注入逻辑上下文未变，patch 直接 apply 通过。

无需新生成或调整 overlay patch。

### 验证结果
- inject：109 patch 全应用（无 WARN / FAILED）
- overlay 测试：65 文件 / 489 测试，480 passed / 6 skipped（3 个 failed 在 0.18.2 baseline 上同样失败，属 pre-existing stale，与本次升级无关）
- 构建：mac arm64 dmg 成功（Windows x64 zip 后续补传）

### 下载
- `SwarmStudio-0.6.31-arm64.dmg` — macOS Apple Silicon
- `SwarmStudio-0.6.31-x64.zip` — Windows x64（稍后补传）
