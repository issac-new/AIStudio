# 主流 Coding Agent 上游参考源台账

本文是 `upstream/` 下 7 个主流 coding 工具仓的长期跟进台账。程序总目标：**以 zcode 为基底，对其余工具做源码级的参考复用与重构，最终融合为一个全新的编码工具（暂名 Ycode，2026-09-25 用户裁定）**。IDE 工作台不是编码工具聚合器，不以"兼容/托管更多编码工具"为目标；产物须与 SwarmStudio 驾驶舱"沟通协作"流畅衔接、符合传统研发人员便利的使用习惯。参考复用持续落在 SwarmStudio IDE 工作台（overlay `/ide`）与 zcode 底座 patch 层。首次克隆时间 2026-09-21，全部匿名 HTTPS 直连成功（未用 token，未用代理）。

写给后续做吸收轮次的实现者：先读本文的许可约束与各仓画像，再进对应仓做源码分析；分析产出放 `docs/upstream-analysis/<repo>.md`。

## 一、总览

| 本地目录 | origin | 默认分支 | 克隆时 HEAD | 最新 tag | 许可 | 体积 |
|---|---|---|---|---|---|---|
| `upstream/codex` | openai/codex | main | a866315 (2026-09-21) | rust-v0.156.0-alpha.14 | Apache-2.0 | 739M |
| `upstream/zcode` | zai-org/zcode | main | 872ad96 (2026-09-21) | 无 tag | Apache-2.0 | 125M |
| `upstream/kimi-code` | moonshotai/kimi-code | main | 65ae3e3 (2026-09-20) | @moonshot-ai/kimi-code@2.0.2 | MIT | 205M |
| `upstream/minimax-code` | MiniMax-AI/minimax-code | main | 89c930a (2026-09-21) | v0.5.0 | MIT（见下方约束） | 99M |
| `upstream/deepseek-harness` | deepseek-ai/deepseek-harness | **master** | ddefc45 (2026-09-17) | dsh-v0.1.6-alpha.2 | MIT | 336M |
| `upstream/dsh-TUI` | ccch1mneyyy/dsh-TUI | main | 7068cc2 (2026-09-21) | v0.10.2 | MIT | 38M |
| `upstream/claude-code` | anthropics/claude-code | main | 7974a70 (2026-09-20) | v2.1.278 | **专有（非开源核心）** | 50M |
| `upstream/multica` | multica-ai/multica | main | f41fae6 (2026-09-22) | 无 tag | 见 LICENSE | 94M |
| `upstream/routa` | phodal/routa | main | e48861a (2026-09-22) | 无 tag | 见 LICENSE | 43M |

合计约 1.75G。与 swarm-yuan 台账交叉验证：claude-code v2.1.278 与该侧 live 基线完全一致，codex main 已进 0.156 alpha（live 为 0.155.1），说明本次克隆均为当日最新。multica / routa 于 2026-09-22 补入（用户指令：驾驶舱「沟通协调」+「IDE 工作台」两模块的分布式 agent 与人机协作统筹完善），此前十源调研未覆盖，属补漏。

## 二、各仓画像与价值点

### zcode（基底）
2026-09-21 当天以 "feat: open source" 提交开源的**完整 AI 编程工作台**：Electron 桌面（`apps/desktop`）、浏览器工作台（`apps/web`，dev 端口 5173 + 后端 3030）、终端 Agent CLI（`apps/zcode-cli`，同时也是 Desktop/Web 的 Agent 运行时）三入口，共享 `packages/{server, services, shared, ui, provider, provider-node, rpc, model-option-map}`。技术栈 Node 24.14 + pnpm 10.33 + Electron。

对 IDE 工作台的直接价值：`apps/web` 与我们的 `/ide` 是同构竞品（会话、计划、子代理、工作流、技能），可整仓对照 UI 信息架构；`packages/rpc` 是前后端协议的单一事实源样板；`apps/zcode-cli` 内含 skills-lock.json 驱动的技能体系。另有 `apps/zcode-cua`（computer use）。作为基底，M1 优先测绘此仓。

### codex
Rust 核心（`codex-rs`）+ TS CLI（`codex-cli`）+ `sdk/`，Bazel 构建，Apache-2.0。价值点：IDE 集成协议（VS Code 扩展走的 app-server JSON-RPC 通道）、审批与沙箱模型（Seatbelt/Landlock）、TS SDK。当日 HEAD 即「TUI 独立渲染开关：Mermaid/数学/表格」——消息渲染分项开关这个产品细节值得搬。

### kimi-code
Moonshot 官方 CLI（`kimi`），单二进制分发、毫秒级 TUI 启动。价值点：**视频输入**（录屏/演示片段直接投喂 agent）、**对话式 MCP 配置**（`/mcp-config`，不手改 JSON）、**插件市场 + 前置信任等级**。这三点对工作台的附件能力、MCP 管理页、插件生态都有直接参照。

### minimax-code
MiniMax 官方终端 agent（`mcode`），v0.5.0。许可注意：`LICENSE-STATUS.md` 声明 first-party 默认 MIT 但**部分目录许可不同，拷代码前必须查该文件**。价值点：多模态工具链（搜索/插件与代码同一工作流）、TUI scrollback 重建（当日 HEAD 提交）、自带模型路由（MiniMax 账号或自带模型）。

### deepseek-harness
DeepSeek 官方 harness（`dsh`），**everything-is-a-plugin 架构**，基于 Cordis（有论文：时空可组合编程范式，arXiv:2608.25512），`npx @deepseek-ai/dsh web` 起 Web UI（:3080）。开发者预览期，官方预告会有破坏性变更。价值点：与 SwarmStudio 同为 web 工作台，其插件化内核 + client/host 双端拆分（tsconfig.base.client/host）+ python 工具链（pytest 侧）可直接对比借鉴。

