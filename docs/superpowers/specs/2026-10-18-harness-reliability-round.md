# Harness 运行可靠性闭环：工具契约、审计增强、权限感知重试、九层体检（spec）

日期：2026-10-18
分支：`feat/harness-reliability`
来源：三篇公众号工程实践文章——

1. 《为什么 90% 的 Agent 止步于 Demo？企业级 Agent 生产化落地的 10 个实战细节》（智能体AI，2026-10-05）
2. 《Harness Engineering 从零到生产：AI Agent 真正的九层运行系统》（人工智能与安全笔记，2026-10-14）
3. 《Spec as AIOS：统一规范如何控制AI代码熵增》（小汪的码上生活，2026-09-01）

三篇指向同一结论：模型只负责提出下一步，真正决定生产可用性的是模型之外的 Harness。盘点现状后发现 SwarmStudio 的相关模块大多已存在，但大量停在“纯函数 + 单测”层，没有接进执行链。本轮不改产品既有裁决语义（权限执法门行为不变），只补三处真正影响运行可靠性的闭环：工具契约层、审计账增强、权限感知重试，外加一个把九层覆盖度如实呈现的治理面板。

## 变更

### 1. 工具契约注册表（新增 `custom/server/toolcontract/`）

- `contract.ts`：每个工具族声明 `sideEffect`（read/write/external）、`timeoutMs`、重试策略（次数/基础退避/上限/抖动/可重试错误类）、幂等模式（key/none + TTL）、需脱敏参数键。
- 提供 `resolveToolContract(name)`：精确名 → 通配前缀 → 默认契约。
- 提供 `classifyToolError(error)`：归一到 `transient/rate_limit/auth/permission/not_found/validation/conflict/unknown`，并给出 `retryable` 判定。权限、认证、参数校验类明确不可重试。
- 提供 `computeBackoffMs(attempt, retry, retryAfterMs?)`：指数退避 + 抖动 + 上限；服务端给了 `Retry-After` 时优先采用。
- 提供 `computeIdempotencyKey({tool,args,userId,runId,windowMs})` 与 `redactValue/summarizeArgs`（参数摘要用于审计，值按敏感键脱敏，超长截断）。
- 提供 `CallSignatureTracker`：同一 `runId/sessionId` 下连续相同调用签名达到阈值（默认 3）时标记重复，供审计与告警消费。

### 2. 审计账增强与查询面（`custom/server/toolpipeline/tool-hooks.ts` + harness 路由）

- 审计行新增：`durationMs`（pre/post 配对）、`errorCategory`、`retryable`、`argDigest`（参数 SHA-1）、`argSummary`（脱敏后截断摘要）、`sideEffect`。
- 落盘目录以 `0700` 创建；文件创建时 `0600`（既有账本不回溯改权限，仅新文件生效）。
- 新增只读查询 `/api/harness/tool-audit?days=&limit=&tool=&sessionId=&runId=&outcome=`，按时间倒序返回，并给出总数与按工具/结果聚合。
- 保持既有纪律：不落完整参数原值；摘要用于排障，不用于还原敏感数据。

### 3. 权限感知重试接入图执行器（`custom/server/loop/graph/`）

- `NodeDef.retry` 向后兼容扩展：`strategy?: 'linear' | 'exponential'`、`jitterRatio?`、`maxDelayMs?`、`retryOn?`、`nonRetryable?`。
- `executeNode` 失败后先分类：权限/认证/参数校验/资源不存在直接失败，不消耗重试；瞬时/限流按策略退避，读取错误对象上的 `retryAfterMs`（若有）优先。
- 未声明新字段时行为与现状一致（线性退避），避免影响既有图定义与测试。

### 4. 九层 Harness 体检（`custom/server/harness/nine-layers.ts` + 治理页新板块）

- 以文章二的九层为骨架：Tools / Loop / Memory / Context / Sandbox / Verification / Permissions / Observability / Evals。
- 每层输出 `status`（covered/partial/missing）、`score`、`evidence`（真实计数或静态自检证据）、`gaps`、`actions`。
- 数据来源优先真实账本（审计、图检查点、审批记录、eval store、heldout、检查点文件），静态能力只作为“已具备但未接线”的证据并显式标注来源，不造运行数据。
- 新增 `GET /api/harness/nine-layers`；治理页“驾驭工程”新增“九层运行体检”板块，逐层展示状态、证据与缺口。

### 5. 规范入口（Article 3 的仓库层落地）

- 新增 `overlay/AGENTS.md`（项目导航入口，控制在 100 行内）与 `custom/server/AGENTS.md`、`custom/client/AGENTS.md`（模块级边界与约束）。
- 入口只做索引与工作规则，细节链接到既有 spec/README，避免“万能说明书”。

## 决策记录

1. **接线优先于新建**：现状不是缺模块，而是缺执行链消费者。本轮新增代码只做“把契约/审计/重试/体检接上”，不复制既有能力；能复用 `tool-hooks`、`graph-runtime`、`harness-controller` 的都在原文件扩展。
2. **工具契约作为单一事实源**：重试阈值、幂等 TTL、脱敏键、副作用等级只在 `toolcontract` 定义一次；图执行器与审计面共同消费，禁止各自硬编码。
3. **审计不落原值**：延续 2026-10-16 安全轮的脱敏纪律。新增的 `argSummary` 只保留脱敏后的短摘要，`argDigest` 仅用于同一调用的关联与重复识别，不能反推参数。
4. **确定性错误不重试，未知错误保留默认重试**：权限、认证、参数校验、资源不存在属确定性错误，重试只会浪费调用并放大故障；瞬时/限流类进入退避。`unknown` 默认仍重试，因为既有推演图用通用异常表达基础设施抖动，收紧会改掉它们的弹性；需要严格时由图定义显式收窄 `retryOn` 或声明 `nonRetryable`。
5. **九层体检是自检不是认证**：与既有 RSI 成熟度面板同一定位。数据缺席显示 `unavailable`/`missing`，不猜数；静态能力存在但无消费者时标 `partial`，避免把“有模块”说成“已闭环”。
6. **本轮不碰权限执法语义**：`enforce-gate` 的裁决链、审批桥、自治阶梯行为不变；身份传递与 per-user 鉴权缺口记入差距清单，另行排期，避免一次改动同时变更安全边界与可观测性。
7. **九层顺序即产品路线**：面板按文章二的 1→9 排列，后续轮次按层补闭环，不再新增平行概念。

## 验证

- `npx vitest run custom/server/toolcontract custom/server/toolpipeline/__tests__ custom/server/loop/graph/__tests__ custom/server/harness/__tests__`。
- 类型检查覆盖新增模块（若仓库整体 `tsc` 存量错误不可控，则用新增模块的定向检查并在交付说明中如实标注）。
- 治理页构建/挂载冒烟：`/api/harness/nine-layers` 返回 9 层，前端板块可见且失败态可降级。
- 全量 vitest 复跑；不绿不合并。
