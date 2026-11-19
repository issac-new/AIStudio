# 结果交付批：逐条 AC 验收报告与返修栅栏

> 日期：2026-11-19
> 状态：实施中（用户指令「深入调研…完善AIStudio」；按推荐批 A 实施，范围选择未收到用户否决，也未收到显式追加）
> 来源：SoduWork 文章与源码调研（`mdiri-ai/SoduWork` @ `9b172502d`，v1.13.18-127，MIT）；完整调研见 `docs/reports/2026-11-19-sodowork-research.md`
> 关联：`2026-11-16-loopforge-sop-trust.md`（真实执行地板）、`2026-11-19-independent-review-protocol.md`（独立审查协议）、`2026-11-19-process-framework-pending-batch.md` N03（结构化验收）
> 读者：需要判断「一张任务卡为什么不能标完成」的执行者、审查者与运维

## 变更

### 问题

AIStudio 已有真实执行 gate、运行定义快照、完成契约与证据哈希链，但「完成」仍有三处缺口：

1. **独立验收只判时序，不判身份与逐条 AC。** `verification=independent` 只检查「有 `review_requested`，其后有 `completed`/`changes_requested` 事件」（`runtime/hermes_cli/kanban_db.py:3158-3173`），不校验审查者是否等于执行者、不要求逐条 AC 判定、不复核审查证据。执行方自己请求评审再自己完成，即可通过。
2. **返修无上限、无轮次证据。** `request_changes` 把卡退回实现方（`kanban_db.py:4085-4150`），但没有轮次记录与上限；同一张卡可以无限「退回—重做—再审」。SoduWork 的做法是自动 5 轮/人工 8 轮封顶，并给退回后的产出加栅栏（`workflow_engine.py:1107-1108`、`artifact_version_guard.py:21-85`）。
3. **完成拒绝只有散文，没有结构化原因。** 调用方拿到的是字符串，无法按 code 分支；SoduWork 的 `delivery_truth` 返回 `blockers[{code,title,detail,action}]`（`delivery_truth.py:315-375`），可直接驱动 UI 与重试策略。

此外，现有完成契约（`runtime/completion_contract.py`）只校验执行方回执；审查方没有一等公民的验收报告结构，逐条 AC 的判词只能散落在自由文本里。

### 范围

**新增**

- `runtime/hermes_cli/acceptance_report.py`：验收报告 schema、逐条 AC 校验、独立性校验、结构化 blockers。
- `runtime/tests/hermes_cli/test_acceptance_report.py`：纯函数单测。
- `runtime/tests/hermes_cli/test_acceptance_gate.py`：内核集成测试。

**修改**

- `runtime/hermes_cli/kanban_db.py`
  - `_gate_verification_level` 接收 `metadata`；`independent` 档要求有效验收报告。
  - `complete_task` 在完成事务内落 `acceptance_report` 事件。
  - `request_changes` 在事件 payload 记录 `reworkRound`；`request_review` 超过上限时拒绝并落 `rework_exhausted`。
  - `VerificationLevelBlocked` 增 `blockers` 字段，事件 payload 同步携带。
  - 新增 `review_cycle_closed`：最新 `changes_requested` 晚于 `review_requested` 时，旧周期上的通过报告不再接受。
- `runtime/tools/kanban_tools_schemas.py`：`kanban_complete` 的 `metadata` 说明增加 `acceptance_report` 形状。
- `runtime/tests/hermes_cli/test_kanban_verification_levels.py`：从 patch 775 的时序判据测试升级为逐条报告判据；经 manifest 覆盖宿主同路径旧测试。
- `runtime-manifest.json`：登记 `acceptance_report.py`、两个新测试与 `test_kanban_verification_levels.py` 覆盖项，保证部署面不缺文件。

**不做**

- 不改 `standard` / `strict:pr` 两档的既有行为。
- 不新增独立工具；报告随 `kanban_complete` 的 `metadata.acceptance_report` 提交。
- 不做模型/harness 级独立性判定（需要引擎身份注入，列为后续批）。
- 不做自动 AI 审查报告生成；报告由审查者（人或 Agent）提交。

