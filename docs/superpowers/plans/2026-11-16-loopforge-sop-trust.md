# LoopForge 可信 SOP 执行地板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AIStudio 的 SOP gate 只有真实零退出才能通过，未接线节点不再假成功，并让 `CustomSpecRuntime` 的 run 始终按起跑时的 GraphSpec 恢复、分叉和导出。

**Architecture:** 在现有 `GraphService / GraphRuntime / EventLogStore` 内增加每 run 快照与定义解析，不新建执行内核。gate 通过薄适配器复用 OS sandbox 和 lease；Agent 继续由既有 KanbanBridge 承载，本批只封住无真桥和 DryRun 假完成。

**Tech Stack:** Node.js >=23、TypeScript、Vitest、node:sqlite、Vue 3、macOS sandbox-exec / Linux bwrap。

**Spec:** `docs/superpowers/specs/2026-11-16-loopforge-sop-trust.md`（2026-11-16 用户指令「批准A」）

## Global Constraints

- 仅改 `custom/`、测试、`docs/DESIGN.md` 与设计索引；不改 vendor，不新增补丁或依赖。
- gate 只有 `status='ok' && exitCode===0` 通过；sandbox 不可用时禁止宿主机裸跑。
- 编辑器只能给命令目录键，不能给 argv、cwd、env 值、writableRoots，也不能通过 `spec.meta` 扩权。
- 本批不开放通用 Agent/subgraph，不实现 publish/rollback，不冻结 RunSpawner/ShadowRunner 的闭包型 GraphDef。
- DryRun 只能显式用于测试/shadow；`archived`、queued、消息投递成功都不是 Agent 完成证明。
- JWT、密钥和 env 值不得进入快照、事件或 checkpoint；Director 恢复必须重新提供 JWT。
- 旧 run 标 `legacy-unpinned`；legacy export 若读当前草稿必须标 `legacy-current-draft`；legacy deposit-template 返回 409。
- 所有测试先写并确认因缺失目标行为而失败，再写实现；每任务独立提交，合并前全量 `npm test` 和 `npm run typecheck:harness`。

## Review Focus

1. **命令含引号、shell 控制符或 `spec.meta.gateCommands`**：必须拒绝而非猜测解析或扩权；由 Task 3/4 的目录与预检测试覆盖。
2. **cwd、lease root、writableRoots 为符号链接、根目录本身或根外路径**：必须 canonicalize 后拒绝；由 Task 3 的路径测试覆盖。
3. **Director 重启后无 JWT、JWT 失效或 loader 选错 registry**：必须拒绝且不得写 JWT；由 Task 2/6 的恢复与泄漏测试覆盖。
4. **legacy 草稿已修改或删除**：export 必须明示来源，deposit 必须拒绝，fork 不得升级为 pinned；由 Task 2/6 的 legacy 测试覆盖。
5. **gate 超时、信号退出和大段敏感输出**：不得通过，不得留下无界日志或绕过 GraphRuntime 超时；由 Task 3 的 T 路径与脱敏测试覆盖。

---

### Task 1: 每 run GraphSpec 快照存储与内容指纹

**Files:**
- Create: `custom/server/loop/graph/run-spec-snapshot.ts`
- Modify: `custom/server/loop/graph/event-log-store.ts:66-99,171-213,279-309`
- Test: `custom/server/loop/graph/__tests__/graph-run-specs-store.test.ts`

**Interfaces:**
- Produces:
  - `GraphRuntimeKind = 'editor' | 'director'`、`GraphExecutionMode = 'production' | 'shadow'`。
  - `GraphSpecSnapshotMeta = { specId, revision:null, draftVersion, runtimeKind, executionMode, contentHash, createdAt, createdBy? }`。
  - `StoredGraphRunSpec = GraphSpecSnapshotMeta & { runId, spec:GraphSpec }`。
  - `graphSpecContentHash(spec: GraphSpec): string`，复用 Eval `canonicalize`，输出 SHA-256。
  - EventLogStore 新增 `saveRunSpec(row)`、`getRunSpec(runId)`、`copyRunSpec(sourceRunId,targetRunId,stamp)`；读写均深副本。

