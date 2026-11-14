# 超级智能体吸收批二：任务版本化与分级验证 spec（草案，待批准）

> 日期：2026-11-14
> 状态：已评审（用户于 2026-11-14 批准实施）
> 来源：批一 spec §8 第二批边界（`2026-11-13-superagent-contract-closure.md`）；现状证据＝批一三路探查报告（2026-11-13）
> 范围：三件中的前两件——任务级 version/统一迁移 envelope、按风险分级完成验证。第三件（reasoningEffort/订阅模式接实际派单）牵动 orchestrator 运行态且消费方未定，本批仍不纳入，待前两件稳定后单独立项。

## 0. 任务卡审查七项

### 0.1 业务完成条件

带旧版本号的写请求被 409 拒绝且事件流可回答"谁在何时为何把任务从什么状态改成什么状态"；声明了验证等级的任务在等级未满足时不能 done，等级判定全程留痕。既有看板读写路径行为不回归。

### 0.2 输入与来源

输入＝既有 tasks/task_events 表、complete_task/claim/request_review 等动词、HumanGate revision、PR acceptance、Person verifier。无新增外部依赖；schema 迁移必须向前兼容（旧库缺列可自动补齐且不重写历史行）。

### 0.3 工作流边界

version 递增只发生在写事务内；迁移 envelope 五字段（version/actor/time/reason/trace_id）缺一该事件不落；验证等级只在 complete_task 单点拦（worker 完成与 review 批准两入口共用同一门，无独立"review-promote"动词）；等级拒绝＝与 EmptyCompletion 同型的完成拒绝路径，**不自动改任务状态**——工具错误文本指导 worker 转 request_review（independent）或待 PR 转绿后重试（strict），熔断/回收语义沿用既有失败路径；机械证据不足时等级判定降级为"未满足"并明示原因，不猜通过。

### 0.4 工具与副作用

complete_task 是唯一完成写点（既有内核门全部保留）；分级验证本身只读既有证据（PR checks/Person verdict/claims 回执），不新增副作用调用；envelope 写失败＝整个状态迁移失败（同事务回滚）。

### 0.5 结果与证据

每个 task_events 行带五字段 envelope；拒绝写入返回 409 附当前 version 与期望 version；验证等级结果（level/satisfied/evidence_refs/reason）存入完成事件的 metadata。

### 0.6 异常与恢复

旧客户端不带 expectedVersion：默认放行（兼容期）但事件记 actor=legacy、version 快照照写——新旧客户端可共存；列迁移在连接初始化幂等执行（ALTER TABLE ADD COLUMN IF NOT EXISTS 语义，SQLite 用 PRAGMA 探测）；等级判定器异常＝fail-closed 判"未满足"并落原因。

### 0.7 验收反例

必须拦住：旧版本号覆盖新状态；envelope 缺 reason/trace_id 的事件落库；声明 strict 等级但仅凭非空 summary 完成；等级判定器崩溃导致放行；无迁移的旧库打开即炸；既有 CLI/工具/面板路径因 envelope 缺省而全部失败。

## 0.8 批准前六问

1. **决策**：把"谁改了什么、凭什么完成"从隐式变显式可查；给看板维护者与审计者用。
2. **口径**：现状锚点＝批一探查（tasks 表无 version 列 @kanban_db.py:952-1060；complete_task 非空即过 :3002-3131；PR/Person 强验证存在但 opt-in）。
3. **可逆性**：新增列可回填可保留；分级验证默认档=现状（仅 DoD 契约门），不开即无行为变化。
4. **署名**：主会话实现，独立审查子代理复核，用户批准本 spec。
5. **停止条件**：既有六闸/全量回归新增红、旧库迁移损坏、兼容期放行路径被误拦即停。
6. **语法**：只动状态写事务与完成门语义；不动计费/考核/数据权属，不动 orchestrator。

## 1. 背景