### 验收判据

1. `independent` 卡无报告 → 完成被拒，落 `acceptance_blocked`，payload 含结构化 `blockers`。
2. 报告 `reviewer` 等于 `review_requested.implementer` → 拒绝（自审），blocker code=`reviewer_not_independent`。
3. 报告 `checks` 与契约 AC 条数/ID 不一致 → 拒绝，code=`criteria_mismatch`。
4. 任一 `fail` 项缺 `note`，或总体 verdict 与逐条结果矛盾 → 拒绝，code=`report_inconsistent`。
5. 全部 `pass`/`na` 且 reviewer 独立 → 完成，落 `acceptance_report` 事件。
6. 报告显式携带的 `reviewRequestedEventId` 不是当前评审周期 → 拒绝，code=`stale_review_cycle`（防重放）。
7. 最新 `changes_requested` 晚于 `review_requested`（周期已判不通过）→ 拒绝，code=`review_cycle_closed`。
8. 返修轮次超过上限 → `request_review` 拒绝并落 `rework_exhausted`；`force=True` 可越过。
9. 既有 21 个 completion contract 测试保持绿；升级后的 `test_kanban_verification_levels.py` 与新增 25 例验收测试全绿。

## 任务卡

### 完成条件

`verification=independent` 卡的完成必须携带有效逐条 AC 验收报告；返修轮次超过上限后不能再请求评审；拒绝原因结构化可机读。

### 输入与来源

任务 body 的 `AC-n` 行或 ```dod 块（经 `completion_contract.derive_contract`）、最新 `review_requested` 事件、`kanban_complete.metadata.acceptance_report`。不引入第二套卡面格式。

### 工作流边界

本批只改运行时完成内核与事件契约；不改看板 UI、不改 `standard`/`strict:pr` 档、不新增工具、不做模型/harness 级独立性。

### 工具与副作用

只复用 `kanban_complete` 的 `metadata` 通道，不新增工具；副作用限于 kanban 事件写入（`acceptance_report`/`acceptance_blocked`/`rework_exhausted`/`acceptance_override`）与任务状态迁移。

### 结果与证据

完成时落 `acceptance_report` 事件（含 reviewer、reviewRequestedEventId、逐条 checks）；拒绝时落 `acceptance_blocked`（含结构化 blockers）。证据可由 `kanban_get` 与事件回放倒查。

### 异常与恢复

报告缺失/不一致/自审/旧周期 → 拒绝并落 `acceptance_blocked`，任务保持原状态可重试；模块不可用 → `verifier_unavailable` fail-closed；紧急放行 → `HERMES_KANBAN_ACCEPTANCE_OVERRIDE=1` 并落 `acceptance_override`；返修超限 → `rework_exhausted`，`force=True` 越过。

### 验收反例

reviewer=implementer 应拒；少一条 AC 应拒；fail 无 note 应拒；pass 与 fail 混报应拒；上一周期报告重放应拒；无报告应拒。对应测试 `test_acceptance_report.py` / `test_acceptance_gate.py`。

## 决策记录

### D1 报告走 `metadata` 而非新工具

审查者完成评审时本来就要调 `kanban_complete`（review→done）。`metadata` 已随 run 与 `completed` 事件持久化，走这条现成通道零新增工具面；新增工具会扩大模型可选动作面，且在 review 态没有额外权限收益。报告结构由内核校验，不依赖工具层自觉。

### D2 独立性判据取「reviewer ≠ implementer」

`review_requested` 事件已记录 `implementer` 与 `reviewer`（`kanban_db.py:4010-4019`），这是仓库里现成、可验证的身份。报告要求 `reviewer` 与 `implementer` 规范化后不相等。模型/harness 不同、Runner 不同暂不做硬判据：当前 kanban 事件没有引擎身份字段，硬判会引入第二事实源。

### D3 `force` 不越过验收报告

`force=True` 的既有语义是越过 live-claim 栅（操作员显式覆盖在跑 worker），不是越过完成事实。若允许 `force` 跳过验收，独立审查会退化成提示词。紧急放行保留显式环境闸 `HERMES_KANBAN_ACCEPTANCE_OVERRIDE=1`，并在事件 payload 记录 `override: true`，让倒查能看见。

### D4 AC 来源复用 `completion_contract.derive_contract`

不新增第二套卡面格式。`derive_contract` 已经能从 `AC-n` 行或 ```dod 块派生 criteria（`runtime/completion_contract.py:173-221`）；验收报告直接对照这份 criteria。卡面没有 AC 时，`independent` 卡在完成时被拒（blocker code=`criteria_missing`），而不是伪造一条默认标准。

