# Super-agent 吸收 C 批：Router 层——语义评估与人类交互汇总（2026-10-31）

日期：2026-10-31
状态：草案（范围待用户确认）
来源：用户指示「深入调研 https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg 及 https://github.com/deepseek-ai/dsh-superagent-prototype 完善 AIStudio」；A+B 批已合入 main `d62b1cd96`。
关联：`2026-10-31-superagent-domain-auth.md`（A+B，提供 Trigger/Thread/Subscription/Decision/Mandate 六表与准入表）。

## 1. 背景与目标

### 1.1 上游 Router 的职责

上游 `docs/004-prompts.md` 与微信文章 §2.1 描述：Router 层常驻，只做「人类交互 + 任务分派 + 全局记忆」，不执行具体任务，甚至不配 Bash；Worker 上下文隔离，不直接与人类交互，只向 Router 汇报。

### 1.2 AIStudio 现状与判断

AIStudio 已有两条派发链：

1. **人类消息派发**：Matrix/工作台 → `mention-dispatch`（单 pending 槽 + 30min TTL）→ zcode 引擎
2. **工单派发**：kanban dispatcher（静态 assignee + 三层并发闸）→ profile worker

再新增一个「常驻 Router 会话」会形成**第三条派发链**，与既有链路重叠，且与 A+B 的 `Trigger → Decision → Ticket` 语义冲突（谁创建工单？谁决定 assignee？）。

因此本批把 C 收敛为上游 Router 在 AIStudio 语境下真正缺失的两个能力：

1. **Slow Path 语义评估**：程序准入（A+B 的准入表）之后，对 `pending` Trigger 做语义判断，决定 `accept/ignore/unavailable`。这是 A+B 明确留给 D 批的能力，也是 Router「判断要不要接单」的实质。
2. **人类交互汇总**：同一 Thread 下多个 Worker 的进展，由汇总器合成一条面向人的消息，而不是每个 Worker 各自回复。这是「Worker 不直接与人交互」的落地。

### 1.3 目标

1. **价值声明**：减少两类噪音——程序准入放过的无关事件、多个 Worker 各自刷屏的进展消息。
2. **SMART 目标**：
   - 新增 `orchestrator/summarizer.ts`：把同一 Thread 的待投递事件按规则合并为单条消息（确定性模板，不调模型）。
   - 新增 `orchestrator/evaluator.ts`：对 `pending` Trigger 调语义评估，写回 Decision（`accept` / `ignore` / `unavailable`）。
   - 评估结果仅在源 `mode=auto` 且评估通过时推进 Trigger 状态；`observe` 下只记录。
3. **非目标**：
   - 不新增常驻 agent 会话进程。
   - 不改 `mention-dispatch` 与 kanban dispatcher 的派发路径。
   - 不做跨实例 A2A（上游 §8.3）。
   - 不做上下文 Inline & Spill / 链式召回（E 批）。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 | 类型 | 用户裁定 | 可逆 |
|---|---|---|---|---|---|---|
| D1 | 不新增常驻 Router 会话；Router 能力拆为「语义评估 + 汇总」两件 | AIStudio 已有两条派发链，第三条会互相抢占；上游 Router 的价值在判断与汇总，不在进程形态 | 新增独立常驻会话（否决：三链冲突） | UserChallenge | **待裁定** | 是 |
| D2 | 先做汇总（C1）再做语义评估（C2） | 汇总是确定性逻辑、可完全单测；语义评估需要模型通道，风险与验证成本高 | 先做评估（否决：验证依赖活体模型） | Taste | 待裁定 | 是 |
| D3 | 语义评估走既有 gateway 会话（agent 用工具写回 Decision），不在服务端直调模型 | 避免新增模型调用面与密钥分发；agent 可读上下文；与「执行层强制」不冲突（服务端仍校验写回） | 服务端直调 LLM（否决：新增密钥面） | UserChallenge | **待裁定** | 是 |
| D4 | 汇总用确定性模板，不调 LLM | 可测、可解释、无额外成本；摘要质量不足时再上 LLM | LLM 摘要（否决：先引入不可测变量） | Mechanical | 待裁定 | 是 |
| D5 | 汇总只读 `subscription` + `pendingFor`，不新建投递通道 | 复用 A+B 的订阅游标；投递走既有渠道（不新增推送面） | 新建消息总线（否决：重复造轮子） | Mechanical | 待裁定 | 是 |