### dsh-TUI
社区为 dsh 做的终端界面插件（ccch1mneyyy 个人仓，MIT，被 dsh 官方收录）。**纯插件挂载、零核心改动**本身就是架构样板。价值点全部是 UX 概念，可直接搬到 IDE 工作台：双击 Esc 时间回溯（≈ checkpoint scrub）、上下文进度条（context 水位）、TPS/缓存命中率仪表、会话 fork 与工作区分组管理、mermaid Unicode 字符图渲染、终端内图片预览（Sixel/Kitty）。

### claude-code（注意：非开源核心）
anthropics/claude-code 仓库是公开仓但**不是开源核心**：LICENSE.md 为 © Anthropic PBC 专有许可（Commercial Terms of Service），CLI 本体以原生二进制分发，仓库内只有：18 个官方插件源码（code-review / feature-dev / frontend-design / pr-review-toolkit / security-guidance / hookify 等）、hook 与网关示例（agents-md、diff、sec-default、telemetry、types）、仓库治理工具（mods/）、CHANGELOG。**用途定位：功能演进雷达（CHANGELOG 已由 swarm-yuan 侧跟踪版本）与插件设计参考；禁止将其代码拷入 overlay**。

### multica
multica-ai/multica（Go 后端 + Svelte 前端的多 agent 协作系统）。价值点全部是**分布式 agent 与人机协作的异步语义**：① 评论即 A2A 总线（`@agent`=服务端为该 agent enqueue run，`@member`=进人 inbox，`@squad`=触发 leader 协调，全程留痕可审计）；② 认领 SQL 单语句四围栏（(task,agent) 串行 + FOR UPDATE SKIP LOCKED + 在线新鲜度 + 优先级，防同人双跑）；③ dispatch reason code 词汇表（queued/coalesced/runtime_offline/self_trigger_suppressed…原样透传到评论旁 chip，「为什么没跑」一眼可见）；④ squad leader 协调协议（leader 被注入操作协议：按 roster 选人、mention 委托、每轮必录 action/no_action/failed 评估）；⑤ 人机分工状态门禁（agent 只能推到 in_review，done 留人）；⑥ invoke 权限按链顶人类判定（防 agent 组团越权）；⑦ 会话续接安全分档（resume-unsafe 失败黑名单强制新会话但保留 work_dir）。

### routa
phodal/routa（TS/Next 的多 agent 协作系统）。价值点全部是**看板即协调总线与交付流水线**：① 每列配独立 specialist 自动化 steps + entry/exit 触发 + autoAdvance（列不只是状态桶）；② 列移动即事件即触发（COLUMN_TRANSITION 驱动列 agent + 每 board 并发闸默认 1 + 排队 reconcile——loop dispatcher 缺的看板级并发护栏）；③ 任务=证据累积对象（laneSessions/laneHandoffs/deliverySnapshot/verificationVerdict 全落任务字段，卡详情证据面 schema 蓝本）；④ 流转门禁四件套（requiredHumanApproval/requiredChecklist/validatorCommand/gateMode，服务端 PATCH 强制，人审门嵌入任务流转）；⑤ 委派护栏与回收兜底（深度上限 2 + auto-report/文件 watcher/session-end 三兜底 + wakeParent 续话）；⑥ 执行租约分布式（ownerInstanceId + 300s 租约 + runner 反代 + 重启按租约接管，多实例协同最小充分机制）；⑦ 共享会话（invite token + host/collaborator/viewer × 四档模式 + prompt 审批流，多人共驾 agent 会话）。

## 三、跟进机制

同步（建议每轮吸收前跑一次，保持基线新鲜）：

```bash
cd /Volumes/nvme2230/lab/ncwk
for d in codex zcode kimi-code minimax-code deepseek-harness dsh-TUI claude-code; do
  git -C upstream/$d pull --ff-only
done
```

注意三点：deepseek-harness 默认分支是 master 不是 main；zcode 尚无 tag，用 HEAD 提交号跟踪版本；claude-code 的 tag（v2.1.278）与 swarm-yuan live 基线对齐，两侧台账宜联动更新。

纪律：`upstream/` 只读，只 pull 不改；一切吸收都经 `overlay/` 的 patch/组件实现（遵守工作区 AGENTS.md）。

## 四、执行记录

### 2026-09-21 首轮 M1-M3

