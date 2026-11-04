# 结果协议统一与审批口径收口（W2）

> 日期: 2026-11-04
> 状态: 已实施
> 关联: 调研源=vivo《面向技术产品经理的 Agent Harness 设计》第 5/6 章；前置=2026-10-26-swarmstudio-integrated-design（§2 协议边界）、2026-10-31-humangate-store-unify

## 变更

盘点发现两类「会说谎」的缺陷：①Matrix `task.receipt` 协议漂移——服务端发 `{taskId,status:'observed'|'failed',reason,by,at}`（chat-bridge.ts:351-359），客户端 `parseReceiptContent` 要求 `{taskId,reportedBy,reportedAt,status∈created|running|waiting-human|done|failed}`（protocol.ts:257-264），服务端回执**必解析失败**，跨机回执链路静默断裂；②审批口径三洞——`approved_for_session` 决策态落规则返回 null（UI 提供「本会话允许」按钮但点了没有任何效果）、`approved_scoped` 学成无期限全局 allow（一次确认=永久通行证）、执法审批单无发起人/运行绑定且无鉴权可匿名裁决。本轮收口（全部 custom/ 零 patch）：

1. **ResultEnvelope v1**（新建 `custom/server/result-contract/`）：统一结果协议类型 `{resultVersion,generatedAt,generatorVersion,summary,evidence[],artifactRefs[],nextActions[],risks[],decisions[],pendingQuestions[]}`；evidence 项为 `{sourceId,locator:{kind,value},role}` 可定位引用（对齐源文 6.1 节）；`validateResultEnvelope()` 确定性校验器：summary 非空、每条 claim/recommendation 至少一条 supports 证据、priority 属枚举、`externalRecordId` 仅当写成功时可出现、risk=high|critical 时 nextActions 非空——模型生成候选，普通代码守边界（源文 6.2 节）。
2. **修 task.receipt 漂移**：`task-protocol.ts` 补服务端 `ReceiptContent` 类型与 `serializeReceipt()`（唯一序列化点）；`chat-bridge.ts` 改走它，`observed`→`running` 语义映射（已投影、执行在途）；保留 `by/at` 旧字段一个过渡期（增量字段不破坏旧消费方）。新增交叉守门测试：import 客户端 `parseReceiptContent` 断言服务端序列化可解析且字段一致。
3. **审批 session 规则落地**：`approved_for_session` 从 no-op 改为落 `scope:'session'`、带 `sessionId` 与 `expiresAt`（24h）的 allow 规则；`approved_scoped` 落规则时写 `expiresAt`（24h）；`evaluate` 检查过期不命中。存量无期限规则装载时补 `expiresAt=now+24h` 并标 `migratedAt`（关永久通行证，给一天缓冲），写失败 fail-soft 仅内存标记。
4. **执法审批单主体绑定**：`EnforceApprovalRecord` 增 `requestedBy`/`runId`；`/decide` 复用收件箱既有认证主体要求（`requireAuthenticatedActor`），裁决人=发起人时拒绝（自批禁令），无主体拒绝并返回明确 code。
5. **看板详情读模型**：`kanban-task-fast.ts` 详情响应新增可选 `resultContract`——从 run metadata/completion receipt/artifacts 派生 ResultEnvelope 并过 `validateResultEnvelope`；源缺失返回 `null`（fail-soft，不猜）。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 | decisions.jsonl 行号 |
|------|------|------|------|------|---------|---------------------|
| observed→running 的映射 | 投影成功=running（已进本地房、执行在途） | 映射 done | 桥不代为编排（2026-10-26 九段校正既定边界），done 会声称未发生的完成；running 如实表达「已接收、执行中」 | Mechanical | approved | 72 |
| 存量无期限审批规则的处置 | 装载时补 expiresAt=now+24h（关闭+缓冲） | 立即失效 / 永久豁免存量 | 立即失效可能打断在途会话；永久豁免=漂移永续。24h 缓冲与 approval-log 里 scoped 24h 口径一致 | Mechanical | approved | — |
| ResultEnvelope 落点 | 新域 custom/server/result-contract/ + 看板详情只读派生 | 直接改 kanban_complete 工具入参 | completion receipt 在 hermes-agent 侧（patch 通道），本轮零 patch 边界内只能做读侧投影；写侧并入留待 vendor 通道批 | Mechanical | approved | — |

## 验证

- `npx vitest run custom/server/result-contract custom/server/matrix custom/server/approval-rules custom/server/approval-inbox custom/server/toolpipeline custom/server/services/hermes`
- `npm run typecheck:harness`
- 交叉守门：服务端 serializeReceipt ↔ 客户端 parseReceiptContent 往返一致（漂移复发即红）。

## 设计文档影响

- DESIGN_SYNC: none —— task.receipt 字段修复是对 2026-10-26 正本既定协议（客户端 protocol.ts v2 形状）的**回归**而非协议变更；ResultEnvelope 是新增 overlay 读侧投影（无新路由/端点/页面），不改正本 §8.4 能力档位与总账数字。
