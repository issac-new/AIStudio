# hermes-agent 版本复盘与「AI协作中心」迁移对接报告

- 日期：2026-09-10　|　状态：有效　|　基线：SwarmStudio 2.16（hermes-studio v1.0.2 + hermes-agent v0.21.1 源码跟踪）
- 口径声明：hermes-agent 仓库**没有 CHANGELOG 文件**，发布说明由 `scripts/release.py` 在发版时生成并贴到 GitHub Releases。本文版本功能变化全部基于 git log 归纳（`git log --oneline --no-merges <tag1>..<tag2>`），提交数为 non-merge 口径。
- 事实核验时点：2026-09-10（`origin/main` fetch 至 2026-09-09 03:18 UTC）。

## 1. 结论

**对接面整体兼容，差距集中在"版本双轨"与"新能力利用率不足"两点。**五条判断：

1. 最新 stable 就是本地源码跟踪的 0.21.1（tag `v2026.9.7`，2026-09-07 发布），`origin/main` 在其上还有 **278 个未发布提交**，主题是子代理实时化与会话传输重构。agent 不需要也没有更新版本可升。
2. **版本双轨**：源码跟踪 0.21.1，桌面 runtime pin 仍是 0.20.6（`runtime-config.mjs:1`）。runtime 二进制发布在 EKKOLearnAI/hermes-studio 仓库，最新 runtime tag 是 `hermes-0.21.0-runtime`，**0.21.1 的 runtime 不存在**。端用户首启下载的是 0.20.6 vanilla。
3. **2026-09-14 插件兼容层停用不影响本项目**（核验证据见第 5 节），无需应急改动。
4. cockpit 核心链路无 vanilla 缺口：`specify/decompose/context` 在 vanilla 0.21.1 已是原生动词（`hermes_cli/kanban.py:217,1383`）；overlay patch 178/179 新增的 `set-project/set-reasoning/estimate` 只被 SwarmKanban 三个组件消费，cockpit 主功能不依赖。
5. cockpit 对 0.21.x 新能力的利用率不足，主要欠账三项：子代理实时信息（事件已透传 ~30 字段但 UI 未展示）、压缩与用量可见性（`bridge.compression.*`/`model.usage` 事件已 emit 但未消费）、MCP profile 级健康（0.21.1 新增，cockpit 无信号）。本轮按第 7 节台账 T1–T3 清偿。

## 2. 版本谱系与功能变化

### 2.1 CalVer ↔ semver 映射（0.19.0 起）

agent 仓库不打 semver tag，tag 全部是 CalVer；语义版本写在 `pyproject.toml:5` 与 `hermes_cli/__init__.py:6`。逐 tag 核对结果：

| Tag | semver | 日期 | | Tag | semver | 日期 |
|---|---|---|---|---|---|---|
| v2026.7.20 | 0.19.0 | 07-20 | | v2026.8.18 | 0.20.4 | 08-18 |
| v2026.7.30 | 0.19.1 | 07-30 | | v2026.8.19 | 0.20.5 | 08-19* |
| v2026.8.3 | 0.20.0 | 08-03 | | v2026.8.27 | 0.20.6 | 08-27 |
| v2026.8.13 | 0.20.1 | 08-14 | | v2026.8.31 | 0.21.0 | 08-31 |
| v2026.8.16 | 0.20.2 | 08-16 | | **v2026.9.7** | **0.21.1** | **09-07** |
| v2026.8.16.2 | 0.20.3 | 08-17 | | | | |

\* tag 日期与 semver 发布行存在 1–2 天偏移，以上以 tag 创建时间为准。

### 2.2 0.19 → 0.21.1 主题

- **0.19.x（7 月）**：kanban 体系大改与模块化起步，overlay 侧对应迁移见 `docs/superpowers/` 的 hermes-agent 019/020 kanban 迁移系列文档（patch 178/179 的来源）。
- **0.20.1–0.20.5（8 月上中旬）**：密集修复周期，五个版本合计约 3,600 提交，无破坏性标记。
- **0.20.6（v2026.8.27，1,314 提交）**：浏览器 real-profile（CDP + copy）；desktop 只读存储转录 resume 与 legacy owner 回填；托管 SSH 更新引擎并入主进程；Group Chat Stop 按钮；image/package 安装拒绝原地更新。**这是当前桌面 runtime pin 的版本。**
- **0.21.0（v2026.8.31，899 提交）**：Group Chat 架构改版（同 gateway 免 Desktop 运行、跨 gateway transport、权威网关死亡后日志复制与围栏接管）；cron doctor；**compaction 提交边界重建 system prompt**（长会话压缩后终于能拿到更新后的系统提示）；Desktop MCP OAuth 对远程后端完成；worktree 磁盘回收。
- **0.21.1（v2026.9.7，当前源码跟踪版）**：delegation 子代理后台进程移交父会话并上报（含 `process_notes`）；GPT-6 Astra baseline；MCP server 设备码授权进 CLI；CLI 管理池化 OAuth 凭据（优先级/重置/刷新）；**compression 按图学习 token 成本 + usage anchor 跨重启**；MCP profile 级连接健康；发布前密集 `fix(approvals)`（GNU env split、argv0 操作数、denied 可执行路径匹配）。

