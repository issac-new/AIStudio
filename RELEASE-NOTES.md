# SwarmStudio 发布说明

## 版本
SwarmStudio **2.0**（基于 hermes-studio v0.6.38 + overlay 二次开发）

> **2.0** — hermes-agent v0.20.0 kanban 五大新功能全量迁移（单卡 model/provider/reasoning 钉选、board project 作用域、effort estimate、运行中 worker 评论即时送达）+ i18n/测试技术债清理。

## 上游版本

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.38 |
| hermes-agent | v0.20.0 |
| element-web | v1.12.22 |

## 本次升级（0.6.37 → 0.6.38）

上游 v0.6.38 含 2 个提交（21 文件变更），主要是 Windows runtime 修复与 Hermes 0.19.0 网站兼容性恢复：

- **Windows Runtime Python home 修复**（#2349）：修复 Windows 下 Python 运行时路径
- **Hermes 0.19.0 网站兼容性恢复**（#2348）

### Overlay 适配

- 042 版本号 0.6.37 → 0.6.38
- 无其他 patch 冲突（v0.6.38 为小版本）

### 验证

- 125 patch 全 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 17 baseline errors（0 new）
- kanban/avatar 测试 44/44 PASS；agent patch 117/118 干净应用

## hermes-agent v0.20.0 kanban 能力迁移（patch 178-186）

把 v0.19.0→v0.20.0 区间的 5 个 kanban 新功能迁移到 Swarm kanban 与 AI 协作中心，使两处 UI 与 hermes-agent v0.20.0 后端对齐。

### 迁移内容

- **A. 单卡 model + provider 钉选**：`create --model/--provider`、`set-model` CLI 动词全链路打通（CLI→service→routes→client→store→UI）。TaskForm 加 model/provider 输入；TaskDrawer Meta 区 Model 行可显示/编辑/清除。
- **B. 单卡 reasoning_effort**：hermes-agent 补 `create --reasoning` + `set-reasoning` CLI 动词（patch 178）；`_task_to_dict` 序列化补 reasoning_effort。TaskForm/Drawer 加思考深度选择（minimal/low/medium/high/xhigh/max/ultra/none）。
- **C. board 挂到 project**：`project list --json`（patch 179）+ `boards create --project`/`boards set-project` CLI 动词（patch 178）；TS `GET /projects`、`PATCH /boards/:slug`。Toolbar 建板对话框加 project 选择器（选中后 default_workdir 镜像 project 主目录）。
- **D. effort estimate**：`kanban estimate` CLI 动词复刻 plugin `_run_estimate`（auxiliary model，ok:false 降级且 exit 0，对齐 REST 非错误语义）。TaskForm 建卡前 Estimate 按钮 + TaskDrawer 既有卡 Estimate 按钮，行内显示 `~15k tok · M`。
- **E. 运行中 worker 评论即时送达**：后端零改动（comments POST 已通，worker 端 v0.20 自动轮询注入 live turn）。TaskDrawer 评论区运行中任务显示「评论将在数秒内送达运行中的 worker」提示文案。

### 偏差（对照上游明示）

- model 下拉：上游桌面端用 composer SDK picker + `GET /model-options`；Swarm 用自由文本 + provider 文本（hermes-studio 无 SDK picker，model-options 无 CLI 动词）。
- board settings：上游有「Board settings…」对话框改既有板 project；Swarm 仅建板时可选 + PATCH API。
- `hermes kanban repair`（运维 CLI）不做。

### Patch 清单

| patch | 内容 |
|---|---|
| 178 | hermes-agent kanban CLI 动词（create --reasoning / set-reasoning / estimate / boards create --project / boards set-project） |
| 179 | hermes-agent `project list --json` |
| 180 | TS service：KanbanTask/KanbanBoard 字段 + patchTask/createTask/createBoard 接入 + estimateTask/estimateText/listProjects/setBoardProject |
| 181 | TS controllers：estimate/projects/patchBoard + create/createBoard 字段透传 |
| 182 | TS routes：POST /estimate、POST /:id/estimate、GET /projects、PATCH /boards/:slug |
| 183 | client API：types + wrappers（estimateTask/estimateText/listProjects/patchBoard） |
| 184 | client store：projects state + 4 个 action |
| 185/186 | i18n en/zh：kanban.form model/provider/reasoning、kanban.board project、kanban estimate/liveCommentHint |
| custom | KanbanTaskForm/TaskDrawer/Toolbar.vue + SwarmKanbanView.vue + CockpitWorkspace.vue |

### 验证