- **M1 zcode 测绘**：完成，产出 `docs/upstream-analysis/zcode.md`。两个修正：zcode 无 apps/web（工作台 UI 在 `packages/ui`，React+zustand，tabStore 导航）；parity 主干已平手，真实差距集中在遥测颗粒度（G1-G5/G7-G8）与 MCP 配置体验（G6）。
- **M2 遥测簇（dsh-TUI 移植）**：完成，合 main 8334c0c。IDE 状态栏新增上下文水位条（60/80 阈值对齐 ChatInput）、TPS 仪表（burst 解码折页 + chars/4 实时估计 + usage 结算，样本 FIFO 500 + 火花线 12 点）、会话级缓存命中率（SessionSummary 口径，轮结束刷新）。i18n patch 336。15 专测全绿。**已知限制**：TPS 无服务端首 token 时刻，轮均值为近似（burst 间隙已剔除、TTFT 已排除，轮内残余间隙并入分母诚实低估）；缓存命中非实时（socket 不推 cache 字段）。
- **M3 对话式 MCP 配置（kimi 范式移植）**：完成，合 main 12b0ec9。kimi 的 `/mcp-config` 本质是 markdown 提示词资产 + 普通代理回合（无专用写工具，文件编辑审批门即确认门）。我方落地：`utils/mcpConfigPrompt.ts` 引导提示词（多底座裁剪：codex/claude/dsh 配置文件落位 + 工作台自身 MCP 引导去管理页不许 curl 直改）+ `IdeMcpPane` 状态页签（连接点/传输/工具数/错误行，fetchMcpServers 同源）+ 命令面板 `cmd:mcp-config`。i18n patch 339。15 专测 + 全量 1948 绿。**未移植**：needs-auth OAuth 合成工具（后端无此通道，G6 余项）。
- **验证口径**：两轮均以 vitest 为准（1948 全绿）。浏览器热更走查前期两次被并行会话的 upstream 树竞争阻断，09-21 晚补齐收口：活页 DOM 真值 `默认工作区 | 158k/256k 62% | ▄ | 1 t/s | 空闲`（`http://localhost:8649/#/ide`，上下文水位条 + TPS 仪表 + 火花线均实锤上屏）；缓存命中段按 `cache_read/(input+read+write)` 口径（`overlay/custom/client/ide/utils/metrics.ts:45`）由服务端会话用量表结算——walkthrough 会话 mu42vbhkx9uvfp 实测 input 184060 / cache_read 8960 ≈ 4.6%，段位渲染条件 `cacheHit != null` 已由 15 专测断言。M3 同轮走查另实锤 MCP 页签 5/5 服务器连接、提示词注入与 agent 真实运行。
- **并行会话协作记录**：patch 编号 337/338 被并行会话（SitDetailPanel 词表）在途占用，我方 339 已验证可在其后干净套用（共享树实测 336→337/338→339 顺序无冲突）；他们合并时 series 尾部追加区可能有文本冲突，逐行保留即可。

### 2026-09-21/22 M4 全量普查轮（十源穷举）

对全部参考对象完成两轮制普查（首轮特性面 + 二轮表面穷举枚举），产出 10 份文档：`upstream-analysis/` 下 zcode（M1+M4 补充，39 未迁移项）、codex（235 行，167 协议方法/62 slash/90 配置键枚举）、codex-product（ChatGPT/IDE 产品面 30 页）、kimi（205 行，43 slash/31 工具/20 hook 事件）、minimax-code（182 行，51 slash/37+18 工具全量）、dsh-TUI（153 行）、deepseek-harness（160 行）、claude-code（259 行，全量 CHANGELOG + 14 官方文档页）、qoder（34 页官方文档）、antigravity（36 页）。关键定论：zcode **非全量迁移**（主干平手外尚有 39 项，见 zcode.md §六）；zcode 与 dsh 均无模型价目表（成本估算需自建价目资产）；claude-code 仓库实为 13 插件（台账初记 18 已更正）；Antigravity "Deductive/Inductive Verification" 无一手来源（已在文档标注）。

### 2026-09-21/22 M5 实现轮 R1（合 main 7ffe1b0）

遥测与用量深水区五件套：G4 构成分解（`utils/contextBreakdown.ts`，dsh 口径四段+推算桶，消息无计数时 chars/4 诚实标估算）、G8 每轮用量（patch 340：`GET /api/studio/sessions/:id/usage/rounds`，usage-store 按 run_id 聚合多 source 行）、G7 热力图（84 天 + 连续天数，复用既有 `/usage/stats` by_day）、低余量主动提醒（min(20k,10%窗) 阈值 + 5% 迟滞 toast 一次制）、成本估算（`utils/modelPricing.ts`，价目实抓锚定 platform.claude.com 与 developers.openai.com；DeepSeek 超时/GLM 页无数字未收录→不显示金额）。落点 `IdeMetricsPopover.vue`（状态栏遥测簇点击展开）。守门 17 专测 + 全量 199 文件 1965 测绿；浏览器走查实锤（构成四段/两轮真实数据 k3 158k+glm-5.3/84 格热力图/1-day streak/×关闭）。**已知限制**：构成推算桶在客户端仅加载部分消息时偏大（升级路径=hermes 产 span，R5+）；低余量 toast 未做活页触发实测（单测覆盖逻辑）；vite 并行会话树竞争重启一次后恢复走查。

### 2026-09-22 技术债闭环：ensure-injected 差量根治（合 main 47ebbec）

336-338 静默跳过的根因不在 inject.mjs applyPatches（其失败路径必有 FAILED 日志），而在 `ensure-injected.mjs`（dev/build 前置钩子）：只看 manifest 存在 OR cockpit 路由在位即 exit(0)，不比对 series 与 manifest 差量。根治：差量非空打印清单并自动补套（hermes-agent 前缀路由与 inject.mjs 同步），成功回写 manifest、失败 exit(1)；实测 280→282 闭环 + 4 守门断言防回退。今后 series 追加新 patch 后 `npm run dev` 即自动上树，无需再手动 apply。

### 2026-09-22 M5 实现轮 R2-R5（四轮全合 main，2001 全绿）

