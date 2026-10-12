# Cost Governance 宪章

适用层：运行时成本规则。机制细节与证据锚：`research/fusion-20260915-memory-cost/REPORT-cost.md`（本宪章不重复其正文，只定操作规则）。来源：CMU "Better Harnesses, Smaller Models" (arXiv:2607.08938)。

## 1. 难度移出模型（C2）

派工 brief 必须显式拆「决策层/执行层」：决策层（orchestrator / 人类）保留任务定义、验收标准与约束；执行层（worker）仅完成 harness 划定的任务。模型不承担决策责任。

给 worker-coder 委托 ACP 时的 prompt 模板：

```text
模板 A（决策层给执行层的派工 prompt）：
"你只负责执行以下已结构化任务。目标、验收标准、动作空间和失败预期均已写明。
若发现边界模糊或缺少必要输入，停止执行并报告——不要自行补全决策。"

模板 B（升档决策 prompt）：
"你当前任务已归因：<四类缺口之一>。harness 修法为 <对应修法>。
若 harness 修法不可行，再考虑升档模型。不自动升档。"
```

## 2. 动作空间收窄（C3）

任务卡 skills/工具面按域最小化（参见 skill-board-scoping 惯例）。过滤不需要的 MCP 工具，减少模型选择错误与无关调用。

执行层 manifest 必须声明 `## 动作空间`（本卡允许的工具/skills 面），验收时核对实际调用是否在声明范围内。

## 3. harness 先行纪律（C1 核心）

性能不达标 / 成本超标时，**先跑 `failure-classify.py` 归因再决定升档模型**。四类缺口各有对应 harness 修法：

| 缺口类型 | harness 修法 |
|---|---|
| tool-use | 收窄动作空间；过滤无关 MCP；封装重复操作为工具 |
| instruction | brief 契约强化；显式验收项二分化；WHAT-not-HOW 补全 |
| long-context | 拆卡 / 压缩上下文；单一事实源引用替代内联大段 |
| plan-reasoning | 升档模型或换路径；仅当 harness 修法不可行时 |

A3 结论（分级裁决）：

> harness 可转移难度但替代不了核心能力缺失：流程固定任务适合小模型+专用 harness，开放任务不适合。

执行时引用：流程固定型任务（预算审批、考勤审计、库存预警）走 harness 优先；开放任务（代码重构、需求分析）保留模型能力预算，不强行降档。

## 4. 反循环

集群等效物：`cognition-lattice`（orchestrator_integration.md §七A 守门清单：不信任自述、验证后再宣称）+ kanban `max_retries` 硬限额。

判定逻辑：同一任务同一卡，连续失败/连续印证 N 次（SPINNING 模式）→ 停止重试，改走 `kanban_block(kind="needs_input")` 或升评审。不新增基础设施；判「印证」不判「吸收」。

A3 anti_loop_hook.py（预算审批案例）等效映射：当 worker 准备向同一目标发送等效输出时，harness 拒绝调用并要求进入下一步或结束任务——在 Hermes 集群中由 kanban max_retries + SPINNING 判定覆盖，不单独部署 hook 进程。

## 5. per-task 归因口径

主口径：`task-cost-attribution.py`，state.db session join 到任务级。

方向性口径（不可直 join）：cc-switch 时间窗口径。原因：cc-switch 的 session_id 格式与 state.db 不同，不可直接 join。预算评审时只做方向性参考（时间窗内成本趋势），不做精确归因。

产物路径：`research/metrics/` 下的 baseline JSON。评审时引用最新基线，与历史窗口对比，不单独看绝对值。

```
review 命令：
~/.hermes/bin/task-cost-attribution.py --flag-review   # >=3× median 候选
~/.hermes/bin/failure-classify.py --dump-unclassified   # 未分类机器可读
```

per-task 规模→工作量换算的唯一事实源见 [`agent-task-size-v1.md`](~/.hermes/profiles/_shared/06-observability/agent-task-size-v1.md)（本处只加指针，禁止抄公式）。

## 6. 复杂度感知接纳（提案扩开支须证明收益匹配）

> 与 §3 互补：§3 管「不达标先修 harness」，本节管「提案扩开支必须证明收益匹配」。取 Ridge 回归判定精神，不搬论文拟合系数。

**规则**：skill/SOUL 提案若预估增加 token 开销（prompt 变长 / 新增步骤 / 新增组件），须声明「预估开支增幅」与「预期收益」；收益须与开支匹配——小幅收益不得正当化大幅开支。

**落地形式**（本节只定规则；`evo_nightly.py` 提案字段接线待后续卡）：

- evo 提案模板增加两个**可选**字段：
  - `estimated_cost_delta`（枚举）：`low`（<10%）/ `medium`（10-30%）/ `high`（>30%）
  - `expected_benefit`（一句话）：预期收益，须可核验
- 晨报裁决：`estimated_cost_delta=high` 而 `expected_benefit` 模糊（无可核验锚）的提案默认判 3（拒绝）
- 字段可选是为向后兼容存量提案；触发本节规则（预估增加 token 开销）的提案必填，缺填在晨报打回补
