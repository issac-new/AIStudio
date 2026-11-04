# AgentTeams 吸收批二：编码执行记录面

来源：AgentTeams 1.2.5 Coding Runs（`agentteams-controller/internal/server/coding_runs.go` + `run-coding-cli.sh` runs.jsonl）源码级对标。
批一 spec：2026-11-04-agentteams-project-workflow.md。本文是批二（feat/execution-records 分支）决策事实源。

## 变更

对标判据：**每个退出路径都留痕——被拒的尝试恰恰最该被看见**（run-coding-cli.sh:83 注释原意）。
AIStudio 现状三个硬缺口：run 无持久化索引（runId 只寄生 sessions.agent_session_id，重启即失）、
退出码只拼文案（run-manager.ts:584 exitErrorMessage）、PTY 输出直接丢弃（flushTerminalOutput 置空）。

1. **统一执行记录写口** `custom/server/execution-records/record.ts`：按日 JSONL
   `~/.hermes-web-ui/execution-records/execution-records-YYYY-MM-DD.jsonl`（原子追加、按 runId 幂等、
   14 天裁剪——照 runmanifest/run-manifest.ts:99 范式）。行 schema：
   `{ v: 1, kind: 'coding-run'|'delegate', runId, sessionId?, agentId?, cli?, taskId?, board?,
      outcome: 'success'|'failed'|'timeout'|'blocked', exitCode?, reason?, startedAt, endedAt,
      promptSha256?, logBytes? }`。
2. **coding-run 写入**（patch 734，vendor run-manager.ts）：close/退出路径落一行
   （outcome 从 end_reason/exit code/超时映射；blocked=启动前拒绝：CLI 缺失/授权无效）。
   退出码落结构化列，不再只拼文案。
3. **delegate 写入**：`runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py`
   每个退出路径追加 `materials/runs.jsonl`（0/2/3/4/5 → success/blocked/timeout/failed/failed；
   engine-not-found 与 task-context-failed 也记 status=blocked），并修 :239 `prompt_sha256`
   snake_case 与 finish() `promptSha256` 不一致缺陷。
4. **查询端点**（patch 735 挂载，`/api/execution-records`）：
   - `GET /`：聚合列表（JSONL 索引 + delegate runs.jsonl 扫描归并，`?kind=&agent=&task=&limit=&offset=`）
   - `GET /delegate/:taskId`：workspace 解析 → delegate-result.json + delegate-log.txt 尾部 N 行
   - `GET /coding/:sessionId`：sessions 表 + run_usage + workspace_run_changes 摘要
   - workspace 解析复用 custom/server/controllers/ide/task-workspace.ts:64，补齐其缺的
     `HERMES_KANBAN_WORKSPACES_ROOT` env 读取（与 Python 侧 resolve_task_workspace 对齐）。
5. **客户端**：`custom/client/ia2/views/records/` 列表（筛选/分页）+ 只读详情
   （照 DirectorPanel/DirectorRunDetail 形状），路由 `ia2.records` + nav。

## 决策记录

| # | 决策 | 备选 | 取舍理由 |
|---|---|---|---|
| D1 | 索引独立 JSONL 而非建 DB 表 | coding_agent_runs 表 | JSONL 按日分片+幂等追加是本仓已验证范式（runmanifest），零 schema 迁移、重启不丢、易裁剪；DB 表要过 sessions 库的迁移链，成本不成比例 |
| D2 | blocked 语义=启动前拒绝 | 沿用 AgentTeams 的 marker-conflict(125) | AIStudio 的「拒绝执行」发生在：CLI 不在 PATH、授权探测无效、引擎不可用——统一记 blocked+reason；任务互斥 marker 本仓没有对应物，不造 |
| D3 | delegate 记录落 task workspace 的 materials/runs.jsonl | 全部落中央 JSONL | 中央面跨机不可见；task workspace 是任务事实源（G3 取证已读它），记录跟着任务走；查询端点双源归并 |
| D4 | run-manager 只加出口落痕，不动 PTY 缓存 | 同时落 PTY 转录 | PTY 转录=新数据面（体积/敏感面），单批不扩；先修「没有记录」再议「记录多细」 |
| D5 | patch 734 只碰 run-manager 出口路径 | 重构 getRunInfo | 最小侵入；getRunInfo 扩字段不影响落盘，列表数据从 JSONL 来 |

## 验证

- 目标测试：`npx vitest run custom/server/execution-records custom/client/ia2/__tests__`（+ 客户端 records 测试）
- 全量：`npm test`（对照批一基线：4 存量红已知，0 新增）
- 补丁正确性：干净树 reset→inject 重放→涉改文件 cmp 快照一致；reverse-check 双向
- 行为验证：跑一次 delegate（含引擎缺失场景）→ 列表同时出现 success 与 blocked 两条；编码 CLI 起/停一个 run → JSONL 落行含 outcome/exitCode
- 部署：inject 出口自动部署（delegate 脚本经 runtime manifest 已有条目）；复核 N/N 一致

## 设计文档影响

DESIGN_SYNC: none
纯新增能力面（新域+新端点+新页面+run-manager 出口落痕），不触及整合正本与数字总账既有章节。
