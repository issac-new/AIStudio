# Harness 工程调研与 SwarmStudio 差距分析（2026-10-18）

调研来源：

1. 《为什么 90% 的 Agent 止步于 Demo？企业级 Agent 生产化落地的 10 个实战细节》（智能体AI，2026-10-05）
2. 《Harness Engineering 从零到生产：AI Agent 真正的九层运行系统》（人工智能与安全笔记，2026-10-14）
3. 《Spec as AIOS：统一规范如何控制AI代码熵增》（小汪的码上生活，2026-09-01）

## 一、三篇文章的共同结论

三篇讨论的是同一件事的三个切面，结论可以合成一句：**模型只负责提出下一步，生产可用性由模型之外的 Harness 决定**。

- 第一篇从事故出发，给出 10 个工程细节：身份传递、桌面化五层跃迁、审计、幂等、检查点、重试分类、模型路由、价值评估、系统分层。
- 第二篇给出九层能力模型：Tools / Loop / Memory / Context / Sandbox / Verification / Permissions / Observability / Evals；前六层让 Agent「能做事」，后三层决定团队「敢不敢让它做事」。
- 第三篇给出规范侧的解法：仓库唯一真源、Spec→Plan→Task 三层、全局/项目/模块三级 AGENTS.md、自动化门禁、失败经验回流，目标是控制 AI 代码熵增。

三篇都反对同一类做法：把权限、重试、状态、审计交给提示词和模型自觉。

## 二、SwarmStudio 现状盘点

盘点范围：`custom/server`（80+ 域）、`custom/client`、`patches/`、`custom/qgate`。判断口径：只有被生产路径消费的才算「已接线」，纯函数 + 单测记为「有模块未接线」。

| 九层 | 已有实现 | 主要缺口 |
|---|---|---|
| Tools | 工具注册与 JSON Schema 在上游；`tooldesc` 做描述覆盖；`toolresultguard` 做注入围栏 | 没有统一工具契约：副作用、超时、重试、幂等、错误码没有单一事实源；错误结果多为自由文本 |
| Loop | runaway guard（连续同动作/同结果/ABAB 等六信号）、图回边守卫、停滞检测、步数与预算 | 图节点对任何异常一律重试；退避线性、无抖动、不读 Retry-After；阈值多处硬编码 |
| Memory | 图检查点 SQLite（state/nextNodes/interrupts/cost）；agent 进展检查点；交接检查点 | 两套检查点无统一 run 键；不保存模型参数与上下文摘要；恢复需人工触发 |
| Context | 规格文档体系完整；`agentsmd`/`rulesscope` 有纯函数 | 仓库无根 AGENTS.md；无三级装载链；入口长度无约束；两个纯函数无消费者 |
| Sandbox | 权限模式矩阵、workspace 归属校验、命令审批、工具超时 | 无目录白名单、无网络放行（`browsersec` 死代码）、无任务后销毁、审批预览含原值 |
| Verification | qgate 15 个 gate pack/46 门；release gate；UI Oracle | 常用 profile（vibe-fast）只启用 7 门；无 typecheck 脚本；L0 登记数据为空；架构/契约/文档门无生产者 |
| Permissions | enforce-gate 三级裁决；审批收件箱五源；审批历史 | 裁决只看 profile，`userId` 仅入审计；审批记录缺 scope/expiresAt/source；放行决策不落账；裁决端点无归属校验 |
| Observability | 逐工具 pre/post JSONL；trace JSONL；incident 报告 | 审计缺耗时/错误分类/参数摘要；审计目录未收紧；trace 参数未脱敏；无运行清单（模型参数/prompt 版本）；无运行级成本 |
| Evals | Eval Studio 可回放判分（result/trajectory/risk）；heldout 密封库；benchmarkforge | 无固定能力评测集；工具参数、失败恢复、长任务状态、越权/注入、升级正确性无专用评测；评测未接门禁 |

一句话总结：**能力密度很高，执行链闭环不足**。多数域是「纯函数 + 单测」，缺的是把契约、审计、重试、评测接进真实运行路径。

## 三、本轮落地（已合入 main）