- 全量 inject 138 patches，0 FAILED / 0 WARN（hermes-agent patch 干净应用）
- CLI 冒烟（隔离 HERMES_HOME）：project/board/task create/reasoning/estimate 全路径通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 8 errors（chat/matrix 既有，0 i18n）
- vitest 503 passed / 0 failed / 6 skipped（67 test files，3 连跑稳定）

参考：`docs/superpowers/specs/2026-08-04-hermes-agent-020-kanban-migration-design.md`、`docs/superpowers/plans/2026-08-04-hermes-agent-020-kanban-migration.md`

### i18n / 测试修复（patch 187 + 测试断言修正）

发版前清掉 main 既有技术债：

- **patch 187**：去除 patch 159/161/162/163 注入残留导致的 8 个 TS1117 duplicate-key（`loop.onboarding.cta`/`kanban.action.archive`/`kanban.message.taskArchived` 重复、`accurate:` 顶格缩进、zh 侧 `swarmKanban/matrixChat/cockpit/diagnostics/matrixIdentity` 错放顶层）。vue-tsc **16 → 8 errors**。
- **cockpit-run-trace-modal 3 例**：断言中文翻译值但 test setup 的 `useI18n` mock 返回 raw key，恒失败；改为断言 raw key。
- **phase3-integration scheduler**：fire-and-forget tick flush 窗口 50ms 并行负载下 flake，扩到 250ms。

## 上一版（0.6.36 → 0.6.37 + hermes-agent 0.19.1 → 0.20.0）

上游 v0.6.37 含 20+ 提交（210 文件变更），hermes-agent v0.20.0 rollup。主要更新：

- **cli-shim 重构**（214 行重写）：Windows runtime 修复 + storage migration
- **GroupChatPanel 重构**（2380 行重写）+ GroupMessageList 重构（195 行）
- **paths.ts runtime 重构**（#8314 bundle Hermes source runtime + Windows 更新修复）
- **MCU 自动聆听模式**（#2338）+ Ekko voice 模式切换
- **authorized provider OAuth runtime**（#2337）
- **profile archive lifecycle 加固**（#2324）
- **macOS signing keychain 修复**（#2315）
- hermes-agent 0.20.0 rollup（1162 files）

### Overlay 适配（11 patches 重写 + 3 obsolete）

- 043/177：cli-shim rebrand 拆分（v0.6.37 cli-shim 214 行重写）
- 085/102/122：group-chat store + GroupMessageList + GroupChatPanel 适配（2380+195 行重写）
- 126/145/147：paths.ts/runtime 适配（147 obsolete——run_agent.py 模式被上游取代）
- 152 obsolete（ELECTRON_RUN_AS_NODE 已内置）
- 042/088 版本号 + deleteSession import 适配

### 验证

- 126 patch 全 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 16 baseline errors（0 new）
- kanban/avatar 测试 44/44 PASS

## 上一版（0.6.36 → 0.6.36 保持版）

上游 v0.6.36 含 40+ 提交（326 文件变更），主要更新：

- **kanban task board 重设计**（#2296）：修复归档 + 重新设计任务板
- **完整 RTL 布局支持**（#2294/#2270/#2269）：Arabic locale、Naive UI 镜像、方向感知 CSS
- **MCU 同步语音字幕**（#2305）
- **Ekko session workspaces**（#2289）+ compact 关系图（#2297）
- **独立 headless app relay**（#2275）
- **chat live reasoning 稳定化**（#2299）+ 工具抽屉精炼（#2283）
- **桌面更新后使用打包 WebUI**（#2314）
- 多项 i18n/voice/desktop 修复

### Overlay 适配（10 patches 重写）

- 025 重写：LoginView 适配 RTL `text-align: start`
- 070 重写：App.vue 适配 `naiveRtl` + `locale`，保留 authStore + cockpit sidebar 逻辑
- 074/075 重写：i18n locales 锚点适配（上游新增 Arabic + RTL keys）
- 101/102 重写：MessageList/GroupMessageList 适配上游 scroll snapshot 重构 + banner 正确插入
- 029 重写：SettingsView 适配上游移除 VoiceSettings + voice→models redirect
- 042/043 版本号 + minWidth context 适配
- 135 重写：index.ts 适配 `bodyParser→createRequestBodyParser` 重构

### 验证

- 127 patch 全 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 15 baseline errors（0 new）
- kanban/avatar 测试 44/44 PASS

## 上一版（0.6.33 → 0.6.35 + hermes-agent 0.19.0 → 0.19.1）

上游 hermes-studio v0.6.35 含 24 个提交（224 个文件变更），hermes-agent v0.19.1 为 ~1000 PR rollup。主要适配：

### kanban 对齐（上游 #2216 align kanban with Hermes 0.19）