### 2.3 0.21.1 之后的未发布管道（`v2026.9.7..origin/main`，278 提交）

类型分布：fix 126 / ci 40 / test 30 / **feat 26** / docs 18 / fmt 12，**无 `feat!`/BREAKING 标记**。feat 主题集中在两块：

**子代理实时化（2026-09-08 扎堆合入，9 条）**——新增 session 级 RPC 三件套（新文件 `tui_gateway/methods_subagents.py`）：

- `subagent.list({session_id})` → `{subagents, delegations}`，字段含 `subagent_id/parent_id/depth/goal/delegation_id/model/started_at/status/tool_count/last_tool/accepting_steer`；
- `subagent.tail({session_id, subagent_id})` → `{available, text, truncated}`，live transcript 末 16 KiB，仅存活会话；
- `subagent.interrupt`；既有 `subagent.steer` 语义确认为 `status: queued`（已接收而非已送达）；
- 严格的 session/transport/generation 归属校验，无效归属返回 error 4001。

**桌面会话组织（3 条）**：desktop 会话按 gateway 与 profile 分组嵌套；Group Chat 房间排序。

**其余接口变化**（对 SwarmStudio 升级有直接影响的）：会话传输扇出重构（`tui_gateway/session_transports.py`，事件广播取代 transport 槽重绑）；CLI oneshot resume 统一（`--resume` 在 one-shot 模式生效）；压缩显示历史有界分页 + display identity 写索引；group 审批/澄清注意力改由 `$groupClarify` 派生（不再复制进 `$groupNeedsYou`）；delegation sync result 顶层新增 `process_notes`、默认值 250 iterations / 10 并发子代理；MCP OAuth refresh 缺 `refresh_token` 时保留旧值。`acp_adapter/`（IDE 集成协议适配器）零改动。

## 3. AI协作中心 ↔ agent 能力映射与利用率

「AI协作中心」即 cockpit（`cockpit.brandTitle: 'AI协作中心'`，patch 075 注入），全部 overlay 自研。逐子功能对照：

| 子功能 | 对接面 | 依赖的 agent 能力 | 利用率判断 |
|---|---|---|---|
| 任务看板（左栏） | REST → `hermes kanban ... --json` 子进程；WS `kanban watch --json` | kanban CLI 动词集 | 全量利用 |
| 工作区动作 | REST → CLI 动词 specify/decompose/complete/block/assign 等 | 同上 | 全量利用；动词 0.21.1 已原生 |
| 看板自动刷新 | WS `/api/hermes/kanban/overview/events` | watch 事件流 | 全量利用 |
| 聊天/协作条 | Socket.IO `/chat-run` → bridge NDJSON（31 action） | chat/get_output/interrupt/steer 等 | 全量利用 |
| 审批/澄清 | fleet-tap 解析 `approval.requested/resolved`、`clarify.requested`（`fleet-tap.ts:60-80`） | 事件 + `approval_respond/clarify_respond` | 全量利用；注意 §6 的 `$groupClarify` 改名预警 |
| **子代理可见性** | `subagent.*` 事件透传（`handle-bridge-run.ts:1394-1426`，~30 字段含 tokens/cost）+ `background_poll` 500ms | 0.21.1 delegation 增强（`process_notes`、后台进程移交父会话） | **欠账**：事件字段到 cockpit 后未展示，process_notes 未消费 → T1 |
| **压缩/用量** | `bridge.compression.*`、`model.usage` 事件已 emit；RunTrace L3 读 JSONL | 0.21.0 压缩边界重建；0.21.1 usage anchor 跨重启 | **欠账**：cockpit 时间线无压缩事件，RunTrace 无 anchor 连续性 → T2 |
| 会话舰队 | 自研 fleet 快照 WS（1.5s tick） | bridge `list` + chat-run tap | 轮询是自研架构选择，agent 侧（含未发布管道）无 fleet 级推送接口，维持现状 |
| RunTrace L2 | agent 侧插件写 `~/.hermes/traces/*.jsonl`（7 个 hooks） | 插件系统 + hooks | 全量自研闭环；与 usage anchor 的对接是 T2 一部分 |
| **MCP 健康** | bridge `mcp_list/mcp_server_test` 等 7 action | 0.21.1 profile 级连接健康 | **欠账**：仅设置页可用，cockpit attention/inbox 无降级信号 → T3 |
| 历史检索 | kanban 时间线 | agent FTS5 会话搜索 | 未接 → T4（门控核验接口形态） |
| 日程/待办 | localStorage | agent cron（chronos） | 未接，本轮 Non-goal |
| 终端面板 | node-pty WS（本地多工具） | 无关 | 不涉及 |
| Loop 工程 | 自研 loop 引擎 + kanban 持久化 | 无直接对应（P2 在途） | 不涉及本轮 |

