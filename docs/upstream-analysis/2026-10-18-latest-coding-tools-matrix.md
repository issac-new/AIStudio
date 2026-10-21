# 最新版编程/工作工具全量功能矩阵与 IDE 工作差距清单

调研日期：2026-10-18。对象：`upstream/` 下全部编程工具的最新检出，加上源码仓未包含但用户点名的四个外部产品（ChatGPT/Codex、Antigravity、Qoder、WorkBuddy/CodeBuddy）。四份带证据锚点的原始报告在本目录：

- `2026-10-18/zcode-3151.md` — zcode v3.15.1 源码全量（450 行，212 行表格）
- `2026-10-18/tools-batch1.md` — Claude Code / Codex / Kimi / MiniMax（512 行，约 385 个锚点）
- `2026-10-18/tools-batch2.md` — deepseek-harness / dsh-TUI / multica / routa（783 行）
- `2026-10-18/web-products.md` — ChatGPT+Codex、Antigravity、Qoder、WorkBuddy/CodeBuddy（724 行，58 个来源 URL）

本文只做汇总、横向对照与差距裁决；单条功能的证据以四份原始报告为准。

> **2026-10-21 更新**：zcode 行已前移至源码 `origin/main` v3.16.1（`0a1fc56`）/ 安装版 3.16.2，
> 见 `docs/superpowers/specs/2026-10-21-zcode-3161-baseline-upgrade.md`；其余工具行仍是 2026-10-18 快照。

## 一、版本基线（2026-10-18 实核；zcode 行 2026-10-21 更新）

| 工具 | 最新检出/外部版本 | 核验锚点 |
|---|---|---|
| zcode（源码底座） | **源码基线 = origin/main v3.16.1**（`0a1fc56`，2026-10-19 source-sync；公开 tag 仍停在 v3.15.1）；安装版 **3.16.2**（build 8769；词条快照 `notes/zcode-3162` 6985 键/101 ns）。升级正本见 `docs/superpowers/specs/2026-10-21-zcode-3161-baseline-upgrade.md` | `git -C upstream/zcode log -1`；`git tag -l`；`PlistBuddy .../ZCode.app/Contents/Info.plist`；`npm run catalog-check` |
| Claude Code | `v2.1.300`（2026-10-14） | `upstream/claude-code` → `git describe --tags` |
| Codex | `rust-v0.162.1`（2026-10-09） | `upstream/codex` → `git describe --tags` |
| Kimi Code | `@moonshot-ai/kimi-code@2.1.1-6-ga940f2ff0` | `upstream/kimi-code` → `git describe --tags` |
| MiniMax Code | `v0.6.5`（2026-10-09） | `upstream/minimax-code` → `git describe --tags` |
| deepseek-harness | 检出 `dsh-v0.2.1-alpha.2`；**仓库最新标签 `dsh-v0.2.1-alpha.5`** | `upstream/deepseek-harness` → `git describe --tags`；`git tag --list 'dsh-v0.2.1-alpha.*' --sort=v:refname` |
| dsh-TUI | `v0.15.0`（2026-10-13） | `upstream/dsh-TUI` → `git describe --tags` |
| multica | `v0.6.2`（2026-10-13） | `upstream/multica` → `git describe --tags` |
| routa | `v0.19.0`（2026-06-22） | `upstream/routa` → `git describe --tags` |
| ChatGPT / Codex 桌面 | App `26.1007`（2026-10-08）；CLI `0.163.0`（10-15） | `learn.chatgpt.com/docs/whats-new`（web-products.md §1.1） |
| Antigravity | App `2.24.0`（10-15）；CLI `1.4.0`（10-16） | `antigravity.google/docs/changelog`（web-products.md §2.1） |
| Qoder | 工作台 `0.4.8`（10-15） | `docs.qoder.cn/product-overview/qoder-update-log.md`（web-products.md §3.1） |
| WorkBuddy / CodeBuddy | WorkBuddy `5.8.2`（10-16）；CodeBuddy IDE 版本官方未公布 | `codebuddy.cn/docs/workbuddy/Changelog`；未证实项见 web-products.md §7.2 |