## 3. 变更范围与侵入点

### 3.1 新增（`custom/server/orchestrator/`）

| 文件 | 职责 |
|---|---|
| `summarizer.ts` | 同一 Thread 的事件合并为单条消息：按 `origin`/`kind` 分组、时间窗、去重、静默条件 |
| `evaluator.ts` | 语义评估：读 `pending` Trigger → 调评估通道 → 写 Decision；通道未接时返回 `unavailable` |
| `controller.ts`（增量） | 新增 `POST /api/orchestrator/evaluate`（手动触发一轮评估）与 `GET /api/orchestrator/digests` |
| `__tests__/summarizer.test.ts`、`__tests__/evaluator.test.ts` | 对应测试 |

### 3.2 既有文件修改

| 文件 | 改动 |
|---|---|
| `custom/server/orchestrator/store.ts` | 新增 `digest` 表（thread_id、subscriber、内容、投递状态、created_at） |
| `custom/server/orchestrator/ingest.ts` | `pending` 状态在 `mode=auto` 且评估通过时推进为 `routed`（现由准入直接决定） |

### 3.3 不改动

- `custom/server/kanban/column-dispatch.ts`、`custom/server/zcode/mention-dispatch.ts`、kanban dispatcher：派发路径不动。
- 不新增 patches（复用 719 的 `/api/orchestrator/*` 前缀）。

## 4. 详细设计

### 4.1 汇总器（C1）

输入：`thread_id` + `subscriber` 的 `pendingFor` 结果。
规则：

1. 同一 Thread 内、时间窗（默认 5 分钟）内的事件合并为一条。
2. 按事件 `kind` 分组计数（如「3 条列变更、1 条完成」）。
3. 已完成/阻塞类事件保留具体任务标题；纯列变更只给计数。
4. 若 Thread 内全部事件都是 `column_transition` 且无终态事件，不生成消息（静默）。
5. 生成的消息写入 `digest` 表，`delivered=false`；投递由既有渠道消费。

### 4.2 语义评估器（C2）

```
pending Trigger
  → 组装评估输入（Trigger 摘要 + Thread 最近 N 条 + 当前 Policy 版本 + 已启用的规则）
  → 评估通道（gateway 会话 / 未来可换直调）
  → 结果 { verdict: accept|ignore|unavailable, reasons: string[], confidence? }
  → 写 Decision（strength='inferred'，policyVersion 取当前值）
  → mode=auto 且 verdict=accept → Trigger 置 routed；否则保持 pending
```

通道未配置时返回 `unavailable` 并记决策，不静默丢弃。

### 4.3 数据结构

```sql
CREATE TABLE IF NOT EXISTS digest (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  subscriber TEXT NOT NULL,
  body TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

## 5. 验证

- `npx vitest run custom/server/orchestrator`：汇总五条规则各一例；评估器三态（accept/ignore/unavailable）与通道缺失降级。
- `npm run typecheck:harness` 0 错（新增文件并入点名清单）。
- 合并前 `npm test` 全量。
- C2 的活体验证需要 gateway 会话可用，本轮若无可用通道，只验证 `unavailable` 降级路径（如实声明）。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 汇总掩盖个体任务的重要信息 | 终态/阻塞事件保留标题；纯列变更才聚合 |
| 评估器误判导致漏接 | `observe` 默认只记录；`auto` 才推进 |
| 评估通道不可用 | 返回 `unavailable` 落 Decision，不静默丢弃 |
| 与 mention-dispatch 争用 | 明确边界：评估器只写 Decision，不派发 |

回滚：删新增两文件与 digest 表即可；ingest 改动是条件分支，回退不影响既有路径。

## 7. 设计文档影响

DESIGN_SYNC: none

理由：本批只出 spec 草案，不含实现代码；设计正本 §4.7 的「Router 落法」修订与实现同批进行——实施批须把本行改回 `touched`，并同批修订 §4.7 与附录 A.1。

## 8. 待确认（阻塞实施）

1. D1：是否接受「不做常驻 Router 会话」这个收敛。
2. D3：语义评估走 gateway 会话（复用现有 agent）还是服务端直调模型。
3. C1/C2 是否分两批合入（建议分，C1 先上）。
