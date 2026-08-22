# reportDelivery 唤醒机制（DSH RC8 融合 P2-8）

> 来源：DeepSeek Harness rc.8 `reportDelivery: 'next-step'` + Job Panel 统一管理
> 融合日期：2026-08-21
> 原则：零代码等效——全部走 prompt/规则层，不改 ACP 协议、不改 Python 源码
> 核心痛点解决：ACP `acp_send` 超时后父任务不知子代理状态（5.5 小时悬挂案例）

---

## 1. 核心概念

### reportDelivery（子代理报告投递）

DSH RC8 引入 `reportDelivery: 'quiet' | 'next-step'` 机制：
- **next-step**（默认）：子代理通过 `report` 工具主动向父代理投递消息，父代理在**最近 step 边界**被唤醒
- **quiet**：子代理报告加入上下文但不唤醒父代理，父代理等待其他输入

### Hermes 等价物

Hermes 没有 `reportDelivery` 原生机制，但可通过以下组合等效实现：
- **kanban_comment**：子代理在阶段性发现时向任务卡投递评论
- **kanban_heartbeat**：子代理定期心跳，父任务轮询检查
- **delegate_task steer**：父任务向子代理发送 course-correction

---

## 2. 触发条件（何时子代理应中途上报）

子代理在以下情况**必须**通过 `kanban_comment` 中途上报，而非等任务结束：

| 场景 | 上报内容 | 紧急度 |
|---|---|---|
| **阶段性发现改变父决策** | 发现关键证据/风险/机会，父任务可能需要调整方向 | 🔴 高 |
| **遇到阻塞无法继续** | 缺少凭据/权限/信息，需要父任务或人类决策 | 🔴 高 |
| **任务范围膨胀** | 发现实际工作量远超预期，需要重新评估 | 🟡 中 |
| **完成关键里程碑** | 阶段性成果已产出，可供父任务预览 | 🟢 低 |
| **预计超时** | 任务执行时间将超 `max_runtime_seconds` | 🟡 中 |

---

## 3. 上报协议（kanban_comment 格式）

```markdown
## reportDelivery: next-step

**阶段**: [1/3] 调研阶段完成
**发现**: <一句话核心发现>
**影响**: <对父任务决策的影响>
**建议**: <建议父任务采取的动作>
**附件**: <如有文件路径>

---
**子代理状态**: running（预计剩余 30 分钟）
**下一步**: <子代理接下来的工作计划>
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `reportDelivery` | 是 | 固定值 `next-step`（唤醒父任务）或 `quiet`（仅记录） |
| `阶段` | 是 | 当前阶段标识（如 [1/3]） |
| `发现` | 是 | 核心发现的一句话摘要 |
| `影响` | 是 | 对父任务决策的影响分析 |
| `建议` | 是 | 建议父任务采取的动作 |
| `子代理状态` | 是 | running / blocked / completed |
| `下一步` | 否 | 子代理接下来的工作计划 |

---

## 4. 父任务响应协议

父任务（orchestrator / 发起 worker）收到 `reportDelivery: next-step` 评论后：

1. **立即评估**：发现是否改变当前任务方向？
2. **决策**：
   - **继续**：子代理建议合理，不干预，等最终完成
   - **调整**：`delegate_task(action='steer', subagent_id=..., message=...)` 发送 course-correction
   - **停止**：`delegate_task(action='stop', subagent_id=...)` 终止子代理，记录原因
   - **升级**：`kanban_block(kind="needs_input", reason=...)` 请求人类决策
3. **留痕**：`kanban_comment` 记录决策理由

---

## 5. Job Panel 等效机制（kanban 看板）

DSH RC8 的 Job Panel 提供统一的子代理任务管理视图。Hermes 等价物：

| DSH Job Panel | Hermes 等价物 | 说明 |
|---|---|---|
| `job_list` | `kanban_list(status="running")` | 查看运行中任务 |
| `job_output` | `kanban_show(task_id=...)` | 查看任务详情+评论 |
| `job_kill` | `kanban_block(kind="cancelled")` | 终止任务 |
| `session/jobs` 帧 | `kanban_heartbeat` | 任务心跳 |

**统一视图**：orchestrator 可通过 `kanban_list` 跨 board 查看所有运行中任务，实现 Job Panel 的统一管理功能。

---

## 6. 自激链预算（防无限唤醒）

DSH RC8 引入 `maxConsecutiveWakes`（默认 3）：同一 owner 由完成唤醒开启的 turn 数上限，超出降级为 inject。

**Hermes 等效规则**：
- 同一任务 1 小时内最多 3 次 `reportDelivery: next-step` 唤醒
- 超出后子代理应使用 `reportDelivery: quiet`（仅记录不唤醒）
- 父任务可在 `kanban_create` 时设置 `max_reports: N` 限制

---

## 7. 反模式

- ❌ **子代理每 5 分钟发一次 next-step**（报告通胀，父任务被频繁打断）
- ❌ **子代理完成后才发报告**（失去了中途唤醒的意义）
- ❌ **父任务收到报告后不响应**（子代理不知道是否该继续）
- ❌ **用 next-step 报告琐碎进展**（"已完成 10%" 不构成唤醒理由）

---

## 8. 与现有机制的关系

| 机制 | 关系 | 说明 |
|---|---|---|
| `kanban_comment` | 载体 | reportDelivery 的投递通道 |
| `kanban_heartbeat` | 互补 | heartbeat 是"我还活着"，reportDelivery 是"我有重要发现" |
| `delegate_task steer` | 响应 | 父任务调整子代理方向的通道 |
| `kanban_block` | 升级 | 子代理阻塞时的升级路径 |
| `acp_send` | 底层 | ACP 长任务悬挂问题的上层缓解 |

---

## 9. 落地检查清单

- [ ] 子代理 SOUL.md 包含 reportDelivery 触发条件
- [ ] 子代理 SOUL.md 包含 kanban_comment 上报格式
- [ ] orchestrator SOUL.md 包含父任务响应协议
- [ ] 自激链预算规则（1 小时 3 次上限）已记录

---

## SOUL 内单行引用

```
reportDelivery 唤醒（详见 _shared/reportdelivery-protocol.md）：子代理阶段性发现必须 kanban_comment 中途上报（next-step），父任务评估后 steer/stop/继续/升级，1 小时 3 次唤醒上限。
```