**dsh alpha.2 → alpha.5 增量核对（2026-10-18，`git log alpha.2..alpha.5`）**：alpha.3–5 以 Web/账户/提示词修补为主——通用通知字段与多层通知卡、provider 感知模型标签槽、PTC 提示语对齐、终端会话列表、右栏 PageUp 折叠修复、SDK 缓存重试与 provider 失败暴露、Windows runner 监督、skill 菜单插件变更。**未出现新的能力族**（插件化内核/事件溯源/Agent Teams/Workflow/权限沙箱均沿用 alpha.2 结构），故 `tools-batch2.md` 的能力清单对 alpha.5 仍适用；版本差异已在表格标注，后续若需要逐文件级 alpha.5 对照应重新 checkout 该标签（本轮只读审计，不切换共享检出）。

## 二、"编码模式 / 工作模式"的真实语义（本轮的立论基础）

四家 + zcode 的路线并不相同，必须先分清"呈现层模式"和"运行时模式"：

| 产品 | 显式编码模式 | 显式工作模式 | 共享内核 | 工作模式做了什么 |
|---|---|---|---|---|
| **zcode 3.15.1** | 有（coding） | 有（office，历史名 general/concise） | 是，Agent/协议/权限完全一致 | 纯呈现降噪：隐藏终端与审查入口、工具卡折叠、强制代码换行、默认主动推荐、仅保留文件管理器打开方式（`packages/ui/src/lib/interfaceMode.ts:1-8`；`App.tsx:997-998`；`ToolCallBlocks.tsx:156`；`Terminal.tsx:332`；`WorkspaceEditorButtonGroup.tsx:69`） |
| **OpenAI ChatGPT+Codex** | 有（Codex 模式） | 有（ChatGPT Work） | 是，能力重叠、共享额度 | 表达层双模式：Work 隐藏 Git/shell/diff、无 PR 面板；Codex 保留开发者表面（web-products.md §1.11） |
| **Qoder** | 有（编程模式） | 有（通用模式） | 是，任务引擎/权限/执行器共享 | 任务组织双模式：编程=workspace+分支/worktree+diff；通用=folder+文档/研究；呈现层差异为主（web-products.md §3.11） |
| **Antigravity** | 无 | 无 | 统一工作台 | 不切模式；用 projects/permissions/artifacts 把代码与非代码放同一模型（web-products.md §2.11） |
| **腾讯 WorkBuddy/CodeBuddy** | CodeBuddy 独立产品 | WorkBuddy 独立产品 | 同生态可 handoff | 产品级拆分；WorkBuddy 内部是 Ask/Plan/Agent，不是编程/通用开关（web-products.md §4.11） |
| **MiniMax Code** | 有（`AppMode = 'coding' \| 'work'`） | 有 | 是 | 会话级模式 + 不同提示词（coding/work/tui），另有 lightweight 上下文模式（`tools-batch1.md` §4；`contract.ts:37`、`invocation.ts:116-119`） |
| **Claude Code / Codex CLI / Kimi / dsh / dsh-TUI** | 无独立工作模式 | 无 | — | 模式轴是权限/计划（Plan/Auto/Bypass、Shift+Tab 三档等），不是 coding/work |

**结论**：zcode 自身把"编程/办公"定义为同一引擎上的呈现层降噪，而不是第二套运行时；Qoder/OpenAI 也是共享内核。因此本轮 IDE 工作台的"工作模式"按 zcode 语义实现为**呈现层模式**，并额外把"新建任务的内核选择"显式化（编程任务→编码引擎；工作任务→通用助手），两者都落在同一会话/任务内核上，不做能力分叉。

## 三、跨工具能力矩阵（收敛项）

