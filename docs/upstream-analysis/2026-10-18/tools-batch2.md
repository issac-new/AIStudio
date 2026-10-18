# 四款工具功能调研（batch 2）

> 调查日期：2026-10-18。范围：`upstream/deepseek-harness`、`upstream/dsh-TUI`、`upstream/multica`、`upstream/routa`（均为指向 `/Volumes/nvme2230/lab/ncwk-upstream-archive/` 的符号链接）。
>
> 方法：只读查看源码、README、CHANGELOG/release notes、docs 与 git 历史；未修改任何仓库文件。每条结论尽量附 `文件:行` 或命令输出锚点；找不到证据的地方明确标为“未发现”或“未验证”，不猜测。

---

## 0. 版本核验

命令与输出（2026-10-18 实测）：

```text
$ git -C deepseek-harness describe --tags --always
dsh-v0.2.1-alpha.2
$ git -C deepseek-harness log -1 --format='%H %ci %s'
d743267388641bc76f17c45ce8b4c231aed1d32c 2026-10-09 17:31:32 +0800 Merge pull request #5946 from deepseek-harness/release-0.2.1-alpha.2

$ git -C dsh-TUI describe --tags --always
v0.15.0
$ git -C dsh-TUI log -1 --format='%H %ci %s'
18e4a206afc367f055a2b3379bb221abcbb5d99e 2026-10-13 10:04:24 -0400 chore(release): prepare v0.15.0

$ git -C multica describe --tags --always
v0.6.2
$ git -C multica log -1 --format='%H %ci %s'
7ab92d7622ecd81d179a8d83ae2dea74835a5069 2026-10-13 18:37:37 +0800 docs(changelog): add v0.6.2 release entry (2026-10-13) (MUL-7998) (#9225)

$ git -C routa describe --tags --always
v0.19.0
$ git -C routa log -1 --format='%H %ci %s'
73eb1ed1b71930c15d21fb8ce9202fd9dfc100bc 2026-06-22 10:19:40 +0800 fix: preserve hook runtime path
```

| 工具 | 检出标签 | HEAD | 包版本 | 备注 |
|---|---|---|---|---|
| deepseek-harness | `dsh-v0.2.1-alpha.2` | `d743267` | `package.json` = `0.2.1-alpha.2` | 工作区是 detached HEAD。仓库里已有 `dsh-v0.2.1-alpha.3/4/5` 标签，但 HEAD 是这些标签的祖先（`git tag --contains HEAD` 列出 4 个标签），即当前检出内容停在 alpha.2，不是 alpha.5。 |
| dsh-TUI | `v0.15.0` | `18e4a20` | `0.15.0` | detached HEAD。 |
| multica | `v0.6.2` | `7ab92d7` | 根 `package.json` 仍是 `0.2.0`；`apps/web` 与 `apps/desktop` 为 `0.6.2` | 根包版本滞后，发布版本以 tag 与 apps 包为准。 |
| routa | `v0.19.0` | `73eb1ed` | `0.19.0` | detached HEAD。 |

四个工作区均为 detached HEAD 且 `git status -sb` 只显示分支头，无本地改动（只读调查成立）。

---

## 1. 总览矩阵

| 维度 | deepseek-harness (dsh) | dsh-TUI | multica | routa |
|---|---|---|---|---|
| 产品形态 | CLI + Web UI + Desktop + Python SDK + ACP/SDK 服务端；插件化 harness | 终端 TUI，可挂 DSH/Claude/Codex 三种内核；VS Code 扩展、Herdr 集成 | Web + Desktop + Mobile + CLI/daemon + Go 后端 + Plugin SDK；工作管理平台 | Web (Next.js) + Desktop (Tauri) + Rust Axum 后端 + CLI；多智能体协调平台 |
| 核心单元 | Session（append-only 事件日志） | Session（挂载集里的一个会话） | Issue / Run（一次 agent 执行） | Workspace / Session / Task(card) / Team run |
| 编码 vs 工作语义 | 通用 agent harness，Web 有 “Coding Tools” 偏好与 Standard/PTC/Minimal/Creator 预设 | 三种编码内核；预设与 Shift+Tab 模式决定工具/沙箱 | 工作平台：issue/board/chat 是工作面，编码交给底层 CLI | 三种执行模式：Sessions（通用）/ Kanban（流程）/ Team（协调） |
| 任务板 | 无看板；Todo + Goal + Schedule | 无看板；Todo 面板 + 会话轨迹 | 原生看板/列表/表格/甘特/泳道，7 内置状态 + 自定义状态 | 原生 Kanban：backlog/todo/dev/review/done/blocked，泳道专家与门禁 |
| 最强差异点 | everything-is-a-plugin、事件溯源 Session、Agent Teams、Workflow 脚本、权限/沙箱分离 | 像素鲸鱼 TUI、会话挂载运行时、多内核热切换、rewind/fork/btw | Agent 当队友上板、Squad 领导路由、Run 生命周期与失败码、worktree 并发 | 泳道专家契约、Review Gate 三层、Harness Monitor/Entrix、Office 渲染 |

---

## 2. deepseek-harness (`dsh`) — v0.2.1-alpha.2

### 2.1 产品形态、版本证据、文档位置

- 定位：DeepSeek AI 开源的 agent harness，`everything-is-a-plugin`，构建在 Cordis 之上；明确标注 developer preview，会有破坏性变更（`README.md:7`、`README.md:13`）。
- 运行形态：
  - `npx @deepseek-ai/dsh web` 启动 Web UI，默认 `http://127.0.0.1:3080`，本地启动会打开浏览器，SSH 启动只打印 URL（`README.md:24`、`README.md:27`）。
  - `dsh --profile headless "task"` 一次性任务；`dsh acp` 通过 ACP stdio 服务自动化客户端；`dsh sdk` / `sdk-minimal` 通过 JSON-RPC stdio 服务 SDK 客户端（`docs/cli-help.md:20`、`docs/cli-help.md:100`、`docs/cli-help.md:129`、`docs/cli-help.md:147`）。
  - Desktop 入口存在：`apps/desktop`、`apps/desktop-host`；构建脚本含 macOS arm64/x64 与 Windows x64 打包（`package.json` scripts `package:desktop:*`）。
  - Python SDK/runtime 存在：`python/`、`python/sdk/README.md`；用户指南有 Python SDK 页（`docs/user/guide/python-sdk.md`）。
- 版本证据：`git describe` = `dsh-v0.2.1-alpha.2`；`package.json` = `0.2.1-alpha.2`；HEAD `d743267`（2026-10-09）。
- 文档位置：`docs/` 为主（`docs/architecture.md`、`docs/subsystems/*`、`docs/tool-catalog.md`、`docs/cli-help.md`、`docs/user/guide/*`）；站点 `https://deepseek-harness.github.io/deepseek-harness/`（`README.md:9`）。

### 2.2 会话与任务模型

- Session 是 append-only 的类型化事件日志，是交互历史的唯一事实源；LLM 消息历史由日志派生，重放即重新派生（`docs/subsystems/session.md:5`）。
- 新建/恢复/分叉/归档：
  - Web 的 Session Controller 提供 list、search、creation、prompt、queue、cancellation、pagination、follow/control streams（`docs/subsystems/web-client.md:42`）。
  - 会话菜单有 Pin、Rename、Fork、Archive 四项（`packages/client/ui-workspace/src/client/index.ts:296`–`299`）；Workspace 模型维护 archived/pinned 数组，归档行灰显、不能打开，需 Unarchive 恢复（`docs/subsystems/web-client.md:52`）。
  - Fork 是低层 `ctx.sessions.create(id, { seed })` 的封装：`fork(source, boundary?, childSessionId?)` 截取到包含式 `SessionSeq` 边界，要求前缀结束在未开放 turn 之外，然后创建带 `parentSession`、`isSeeded`、`inheritedEventCount`、继承 cwd 的子会话（`docs/subsystems/session.md:677`、`docs/subsystems/session.md:681`）。
- 排队/steer：
  - Agent 的统一 `send` 暴露 target 与 wakeup 路由；`followup`、`steer`、`inject` 是固定预设别名（`docs/subsystems/core.md:55`）。
  - `steer()` 把消息提交到最近的 step 边界；空闲 driver 会开启新 turn；被拒绝的 step 会把 steering 留在 inbox 直到下一次唤醒（`docs/subsystems/core.md:124`–`128`）。
  - Web 的 QueueDock 支持 Edit/Remove/QueueDock Steer；排队消息与 steering 在 Chat 中的位置由运行状态推导（`packages/api/session-controller/README.md:54`、同文件 `:57`）。
- 后台任务：`ctx.jobs` 长运行任务，状态 `running | stopping | completed | killed | failed`；支持 output ring、`job_list/job_output/job_kill` 工具（`docs/subsystems/jobs.md:5`、`docs/subsystems/jobs.md:21`；`docs/tool-catalog.md:2149`–`2222`）。
- 检查点/回退：
  - 未发现文件级 checkpoint/rewind 工具。
  - 等价能力有两类：按 turn 边界 fork（`docs/subsystems/session.md:681`）与每轮 deliverables 快照（turn 开始/结束的 git 工作树快照 + 逐文件工具编辑的前后整文件捕获，`docs/subsystems/deliverables.md:5`）。
  - 压缩是另一种“检查点”：`compaction/summary` 记录被遮蔽的范围、token 估算与总结调用，`user/message` 带 `replace` 操作替换表面内容（`docs/subsystems/compaction.md:11`–`15`）。
- 会话查询与索引：`session-query` 在 live-preferred 逻辑会话语料上做精确读取、关系追踪、语义抽取与过滤；SQLite provider 拥有全文索引生命周期（`docs/subsystems/session-query.md:5`、同文件 `:7`）；工具面提供 `session_search`、`session_trace`、`session_event_search`、`session_event_trace`、`session_event_read`（`docs/tool-catalog.md:1783`–`2016`）。

### 2.3 执行模式与审批

- 沙箱模式（只管文件效果）：`read-only`、`workspace-write`、`danger-full-access`；网络与进程可见性不在这个词汇内（`docs/subsystems/sandbox.md:11`、`docs/subsystems/sandbox.md:20`）。
- 审批策略（每个 Session）：`ask` 或 `never`；`never` 不询问任何人，所有 ask 确定性返回 `rejected`；没有 answerer 时 `ask` 也 fail-closed 为 `unavailable`（`docs/subsystems/approval.md:5`、`docs/subsystems/approval.md:31`–`39`）。
- 权限预设把两个独立旋钮打包成一个 Permissions 选择器：默认表含 `workspace-write`（workspace-write + ask）与 `danger-full-access`（danger-full-access + never）；`custom` 与 `auto` 保留（`docs/subsystems/permission-presets.md:11`）。
- Auto review（实验性，默认关闭）：每次 native 或 PTC 内部工具调用前，用当前 agent 的模型评估待执行动作；允许则 Full access 执行，拒绝则询问用户；分类为低/中/高风险，敏感外传始终拒绝（`packages/experimental/auto-review/README.md:12`、同文件 `:48`）。它把审批策略设为 `ask`，因此“拒绝后询问”；被委派的 in-process 子代理固定 `never`，其拒绝是最终结果（同文件 `:48`）。
- Plan mode 是软约束，不是强制隔离：激活时把部署定义的 `plan:policy` 段加入每次模型请求，但不限制工具；真正的强制要靠 sandbox 与 approval（`docs/subsystems/plan.md:5`）。`/plan [off|message]` 进入/退出；`exit_plan_mode` 要求完整 markdown 计划，经 user-questions 呈现审批（`docs/subsystems/plan.md:33`、`docs/subsystems/plan.md:35`）。
- “编码模式 vs 工作/通用模式”：
  - Web/Desktop 共享 “Coding Tools” 偏好，控制诊断视图、可用预设、变更文件卡片、内置 HTML 预览策略，不改变 Session 记录（`docs/subsystems/web-client.md:58`）。
  - Coding Tools 关闭时，新会话选择器与 Settings 提供 Standard、Creator、自定义预设；开启时额外提供 PTC 与 Minimal（`packages/client/ui-agent-preset/README.md:30`）。
  - 预设实现：`standard` 是完整工具集（bash/pwsh/fs/jobs/schedule/skills/goal/plan/compaction/subagent/workflow/todo/web/present/plugin-manager）；`minimal` 只挂持久 shell（`terminal` + `bash-persistent` / `pwsh-persistent`），没有 compaction、计划模式等（`packages/bundle/web-app/presets/standard.patch.yml`、`minimal.patch.yml`）；`ptc` 在 standard 基础上加 `agent-tool-presentation`；`cordis` 面向插件创作（`packages/bundle/web-app/presets/*.patch.yml`）。
  - 因此 dsh 本身是“通用 agent harness”，编码只是其中一种使用方式；Coding Tools/PTC/Minimal 是产品层对“编码工作台”的显式开关。

### 2.4 上下文

- AGENTS.md/CLAUDE.md：
  - `dsh-agent-instructions` 从用户全局与项目级加载 `AGENTS.md` 兼容文件；默认 `dsh-base` 以 65,536 字节预算启用（`packages/context/agent-instructions/README.md:30`）。
  - 加载链：`$DSH_HOME/AGENTS.md` → `<agentsHome>/AGENTS.md` → 项目根到 Session 工作目录的每个候选文件，宽泛到具体；`CLAUDE.md` 与 `AGENTS.md` 内容重复时只渲染一次；`AGENTS.local.md` / `CLAUDE.local.md` 是本地叠加（同文件 `:34`、`:38`）。
  - 成功 read/write/edit 进入更深目录后，下一次请求会加入新适用的指令文件；文件变化会替换内容，消失或重复会产生移除通知（同文件 `:34`）。