- **R2 审批与会话管理（010af1d）**：批准即学习（codex session 档 + minimax 五档宽度自动推导；MessageList patch 342 发 `overlay:approval-decision` CustomEvent，无监听退化为直接响应）；子代理反注入（claude-code 2.1.277/2.1.210：`utils/subagentGuard` 七类指纹扫描 + 名册来源徽标）；会话 recap（CC 2.1.108：切回旧会话回笼摘要横幅，走查实锤内容+×闭环）；runaway-guard（minimax 六信号前端版：同工具同参/同错误/高频/长静默/风暴/复读，toast 一次/轮）。**走查摸清现状三项按实调整**：审批门已有 once/session/always/deny 四档、`/compact` 已有、无子代理插话通道（steer 归 R5 标记）。
- **R3 工件与评审（292ed22）**：轮结果卡 `IdeRunResultCard`（codex-product：时长+验证 bullet+per-turn 文件变更 digest，复用 `workspace_run_changes` 只读聚合）；/review 评审模式（`utils/reviewPrompt` 只读三级严重度提示词 + 命令面板 cmd:review）；计划工件评审化（IdePlanFloat 进度条 + codex 三选一门：继续实施/清空重来/仅留档，提示词引导+审批门裁决）。**默认工作区无 Git 域时结果卡按设计隐藏**（走查确认 R1 面板无回归）。
- **R4 入口与生态（af3725f）**：hooks 只读面板（复用既有 `GET /api/hermes/config?section=hooks` 零 patch；claude-code hooks 管理入口语义）；模型切换器（antigravity：会话内切换+粘性，`switchSessionModel` 持久化，global codingAgent 会话诚实禁用）；活动收件箱（CC 通知耗时 + codex-product 三态：运行/待我/完成，徽标=待我+未读完成）；终端 actions（codex-product 项目级一键命令：工作区级 localStorage + `overlay:terminal-action` 事件 + panel `writeCommand` 三段链）。**走查摸清三项≈已具备**：slash 输入触发（ChatInput `/`+技能选择器）、技能 CRUD 数据面（`fetchSkills/toggleSkill` 被 slash 用）、会话搜索含消息内容（`searchSessions` LIKE title/preview/content）；ask_user clarify 选项钮≈已具备。
- **R5 重型项（13c2d39）**：Repo Wiki 生成管线（Qoder 语义：多子代理 delegate_task 分派/增量更新跳过·补页·删页/引用注入 @wiki，`utils/wikiPipeline` + 面板管线按钮直接注入会话）；worktree 徽标（惯用根段识别，会话隔离显性化；编排归 loop 引擎域）；goal 预算浮层（zcode ZCodeTaskGoalStats：工具/迭代/上下文消耗面；预算引擎归后续）。**R5 引擎域项如实留档**：worktree 编排（loop worktree-manager 已有基建）、goal 预算引擎、needs-auth OAuth 通道、automations 编排、Plan Mode——均属 hermes/loop 后续轮次，不在工作台 patch 域。

四轮共新增 patch 342-346（server 340 在 R1）；守门测试累计 17+16+7+8+6=54 例（含 patch 漂移守卫与 series/manifest 登记断言）。

### 2026-09-22 追加轮：会话三段视图（0396c6e）+ R5 引擎域（be73a38）

- **会话三段视图（0396c6e）**：用户截图理念「进行中/已完成/工作空间」落地为 organize 之上的分桶层（active=流式或 24h 活跃；done=其余非归档；workspace 按 workspace 分桶强制 project 并隐藏 organize chip）。i18n patch 347。坑：IIFE 破坏 Vue 同步响应式追踪（探针实锤后改回 loadJson 直调）；并行会话裹改动入 stash 须恢复；ide-float 顺带根治基线 createRouter mock 缺口。
- **R5 引擎域（be73a38，已推）**：**调研摸清 hermes 已有 goal 引擎（GoalManager turn 预算+judge+auto-pause）/steer 通道/send_message/fork 全套——R5=暴露 UI+补缺口，非另起引擎**。① goal 预算引擎面板（utils/goalEngine 解析 /goal status 回执 turn 进度 + 80%warn/100%over 警示 + 命令驱动经 /goal 文本命令走 session-command→bridge→GoalManager）；② worktree 任务隔离编排（server 控制器 custom/server/controllers/ide/worktree.ts：loop WorktreeManager detached-HEAD 建/回收 + 会话绑定复用既有 workspace 端点经 HTTP 自请求——**custom 软链控制器不可相对 import upstream modules**；patch 348 挂载 + IdeWorktreeBadge 两态编排）；③ 子代理 steer UI（IdeSubagentsFloat idle 续话输入注入 /steer @id text）。i18n patch 349。**走查实锤：worktree create→绑定落库→回收→解绑全链路 curl 验证（端点 + sqlite workspace 字段 + git worktree list 三处对账）**。
- 累计 patch 340-349；守门 67 例；全量 2021 绿（R5 轮）→ 2061 绿（含并行 ia2 v13 轮 a72a124 合流后复核）。**R5 引擎域剩余项**：needs-auth OAuth 通道、automations 编排、Plan Mode——调研确认均已在 hermes 有引擎面（mcp OAuth 配置/hermes cron jobs/无 Plan Mode 引擎），OAuth 与 Plan Mode 需 hermes 侧新通道，留 R6。

### 2026-09-22 驾驶舱全功能回归（内置浏览器实测，含两缺陷根治）

分支收口：overlay 57 个已合本地分支全删（is-ancestor 验证），剩 main 单线，远端仅 main。回归用内置浏览器（gstack browse）对驾驶舱全功能实测：