- [ ] **Step 1: 写失败测试**

覆盖 InMemory/SQLite 往返、同内容同 hash、键序变化 hash 不变、内容变化 hash 改变、深副本不可污染、copy 保留 spec/hash/runtimeKind 但替换 runId/createdAt、旧库只含三表时可打开、删除 draft 不删 run snapshot。核心断言固定为：

```ts
it('键序变化不改 hash，run snapshot 返回深副本', async () => {
  expect(graphSpecContentHash(specWithKeysReordered)).toBe(graphSpecContentHash(spec))
  const restored = await store.getRunSpec('run-1')
  restored!.spec.nodes[0].config.label = 'polluted'
  expect((await store.getRunSpec('run-1'))!.spec.nodes[0].config.label).toBe('original')
})
```

- [ ] **Step 2: 确认测试失败**

Run: `npx vitest run custom/server/loop/graph/__tests__/graph-run-specs-store.test.ts`
Expected: FAIL，提示 `saveRunSpec/graphSpecContentHash` 不存在。

- [ ] **Step 3: 实现快照类型、hash 与双存储**

新增 additive 表 `graph_run_specs(run_id PK,spec_id,revision,draft_version,runtime_kind,execution_mode,spec_json,content_hash,created_at,created_by)`；`saveRunSpec` 对重复 runId 拒绝，不 INSERT OR REPLACE。

- [ ] **Step 4: 运行存储与既有 spec 测试**

Run: `npx vitest run custom/server/loop/graph/__tests__/graph-run-specs-store.test.ts custom/server/loop/graph/__tests__/graph-specs-store.test.ts`
Expected: 全部 PASS，无旧 schema 破坏。

- [ ] **Step 5: 提交已批准设计、计划与本任务**

```bash
git add docs/superpowers/specs/2026-11-16-loopforge-sop-trust.md docs/superpowers/plans/2026-11-16-loopforge-sop-trust.md .swarm-yuan/decisions.jsonl custom/server/loop/graph
 git commit -m "feat(graph): 每 run GraphSpec 快照存储与内容指纹"
```

### Task 2: GraphService 按快照恢复、分叉与重启重建

**Files:**
- Modify: `custom/server/loop/graph/graph-service.ts:36-60,72-151,153-202,270-337`
- Modify: `custom/server/loop/graph/graph-runtime.ts`（run.started 元数据）
- Modify: `custom/server/loop/graph/types.ts:172-185`
- Test: `custom/server/loop/graph/__tests__/graph-service-snapshot.test.ts`
- Test: `custom/server/loop/graph/__tests__/graph-service-hardening.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `StoredGraphRunSpec/GraphSpecSnapshotMeta` 与存储方法。
- Produces:
  - `GraphDefinitionContext = { actor?:string; authToken?:string }`。
  - `GraphServiceOptions.loadRunDefinition?(runId,context): Promise<{def:GraphDef; snapshot:GraphSpecSnapshotMeta} | null>`。
  - `startRun(graphId,initialState?,runId?,options?: { snapshot?: { spec:GraphSpec; meta:GraphSpecSnapshotMeta }; definitionContext?:GraphDefinitionContext })`。
  - `resumeRun(runId,interruptId,value,context?)`；`GraphInstance.specSnapshot?`、`GraphInstance.specSource?: 'run-snapshot' | 'legacy-unpinned'`。

- [ ] **Step 1: 写 v1/v2、重启、fork 与 legacy 失败测试**

断言：v1 中断后注册 v2，resume v1 仍执行 v1；SQLite 重建后经 loader hydrate；fork 复制 hash；pinned 快照缺失抛 `run_spec_snapshot_missing`；无快照旧 run 保持 legacy；runtime-defined 不冒充 pinned。

```ts
it('v2 注册后恢复 v1 仍执行 v1', async () => {
  const resumed = await service.resumeRun(runV1, interruptV1, { decision: 'approved' })
  expect(resumed.state.executedDefinition).toBe('v1')
  expect(resumed.specSnapshot?.contentHash).toBe(hashV1)
})
```

- [ ] **Step 2: 写 Director 上下文测试**

loader 收到当前 `authToken`；无 JWT 时测试 loader 抛 `actor_credentials_required`；快照、事件和 checkpoint 均不含 token；editor/director 快照选择各自 stub registry。

- [ ] **Step 3: 确认新增测试失败**

Run: `npx vitest run custom/server/loop/graph/__tests__/graph-service-snapshot.test.ts`
Expected: FAIL，当前 resume 仍读 `this.graphs`，loader/options 不存在。

- [ ] **Step 4: 实现快照绑定与延迟定义解析**

`RunRecord` 保存 snapshot/def；start 先 `saveRunSpec` 再执行；resume/fork-start 对 pinned 每次经 loader 用当前上下文重建 def；rebuild 只恢复元数据，Director 等 resume 时再要求 JWT。legacy 保留当前 registry 回退但显式标记。

- [ ] **Step 5: 运行 GraphService 全量测试**

Run: `npx vitest run custom/server/loop/graph/__tests__/graph-service-snapshot.test.ts custom/server/loop/graph/__tests__/graph-service-hardening.test.ts custom/server/loop/graph/__tests__/graph-runtime-guards.test.ts`
Expected: 全部 PASS，旧 HITL/join/retry 行为不变。

- [ ] **Step 6: 提交**

```bash
git add custom/server/loop/graph
 git commit -m "fix(graph): run 按起跑快照恢复与分叉"