- 记忆：未发现内置长期记忆服务；官方提供 MCP memory 示例（`apps/cli/config/examples/mcp-memory/engram.cordis.yml`、`memorix.cordis.yml`、`mcp-reference-memory.cordis.yml`）。会话历史本身是持久日志，可作为“记忆”来源。
- 压缩：`dsh-compaction` 是可选能力，`compaction-basic` 提供后端，`/compact` 是人工命令；三个 `compaction/*` 事件都是 log-only（`docs/subsystems/compaction.md:5`、`:11`）。`compaction-image-offload` 处理输入图片卸载（`docs/subsystems/compaction.md:31`）。
- @提及/文件引用：
  - `@path` 或 `@"path with spaces"` 触发文件补全；只插入普通 prompt 文本，不读取文件内容，模型必须再调用文件工具（`packages/context/file-reference/README.md:12`、`:32`）。
  - 跨会话引用 `session-reference` 定义规范 URI、当前表面投影、tag-safe JSON、字节保留与不可信模型提示（`docs/subsystems/session-reference.md:5`）。
- 索引：
  - 文件搜索工具：`glob`、`grep`（`docs/tool-catalog.md:1067`、`:1092`）。
  - 语义导航：`lsp` 工具，封闭四种操作 `goToDefinition | findReferences | goToImplementation | hover`（`docs/subsystems/lsp.md:5`、`:17`）。
  - 会话全文索引：`session-query-sqlite`（`docs/subsystems/session-query.md:5`）。
  - 未发现代码 embedding/向量索引。
- 技能：`ctx.skills` 注册表合并 host 与 per-scope 层；provider 可来自文件系统、打包 provider（office/badge）、Windows ACL 诊断等；模型侧 `skill` 工具加载完整 skill 正文（`docs/subsystems/skills.md:5`、`:9`）。

### 2.5 多智能体

- Subagent：
  - 统一 activation API，支持本地子会话与外部执行；capability flags 包括 `agentOptions`、`outputSchema`、`depthLimit`、`toolFilter`、`persona`（`docs/subsystems/subagent.md:5`、`:15`）。
  - 工具：`subagent`、`list_subagent_models`、`interrupt_agent`、`list_agents`、`send_message`（`docs/tool-catalog.md:2018`–`2149`）。
  - 子代理可以继续、被 steer、在父会话结算时回报；`sendMessage` 只允许相邻本地 agent，运行中的子代理接收 steering，缺席的可继续子代理从持久化恢复（`docs/subsystems/subagent.md:184`）。
- Agent Teams（实验性）：
  - 隐式 root Team 域；`TeamId` 是 root `SessionId`；成员快照有 `provider`、`context: 'fresh' | 'fork'`、`phase: provisioning → active|failed`（`docs/subsystems/agent-team.md:7`、`:12`、`:24`）。
  - 共享任务 DAG：每个 task 事件存完整快照，`revision` 是 compare-and-set 值，`blockedBy` 必须无环，`writeScopes` 是建议性路径前缀而非锁（`docs/subsystems/agent-team.md:56`–`58`）。
  - 工具：`spawn_teammate`、`team_task_create/get/list/update`、`wait_agent`、`interrupt_agent`、`list_agents`、`send_message`（`docs/tool-catalog.md:2224`–`2512`）。
- Workflow：
  - 模型编写 orchestration 脚本，脚本内启动 subagent；`WorkflowStartRequest` 含 `script`、`meta`、`args`、可选 `subagentProvider`、`maxTotalAgents`、`parent`、`signal`（`docs/subsystems/workflow.md:5`、`:21`–`31`）。
  - `meta`/`args` 是纯 JSON 数据，引擎先验证 meta，绝不执行脚本文本来获取它；所有 child 都归属 `parent`（同文件 `:13`）。
  - 终止原因封闭为 `completed | cancelled | error`；非 completed 携带 error，consumer 映射为 `isError` 工具结果，不把部分输出当成功（`docs/subsystems/workflow.md:65`）。
- Worktrees：实验性 `dsh-experimental-worktree`，`create_worktree` 创建新分支与 checkout，然后通过 working-directory 服务切换；默认目录 `<checkout root>/.agents/worktrees/<name>`，只从本地 commit/branch/tag 创建，不 fetch、不复制未提交/未跟踪/忽略文件（`docs/subsystems/worktrees.md:5`、`:11`）。
- 并行会话：每个 Session 有独立工作目录；`working-directory/change` 只影响该 Session，现有终端与持久 shell 保留自己的目录，沙箱可写根与项目成员关系仍锚定原始项目（`docs/subsystems/working-directory.md:5`、`:11`）。
- 调度原因码/停止原因：Workflow 用封闭 `stopReason`；Subagent 有 `SubagentResult` 状态与 diagnostic；未发现类似 multica 的统一 dispatch reason code 词汇。

### 2.6 工具面

工具目录（`docs/tool-catalog.md`）列出的用户可见工具，按类归纳：

