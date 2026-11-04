# 工具契约真执法（W1：从「只声明」到「接线生效」）

> 日期: 2026-11-04
> 状态: 已实施
> 关联: 调研源=vivo《面向技术产品经理的 Agent Harness 设计》（mp.weixin xDcGpE-s_UefbJwPwbE6uQ）第 4/5/8 章；前置轮=2026-10-18-harness-reliability-round（契约表落地）、2026-10-21-wx-research-absorption（schema 字段落地但未接线）

## 变更

2026-10-18/10-21 两轮把工具契约七字段（name/sideEffect/timeoutMs/retry/idempotency/redactKeys/schema）落成了静态表与纯函数，但执行面消费为零：`validateToolCallArgs` 与 `authzAllowed` 全仓无生产调用，`outputSchema` 零声明，`ToolContract.timeoutMs` 无消费者——契约停在「审计参考」，模型非法参数照常执行。本轮把契约接进执行瀑布与审计面，全部走 custom/ 零 patch：

1. **契约名对齐运行时**：ekko 运行时真实工具名是 `terminal_exec`/`code_exec`/`skill_list`，契约表写的是 `terminal`/`execute_code`/`skills_list`——三个工具一直落到 DEFAULT 兜底（external/no-retry）。新增 `CONTRACT_ALIASES` 映射，`resolveToolContract` 解析别名（原名直查优先，向后兼容）。
2. **入参 schema 执法**：新增 `contractGuardHook` 排进执行瀑布（audit 后、结果围栏前）：契约声明了 `inputSchema` 的工具，入参违规即拒绝执行（`{allow:false}` 结构化错误，机器可读 code）；未声明的工具零变化（fail-soft 放行，沿用「无契约不检查」纪律）。
3. **出参 schema 校验**：`postExecute` 对声明 `outputSchema` 的工具校验结果形状：默认只审计（`errorCategory:'validation'` + `errorCode:'OUTPUT_SCHEMA_INVALID'`）；契约另声明 `outputEnforcement:'strict'` 时把结果改写为错误信封（fail-closed）。
4. **幂等键 material 补执行身份 + 命中短路**：`computeIdempotencyKey` material 增加可选 `taskId/stepId/runId`（存在即入料；缺失保持旧键向后兼容）；`IdempotencyStore` 增加有界结果缓存（脱敏摘要 + 8KB 上限），契约声明 `idempotency.replay:'return'` 且命中时短路返回缓存结果（`{ok:true, replayed:true}`），默认仍只观测。
5. **统一错误信封**：新增 `normalizeToolOutcome()` 归一四种存量形状（`error`/`ok:false`/`success:false`/`status:'error'`）为 `{ok, code?, category, retryable, requestId?, details?}`；审计行统一落 `errorCode`，不改变工具原始返回体。
6. **审计字段贯通**：审计行增加可选 `traceId/taskId/stepId/workflowVersion/promptVersion/inputRef/outputRef/retryCount/approvalId`（新增 `ToolCallContext` 透传；缺省 undefined，旧日志读取兼容）——补齐源文「单条可关联执行记录」在工具层的字段面。
7. **图 run 终态不再「跑完即成功」**：`graph-runtime.ts` 终态附 `finishReason` 与 `verification:{nodesCompleted,nodesFailed,nodesInterrupted}`；存在失败/中断节点时终态事件如实携带，消费方可判别。
8. **重试档位补齐**：`contract.ts` 新增 `MODEL_GENERATION_RETRY`（有界、修错重生成语义）与 `LONG_TASK_RETRY`（不盲目重放、拆分/租约语义）两档导出，`delegate_task` 改挂 model_generation——模型生成类工具不再按 external 一律 no-retry。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 | decisions.jsonl 行号 |
|------|------|------|------|------|---------|---------------------|
| 契约执法落点 | 新增 contractGuardHook 排瀑布，不并入 auditHook | 改 auditHook / 改 ekko registry | auditHook 头部声明「fail-open 永不阻断」是其契约；拦截语义属执法面，独立钩子可单独开关且不动观测面 | Mechanical | approved | 71 |
| schema 拒绝默认开还是默认关 | 契约声明即生效（默认开，但仅对已声明 schema 的工具） | 加环境变量总开关 | 「声明即执法」是本轮立意；未声明工具零变化已保证兼容；源文「Prompt 可被误解，Schema 必须执行前强制生效」 | Mechanical | approved | — |
| 幂等短路默认态 | 契约显式 `replay:'return'` 才短路，默认只观测 | 全局短路 | 观测→短路的灰度路径：先让缓存与命中率可审计，确认键无碰撞再逐工具打开（防误短路吞真实变化） | Mechanical | approved | — |
| timeoutMs 是否本轮接执行器 | 不接（本轮只接 schema/幂等/错误信封） | 在瀑布里加超时 | 超时需要瀑布支持中止执行（上游接口改造），本轮零 patch 边界内做不到；如实记未做 | Mechanical | approved | — |
| K19 `ok:false` 棘轮面（合并轮补记） | `toolcontract/error-envelope.ts` 入 ratchet 白名单，全部信封构造收敛该模块；执法面与测试夹具的字面量消除 | 抬阈值 874 / 在无关旧代码对冲减数 | 白名单理据与 lib/http.ts 相同——统一失败出口的实现必然含失败字面量；棘轮只许减少不抬阈值；消除后计数回落 874 压线（888→874） | Mechanical | approved | — |
| 审计面失败判定口径（合并轮补正） | `tool-hooks.postExecute` 失败判定与 errorCode 同源，统一走 `normalizeToolOutcome` 归一 | 维持只认显式 `ok===false` | 全量轮夹具改用 `{error}` 存量形状即暴露真缺陷：旧形状失败被审计记成成功、且会写成功幂等缓存——与 W1「审计面拿到统一机器可读结局」的立意相悖 | Mechanical | approved | — |

## 验证

- `npx vitest run custom/server/toolcontract custom/server/toolpipeline custom/server/loop/graph`——49 文件 583 用例全绿（较改前净增 28 用例：别名解析、入参 schema 拒绝/放行、出参校验 audit/strict 两档、幂等键 material 兼容与身份入键、replay 短路回放、错误信封四形状归一、审计关联字段、图终态 finishReason/verification 三态）。
- `npm run typecheck:harness`——零错误。
- 兼容性：未声明 schema 的工具行为不变（`search_files` 放行锚定）；幂等键在执行身份缺席时与旧版逐字节一致（存量账不失效）；两处守门断言按新口径更新（契约版本号 2026-11-04.1、瀑布 8 节）。
- 合并轮补正（2026-11-04）：首次 merge 后全量 `npm test` 三红（K19 棘轮 888>874／设计索引未登记／附录 A.1 未登记），全部当轮根治——K19 白名单决策与信封收敛（见决策表）、两处索引登记补齐、附录头部累积五代重复块（538/533/528/526/521）清除；审计面失败判定改归一源并补 `{error}` 形状用例。补正后 `npx vitest run custom/__tests__/architecture-ratchet.test.ts custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/interactive-training-manual.test.ts custom/server/toolcontract custom/server/toolpipeline custom/server/loop/graph` 52 文件 610 用例全绿，`npm run typecheck:harness` 零错。

## 设计文档影响

- DESIGN_SYNC: none —— 本轮不改产品面（无新页面/路由/端点）、不改架构边界（钩子链既有装配点内新增一环）、不触稳定参数口径（TOOL_CONTRACT_VERSION 升位为新增字段记录，非总账数字）。工具契约能力状态属 harness 可靠性域内部演进，整合正本 §8.4 能力表不因 overlay 内部接线而改档。
