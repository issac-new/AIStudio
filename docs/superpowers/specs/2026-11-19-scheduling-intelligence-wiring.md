# 调度智能接线：节点级模型、judge 真调用与能力矩阵生产者

> 日期：2026-11-19
> 状态：实施中（用户指令「继续 完成所有」）
> 来源：SoduWork 调度智能支柱（按步骤选 harness/模型、底座解耦、独立 judge）与 modelcap 既有骨架
> 关联：`2026-11-19-skill-call-authorization.md`、`2026-11-19-delivery-version-binding.md`、`2026-11-19-acp-harness-catalog.md`
> 读者：需要让图节点真正按模型派发、让 judge 真正调用、让能力矩阵有数据的开发与运维

## 变更

### 问题

三处骨架完整但没有接线：

1. `GraphSpec.NodeSpec` 只有 `config` 自由字典，没有模型字段；`AgentTaskConfig`/`KanbanCreateRequest`/`HttpKanbanBridge` 也不带模型，`agent-task` 建卡永远走 profile 默认。
2. `VerifierDeps.callJudge` 存在但 `createProductionVerifierDeps()` 不注入，且合同 `verificationIntent.judge` 在生产路径恒为 null；judge 是死代码。
3. `CapabilityMatrix` 形状完整，`buildMatrix` 可用，但全仓没有生产者；`matrix.json` 永远不存在，风险路由恒 fallback。

### 范围

**新增**

- `custom/server/modelroute/node-resolve.ts`：节点执行规格解析（显式模型 > 显式档 > complexity 自动档 > defaultModel > 不 pin）。
- `custom/server/enginemodels/routing-config.ts`：只读 engine 配置投影（route + defaultModel id，mtime 缓存）。
- `custom/server/loop/graph/judge-client.ts`：OpenAI-compatible judge 客户端（超时、diff 截断、失败转 pending）。
- `custom/server/modelcap/from-eval.ts`：eval run → capability observations 的确定性投影。
- `scripts/maintenance/modelcap-build-cli.ts`：矩阵生产者（默认 dry-run，`--write` 落盘）。不新增 `.mjs` 薄壳，避免机制预算 scripts +1；运行方式：`node node_modules/vite-node/vite-node.mjs scripts/maintenance/modelcap-build-cli.ts [--write]`。
- 测试：node-resolve 6、judge-client 6、from-eval 5、node-executors 2、verifier-bridge 3。

**修改**

- `custom/server/loop/graph/graph-spec.ts`：`NodeSpec.execution` 可选结构化字段；hydrate 时并入工厂 config。
- `custom/server/graph/node-executors/index.ts`：`AgentTaskConfig.execution`；`KanbanCreateRequest` 顶层 `model/provider/reasoning`；`HttpKanbanBridge` 透传；卡 body 写 `routing` 审计块；`SimulationNodeOpts.resolveExecution` 注入点。
- `custom/server/loop/graph/graph-assembly.ts`：两处 `registerSimulationNodeTypes` 注入 resolver（editor runtime + director runtime）。
- `custom/server/loop/engine/verifier.ts`：`VerifierDeps.defaultJudge`；合同无 judge 时使用默认意图。
- `custom/server/loop/graph/verifier-bridge.ts`：`GRAPH_JUDGE_BASE_URL/MODEL/API_KEY/TIMEOUT_MS/MAX_DIFF_CHARS/ENFORCE/MIN_SCORE/RUBRIC` 注入 callJudge/defaultJudge；未配置保持跳过。
- `custom/server/loop/graph/__tests__/verifier-bridge.test.ts`：旧「judge NOT configured」断言改为「judge disabled」；新增启用/defaultJudge 用例。

**不做**

- 不做真实 provider/模型 e2e（需凭据与外部服务）；本批验证协议形状与失败降级。
- 不做 engine providerId → hermes provider 的命名空间映射：档位路由只回 `modelId`，provider 仅在节点显式给出时透传。
- 不让 resolver 消费 modelcap 风险路由（high 风险 requiresHuman 的派发阻断留待下一批；矩阵先生产出来）。
- 不做矩阵定时刷新/自动消费；生产者是手动/运维命令。

### 验收判据

1. `NodeSpec.execution` 经 hydrate 进入工厂 config；`agent-task` 建卡请求顶层带 `model/provider/reasoning`，卡 body 带 `routing`。
2. `HttpKanbanBridge` 只发上游认识的 `model/provider/reasoning`（不是 `model_override`），且 provider 必须伴随 model。
3. resolver 优先级：显式模型 > 显式 tier > complexity 自动档 > defaultModel；映射缺失如实 `unmapped:true`，不猜。
4. judge 未配置：日志一次 `judge disabled`，合同 judge 项跳过；judge 配置后 `callJudge`/`defaultJudge` 在位。
5. judge 客户端：合法 JSON/围栏 JSON 解析；HTTP 错/坏 JSON/分数越界/超时全部 `pending`；diff 超限截断。
6. `defaultJudge` 让无 judge 意图的合同也走 judge；`pending` 不阻断 overall。
7. 矩阵生产者：只认 done + model + setHash 一致；每 task 取 sampleIdx=1；未标维度跳过并计数；默认 dry-run。
8. 图/模型全量测试 615 例与 typecheck 全绿。