| 功能区 | 结果 | 证据 |
|---|---|---|
| 权威快照（总览） | ✅ | 任务 4（Ready 2·Running 1·Blocked 1）/在线 1/机器 1/Gateway 健康计时/今日日程 |
| 注意力条跳转 | ✅ | 点击看板名→落 board 场景 |
| 视图切换（⇄） | ✅（修复后） | 协作↔IDE 工作台往返，board→ide.shell 到达 |
| 协作中心（/app） | ✅（修复后） | sc__body + 会话画布 + 聊天列 + flow nav + New session→composer |
| 任务决策（/app/board） | ✅ | 任务卡（投递）+ Boards 清单（Default/AI 前沿研究/数据分析研发）|
| 循环工程编排（/app/eng） | ✅ | New blank graph→画布编辑器（Try run/Import/Export/Save/Human approval）|
| 运行中心（/app/runs） | ✅ | Run Center 空态（无 loop 环境）/Live·All·Running·Awaiting·Completed 分桶 |
| 多语言切换 | ✅ | zh↔en 往返（Cockpit/驾驶舱 标签切换）|
| 顶栏日程/通知/用户 | ✅ | 日程按钮→弹出层（Sign Out 菜单）|

**回归实测暴露并根治两缺陷**（均合 main 3f919b1 已推）：
① **chat 命名路由缺失**（P1，协作/工作台/IDE 壳全挂）：统一导航 111/240 退役 /hermes/chat 家族后，ChatPanel SessionListItem :to="sessionHref()" 仍按 hermes.session/globalAgentSession 命名路由 resolve→No match ×N + parentNode null→/app 协作中心与 /ide 渲染挂。恢复四条命名路由指向 ChatView（patch 351，path 恢复性不挂导航）。统一导航守门测试同步更新（恢复性路由列白名单断言须存在）。
② **SCSS 语法错**（P1，R5 引入）：给 IdeSubagentsFloat 加 steer 样式引入 unmatched "}"，sass 编译失败断 IdeChatPane→IdeSubagentsFloat 链→整个 IDE 壳/工作台渲染挂。删悬空 } + 新增 scss-syntax-guard.test.ts（对 ide 全部 .vue scss 块逐一过 sass.compileString，27 文件，悬空 } 当场 fail）防复发。

验证：全量 2089 测绿 + vite 生产构建 8.35s 过（SCSS 根治实证，单测测不出的运行时错由构建兜底）。**教训：改 .vue 样式必须过 scss 守门 + 生产构建双保险**。

## 五、总 backlog（M4 十源汇总，按轮次分组）

裁决原则：合并同义项（多源指向同一能力时注明合流源）；需 hermes-agent 后端通道的项单列，不阻塞纯前端轮。

### R1 遥测与用量深水区（G4/G7/G8 + dsh-TUI/dsh/minimax 合流，纯前端为主）
- ~~**G4 上下文构成 breakdown**~~（R1 已落前端估算版，7ffe1b0）：dsh `contextBreakdown` 三段口径（system/tools/messages 之和恒等）+ minimax `/context` 六段语义 + dsh-TUI 纯前端按事件累计方案；先做前端估算版（窗口余量反推 system+tools 桶），hermes 产 span 后升级精确版
- ~~**G8 每轮 rounds 表**~~（R1 已落，patch 340）：zcode `session-debug.ts` 契约（每轮 usage 六项+hitRate+TPS）+ dsh StatsPills 双弹窗；M2 TPS 管道已备料
- ~~**G7 用量热力图**~~（R1 已落，84 天+连续天数）：day×hour 热力图 + 连续天数 + TTFT（数据源 session_usage 表，需读端点）
- ~~**低上下文主动提醒**~~（R1 已落，min(20k,10%窗)+迟滞）（dsh-TUI）：余量阈值 toast + 动作建议（/compact 或新会话），M2 水位数据已备
- ~~**会话成本估算**~~（R1 已落，claude/gpt 价目实抓）（dsh-TUI 三原则：两档价目+缓存分价+未收录不显示金额）：需自建价目资产（zcode/dsh 均无现成表）

### R2 审批与会话管理
- ~~**审批批准即学习**~~（R2 已落，五档宽度记忆+提示）：codex `ApprovedForSession` + minimax always-allow 五档宽度（narrow/byFirstWord/byArgvPrefix2/byDomain/wholeTool）
- ~~**子代理结果来源标头 + 反注入扫描**~~（R2 已落，七指纹+名册徽标）（claude-code 2.1.277/2.1.210）
- ~~**会话 recap**~~（R2 已落，回笼摘要横幅）（claude-code 2.1.108）：恢复会话回笼摘要
- **会话手动压缩入口**（走查确认 `/compact` 已有，原 backlog 项≈已具备）（Qoder）：水位遥测已有缺泄压阀；配 kimi compact 六段式交接提示词
- **子代理目录视角**（zcode P0 + dsh continuation 路由合流）：可对 idle 子代理二次驱动
- ~~**runaway-guard 死循环检测**~~（R2 已落，六信号前端版）（minimax 六类信号，hermes 步进 hook）
- **排队/转向双模**（codex-product queue vs steer + kimi Ctrl-S 流中注入，hermes steer 通道）

### R3 工件与评审
- ~~**/review 评审模式**~~（R3 已落，只读三级严重度提示词+cmd:review）（codex-product：专职 reviewer 会话 + 行内评论回流修复）
- ~~**任务结果卡**~~（R3 已落，IdeRunResultCard）（codex-product：时长+验证 bullet+文件±行数+Undo）+ **per-turn changed-files 卡**（dsh git 工作树快照）
- ~~**计划工件评审化**~~（R3 已落，进度条+三选一门）（antigravity：计划/diff/截图统一评审对象 + Proceed 门）+ **计划实施三选一门**（codex plan_implementation）
- **Git checkpoint**（zcode P0-4 + claude-code 四恢复选项语义 + kimi fileHistory 双相快照）
- **证据型工件**（antigravity：截图/录制挂任务里程碑，browser tab 与 RunTrace 有原料）

