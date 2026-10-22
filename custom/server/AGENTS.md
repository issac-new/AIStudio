# custom/server — 服务端扩展入口

Koa 服务端扩展层。每个域一个目录，`*-controller.ts` 挂 REST，纯函数与存储分离，`__tests__/` 与本目录同级或域内。

## 关键约定

- **路由挂载**：新路由优先加进已挂载的 controller（如 `harness/harness-controller.ts` 已由 patch 543 挂载）；新建独立路由必须在 `patches/` 加挂载补丁并登记 series。
- **存储**：JSON/JSONL 走 `mkdir` + 原子写（tmp → rename）；SQLite 用 `node:sqlite`；测试用 env 指向 tmpdir，绝不写真实 home。
- **失败语义**：读模型 fail-soft（源缺席标 `available:false` / `null`）；执法链失败关闭（fail-closed）。两者不可混用。
- **身份**：工具上下文含 `userId/sessionId/profileId/runId`；审计可落身份标识，不可落敏感参数原值。
- **审计**：`toolpipeline/tool-hooks.ts` 是工具执行审计唯一出口；新增字段先扩展 `ToolExecAuditEntry`，再补查询面与测试。

## 关键域索引

| 域 | 职责 |
|---|---|
| `toolcontract/` | 工具契约（副作用/超时/重试/幂等/脱敏）单一事实源 |
| `toolpipeline/` | 工具执行瀑布：审计 → 结果围栏 → 技能治理 → 执法门 |
| `harness/` | 治理读模型（能力目录/成本账/成熟度/九层体检） |
| `loop/graph/` | 图执行器、检查点、重试与停滞检测 |
| `approvals/` | 审批规则、收件箱、审批历史 |
| `eval/` | 评测集、回放判定、发布门 |
| `govbus/` | 治理事件总线（append-only JSONL） |
| `evidence/` | 任务证据台账（hash 链防篡改） |
| `trust/` | 长程任务可信执行（主张三态审计/完成态双准入/工作区完整性栅栏/原子断点，fail-closed） |

## 测试约定

- vitest，`// @vitest-environment jsdom` 只用于组件测试；服务端用纯 node 环境。
- 每个 env 覆盖都要在 `afterEach` 复原；临时目录 `mkdtempSync` 后清理。
- 断言写真实证据（计数/字段/顺序），不写“不抛错”式空断言。
