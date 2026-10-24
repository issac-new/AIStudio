# agent-task-size/v1 — 任务规模契约（唯一事实源）

> 定位：把功能点（FPA）思想本地化迁移为「任务规模 → 工作量 → 预算」的可解释、可拒绝伪输入、可离线复测的估算契约。本文是唯一事实源，其它文件只加引用行，不复制规则正文。
> 认证声明：Hermes 本地化启发式，非 GB/T 42588 / IFPUG / NESMA 认证计数；复杂度权重等外部数字统一标 `evidence_class: external_example`，仅作冻结进契约的参考，不自动进运行时默认。
> CLI 绝对路径：`/Users/YOURNAME/hermes-docker-sandbox/workspace/research/fpa-fusion-20260915/impl/agent_task_size.py`（worker 经 terminal 调用，是文件不是 skill）。

## 1. 字段面

顶层必填六段：`boundary` / `functions` / `adjustment` / `workload` / `budget` / `acceptance`。

| 字段 | 子项 | 约束 |
|---|---|---|
| `boundary` | `counting_scope`、`system_boundary` | 非空字符串 |
| | `users[]` | 非空，每个 `type` ∈ {human, program} |
| `functions.data[]` | `kind` | {ILF, EIF} |
| | `complexity` | {low, med, high} |
| `functions.transactional[]` | `kind` | {EI, EO, EQ} |
| | `complexity` | {low, med, high} |
| `adjustment` | `reuse` | {high, mid, low} |
| | `change_type` | {add, modify, delete} |
| | `quality_factors` | 显式取值字典（键名任意、默认空→1.0），每个取值 ∈ [0,4]，禁负数/越界 |
| `workload` | `productivity_hours_per_size` / `hours_per_month` / `workload_share` / `rate_per_person_month` | 用户或本机历史输入，须有限正数（`workload_share` ≤ 1）；`evidence_class=external_example` → 拒绝运行时预算 |
| `budget` | `goal_max_turns_estimate` | 有限数（预算参考，原样透传，不换算模型轮次） |
| | `history_anchor` / `rationale` | 非空字符串 |
| `acceptance` | — | 非空字符串数组（缺失即拒绝） |

## 2. 公式（frozen）

复杂度权重（低/中/高，标 external_example 参考）：

| kind | low | med | high |
|---|---|---|---|
| ILF | 7 | 10 | 15 |
| EIF | 5 | 7 | 10 |
| EI | 3 | 4 | 6 |
| EO | 4 | 5 | 7 |
| EQ | 3 | 4 | 6 |

```
ufp = Σ item_weight                                    # 未调整功能点数
us  = Σ (item_weight × reuse_coeff × change_coeff)     # 调整后规模
      reuse: high=1/3, mid=2/3, low=1
      change: add=1.0, modify=0.8, delete=0.2
quality_factor = 1 + 0.025 × Σ(explicit quality values) # 默认 1.0
workload_hours = us × productivity_hours_per_size × quality_factor × workload_share
workload_person_months = workload_hours / hours_per_month
cost = workload_person_months × rate_per_person_month
```

各因子是乘积关系（非加和）。`goal_max_turns_estimate` 仅作预算参考透传，估算器不把成本强行换算为轮次。

## 3. 拒绝门（frozen）

- 顶层六段任一缺失 → 拒绝（rc=2）。
- 枚举越界（kind/complexity/reuse/change_type 不在集合内）→ 拒绝。
- `quality_factors` 任一取值 <0 或 >4 → 拒绝。
- `workload` 任一须为正数的字段非有限正数，或 `workload_share` >1 → 拒绝。
- `evidence_class=external_example` → 拒绝运行时预算（13.62 人时/FP 等外部行业基准仅作对照，禁入运行时默认）。
- 任何非法输入：退出码非 0，拒绝原因 JSON 到 stderr，不产出估算。

## 4. 校准纪律

- 规模代理 = `tool_calls × tokens`：Spearman(tool_calls, tokens)=0.405，是最强可用规模代理。
- 历时（人时等效物）不可作规模代理：Spearman(duration, tokens)=0.113；`cost_usd` 覆盖 0.7%（23/3269），亦不可作规模依据。
- 因此 `workload.productivity_source` 的标定基线取 tool_call_count 与 tokens 的分布，而非 wall-clock 或 monetary cost。
- 13.62 人时/FP 等全部 external_example 仅对照、禁进运行时默认。

## 5. 边界与识别规则要点

- 边界三判据（计数范围 / 系统边界 / 用户）：counting_scope 圈定哪些算本卡工作量（已存在不重复计）；system_boundary 一张卡 = 一个可独立验收的「系统」；users 既有人也有下游卡/进程。
- 数据功能：ILF=本卡要新建/维护的持久数据实体，EIF=本卡只消费的别处维护数据依赖。临时文件/缓存/常量不计为持久数据；多 tab 不拆；共享只计一次。
- 事务功能：EI=写操作，EO=复杂读+处理（统计/排序等额外处理），EQ=仅查询展示。互斥选项组合单独计数；导出格式不同各计 EO；纯配置/报表二期不计重复。
- 基本过程=一个可独立完成任务（含正常+异常全路径），防止过度拆分。

## 6. 输出契约

成功输出（rc=0）：`schema_version`、`size.{ufp,us}`、`workload.*`、`budget.*`、`evidence`（provenance / confidence / history_anchor / no_network / no_secret_access）、`explanations[]`、`per_function_us[]`。

## 7. 接入

```bash
python3 agent_task_size.py fixtures/valid.json   # rc=0，结果 JSON 到 stdout
python3 agent_task_size.py fixtures/missing_boundary.json  # rc=2
python3 agent_task_size.py fixtures/external_example.json  # rc=2
```

仅改以上契约即视为触及本文；其它文件只许加引用行，禁止复制规则正文。

## 8. 反馈闭环

收尾 kanban_complete 前实跑偏差回写 CLI：`python3 impl/budget_deviation.py --estimate <估算JSON> --task-id <卡id> --board swarm`（只读 mode=ro）。把输出的 `budget_deviation` 片段写入 complete 的 `metadata.findings`；实测偏差供生产率基线（us→轮次）回填校准。口径：actual=Σ task_runs.metadata.worker_session_id → profile state.db sessions.tool_call_count；wall-clock 仅参考（0.113）。
