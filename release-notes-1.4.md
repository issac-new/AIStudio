## SwarmStudio 1.4

基于 hermes-studio 0.6.28 + hermes-agent 0.18.2，升级上游并适配 6 个 overlay patch。

### 本次更新

#### 上游升级 hermes-studio 0.6.27 → 0.6.28
升级 17 个上游提交，主要包含：
- **Workflow node approval gates**：工作流节点审批门控 + 审批重试状态修复。
- **MCU device management**：新增 MCU 设备管理页面 + API token 认证 + 远程 MCU relay 登录稳定化。
- **Group chat workspace diff run 持久化**：群聊房间的 workspace diff 运行变更会持久保存。
- **Session workspace file drawer 修复**：会话工作区文件抽屉交互改进。
- **Coding agent session export + abort routing 修复**：已完成的 coding agent 会话可导出，abort 路由修正。
- **Workspace diff 改进**：保留新文件、隐藏 SQLite sidecar 文件。
- **Session ended_at/end_reason 持久化**：bridge run 终止时写入会话结束时间和原因。
- **计划任务模型选择修复**：允许为定时任务选择模型。
- **Star history embeds 移除**：清理失效的 star history 嵌入。

#### Overlay Patch 适配（6 个 patch 上下文漂移修复）
v0.6.28 上游变更导致 6 个 patch apply 失败，调整上下文行匹配新结构：
- `023-client-store-chat`：chat.ts import 新增 onSessionWorkspaceUpdated，fetchRuntimeSessions/setInterval 行号漂移，重新生成 patch。
- `042-desktop-rebrand-swarmstudio-pkg`：desktop/package.json version 0.6.27 → 0.6.28。
- `087-group-chat-autojoin-on-connect`：group-chat/index.ts 大幅重构（ChatStorage.addMessage 463→478，Connected 953→1152，socket.on('join') 签名变更），重新生成 patch。
- `099-client-store-files-root`：files.ts 重构引入 currentWorkspaceSessionId 机制，12 个新 filesApi 调用点需线程化 workspaceRoot。
- `100-client-files-filetree-root`：FileTree.vue 重构，loadChildren 改用 filesStore.listEntries，移除过时的直接 filesApi 修改。
- `102-groupmessagelist-gateway-banner`：displayMessages filter 重格式化，适配新的 workspace_diff 条件结构。

#### 系统特性（延续 1.3）
- **默认优先使用本机 hermes-agent**：桌面端自动检测系统 PATH 中的 hermes，检测到则跳过 runtime 下载。
- 逃生开关：`HERMES_DESKTOP_FORCE_BUNDLED_RUNTIME=1` 可强制使用 bundled runtime。

### 验证结果
- inject：111 patch 全应用
- overlay 测试：39 文件 / 404 测试全过
- 构建：mac arm64 dmg + win x64 zip 均成功

### 下载
- SwarmStudio-0.6.28-arm64.dmg — macOS Apple Silicon
- SwarmStudio-0.6.28-x64.zip — Windows x64
