# 安全标记传播规则（Markings Propagation Rules）

> 灵感来源：Palantir Markings（mandatory control + 合取 AND + 沿文件层级和数据依赖传播）
> 适用范围：所有 Hermes agent team 的 Artifact / Finding / Report / Decision 对象
> 强制级别：🔴 机械校验（orchestrator 路由 + kanban_complete 前检查）。代码锚点：`hermes-agent/tools/kanban_tools.py` `_worktree_cleanliness_rejection`（F4-R2，complete 前 fail-closed）；clearance 校验经 kanban_create/kanban_block(capability)

---

## 一、核心原则

### 1.1 Markings 是强制控制（Mandatory Control）

与 Roles（toolsets/env_vars，自主控制）不同，Markings 是**强制控制**：
- 数据移动到哪，marking 跟到哪（travels with the data）
- 所有 derived resources 继承上游 markings
- 移除 marking 需要独立权限，不是 resource owner 能做的

### 1.2 合取传播（Conjunctive / boolean AND）

一个对象可以有多个 markings。访问者必须满足**所有** markings 才能访问。

```
Artifact A: markings=[TLP:AMBER, PII]
→ 访问者必须同时有 TLP:AMBER 资格 AND PII 资格
```

### 1.3 沿两条路径传播

| 路径 | 说明 | 示例 |
|------|------|------|
| **文件层级** | Project/folder 包含 → 内部所有文件继承 | 一个标了 PII 的目录，里面所有文件都标 PII |
| **数据依赖** | transform/analysis 依赖 → derived 继承 | report 引用了 PII artifact → report 也标 PII |

---

## 二、Hermes 适配实现

### 2.1 对象级 Markings

在 `ontology.md` 中，以下对象类型有 `markings` property：
- `Artifact` — 产出物（代码/报告/配置/数据）
- `Finding` — 发现/缺陷/风险
- `Report` — 结构化报告
- `Decision` — 决策记录
- `Task` — 任务（通过其产出的 artifact 继承）

### 2.2 传播规则（机械化）

#### 规则 1：Artifact → Report 传播
当 Report 引用（cites）一个 marked Artifact 时，Report 继承该 Artifact 的所有 markings。

```python
# 伪代码
def compute_report_markings(report):
    inherited = set(report.markings or [])
    for artifact in report.cites_artifact:
        inherited |= set(artifact.markings or [])
    return list(inherited)
```

#### 规则 2：Finding → Report 传播
当 Report 引用一个 marked Finding 时，Report 继承该 Finding 的 markings。

#### 规则 3：Task → Task 传播（parents → children）
子任务继承父任务的 markings（通过 parents 链）。

```python
def compute_task_markings(task):
    inherited = set(task.markings or [])
    for parent in task.parents:
        inherited |= set(compute_task_markings(parent))
    return list(inherited)
```

#### 规则 4：Decision → 产出的 Task 传播
基于某 marked Decision 产出的 Task，继承该 Decision 的 markings。

#### 规则 5：跨 Board 传播
当 artifact/finding/report 从一个 board 传到另一个 board 时：
- orchestrator 校验目标 board 的 assignee 是否有 marking 资格
- 资格校验：assignee profile 的 config.yaml 中 `clearances` 字段
- 不满足 → `kanban_block(kind="capability", reason="marking clearance 不足: <marking>")`

### 2.3 Clearances 配置

每个 profile 的 config.yaml 可增加 `clearances` 字段：

```yaml
# 示例：hack-auditor 的 clearances
clearances:
  - TLP:RED
  - TLP:AMBER
  - TLP:GREEN
  - CUI
  - PII
  - EYES-ONLY:hack
```

无 `clearances` 字段的 profile 默认只有 `TLP:GREEN` 和 `TLP:CLEAR`。

---

## 三、机械校验点

### 3.1 orchestrator 路由校验（跨 board 路由时）

当 orchestrator 用 `kanban_create` 创建跨 board 任务时：

```python
# orchestrator 路由逻辑（伪代码）
def create_cross_board_task(target_board, target_assignee, parent_tasks):
    # 1. 计算继承的 markings
    inherited_markings = set()
    for parent in parent_tasks:
        inherited_markings |= set(get_task_markings(parent))
    
    # 2. 校验目标 assignee 的 clearances
    assignee_clearances = get_profile_clearances(target_assignee)
    for marking in inherited_markings:
        if marking not in assignee_clearances:
            # 3. 不满足 → block
            kanban_block(
                kind="capability",
                reason=f"marking clearance 不足: 需 {marking}，{target_assignee} 仅有 {assignee_clearances}"
            )
            return
    
    # 4. 满足 → 创建任务，带 markings
    kanban_create(
        title=...,
        assignee=target_assignee,
        parents=parent_tasks,
        body=f"markings: {inherited_markings}\n...",
    )
```

### 3.2 kanban_complete 前校验

worker 在 `kanban_complete` 前：

```python
# worker 完成前校验（伪代码）
def before_complete(task_id, metadata):
    # 1. 提取产出的 artifacts
    for artifact in metadata.get("artifacts_produced", []):
        # 2. 计算继承的 markings（从引用的 findings/decisions）
        computed_markings = compute_artifact_markings(artifact)
        # 3. 如果 artifact 有 markings 但未声明 → 补全
        if set(computed_markings) - set(artifact.get("markings", [])):
            artifact["markings"] = list(set(artifact.get("markings", [])) | computed_markings)
    
    # 4. 校验：产出物的 markings 是否在 worker 的 clearances 内
    worker_clearances = get_profile_clearances(my_profile)
    for artifact in metadata.get("artifacts_produced", []):
        for marking in artifact.get("markings", []):
            if marking not in worker_clearances:
                kanban_block(
                    kind="capability",
                    reason=f"产出物含 {marking} 标记，但本 worker 无此 clearance"
                )
                return
```