- **附件系统切换到 CLI 模型**（patch 013 重写）：uploadAttachment → `hermes kanban attach`、removeAttachment → `hermes kanban attach-rm`，kanban.db 单一事实源，与上游 service 层 listAttachments 对齐。废弃 .attachments.json 旁路 meta store。
- **attach-from-URL 走 CLI**（patch 169 重写）：URL 下载到临时文件 → CLI attach，保留逐跳 SSRF 守卫。
- **附件下载切上游 readAttachment 路径**（patch 174 新增）：`/api/hermes/kanban/:taskId/attachments/:attachmentId`，含路径校验 + 授权。
- patch 010/013/014/035/037/164/165 锚点适配（上游 KanbanTask 已内置 `goal_mode`、createTask/接口新字段、controller 结构重写）。
- 测试 mock 补齐（patch 175/176 新增）。

### v0.6.35 新功能适配

- **per-user theme**（patch 024/025）：localLogin 适配 `loginWithPassword` 返回 LoginResponse 对象，内联 `activateUserTheme`。
- **desktop.chat 独立聊天窗口**（patch 071 重写）：router 保留顶层 desktop.chat 路由，其余迁入 cockpit children。
- patch 009/042/070/072/087/088/078/124 适配（auth 返回类型、desktop 版本号、App.vue standaloneChat、AppSidebar 导入、group-chat/run-chat 新处理器、workspace-files allowlist）。

### hermes-agent 0.19.1

patch 117/118 恢复干净应用（0.19.0 时因 drift 跳过）。

### 验证

- 126 个 active patch 全部 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 9 个 pre-existing baseline errors
- kanban/avatar 测试 44/44 PASS；agent CLI smoke OK
- 全量 vitest 63 个失败均为 overlay 有意变更与上游测试断言的既有冲突（login UI/files API/i18n 覆盖/rebrand 等，与 v0.6.33 同类）

## 上一版（0.6.32 → 0.6.33）

上游 v0.6.33 含 19 个提交（173 个文件变更），主要更新：

- **Desktop Agent Browser**：完整桌面端浏览器自动化 + 懒加载 MCP 发现
- **Workflow Run History**：分页侧栏解释运行历史 + 总 Run 时间预算
- **Provider 单卡模型刷新**与一次恢复（#2115）
- **文件附件**：支持从粘贴与工作区插入
- **会话滚动恢复**竞态修复（#2207）
- **Desktop 退出清理** Agent Bridge 进程（#2193）
- **聊天 abort 状态**按会话隔离、Windows 工具栏布局打磨
- **MCU 后台任务结果**隔离、聊天 diff 归因与桌面链接预览修复

### Overlay 适配

- 修复 7 个因上游变更而 context 漂移的 patch：
  - `023-client-store-chat`：fetchRuntimeSessions 行号偏移
  - `042-desktop-rebrand-swarmstudio-pkg`：version context `0.6.32 → 0.6.33`
  - `043-desktop-rebrand-swarmstudio-strings`：installer.nsh 删除 `Sleep 1500`、i18n 新增 browser 键致 context 偏移
  - `122-groupchat-sidebar-logout`：GroupChatPanel 新增 useAppStore 致行号偏移
  - `141-desktop-win-file-logging`：index.ts 新增 `type IpcMainInvokeEvent` 致 import 块下移
  - `151-desktop-startup-quit-logging`：基于 141 重新生成 context
  - `152-mcp-shim-electron-run-as-node`：043 rebrand 后 context 字符串已变 SwarmStudio
- `117/118`（hermes-agent patch）经 inject.mjs 路由至 `upstream/hermes-agent`，应用成功
- `scripts/sync-upstream.sh` 改用「优先取最新 stable release tag」策略（与 upstream 目录更新规则一致），无 tag 时 fallback `origin/main`
- 116 个 active patch 全部 inject 通过；build:full 成功；单测 500 pass / 3 fail（3 个为 i18n 措辞预先存在的失败，与本次升级无关）

## hermes-agent v0.19.0 kanban 能力对账（patch 164-173）

把 hermes-agent v0.19.0 kanban 能力缺口迁移到「Swarm kanban」与「AI 协作中心」工作区页面，分 4 阶段：