```

### Task 3: 真实 OS sandbox gate 与有界执行证据

**Files:**
- Create: `custom/server/loop/graph/gate-executor.ts`
- Modify: `custom/server/sandbox/exec-sandbox.ts:19-35,106-143`
- Modify: `custom/server/loop/graph/types.ts:100-120,201-218`
- Modify: `custom/server/loop/graph/graph-runtime.ts`（node complete/error 证据）
- Test: `custom/server/loop/graph/__tests__/gate-executor.test.ts`
- Test: `custom/server/sandbox/__tests__/exec-sandbox.test.ts`

**Interfaces:**
- Produces:
  - `GateCommandEntry = { command, argv:string[], cwd, timeoutMs, envAllowlist?, writableRoots? }`。
  - `GateExecutionEvidence = { command,argv,cwd,backend,leaseId,status,exitCode,durationMs,startedAt,finishedAt,stdout,stderr,stdoutTruncated,stderrTruncated }`。
  - `executeGraphGate(config:{id:string;command?:string},ctx:NodeContext,deps:GateExecutorDeps): Promise<NodeResult>`。
  - `NodeResult.evidence?: Record<string,unknown>`；`NodeExecutionError { code,evidence? }`。

- [ ] **Step 1: 写 gate 全结果矩阵与路径失败测试**

覆盖缺 command、非目录命令不 spawn、引号/shell 控制符拒绝、ok+0 才通过、非零/null/timeout/error/unavailable 全失败、root/cwd/writableRoots symlink 与根外拒绝、lease TTL 覆盖 timeout、Graph 节点 timeout 晚于 sandbox timeout。

```ts
it('真实非零退出不得通过', async () => {
  runSandboxedMock.mockResolvedValue({ status: 'ok', exitCode: 1, stdout: '', stderr: 'failed' })
  await expect(executeGraphGate({ id: 'g', command: 'test' }, ctx, deps))
    .rejects.toMatchObject({ code: 'gate_failed', evidence: { exitCode: 1 } })
})
```

- [ ] **Step 2: 写证据和终止路径测试**

断言 stdout/stderr 经 `redactSensitive` 后有界且带 truncated；事件不含 env 值/token；非零退出后下一节点未执行；retry 与 `onError:goto/retry-goto` 被拒绝；超时后 lease 可清扫且 run failed。

- [ ] **Step 3: 确认测试失败**

Run: `npx vitest run custom/server/loop/graph/__tests__/gate-executor.test.ts custom/server/sandbox/__tests__/exec-sandbox.test.ts`
Expected: FAIL，`executeGraphGate` 不存在，当前空 gate 仍可成功。

- [ ] **Step 4: 实现薄 gate 适配器与证据传播**

只执行目录固定 argv；canonicalize 根路径并建立 run/node/attempt lease；复用 `runSandboxed`。`exec-sandbox` 仅 additive 增加 stdout/stderr truncated；GraphRuntime 把白名单 evidence 写入完成/失败事件，不改 BSP/reducer。

- [ ] **Step 5: 运行 gate、sandbox 与 runtime 测试**

Run: `npx vitest run custom/server/loop/graph/__tests__/gate-executor.test.ts custom/server/sandbox custom/server/loop/graph/__tests__/graph-runtime-guards.test.ts`
Expected: 全部 PASS，所有负面路径无成功状态。

- [ ] **Step 6: 提交**

```bash
git add custom/server/loop/graph custom/server/sandbox
 git commit -m "fix(graph): gate 真实沙箱执行与有界证据"
