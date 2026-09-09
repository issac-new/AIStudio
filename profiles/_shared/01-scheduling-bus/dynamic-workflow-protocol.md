# 动态工作流协议（Hermes 版 DynamicWorkflow）

> **适用范围：orchestrator 工作流定义**（27 处 worker SOUL 引用系历史批量挂接，worker 日常任务不消费本协议——2026-09-08 dogma-audit 条目 14）

> 来源：SenteLabsAI/OpenExecutive `workflows/dynamic.py:1-60` + `dynamic_models.py`（2026-09-03 源码级调研）
> Hermes 适配：不改 kanban 源码——**工作流定义 = YAML 文件**，**执行 = orchestrator 按定义扇出 kanban 卡链**（kanban 原生依赖即 execution engine）
> 定位：复杂多步交付（尽调/发版/合规审计/调研综合）的标准化复用

---

## 一、工作流定义格式（YAML，存于 `_shared/workflows/<name>.yaml`）

```yaml
# 示例：重型调研综合工作流
name: deep-research-synthesis
title: 深度调研+对抗评审+综合交付
description: N 路并行调研 → Committee 对抗评审 → 合并报告
inputs:
  topic: {type: string, required: true, description: 调研主题}
  researcher_count: {type: integer, default: 3, min: 2, max: 6}
steps:
  - id: recon
    type: specialist          # 派给某类 worker
    assignee: worker-researcher
    fanout: "{researcher_count}"   # 并行扇出 N 卡
    goal: "调研 {topic}，产出结构化报告"
  - id: committee
    type: review              # Committee 对抗评审（_shared/04-pro-capability/committee-review.md）
    depends_on: [recon]
    reviewers: 3
  - id: synthesis
    type: synthesis           # orchestrator 合并终稿
    depends_on: [committee]
    deliverable: true         # 产出合并报告交付用户
```

## 二、Step 类型（对应 dynamic.py 三种解释语义）

| type | 语义 | Hermes 映射 |
|------|------|------------|
| `specialist` | 派给某 profile 执行 | `kanban_create(assignee=..., parents=[上一步卡 id])`；`fanout: N` → N 张并行卡 |
| `review` | Committee 3-reviewer 对抗批判 | 按 `_shared/04-pro-capability/committee-review.md` 跑 delegate_task batch，产出 Critique 集 |
| `synthesis` | 汇总上游产出为终稿 | orchestrator 亲自执行（不派卡），读 parents handoff → 合并报告 |
| `approval_gate` | 暂停等人类裁决 | 卡 `kanban_block(kind="needs_input")`，人类 unblock 后续跑（= Hermes 版 WaitForHuman，见六） |

## 三、注入防御（对应 dynamic.py `_FlatFormatter`）

inputs 渲染进 goal 文本时：
- **只允许** `{name}` 平铺占位符
- **拒绝** `{x.y}`（属性访问）、`{x[0]}`（索引）、`{0}`（位置字段）
- 渲染前校验 inputs 值不含 `{`/`}` 嵌套（防二次注入）

## 四、执行纪律

1. orchestrator 收到「跑工作流 X」→ 读 `_shared/workflows/X.yaml` → 校验 inputs → 按 steps 顺序扇出 kanban 卡（parents 串依赖）
2. 每步产出经 `CompletionHandoff`（summary+metadata）交接
3. `approval_gate` 步 = 该步卡 block，**工作流其余下游卡因 parents 依赖自然悬挂**——无需改 kanban 状态机
4. 工作流产出终稿时：跑 Committee 评审（如定义含 review 步）→ 交付

## 五、与既有机制的关系

- **RD 8 阶段状态机**（rd-work）：是「单需求生命周期」的固定工作流，本协议是**通用引擎**——RD 可重写为本协议的 YAML 定义
- **kanban parents 依赖**：天然承担 execution engine（dynamic.py 里 OpenExecutive 要自写 checkpoint/resume，Hermes 用卡依赖免费获得）
- **failure-mode-playbook**：工作流执行失败时按 FM 模式定标签

## 六、WaitForHuman 协议（差距 #6 的 Hermes 落地）

> 对应 OpenExecutive `workflows/wait_for_human.py:31-50`，不改 kanban 状态机，用协议表达：

- **暂停**：卡 `kanban_block(kind="needs_input", reason="[WaitForHuman] <问题> | timeout:48h | on_timeout:escalate|proceed|fail | shape:approve_reject|free_text")`
- **等待**：dispatcher 不再拾取（blocked 态即天然悬挂）
- **恢复**：人类 unblock（回复即解决）→ 卡回 ready → dispatcher 续跑
- **超时**：orchestrator 巡检 blocked 卡超 timeout → 按 on_timeout 处置（escalate=升级用户 / proceed=放行 / fail=终止）
- **expected_reply_shape**：unblock 回复的期望形态，写入 block reason 供 worker 恢复时校验

## 七、首批内置工作流（建议）

| 工作流 | 用途 | 步骤链 |
|--------|------|--------|
| `deep-research-synthesis` | 重型调研综合 | recon(fanout) → review → synthesis |
| `payment-channel-audit` | 支付渠道合规审计 | recon(pay-infra) → review(pay-fintech+pay-clearing) → synthesis |
| `release-with-review` | 发版前评审 | implement → review → approval_gate → release |