- 终端/进程：`bash`、`pwsh`、持久 `bash`/`pwsh`、`terminal_open/read/send/signal/list/close`（`docs/tool-catalog.md:599`、`:689`、`:790`、`:817`、`:1125`–`1290`）。
- 文件编辑/读取：`edit`、`read`、`read_image`、`write`；另有 `str_replace_editor`（`docs/tool-catalog.md:844`、`:950`–`1035`）。
- 搜索：`glob`、`grep`（`docs/tool-catalog.md:1067`、`:1092`）。
- Git：没有专用 git 工具，通过 shell 执行；worktree 有专门 `create_worktree`（`docs/tool-catalog.md:2588`）。
- 浏览器：Stagehand provider 的 `stagehand_navigate/act/observe/extract/screenshot/tabs`；还支持 Playwright MCP、Chrome DevTools MCP（`docs/tool-catalog.md:205`–`382`；`docs/subsystems/browser-use.md:11`–`15`）。
- 桌面：Computer use，Cua Driver MCP 或 native provider（`docs/subsystems/computer-use.md:5`–`11`）。
- MCP：每配置一个 `dsh-mcp-client` 条目；工具带取消、权限检查、结果记录与图片输出；资源工具 `list_mcp_resource_templates`、`list_mcp_resources`、`read_mcp_resource`（`docs/subsystems/mcp.md:5`；`docs/tool-catalog.md:123`–`203`）。
- Hooks：
  - `@deepseek-ai/dsh-hook-protocol` 增加 log-only `hook/invoked` / `hook/result`，按 `handlerId` 关联；`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 在 loop 的打开 turn 内触发（`docs/subsystems/session.md:11`、`:753`）。
  - Claude Code mods 兼容桥：`defineMod` 包装 hooks 模块，事件含 `session.start/end`、`prompt.submit`、`turn.start/complete`、`tool.call`、`command.run`、`ui.render` 等；mod 进程内运行、拥有 Node 全局与进程完整权限，未加沙箱（`docs/subsystems/claude-code-mods.md:5`、`:7`、`:19`）。
  - `dsh-hooks-claude-code` 可挂 Claude Code 的 settings hooks（`docs/subsystems/claude-code-mods.md:25`）。
- 插件：`plugin_manager` 工具；`dsh plugin --profile <name> add <pkg>` 转发 pnpm；profile 是插件 bundle 与 patch 层的有序栈（`docs/tool-catalog.md:55`；`docs/cli-help.md:71`；`apps/cli/README.md:37`）。
- 调度/自动化：`schedule_create/list/update/delete`，支持一次延迟、绝对时间、固定间隔、每日/每周本地时间、五段 cron；`standard`/`cordis`/`ptc` 预设提供这些工具，`minimal` 不提供（`docs/tool-catalog.md:1386`–`1677`；`docs/user/guide/schedule.md:22`）。
- 其他：`present`（交付文件）、`todo_write`、`create_goal/get_goal/update_goal`、`ralph`、`web_fetch/web_search`、`session_*`、`working_directory`、`load_workspace_dependencies`、`ask_user_question`、`run_code`、`exit_plan_mode`（`docs/tool-catalog.md` 对应各节）。
- 扩展：Agent 可定义版本化 Cordis 包、运行 host/browser 两半，并在写代码前查询已批准的运行时元数据（`docs/subsystems/extensions.md:5`）。

### 2.7 评审与验证

- 变更呈现：Turn 结束渲染两类交付物：模型通过 `present` 声明的文件，以及本轮改动的文件（git 快照 + 文件工具前后整文件捕获），带 turn-start/turn-end 对比与增删行数（`docs/subsystems/deliverables.md:5`、`:9`、`:21`）。
- 计划评审：`exit_plan_mode` 强制完整 markdown 计划，经 user-questions 审批；批准记录 pending exit，拒绝则把反馈作为失败调用返回（`docs/subsystems/plan.md:33`）。
- 审批审计：每次审批请求有唯一 `ApprovalRequestId`，`approval/asked` 与 `approval/decided` 成对记录，结果封闭且 fail-closed（`docs/subsystems/approval.md:11`–`25`）。
- 测试：没有专用 test gate；通过 bash/终端执行测试，结果进入工具输出与 Session 日志。`docs/testing.md` 是仓库自身的测试指南，不是产品功能。
- GitHub review：可选 overlay 把已签名的 GitHub PR webhook 转成只读 review Session；仅在 PR 从 draft 变为 ready for review 时触发（`docs/user/guide/github-review.md:5`）。
- 用量/成本：
  - `dsh-token-meter` 提供请求压力与按位置的表面定价快照，`totalTokens` 是请求+响应压力，`surfaceTokens` 是按路由定价的表面总量（`docs/subsystems/token-meter.md:5`、`:15`）。
  - `session-telemetry`、`otel`、`product-telemetry` 子系统存在（`docs/subsystems/session-telemetry.md`、`otel.md`、`product-telemetry.md`）。
  - 消息级反馈与 Session 级 `/feedback`；反馈事件 log-only，不进入模型上下文（`docs/subsystems/feedback.md:5`）。
  - `/export` 把 Session 日志打包为 ZIP 下载（`packages/session-query/session-log-export/src/index.ts:79`–`95`）。

### 2.8 协作/共享/远程

- Web 服务：`dsh web` 支持 `--host`（只接受具体本地接口地址，拒绝通配）、`--port`、`--public-url`、`--trusted-host`、`--tls-cert/--tls-key`（`docs/cli-help.md:171`–`201`）。
- 公开部署：有反向代理/受信主机指南（`docs/user/guide/public-deployments.md`）；`--public-url` 只影响广告 URL，不授予信任（`docs/cli-help.md:181`）。
- SSH：SSH provider 家族通过部署拥有的 OpenSSH 连接提供一个远程文件系统/进程世界；Harness、模型传输、Session 存储仍在 host，SSH 只是传输，远程沙箱 provider 负责文件效果（`docs/subsystems/ssh.md:5`、`:11`）。
- 自动化客户端：ACP stdio 与 SDK JSON-RPC；ACP 可为自动化客户端提供一次性机器审批（`docs/subsystems/approval.md:5`、`docs/cli-help.md:88`、`:137`）。
- 会话共享：`session-reference` 支持跨会话结构化引用与准备消息上下文（`docs/subsystems/session-reference.md:5`）。
- Webhook：认证的外部投递转成普通 root Session；规则是可信程序化代码，runtime 不存储、不去重 delivery id（`docs/subsystems/webhook.md:5`、`:17`）。
- 未发现内建多租户/账号/团队权限体系；Web UI 是单操作者形态，公开部署靠外部代理与 trusted-host 围栏。

### 2.9 独特能力（带锚点）

1. **everything-is-a-plugin + profile patch 层**：profile 是有序 bundle patch 栈，用户 patch 在其上叠加；`--dump-config` 可查看组合树（`apps/cli/README.md:37`、`:41`–`48`）。
2. **事件溯源 Session + 任意 turn 边界 fork**：日志是唯一事实源，fork 截取包含式前缀并拒绝在开放 turn 内切割（`docs/subsystems/session.md:5`、`:681`）。
3. **Agent Teams 共享任务 DAG**：带 revision 的 compare-and-set 任务快照、blockedBy 无环约束、writeScopes 建议性写范围（`docs/subsystems/agent-team.md:56`–`58`）。
4. **模型编写 Workflow 脚本**：脚本可 `agent()` 起子代理，引擎强制 `parent` 归属与 `maxTotalAgents` 上限，meta/args 只作数据验证（`docs/subsystems/workflow.md:13`、`:21`–`31`）。
5. **权限/沙箱/计划三权分离**：plan 是软指导，sandbox 与 approval 独立强制；permission preset 把两者打包成 UI 选择器（`docs/subsystems/plan.md:5`、`docs/subsystems/permission-presets.md:5`、`:11`）。
6. **Auto review 风险分级**：逐调用模型审查，低风险放行、中风险需人批、高风险外传永拒（`packages/experimental/auto-review/README.md:48`）。
7. **每轮交付物快照**：`present` 声明文件 + git/整文件捕获的变更文件，带 turn 前后对比（`docs/subsystems/deliverables.md:5`）。
8. **Claude Code mods 兼容桥**：把 Claude Code 的 hooks 模块语义映射到 DSH 事件，明确列出差异与不安全边界（`docs/subsystems/claude-code-mods.md:5`–`25`）。
9. **SSH 远程执行世界**：文件系统/子进程/沙箱 API 指向 SSH host，模型工具不新增 SSH 专用工具（`docs/subsystems/ssh.md:5`）。

### 2.10 最新版本亮点（0.2.1-alpha.2 线）

仓库没有根 CHANGELOG/release notes 文件；以下以 `docs/upgrade-guide/v0.2.1-alpha.1/` 与 `git log dsh-v0.2.0-rc.2..HEAD` 为锚点，标注“0.2.1 线可见变更”，不宣称是完整发布说明。

- 升级指南主题：tool presentation mode、web listener trust config、working directory、python optional resources、python PTC sandbox、session title adapters、session title provider strategy（`docs/upgrade-guide/v0.2.1-alpha.1/*/guide.md`）。
- 实验性持久 Git worktree 创建：`feat(experimental): create and enter retained Git worktrees`（commit `c67a2d6fdf`）。
- 共享 agents-root 的 `AGENTS.md` 加载：`feat(agent-instructions): load the shared agents-root AGENTS.md`（commit `21d0c2e29c`）。
- 官方 bundle 按需安装：`feat(plugins): offer official bundles through on-demand installation`（commit `8ed0b530ed`）。
- macOS 无签名 DMG 打包：`feat(desktop): support local unsigned macOS DMG packaging`（commit `0853aeb0ee`）。
- 语音输入麦克风选择：`feat(voice-input): select microphone with menu-only input levels`（commit `2d0360870c`）。
- 翻译能力：`feat(translator): add opt-in native DeepSeek Flash translation`（commit `b98b76c9a5`）。
- Auto review 权限图标与会话格式迁移状态：`feat(web): add Auto review shield-A permission icon`（commit `29b89df1b8`）、`feat(session): expose format status and defer frontend-triggered migration`（commit `a2dd724c60`）。

### 2.11 未确认/边界

- 没有根 CHANGELOG；alpha.2 的“官方 release notes”未在仓库内找到，只有升级指南与 git 历史。
- 未发现文件级 checkpoint/rewind；只有 turn 边界 fork、deliverables 快照与 compaction 检查点。
- 未发现内置长期记忆服务；MCP memory 只是官方示例 overlay。
- 未发现多租户/团队权限；Web 公开部署是单操作者 + 外部代理信任围栏。
- 未发现看板/甘特/泳道等任务板视图；只有 Todo、Goal、Schedule。
- 未验证 ACP/SDK 与桌面端的全部交互细节；本次以文档与源码声明为准。

---

## 3. dsh-TUI — v0.15.0

### 3.1 产品形态、版本证据、文档位置

- 定位：DeepSeek Harness 的交互式终端 UI，只消费 DSH 公共导出，零核心改动；正在从挂载插件迁移为自带入口与组合根的应用，DSH 作为第一方后端在进程内加载（`README.md:20`–`25`）。
- 运行形态：
  - `dsh-tui` / `dst` 启动；`dsh-tui --resume [id]`、`update`、`doctor`、`safe`、`version`、`help`（`README.md:142`–`151`）。
  - 三种内核：DSH（默认）、实验性 Claude（Claude Agent SDK）、实验性原生 Codex（`codex app-server`，协议基线 0.160.1，最低 0.144.0）（`README.md:195`、`README.md:235`）。
  - VS Code：集成终端或 `dsh-tui-vscode` 扩展；Herdr：在 Herdr pane 运行，通过本地集成 API 上报 `idle/working/blocked`（`README.md:181`）。
- 版本证据：`git describe` = `v0.15.0`；`package.json` = `0.15.0`；HEAD `18e4a20`（2026-10-13）。
- 文档位置：`docs/README.md` 是索引；`docs/user-guide.md`、`docs/interaction.md`、`docs/configuration.md`、`docs/architecture.md`、`docs/session-mount-runtime.md`、`docs/claude-backend.md`、`docs/codex-backend.md`。
- 版本说明：根仓库没有产品 CHANGELOG；`tui-profile/CHANGELOG.md:5` 明确说它只记录 TUI Profile 自身的规范/资产/文档变化，不是 dsh-TUI 产品全部变更。

### 3.2 会话与任务模型

- 新建/恢复/分叉/归档：
  - `/new` 新会话，无二次确认；旧会话已持久化，可 `/resume` 找回（`docs/user-guide.md:301`）。
  - `/resume` `/home` `/agentview` `/bg` `⌸` 打开同一个会话管理界面：工作区栏 + 会话栏、实时筛选、★ 固定、跨工作区；切换只是“停放”，旧会话转后台继续跑，正在跑的回合不中断（`README.md:41`；`docs/user-guide.md:303`）。
  - `/fork` 复制当前会话为可恢复副本；`/tree` 会话分叉树，悬停预览、点击回退/分叉/切换分支（`docs/user-guide.md:305`、`:306`）。
  - `/rename` 重命名并持久化；`/clear` 只清视图；`/export` 从完整 session log 导出 Markdown；`/restart` 重启进程并恢复会话（`docs/user-guide.md:311`–`318`）。
  - 归档：会话管理界面支持固定/筛选；`/bg` 转后台；文档未单列“archive”命令，归档能力以会话管理界面为准（未展开验证）。
- 排队/steer/打断（模型工作时三种语义）：
  - `Enter` = steer（注入下一步边界，不中断）；`Tab` = follow-up（排到当前回合之后）；`Ctrl+Enter` = 打断并立即发送（`docs/user-guide.md:86`–`88`、`:426`–`428`）。
  - `Alt+Up` 取回最后一条未处理消息；`Esc`（有 pending）中断并重投；`/btw` 侧问永不打断主回合（`docs/user-guide.md:90`、`:92`、`:432`）。
- 后台任务：
  - `/jobs` 后台任务面板：状态/运行时长/退出码实时跟踪，`↑/↓` 选择、`k` 停止；面板打开时 `Esc` 只关面板（`docs/user-guide.md:335`）。
  - `/bg` 后台会话在本进程内运行，TUI 退出即停止；日志保留；Claude/Codex 下 `/bg` 只打开会话管理界面，不后台化（`README.md:343`–`345`）。
- 检查点/回退：
  - 空输入双击 `Esc`（或 `/rewind`）进入时间回溯：列出用户消息，选中后取消当前回合、取该消息所属回合开始之前的边界、fork 新会话并回放历史，原消息放回输入框；不能回退到第一条消息；回退分支留在 `/resume` 列表（`docs/user-guide.md:413`–`421`）。
  - `/tree` 提供会话分叉树的可视化切换（`docs/user-guide.md:306`）。
- 会话挂载运行时：
  - 一个 TUI 进程 = 一个终端 + 一个挂载集（当前附加会话 + 所有停放会话）；切换会话是换看哪个，不是停掉哪个；停放的会话仍活着并继续跑（`docs/session-mount-runtime.md:33`、`:42`）。
  - 同机可并存多个 TUI；挂载集发布有 15s 间隔的带锁小文件；同一环境内多个 TUI 互相可见、互相保护，不同环境互不干扰（`docs/session-mount-runtime.md:33`、`:251`、`:275`）。
- 迁移：`dsh-tui migrate` 从 Claude Code/Codex/OMP/zcode/Grok Build 导入历史，只读源、确定性 UUID 幂等、保留消息/推理/工具调用/压缩检查点；`/migrate` 在 TUI 内跑子进程（`README.md:161`–`176`）。

### 3.3 执行模式与审批

- 内核（Kernel）：
  - `/kernel` 在 DSH、Codex、实验性 Claude 之间切换，选择被记住并重启进入新会话；回合运行中拒绝切换；选择当前内核不重启（`docs/user-guide.md:309`、`:310`）。
  - Claude 后端可用 `/permission`、`Shift+Tab` 的 Claude 权限模式（`README.md:221`）；Codex 后端 Shift+Tab 只切 Plan，底层权限预设保持不变，Full Access 需显式选择（`README.md:255`–`257`）。
- 预设（Agent preset）：
  - `/preset` 可选 `standard`（默认全功能）、`ptc`、`minimal`（极简模式：只暴露一个持久 shell 工具，无 compaction、无计划模式）、`cordis`、`liangshen`；已产生对话的会话不能切换，选择只保存为下次 `/new` 的默认（`docs/user-guide.md:350`、`:452`）。
  - 注意：`/preset` 是内核 Agent 预设，决定模型能用哪些工具；`/settings → 极简界面`（Minimal UI）只是显示开关，与模型能力无关（`docs/user-guide.md:568`）。
- Shift+Tab 会话模式（默认三档）：
  - `default` = plan false + `workspace-write` + approval `ask`
  - `plan` = plan true + `read-only` + approval `ask`
  - `full` = plan false + `danger-full-access` + approval `never`
  - 源码锚点：`src/sessionModes.ts:16`–`19`；用户文档 `docs/user-guide.md:456`。
  - 计划批准或 `/plan off` 后，沙箱与审批策略回到进入计划模式之前的状态（`docs/user-guide.md:459`）。
- 审批与问卷：
  - 问卷最后一行是自由输入行；计划评审批准必须无反馈文本；审批与问卷同时挂起时审批优先；后台会话发起的审批会标注来源会话 ID 前 8 位（`docs/user-guide.md:461`–`467`）。
  - 无自己的沙箱：使用当前 DSH profile 的文件系统、shell、沙箱与审批策略；权限预设来自 DSH `permissionPresets` registry（`README.md:438`）。
  - Windows profile 默认 `danger-full-access` + approval `never`，README 明确警告工具不受限（`README.md:436`）。
- 安全模式：`dsh-tui safe` 只读诊断、插件清单与修复建议；`safe --rescue` 构建干净 rescue profile（`README.md:149`）。

### 3.4 上下文

- AGENTS.md：`/init` 在工作目录创建 `AGENTS.md`（created/exists/failed 三态提示）；DSH 内核自身加载 AGENTS.md/CLAUDE.md 链（`docs/user-guide.md:489`；DSH 侧 `packages/context/agent-instructions/README.md:34`）。
- 已加载上下文：`/context` 显示指令/运行时上下文/技能/工具等明细（`docs/user-guide.md:326`）。
- 压缩：`/compact` 手动触发；回合运行中拒绝；minimal preset 不可用；压缩点以 Divider 摘要行呈现（`docs/user-guide.md:405`）。
- @提及与范围：`@` 文件补全；`#L12-14` 行范围；`/` 命令补全；历史搜索 `Ctrl+R` 只搜当前项目（`README.md:31`；`docs/user-guide.md:100`–`104`）。
- 技能：`/skills` 浏览技能目录，名称+来源+简述，Enter 把可直调技能以 `/name ` 填回输入行；TUI 不自带通用技能（`docs/user-guide.md:339`、`:468`）。
- MCP：`/mcp` 按 `mcp__服务器__工具` 分组列出连接状态；未配置时给出 `cordis.patch.yml` 插入示例（`docs/user-guide.md:341`、`:476`）。
- 多模态：Kitty/Sixel 图片缩略图、Mermaid Unicode 图、LaTeX 数学（含 image 模式）、`[Image #N]` 附件（`README.md:34`–`38`）。
- 记忆：未发现 TUI 自己的长期记忆层；沿用 DSH 会话日志与技能/指令。

### 3.5 多智能体

- 子代理：`/agents` 本会话子代理列表；`Ctrl+A` 子代理 Dashboard；侧栏 `agents` 面板提供子代理 Dashboard 与详情（`docs/user-guide.md:334`、`:288`；`README.md:44`）。
- Agentview：`/agentview` 与 `/resume` `/home` `/bg` 共用会话管理界面，用于托管会话状态（`docs/user-guide.md:303`）。
- Goals/Todos：模型写入 goal/todo 时输入框上方实时渲染（目标 + phase 徽章 + 树形 todo）；分栏开启时迁到右栏 `todo` 面板（`docs/user-guide.md:470`）。
- 后台任务/会话：`/jobs` 与 `/bg`（见 3.2）。
- 多内核并行：会话管理界面可同时停放 DSH/Claude/Codex 会话；每个会话绑定自己的内核与预设（`docs/user-guide.md:303`、`:309`）。
- Worktree/委派：TUI 文档列出的 DSH 集成是 presets、skills、MCP、goals、todos、subagents、questionnaires（`README.md:44`）；未列 DSH Agent Teams，未发现 TUI 自己的 worktree 管理界面。
- 外部会话标签：设计文档描述 `/resume` 右上角来源标签页，固定 DSH 第一，其后是本机有数据的外部来源；选中外部会话即导入并跳转（`docs/foreign-session-tabs-design.md:5`–`15`）。

### 3.6 工具面

- 工具来自所选内核：
  - DSH 内核：DSH 的 bash/pwsh/fs/terminal/jobs/schedule/skills/goal/plan/todo/subagent/workflow/present 等（见第 2.6 节）。
  - Claude 内核：Claude Code CLI 的工具、权限模式、hooks、MCP、plugins 按其自身方式加载（`README.md:197`–`199`、`:221`）。
  - Codex 内核：`codex app-server` 的工具、审批、Plan、`/review`、`/diff`、`/usage`、`/init`、skills、MCP（`README.md:249`–`263`）。
- 终端：TUI 本身是终端程序；后台 shell 任务通过 `/jobs` 面板查看，命令卡可展开首条语句/完整脚本（`README.md:343`）。
- 文件编辑：由 DSH/Claude/Codex 的工具完成；TUI 负责工具卡、diff 预览、点击路径打开文件动作菜单（`README.md:327`）。
- Git：状态栏显示 git 分支；工作目录、会话标题、短会话 ID；没有独立 git 工具（`docs/user-guide.md:519`–`545`）。
- 浏览器/Computer use：通过 DSH 扩展（`README.md:46`）；TUI 自身不实现。
- MCP：`/mcp` 状态面板（`docs/user-guide.md:341`）。
- Hooks：`/hooks` 是占位命令，DSH hooks 未在组合中挂载时给出说明（`docs/user-guide.md:344`）。
- 插件：`/plugin list|check|info|registries`；`/plugin` 无参给完整诊断（信任横幅 + host 描述符 + 授权矩阵 + 台账 + profile bundle/行）（`docs/user-guide.md:346`）。
- 调度/自动化：沿用 DSH 的 schedule/goal/todo；TUI 没有独立调度器。
- 会话迁移：`dsh-tui migrate`（见 3.2）。

### 3.7 评审与验证

- 变更 diff：工具卡支持 patch diff 解析与展示（`src/components/messages/AssistantToolUseMessage.tsx:24`、`src/components/SplitDiffView.tsx:20`）；TUI 没有统一的“本轮变更”审查页。
- Codex 内核：`/review`、`/diff`、`/usage` 直接复用 Codex 原生能力（`README.md:259`）。
- 计划评审：DSH `/plan` 的 exit_plan_mode 在 TUI 内呈现问卷，批准必须无反馈文本（`docs/user-guide.md:463`）。
- 成本/用量：
  - 状态栏显示上下文占用、缓存命中率、tokens、会话成本估算（含主会话与子代理，按各自模型 × 峰值/空闲 × 缓存分项计价）；非官方/未收录模型只显示 token 并标注未计价；估算仅供参考，平台账单为准（`docs/user-guide.md:519`–`557`）。
  - `/cost` 给出 token 用量 + 缓存命中率 + 本会话估算与拆解；`/balance` 查 DeepSeek 官方账户余额；`/tokens` 分本次请求/会话累计/上下文占用三段（`docs/user-guide.md:329`–`333`）。
  - 本机使用统计 `~/.dsh-tui/usage.json`，只记录启动次数与在线时长，用于开屏里程碑（`src/usageStats.ts:1`–`10`）。
- 测试门禁：未发现 TUI 内建测试/CI 门禁；测试由底层内核的 shell 工具执行。
- 完成通知：任务成功结算且无排队 follow-up/活跃 goal 时，DSH/Claude/Codex 发终端通知；标题 “dsh-TUI · Task complete”，正文为最新结算回复的 200 字纯文本预览；支持 `unfocused/always/off` 与 `auto/osc9/bel`（`README.md:32`）。

### 3.8 协作/共享/远程

- 多进程/多会话：同机多个 TUI 进程可并存；会话挂载集互相可见、互相保护；被其他终端占用的会话标红进不去（`docs/session-mount-runtime.md:33`、`:275`；`docs/user-guide.md:400`）。
- VS Code：`dsh-tui-vscode` 扩展在真实集成终端运行 TUI，支持多会话、侧边栏历史、一键启动、恢复上次/指定会话；编辑器选区通道需扩展协议 v2（`docs/vscode.md:5`–`25`）。
- Herdr：在 Herdr pane 运行，上报 `idle/working/blocked`（`README.md:181`）。
- 远程：`/connect` 是占位命令，文档明确“DSH 暂无远程连接机制”（`docs/user-guide.md:378`）。
- 共享会话：未见 TUI 自己的多人共享/协作编辑；会话日志共享依赖 DSH 的 session-reference（未在 TUI 文档展开）。

### 3.9 独特能力（带锚点）

1. **会话挂载运行时**：一个 TUI 进程托管多个活跃会话，切换=停放而非停止；同机多 TUI 有占用账本（`docs/session-mount-runtime.md:33`、`:42`、`:275`）。
2. **三内核热切换**：`/kernel`、`/dsh`、`/codex`、`/claude` 重启进入新会话并记住选择（`docs/user-guide.md:309`、`:310`）。
3. **双击 Esc 时间回溯**：取消当前回合、fork 到消息所属回合之前、原消息放回输入框（`docs/user-guide.md:409`–`421`）。
4. **/btw 侧问**：复用当前上下文做无工具、单轮回答，不写历史、不计 token、不打断主回合（`docs/user-guide.md:434`–`436`）。
5. **终端体验**：像素鲸鱼/宠物面板、Mermaid/LaTeX/图片、原生光标动画、TPS/上下文分段条、8 个内置侧栏面板（`README.md:27`–`48`；`docs/user-guide.md:239`–`288`）。
6. **会话迁移**：从 Claude Code/Codex/OMP/zcode/Grok Build 幂等导入，保留工具调用与压缩检查点（`README.md:161`–`176`）。
7. **任务完成通知**：跨三种内核的统一终端通知，带终端能力检测与 tmux 注意事项（`README.md:32`）。
8. **安全模式/rescue profile**：`dsh-tui safe` 只读诊断与 `--rescue` 干净 profile（`README.md:149`）。

