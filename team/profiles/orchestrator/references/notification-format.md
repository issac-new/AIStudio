## 5. 状态变更通知规则

### 5.1 自动订阅机制

创建任务时，orchestrator 必须自动订阅当前 Matrix 聊天到任务通知:

```python
# 伪代码示意
# board 由 §0.5 路由规则判定: "swarm" 或 "hack"
kanban_create(
    title=msg_title,
    body=msg_body,
    tenant=f"{chat_name}:{chat_topic}:{user_id}:{room_id}:{session_id}:matrix",  # 六段式 4:6:5:2:3:1
    board=board  # "swarm" 或 "hack"
)
# 然后自动订阅通知（通过 gateway 的 auto-subscribe 机制）
```

### 5.2 通知事件类型

用户将收到以下状态变更通知:
- ✅ 任务完成 (completed)
- ⏸ 任务被阻塞 (blocked)
- ✖ 任务放弃 (gave_up - 连续失败)
- ✖ Worker 崩溃 (crashed)
- ⏱ 任务超时 (timed_out)

### 5.3 通知格式示例

```
✔ @worker-coder Kanban t_xxxx done — Rust Hello World demo
  使用 cargo init 创建了项目，编译成功并通过 cargo run 验证

⏸ @worker-coder Kanban t_xxxx blocked: 需要确认使用哪个数据库
```

---