### R4 入口与生态
- **技能管理 IDE 入口**（zcode P0-3；按 claude-code skills+commands 合并口径一步到位）
- ~~**hooks 管理入口**~~（R4 已落，只读面板；写入归 R5+）（claude-code：hermes CC 兼容桥已有，只缺 UI）
- **规则体系**（Qoder 四型作用域 always/模型决策/@手动/glob + AGENTS.md /init 脚手架）
- **输入框 `/` 触发**（Qoder：指令/技能/子代理统一入口）
- ~~**模型切换器**~~（R4 已落，会话内切换+粘性）（antigravity：会话内下拉+推理档位）
- **会话搜索**（dsh FTS5 懒索引 + kimi kap-server 双路径）
- ~~**终端 actions**~~（R4 已落，工作区级一键命令）（codex-product：项目级一键命令）+ **@提及六源**（zcode）+ **ask_user 问卷工具**（minimax）+ **MCP tool_search 渐进披露**（minimax）
- ~~**通知补耗时 + Activity 收件箱**~~（R4 已落，三态徽标）（claude-code + codex-product 三态注意力）

### R5 重型项（需后端/新基建）
- ~~**Worktree 任务级隔离**~~（R5 引擎域已落 be73a38：loop WorktreeManager detached-HEAD 建/回收+会话绑定；codex-product+Qoder 合流；双向 handoff 归 R6）
- ~~**G5 goal 预算闭环**~~（R5 引擎域已落面板 be73a38：hermes GoalManager turn 预算+judge+auto-pause 暴露面；zcode ZCodeTaskGoalStats/minimax 态机/dsh max_goal_rounds/kimi 三预算为引擎语义参照）
- **Workflow 运行可视化 MVP**（zcode P0-5：run-line 单文件语义起步）
- ~~**Repo Wiki 生成管线**~~（R5 已落，管线提示词+面板按钮）（Qoder：多子代理生成+增量更新+引用注入）
- **视频/音频输入**（kimi kimi-file:// 间接引用设计蓝图）
- **needs-auth OAuth 合成工具**（G6 余项，后端通道）
- **agent profile 五级装载**（kimi）+ **agent roles 护栏**（codex 昵称池/并发深度）
- **automations 三联**（zcode 2040 行 AutomationsSection + 调度器）
- **Plan Mode 全套**（minimax /plan + agent 主动进入计划模式）

## 六、R6 统筹轮：multica/routa 分布式 agent 与人机协作（两模块统筹）

用户指令（2026-09-22）：统筹完善驾驶舱「沟通协调」（ia2，/app）与「IDE 工作台」（/ide）两模块——这俩模块通过会话、任务、项目、matrix 账号及其下 kanban 与 kanban 下的 agent 协作，须满足**分布式 agent + 人机协作**形态。multica/routa 两仓源码级调研已完成（docs/upstream-analysis/multica.md、routa.md）。协作链现状数据面：kanban task 带 session_id 桥接 + assignee 分派（kanban-service.ts:71/40）；matrix-login 绑定 matrix_user_id；loop 引擎 worktree-manager/subagent-dispatcher；ia2 flow 分桶（会话/房间/群组/看板）。

**R6 实现 backlog（按协作链分层，标注落点 ia2 / ide / server / loop）**：

### R6-A 分派与认领护栏（server + loop，分布式 agent 根基）
- **(task,agent) 串行认领**（multica agent.sql:743）：kanban 分派加 SQL 四围栏——同任务同人防双跑（FOR UPDATE SKIP LOCKED 等效）+ runtime 在线新鲜度 + 优先级排序。落 server kanban-service + loop dispatcher。
- **dispatch reason code 词汇表**（multica dispatch/reason.go:25）：queued/coalesced/runtime_offline/self_trigger_suppressed/blocked_dependency…决策分支产生，原样透传到任务卡/会话旁 chip「为什么没跑」。落 server dispatcher + ia2 卡详情 + ide 会话。
- **看板列移动即事件即触发 + 每 board 并发闸**（routa kanban-session-queue.ts:78）：COLUMN_TRANSITION 驱动列 agent，board 并发闸默认 1 + 排队 reconcile。落 loop dispatcher。
- **执行租约最小充分**（routa execution-backend.ts:54）：session 表加 owner_instance_id + lease_expires_at，重启按租约接管。多实例协同起步。落 server sessions + loop。

### R6-B 人机协作门禁与介入（ia2 主，ide 辅）
- **流转门禁四件套**（routa transition-gates.ts）：requiredHumanApproval/requiredChecklist/validatorCommand/gateMode，服务端 PATCH 强制——人审门嵌入任务流转。落 server task PATCH + ia2 卡详情门禁提示。
- **人机分工状态门禁**（multica task.go:5996）：agent 只能推到 in_review，done 留人或 PR 合并；失败永不自动动 in_review/blocked。落 server task 状态机。
- **@mention 总线**（multica comment.go:3100）：`@agent`=enqueue run、`@member`=进人 inbox、`@squad`=触发 leader——评论即 A2A，协作留痕可审计。落 server comment/dispatch + ia2 会话输入 + matrix 房间。
- **squad leader 协调协议**（multica squad_briefing.go）：leader 被注入操作协议（按 roster 选人、mention 委托、每轮必录 action/no_action/failed 评估）。落 loop dispatcher + ide 子代理。
- **人介入 agent 运行五件套**：审批/澄清/暂停/续话/纠正的会话级统一面（已有审批门/澄清门/steer，补 pause + 纠正通道）。落 ide 会话 + ia2 run canvas。