| 能力域 | zcode 3.15.1 | Claude Code 2.1.300 | Codex 0.162.1 | Kimi 2.1.1 | MiniMax 0.6.5 | dsh 0.2.1-a2 | dsh-TUI 0.15 | multica 0.6.2 | routa 0.19 | 外部 |
|---|---|---|---|---|---|---|---|---|---|---|
| 会话/任务模型 | 任务+会话+9 类行+SQLite | 会话/resume/fork/rewind/后台 agent | 会话/resume/fork/worktree | 会话/resume | AppMode | 事件溯源 Session+任意 turn fork | 会话挂载集 | Issue/Run 8 状态 | Workspace/Session/Task/Team | Projects/Tasks |
| 执行模式与审批 | coding/office；plan/build/edit/yolo | Default/Plan/Auto/Bypass/Safe/Bare | Default/Plan；Guardian 自动审批 | Ask 三档/Plan/Goal/Swarm/Tower | coding/work/tui | 权限/沙箱/Plan 三权分离+Auto review | default/plan/full | 自动回答底层 CLI 审批 | prompt 契约+看板门禁 | read-only/workspace-write/full |
| 上下文/规则/记忆 | AGENTS.md/skills/hooks/compact | CLAUDE.md/AGENTS.md/rules/autoMemory | AGENTS.md | AGENTS.md 三层 | 双层 memory | 共享 agents-root/AGENTS.md | 迁移+rewind | issue 上下文 | reasoning/retro memory MCP | memories/Library/Repo Wiki(Qoder) |
| 多智能体 | dynamic workflow/subagent/coordinator | Agent Teams/workflows | 多代理 V2+roles | Tower(mission/worker/reviewer/merge gate) | 4 角色子代理 | Agent Teams+Workflow 脚本 | 三内核 | Squad 领导路由 | 三种执行模式+泳道专家 | Teams/subagents |
| 工具层 | 终端/编辑/Git/浏览器/MCP/CUA | 终端/Git/浏览器/MCP | 终端/worktree/Git | 视频粘贴/浏览器扩展 | 桌面 browser_* | 持久 shell/最小工具集 | 多内核 | 底层 26 种 CLI | Docker | 终端/Git/浏览器/CUA |
| 评审/产物 | workflow artifact/plan/diff/RunTrace | Artifact/PR/自动审查 | diff/PR/Guardian | merge gate | Goal 总结 | Auto review/证据 | 无 | issue review | 证据递增+Review Gate 三层 | artifacts(计划/diff/截图/录像/文档) |
| 扩展 | MCP Apps/Plugin UI/Gen UI/7 类 hooks/14 官方插件 | Mods 函数 hooks/插件市场 | MCP/skills | 插件/MCP | MCP/skills | everything-is-a-plugin | `/plugin` | Plugin SDK | hooks | MCP/skills/plugins/hooks |
| 自动化 | cron/闲时/动态工作流 | cron/loop/cloud | Automations | Tower/scheduled | cron 周单位 | Schedule | — | Autopilot | 看板自动化 | Automations/cloud |
| 远程/协作 | 手机远控/分享独立站 | Remote Control/Slack/self-hosted | Remote Control/app-server/SDK | Remote Control/ACP/VS Code | ACP/headless | Web/Desktop/SDK | — | Web/Desktop/Mobile/daemon | Web/Desktop/CLI | Remote Control/Teams/Sites |

## 四、zcode 3.15.1 相对 3.14.3 的新增（源码底座升级要点）

v3.14.3→v3.15.1 只有一个 squash 提交（11,736 文件），不能按 commit 逐条归因；报告用目录/i18n/协议差异判定，强证据项：

1. **Gen UI**：助手消息 `::visualize` 投影为内联沙箱页面（`packages/ui/src/gen-ui/`，18 文件）。
2. **Plugin UI / MCP Apps 沙箱**：`ui/src/plugin-ui/` 72 文件 + `services/plugin-ui-bridge` 15 + 桌面 pluginSandbox 21。
3. **Highspeed 加速卡**：1 秒抽卡、模型锁定、节省时长、分享（`shared/src/highspeed.ts`、`ui/src/highspeed/highspeedSend.ts:104`）。
4. **手机远控**：Web 移动壳 + Android Kotlin 壳（新包 `packages/android`）。
5. **动态工作流**：`FillWorkflowHole`、运行中改并发/模型、保存/再次运行（3.14.3 零引用 → 3.15.1 有实现）。
6. **插件生态**：一次新增 14 个官方插件（docx/pdf/pptx/xlsx/image-search/visualize/skill-creator/plugin-creator/restore-legacy-sessions/ios/android/cua/guide 等）。
7. 其他：Rewards、Bot 群聊/话题、浏览器站点权限治理、资源管理器网络页、分享独立站、Linux 托盘能力探测。

## 五、当前 IDE 工作台功能盘点（overlay `custom/client/ide`，242 文件）

已具备（有实现与守门测试）：