1. **工具契约层** `custom/server/toolcontract/`
   - 副作用等级、超时、重试策略、幂等模式、脱敏键的单一事实源。
   - 错误归一分类（transient/rate_limit/auth/permission/not_found/validation/conflict/unknown）。
   - 指数退避 + 抖动 + Retry-After，最大延迟封顶。
   - 幂等键（工具+用户+时间窗+脱敏参数指纹）与 TTL 台账（JSON 原子写）。
   - 连续重复调用签名追踪（默认阈值 3，只告警不阻断）。
2. **审计账 v3** `toolpipeline/tool-hooks.ts`
   - 新增耗时、错误类别、可重试性、参数指纹、脱敏摘要、副作用等级、重复标记、幂等命中。
   - 审计目录 0700、文件 0600。
   - 默认只记参数形状，不落入参值；`TOOL_AUDIT_ARG_VALUES=1` 才落脱敏值摘要。
   - 新增 `GET /api/harness/tool-audit` 查询面与聚合。
3. **权限感知重试** `loop/graph/graph-runtime.ts`
   - 权限/认证/参数校验/资源不存在不重试；瞬时/限流按策略退避。
   - `unknown` 默认保留重试，兼容既有推演图；可用 `retryOn`/`nonRetryable` 收窄。
4. **九层运行体检** `harness/nine-layers.ts`
   - 九层逐项检查、分数、状态、差距、建议动作；数据缺席如实降级。
   - `GET /api/harness/nine-layers`（30 秒缓存）。
   - 治理页「驾驭工程」新增「九层运行体检」板块。
5. **规范入口**
   - 新增仓库根 `AGENTS.md`（36 行）与 `custom/server/AGENTS.md`、`custom/client/AGENTS.md`。
   - 新增 `npm run typecheck:harness` 定向类型门（新增服务端模块 0 错误）。

## 四、剩余优先队列

### P0（安全边界，下一轮优先）

1. **按发起用户鉴权**：把 `userId` 接进 `enforce-gate` 裁决，结合 `agentidentity` 的委托链与 `toolAllowlist`；当前裁决只看 `profileId`。
2. **审批记录补全**：`scope`、`expiresAt`、`source(human|policy)`；`/api/approval/decide` 全路径写入审批历史与 govbus；裁决端点加归属/角色校验。
3. **放行决策审计**：`ladder-pass`/`mode-pass` 放行结果写入决策账，回答「为什么放行」。

### P1（运行可观测与评测）

4. **运行清单（run manifest）**：会话启动时落模型/参数/prompt 版本/工具契约版本/权限模式/预算，与 trace、incident、evidence 用 runId 关联。
5. **运行级成本**：token 账按 runId 归集，支持超预算事前阻断/降级。
6. **固定能力评测集**：覆盖完成率、工具参数正确率、失败恢复、长任务状态保持、越权/注入、成本/延迟/无效循环、升级人工正确性七维；接入门禁。
7. **自动恢复判定**：统一图检查点与 agent 检查点 run 键；给出安全续跑/新会话/人工闸三档判定。

### P2（沙箱与自进化）

8. **执行沙箱**：terminal 目录白名单、浏览器网络放行接上 `browsersec`、提示词入口 secret 扫描、任务后销毁。
9. **过程质量指标**：重复调用率、无效步骤率、超长链占比、首次生成成功率、规范符合率。
10. **失败经验回流**：qgate/eval/review 失败自动提取到 ERRORS/LEARNINGS 类知识库，并在下一轮派单强制读取；当前 expcandidates 默认关闭且不读 qgate。
11. **门禁 UI 产品化**：qgate run/waive/evidence/release-report 操作面；Eval Studio 默认开启。

## 五、验证与边界

- 全量 vitest：**5026 通过 / 8 跳过 / 0 失败**（2026-10-18，rebase 后复跑）。
- 定向类型检查：`npm run typecheck:harness` 0 错误。
- 本轮不改变权限执法语义（enforce-gate 行为不变），因此没有安全边界回归风险；对应缺口保留在 P0。
- 未做整包构建与 8649 浏览器走查：共享上游树被并行会话占用，`npm run inject` 会改写共享注入态并影响在跑服务；SFC 已通过组件挂载测试完成编译验证，API 已通过真 Koa HTTP 测试。装机与整包验证按工作区规则需用户明确指令。
