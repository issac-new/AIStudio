# custom/server — 服务端扩展入口

Koa 服务端扩展层。每个域一个目录，`*-controller.ts` 挂 REST，纯函数与存储分离，`__tests__/` 与本目录同级或域内。

## 关键约定

- **域名规约（2026-10-28 K22 立规）**：**新域一律 kebab-case**（如 `delivery-contract/`、`approval-rules/`）。历史存量 151 个域为连写（`agentidentity/`、`toolresultguard/`），不批量改名——改名会打穿 `typecheck:harness` 点名清单、补丁文本与 503 个测试的相对 import；存量按需渐进。
- **域索引**：本文件只列「关键域」子集（入口/高风险/易混），不是全量清单。全量以 `ls custom/server/` 为准；新增域须在本文件登记一行「路径 | 职责」，否则视为未建档。近义域必须写清边界，先例：`approval-rules/`（规则与决策，patch 402）与 `approval-inbox/`（收件箱与历史，patch 488）；`delivery/` 与 `delivery-contract/` 属不同层，勿合并。
- **路由挂载**：新路由优先加进已挂载的 controller（如 `harness/harness-controller.ts` 已由 patch 543 挂载）；新建独立路由必须在 `patches/` 加挂载补丁并登记 series。
- **存储**：JSON/JSONL 走 `mkdir` + 原子写（tmp → rename）；SQLite 用 `node:sqlite`；测试用 env 指向 tmpdir，绝不写真实 home。
- **失败语义**：读模型 fail-soft（源缺席标 `available:false` / `null`）；执法链失败关闭（fail-closed）。两者不可混用。
- **HTTP 响应形状（2026-10-28 K19 立规）**：
  - 统一出口 `custom/server/lib/http.ts`——`ok()` / `created()` / `fail()` / `unavailable()` / `bodyOf()` / `writeDenied()`。新端点一律用它，不再手写 `ctx.body = { ok: false, ... }`。
  - 失败体固定 `{ ok: false, error: <一句话>, code?, problems? }`；`error` 是唯一的「失败原因文案」键。
  - **写操作与命令类失败必须非 2xx**（400/403/404/409/422/5xx）；**读模型的降级或业务拒绝允许 200 + `ok:false`**（客户端据 `ok` 分支），这类站点在架构棘轮里计数、只许减少。
  - `detail` / `problems` 作为**结构化载荷**（数组、字段细节）可以与 `error` 并存，不属重复键；不要把它们当文案别名合并。
  - 计数棘轮：`custom/__tests__/architecture-ratchet.test.ts` 锁 `ctx.body=` 与 `ok:false` 总量，只许下降。
- **身份**：工具上下文含 `userId/sessionId/profileId/runId`；审计可落身份标识，不可落敏感参数原值。
- **审计**：`toolpipeline/tool-hooks.ts` 是工具执行审计唯一出口；新增字段先扩展 `ToolExecAuditEntry`，再补查询面与测试。

## 关键域索引

| 域 | 职责 |
|---|---|
| `toolcontract/` | 工具契约（副作用/超时/重试/幂等/脱敏）单一事实源 |
| `toolpipeline/` | 工具执行瀑布：审计 → 结果围栏 → 技能治理 → 执法门 |
| `harness/` | 治理读模型（能力目录/成本账/成熟度/九层体检） |
| `loop/graph/` | 图执行器、检查点、重试与停滞检测 |
| `approval-rules/` | 审批规则与决策（candidates/evaluate/decide/rules；patch 402 挂载） |
| `approval-inbox/` | 审批收件箱与历史（pending 聚合/就地裁决/history；patch 488 挂载） |
| `eval/` | 评测集、回放判定、发布门 |
| `govbus/` | 治理事件总线（append-only JSONL） |
| `evidence/` | 任务证据台账（hash 链防篡改） |
| `trust/` | 长程任务可信执行（主张三态审计/完成态双准入/工作区完整性栅栏/原子断点，fail-closed） |

## 测试约定

- vitest，`// @vitest-environment jsdom` 只用于组件测试；服务端用纯 node 环境。
- 每个 env 覆盖都要在 `afterEach` 复原；临时目录 `mkdtempSync` 后清理。
- 断言写真实证据（计数/字段/顺序），不写“不抛错”式空断言。