## 任务卡

### 完成条件

图节点能按结构化规格把模型落到卡上；judge 可按 env 真调用且失败降级；能力矩阵有可重复的生产命令与数据口径。

### 输入与来源

`NodeSpec.execution`（图定义）；`runtime/ide-engine-models.json` 的 `route`/`defaultModel`；`GRAPH_JUDGE_*` 环境变量；`eval/store.json` 的 run/set。

### 工作流边界

只改图节点建卡、verifier 装配、eval→modelcap 投影与维护脚本；不改 kanban 派发内核、不改 execution-contract、不改 UI。

### 工具与副作用

resolver 只读配置；judge 只发 HTTP POST；矩阵脚本默认 dry-run，`--write` 才原子写 `matrix.json`；不执行 harness。

### 结果与证据

卡请求顶层模型字段 + body.routing；`VerificationRecord.results.judge` 记录 model/status/score/reason；`matrix.json` 的 cells/sources 可复核。

### 异常与恢复

模型/档位缺失 → 不 pin 或回落默认并标 unmapped；judge 任何失败 → pending；eval 数据不足 → 全部 insufficient，不降门槛；矩阵文件坏 → `loadMatrix` available:false。

### 验收反例

provider 无 model 不应发出；显式 model 不应被档位覆盖；judge HTTP 500 不应抛异常；分数 1.7 不应通过；没有 sampleIdx=1 的 task 不应产生观测；setHash 不一致的 run 不应入矩阵。

## 决策记录

### D1 `NodeSpec.execution` 用结构化字段，不塞 `config`

`config` 是自由字典，编辑器 `NodeConfigPanel` 对未知节点类型只保留白名单键，塞进去会被编辑器 roundtrip 丢掉。结构化字段随 GraphSpec 快照 hash 一起冻结，可审计。

### D2 档位路由只回 modelId

`runtime/ide-engine-models.json` 的 providerId 是 engine 命名空间（如 `builtin:bigmodel-coding-plan`），与 hermes gateway 的 `cc-switch-route` 不同源。直接透传可能解析失败或静默走默认；本批只 pin model，provider 仅由节点显式声明。

### D3 resolver 优先级固定

显式 model > 显式 tier > complexity 自动档 > defaultModel > 不 pin。理由：越靠近作者的意图优先级越高；不猜复杂度（必须显式 `complexity`），避免服务端启发式导致模型漂移不可审计。

### D4 judge 默认关闭、显式 env 开启

未配置 `GRAPH_JUDGE_BASE_URL`+`GRAPH_JUDGE_MODEL` 时保持既有「跳过 judge」语义；配置后才注入。`GRAPH_JUDGE_ENFORCE=1` 才让无 judge 意图的合同也走默认 judge。理由：judge 有成本/延迟/误判风险，不能部署即改变所有合同。

### D5 judge 失败一律 pending

HTTP 错、超时、坏 JSON、分数越界都返回 `{status:'pending'}`，不 throw、不判失败。理由：与既有 `JudgeVerdict` 语义一致；judge 故障不能烧穿 repair 循环。

### D6 矩阵只从 eval 投影，维度映射显式

eval 是唯一同时有模型与 pass@1 的来源；执行记录/run manifest 缺 pass 或 model。维度到能力类别用显式表，未标注/未映射跳过并计数；不拿全局均值或 task outcome 混入 eval 口径。

### D7 生产者默认 dry-run

`--write` 才落盘，输出 observations/rejected/cells/insufficient 计数；冷启动全是 insufficient 是正确行为，不降低 minSamples。

## 验证

```sh
cd .claude/worktrees/sodowork-followups
npx vitest run custom/server/loop/graph/__tests__ custom/server/modelcap/__tests__ \
  custom/server/modelroute/__tests__ custom/server/graph/__tests__
npm run typecheck:harness
```

结果：**615 passed / 48 files**；typecheck 通过。

未覆盖：真实 provider/模型调用；风险路由消费矩阵；矩阵定时刷新；看板 UI 展示 routing。

## 设计文档影响

DESIGN_SYNC: none

理由：新增节点执行规格、judge 装配与矩阵生产者，不触及整合正本、数字总账或架构图；`NodeSpec.execution` 与 `matrix.json` 口径以本 spec 为单一事实源。