### 3.10 最新版本亮点（v0.15.0）

根仓库没有产品 CHANGELOG；`tui-profile/CHANGELOG.md` 只记录 profile 变化。以下以 `git log v0.14.0..v0.15.0` 与 README 为锚点（commit 短哈希可在本地复现）：

- 任务完成终端通知：`feat(notifications): notify on task completion`（`572b5432`；README.md:32）。
- `/plugin` 命令面：`feat(plugin): open the /plugin command surface with a short list and subcommand completion`（`d18dc5b0`）。
- 内核直达命令 `/dsh` `/codex` `/claude`：`feat(kernel): add direct kernel switch commands`（`42866fc1`；user-guide.md:310）。
- 自带入口与组合根、DSH 进程内加载：`feat(host): own the entry and composition root, load DSH in process`（`0d93cab3`；README.md:20–25）。
- Backend 贡献族接线与第一版 apiVersion 冻结：`feat(profile): wire the Backend contribution family into the registry and descriptor chain`（`0d93cab3` 之后的 `3961b3c9`、`491671df`；`tui-profile/CHANGELOG.md:13`–`30`）。
- 模型选择器改版与原生光标：`feat(model): redesign model picker and reasoning controls`（`26a68a34`）、`feat(tui): support native cursor animation and trails`（`dfbee683`）。
- 工作区会话预加载/恢复提速：`perf(sessions): preload workspace history and reduce resume latency`（`6d4c1435`）、`perf(sessions): prioritize workspace session listing`（`95a7891d`）。
- 启动页开关（关闭后直达聊天）：`feat(settings): launchpad on-boot toggle`（`197a26fe`）。
- 文本选择 UX、Sakura Pink 主题、Claude/Codex 公共面重构（`8537656f`、`4f4980fe`、`e3c371ed`、`1d832df3`）。

### 3.11 未确认/边界

- 没有产品级 CHANGELOG/release notes；v0.15.0 的完整发布说明未在仓库内找到。
- TUI 文档未列 DSH Agent Teams；未发现 TUI 自己的 worktree 管理或团队编排 UI。
- `/connect` 是占位，远程协作未实现。
- 归档（archive）命令未在文档单列；以会话管理界面为准，未逐项验证。
- 后台会话在本进程内运行，TUI 退出即停止（README.md:337–341）。

---

## 4. multica — v0.6.2

### 4.1 产品形态、版本证据、文档位置

- 定位：源码可得的“工作空间”，把 AI coding agent 当队友分配到看板上的 issue；agent 接活、报告进度、提阻塞、交回评审（`README.md:11`–`17`）。
- 产品形态：
  - Web：Next.js 16 App Router（`README.md:210`）。
  - Desktop：Electron，共享 Web UI packages（`README.md:211`）。
  - Mobile：Expo/React Native，iPhone/iPad（`README.md:212`；`apps/mobile`）。
  - 后端：Go（Chi + sqlc + gorilla/websocket）+ PostgreSQL 17（`README.md:213`–`216`）。
  - Agent runtime：本机 daemon，驱动 26 种已安装并登录的 agent CLI（`README.md:163`–`184`）。
  - CLI/daemon/Plugin SDK：`CLI_AND_DAEMON.md`、`packages/plugin-sdk`。
- 版本证据：`git describe` = `v0.6.2`；HEAD `7ab92d7`（2026-10-13）；`apps/web/package.json` 与 `apps/desktop/package.json` = `0.6.2`，根 `package.json` 仍是 `0.2.0`（滞后）。
- 文档位置：`apps/docs/content/docs/*.mdx`（Fumadocs，英/中/日/韩/法）；在线 `https://multica.ai/docs`；根 `README.md`、`CLI_AND_DAEMON.md`、`SELF_HOSTING.md`、`SELF_HOSTING_ADVANCED.md`、`VISION.md`。

### 4.2 会话与任务模型

- 两层模型：Issue 是持久工作记录（`apps/docs/content/docs/concepts.mdx:14`–`16`）；Run 是一次 agent 执行（`apps/docs/content/docs/concepts.mdx:36`–`38`）。一个 Issue 可产生多个 Run，Run 完成不代表 Issue 完成（`apps/docs/content/docs/tasks.mdx:12`–`20`）。
- Issue 结构：标题/描述、状态/优先级、assignee（成员/agent/squad）、日期/标签/自定义属性、项目/父子关系、活动与执行日志（`apps/docs/content/docs/issues.mdx:10`–`21`）。
- 状态：7 个内置状态，分 4 个生命周期类别：
  - `unstarted`：`backlog`、`todo`
  - `started`：`in_progress`、`in_review`、`blocked`
  - `done`：`done`
  - `closed`：`cancelled`
  （`apps/docs/content/docs/issues.mdx:43`–`60`）
  - 自定义状态由 owner/admin 添加，类别固定、内置状态锁定、归档只退役不删除；API/CLI 用 key 寻址（`apps/docs/content/docs/issues.mdx:75`–`99`）。
- 视图：Issues 页提供 list、board、table、Gantt、swimlane 五种视图，按状态/assignee/项目/属性筛选排序（`apps/docs/content/docs/issues.mdx:113`）。
- 子 issue：可设 stage 1/2/3 分批推进；最早未完成 stage 全部 done/cancelled 时父 issue 收到通知，父 assignee 是 agent 时被唤醒决定下一 stage（`apps/docs/content/docs/issues.mdx:103`–`109`）。
- Run 状态机：`deferred → queued → dispatched → waiting_local_directory → running → completed|failed|cancelled`（`apps/docs/content/docs/tasks.mdx:39`–`46`）。
- 触发源：assign issue 给 agent/squad、评论 @mention、chat 消息、Autopilot 定时/webhook（`apps/docs/content/docs/tasks.mdx:22`–`28`）。
- 排队/steer：
  - 排队：runtime 离线时 run 留在 queue；queued 不会因等待过久而过期，只有 runtime 超过重连宽限且 run 也已排队同样久才失败（`apps/docs/content/docs/tasks.mdx:48`）。
  - steer：回复正在工作的 agent，消息落入当前 run 而非下一个；README 明确“Claude Code、Codex、Grok today”（`README.md:90`）。实现上 `task_supplement` 以 `(comment_id, task_id)` 记录投递，capability 为 `task-supplement-v1`，仅 `codex`/`claude`/`grok` provider 启用（`server/migrations/548_task_supplement_comment_task_index.up.sql:1`–`4`；`server/pkg/db/queries/supplement.sql:2`–`20`）。
  - 连续评论合并：同一 agent 已有等待 run 时新评论合并进 pending；运行中则等当前 run 结束后合并为一个 follow-up run（`apps/docs/content/docs/mentioning-agents.mdx:74`–`78`）。
- 后台/长任务：
  - 一个 daemon 默认最多 20 个并发 run，每个 agent 最多 6 个；有效并发取两者较小值（`apps/docs/content/docs/daemon-runtimes.mdx:70`–`74`）。
  - 运行超时由 daemon 配置；健康心跳每 15 秒，runtime 掉线约 3 分钟内标记离线（`apps/docs/content/docs/tasks.mdx:146`–`168`）。
- 检查点/回退：未发现 fork/checkpoint/rewind 的产品能力；会话续接依赖底层 CLI 的 session resume（`apps/docs/content/docs/providers.mdx:65`–`71`）。Chat 会话可重命名、固定、归档、删除；删除会停止未完成 run（`apps/docs/content/docs/chat.mdx:52`–`62`）。

### 4.3 执行模式与审批

- 不是编码 IDE，而是工作管理层：agent 是一份可复用配置（名称、instructions、skills、Access、runtime），本身不是长运行进程；只有被触发才产生 Run（`apps/docs/content/docs/concepts.mdx:24`–`26`；`apps/docs/content/docs/agents.mdx:5`）。
- 四种触发/工作方式：
  1. 分配 issue 给 agent/squad（`apps/docs/content/docs/issues.mdx:23`–`29`）。
  2. 评论 @mention（不改 assignee，不改进度状态）（`apps/docs/content/docs/mentioning-agents.mdx:9`–`17`）。
  3. 直接 Chat（无 issue 上下文、完全私有、不自动建 issue）（`apps/docs/content/docs/chat.mdx:9`–`15`）。
  4. Autopilot 定时/Webhook（`apps/docs/content/docs/autopilots.mdx:5`–`22`）。
- Autopilot 两种执行模式：
  - `Create issue`：每次触发先建 issue 再分配，讨论/状态/run 记录都在 issue 上；runtime 离线时 issue 仍创建、run 等待（`apps/docs/content/docs/autopilots.mdx:30`、`:33`）。
  - `Run only`：直接创建 run，不建 issue，结果只在 autopilot 运行历史；runtime 不可用时 run 记为 skipped（`apps/docs/content/docs/autopilots.mdx:31`、`:35`）。
- 审批/权限：
  - 无沙箱：run 默认以 daemon 用户的完整权限执行；Multica 明确不做文件系统隔离，边界应由专用 Unix 用户/容器/VM 提供（`apps/docs/content/docs/security-model.mdx:10`–`28`）。
  - 底层 CLI 的审批提示被自动回答；默认 Codex `sandbox_mode = "danger-full-access"`，Claude Code `--permission-mode bypassPermissions`；唯一例外是 Windows 上显式配置 Codex 原生沙箱时保留 `workspace-write`（`apps/docs/content/docs/security-model.mdx:42`–`49`）。
  - Agent Access 三档：Only me / Entire workspace / Specific people；owner/admin 也不能绕过 Access 运行别人的 “Only me” agent（`apps/docs/content/docs/agents.mdx:47`–`57`）。
  - 工作区角色：owner/admin/member；角色只管工作区设置与团队管理，日常协作对所有成员开放（`apps/docs/content/docs/members-roles.mdx:10`–`25`）。