批一修的是"结果不可信"（未验证输出冒充完成、无全文摘要、越权写入）。批二修"过程不可查"：任务事实链无版本（旧快照可覆盖新状态）、迁移事件缺 actor/reason/trace_id、完成验证强度单一（有 gates.json 才有门，否则非空即过）。三件是批一调研确认的最深两层缺口。

## 2. 决策记录

| 编号 | 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|---|
| D1 | version 语义 | tasks 行级乐观锁（version 列＋写事务内递增） | run 级 CAS 扩展 | run CAS 只防旧 attempt，防不了旧快照；行级 version 是通用面 | Mechanical |
| D2 | 兼容策略 | 缺 expectedVersion 默认放行＋事件记 legacy | 强制全端先升级 | 工具/CLI/面板多入口一次全改不现实；兼容期事件可识别流量面 | Taste |
| D3 | envelope 落点 | task_events 每行五字段（列扩展＋payload 规范） | 新表 | 事件流是既有查询面；新表制造第二事实源 | Mechanical |
| D4 | 验证分级 | 卡级 `verification` 新列三档：`standard`（现状 DoD 契约门，缺省）/`independent`（需有效 review handoff——reviewer run 的 verdict）/`strict`（PR acceptance store 必过，值写作 `strict:pr`）；Person verifier/claims 回执不进本批（证据在 studio 侧库，Python 读＝第二事实源——留作后续显式接入点） | 全局配置；或 Python 直读 studio 库 | 风险按卡声明不按板一刀切；两档证据均为 kanban 库内既有可读源（kanban_pr_acceptance_store/review lane），零新通道零第二事实源 | Taste |
| D5 | 等级不满足时 | fail-closed 拒完成＋结构化原因 | 警告放行 | 批一纪律：验证声明了就必须满足 | Mechanical |

## 3. 变更（Spec Delta 摘要）

### Requirement: 任务行级版本与迁移 envelope

tasks SHALL 增 `version INTEGER NOT NULL DEFAULT 0`；**所有改 tasks 行的路径**——操作者动词（complete/block/schedule/request_review/request_changes/unblock/reopen/archive/specify/patch）与内核内部迁移（claim/claim_review/recompute_ready 的 promoted/release_stale/reclaim/失效级联/dispatcher 自动完成）——均在写事务内 `version=version+1` 并给 `_append_event` 传五字段 envelope（version/actor/time/reason/trace_id；trace_id 缺省＝本次写事务 UUID；内核路径 actor=既有事件 kind 体系标识）。内部迁移同样递增是 §0.1 保证无洞的前提：claim 打断后旧 worker 持旧 version 写回必 409，与 attempt CAS 同向加固。携带 `expected_version` 且不等于当前值时 MUST 409（CLI 语义＝拒绝并列出当前 version）；未携带时兼容放行、事件记 `reason="legacy:<verb>"`＋actor=调用方身份（工具路径取 profile/claimer env，CLI 缺省 `cli`）＋`legacy=1`。

#### Scenario: 旧快照覆盖被拒
- WHEN 客户端 A、B 同时读到 version=5，A 先完成写入（version→6），B 带 expected_version=5 请求 block
- THEN B 收到 409（附 current_version=6），事件流多一条 A 的 completed（version=6）且无 B 的 block

#### Scenario: 兼容期共存
- WHEN 旧工具不带 expected_version 调 complete
- THEN 状态照迁、version 照增、事件 envelope actor 带 legacy 标记；新客户端随后带新 version 写入成功

### Requirement: 完成验证分级

卡 SHALL 支持可选 `verification: standard|independent|strict`（缺省 standard＝现状）。complete_task 在现状各门（gates.json/DoD 契约/PR acceptance）之后追加等级判定：`independent` 需既有 claims 回执或 review lane 的独立 reviewer run 回执；`strict` 需 PR acceptance 通过或 Person verifier verdict=passed（按卡声明二选一）。不满足时 EmptyCompletion 同型拒绝路径（blocked by verification level），原因结构化落事件。

