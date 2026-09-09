# SwarmStudio ↔ Hermes Agent Cluster 契约文档

> 版本：v1.0 (2026-09-07)
> 定位：观测治理层（第 6 层）与前五层的显式接口契约
> 原则：人定方向 · 机器守门 · AI 干活

---

## 1. 数据契约

### 1.1 Kanban Task 核心字段（跨 board 聚合必需）
```typescript
interface KanbanTask {
  id: string                    // t_xxx 格式
  title: string
  status: 'triage' | 'todo' | 'scheduled' | 'ready' | 'running' | 'blocked' | 'review' | 'done' | 'archived'
  priority: number              // 0=P3, 1=P2, 2=P1, >=3=P0
  assignee: string              // profile name (e.g., 'worker-coder', 'orchestrator')
  workspace_path: string | null
  tenant: string | null         // 6段式: groupChat:topic:userId:roomId:sessionId:platform
  project_id: string | null
  created_at: number            // Unix 秒
  started_at: number | null
  completed_at: number | null
  skills: string[] | null
  latest_summary: string | null
  parents: string[]
  children: string[]
}
```

### 1.2 Tenant 解析规范（6 段式）
```
格式：<群聊名称>:<话题摘要>:<user_id>:<room_id>:<session_id>:<platform>
示例：跨团队协作群01:记忆服务讨论:@testuser3:!<matrix-room-id>:$<event-id>:matrix
平台值：matrix | weixin | api | email | cli
```

### 1.3 Trace 节点/边 Schema（Run Observatory）
```typescript
type TraceNodeKind = 'ingress' | 'workflow' | 'agent' | 'skill' | 'tool' | 'memory' | 'service' | 'peer' | 'approval'
type EvidenceTier = 'L1' | 'L2' | 'L3'
type EdgeKind = 'spawn' | 'call' | 'recall' | 'converge' | 'delegate'

interface TraceNode {
  id: string
  kind: TraceNodeKind
  label: string
  detail?: string
  status: 'running' | 'ok' | 'error' | 'cancelled'
  startedAt: number
  endedAt?: number
  durationMs?: number
  evidence: EvidenceTier
  children?: TraceTimelineItem[]
  ref?: { sessionId?: string; runId?: string; toolCallId?: string; workflowNodeId?: string }
  cluster?: string          // 所属 kanban taskId
  profile?: string          // agent profile
  taskStatus?: string       // 仅 ingress/workflow
  taskBoard?: string        // 任务所属 board slug
}
```

### 1.4 Fleet Session 结构（跨 profile 会话快照）
```typescript
interface FleetSession {
  id: string
  profile: string
  title: string
  status: 'working' | 'idle'
  isAborting: boolean
  queueLength: number
  runStartedAt: number | null
  lastActiveAt: number
  source: string
  agent: string
  lastPreview: string
  approvals: Array<{ approval_id: string; preview: string; choices: string[] }>
  clarifies: Array<{ clarify_id: string; question: string }>
}
```

---

## 2. API 契约（REST）

| 端点 | 方法 | 用途 | 响应关键字段 |
|-----|------|------|-------------|
| `/api/hermes/kanban/overview` | GET | 全 board 任务聚合（替代 N+1） | `{ boards: [{slug, name, total, archived}], tasks: [{board, task}], fetchedAt }` |
| `/api/hermes/fleet/approval` | POST | 就地审批（跨 profile） | `{ resolved: boolean, error?: string }` |
| `/api/hermes/fleet/clarify` | POST | 就地澄清应答 | `{ resolved: boolean, error?: string }` |
| `/api/hermes/sessions/{id}/trace` | GET | Layer 2 trace 数据 | `{ nodes: TraceNode[], edges: TraceEdge[], meta?: {started_at, ended_at, model, provider} }` |
| `/api/hermes/terminal-tools` | GET | 终端工具探测 | `{ tools: [{id, installed, path}] }` |
| `/api/hermes/teams` | GET/POST/PUT/DELETE | 团队注册表 CRUD | `TeamRecord[]` / `TeamRecord` |

---

## 3. WebSocket 契约

### 3.1 Fleet 事件流 `/api/hermes/fleet/events`
```typescript
// 客户端 → 服务端：建立连接即订阅
// 服务端 → 客户端（1.5s tick，变化才发）：
{ type: 'snapshot', ts: number, sessions: FleetSession[] }
```

