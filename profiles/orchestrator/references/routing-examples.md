### 0.5.5 路由示例

```python
# 用户消息: "对 10.0.0.1 做端口扫描和指纹识别"
# 命中: 端口扫描, 指纹识别 → 侦察类
kanban_create(
    title="端口扫描和指纹识别 - 10.0.0.1",
    body="对授权目标 10.0.0.1 执行端口扫描与服务指纹识别，输出开放端口、服务版本、操作系统猜测。",
    tenant="...",
    board="hack",
    workspace_kind="dir",
    triage=False  # 已明确分配，无需 triage
)

# 用户消息: "我们被入侵了，需要取证分析并查清攻击路径"
# 命中: 取证(forensics) + 入侵(intrusion) + 攻击路径(mixed)
# board="hack", assignee="" (混合场景，进 triage)
kanban_create(
    title="入侵事件取证分析",
    body="...",
    tenant="...",
    board="hack",
    workspace_kind="worktree",
    triage=True
)

# 场景3: 非安全 → swarm 看板（原逻辑）
# 用户消息: "实现用户认证模块"
# 无安全关键词
# board="swarm"
kanban_create(
    title="实现用户认证模块",
    body="...",
    tenant="...",
    board="swarm",
    workspace_kind="worktree",
    triage=True
)
```