### 3.3 验证脚本

可用 `search_files` 或 terminal 验证：

```bash
# 验证所有 SOUL.md 引用了 ontology
grep -rl "ontology.md" ~/.hermes/profiles/*/SOUL.md | wc -l

# 验证 clearances 配置
grep -rl "clearances" ~/.hermes/profiles/*/config.yaml | wc -l
```

---

## 四、Marking 值定义

| Marking | 含义 | 默认 clearance |
|---------|------|---------------|
| `TLP:RED` | 仅限指定个人 | 无（需显式配置） |
| `TLP:AMBER` | 仅限需要知道的人 | 无（需显式配置） |
| `TLP:GREEN` | 可在组织内共享 | 所有 profile 默认有 |
| `TLP:CLEAR` | 可公开 | 所有 profile 默认有 |
| `PII` | 含个人身份信息 | 无（需显式配置） |
| `CUI` | 受控未分类信息 | 无（需显式配置） |
| `SECRET` | 机密（需 clearance） | 无（需显式配置） |
| `EYES-ONLY:<team>` | 仅限指定团队 | 仅该 team 成员 |

---

## 五、例外与降级

### 5.1 无 markings 的对象

如果一个 artifact/finding/report 没有 markings，默认 `TLP:GREEN`。

### 5.2 紧急降级

当 marking 校验阻塞了紧急任务（如生产事故修复）：
- worker 用 `kanban_block(kind="needs_input", reason="marking clearance 紧急需人工确认")`
- 用户确认后 `kanban_unblock` 并在 comment 中记录降级授权

### 5.3 TUI/CLI 路径不受影响

markings 校验仅对 orchestrator 路由（跨 board / 跨 profile）生效。TUI/CLI 直接执行不受限（用户直接操作）。

---

## 版本

- v1.0 (2026-07-31): 初始版本

---

## 六、标记沿调用链传播（机器执法增强，2026-08-06）

> 来源：swarm-yuan 决策 28（`--stable-diff` 传播 warn + 特征卡 §11g 下游影响域），kanban task t_25432cc9 融合。
> 本节在既有**静态声明**之上补充**动态传播机制**。

### 6.1 稳定单元变更的下游 1 跳 warn

"稳定单元"的权威清单见 [`ontology.md`](ontology.md) 附录「稳定单元注册表」（注册表，2026-08-24 建立，2026-08-25 F6 并入 ontology）。当任务修改注册表内单元（或满足准入条件：stable API/公开接口/共享 schema/被 ≥2 任务依赖的 artifact）时：
- worker 在 `kanban_complete(metadata)` 中列出**下游 1 跳影响域**（直接依赖方）
- dispatcher/orchestrator 对下游任务发出 warn comment：`<file:line> 稳定单元变更，影响域: [...]`
- 下游任务开工前必须确认已读 warn（在 comment 中 ack 或 `kanban_block` 求澄清）

### 6.2 与静态 markings 的分工

| 机制 | 层 | 触发 |
|---|---|---|
| 静态 markings（§一~§五） | 数据分类（TLP/PII/CUI…） | 跨 board 路由、clearance 校验 |
| 动态传播（本节） | 变更影响域 | 稳定单元被修改时 |

两者正交：静态管"谁能看"，动态管"谁受影响"。

### 6.4 实战演练记录（P9 `t_44f56a7c`，2026-08-29 落地）

> 来源：P9 Gap-Closing 收尾，端到端验证标记沿 `derived_from` 传播 + `clearance_gate` 拦截/放行。

演练方式（`~/.hermes/bin/p9_marking_drill.py`，一键 self-test，6/6 断言全绿）：

- **Step A（产出）**：在 swarm `ontology_objects` 插入 `Artifact`（markings=`[TLP:AMBER, PII]`）。断言 ✅。
- **Step B（传播）**：插入 `Report` 并以 `derived_from` 边挂载到该 Artifact，触发 P5 落地触发器 `trg_markings_propagate`；验证 Report 的 markings 经合取 AND 自动继承为 `[TLP:AMBER, PII]`。断言 ✅。
  - 方向约定：`derived_from` 边 `from=源(Artifact)`、`to=派生物(Report)`；触发器对 `to_id` 做 markings 合取合并。
- **Step C（拦截）**：构造含 `TLP:AMBER` 的演练 task，调用 `clearance_gate(...)` 校验仅持 `TLP:GREEN/TLP:CLEAR` 的 profile `platform-ontology-curator` → `allowed=False`，`missing=[TLP:AMBER]`。断言 ✅。
- **Step D（放行）**：同一 task 校验持有 `TLP:AMBER` 资格的 profile `hack-auditor` → `allowed=True`。断言 ✅。

协作支撑：`stable_units.json`（`~/.hermes/scripts/`，9 单元，契约/接口/记忆三层）由 `ontology_validate --check-stable-units` 消费，稳定单元变更未声明 `impacted` 下游 1 跳即 rc=1 block（17/17 单测含 7 个稳定单元用例全绿）。