### 3.2 Kanban 聚合事件流 `/api/hermes/kanban/overview/events`
```typescript
// 任一 board 有事件 → 推送：
{ type: 'board-event', board: string }
// 客户端收到后去抖 500ms 调用 /api/hermes/kanban/overview 刷新
```

### 3.3 PTY 终端 `/api/hermes/terminal`
```typescript
// 消息类型：
// { type: 'created', sessionId, shell }           // session 就绪
// { type: 'exited', exitCode }                    // 进程退出
// { type: 'resize', cols, rows }                  // 客户端→服务端
// 其余：PTY 原始字节流（stdout/stderr）
```

---

## 4. 权限契约（Markings 传播 + Clearance 校验）

### 4.1 Markings 继承规则（合取 AND）
```
父任务 markings: [TLP:AMBER, PII]
子任务继承 = 父 markings ∩ 子自有 markings
跨 board 派单前必须机械校验
```

### 4.2 Profile Clearance 矩阵（最小集）
| Profile | Clearances |
|---------|------------|
| orchestrator | [TLP:AMBER, TLP:GREEN, TLP:CLEAR, PII] |
| worker-coder | [TLP:GREEN, TLP:CLEAR] |
| worker-researcher | [TLP:GREEN, TLP:CLEAR] |
| hack-recon | [TLP:AMBER, TLP:GREEN, TLP:CLEAR] |
| hack-exploit | [TLP:AMBER, TLP:GREEN, TLP:CLEAR] |
| hack-auditor | [TLP:AMBER, TLP:GREEN, TLP:CLEAR] |
| hack-forensics | [TLP:AMBER, TLP:GREEN, TLP:CLEAR] |
| [已移除]-* | [TLP:GREEN, TLP:CLEAR] |

### 4.3 校验算法（orchestrator 路由时执行）
```python
def can_route(assignee: str, inherited_markings: Set[str]) -> bool:
    clearances = get_profile_clearances(assignee)
    return inherited_markings.issubset(set(clearances))
```

---

## 5. ACP Provider 路由表

| 任务类型 | 推荐 Provider | 备注 |
|---------|--------------|------|
| 编码/重构/测试 | claude-code (bypassPermissions) | 默认首选 |
| 安全审计/渗透 | codex (Guardian 二审) | 高危命令需 Guardian 批准 |
| 长上下文调研 | zcode (GLM-5.3-Flash) | 夜间 23:00-09:00 免费 |
| 结构化推理 | deepseek-harness (dsh) | 组件化工程规范场景 |

---

## 6. 验收门禁契约（SwarmStudio 显示用）

### 6.1 完成定义（DoD）证据分级
| 证据等级 | 分数上限 | SwarmStudio 显示 |
|---------|---------|-----------------|
| Missing | 59 | 🔴 红 - 机制缺失 |
| Present | 74 | 🟡 黄 - 仅配置存在 |
| Wired | 84 | 🟢 绿 - 已接线可用 |
| Exercised | 94 | 🔵 蓝 - 被使用且有结果 |
| Outcome-supported | 100 | 🟣 紫 - 可比结果支持效果 |

### 6.2 重型任务必含章节（合并报告）
1. Executive Summary
2. Findings（含 severity + 影响范围 + 复现步骤）
3. Recommendations
4. **攻击面漂移对比**（调用 `drift_compare.py` 自动生成）
5. Methodology
6. Appendix

---

## 7. 版本兼容性承诺

- **数据契约**：字段只增不减，废弃字段保留 2 个大版本
- **API 契约**：REST 端点路径不变，响应字段只增不减
- **WS 契约**：`type` 值只增不改，payload 结构只增不减
- **权限契约**：Clearance 矩阵只扩不缩，Markings 规则向后兼容

---

## 8. 违约处置

| 违约类型 | 检测方式 | 处置 |
|---------|---------|------|
| API 响应字段缺失 | 契约测试 (`tests/contract/`) | CI 阻断发布 |
| WS 消息格式不符 | 运行时 schema 校验 | 记录告警 + 降级本地缓存 |
| Markings 校验失败 | orchestrator 路由前机械校验 | `kanban_block(kind="capability")` |
| Trace schema 不匹配 | `fetchLayer2Trace` 返回 null 回落 L1 | 记录警告 + 仅用 L1 重建 |

---

> 本契约是 SwarmStudio 与 Hermes Agent Cluster 之间的**单一事实源**。
> 任何一方修改接口，必须同步更新本文档并通过契约测试。