### R6-C 任务证据面与验收（server + ia2 卡详情）
- **任务=证据累积对象**（routa task.ts:835）：laneSessions/laneHandoffs/deliverySnapshot/verificationVerdict 落任务字段。落 server task schema + ia2 卡详情证据区。
- **委派护栏与回收兜底**（routa orchestrator.ts:1045）：深度上限 2 + auto-report/文件 watcher/session-end 三兜底 + wakeParent 续话。落 loop dispatcher + hermes delegation。

### R6-D 分布式形态与共享（server，规模化）
- **daemon 分布式蓝图**（multica：机器级持久身份 + WS 能力协商 + slot-before-claim 批量认领 + Redis Streams relay）——单机 loop 暂不适用，规模化时现成蓝图，留档。
- **共享会话**（routa shared-session/types.ts:1）：invite token + host/collaborator/viewer × 四档模式 + prompt 审批流，叠在 matrix 账号之上。落 server sessions + ia2 会话分享。
- **invoke 权限按链顶人类判定**（multica agent_access.go:12）：A 委托 B 按最初触发的人判白名单，防组团越权。落 hermes delegation 权限链。
- **会话续接安全分档**（multica task.go:5210）：session_id+work_dir 跨 run 复用，resume-unsafe 失败黑名单强制新会话但保留 work_dir。落 loop session 续接。

### 2026-09-22 R6 全部剩余落地（main 合流，2159 全绿+走查）

@mention 总线 + squad leader（d1832ed）+ 共享会话/执行租约/会话续接（4b0c845）：

| 件 | 交付 | 走查实锤 |
|---|---|---|
| @mention 总线 | 双端解析器（client ia2/utils/mention + server mention-bus 同词表）；[@agent] 服务端 enqueue run、@squad 触发 leader、@member 进 inbox；分发留痕（reason + 系统行）；patch 355 kanban addComment 接线 | — |
| squad leader 协调协议 | squad-leader.ts 选人（busy>online>idle 加权）+ 委托 + 每轮必录 action/no_action/failed 评估（multica squad_briefing 语义） | — |
| 共享会话 | session-share.ts 控制器（invite token + 四档模式 view/comment/approve/prompt × host/collaborator/viewer + prompt 审批门；patch 356） | create/get/prompt 三端真值（approve 待人审 pendingApproval:true） |
| 执行租约 daemon 形态 | sessions 表加 owner_instance_id + lease_expires_at（patch 357，syncTable 自动迁移）+ execution-lease.ts 接管判定（300s TTL，重启按租约接管） | — |
| 会话续接安全分档 | session-resume.ts 黑名单（resume-unsafe 中毒信号入黑，强制新会话保留 work_dir——中毒不继承不丢工作目录） | — |

累计 patch 340-357；守门 27 + 21（mention）+ 7（squad）+ 4（share）+ 5（lease）+ 6（resume）= 70 例；全量 2159 绿。**R6 backlog 全部清零**（multica/routa 分布式 agent 与人机协作语义全部落地或留档：daemon 规模化形态为蓝图，multica daemon/routa CRDT 笔记/移动端不适用已在文档标注）。

### R6 落点裁决（与既有模块不冲突）
- ia2（沟通协调）：分派 chip（reason code）、卡详情证据区 + 门禁提示、@mention 会话输入、共享会话分享。
- ide（IDE 工作台）：leader 协调协议（子代理名册升级）、runaway/纠正通道（已有 runaway-guard 补 pause）、会话续接安全分档。
- server/loop（引擎）：认领护栏、并发闸、租约、门禁、证据 schema、委派兜底——这些是分布式 agent 的根基，ia2/ide 只做投影与介入。


### 2026-09-22 深夜 R7 衔接层全六件落地（main 合流，2116 全绿+走查）

R6 根基（01f5d5e：dispatch reason 词表/认领护栏/人机分工门禁，multica+routa 语义）+ R7 六件：

| 件 | merge | 交付 | 走查实锤 |
|---|---|---|---|
| R7-A 归属链双向可查 | 18447ff | task-adapter sessionId 透传 + LinkedTaskList 归属链区（◉会话+⎇workdir） | 当前数据空态（无 session_id 任务） |
| R7-B 开发产出回喂 | 18447ff | buildAttention 第四参 sessions（ide 会话失败/受阻→attention session-failed 行，点击跳 ide.shell?session 反向深链） | attention 行点击→/app/board?task=t_ce0c411f |
| R7-C agent 名册统一面 | accea83 | buildAgentRoster 三源合并（platforms 在线探针+assignee 在跑+会话挂靠；busy/online/idle/offline 四态） | flow nav agents 区：codex idle ◉1 |
| R7-D 看板并发闸 | c01b1b8 | loop-engine boardHandoffBusy 互斥集（routa kanban-session-queue 语义；同 board 同刻 1 handoff，占不到发 board_concurrency_full） | 单测锚点+闸配对 |
| R7-E 流转门禁四件套 | （R6 复核） | requestHumanApproval + human decision 判定链 + /api/loop/contracts/:id/approve（bridged graph resume）在案 | — |
| R7-F 委派兜底 | c01b1b8 | dispatcher invoke 失败记 session-end fallback 兜底 reason（requeued_after_repair），不静默吞 | 单测锚点 |

累计 patch 340-354；守门 R6 9 + R7 A/B 7 + R7-C 8 + R7-D/E/F 3 = 27 例；全量 2116 绿。R6 backlog 剩余（@mention 总线/squad leader 协议/共享会话/执行租约 daemon 形态/会话续接安全分档）留 R8 按需推进。

## 七、R7 重规划蓝图：分布式组织协作 × 专业开发能力流畅衔接

