## SwarmStudio 1.2

基于 hermes-studio 0.6.26，升级上游并完善回归测试。

### 本次更新

#### 上游升级 hermes-studio 0.6.25 → 0.6.26
升级 20 个上游提交，主要包含：
- **Ekko Agent 接入聊天链路**：补齐 runtime context、浏览器工具、更稳定的工具事件，并恢复 tool result 历史用于上下文用量统计。
- **Coding Agent 上下文展示**：会话更清楚地展示 reasoning 与 context 设置，持久化 API mode，避免 Codex 误用 app-server API mode，修复继续对话后上下文用量跳变。
- **Journey 学习图谱视图**：新增学习图谱视图并打磨图谱交互，群聊新功能线补上基线测试覆盖。
- **桌面端可靠性提升**：修复登录持久化和重置流程、Windows worker 动态端口兜底、stdout/stderr EPIPE 处理，并隔离 ESP32-C3 v1 固件打包。
- **MCP available-models 收敛**：默认改为紧凑摘要，支持过滤和显式完整详情参数，避免把大量模型数据塞进 agent 上下文。
- **Skills Usage 统计修复**：使用 Hermes 会话库统计。
- **chat input frame height setting 修复**。

#### Overlay Patch 适配（10 个 patch 上下文漂移修复）
v0.6.26 上游变更导致 10 个 patch apply 失败，调整上下文行匹配新结构：
- `023-client-store-chat`：upstream 新增 `type ChatCodingAgentId` 到 coding-agents import；移除重复的 `hasApiKey()` 守卫行。
- `025-client-loginview-matrix`：upstream LoginView.vue 重构（clearApiKey、isDesktopShell、fetchAuthStatus、loginWithPassword），重新生成 patch。
- `042-desktop-rebrand-swarmstudio-pkg`：desktop/package.json version 0.6.25 → 0.6.26。
- `043-desktop-rebrand-swarmstudio-strings`：desktop-i18n.ts 上下文漂移（上游新增 locale 条目）；重新锚定 hunk + 新增 tray.resetLogin。
- `071-cockpit-router`：router.beforeEach 变为 async；重新锚定 hunk 到 line 219 + 包含 isDesktopShell() 守卫。
- `074-cockpit-i18n-en`：en.ts 上下文漂移；重新锚定 hunk 匹配 v0.6.26 行号。
- `075-cockpit-i18n-zh`：hunk4 锚点 2268 → 2380（new_0_6_13_5/6 被 new_0_6_24_5/6 替换）；修复 blob hash；移除 git apply --3way 误合并的重复 matrix/cockpit/matrixChat 顶层键。
- `080-echarts-dep`：锚点 76 → 80（pristine 新增 agent-browser 依赖）。
- `094-chat-gateway-notice`：重新锚定 hunk 到 023+089 累积后的行号（imports 4, systemType 78, mapHermesMessages 500, addMessage 1596）；更新上下文包含上游新增的 type ChatCodingAgentId。
- `119-preload-no-strip`：重新锚定到 line 35（upstream 新增 pet-window & ensureAuth API，上下文偏移 4 行）。

#### 回归验证
完整回归测试覆盖 12 类此前修复的问题领域，全部通过：
- Windows 兼容（trace.ts / task-workspace-cache.ts 的 isPathWithin Windows 路径处理）
- 安全加固 VULN-04/05/08（preload 不 strip credential、query token 限制、electron sandbox）
- agent-health 鉴权（路径白名单 + API_SERVER_KEY 注入 + 无登录态要求）
- files-root 沙箱 + task workspace 放行
- gateway notice banner
- Matrix 集成（6 文件 / 30 测试）
- Kanban 测试（3 文件 / 34 测试）
- 构建产物 + SwarmStudio rebrand
- inject/clean 幂等性（inject → clean → inject 全通过）
- desktop login persistence（upstream #1940 新增，未冲突）
- chat input frame height（upstream #1962 新增，未冲突）
- coding-agent API mode（upstream #1944/#1932 新增，未冲突）

### 验证结果
- inject：110 patch 全应用
- overlay 测试：38 文件 / 395 测试全过
- 构建：mac arm64 dmg + win x64 zip 均成功

### 下载
- SwarmStudio-0.6.26-arm64.dmg — macOS Apple Silicon
- SwarmStudio-0.6.26-x64.zip — Windows x64