- “编码 vs 工作”语义：
  - 产品是工作管理面（issue/board/chat/autopilot），编码由底层 CLI 执行（`README.md:163`–`184`）。
  - Chat 是轻量工作模式：一对一、无 issue 上下文、不自动建 issue；Issue 是有 assignee/状态/交付物的正式模式（`apps/docs/content/docs/chat.mdx:29`–`36`）。
  - Autopilot 的 `Run only` 是后台执行模式，`Create issue` 是协作工作模式（`apps/docs/content/docs/autopilots.mdx:26`–`35`）。

### 4.4 上下文

- Agent instructions：每次 run 都使用；description 只展示、不进入执行 prompt（`apps/docs/content/docs/agents.mdx:12`–`18`）。
- 技能：
  - 技能主文件 `SKILL.md`，可带脚本/模板/参考资料；可手工创建、从本地目录/`.skill`/`.zip` 导入、从 GitHub/ClawHub/Skills.sh URL 导入、从 runtime 复制（`apps/docs/content/docs/skills.mdx:12`–`41`）。
  - 技能绑定到 agent，可多对多；编辑对后续 run 生效，不改变进行中的 run；工作区技能与仓库内 `.claude/skills/`、`.agents/skills/` 分开，Multica 不自动注册仓库技能（`apps/docs/content/docs/skills.mdx:79`–`98`）。
  - 运行前把绑定技能写入各 CLI 的原生路径（如 `.claude/skills/`、`.codex/skills/`、`.dsh/skills/`），不覆盖仓库已有同名技能，结束后只清理自己创建的文件（`apps/docs/content/docs/providers.mdx:92`–`100`）。
- 项目上下文：项目名称/描述进入 run 上下文；项目可绑定 GitHub 仓库或本地目录，运行时写入 `.multica/project/resources.json`（`apps/docs/content/docs/projects.mdx:38`–`44`；`apps/docs/content/docs/project-resources.mdx:5`–`20`）。
- 仓库/工作目录：
  - GitHub 仓库由 runtime 管理 checkout；本地目录只在绑定的 daemon 上生效（`apps/docs/content/docs/project-resources.mdx:5`–`20`）。
  - 本地目录两种模式：`in_place`（默认，串行，直接改你的目录）与 `worktree`（每次 run 独立 git worktree，可并发，不写你的工作副本）（`apps/docs/content/docs/project-resources.mdx:65`–`92`）。
- MCP：Agent 配置可提供 MCP server；只有支持 managed MCP 的 CLI 显示该字段；MCP 配置存服务端、含 token 时按敏感值规则显示（`apps/docs/content/docs/agents-create.mdx:109`、`:128`–`136`）。
- @mentions：issue 评论 @agent/squad 触发 run；支持触发器预览、逐 target 取消、连续评论合并、`/note` 不触发、`@all` 只通知成员不触发 agent（`apps/docs/content/docs/mentioning-agents.mdx:9`–`90`）。
- 会话续接：Multica 存 CLI 返回的 session id，下一次同一 issue 继续工作时尝试 resume；不能 resume 则新建 session（`apps/docs/content/docs/providers.mdx:65`–`71`）。
- AGENTS.md/压缩：Multica 文档未定义自己的 AGENTS.md 加载或压缩策略；由底层 CLI 按各自规则处理（未发现，标记为未验证）。
- 索引：未发现 Multica 自己的代码索引；搜索是 issue/项目/评论等产品搜索（`CLI_AND_DAEMON.md` 的 issue search；`apps/docs/content/docs/cli.mdx`）。

### 4.5 多智能体

- Agent：可复用身份 + 配置；一个 runtime 可托管多个 agent，一个 agent 可完成多次 run（`apps/docs/content/docs/agents.mdx:26`–`34`）。
- Squad：
  - 一个 leader agent + 任意成员（agent 或人）；分配 issue 给 squad 不会同时运行所有 agent，而是先唤醒 leader，由 leader 读上下文决定谁做下一步（`apps/docs/content/docs/squads.mdx:5`–`24`）。
  - 执行流程：leader 认领 run → 系统在 leader prompt 追加 Squad Operating Protocol、Squad Roster、Squad Instructions → leader 发一条 delegation 评论并 @ 选中成员（精确 mention markdown 才触发）→ 记录 `squad activity` 评估 → 停止；成员回报或子 issue/stage 关闭时 leader 被重新触发（`apps/docs/content/docs/squads.mdx:29`–`50`）。
  - Leader 重新触发规则：非成员评论触发；成员无 @ 的进度更新触发；显式 @ 他人/`@all` 不触发；leader 自己的评论不触发；纯 issue 引用触发；去重（`apps/docs/content/docs/squads.mdx:52`–`66`）。
  - Squad 不绕过成员 Access；leader 被归档或当前成员无权运行时 squad 不能被分配/@（`apps/docs/content/docs/squads.mdx:79`–`85`）。
- Runtime：
  - daemon 代表一台机器；一个 runtime = 一台机器 + 一个 AI coding tool 或一个自定义 runtime profile；重启 daemon 更新已有记录，不重复创建（`apps/docs/content/docs/daemon-runtimes.mdx:10`–`17`）。
  - 私有/公开 runtime：本地 runtime 默认私有，只有 owner 能建 agent；只有 owner 能公开；公开只允许其他成员路由 run，不共享 CLI 登录凭据（`apps/docs/content/docs/daemon-runtimes.mdx:76`–`82`）。
  - 自定义 runtime profile：选协议族、命令、固定参数；命令必须是可执行文件+参数，不支持管道/重定向/变量展开；Multica 的协议参数排在用户固定参数之后（`apps/docs/content/docs/daemon-runtimes.mdx:88`–`114`）。
- Worktree/并行：
  - 本地目录 `worktree` 模式每次 run 独立 worktree，可无限并发；未提交/未跟踪文件会重放进 worktree（2000 文件/200 MiB 上限），冲突由 agent 先解决；分支 `agent/<agent>/<issue>`，后续 run 继续同一分支；Multica 从不自动合并（`apps/docs/content/docs/project-resources.mdx:73`–`92`）。
- Autopilot：一个 autopilot 存 runbook、assignee、一个或多个 trigger；可按 cron/时间窗/时区，也可 webhook；webhook 支持 `Idempotency-Key` 与事件过滤，payload 最大 256 KiB（`apps/docs/content/docs/autopilots.mdx:5`–`99`）。
- Dispatch/失败原因码：
  - 成功路径：`queued`、`coalesced`、`deferred`、`steered`。
  - 拒绝/跳过：`invocation_not_allowed`、`target_unavailable`、`runtime_offline`、`runtime_unusable`、`runtime_access_denied`、`runtime_profile_missing`、`agent_runtime_required`、`attribution_blocked`、`already_active`、`self_trigger_suppressed`、`issue_in_triage`、`quota_exceeded`、`issue_limit_reached`、`internal_error`（`server/internal/dispatch/reason.go:19`–`80`）。
  - Run 失败原因分平台侧（`runtime_offline`、`queued_expired`、`runtime_recovery`、`environment_prepare_failed`、`cancelled`、`timeout`、`iteration_limit`、`agent_blocked`、`api_invalid_request`、`codex_semantic_inactivity`）与工具侧 `agent_error.*`（`apps/docs/content/docs/tasks.mdx:88`–`126`）。

### 4.6 工具面

- Agent CLI：26 种内置 provider（Claude Code、Codex、Cursor Agent、Copilot、OpenCode、OpenClaw、Hermes、Pi、Antigravity、CodeBuddy、DevEco、Grok、Kimi、Kiro、Qoder、Qoder CN、Qwen、QwenPaw、Reasonix、Trae、DSH、OMP、MiniMax、Dim、CodeArts、ZeroClaw）（`README.md:163`–`184`）。
- 终端：由底层 CLI 提供；Multica 不提供自己的终端面板。
- 文件编辑/Git：由底层 CLI 提供；Multica 负责仓库 checkout、worktree 隔离、PR 链接与分支归属记录（`apps/docs/content/docs/project-resources.mdx:73`–`92`；`apps/docs/content/docs/cli.mdx` 的 `repo checkout`）。
- 浏览器：未发现 Multica 自己的浏览器工具；由底层 CLI 的 MCP/工具决定。
- MCP：
  - 工作区 MCP server 库：`multica workspace mcp list/add/update/remove`，writes 仅 owner/admin；库条目不会自动给 agent，需 `multica agent mcp add`（`apps/docs/content/docs/cli.mdx` 命令表）。
  - Agent 级 MCP：`--mcp-config` 或 UI 的 MCP 段；只有支持 managed MCP 的 CLI 显示（`apps/docs/content/docs/agents-create.mdx:109`、`:128`–`136`）。
- Hooks/插件：
  - Plugin SDK：一个 sandboxed iframe 中的单一脚本，`sandbox="allow-scripts"` 且无 `allow-same-origin`；无浏览器存储，用 `multica.storage`；CSP 由 Multica 生成，`net:` scope 精确到 host；发布版本不可变，安装绑定工作区到一个版本（`packages/plugin-sdk/README.md:5`–`70`）。
  - 插件调用以登录用户身份执行，受工作区 admin 授予的 scope 与用户自身权限双重限制；插件发的评论不会触发 @mention dispatch（`packages/plugin-sdk/README.md:55`–`70`）。
- 调度/自动化：Autopilot cron/webhook（见 4.5）；`multica autopilot trigger-add/update/delete/rotate-url`（`apps/docs/content/docs/cli.mdx` 命令表）。
- 通知/集成：Slack、Feishu/Lark、DingTalk、WeCom、Telegram；每个 bot 绑定一个 agent；支持 `/issue`、`/new`、`/clear`（`apps/docs/content/docs/channels.mdx:5`–`50`）。
- 其他 CLI：`issue`、`project`、`label`、`property`、`agent`、`skill`、`squad`、`workspace`、`repo`、`daemon`、`runtime`、`attachment`、`user`、`auth`、`login`、`setup`、`config`、`update`、`version`（`apps/docs/content/docs/cli.mdx:178`–`198`）。

### 4.7 评审与验证

- Review gate（产品语义）：工作落在 `in_review`，不是直接进 main；人决定什么能发（`README.md:92`；`apps/docs/content/docs/issues.mdx:59`）。
- PR 链接：
  - 分支名或 PR 标题含 issue 标识（忽略大小写，只匹配当前工作区前缀）；PR body 的 `Closes/Fixes/Resolves MUL-123` 才算链接；裸提及不链接；可手工粘贴 PR URL（`apps/docs/content/docs/github-integration.mdx:45`–`71`）。
  - PR 卡片显示仓库/编号/标题/作者、状态、增删行/文件数、CI 状态（全过/失败/进行中；无 checks 不当作通过）、mergeability（mergeable/conflicting/blocked/behind）；GitHub 不可用时保留上次快照并标 stale（`apps/docs/content/docs/github-integration.mdx:71`–`87`）。
  - 所有链接 PR 都 merged 时，issue 按工作区设置移到目标状态（默认 Done，也可 Don't change）；可在单 issue 上关闭该行为（`apps/docs/content/docs/github-integration.mdx:87`–`101`）。
- 执行日志/transcript：issue 右栏 Execution log 实时更新；每行显示触发源、执行 agent、状态、时间；可 View transcript 查看消息/工具调用/错误，运行中持续流式，“Newest first” 可翻转顺序（`apps/docs/content/docs/tasks.mdx:56`–`75`）。
- 自动重试：常规 run 默认最多 2 次（首次 + 1 次重试），工具网络中断最多 3 次；auth/quota/config/model 错误不自动重试；Autopilot `run only` 不自动重试（`apps/docs/content/docs/tasks.mdx:78`–`86`）。
- 用量/成本：
  - `multica issue usage <issue-id>` 聚合 token 用量；`multica runtime usage <runtime-id>` 查看 runtime 用量；`multica agent tasks` 查看 agent run 历史（`apps/docs/content/docs/cli.mdx` 命令表）。
  - README 宣称按 run、按 agent、按 issue 看成本；0.6.1 的 changelog 提到 issue 侧栏用曲线显示累计花费（`README.md:91`；`apps/web/features/landing/i18n/en.ts:571`）。
- 测试门禁：没有独立测试 gate；CI 状态通过 PR 卡片镜像；是否阻止合并由 GitHub 侧规则决定，Multica 只显示与移动 issue 状态。

### 4.8 协作/共享/远程

- Workspace：所有工作与配置的容器；人类与 agent 在同一 workspace 协作（`apps/docs/content/docs/concepts.mdx:12`）。
- 角色：owner/admin/member；最后一位 owner 不能被降级/移除/离开（`apps/docs/content/docs/members-roles.mdx:10`–`35`）。
- Inbox：成员通知中心，含分配、订阅 issue 的评论/状态/优先级/日期变化、@mention、reaction、agent run 失败、autopilot 创建 issue/暂停；agent 不使用 inbox，`@all` 只通知成员（`apps/docs/content/docs/inbox.mdx:10`–`46`）。
- Chat 私有性：直接 chat 仅创建者可见，其他成员与 admin 不可读（`apps/docs/content/docs/chat.mdx:9`–`15`）。
- 外部渠道：Slack/Feishu/Lark/DingTalk/WeCom/Telegram；群聊需 @bot，DM 不需；`/issue` 建 issue，`/new` 新 chat，`/clear` 清上下文（`apps/docs/content/docs/channels.mdx:5`–`50`）。
- 远程/部署：自托管 Docker Compose/Helm；cloud/desktop/self-host 三种入口；移动端 iOS 需自建，未上 App Store（`README.md:107`–`140`）。
- 任务板语义：issue 是基本工作单元，board 是视图之一（list/board/table/Gantt/swimlane），不是唯一界面；项目组织 issue 并绑定资源（`apps/docs/content/docs/issues.mdx:113`；`apps/docs/content/docs/projects.mdx:5`–`44`）。

