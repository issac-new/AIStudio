# DoD 完成契约会话接线：契约随 kanban_json 进入内层 agent

日期：2026-11-01
状态：implemented
触发：dod-drill R3 复盘——正例卡（t_4ce664d8）工具面完成却无 `completion_receipt` 落库。根因：每卡两进程，外层 worker client（派发 env 已含契约，实测）与内层 agent 进程（工具真正执行处）分离——内层由 gateway 会话机制经 `bind_worker_context` 从 `kanban_json` 策略**重建** env（仅显式清单：TASK/BOARD/DB/RUN_ID/CLAIM_LOCK/WORKSPACE/…），派发进程的 env 不继承。契约从未到达工具执行进程，内核门因 env 空而正确地 no-op。

## 变更

- `runtime/gateway/session_kanban.py`（新入 manifest，52 号）：
  - `build_kanban_policy`：会话策略构建（＝派发）瞬间 `derive_contract(task.body)` 冻进 `kanban_json` 上下文键 `dod_contract`（`mode=off` 不占键；派生异常按无契约处理不阻断派发）——与「派发时锁定契约源」语义同构：会话重试恢复（`saved` receipt）复用同一上下文，契约不漂移。
  - `bind_worker_context`：`dod_contract` 在上下文时导出 `HERMES_KANBAN_DOD_CONTRACT`（compact JSON）与 `HERMES_KANBAN_DOD_SOURCE_SHA256` 到内层 agent env。
- 兼容：旧会话（本变更前创建）上下文无 `dod_contract` → 无 env → 内核门 no-op，在途卡不受影响。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 契约进 kanban_json 而非内层 spawn 时现算 | 会话策略是派发瞬间的冻结面（source 哈希同源）；重试/恢复复用同一策略，契约不随卡面改动漂移 | bind 时读库现派生（否决：卡面改后重连即漂移，破坏源锁语义） | 是 |
| D2 | 派生异常按无契约放行 | 派发可用性优先；完成门侧另有「契约 unparseable fail-closed」兜底 | 派生失败拒绝派发（否决：completion_contract 缺失会瘫痪全板派发） | 是 |
| D3 | 不为 bind_worker_context 写 DB-mock 单测 | 该函数 env 段后紧跟真实 DB 会话检查，mock 面大而值低；真实验证由 R4 全链演练承担（真实派发→真实会话→真实工具→真实内核门） | 补重 mock 单测（否决：mock 的是会话存储细节，不是契约语义） | 是 |

## 验证

- `python3.14 -m py_compile runtime/gateway/session_kanban.py` 通过。
- R4 真实演练（部署＋重启后）：负例卡工具面无回执完成被拒（`completion_blocked_contract` 事件＋结构化错误回流 worker）后带回执过门；正例卡 `completion_receipt` 落库——结果实记于交付说明。
- 诚实边界：R3 及更早的在途会话不携带契约（设计内豁免）；`goal_text` 仍含卡面全文，agent 可见 AC 但旧会话无强制。

## 设计文档影响

DESIGN_SYNC: none

接线修复，不改四层架构与阈值；A 层机制仍以 `2026-10-31-model-resilience-hardening.md`＋`2026-11-01-dod-kernel-gate-lineage-reclaim.md` 为准。