```

### Task 4: CustomSpecRuntime 起跑预检与快照起跑

**Files:**
- Modify: `custom/server/loop/graph/spec-runtime.ts:35-83,332-355`
- Create: `custom/server/loop/graph/spec-capabilities.ts`
- Test: `custom/server/loop/graph/__tests__/spec-runtime.test.ts`
- Test: `custom/server/loop/graph/__tests__/spec-runtime-snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1 hash/meta、Task 2 start options、Task 3 gate adapter。
- Produces:
  - `SpecExecutionCapabilities = { gateCatalog:GateCommandEntry[]; hasRealKanbanBridge:boolean; executionMode:GraphExecutionMode }`。
  - `CustomSpecRuntimeDeps { runtimeKind:'editor'|'director'; capabilities; ... }`。
  - `CustomSpecRuntime.startRun(specId,initialState?,context?:GraphDefinitionContext)` 和 `hydrate(spec):GraphDef`，供 Task 6 loader 复用。

- [ ] **Step 1: 改写旧 gate 测试并新增起跑预检测试**

删除“白名单内即 gatePassed”的预期。断言 Agent/subgraph/无真桥 agent-task 在任何 function/gate 副作用前返回 422 类 `EditorSpecError`；显式 shadow 才允许 DryRun；空 gate、spec.meta 扩权和 gate retry/onError 绕行均拒绝。

```ts
it('Agent 不可执行时任何节点副作用都未发生', async () => {
  await expect(runtime.startRun('spec-with-agent'))
    .rejects.toMatchObject({ code: 'agent_execution_unavailable' })
  expect(functionAndGateSideEffects).toEqual([])
})
```

- [ ] **Step 2: 写快照起跑测试**

断言 start 调用保存完整 spec、`runtimeKind/executionMode/draftVersion/contentHash/createdBy`；快照保存失败时 GraphRuntime 未启动；`hydrate(spec)` 与 start 使用同一注册表。

- [ ] **Step 3: 确认测试失败**

Run: `npx vitest run custom/server/loop/graph/__tests__/spec-runtime.test.ts custom/server/loop/graph/__tests__/spec-runtime-snapshot.test.ts`
Expected: FAIL，当前预检、runtimeKind、catalog 和 snapshot 参数不存在。

- [ ] **Step 4: 实现固定起跑顺序与真实 gate 注册**

固定为 read clone → validate → capability preflight → hydrate → GraphService snapshot start。通用 Agent/subgraph 本批始终不可执行；agent-task 仅在真实桥或显式 shadow 下可执行。

- [ ] **Step 5: 运行 spec-runtime 与快照集成测试**

Run: `npx vitest run custom/server/loop/graph/__tests__/spec-runtime.test.ts custom/server/loop/graph/__tests__/spec-runtime-snapshot.test.ts custom/server/loop/graph/__tests__/graph-service-snapshot.test.ts`
Expected: 全部 PASS，预检先于任何副作用。

- [ ] **Step 6: 提交**

```bash
git add custom/server/loop/graph
 git commit -m "feat(graph): 起跑能力预检与快照绑定"
```

### Task 5: 关闭隐式 DryRun 与 archived 假完成

**Files:**
- Modify: `custom/server/graph/node-executors/index.ts:58-85,220-306`
- Modify: `custom/server/loop/graph/graph-assembly.ts:293-388`
- Test: `custom/server/graph/__tests__/simulation-node-executors.test.ts`
- Test: `custom/server/loop/graph/__tests__/assembly.test.ts`