## 4. 下次 agent 同步的敏感点核对单

bridge 协议（NDJSON action/ok）**无版本协商**，升级不会握手失败，只会因 action 名或事件语义漂移而坏。同步后逐条核对：

1. **bridge action 集（31 个）**：`packages/server/.../bridge/client.ts:497-834` ⇄ agent 侧 `bridge_server.py:46-325` 一一对应；重点 chat/get_output/background_poll 的参数漂移。
2. **evType 分支**：`handle-bridge-run.ts:1279-1470`；`subagent.*` 通配透传在 :1394-1426，字段删除要防 UI undefined。
3. **Socket.IO 面**：`chat-run.ts` 入站事件与 emit 集（run/app.resume/abort/approval.respond/delegation.updated 等）。
4. **READY 哨兵字符串**：`bootstrap/http.ts:285` 的 `[bootstrap] agent bridge started` ⇄ `desktop webui-server.ts:44` marker，两侧必须同步改。
5. **agent root 发现**：以 `run_agent.py` 存在为准（`manager.ts:194-208`、`bridge_runtime.py:478-500`）；agent 仓库若移动该入口，桥接层全断。
6. **版本探测**：`hermes-environment-selection.ts:21` 用 `python -c "import hermes_cli; print(__version__)"`。
7. **kanban 模块拆分**：patch 178/179 横跨 `hermes_cli/kanban{,_parser,_boards,_db,_output,_swarm}.py` 6 文件；上游 9 月 decomposition 的 PLUGIN-COMPAT 块被 revert 后（09-14 之后某次发布），这些文件会再动，patch 上下文若贴着兼容块需重录。
8. **kanban `--json` 输出 schema**：`kanban-service.ts` 动词映射（:871-916、:1107-1197）依赖输出字段稳定。
9. **runtime pin 三处一致**：`runtime-config.mjs:1-4` / `desktop/build/runtime-release.json` / `paths.ts:13`，并确认 EKKOLearnAI/hermes-studio 上对应 `hermes-<ver>-runtime` tag 存在（当前 12 个 runtime tag，最新 0.21.0）。
10. **gateway 拉起与健康代理**：`runner.ts` spawnHermesWithBin；`http.ts:562-600` 把 `/agent-health/*` 代理到 8650 `/health*`（带 API_SERVER_KEY）。

## 5. 2026-09-14 插件兼容层停用：核验结论

**结论：不影响本项目，无需改动。**

背景：上游 9 月 decomposition（PR #102117）把大模块拆成小文件，旧 import 路径经 `PLUGIN-COMPAT` 块临时重导出；`COMPAT_MANIFEST.md`（3869 行、339 个模块节）明确 **2026-09-14 起旧路径插件被 DISABLED 不再加载**（该文件已含于 0.21.1，本地 `upstream/hermes-agent/COMPAT_MANIFEST.md:8,18`）。

核验证据：

- run-trace 插件（`overlay/custom/hermes-agent-plugins/run-trace/`，4 文件）**只 import 标准库**（json/logging/os/threading/time/dataclasses/pathlib/typing），零 `hermes` 内部依赖，grep 实测零命中；
- 4 个 agent patch（117/118/178/179）是就地修改真实文件（拆分后路径），不是插件，不走兼容层；
- 逃生舱备查：`config.yaml` 设 `plugins.allow_deprecated_imports: true` 可临时豁免（本次用不上，记录在案）。

连带提醒：该兼容层的移除方式是 revert 单个提交，落地下一个版本时 `hermes_cli/` 会有一波文件变动，触发第 4 节第 7 条核对项。

## 6. post-0.21.1 对接建议（写给运行中心 P2 及后续会话）

1. **子代理 roster / live tail 是运行中心的天然对接点，但不要抢跑。**新 RPC（`subagent.list/tail/interrupt`）目前只在 agent 的 tui_gateway 层（服务它自家 TUI/Desktop），SwarmStudio 的 bridge（studio 侧 `bridge/python/`）没有对等 action。两条路径：
   - 路径 A（推荐）：观察 upstream studio 桥接层是否跟进暴露对等 action，跟进后 cockpit/runcenter 只换消费端；
   - 路径 B（备选）：overlay 给 studio bridge python 打 patch 自研 roster action，直读 agent session 状态。代价是持续跟随 agent 内部 API 漂移，每同步一次修一次。
   在 agent 发布含这些 RPC 的版本之前，运行中心用现有 `subagent.*` 事件流 + `background_poll` 已能覆盖"看得到子代理在干什么"，差别是没有 16 KiB 级 transcript 尾随。
