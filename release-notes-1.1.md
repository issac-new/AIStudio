## SwarmStudio 1.1

基于 hermes-studio 0.6.25 + hermes-agent 0.18.0，升级上游并完善回归测试。

### 本次更新

#### 上游升级 hermes-studio 0.6.23 → 0.6.25
升级 13 个上游提交，主要包含：
- **workspace run diff cards**：会话新增 workspace 运行变更文件卡片视图（fetchWorkspaceRunChangesForSession / fetchWorkspaceRunChangeFile）。
- **show dot workspace folders**：文件树显示点开头的隐藏文件夹。
- **Windows 跨盘符 junction 文件夹选择器修复**（upstream #1868）。
- **Hermes plugin management 修复**（upstream #1889）。
- **execute_code guard bridge 兼容修复**（upstream #1910）。
- chat input resize / toolbar refresh / mobile chat chrome polish 等多项体验改进。
- 默认 model 与 provider actions 修复（upstream #1853）。

#### Overlay Patch 适配（4 个 patch 上下文漂移修复）
v0.6.25 上游变更导致 4 个 patch apply 失败，调整上下文行匹配新结构：
- `023-client-store-chat`：chat.ts import 行新增 fetchWorkspaceRunChange* 符号。
- `034-client-api-sessions`：fetchSessions 后新增 fetchWorkspaceRunChangesForSession 函数。
- `042-desktop-rebrand-swarmstudio-pkg`：desktop/package.json version 0.6.23 → 0.6.25。
- `099-client-store-files-root`：saveEditor() 新增 workspaceSessionId 分支，writeFile 移入 else 块。

#### 测试修复
- `039-test-kanban-routes`：补全 mock 缺失的 listWorkspaceFiles / listTimeline handler（自 v0.6.20 起潜伏，因 vitest 配置仅跑 overlay 自身测试而未被发现）。

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
- inject/clean 幂等性

### 验证结果
- inject：83 patch 全应用
- overlay 测试：38 文件 / 395 测试全过
- kanban 测试：3 文件 / 34 测试全过
- matrix 测试：6 文件 / 30 测试全过
- 构建：mac dmg + win zip 均成功

### 下载
- SwarmStudio-0.6.25-arm64.dmg — macOS Apple Silicon
- SwarmStudio-0.6.25-x64.zip — Windows x64