**Interfaces:**
- Consumes: Task 4 capabilities/runtimeKind。
- Produces: `SimulationNodeOpts.allowDryRun?: boolean`；无 bridge 且未显式 allow 时使用抛 `agent_execution_unavailable` 的 unavailable bridge；`DONE_STATUSES` 仅含 `done`。

- [ ] **Step 1: 写 DryRun/shadow 与 archived 失败测试**

断言生产无 bridge 即失败；显式 `allowDryRun + executionMode='shadow'` 才可即建即完；shadow 快照保留 executionMode；archived 不完成并在短超时后失败；Director 无 token 不再隐式 DryRun。

```ts
it('生产无 bridge 不得隐式 DryRun', async () => {
  registerSimulationNodeTypes(registry, { allowDryRun: false })
  await expect(agentTaskNode.execute({}, ctx))
    .rejects.toMatchObject({ code: 'agent_execution_unavailable' })
})
it('archived 不得完成', async () => {
  await expect(archivedAgentNode.execute({}, ctx)).rejects.toThrow(/超时/)
})
```

- [ ] **Step 2: 确认测试失败**

Run: `npx vitest run custom/server/graph/__tests__/simulation-node-executors.test.ts custom/server/loop/graph/__tests__/assembly.test.ts`
Expected: FAIL，当前隐式 DryRun 与 archived 成功仍存在。

- [ ] **Step 3: 实现装配边界**

editor/director 都向 CustomSpecRuntime 注入 runtimeKind/capabilities；有真实 token/bridge 才标 real；测试与 sim shadow 显式传 DryRun。非 Agent 的 function-only spec 不因缺 bridge 被误拒。

- [ ] **Step 4: 运行 graph/assembly/sim 回归**

Run: `npx vitest run custom/server/graph custom/server/loop/graph/__tests__/assembly.test.ts custom/server/loop/graph/__tests__/graph-e2e.test.ts`
Expected: 全部 PASS，无生产隐式 DryRun。

- [ ] **Step 5: 提交**

```bash
git add custom/server/graph custom/server/loop/graph
 git commit -m "fix(graph): 封住 DryRun 与 archived 假完成"
```

### Task 6: REST 快照投影、Director 恢复上下文与界面口径

**Files:**
- Modify: `custom/server/loop/graph/graph-rest.ts:248-377,389-538`
- Modify: `custom/server/loop/graph/graph-assembly.ts`（snapshot loader）
- Modify: `custom/client/loop/orchestrator/components/NodeConfigPanel.vue:304-319`
- Modify: `custom/client/loop/orchestrator` 既有 i18n
- Test: `custom/server/loop/graph/__tests__/graph-rest-snapshot.test.ts`
- Test: `custom/client/loop/orchestrator` 相关组件测试

**Interfaces:**
- Consumes: Task 2 loader context、Task 4 `hydrate(spec)`、Task 5 runtime factories。
- Produces: run detail/export 的 `specSnapshot/specSource`；Director resume/fork-start 的当前 JWT context；legacy deposit 的 409 `run_spec_snapshot_missing`。

- [ ] **Step 1: 写 REST 与 loader 失败测试**

覆盖 pinned export/deposit 不读新稿；legacy export 标 `legacy-current-draft`，草稿删除时 spec=null 仍明示；legacy deposit 409；legacy fork 不升级 pinned；Director 无/错 JWT 拒绝，editor/director 不串 registry；响应与事件不含 Authorization。

```ts
it('legacy export 明示当前草稿，deposit 拒绝', async () => {
  expect((await exportRun(legacyRunId)).body.specSource).toBe('legacy-current-draft')
  expect((await depositRun(legacyRunId)).status).toBe(409)
  expect((await depositRun(legacyRunId)).body.code).toBe('run_spec_snapshot_missing')
})
```

- [ ] **Step 2: 写 UI 失败测试**

断言 Agent 文案为本批不可执行，gate 文案为真实服务端目录 sandbox 执行，不再出现“Agent 已派发”的暗示。

