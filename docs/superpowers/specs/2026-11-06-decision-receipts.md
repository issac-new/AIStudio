# 决策回执层：闸判词落盘、批准前版本复核、组织自派发实算

## 变更

把三类「只做不留证」的自动决策补上结构化回执，让「为什么 PASS/FAIL」「批准时卡是否已被改」「组织有没有真自派发」变得可复盘（微信三篇调研 B 批，对应文章三《可验证的自我改进 Coding Agent》的「决策事件/执行收据」主张）。另清偿 A 批挂账 3（`mx-lib.sh` 的 `log()` 改 stderr，前置条件＝`refactor/platform-rewrite` 合入——已于 6a787c3e9 兑现）。

- **闸判词落盘**（`simharness/mux/mx-scenario-lib.sh`）：新增 `mx_verdict_receipt`，三个判词包装（`mx_room_gate_verdict` / `kanban_card_gate_verdict` / `mx_gate_verdict_combined`）在返回非空判词前追加一行 `runs/<run>/evidence/gate-verdicts.jsonl`，字段 `{id,ts,gate,verdict,source,room,room_sha,card,card_sha}`；幂等键 `run×gate×room_sha×card_sha×verdict`（同来源同结论只记首行，改判=新行追加，时间序即审计轨迹）。落盘 fail-soft，绝不影响判词返回。
- **批准前版本复核**（`custom/server/approval-inbox/human-gate.ts`）：`POST /:id/decide` 在任务类批准前重取看板任务并重算 `computeTaskRevision`，与建单时 `req.taskRevision` 不符即 409 `revision_mismatch` 拒签（此前建单时的版本被原样签发，改卡只能等执行侧才拒）。fail-soft：任务不可达不阻断人裁，放行并带 `revisionRecheck: unavailable` 提示——状态过期检测以消费侧 `checkDecisionGrant` 为终兜底，决策侧只拦「已知的过期」。
- **组织自派发实算**（`simharness/mux/mx-scenario-lib.sh` + `mx-report-gen.py`）：strict 姿态 `dispatch_in_room` 发「【自主组织】」派单时追加 `evidence/self-dispatch.jsonl` 一行（独立台账——自派发是净额达标行为，**不进**代偿台账，否则会被清偿门当待清偿代偿，语义相反）；报告净额行由硬编码「组织自派发在案 0 条」改为实算 `self-dispatch.jsonl` 行数，零条时保留「（全部为脚本代演）」标注；`docs/governance/run-metrics.jsonl` 留档行新增 `selfDispatch` 计数（O1 跨轮对照面）。
- **挂账 3 清偿**（`simharness/mux/mx-lib.sh`）：`log()`（:175）与 `issue_to_run` 的进度行（:184）改走 stderr。验证依据：全部日志收集点（`mx-burn-test.sh:122`、`mx-recovery-lib.sh:70`）均为 `>> log 2>&1`，stderr 同样入档，日志内容零变化；`$(log ...)` 命令替换消费者全仓扫描零命中；`note()`（`mx-scenario-lib.sh:88`）有 `$()` 捕获消费者（`eval_flow` 的 `out=$(eval_summary)`），**刻意不动**。契约棘轮基线随批收紧（`governance-lint --cli-contract --update-baseline`）。

## 决策记录

### 一、判词回执落在 bash 包装层，不改服务端

`controller.ts` 的 `POST /lifecycle/gate-verdict` 是无副作用的判定服务（只算不落）。审计确认判词的「记录」目前只有间接副作用（state.env 键、issues.log、breaker.json）。选 bash 包装层落盘而非服务端建账本：判词的输入（房间正文/卡面 body）本就由导演域收集，回执的 id 字段（room/card sha）在包装层唾手可得；服务端落盘则要传全量正文，接口面扩大。

### 二、幂等键含 verdict：改判是新增行不是覆盖

run27 实录（fanfan r4 改判 PASS→熔断复位→复评）证明改判是常态路径。若幂等键不含 verdict，改判会被去重吞掉，回执只剩首判。键含 verdict 后：同来源同结论幂等（重跑驱动 26 次不会写 26 行），改判追加新行，`tail -1` 即末判词——与「末判词赢」的既有判定语义同构。

### 三、自派发记独立台账，不进代偿账

审计建议的两个选项（`compensate self-dispatch` vs `evidence/self-dispatch.jsonl`）里选后者，理由：代偿台账的消费者是清偿门（open 笔须清偿或 waive 才能开下一轮）——把净额达标行为记进代偿账，会把「组织做对了」变成「欠导演一笔」，清偿门恒红。独立 jsonl 语义干净：一行=一次真实自主派单，报告与跨轮指标直接消费。

### 四、决策侧复核只拦「已知过期」，fail-soft 放行不可达

`fetchTaskDetailForGrant` 失败（服务抖动/任务已删）时若硬拦 409，人工批准会被基础设施抖动卡死。取舍：可达且 revision 不符→拒（明确的过期证据）；不可达→放行+warning（消费侧 `checkDecisionGrant` 的 `revision_mismatch` 是既有终兜底）。这与「fail-soft 不造假」不变量一致：不装作复核过了，也不拿不可达冒充过期。

### 五、不做的事

- 不给回执建新指标消费面（弃权率/回退率/决策时延的聚合视图）——先落数据一整轮，消费面待数据形态稳定后另批（避免为空表建仪表盘）。
- 不改 `mx_gate_verdict_seen` 族返回语义——回执是旁路记录，判定路径零变化。
- 不动 `approved.events`/`gate-deny.jsonl` 等既有台账——本批只补「判词提取」这一处空白，不合并台账（审计确认五类证据目录各有契约，合并打断可追溯性）。

## 验证

- `npx vitest run custom/server/approval-inbox/__tests__/human-gate.test.ts`：新增用例——批准期间任务被改→409 `revision_mismatch` 不落 store；任务不可达→放行且响应带 `revisionRecheck: unavailable`；版本一致→行为与存量完全一致。
- `simharness/tests/`（新增 `decision-receipts.test.ts`）：①判词回执——fixture 驱动 `mx_gate_verdict_combined` 双源，断言 `gate-verdicts.jsonl` 落行、同键二调零新增、改判（verdict 变）新增一行；②self-dispatch——strict 姿态 fixture 走 `dispatch_in_room` 断言 jsonl 落行、standard 姿态零行；③`mx-lib.sh` log/issue_to_run 走 stderr（stdout 捕获为空）。
- 报告实算：fixture 生成 `self-dispatch.jsonl` 2 行 → `_net_pair_table` 渲染「组织自派发在案 2 条」；零行 → 保留「（全部为脚本代演）」。
- 既有回归：`simharness/tests/mechanism-behavior.test.ts`（判词/监督器行为）＋`custom/server/approval-inbox/__tests__/`（审批域全套）不回归。
- `node scripts/governance-lint.mjs --cli-contract`：基线收紧后 0 problem（stdout-log 违规项只减）。
- `bash -n` 三个改动 shell；`node scripts/typecheck`（或 `npx tsc --noEmit` 单文件）human-gate 路由。

## 设计文档影响

DESIGN_SYNC: none——回执与复核是治理过程面增强，不触整合正本设计参数与数字总账；净额行渲染从硬编码改实算是 O1 指标留档批（2026-11-06-run27-design-optimizations）既有「实算不虚报」原则的延续，判据口径未变。

## 挂账（下一轮）

- 回执消费面：`gate-verdicts.jsonl` 的弃权/改判/时延聚合指标（等一轮真实数据后定形态）。
- `controller.ts` 判词服务的落盘版本（若未来服务端需要自带审计，以 bash 回执为 schema 参照）。
