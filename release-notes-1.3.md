## SwarmStudio 1.3

基于 hermes-studio 0.6.27，升级上游并完善回归测试。

### 本次更新

#### 上游升级 hermes-studio 0.6.26 → 0.6.27
升级 8 个上游提交，主要包含：
- **Group Chat 房间工作区绑定拆分**：将群聊房间的 workspace 绑定逻辑独立化，支持更灵活的房间级工作区配置。
- **默认 workspace favorite UI 精修**：refine 默认工作区收藏夹的交互与展示。
- **MCU 语音中继与固件稳定化**：Stabilize MCU voice relay and firmware，修复 ESP32-C3 相关问题。
- **Remote MCU relay over Socket.IO**：新增基于 Socket.IO 的远程 MCU 中继。
- **Windows desktop runtime trampolines 修复**：修复 Windows 桌面端运行时启动脚本的路径与执行问题。
- **Bundled Web UI startup fallback**：新增 Web UI 启动兜底，提升首次启动可靠性。
- **skip empty workspace diff changes**：跳过空 workspace 的 diff 变更，避免无意义的差异卡片。

#### Overlay Patch 适配（7 个 patch 上下文漂移修复）
v0.6.27 上游变更导致 7 个 patch apply 失败，调整上下文行匹配新结构：
- `002-config-matrix-fields`：config.ts 新增 remoteRelay 配置块，hunk2 锚点从 59 → 60；更新 blob hash。
- `012-server-controllers-auth`：auth.ts 新增 getLanEndpointKind/getPublicSystemInfo/config 三个 import，hunk2 上下文需包含这些新行；修复 hunk 行计数。
- `031-client-chatpanel`：ChatPanel.vue 新增 useDefaultWorkspace import，hunk1 上下文需包含该行；修复 hunk 行计数。
- `042-desktop-rebrand-swarmstudio-pkg`：desktop/package.json version 0.6.26 → 0.6.27。
- `085-group-chat-unread-tracking`：group-chat.ts 新增 setRoomWorkspace export，hunk5 上下文需包含该行；重新锚定行号 857 → 924。
- `087-group-chat-autojoin-on-connect`：group-chat/index.ts ChatStorage.getLastMessage 锚点 409 → 462；GroupChatServer Connected 锚点 900 → 954，需包含 socketAuthUserIdMap 上下文。
- `122-groupchat-sidebar-logout`：GroupChatPanel.vue 新增 FolderPicker import，hunk1 上下文需包含该行；重新生成整个 patch。

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
- Group Chat workspace 绑定（upstream #1980 新增，未冲突）
- MCU voice relay（upstream #1979 新增，未冲突）
- Windows runtime trampolines（upstream #1972 新增，未冲突）

### 验证结果
- inject：110 patch 全应用
- overlay 测试：38 文件 / 395 测试全过
- 构建：mac arm64 dmg + win x64 zip 均成功

### 下载
- SwarmStudio-0.6.27-arm64.dmg — macOS Apple Silicon
- SwarmStudio-0.6.27-x64.zip — Windows x64
