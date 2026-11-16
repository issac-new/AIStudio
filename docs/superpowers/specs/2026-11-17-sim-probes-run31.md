# sim 探针 run31：新端点能力探测组（proactive 二轮／always-on／kanban version 面）

日期：2026-11-17
状态：implemented
触发：主会话任务——`mx-capability-probes.mjs` 对 2026-11-15~16 五批合入 main 的 REST 面探针零覆盖，补齐验收面（方案正本 §5.15 由主会话承接登记组号）。

## 变更

`simharness/mux/mx-capability-probes.mjs` 在既有十四组之后顺延新增三组（组号 15-17），全部遵循现有 `probe(group, name, fn)` 结构与「负例必须红」纪律；`simharness/tests/capability-probes.test.ts` 同批扩展夹具与断言；`simharness/aipay-scenario.sh` G4 note 文案随组数更新（十四组→十七组，纯文案不改判据）。

### 组 15 proactive-r2（Proactive AI 二轮 P3/P4/P5 端点）

- 正例：`GET /api/hermes/execution/earned-autonomy?profile=<PROFILE>`——trackRecord.sampleSize 数值、recommendation.direction ∈ tighten/loosen/hold、`enforcement==='advisory-only'`（只建议不动档的诚实边界声明）。
- 负例 A：`POST /api/hermes/execution/earned-autonomy/apply` 缺 profile → 400 `invalid_profile`。
- 负例 B：`POST /apply` 携唯一冷启动 profile（`mx-probe-cold-<ts>`，该 profile 账本零记录→样本 0<20→hold）→ 409 `no_tighten`，且 `applyTighten` 根本不被调用＝零写入。hold 方向拒绝先于一切写路径，与 `EARNED_AUTONOMY_AUTO_TIGHTEN` 环境闸无关（见决策记录 D1）。
- 正例：`GET /api/harness/lineage?taskId=mx-probe-no-such-<ts>`——decisions/intents/evidence/diffs 四数组＋coverage.approvalsScanned/agendasScanned/evidenceScanned 数值＋note 含「未覆盖」（三源 fail-soft 聚合形状；空集合法）。
- 负例：`GET /api/harness/lineage` 无 key → 400 `invalid_key`。
- 正例：`GET /api/hermes/standing-agenda` 列表可达（agendas 数组，空账合法）；有带 cardId 的记录时验证 `?cardId=` 过滤命中且全匹配。
- 负例：`?cardId=mx-probe-nonexistent-<ts>` → 200＋`agendas:[]` 空集＋cardId 回显（不存在卡＝空集而非报错）；`GET /api/hermes/standing-agenda/<不存在 id>` → 404 `not_found`。

### 组 16 always-on（Run 收口三态账本＋发件箱只读面）

- 正例：`GET /api/hermes/run-outcome`——records 数组＋badLines 数值（空账合法）；`GET /api/hermes/run-outcome/stats`——total/byOutcome/byReason/byRunKind/silenceShare 形状，total=0 时 silenceShare 必须为 null（不猜数）。
- 正例：`GET /api/hermes/outbox`——messages 数组（空队合法）；`GET /api/hermes/outbox/stats`——total/byStatus/backlog.pending 数值＋backlog.oldestAgeMs null 或数值。
- 负例 A：`POST /api/hermes/run-outcome` 词表外 runKind → 400（控制器参数校验先于落账，无写入）。
- 负例 B：`POST /api/hermes/outbox` 非法 recipient → 400（校验先于 enqueue，不入队）。**不探 `POST /api/hermes/outbox/dispatch`**——OUTBOX_DISPATCH=on 时会真派发通知（禁项）。

### 组 17 kanban-version（看板行级 version／expected_version 乐观锁面）

- 正例：`GET /api/hermes/kanban?board=default&limit=20`——tasks 数组、每卡 id/status 形状；**如实取证**：列表 JSON 面不携 `version`/`verification` 二列（`_TASK_DICT_FIELDS` 无此二字段，发现记入 detail，不冒充覆盖）。路由未挂/空板（单测环境）→ skipped。
- 负例（条件执行）：从列表选卡（status ∈ running/ready/blocked、detail 无 completion_contract、无父卡或全父终结）→ `POST /api/hermes/kanban/complete` 携 `task_ids:[id]`＋`summary`＋`expectedVersion:-1` → **409＋`code:'version_conflict'`**。version 列 DEFAULT 0 且触发器只递增→ -1 永不匹配；CAS 校验在写事务内先于 UPDATE→拒绝即回滚零状态变更。无合格卡 → skipped。

## 决策记录