- **任务/会话**：富侧栏（新建/搜索/置顶/分组/项目/时间线/归档/恢复/删除/分享导出）、会话深链、任务简报、任务-工作区关联、状态栏、命令面板、快捷键。
- **会话面**：MessageList/ChatInput 全量复用、审批/澄清浮层、计划浮窗（进度+三选一门）、子代理名册浮窗（含 steer 续话）、排队面板（编辑/排序/暂停/恢复/turnSteer）、上下文水位、压缩卡、轮次轨迹、会话内查找、历史提示浏览器、侧问 `/btw`、后台任务面板、对照分屏、恢复 advisor、安全 boost、历史导入、知识条、模组横幅带、回放剧场、Todo 条、轮结果卡、逐文件 undo。
- **右侧 17 页签**：文件/审查/终端/Wiki/记忆/上下文档案/工具时间线/轨迹/工作流/看板/辅助对话/白板/浏览器/资源管理/MCP(含技能)/Hooks/自定义命令。
- **后端**：`/api/ide/*`（engine-models、git、worktree、automations、run-undo、session-share、task-workspace、video-frames、compaction-trace、native-routes、retry-counts）、`/api/zcode-engine/*`（health/projection/mention/checkpoint/fork/queue/workflow/squad）、`/api/hermes/permmodes/session-mode/*`。

主要缺口（本轮裁决）：

| # | 缺口 | 现状锚点 | 本轮裁决 |
|---|---|---|---|
| G1 | **工作模式（办公模式）缺失**：只有编程形态，没有 zcode 3.15.x 的 coding/office 呈现模式 | `custom/client/ide/views/IdeShell.vue`、`IdeSidePane.vue` 无 interfaceMode | **本轮实现**（呈现层+快捷键+设置入口） |
| G2 | **工作任务与编程任务没有内核分流**：新建任务永远创建 zcode 编码会话并绑工作区 | `IdeTaskSidebar.vue:335-347`、`IdeChatPane.vue:153-174` | **本轮实现**（工作任务→通用 hermes 会话，不绑仓库） |
| G3 | 执行模式（plan/build/edit/yolo）会话内不生效 | `IdePermissionSwitcher.vue:1-8`（头注自述） | 另一并行会话已接线服务端会话档（REST）；本轮不重复 |
| G4 | 交付物体系（artifacts 统一评审：计划/diff/验证证据） | 分散在 IdePlanFloat/IdeRunResultCard/IdeGitPane | **2026-10-18 待办清零批已交付**：`deliver` 页签聚合计划/变更/验证/产物 + 本地评审门 + 摘要回流 |
| G5 | 工作模式快速开始/文档技能入口 | hermes 技能存在，但无工作模式引导 | 随 G2 给空态引导 |
| G6 | 远程工作区 SSH/Docker/WSL、移动远控、Gen UI、Plugin UI 沙箱 | 无 | **部分交付**：Gen UI 预览页签、远程工作区只读诊断（复用 Hermes FileProvider 的 local/docker/ssh/singularity）；WSL/移动远控/Plugin UI 运行时未支持（已标注） |
| G7 | 分享选段/云链接、插件市场、Cua | 部分（本地导出/浏览器页签） | **部分交付**：选段导出（md/json）+ 深链、插件目录（skills/MCP/zcode 只读 + 启停/重载）、云分享 stub 如实标注；Cua 仅声明式策略 |

## 六、本轮交付定义

1. **编程/工作双模式**（对齐 zcode 3.15.1 office/coding，证据：`interfaceMode.ts`、`App.tsx:997-998`、`ToolCallBlocks.tsx:156`、`Terminal.tsx:332`、`shortcutCommands.ts:98`）
   - 工作模式隐藏终端/审查页签与命令面板入口；工具卡只留摘要；代码强制换行；默认页签回落文件/记忆。
   - `Cmd/Ctrl+Shift+U` 切换；状态栏常驻模式 chip；选择持久化；兼容历史值 office/general/concise。
2. **工作任务内核分流**（对齐 Qoder 通用模式、OpenAI Work、MiniMax `AppMode`）
   - 新建任务按模式分派：编程→zcode 编码会话+工作区；工作→hermes 通用会话（无 codingAgentId、不绑仓库）。
   - 任务列表模式徽标；工作模式复用同一任务/会话/权限内核；模型选择按会话类型取源（编程=Ycode 目录，工作=Hermes 目录）。
   - 工作会话空态给出"文档/表格/幻灯片/调研"四类起步提示。
3. **全量回归与交付**：单测 + 双 tsc + build + IDE 冒烟/自检 + 合并 main 推送。