### 4.9 独特能力（带锚点）

1. **Agent 当队友上板**：assign issue 即触发 run，agent 评论进度、提阻塞、交回 review（`README.md:11`–`17`；`apps/docs/content/docs/issues.mdx:23`–`29`）。
2. **Squad 领导路由**：leader 先读上下文，再发一条精确 @mention 的 delegation 评论；系统硬编码 Squad Operating Protocol 与 Roster（`apps/docs/content/docs/squads.mdx:29`–`50`）。
3. **Run 生命周期与稳定失败码**：8 状态 + 成功/拒绝 reason code 封闭枚举 + 平台/工具两侧失败原因表（`apps/docs/content/docs/tasks.mdx:39`–`126`；`server/internal/dispatch/reason.go:19`–`80`）。
4. **Worktree 并发与分支所有权**：每次 run 独立 worktree、分支 `agent/<agent>/<issue>`、隐藏 ref `refs/multica/local-state/` 记录所有权与续接基线（`apps/docs/content/docs/project-resources.mdx:73`–`92`）。
5. **真实 steer**：评论注入正在运行的 run，仅 Claude Code/Codex/Grok，`task_supplement` 按 `(comment, run)` 记录（`README.md:90`；`server/migrations/548_task_supplement_comment_task_index.up.sql:1`–`4`）。
6. **Autopilot 双模式**：create issue 与 run only 的语义、重试、离线行为明确不同（`apps/docs/content/docs/autopilots.mdx:26`–`35`）。
7. **跨 26 种 CLI 的统一运行时**：daemon 发现/注册 runtime，任务级 token 绑定 agent+run，24 小时上限（`README.md:163`–`184`；`apps/docs/content/docs/daemon-runtimes.mdx:88`–`114`）。
8. **插件 SDK 的强隔离**：opaque origin iframe、无浏览器存储、服务端 storage、CSP `net:` 精确 host、发布版本不可变（`packages/plugin-sdk/README.md:5`–`70`）。

### 4.10 最新版本亮点（v0.6.2）

官方 changelog 在落地页 i18n 中，英文 `apps/web/features/landing/i18n/en.ts:526`，中文 `apps/web/features/landing/i18n/zh.ts:511`。摘要：

- 自定义属性支持文本列表/链接列表，并可按值精确筛选（`en.ts:531`）。
- Cmd/Ctrl+K 切换工作区；桌面端切换时恢复上次打开的标签页（`en.ts:532`–`533`）。
- 空白聊天点击开场建议立即发送，且不覆盖草稿（`en.ts:534`）。
- 本机 daemon 可从命令行开启开机自启，默认关闭（`en.ts:535`）。
- Issues 列表首屏更快；桌面导航与标签栏对齐（`en.ts:538`–`539`）。
- 修复：Codex 长线程跨本地目录续接、限流不再卡住；识别 ChatGPT.app 内的 Codex CLI；Pi 任务获得 MCP；Pi/Kimi 失败正确显示；Antigravity 末尾断连保住回答；CodeBuddy 启动错误不中断运行；OMP 新会话；Windows 临时目录；睡眠唤醒不再误判无响应；daemon 健康端口被占用可恢复；Hermes 跨目录续接；密集 cron Autopilot 不再静默；PR wakeup 不漏变化；Lark Typing 清理；WeCom 由实际 agent bot 发通知；带数字 issue 前缀可搜索；项目并发编辑不覆盖字段；聊天加载中 follow-up 不丢；附件下载/文本步骤标签；500 不泄露内部错误（`en.ts:540`–`563`）。

### 4.11 未确认/边界

- 没有 fork/checkpoint/rewind 的产品能力；会话续接依赖底层 CLI。
- 没有自己的 AGENTS.md 加载/压缩策略文档；由底层 CLI 负责，未验证统一行为。
- 审批不是 Multica 的每调用门禁：底层 CLI 审批提示被自动回答，默认 bypass/danger-full-access；安全边界在 daemon 用户之外（`apps/docs/content/docs/security-model.mdx:10`–`49`）。
- Steer 仅 Claude Code/Codex/Grok；其他 provider 只排队。
- 根 `package.json` 版本 `0.2.0` 与发布 tag `0.6.2` 不一致；以 tag/apps 包为准。
- 未验证移动端全部功能；以 `apps/mobile` 与 README 声明为准。

---

## 5. routa — v0.19.0

### 5.1 产品形态、版本证据、文档位置

- 定位：workspace-first 的多智能体软件交付协调平台；目标、任务、会话、trace、证据、review 状态都可见在 board 上，而不是埋在单一聊天线程（`README.md:23`）。
- 产品形态：
  - Web：Next.js pages + route handlers（`README.md:49`）。
  - Desktop：Tauri shell + Rust Axum server（`README.md:50`）。
  - CLI：`routa-cli` npm/cargo 包，提供 `routa` 命令；支持一次性 prompt、HTTP server、ACP server、specialist/team/fitness 等（`packages/routa-cli/README.md:1`–`80`）。
  - 双后端共享同一 `api-contract.yaml` 语义（`README.md:51`）。
  - 集成面：ACP、MCP、A2A、AG-UI、A2UI、REST、SSE（`README.md:52`）。
- 版本证据：`git describe` = `v0.19.0`；`package.json` = `0.19.0`；HEAD `73eb1ed`（2026-06-22）。
- 文档位置：`docs/`（Docusaurus site `docusaurus.config.js`）；关键文档 `docs/ARCHITECTURE.md`、`docs/product-specs/FEATURE_TREE.md`、`docs/design-docs/execution-modes.md`、`docs/fitness/README.md`、`docs/releases/v0.19.0-release-notes.md`。根 `CHANGELOG.md` 停在 `0.2.5`（2026-03-15），不能作为当前版本说明。

### 5.2 会话与任务模型

- 三种一等执行模式（`docs/design-docs/execution-modes.md:13`–`23`）：
  - **Sessions**：从一个可恢复会话线程开始；默认 ROUTA 角色，可切换 CRAFTER/GATE/DEVELOPER；ROUTA 可委派 CRAFTER、调 GATE，但不是固定流水线（`docs/design-docs/execution-modes.md:31`–`61`）。
  - **Kanban**：从工作流状态与泳道自动化开始；列转换触发新会话（`docs/design-docs/execution-modes.md:63`–`100`）。
  - **Team**：从协调 lead 开始，lead 派发真实子会话（`docs/design-docs/execution-modes.md:102`–`140`）。
- Session 能力：
  - 创建、prompt、cancel、reconnect、streaming、trace inspect（`README.md:141`）。
  - API 支持 list/get、context、disconnect、fork、history、transcript、reposlide-result（`src/app/api/sessions/[sessionId]/fork/route.ts`、`.../disconnect/route.ts`、`.../history/route.ts`、`.../transcript/route.ts`）。
  - Fork：会话分叉 API 存在（`src/app/api/sessions/[sessionId]/fork/route.ts`）；UI/文档未展开 fork 语义，标记为“API 存在，产品交互未验证”。
- Task 状态：`PENDING`、`IN_PROGRESS`、`REVIEW_REQUIRED`、`COMPLETED`、`NEEDS_FIX`、`BLOCKED`、`CANCELLED`；验证裁决 `APPROVED`/`NOT_APPROVED`/`BLOCKED`（`src/core/models/task.ts:11`–`32`）。
- 任务持久化：Task 是持久工作单元；Kanban 不只是 UI 投影，也驱动泳道自动化与队列；列转换可创建新 ACP session 并把 provider/role/session 元数据写回 task（`docs/ARCHITECTURE.md:120`–`127`）。
- 队列：TypeScript `kanban-session-queue.ts` 强制每 board 并发上限，并防止过期 auto-run 条目重复触发（`docs/ARCHITECTURE.md:127`）。
- 工作树：Workspace 可拥有多个 Codebase；Worktree 是 workspace + codebase 绑定的临时/半持久执行副本；文件搜索、沙箱解析、repo 选择都走 codebase/worktree 上下文（`docs/ARCHITECTURE.md:106`–`111`）。
- 后台任务/工作流：Background task 建模 durable async work（定时、轮询、workflow fan-out）；Workflow 把高层自动化定义转成多个有依赖顺序的 background task；schedule tick、webhook、polling adapter 都可入队（`docs/ARCHITECTURE.md:129`–`133`）。
- Archive/checkpoint：未发现 archive 命令；有 session history compaction（`src/core/storage/history-compactor.ts`）与 fork，但未发现文件级 rewind/checkpoint 产品能力。标记为未发现。

### 5.3 执行模式与审批

- 模式语义（设计文档明确）：
  - Sessions：通用、单线程入口、ROUTA-first、按需拉 CRAFTER/GATE、最低摩擦恢复、通常最省 token（`docs/design-docs/execution-modes.md:37`–`61`）。
  - Kanban：流程驱动；卡片状态是触发器，泳道定义谁跑下一步，review/done 是默认 GATE 检查点；board 队列有并发上限（`docs/design-docs/execution-modes.md:63`–`100`）。
  - Team：组织驱动；lead 规划、派发、协调、验证，不自己实现；使用真实子会话；要求 repo 选择（`docs/design-docs/execution-modes.md:102`–`140`）。
- 角色：核心角色 ROUTA（协调，不直接改文件）、CRAFTER（实现，限定范围，小步提交）、GATE（按验收标准验证，证据强制，不允许部分批准）（`README.md:127`–`131`；`resources/specialists/core/{routa,crafter,gate}.yaml`）。
- Kanban 泳道专家：Backlog Refiner、Todo Orchestrator、Dev Crafter、Review Guard、Done Reporter、Blocked Resolver；每条泳道有独立 prompt 契约与证据契约（`README.md:72`–`95`；`resources/specialists/workflows/kanban/*.yaml`）。
- 过渡门禁：
  - 门禁要求类型：`required_checklist`、`required_human_approval`、`validator_command`；模式 `blocking` 或 `warning`（`src/core/kanban/transition-gates.ts:5`、`:100`）。
  - checklist 取 `- [x] label`；validator 命令要求证据文本同一行包含命令且含 pass/success/ok/green 且不含 fail/error/red（`src/core/kanban/transition-gates.ts:39`–`75`）。
- 交付规则：`requireCommittedChanges`、`requireCleanWorktree`、`requirePullRequestReady`（`src/core/models/kanban.ts:23`–`30`）。
- 契约规则：`requireCanonicalStory`、`loopBreakerThreshold`（`src/core/models/kanban.ts:32`–`37`）。
- Dev 会话监督：`disabled | watchdog_retry | ralph_loop`，含 `inactivityTimeoutMinutes`、`maxRecoveryAttempts`、`completionRequirement`（`turn_complete | completion_summary | verification_report`）（`src/core/models/kanban.ts:12`–`16`、`:56`–`64`）。
- 审批/沙箱：
  - Kanban 可在目标列要求 `requiredHumanApproval`（`src/core/models/kanban.ts:119`–`120`）。
  - 核心角色 prompt 要求 ROUTA 先出计划并等待用户批准再委派/实现（`src/core/orchestration/specialist-prompts.ts:37`–`49`、`:253`–`275`）。
  - Rust `crates/routa-core/src/sandbox/` 提供 sandbox policy/manager；Workers 抽象本地与 Docker 执行环境（`docs/ARCHITECTURE.md:143`）。
  - 未发现类似 dsh 的 per-call approval policy UI；审批主要是 prompt 契约 + Kanban 门禁 + Docker/sandbox 策略。标记为“部分实现，未统一”。
- 工具模式：`essential` = 7 个核心 agent coordination 工具（适合弱模型）；`full` = 34 个工具（Task/Agent/Note/Workspace/Git）；默认 `essential`，可用 `ROUTA_TOOL_MODE` 或运行时切换（`src/core/mcp/tool-mode-config.ts:1`–`17`）。
- “编码 vs 工作”语义：routa 没有“工作模式”开关；三种模式都是软件交付的 agent 执行面，差别在编排边界（Sessions 单线程 / Kanban 流程 / Team 协调）。这是本报告四个工具里对“执行模式”定义最明确的一个（`docs/design-docs/execution-modes.md:13`–`23`）。

### 5.4 上下文

- AGENTS.md 作为路由层：保持紧凑，只告诉 agent 去哪里找、必须遵守什么、适用哪个验证循环；详细知识放 `docs/`（`docs/design-docs/core-beliefs.md:21`–`29`）。
- 仓库即工作知识：产品面在 `docs/product-specs/`，架构在 `docs/ARCHITECTURE.md`，设计意图在 `docs/design-docs/`，进行中计划在 `docs/exec-plans/`，失败/回归在 `docs/issues/`（`docs/design-docs/core-beliefs.md:13`–`43`）。
- 规格/Feature Surface：`src/core/spec` 生成 Feature Tree；`/workspace/:id/spec` 页面与 `feature-explorer` 页面提供 feature surface 浏览；`docs/product-specs/FEATURE_TREE.md` 是自动生成的路由/API 索引（`docs/product-specs/FEATURE_TREE.md:1`–`8`）。
- 仓库知识索引：`src/core/repowiki` 构建 repo wiki、storyline context、architecture anchors、codebase tree；`src/core/reposlide` 生成仓库演示 PPTX（`src/core/repowiki/build-repowiki.ts`、`src/core/reposlide/build-reposlide-launch.ts:166`–`189`）。
- 记忆：
  - 任务自适应记忆：`search_reasoning_memory`、`save_reasoning_memory`、`load_retrospective_memory`、`save_retrospective_memory` MCP 工具（`src/core/mcp/reasoning-memory-tools.ts:1`–`60`）。
  - Kanban 历史记忆策略：`off | auto | force`，含 `minMatchedSessions`、`minMatchedFiles`、`minFeatureCandidates`、`minConfidence`（`src/core/models/kanban.ts:17`、`:80`）。