用户指令（2026-09-22 深夜）：全面分析所有调研与补漏，重新规划两模块，让**分布式组织协作**与**专业开发能力**流畅衔接。12 源调研（zcode/codex/codex-product/kimi/minimax/dsh-TUI/deepseek-harness/claude-code/qoder/antigravity/multica/routa）+ 既有补漏（ensure-injected 差量根治/chat 路由恢复/SCSS 根治/R6 根基）全部纳入。

### 7.1 两模块的角色重新定位（不再各做各的）

- **ia2（驾驶舱「沟通协调」，/app）= 分布式组织协作域**。面向「人 + 多个 agent + 任务 + 会话 + 看板 + matrix 房间」的编排、感知与介入：谁在线、谁该干什么、什么卡住了、哪里要人审。它是**分布式 agent 组织的控制面**。
- **ide（IDE 工作台，/ide）= 专业开发执行域**。面向单会话的深作：写码/评审/工件/子代理/遥测/worktree。它是**专业开发的作业面**。
- 衔接原则：ia2 做编排与感知，ide 做执行与产出；**六链贯通**（会话、任务、项目、matrix 账号、kanban、kanban 下的 agent）让组织动作与开发动作双向流动，不各自为政。

### 7.2 六链贯通现状与断点（调研 + 现状实测）

| 链 | 现状（已有） | 断点（要补） |
|---|---|---|
| 会话 ↔ 任务 | kanban task 带 session_id 桥接；ide 侧栏 P0-P3 徽标 | 任务卡不显示「挂在哪个会话/谁在跑」；会话卡不显示「挂着哪些任务」 |
| 任务 ↔ 项目 | task workspace 字段；ia2 board 项目分桶 | 任务与 loop/worktree 的 workdir 关联不可见 |
| 会话 ↔ matrix | matrix-login 绑定 matrix_user_id；会话可投房间 | agent 身份与 matrix 身份的归属链不统一（agent 没 matrix 身份面） |
| kanban ↔ agent | task assignee 分派；R6 认领护栏/reason code | agent 名册无「在线/忙闲/在跑什么」面；分派原因不进卡详情 |
| kanban ↔ 会话 | persistedTaskId 关联 | 会话→任务→看板的追溯矩阵断（会话卡无任务链） |
| ia2 ↔ ide | useIdeJump ide?task= 深链（单向） | ide 只进不出：开发产出（工件/完成/受阻）不回喂协作感知 |

### 7.3 衔接层设计（三大层，互不重叠）

**L1 身份与归属层（分布式 agent 名册）**——ia2 主，ide 辅
- agent 名册：在线/忙闲/当前在跑的任务与会话，统一 agent 身份面（matrix 账号下的 agent = matrix 身份的子身份）。落 ia2 flow agent 区 + ide 子代理名册同源。
- 归属链显性化：任务卡显示「会话 + agent + workdir」；会话卡显示「任务 + 优先级 + 看板」；双向可查。

**L2 协作动作流转层（组织 ↔ 开发双向流动）**
- ide 产出回喂：会话完成/受阻/工件产出 → ia2 协作感知（注意力/收件箱/任务动态）。打通「专业开发的结果 = 组织可感知的事件」。
- 协作动作下发：ia2 分派/门禁/续话 → ide 会话执行（@mention 总线已 R6 列入；本层做 ide 侧会话内执行面的承接）。
- 人机协作五件套贯通：审批/澄清/暂停/续话/纠正在 ia2 与 ide 是同一套事件面（同一 store 投影，不两套实现）。

**L3 分布式护栏统一层（server/loop 根基，R6 已起）**
- R6 已落：dispatch reason 词表 + 认领护栏 + 人机分工门禁。
- 本层补齐：看板并发闸（routa）、执行租约（routa）、委派兜底（routa 三兜底）、流转门禁四件套（routa）——让分布式 agent 的分派/执行/验收在 server 有强制护栏，ia2/ide 只投影。

### 7.4 R7 实现 backlog（衔接层，标注落点）

- **R7-A 归属链双向可查**（ia2 主）：任务卡详情加「关联会话 + 执行 agent + workdir」区；会话卡加「挂接任务 + 看板」区。数据源：kanban session_id + persistedTaskId + worktree 绑定，零新表。
- **R7-B 开发产出回喂协作感知**（ide→ia2）：会话完成/受阻事件 → ia2 注意力条 + 收件箱（复用 R2 runaway/R4 inbox 通道，跨 store 事件总线）。
- **R7-C agent 名册统一面**（ia2 主）：agent 在线/忙闲/在跑面，agent 身份 = matrix 子身份。数据源 loop contracts + hermes 在线探针 + assignee。
- **R7-D 看板并发闸 + 执行租约**（server/loop，routa 语义）：COLUMN_TRANSITION 列 agent + board 并发闸默认 1；session 表 owner_instance_id + lease_expires_at 重启接管。
- **R7-E 流转门禁四件套**（server，routa 语义）：requiredHumanApproval/requiredChecklist/validatorCommand/gateMode，服务端 PATCH 强制，人审门嵌入任务流转。
- **R7-F 委派兜底**（loop，routa 语义）：auto-report/文件 watcher/session-end 三兜底 + wakeParent 续话。

### 7.5 与既有模块的关系（不推翻，做衔接）

- ia2 v13（并行会话的活动脉冲/需关注分诊/语义块回放）= 协作感知域的产出，本蓝图在其上补「归属链」与「开发回喂」，不重做。
- ide M5 六轮（遥测/审批/工件/子代理/goal/worktree）= 专业开发域的产出，本蓝图在其上补「产出回喂」与「名册同源」，不重做。
- R6 根基（reason 词表/认领护栏/人机分工门禁，01f5d5e）= L3 的第一块，本蓝图在其上续 L3 其余护栏。