- [ ] **Step 3: 确认测试失败**

Run: `npx vitest run custom/server/loop/graph/__tests__/graph-rest-snapshot.test.ts custom/client/loop/orchestrator`
Expected: FAIL，当前 export/deposit 读当前 spec，UI 仍是占位口径。

- [ ] **Step 4: 实现 loader、REST 与文案**

loader 按 snapshot.runtimeKind 选 editor/director runtime 并调用同一 `hydrate`；REST 从当前请求提取 actor/JWT，仅作调用上下文传递。保持现有 limit、interrupt、stampApproverIdentity 语义。

- [ ] **Step 5: 运行 REST、GraphService 与 UI 测试**

Run: `npx vitest run custom/server/loop/graph custom/client/loop/orchestrator`
Expected: 全部 PASS，legacy/pinned 契约清晰。

- [ ] **Step 6: 提交**

```bash
git add custom/server/loop/graph custom/client/loop/orchestrator
 git commit -m "fix(graph): REST 快照投影与恢复身份边界"
```

### Task 7: 真实运行验收、变异探针与设计同步

**Files:**
- Modify: `docs/DESIGN.md`（图执行能力行）
- Modify: 既有设计索引（只由生成器更新）
- Test: 本批全部测试与真实运行证据

**Interfaces:**
- Consumes: Task 1-6 全部行为。
- Produces: 可复现的真实 sandbox、恢复、导出与 UI 验收结果；未验证平台明确披露。

- [ ] **Step 1: 运行目标域与类型检查**

Run: `npx vitest run custom/server/loop/graph custom/server/graph custom/server/sandbox custom/client/loop && npm run typecheck:harness`
Expected: 全部 PASS，无新增 TS 错误。

- [ ] **Step 2: 做真实 OS sandbox 冒烟**

在 macOS `sandbox-exec` 分别运行零退出和非零退出 gate，检查真实进程事实、exitCode、脱敏有界输出和后续节点未执行。Linux 仅在 bwrap 存在时做同项，否则写“Linux 真执行未验证，只验 unavailable”。

- [ ] **Step 3: 做三个变异探针**

分别把 `exitCode===0` 改恒 true、resume 改回最新 `this.graphs`、恢复隐式 DryRun；每次只保留一个变异并运行对应测试。Expected: 非零退出、v1/v2、能力预检测试分别 FAIL；随后还原并复跑 PASS。

- [ ] **Step 4: 浏览器实物走查**

启动隔离后端/前端，验证 Agent 不可执行提示、非法 gate 起跑失败、成功/失败 gate 证据、v1/v2 恢复与导出、Director 无 JWT 拒绝。记录 URL、操作、控制台错误与截图；不得以单测代替 UI 走查。

- [ ] **Step 5: 全量回归与独立审查**

Run: `npm test`
Expected: 本批新增失败为 0；pre-existing 红单独列证据。随后由 fresh reviewer 检查全部 diff、负面路径、日志秘密和 spec 覆盖，主会话复跑其指出的关键用例。

- [ ] **Step 6: 同步设计并提交收口**

更新 `docs/DESIGN.md`：真实 sandbox gate、不可执行节点 fail-closed、CustomSpecRuntime 快照与 legacy 边界，明确未开放 Agent/subgraph/publish。运行既有索引生成器，检查 `git diff --check`、`scripts/merge-invariants.mjs --check`，提交：

```bash
git add custom docs .swarm-yuan/decisions.jsonl
 git commit -m "docs(design): 可信 SOP 执行地板验收与设计同步"
```

## Self-Review 结论

- Spec 的真实 gate、预检、快照、Director 上下文、legacy、UI、测试与 DESIGN_SYNC 均有 Task 对应；RunSpawner/ShadowRunner 明确不在 pinned 范围。
- Task 1-6 的 `GraphSpecSnapshotMeta / GraphDefinitionContext / GateCommandEntry / hydrate` 名称与形状一致。
- 五个 Review Focus 均落到具体测试步骤；没有“适当处理”“补测试”之类不可执行步骤。
- 本计划只固定实现者无法从代码知道的边界；函数体、局部命名和 fixture 细节留给实现者。