- **D1 apply 负例的确定性构造**：直接拿任意 profile 打 apply，其方向取决于该 profile 的账本分布——若环境恰好满足收紧判据且 `EARNED_AUTONOMY_AUTO_TIGHTEN=1`，会真写会话档（破坏性）。改用**唯一冷启动 profile**（每次探测新生成）：该 profile 账本必然零记录→样本 0<冷启动阈值 20→hold 方向→409 在 `applyTighten` 之前返回（`custom/server/executioncontract/earned-autonomy.ts:200-204`），与任何环境闸无关，零写入。这是「保证被拒」的构造性证明，不是碰运气。
- **D2 kanban 负例选卡走既有卡而非建临时卡**：任务书给了「REST create 自建自清」的备选，但硬约束（只允许 GET 与保证被拒的 POST）与脚本自身纪律（「只读/只算，不写业务数据」）均禁止成功写状态的调用——建卡即写库且留审计残留（task_events 不可清），归档清理不消除残留。故降级为：对**已存在且可安全拒绝**的卡做条件负例＋无卡即 skip（组 9/组 14 条件执行先例）。`expectedVersion=-1` 对任意卡均构造性必拒（version ≥ 0 恒成立），非破坏性由源码保证（见 D3）。
- **D3 kanban 负例的前置门排除**：`complete_task` 在 CAS 之前有四道门——父卡未终结（返回 False→422 而非 409）、空证据（EmptyCompletionError，探针带 summary 排除）、verification 等级门（非 standard 卡先拒且落审计事件）、PR acceptance（有契约卡先走网络检查）。选卡条件逐项排除：status ∈ 可完成集、无 completion_contract、无父卡（或全父终结）。**残余风险如实声明**：`verification`/`goal_mode` 不在任何 REST 读面（`_TASK_DICT_FIELDS` 缺席），无法从 HTTP 面预判——SIM 场景卡由 `mx-scenario-lib` 建卡只传 title/body/assignee（不带 verification/goal），实际暴露面为零；若活体板出现非 standard 卡，该负例会以非 409 响应红出来（fail-closed 方向，不会静默误绿）。负例环境依赖：kanban REST 面依赖 Python CLI 子进程（单测不挂该路由→skip-safe，活体 studio 全量生效）。
- **D4 「GET 任务列表含 version/verification」按实测降级**：任务书假设列表面携 version/verification，源码对账（`vendor/hermes-agent/hermes_cli/kanban_output.py:16` `_TASK_DICT_FIELDS` 全量字段清单，补丁 775 未扩列）证明 CLI JSON 面（list/show 同源）不序列化此二列——它们只在 Python `Task` 对象与 DB 行上存在。正例改为「列表形状＋version 缺席如实取证」，version 能力证明由 409 CAS 负例承担。此缺口本身就是探针产出（客户端无法从 REST 构造 expected_version，是批二的读面断点），已写入报告供主会话裁决是否另立补丁。
- **D5 lineage 路径勘误**：任务书写 `GET /api/hermes/lineage`，实际挂载在 `/api/harness/lineage`（`custom/server/harness/harness-controller.ts:76`，prefix `/api/harness`）。探针按实际路径打。
- **D6 负例确定性依据汇总（file:line）**：earned-autonomy 400/409＝`earned-autonomy.ts:195,200-204`；lineage 400＝`harness-controller.ts:79-81`；standing-agenda 空集/404＝`agenda-controller.ts:58-61,66`；run-outcome 400＝`run-outcome-controller.ts:23-28`；outbox 400＝`outbox-controller.ts:29-32`；kanban 409＝补丁 775 `kanban_db.py` VersionConflictError（事务内 CAS 先于 UPDATE，version 触发器只递增）＋补丁 776 `controllers/kanban.ts` `/version conflict/i`→409 `version_conflict`。全部为输入校验或构造性状态拒绝，无环境闸依赖。
- **D7 测试夹具扩展**：新增挂载 `earnedAutonomyRouter`/`standingAgendaRouter`/`runOutcomeRouter`/`outboxRouter`（lineage 随既有 `harnessRoutes` 已在）；`HERMES_WEB_UI_HOME` 指向临时目录（standing-agenda/run-outcome/outbox/approval-ledger/evidence 的缺省根全部收敛于此，杜绝读写真机 `~/.hermes-web-ui`）；standing-agenda 种子记录（带 cardId/status）使过滤正例在单测里真实命中；断言十七组全绿＋新组负例真红绿。

## 验证

- `npm run inject`（worktree 建链）→ `npx vitest run simharness/tests/capability-probes.test.ts` 全绿（十七组探测全绿、产物计数自洽、不可达分型 exit 2 用例不回归）。
- `bash simharness/tests/run-gates.sh` 通过。
- 结果以实际执行输出为准回填本节（见下方「执行回执」）。

### 执行回执

- `npm run inject`（worktree 建链）：status=complete。
- `npx vitest run --root simharness tests/capability-probes.test.ts`：1 文件 2 用例全绿（十七组 51 探测全绿、产物落盘、不可达分型 exit 2 不回归；脚本共 51 处 `await probe(`，静态计数与报告 total 一致）。
- 变异双查（守门有效性实证，验后即还原复绿）：① 探针 apply 负例期待 code 篡改→守门红；② standing-agenda 夹具种子抽走→「过滤正例不得 skip」断言红。
- `npx vitest run --root simharness` 全量：29 文件 375 用例全绿。
- `bash simharness/tests/run-gates.sh`：sh 段唯一红＝`jargon-source-gate`，**预存在红与本轮无涉**——违规在提交态内容（方案正本 `2026-10-05-mux-v8-fullflow-plan.md` 9 处 HARD＋`mux/mx-report-gen.py:4915` 1 处），对本仓基线 b1312b8aa 与本地 main 各跑 `scripts/plan-html/jargon-check.py` 均同样 9 处（实证基线即红）；本轮 diff 未触碰该门任何被扫文件。其余 sh 守门全 ALL-PASS。

## 设计文档影响

DESIGN_SYNC: none。理由：本轮是推演验收面扩展（探针组＋守门测试），不改变任何生产行为/契约/阈值；方案正本 §5.15 的组号登记由主会话并行批承接，正本条款不在本 worktree 改动范围。