### D5 报告绑定当前评审周期

报告可选携带 `reviewRequestedEventId`；缺省时内核绑定最新 `review_requested` 事件 id 并写入规范化报告。显式给出且不匹配即拒，防止上一轮通过的报告被重放到新交付上。这与 SoduWork 的 `artifact.manifest.aiReview` 绑定 checksum/commit 同构（`release_control.py:802-843`）。

### D6 返修上限默认 5，可配可关

默认值对齐 SoduWork 的自动返修上限，但通过 `HERMES_KANBAN_MAX_REWORK_ROUNDS` 可调，`0` 或负值关闭。理由：不同团队的返修成本不同，写死数字会让机制在长尾任务上误伤；同时保留 `force` 作为人工越过通道并留痕。

### D7 事件 kind 使用新词表

新增 `acceptance_report`、`acceptance_blocked`、`rework_exhausted` 三个事件 kind。不改既有 `verification_level_result` 语义；`acceptance_blocked` 与它并存，前者面向审查报告，后者面向等级判定。

## 验证

### 单元与集成

命令（拼合树：vendor 基线 + runtime 覆盖层，host venv Python 3.14.7）：

```sh
python -m pytest \
  tests/hermes_cli/test_acceptance_report.py \
  tests/hermes_cli/test_acceptance_gate.py \
  tests/hermes_cli/test_kanban_verification_levels.py \
  tests/hermes_cli/test_completion_contract.py \
  tests/hermes_cli/test_completion_contract_gate.py -q
```

结果：**58 passed**。覆盖验收判据 1-7；`test_kanban_verification_levels.py` 从 patch 775 的时序判据升级为逐条报告判据，既有 21 例完成契约测试无回退。

### 回归

广域 kanban 回归（21 个相关测试文件）：

```sh
python -m pytest tests/hermes_cli/test_kanban_review_lifecycle*.py \
  tests/hermes_cli/test_kanban_{gates,versioned_writes,workflow,db,core_functionality,pr_acceptance,empty_completion,parent_reopen_invalidation,write_guard,write_txn_busy_retry}.py \
  tests/hermes_cli/test_board_team_{fence,keys}.py \
  tests/hermes_cli/test_completion*.py tests/hermes_cli/test_decision_grant.py \
  tests/hermes_cli/test_project_pause.py tests/hermes_cli/test_estimate_workload.py -q
```

结果：234 passed / 7 skipped / 8 failed。8 个失败（review lifecycle 5 + project pause 3）在同一拼合树换回基线旧 `kanban_db.py` 后同样失败，判定为环境/存量问题，不是本批引入。

### 未完成的全量

- `python3.14`（Homebrew）缺 `prompt_toolkit`，`tests/hermes_cli` 全量 124 个收集错误；host venv 缺 `keyring`，3 个收集错误；全量长跑超过 30 分钟未收敛，已中止。本批以目标测试 + 广域 kanban 回归为准。
- 未做真实多 Agent 会话走查：内核门与事件契约已测，活体验证需一张 `verification=independent` 的卡走完「实现→请求评审→审查报告→完成/退回」。
- 未改 UI：看板前端暂不展示验收报告逐条结果，后续批接 `acceptance_report` 事件。

## 设计文档影响

DESIGN_SYNC: none

理由：本批只新增运行时验收门与事件契约，不触及整合正本（`docs/DESIGN.md`）、数字总账或任何架构图；新增事件 kind 与报告 schema 以本 spec 为单一事实源。若后续 UI 展示或 API 契约变更，再按 touched 流程同批修订设计文档。
