---
name: task-type-gate-routing
description: "任务类型×门禁路由：7 类任务映射验证强度（feature/fix/refactor/chore/docs/test/exp）+ kanban metadata 扩展约定+破窗台账 open_count。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, gate-routing, task-type, kanban-metadata, windows-ledger, swarm-yuan-fusion]
    related_skills: [pua-methodology-router, scale-adaptive-routing, adversarial-review-lens]
---

# Task-Type Gate Routing（任务类型×门禁路由）

> 来源：swarm-yuan `assets/task-type-gates.conf`（7 类任务→门禁集映射）+ `gsd-patterns.md:160-200` 破窗台账，适配 Hermes kanban metadata。
> 定位：**执行前+完成时双防线**——kanban 任务卡携带类型标签，dispatch 与验收按类型决定验证强度；跨任务技术债显式化。

## 触发条件 / When to Use

- orchestrator `kanban_create` 编码类任务时（打 task_type 标签）
- worker-coder 开工时（按 task_type 决定验证档）
- `kanban_complete` 前（破窗台账 open_count 检查）
- 与 `pua-methodology-router` 并存：本 skill 路由**验证强度**，pua-router 路由**方法论**

## 核心内容

### 1. 七类任务 → 验证强度映射

| task_type | 验证档 | 说明 |
|---|---|---|
| feature | standard | 完整测试 + 审查 lens |
| fix | standard + reuse-check | 加"同类缺陷 siblings 检查"（修一类不是修一个） |
| refactor | standard + behavior-equivalence | 行为等价验证（测试不变全绿） |
| chore | core | 最小验证（构建过即可） |
| docs | docs-only | 链接有效性 + 无代码门禁 |
| test | core + coverage-delta | 测试自身质量 + 覆盖率变化 |
| exp | core | 实验性，但结论必须证据化 |

与 spec 规模档（scale-adaptive-routing）**正交取并集**：规模决定走哪条轨道，类型决定验证强度。

### 2. kanban metadata 扩展约定

`kanban_create` 时（通过 body 或后续 comment 约定）：

```json
{
  "task_type": "feature|fix|refactor|chore|docs|test|exp",
  "gate_level": "core|standard|compliance",
  "verify_command": "<可选，script-based Oracle Gate 验证命令>"
}
```

`kanban_complete` 时对应回传：

```json
{
  "gate_results": {"command": "<实际跑的验证>", "exit_code": 0, "failures": []},
  "confidence": "extracted|inferred|ambiguous",
  "windows_open_count": 0
}
```

### 3. Oracle Gate（脚本验证补充 LLM judge）

- `verify_command` 存在时：kanban_complete 前**必须跑该脚本**，exit 0 才算过
  （agent 自报完成不算数，外部脚本验证才算——与 swarm-yuan Oracle Gate 同构）
- 这是对 goal_mode LLM judge 的**补充不是替代**：judge 判语义完成度，script 判机械正确性
- Stall Detection：同一任务连续 5 次 run 未过 verify_command → 强制 `kanban_block` 回退需求层

### 4. 破窗台账（Windows Ledger）

跨任务技术债显式化，机器可读：

```markdown
# windows entry（记在任务 comment 或 workspace WINDOWS.md）
- kind: stub|skipped-test|unrun-verify|waived-gate
- ref: <file:line 或任务 id>
- introduced_by: <task-id>
- waive: <UserChallenge 决策引用，若被豁免>
```

**纪律**：
- 父任务收尾时汇总子任务 open_count
- ship/里程碑前 open_count==0 才放行（warn 不 fail，但 >0 必须显式 waive）
- waive 必须走 decision-taxonomy 的 UserChallenge 流程留痕

### 5. 与 pua-methodology-router 的并存协议

| 维度 | 本 skill | pua-methodology-router |
|---|---|---|
| 路由对象 | 验证强度（跑多严的检查） | 方法论（用什么思路解） |
| 触发时机 | create/dispatch/complete | 执行中遇阻 |
| 标签 | task_type + gate_level | methodology 名 |

两者标签可同时携带，互不冲突。

## 与其他 skill 的联动

- `scale-adaptive-routing`：规模轨道 × 类型验证强度，正交
- `decision-taxonomy`：waive 走 UserChallenge；confidence 标记同源
- `adversarial-review-lens`：standard 档审查调用对抗 lens
- `evidence-based-retro`：破窗台账是复盘的固定章节

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create` | body frontmatter 或首行声明 task_type/gate_level |
| `kanban_complete(metadata=...)` | gate_results/confidence/windows_open_count |
| goal_mode | verify_command 作为 script judge 补充 |
| 里程碑收尾 | open_count 汇总检查 |
