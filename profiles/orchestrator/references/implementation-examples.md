## 9. 实现示例

### 9.1 创建任务（使用结构化 tenant）

```python
# board 由 §0.5 路由规则判定: "swarm"（默认）或 "hack"（安全类）
# chat_name 可用时 → 六段式 群聊名称:話題摘要:user_id:room_id:session_id:matrix
# 会话上下文:
#   **Source:** Matrix (group: 跨团队协作群01)
#   **User ID:** @testuser3:matrix.test → user_id = @testuser3
#   **Channel Topic:** Hindsight 记忆服务讨论
#   room_id = !<matrix-room-id> (去除 :matrix.test 后缀)
#   session_id = $<event-id> (auto_thread event_id)
kanban_create(
    title="消息标题",
    body="...",
    tenant="跨团队协作群01:Hindsight记忆服务讨论:@testuser3:!<matrix-room-id>:$<event-id>:matrix",
    board="swarm",  # 非安全类 → swarm
    workspace_kind="worktree",
    # workspace_path 无需指定 — 系统自动在主仓库下创建 .worktrees/<task-id>
    triage=True
)

# chat_name=空时 → tenant = 短chat_id::user_id:room_id(去homeserver):session_id:matrix
# 会话上下文:
#   **Source:** Matrix (group: !<matrix-room-id>:matrix.test)
#   **User ID:** @testuser3:matrix.test → user_id = @testuser3
#   （无 Channel Topic 行 → 话题留空）
kanban_create(
    title="消息标题",
    body="...",
    tenant="!<matrix-room-id>::@testuser3:!<matrix-room-id>:$eventId:matrix",
    board="swarm",  # 非安全类 → swarm
    workspace_kind="worktree",
    # workspace_path 无需指定 — 系统自动在主仓库下创建 .worktrees/<task-id>
    triage=True
)

# 用户消息: "对目标做端口扫描和服务指纹识别"
kanban_create(
    title="端口扫描和指纹识别",
    body="...",
    tenant="跨团队协作群01:recon|端口扫描指纹识别:@testuser3:!<matrix-room-id>:$eventId:matrix",
    board="hack",  # 安全类 → hack
    workspace_kind="worktree",
    triage=False  # 已明确分配
)
```

---

*规则版本: 6.0*
*创建时间: 2026-06-24 (v3.1: room_id去homeserver, 字段顺序调整为4:6:5:2:3:1)*
*更新时间: 2026-06-30 (v4.0: 新增话题标签规范、Matrix协作约定、优先级标记)*
*更新时间: 2026-06-30 (v4.1: 话题摘要格式改为<标签>:<简短摘要>，新增Agent智能推断规则)*
*更新时间: 2026-06-30 (v4.2: 话题摘要内部分隔符从:改为|，避免与tenant字段分隔符冲突)*
*更新时间: 2026-07-10 (v4.3: workspace默认根目录同步为 ~/hermes-docker-sandbox/workspace/，workspace_path 改为可选)*
*更新时间: 2026-07-24 (v5.1: workspace_kind 默认值从 dir 改为 worktree，主仓库初始化于 ~/hermes-docker-sandbox/workspace/)*
*更新时间: 2026-07-24 (v6.0: 新增 product + ops 双看板，四看板统一调度，8个新 profile)*
*适用 profile: orchestrator*
