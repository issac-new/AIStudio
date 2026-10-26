# 动态工作流协议（Hermes 版 DynamicWorkflow）

> **适用范围：orchestrator 工作流定义**（worker 日常任务不消费本协议）
> Hermes 适配：不改 kanban 源码——**工作流定义 = YAML 文件**，**执行 = orchestrator 按定义扇出 kanban 卡链**（kanban 原生依赖即 execution engine）
> 定位：复杂多步交付（尽调/发版/合规审计/调研综合）的标准化复用。原型：SenteLabsAI/OpenExecutive workflows/dynamic.py

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

### §六-2 steps_fingerprint 暂停期防偷换（openexec N2 融合 2026-10-19）

> 来源：OpenExecutive `workflows/wait_for_human.py:52-120`（WorkflowResumeState.steps_fingerprint）。上游动机原文：暂停期间有人保持 gate 步骤不动、偷换 gate **之后**的每一个步骤——审批人批准的是他看到的问题，回执却记在他从未见过的工作上，审批门就失效了。

- **block 时快照**：卡 `kanban_block(kind="needs_input")` 时，把 **body 全文 + 验收标准清单** 的 sha256 哈希写入 `metadata.steps_fingerprint`（同轮附 `steps_sha256` 字符串与快照时间）。多步卡再加每个子步骤（YAML steps）拼接哈希。计算例：
  ```bash
  python3 -c "import hashlib,sys;print(hashlib.sha256(open('<body_file>').read().encode()).hexdigest())"
  ```
- **unblock/dispatch 前比对**：dispatcher/续跑 worker 拿卡后先重算 body+验收标准哈希，与 `metadata.steps_fingerprint` 比对：
  - **一致** → 正常续跑。
  - **不一致** → 该 unblock 回执**不能记在当前卡内容上**：打回重新走审批（回 blocked 并 @审批人），`kanban_comment` 留痕「fingerprint 不一致：block 时 <旧哈希前8位> / 复跑时 <新哈希前8位>，卡内容在暂停期被改动」。
- **只防偷换，不冻更新**：确需在暂停期改卡的正当流程 = 先改 body → comment 声明改动点并 @原审批人 → 重新 block 走审批 → 新 fingerprint 覆盖旧值。改动透明即合法；静默改才是偷换。
- **上游同型锚**：`gate_step_index` 派生不存储（两份游标会打架，攻击者控制的那份会赢）——本侧同理由 comment 留痕承担审计轨迹，不另存第二份步骤游标。

## 七、首批内置工作流（建议）

| 工作流 | 用途 | 步骤链 |
|--------|------|--------|
| `deep-research-synthesis` | 重型调研综合 | recon(fanout) → review → synthesis |
| `payment-channel-audit` | 支付渠道合规审计 | recon(pay-infra) → review(pay-fintech+pay-clearing) → synthesis |
| `release-with-review` | 发版前评审 | implement → review → approval_gate → release |

## 八、图拓扑设计规则（指针）

> 图拓扑纪律（fan-in 容错硬边/软依赖分层、barrier 节俭、循环收敛三判据）的规范正文落在
> skill `devops/kanban-orchestrator` §Graph Engineering 派工纪律——
> 分解时实际消费方在该 skill，此处只放指针不重复表述，防双源漂移。
> Node Contract 交付 schema 纪律在 skill `devops/delegation-brief-format` §交付格式。

## 九、工作流沉淀闭环

成功的 diamond 分解是工程资产，不止是一次性卡图：

- **触发器**：orchestrator 在 `kanban_complete` 一张 synthesis 卡（≥2 parents 且 metadata.deliverable）时执行沉淀动作——检查该卡图结构是否值得复用。
- **沉淀判据**：该结构**第二次**成功复用后才升为独立 `_shared/workflows/<name>.yaml`（首跑即沉淀会囤积一次性管线；复跑验证后才算资产）。首跑成功先在任务 metadata 记 `workflow_candidate` 结构。
- **格式**：沿用本协议 §一 YAML schema，不自造格式。
- **版本化**：YAML 即版本控制单元，改动走 git；改名/删除须 grep 全库旧名引用。