- 压缩：`src/core/storage/history-compactor.ts` 做 session history compaction；0.19.0 修复/增强了 session compaction 与 tool-call delta compaction（`docs/releases/v0.19.0-changelog.md` 中的 `session compaction` 条目；commit `f96994ba`、`24298ccd`、`9fc58e02`）。
- @mentions：Routa 文档未突出 @mention 触发体系；Kanban/Task 通过 MCP 工具 `create_card`、`update_card`、`search_cards` 协作（`src/core/mcp/mcp-tool-executor.ts:1434`–`1523`）。Team 通过 `delegate_task_to_agent` 派发（`docs/design-docs/execution-modes.md:115`–`125`）。
- 技能：`src/core/skills` 提供 `skill-loader`、`skill-registry`、`skill-resolver`；CLI `routa skill` 发现/重载技能（`packages/routa-cli/README.md` 命令总览）。
- Notes：CRDT 文档管理器与 CRDT note store，支持协作知识捕获（`src/core/notes/crdt-document-manager.ts`、`crdt-note-store.ts`；`docs/ARCHITECTURE.md:148`）。

### 5.5 多智能体

- Team 模式：
  - lead 是 ROUTA 角色的专门 specialist（`team-agent-lead`），prompt 明确要求规划、委派、协调、验证，绝不自己实现（`docs/design-docs/execution-modes.md:106`–`113`）。
  - lead 使用真实子会话，要求 `delegate_task_to_agent` 让工作可见于 Team UI；保持小活跃波次、隔离重叠 scope、完成前重新验证（`docs/design-docs/execution-modes.md:115`–`125`）。
  - Team 页面建模顶层 run 与后代计数，说明 Team 是会话树而非单线程（`docs/design-docs/execution-modes.md:127`）。
- Specialist：
  - 核心 `routa`、`crafter`、`gate`、`developer`；team 目录含 `agent-lead`、`backend-dev`、`frontend-dev`、`code-reviewer`、`qa`、`researcher`、`ux-designer`、`operations`、`general-engineer`（`resources/specialists/team/`）。
  - 泳道 specialist：`backlog-refiner`、`todo-orchestrator`、`dev-executor`、`review-guard`、`done-reporter`、`blocked-resolver`、`pr-publisher`、`qa-frontend`、`flow-analyst`（`resources/specialists/workflows/kanban/`）。
  - 工具 specialist：`agents-md-auditor`、`feature-tree-orchestrator`、`fitness-ui-builder`、`harness-build/test`、`ui-journey-evaluator` 等（`resources/specialists/tools/`）。
- 委派深度：`src/core/orchestration/delegation-depth.ts` 限制委派深度；`task-block-parser.ts` 解析任务块（`src/core/orchestration/`）。
- 传输：Kanban automation step 支持 `acp` 或 `a2a` transport；A2A step 可指定 `agentCardUrl`、`skillId`、`authConfigId`（`src/core/models/kanban.ts:20`、`:40`–`50`）。
- 共享会话：`src/core/shared-session` 提供多用户/多 agent 协调，事件广播与 prompt 派发（`docs/ARCHITECTURE.md:152`）。
- 并行/工作树：
  - 每 board 队列有并发上限；Dev 会话可 watchdog/ralph 监督恢复（`docs/design-docs/execution-modes.md:83`–`84`）。
  - Worktree 是 workspace+codebase 绑定的执行副本；`src/core/kanban/task-worktree-truth.ts` 解析任务真实工作树（`docs/ARCHITECTURE.md:106`–`111`；`src/core/kanban/task-worktree-truth.ts`）。
- 调度/原因码：未发现统一 dispatch reason code；Kanban 过渡门禁 issue code 为 `required_checklist | required_human_approval | validator_command`（`src/core/kanban/transition-gates.ts:5`）。

### 5.6 工具面

- Agent 执行：ACP 是主要执行传输；provider 包括 Claude Code、OpenCode、OpenCode SDK、Codex；provider 输出经 adapter 归一化为统一 session updates（`docs/ARCHITECTURE.md:195`–`218`；`docs/configuration/providers-and-models.md:9`–`15`）。
- 协议面：REST、MCP、ACP、A2A、AG-UI、A2UI、SSE（`docs/ARCHITECTURE.md:181`–`191`）。
- MCP：
  - `/api/mcp`、`/api/mcp/tools` 工具执行与协作 agent 能力（`docs/ARCHITECTURE.md:186`）。
  - Kanban MCP 工具：`create_note`、`create_card`、`update_card`、`move_card`、`search_cards`、`decompose_tasks`（`src/core/mcp/mcp-tool-executor.ts:1064`、`:1434`–`1523`）。
  - 设置页 `/settings/mcp` 管理 MCP server；`/settings/mcp` 与 `mcp-server-profiles.ts`（`src/app/settings/mcp`）。
- 终端/文件/Git：由 ACP provider 的 CLI 工具提供；Routa 自己提供 codebase/worktree、文件搜索、Git refs/commit 检查（`README.md:141`–`147`）。
- 浏览器：未发现 Routa 自带浏览器工具；`ui-journey-evaluator` 等 specialist 可能调用底层 provider 的工具，但没有独立浏览器 API（标记为未发现）。
- Office/Canvas：`@autodev/office` npm 包与 `office-render` 支持 docx/xlsx/pptx 的预览、canvas、编辑、演示；0.19.0 大量条目（`docs/releases/v0.19.0-changelog.md:7`–`120`；`packages/office/README.md`、`packages/office-render/README.md`）。
- Hooks：
  - `tools/hook-runtime` 是本地 Git Hook 运行时，把 Fitness Gate、Review Trigger 接入 `pre-commit`/`pre-push`；Entrix 定义 Gate，Hook Runtime 执行 Gate（`tools/hook-runtime/README.md:1`–`45`）。
  - `harness-monitor` 通过 hook 模板采集 agent 事件，安装到 `$HOME/.codex/hooks.json`、`.git/hooks/post-commit/post-merge/post-checkout` 等（`crates/harness-monitor/README.md:100`–`121`）。
- 插件/技能：`src/core/skills`（见 5.4）；没有类似 dsh 的通用插件市场，主要是 specialist YAML 与 MCP server。
- 调度/自动化：`/settings/schedules`、`/settings/webhooks`、`/settings/workflows` 页面；`src/core/scheduling`、`webhooks`、`workflows`、`background-worker`；CLI `routa workflow validate/run`（`src/app/settings/*`；`packages/routa-cli/README.md`）。
- 仓库导入：GitHub 仓库可作为虚拟 workspace 导入，浏览 tree/files/issues/PRs/comments（`README.md:144`）。
- 扫描：`routa scan` 做仓库静态/安全扫描（`packages/routa-cli/README.md` 命令总览）。

### 5.7 评审与验证

- 三层 Review Gate（README 明确）：
  1. Harness Monitor 回答“发生了什么”：traces、变更文件、命令、git 状态、归因。
  2. Entrix Fitness 回答“应该是什么”：硬门禁、证据要求、文件预算/策略检查。
  3. Gate Specialist 回答“卡片能不能动”：验证验收标准并路由到 Done、Dev 或人工升级。
  （`README.md:54`–`62`）
- Kanban 泳道证据契约：Backlog 产出 canonical YAML story；Todo 追加 Execution Plan/Key Files/Dependency Plan/Risk Notes；Dev 追加 Dev Evidence（变更文件、工作总结、测试、逐 AC 验证、注意事项）；Review 追加 Verdict/逐 AC 状态/issues/notes；Done 追加 Completion Summary；Blocked 追加 Blocker Analysis（`README.md:95`–`113`）。
- 过渡门禁：review/done 默认要求 artifacts 与 delivery readiness；done 默认要求 committed changes、clean worktree、PR-ready branch（`docs/design-docs/execution-modes.md:77`–`84`）。
- Canonical story 契约：YAML story 含 problem_statement、user_value、acceptance_criteria、constraints、dependencies、out_of_scope、INVEST 六项；解析器校验类型与必填（`src/core/kanban/canonical-story.ts:5`–`40`）。
- Review 分析：多阶段 review，finding 有 CRITICAL/WARNING/SUGGESTION 与 confidence；校验器会过滤 test 文件中的 validation/error handling、lint 覆盖的 style、框架已处理的 XSS/body parsing 等（`src/core/review/multi-phase-review.ts:1`–`100`）。
- Harness Monitor：TUI 显示 Runs、Git Status、Run Details、Preview、Fitness、Event Stream；能看活跃/空闲/进程扫描/未归因工作，脏文件与可能归属，Entrix 最新结果与慢检查（`crates/harness-monitor/README.md:1`–`50`）。
- Fitness/Entrix：`entrix run --tier fast|normal`、`--scope`、`--dimension`；`routa fitness fluency` 评估 Harness Fluency；`routa harness evolve` 做工程演进与 trace learning（`docs/fitness/README.md:1`–`80`）。
- Flow Ledger：聚合 lane sessions 与 handoffs，检测 bounce patterns、lane metrics、failure hotspots、handoff friction，并给出 guidance（`src/core/kanban/flow-ledger.ts:1`–`50`）。
- 用量/成本：未发现产品化的 token/费用统计 UI；有 OTel telemetry（`src/core/telemetry/node-otel.ts`、`tracing.ts`）与 task run ledger；标记为“未发现成本页”。
- 测试门禁：Entrix + hook runtime + review triggers；`docs/fitness/review-triggers.yaml`、`docs/fitness/runtime/hooks.yaml`（`docs/fitness/`）。

### 5.8 协作/共享/远程

- Workspace 是一级用户上下文：用户先按 workspace 导航，再进入 sessions/boards/notes/codebases/memories（`docs/ARCHITECTURE.md:96`–`104`）。
- 共享会话：多用户/多 agent 协调，事件广播与 prompt 派发（`docs/ARCHITECTURE.md:152`）。
- Notes：CRDT 实时协作（`docs/ARCHITECTURE.md:148`；`src/core/notes/crdt-*`）。
- A2A：`/api/a2a/*` agent-to-agent 互操作；AG-UI `/api/ag-ui` UI 流协议；A2UI `/api/a2ui/*` dashboard UI 协议；SSE 增量更新（`docs/ARCHITECTURE.md:181`–`191`）。
- 远程/部署：Web 自托管（Next.js），Desktop Tauri 本地优先；Docker compose 支持 Postgres profile；`crates/routa-server` 是完整本地协调运行时（`README.md:49`–`52`；`docs/ARCHITECTURE.md:251`–`264`）。
- 任务板：Kanban 是流程驱动面，不是唯一视图；Workspace 还有 overview、sessions、team、spec、feature-explorer、codebases 页面（`src/app/workspace/[workspaceId]/` 路由）。
- 移动端：未发现移动客户端；以 Web/Desktop/CLI 为主。

### 5.9 独特能力（带锚点）

1. **三种执行模式的设计化区分**：Sessions/Kanban/Team 的编排边界、质量形状与适用场景写成 durable design note，且与代码引用对齐（`docs/design-docs/execution-modes.md:13`–`140`）。
2. **泳道专家 + 证据递增**：同一张卡从 Backlog 到 Done 逐步追加 story YAML、执行计划、Dev Evidence、Review Findings、Completion Summary；下游 lane 明确不信任上游（`README.md:88`–`113`）。
3. **Review Gate 三层**：Harness Monitor（观察）+ Entrix（策略/证据）+ Gate Specialist（裁决）分工明确（`README.md:54`–`62`）。
4. **Kanban 门禁可执行**：required checklist、required human approval、validator command 三类门禁，blocking/warning 两种模式；validator 要求证据行同时含命令与通过字样（`src/core/kanban/transition-gates.ts:5`–`75`）。
5. **Dev 会话监督**：watchdog_retry / ralph_loop，含不活动超时、最大恢复次数、完成要求（turn_complete/completion_summary/verification_report）（`src/core/models/kanban.ts:12`–`16`、`:56`–`64`）。
6. **Harness Monitor TUI**：面向多 agent 并行时的操作员可见性，显示 run、脏文件归属、Entrix 阻塞、hook/git/watcher 事件流（`crates/harness-monitor/README.md:1`–`50`）。
7. **Flow Ledger 流程诊断**：bounce patterns、lane metrics、failure hotspots、handoff friction 与 guidance（`src/core/kanban/flow-ledger.ts:1`–`50`）。
8. **Office 渲染栈**：docx/xlsx/pptx 的 canvas/proto/wasm 预览、编辑、演示、公式与图表，0.19.0 的主要变更面（`docs/releases/v0.19.0-changelog.md:7`–`120`；`packages/office-render/README.md`）。
9. **协议面最广**：REST + MCP + ACP + A2A + AG-UI + A2UI + SSE 全部作为一等集成面（`README.md:52`；`docs/ARCHITECTURE.md:181`–`191`）。

### 5.10 最新版本亮点（v0.19.0）

官方 release notes/changelog 在 `docs/releases/`：