2. **`$groupNeedsYou` → `$groupClarify` 改名**：若 fleet-tap 或 group 相关解析读旧字段，升级时要加"先探测新字段、回退旧字段"的兼容读法。
3. **压缩显示历史有界分页**：cockpit HistoryModal 与聊天转录的分页，未来对齐 agent 的 display identity 分页协议，避免一次性拉全量。
4. **delegation sync 顶层 `process_notes`**：fleet server 消费 `background_poll` 时按可选字段处理，做 schema 版本兼容。

## 7. 本轮迁移实施台账

分支 `feat/agent-retro-cockpit-migration`（基于 main @ 6b66b8b），与 P2 运行中心会话零文件交集（P2 占 `custom/*/loop/` 与 patch 202-204，本任务新 patch 205-207，series 追加尾部）。

| 项 | 内容 | 状态 |
|---|---|---|
| T0 | 侧边栏 `sidebar.cockpit` i18n key 修复（改用 `cockpit.brandTitle`，patch 072 单点改动） | ✅ commit b313bfb |
| T1 | 子代理/委派可见性：bridge `background_tasks` 花名册经 fleet-tap/snapshot 透传，FleetGrid 卡片实时展示（goal/model/last_tool/工具数；完成后时长/成本/token；hover 详情），i18n patch 205/206 | ✅ commit f7416b7 |
| T2 | RunTrace L2 用量汇总：`buildTraceGraph` 聚合 llm_span usage 进 `meta.usage`，Modal 头部 chip 展示（L2 优先 L1 兜底）。**范围修正**：compression 事件上游 chat 链路已全局消费展示（`api/studio/chat.ts:852` + `MessageList.vue:754`），cockpit 内嵌 ChatView 直接继承，无需重做 | ✅ commit b33a07f |
| T3 | MCP 连接降级信号进收件箱：store 60s 轮询 `GET /api/hermes/mcp/servers`（设置页同款接口，零 server 改动），inbox 新增 'mcp' kind（权重在 blocked 之后 clarify 之前），点击跳 `hermes.mcp` | ✅ commit 9262f9f |
| T4 | 历史全文检索接入 | ⛔ 不实施：门控核验发现等价能力已存在——cockpit 全局搜索（store `runSearch`，300ms 去抖 + 5min 缓存）已消费 `GET /api/studio/search/sessions`（含 profile 权限过滤与任务映射，store/cockpit.ts:995、routes/sessions.ts:19）；HistoryModal 的"搜索历史事件"是本地事件过滤，属另一维度。重复建设无增量 |
| T5 | runtime pin 0.20.6 → hermes-0.21.0-runtime（patch 207，三处一致：runtime-config.mjs / runtime-release.json / paths.ts；回归面同步修正上游 runtime-config/runtime-paths 两测试文件的版本硬断言）。前置核验通过：vanilla v2026.8.31 原生含 specify/decompose/context；`hermes-0.21.1-runtime` tag 不存在，出现后 3 行跟进 | ✅ commit 2946907（发版冒烟留给发版流程） |

**已知问题（非本轮引入，如实披露）**：上游 `tests/desktop/runtime-paths.test.ts` 的 "keeps the Hermes Git checkout separate from its bundled venv" 用例在 main 全量注入态下即失败（剔除 207 复测同样失败，二分定位与 patch 188 本地 runtime 优先逻辑和本机存在 `~/.hermes/hermes-agent` 源码 checkout 的交互有关）。本轮 patch 207 后零新增失败（三件套 20 pass + 该 1 既有 fail）。后续可单独开任务处理。

**验证口径**：全量 vitest 745（main 基线）→ 757 passed + 6 skipped、0 fail；隔离沙箱（/Volumes/nvme2230/.rp-sandbox，同卷硬链接 clone 两上游仓 + overlay 拷贝平级布局，原生跑 inject.mjs）patch 重放 149 → 152 全绿。上游 tsc / vue-tsc / 主 checkout 全量门禁在合并时序点执行（P2 落地后）。

**T2 涉及的存量修复**：trace.ts llm 节点 detail 引用了被改名遮蔽的变量（`usage` → `usageSpan`），已随 T2 修正。

## 8. Non-goals

- agent 不跟踪 `origin/main` 未发布代码（违背 sync-upstream.sh 的 stable-tag 原则）；
- 不做 `hermes-0.21.1-runtime` pin（该 tag 不存在）；
- 不动 `custom/*/loop/**`（P2 会话地盘）；
- 不做 cockpit 日程 → agent cron 迁移、不做 subagent roster RPC 的 bridge 自研实现（路径 B），只留建议。