#### Scenario: strict 卡非空 summary 不能过
- WHEN strict 卡（声明 PR 通道）complete 时 PR required checks 未过
- THEN complete 拒绝，事件留 verification_level_result{level, satisfied:false, evidence_refs, reason}；PR 过后同请求成功且 result 带 satisfied:true

#### Scenario: 判定器异常 fail-closed
- WHEN 等级判定器读 PR 状态时网络异常
- THEN 拒绝完成、reason=verifier_unavailable；不回退 standard、不猜通过

### 3.3.1 verification 字段载体

`tasks.verification TEXT`（缺省 NULL=standard；值域 `standard|independent|strict:pr`，通道并入同字段避免双字段）。create/specify/patch（CLI＋工具 schema＋studio patch body）透传写入；非法值在建/改时拒绝。

### 3.4 预计载体（实现期细化）

- 补丁（hermes-agent）：`kanban_db.py` schema/动词/envelope/等级判定；`kanban_tools.py` 工具参数透传 expected_version 与 verification；CLI 对应动词参数。
- 补丁（hermes-studio）：complete/patch/block/status-bulk 四面 API 透传 expected_version，409 映射 `version_conflict`；Vue 客户端改造显式挂账下一批（drag-drop 暂走 legacy 兼容路径）。
- runtime 三镜像同步：`runtime/hermes_cli/kanban_db.py`、`runtime/hermes_cli/kanban.py`、`runtime/tools/kanban_tools.py` 与补丁后 vendor 保持字节同构（实测当前三文件双载一致；缺一即 studio 子进程/worker/面板跑旧内核）＋宿主 `--apply --force` 重部署（批一配方）。
- 测试：schema 迁移幂等/旧库兼容、五动词 409、兼容放行、三档等级×满足/不满足/判定器异常、既有全动词回归。
- 预算：patches +3 内、runtime 镜像三文件随批（不计数目）、无新脚本/账本；DESIGN.md 能力行 +1。

## 4. 复用/安全约束（摘要）

复用 `_append_event` 唯一写入口、write_txn 事务边界、PR acceptance store、Person acceptance service、claims 回执核验；不新建验证通道。envelope 的 reason 不落敏感正文（沿用审计脱敏纪律）；trace_id 不含会话内容。迁移在 `ensure_schema` 幂等段执行，失败拒绝开库（fail-closed）。

## 5. 验证设计（命令与判定口径，先红后绿）

- pytest（hermes-agent 面）：新增 `test_kanban_versioned_writes.py`（含 claim 打断 409、recompute_ready promoted 递增、legacy envelope 合成）、`test_kanban_verification_levels.py`（strict:pr 两态＋independent review handoff＋判定器 fail-closed＋worker 完成被拒后指引文本）；回归既有 kanban_db/kanban_gates/completion_contract/pr_acceptance 全套＋`diff -q` 三镜像同构断言。
- vitest（studio 面）：API 透传/409 映射/等级拒绝 422 结构。
- 全量 `npm test`＋`npm run typecheck:harness`＋runtime pytest 不回归。
- 变异探针：摘 version 递增→409 用例红；摘等级判定→strict 用例红；摘迁移幂等→旧库用例红。

## 6. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 旧库迁移损坏 | PRAGMA 探测＋幂等 ALTER＋迁移用例先红 | 回退补丁即回旧 schema（新列残留无害） |
| 兼容放行被误拦 | 兼容路径专用用例＋全动词回归 | expectedVersion 通道整体可单独回退 |
| 等级判定拖慢 complete | 判定只在 complete/review-promote 两个点、PR/Person 均为既有缓存读 | verification 字段缺省即零成本路径 |

## 7. 设计文档影响

`DESIGN_SYNC: touched`——`docs/DESIGN.md` 能力行补"任务版本化与分级验证（2026-11-14 批二）"；设计总账不触及（§D 规则同批一）。

## 8. 不做（本批边界）

第三件调度接线（reasoningEffort/订阅 wake-notify-context 入 dispatcher/orchestrator）；六闸/推演面改动；执行内核统一批既定范围（guarded 合流/P3 Ekko 退役）不受本批影响。