- 版本摘要：`v0.19.0` 包含从 `v0.18.1..ba25f12` 的 502 个非 merge commit（`docs/releases/v0.19.0-release-notes.md:5`；`docs/releases/v0.19.0-changelog.md:519`）。
- MiniMax provider 支持（`docs/releases/v0.19.0-changelog.md:7`，commit `c705c381`）。
- Kanban transition gates 扩展（`docs/releases/v0.19.0-changelog.md:8`，commit `5f650167`）。
- Session compaction / tool-call delta compaction：`fix: wire sqlite session history compaction`（`24298ccd`）、`fix: compact persisted tool call param deltas`（`9fc58e02`）、`fix: stream tool delta compaction batches`（`87472562`）、`fix: skip malformed session compaction payloads`（`43b30348`）。
- Office 渲染大版本：pptx/docx/xlsx 的 canvas、proto、wasm reader、批注/修订/表格/图表/条件格式/数据验证/切片器/演讲者备注/幻灯片控制等（`docs/releases/v0.19.0-changelog.md:9`–`120`）。
- Reasoning strategy memory 与 retrospective memory MCP 工具（`docs/releases/v0.19.0-changelog.md` 的 `expose reasoning memory mcp tools`、`add reasoning strategy memory` 条目）。
- Docker 运行时加入 `git` 与 `ca-certificates`（`docs/releases/v0.19.0-release-notes.md:12`、`:131`；`docs/releases/v0.19.0-changelog.md:111`）。
- Spec sources 面板内联文件预览（`docs/releases/v0.19.0-changelog.md` 的 `settings: add inline spec file preview to spec-sources panel (#539)`）。

### 5.11 未确认/边界

- 根 `CHANGELOG.md` 停在 `0.2.5`（2026-03-15），与当前 `v0.19.0` 不符；以 `docs/releases/v0.19.0-*` 为准。
- 未发现 archive 命令；session fork API 存在但产品交互未展开验证。
- 未发现文件级 rewind/checkpoint；有 fork、history compaction、worktree。
- 未发现 Routa 自带浏览器工具；agent 工具来自 ACP provider。
- 审批不是统一的 per-call 策略；主要是 prompt 契约、Kanban 门禁、Docker/sandbox 策略。
- 未发现 token/费用产品化统计；有 OTel 与 trace，但成本页未确认。
- `workspace_skills` schema 存在，但仓库自述 skills 作用域仍有 transitional 部分（`docs/design-docs/workspace-centric-redesign.md:64`–`78`）。

---

## 6. 横向对比与选型提示

### 6.1 “编码模式 vs 工作/通用模式”对照

| 工具 | 显式开关/模式 | 语义 |
|---|---|---|
| dsh | Web “Coding Tools” + Agent preset（Standard/PTC/Minimal/Creator/Cordis）+ Plan/Sandbox/Approval 三旋钮 | 同一个 harness 兼作通用助理与编码工作台；Coding Tools 控制诊断视图、预设、变更卡片、HTML 预览；Plan 是软指导，Sandbox/Approval 才是强制。 |
| dsh-TUI | 内核（DSH/Claude/Codex）+ `/preset`（standard/ptc/minimal/cordis/liangshen）+ Shift+Tab（default/plan/full） | 三种编码内核统一界面；Minimal preset 是“极简工具集”，Minimal UI 只是显示开关；Shift+Tab 是权限/计划三档。 |
| multica | Chat / Issue / Autopilot（Create issue vs Run only） | 产品本身是工作管理面；编码由底层 CLI 执行；Chat 是轻量私有对话，Issue 是正式协作单元，Autopilot 是自动化触发器。 |
| routa | Sessions / Kanban / Team | 三种都是软件交付执行面；差别在编排边界：单线程、流程状态、协调 lead。没有独立的“通用工作”模式。 |

### 6.2 多智能体能力强度

| 能力 | dsh | dsh-TUI | multica | routa |
|---|---|---|---|---|
| 子代理 | 强：subagent + 控制工具 + 深度/工具过滤/persona | 中：展示 DSH 子代理，TUI 自身不编排 | 弱：以 issue/mention 触发独立 agent，无子代理树 | 强：Team lead + specialist + 真实子会话 + 委派深度 |
| 团队/角色 | Agent Teams（实验）+ Workflow 脚本 | 未见 TUI 团队 UI | Squad（leader 路由） | Team + 核心角色 + 泳道专家 |
| Worktree | 实验性 `create_worktree` | 未见 | 本地目录 worktree 并发 + 分支所有权 | Codebase/Worktree 一等对象 |
| 并行会话 | 多 Session + jobs | 挂载集多会话 + 多 TUI | 多 run 并发（daemon 20 / agent 6） | 多 Session + board 队列 + Team 子会话 |
| 编排 | Workflow 脚本（模型写） | 无 | Squad leader prompt + Autopilot | Kanban 泳道自动化 + Team lead + Workflow |

### 6.3 评审/验证强度

| 工具 | 评审形态 | 强制门禁 | 证据/审计 |
|---|---|---|---|
| dsh | Plan review + approval + deliverables；GitHub review overlay | 沙箱/审批可强制；无测试门禁 | 事件日志、审批审计、deliverables 快照、token meter |
| dsh-TUI | 计划问卷 + diff 工具卡 + Codex `/review` | 权限三档；无测试门禁 | 会话日志、/cost、/status、完成通知 |
| multica | `in_review` + PR CI/mergeability + merge→done | PR 合并状态可驱动 issue 状态；无独立测试门禁 | Execution log/transcript、失败码、usage |
| routa | Review Gate 三层 + 泳道证据契约 + Kanban 门禁 | required checklist/human approval/validator command；done 要求 committed/clean/PR-ready | Harness Monitor、Entrix、trace、flow ledger、artifacts |

### 6.4 一句话定位

- **deepseek-harness**：插件化、事件溯源的通用 agent harness，强在运行时架构、权限/沙箱分离、Agent Teams 与 Workflow 脚本；自带 Web/Desktop/CLI/SDK 多入口。
- **dsh-TUI**：DSH 生态里体验最完整的终端客户端，强在多内核、会话挂载、rewind/fork/btw 与终端表现；本身不定义新的 agent 能力。
- **multica**：把 coding agent 变成看板队友的工作管理平台，强在 issue/run 生命周期、Squad 路由、跨 26 种 CLI 的 runtime 与 review gate；编码能力完全外包给底层 CLI。
- **routa**：把“交付流程”做成可执行看板的协调平台，强在泳道专家契约、Review Gate 三层、Harness Monitor/Entrix 与 Office/协议面；执行模式设计最明确。

---

## 7. 证据索引（按工具）

### deepseek-harness

- 产品与版本：`README.md:7`、`:13`、`:24`、`:27`；`package.json`；`docs/cli-help.md:20`–`201`。
- 会话：`docs/subsystems/session.md:5`、`:677`、`:681`；`docs/subsystems/web-client.md:42`、`:52`；`packages/client/ui-workspace/src/client/index.ts:296`–`299`；`packages/api/session-controller/README.md:54`、`:57`。
- 审批/沙箱：`docs/subsystems/approval.md:5`、`:31`–`39`；`docs/subsystems/sandbox.md:11`、`:20`；`docs/subsystems/permission-presets.md:11`；`packages/experimental/auto-review/README.md:12`、`:48`；`docs/subsystems/plan.md:5`、`:33`、`:35`。
- 上下文：`packages/context/agent-instructions/README.md:30`、`:34`、`:38`；`packages/context/file-reference/README.md:12`、`:32`；`docs/subsystems/compaction.md:5`–`31`；`docs/subsystems/lsp.md:17`；`docs/subsystems/session-query.md:5`；`docs/subsystems/skills.md:5`。
- 多智能体：`docs/subsystems/subagent.md:5`、`:15`、`:184`；`docs/subsystems/agent-team.md:7`–`56`；`docs/subsystems/workflow.md:5`–`47`；`docs/subsystems/worktrees.md:5`、`:11`；`docs/subsystems/working-directory.md:5`。
- 工具：`docs/tool-catalog.md:55`–`2749`；`docs/subsystems/mcp.md:5`；`docs/subsystems/browser-use.md:11`–`15`；`docs/subsystems/computer-use.md:5`–`11`；`docs/subsystems/claude-code-mods.md:5`–`25`；`docs/subsystems/schedule.md`；`docs/subsystems/jobs.md:5`–`17`。
- 评审/协作：`docs/subsystems/deliverables.md:5`；`docs/user/guide/github-review.md:5`；`docs/subsystems/token-meter.md:5`；`docs/subsystems/ssh.md:5`；`docs/subsystems/webhook.md:5`；`docs/cli-help.md:171`–`201`。

### dsh-TUI

- 产品与版本：`README.md:20`–`48`、`:142`–`151`、`:195`、`:235`；`package.json`；`docs/README.md`。
- 会话：`docs/user-guide.md:301`–`318`、`:409`–`421`、`:426`–`436`；`README.md:41`–`44`、`:161`–`176`、`:337`–`341`；`docs/session-mount-runtime.md:33`、`:42`、`:251`、`:275`。
- 模式/审批：`src/sessionModes.ts:16`–`19`；`docs/user-guide.md:309`–`310`、`:350`、`:452`、`:456`、`:461`–`467`、`:568`；`README.md:434`–`438`。
- 上下文：`docs/user-guide.md:326`、`:339`、`:341`、`:405`、`:468`–`489`；`README.md:31`、`:34`–`38`。
- 多智能体：`docs/user-guide.md:288`、`:303`、`:334`、`:470`；`README.md:44`；`docs/foreign-session-tabs-design.md:5`–`15`。
- 工具：`docs/user-guide.md:335`、`:344`、`:346`；`README.md:199`–`207`、`:249`–`263`、`:333`–`337`。
- 评审/协作：`README.md:32`、`:181`；`docs/user-guide.md:329`–`333`、`:519`–`557`；`docs/vscode.md:5`–`25`；`src/usageStats.ts:1`–`10`。
- 发布：`tui-profile/CHANGELOG.md:5`、`:13`–`30`；`git log v0.14.0..v0.15.0`。

### multica

- 产品与版本：`README.md:11`–`17`、`:107`–`140`、`:163`–`184`、`:210`–`216`；`apps/docs/content/docs/concepts.mdx:9`–`43`；`CLI_AND_DAEMON.md`。
- Issue/任务：`apps/docs/content/docs/issues.mdx:10`–`113`；`apps/docs/content/docs/tasks.mdx:12`–`168`；`apps/docs/content/docs/squads.mdx:5`–`85`。
- 审批/安全：`apps/docs/content/docs/security-model.mdx:10`–`49`；`apps/docs/content/docs/agents.mdx:47`–`57`；`apps/docs/content/docs/members-roles.mdx:10`–`35`；`apps/docs/content/docs/autopilots.mdx:26`–`35`。
- 上下文：`apps/docs/content/docs/agents.mdx:12`–`22`；`apps/docs/content/docs/skills.mdx:12`–`98`；`apps/docs/content/docs/projects.mdx:38`–`44`；`apps/docs/content/docs/project-resources.mdx:5`–`92`；`apps/docs/content/docs/providers.mdx:65`–`100`；`apps/docs/content/docs/mentioning-agents.mdx:9`–`90`。
- 工具：`apps/docs/content/docs/cli.mdx:178`–`330`；`apps/docs/content/docs/channels.mdx:5`–`50`；`packages/plugin-sdk/README.md:5`–`70`。
- 评审/协作：`apps/docs/content/docs/github-integration.mdx:45`–`101`；`apps/docs/content/docs/inbox.mdx:10`–`46`；`apps/docs/content/docs/chat.mdx:9`–`62`；`server/internal/dispatch/reason.go:19`–`80`。
- 发布：`apps/web/features/landing/i18n/en.ts:526`；`apps/web/features/landing/i18n/zh.ts:511`。

### routa

- 产品与版本：`README.md:23`–`52`、`:138`–`147`；`package.json`；`docs/ARCHITECTURE.md:29`–`191`；`docs/product-specs/FEATURE_TREE.md:1`–`80`。
- 执行模式：`docs/design-docs/execution-modes.md:13`–`140`；`resources/specialists/core/*.yaml`；`resources/specialists/workflows/kanban/*.yaml`。
- 任务/看板：`src/core/models/task.ts:11`–`32`；`src/core/models/kanban.ts:11`–`120`；`src/core/kanban/transition-gates.ts:5`–`75`；`src/core/kanban/canonical-story.ts:5`–`40`；`src/core/kanban/flow-ledger.ts:1`–`50`。
- 上下文：`docs/design-docs/core-beliefs.md:13`–`43`；`src/core/mcp/reasoning-memory-tools.ts:1`–`60`；`src/core/storage/history-compactor.ts`；`src/core/notes/crdt-*`。
- 多智能体：`docs/design-docs/execution-modes.md:102`–`140`；`src/core/orchestration/delegation-depth.ts`；`docs/ARCHITECTURE.md:120`–`152`。
- 工具/协议：`docs/ARCHITECTURE.md:181`–`191`；`src/core/mcp/mcp-tool-executor.ts:1064`–`1523`；`src/core/mcp/tool-mode-config.ts:1`–`17`；`tools/hook-runtime/README.md:1`–`45`；`crates/harness-monitor/README.md:1`–`121`。
- 评审/验证：`README.md:54`–`113`；`src/core/review/multi-phase-review.ts:1`–`100`；`docs/fitness/README.md:1`–`80`；`docs/releases/v0.19.0-release-notes.md:1`–`20`；`docs/releases/v0.19.0-changelog.md:1`–`120`。
- 发布：`docs/releases/v0.19.0-release-notes.md:5`；`docs/releases/v0.19.0-changelog.md:519`。
