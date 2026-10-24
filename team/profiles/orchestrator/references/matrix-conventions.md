## 7. Matrix 协作约定

### 7.1 任务请求格式

团队成员通过 Matrix 消息请求任务时，应遵循以下格式：

**基本格式**：
```
@成员-Agent [话题标签] 任务描述
```

**示例**：
```
@worker-coder-Agent [bugfix] 修复登录失败问题
@worker-researcher-Agent [research] 调研最佳认证方案
@architect-Agent [feature] 设计用户认证架构
```

### 7.2 优先级标记

紧急任务可添加优先级标记：

| 标记 | 优先级 | 说明 |
|------|--------|------|
| `[P0]` | 最高 | 生产故障、紧急修复 |
| `[P1]` | 高 | 重要功能、本周完成 |
| `[P2]` | 中 | 常规任务、两周内完成 |
| `[P3]` | 低 | 优化改进、有空处理 |

**示例**：
```
@worker-coder-Agent [bugfix][P0] 生产环境崩溃，需要立即修复
@worker-researcher-Agent [research][P1] 本周完成认证方案调研
```

### 7.3 任务引用格式

跨 Agent 任务引用时，携带上游任务信息：

```
@成员-Agent 请处理以下任务:
- 标题: Review 认证模块
- 优先级: P1
- 上游任务: lead:swarm:t_abc123
- 预期产出: review报告 + 修改建议
```

**约定**：
- `上游任务` 格式: `<sender_name>:<board>:<task_id>`
- 接收方 Agent 在创建本地任务时，将上游信息记录到 `metadata`:
  ```python
  metadata={
      "upstream_agent": "lead",
      "upstream_board": "swarm",
      "upstream_task": "t_abc123"
  }
  ```

### 7.4 任务完成通知

任务完成后，系统自动通知原 Matrix 群聊：

```
✔ @worker-coder Kanban t_xxxx done — Review 认证模块
  完成代码检查，发现3个问题，已提交修改建议
```

### 7.5 任务阻塞通知

当任务需要人工决策时，Agent 发送阻塞通知：

```
⏸ @worker-coder Kanban t_xxxx blocked: 需要确认使用哪个数据库
  已完成调研，需要技术 Lead 选择: PostgreSQL / MySQL / MongoDB
```

**阻塞处理流程**：
1. Lead 在 Matrix 群聊回复决策
2. Lead 的 Agent 创建新任务或直接回复
3. 原任务解除阻塞继续执行

### 7.6 跨团队协作格式

部门级协作通过 Matrix 房间进行：

```
@运维团队-Agent [infra] 配置生产环境监控
- 关联项目: 认证系统 v2.0
- 负责人: @成员A
- 截止日期: 2026-07-15
```

**tenant 格式**：
```python
tenant = "部门运维群:认证系统监控:成员A:...:matrix"
```

---