- **P1 — KanbanTask 接口 +19 字段**（patch 164/165）：`branch_name`/`idempotency_key`/`consecutive_failures`/`worker_pid`/`last_failure_error`/`max_runtime_seconds`/`last_heartbeat_at`/`current_run_id`/`workflow_template_id`/`current_step_key`/`model_override`/`max_retries`/`goal_mode`/`goal_max_turns`/`session_id`/`block_kind`/`block_recurrences`/`claim_lock`/`claim_expires`，对应 Python `Task` dataclass。均 optional/nullable，向后兼容。
- **P2 — 补 5 个缺失 HTTP wrapper**（patch 166）：`readArtifact`/`debugHomeChannels`/`listWorkspaceFiles`/`getTimeline`/`searchSessions` + 3 类型 `FileNode`/`TimelineItem`/`SessionSearchResult`（从 cockpit-extras 迁入主 client，cockpit-extras 改 re-export 保兼容）。
- **P3 — CockpitWorkspace 运维状态 meta 行 + events/runs**（patch 167/168 + custom .vue）：工作区加 5 个只读 meta 行（Worker 健康/失败熔断/Claim 锁/Workflow 编排/派生溯源）+ events + run history 两区段。i18n 补 en/zh。
- **P4 — attach-from-URL**（patch 169-173 + patch 166 追加）：新增 `POST /api/hermes/kanban/:id/attachments/url`，service 端全局 fetch 下载 + 25MB 双校验 + `assertSafeOutboundUrl` SSRF 守卫（复用 `url-guard.ts`）。KanbanAttachments.vue 加「从 URL」输入行。

验证：server `tsc --noEmit` 0 errors；client `vue-tsc` 9 个 pre-existing baseline errors（0 引用本次新增字段/wrapper/UI）；kanban/cockpit vitest 全绿。

## Overlay Patch 体系

- **Active patches**: 116 个（100% inject 通过率）
- **归档 patches**: 7 个（018/021/025/028 已迁移到 active patches 或合并）

### Patch 分类

| 范围 | Patch 编号 | 说明 |
|------|-----------|------|
| 数据库 schema | 001 | Matrix 列、SQLite UNIQUE 约束 |
| 服务器配置 | 002-008 | Matrix 字段、端口、element-web 中间件 |
| 客户端 API | 009-011 | Matrix 认证、Kanban 扩展 |
| 服务器控制器 | 012-017 | Auth、Kanban、Users、Middleware |
| 登录页 | 025 | Matrix 登录表单 + Remember Me + 本地降级 |
| 客户端组件 | 020, 022-034 | PageSidebarNav、ChatPanel、Kanban store |
| Kanban 路由/测试 | 035-043 | Routes、tests、desktop rebrand |
| Vite/Vitest | 000, 160 | Custom alias for overlay testing |
| Matrix 测试 | 055-060 | Right panel、threads、notifications |
| Cockpit | 070-075 | App.vue、router、AppSidebar、i18n |
| Kanban API | 078 | listWorkspaceFiles、listTimeline、attachment sync |
| ECharts/Lunar | 080, 103 | 依赖添加 |
| Group chat | 085, 087-089 | Unread tracking、autojoin |
| Gateway notice | 094-102 | Banner、files root |
| Loop 引擎 | 133-140, 161-163 | 路由、socket、i18n、cron、pg、lockfile |
| Desktop 运维 | 107, 110-132, 141-157 | agent-health、sandbox、webui-detached、win 日志、bridge 端口、MCP shim 等 |

### 新增功能（overlay）

- **Matrix 登录**：Homeserver URL + MXID + 密码，Remember Me 持久化
- **Cockpit**：全屏 AI 协作中心，登录后首页
- **SwarmKanban**：协作看板（自定义组件，独立路由）
- **原生看板**：保持上游 KanbanView 不变（AppSidebar 入口）
- **Matrix Chat**：完整 Matrix 客户端（路由动态注册）
- **ECharts 协作地图**：支持面板最大化时画布自适应
- **RunTraceView**：运行全过程可观测性（Evidence Graph）
- **Loop 引擎**：协作 loop 调度/验证/subagent 派生（133-140）

## 构建

```bash
cd overlay
npm run inject          # 应用 116 patch
npm run build:full      # 构建 dist/(openapi + client + server)
# 桌面端打包
npm run build:dmg:mac   # macOS arm64 DMG + zip
npm run build:dmg:win   # Windows x64 exe + zip + msi
```

## 开发启动

```bash
cd overlay
npm run inject                              # 注入 patches
cd ../upstream/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
mkdir -p dist
cd ../../overlay
bash scripts/serve-server.sh &              # 后端 :8647
npm run dev &                                # 前端 :8649
```

## ⚠️ 同版本号覆盖更新的缓存陷阱

desktop app 的 `webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 的副本。

**解决**：
1. 每次发版递增版本号
2. 重装后删除旧副本：`rm -rf ~/.hermes-web-ui/webui/<version>/`

## 不包含

- hermes-agent（runtime 下载，首次启动获取）
