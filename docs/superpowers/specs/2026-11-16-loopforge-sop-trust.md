# LoopForge 对照首批：可信 SOP 执行地板

> 日期：2026-11-16
> 状态：已批准（2026-11-16 用户指令「批准A」），待实施
> 基线：AIStudio `a3076aa9a`；LoopForge `dd56585276d8ecb6e0d6865f55e255194d75f85a`
> 来源：[微信文章](https://mp.weixin.qq.com/s/mLYvvSaVpzuKvlsHZvFeHA)、[LoopForge 官方仓](https://github.com/Tencent/LoopForge)、[LoopForge 官网](https://loopforge.cn)
> 读者：需要决定首批修复范围的 AIStudio 维护者，以及后续实现、审查和验收人员

## 1. 为什么先做可信执行，而不是健康分

### 1.1 决定性现状

AIStudio 已有 DAG、人工审批、检查点、cron、多个执行后端和 Harness² 改进实验链，不需要复制 LoopForge，也不需要第三套执行内核。当前首先损害交付真实性的，是三条可复现路径：

1. 编辑器 `gate` 只检查命令字符串是否在白名单，随后直接写 `gatePassed=true`；无命令也通过，命令并未执行。`agent` 只登记 `agentRequest`，不派发。证据：`custom/server/loop/graph/spec-runtime.ts:54-83`。
2. `registerGraph` 按 id 覆盖定义，`resumeRun` 读取同名最新定义；旧中断 run 可能按新稿恢复。导出和模板沉淀也读取当前 spec，而不是 run 当时的 spec。证据：`custom/server/loop/graph/graph-service.ts:72-75,88-149`、`custom/server/loop/graph/graph-rest.ts:354-377,396-446`。
3. 未配置真桥时，`agent-task` 族隐式使用即建即完的 DryRun；`archived` 也被当成成功。证据：`custom/server/graph/node-executors/index.ts:58-85,258-267`、`custom/server/loop/graph/graph-assembly.ts:293-325`。

LoopForge 源码对照提供的有效启示是“真实执行、冻结运行定义、失败可追踪”，不是宣传中的绝对化“每节点独立沙箱”或“自动自进化”。其 Run Eval 实际需要人工触发，建议由人选择后应用；其 Run 内节点共享工作区；Agent 进程仍可接触被授权的 Git 凭据。

### 1.2 本批价值与完成判据

本批让读者能够判断：**一个显示成功的 SOP 节点，是否真的有执行事实支撑；一个等待中的旧 run，是否会因编辑新稿而改变含义。**

完成时必须同时满足：

- gate 只有在 OS 沙箱真实执行且 `status=ok + exitCode=0` 时才成功；其他情况全部失败并保留有界证据。
- 无真实执行能力的 `agent`、`subgraph` 和未显式 shadow 的 `agent-task` 族，在任何节点副作用发生前拒绝起跑。
- 每个经 `CustomSpecRuntime` 起跑的新 run 都持久化完整 GraphSpec 快照；resume、重启重建、fork、export、deposit-template 使用该快照。
- 旧 run 和未经 `CustomSpecRuntime` 的 runtime-defined run 没有快照时明确标为 `legacy-unpinned`，保持兼容但不伪造版本；新 pinned run 缺快照时拒绝恢复。
- 目标测试、图执行全链路、真实 OS 沙箱冒烟、全量 `npm test` 和 `npm run typecheck:harness` 全部通过；浏览器实物走查确认界面不再暗示占位 Agent 已执行。

### 1.3 非目标

- 不开放真实通用 `agent` 派发；后续复用 Kanban dispatcher，另立 spec。
- 不实现生产 `subgraph`；嵌套恢复、取消传播和版本闭包另立 spec。
- 不上完整 draft/publish/rollback API；本批只做 `CustomSpecRuntime` 每 run 不可变快照，发布生命周期另立 spec。
- 不冻结 `RunSpawner`、`ShadowRunner` 和其他直接 `GraphService.startRun` 调用方的闭包型 GraphDef；它们本批显式保持 `legacy-unpinned/runtime-defined`，LoopInstance、registry 与执行依赖冻结另立 spec。
- 不做 SOP 健康分、改进处方、跨机休眠、任务级短期凭证、MCP server 或租户隔离。
- 不新建 worker、scheduler、事件日志、执行内核或通用提案系统。
- 不改旧 `phase-nodes` gate，不改 vendor 基线，不升级依赖。

## 2. 方案比较（Approaches）

| 方案 | 内容 | 代价与判断 |
|---|---|---|
| A. 可信执行地板（本稿推荐） | 真实 gate、不可执行节点 fail-closed、每 run 快照 | 触及共享图执行面，但先消灭假通过；不引入 Agent 和子图生命周期，范围可控 |
| B. 复盘处方闭环 | 健康向量接入既有 Harness² 提案草稿 | 成本中等，但若 gate 与 Agent 可假成功，复盘会放大错误数据，不能先做 |
| C. 工作区休眠恢复 | 图状态、未提交改动和元数据统一跨机快照 | 外部环境、安全和恢复验证成本最高，且依赖本批的 run 定义冻结 |
| 一次性完整对齐 LoopForge | 同时实现 Agent、子图、发布、健康分和休眠 | 多生命周期耦合，无法给出可归因验证，不采用 |

## 3. 变更

### 3.1 ADDED Requirements

#### Requirement: 真实 sandbox gate

编辑器 `type:'gate'` SHALL 通过服务端受信命令目录和现有 `runSandboxed` 执行；只有 `status='ok'` 且 `exitCode===0` 才能通过。缺命令、非目录命令、沙箱不可用、spawn error、timeout、信号退出和非零退出 MUST NOT 产生成功状态。

#### Scenario: 非零退出

- **WHEN** 受信命令真实执行并返回非零退出码
- **THEN** gate 节点失败，后续节点不执行，事件证据包含退出码与有界输出

#### Scenario: 沙箱不可用

- **WHEN** OS 沙箱不存在、被禁用或探测失败
- **THEN** 起跑或节点执行 fail-closed，不降级到宿主机裸跑

#### Requirement: 不可执行节点预检

通用 `agent`、`subgraph` 以及没有真实 KanbanBridge 的 `agent-task` 族 SHALL 在起跑预检中返回明确能力错误，任何 function/gate 节点 MUST NOT 在此之前产生副作用。DryRun 只能由测试或显式 shadow 调用方注入。

#### Scenario: 无真桥 Agent

- **WHEN** spec 含通用 Agent 或未配置真桥的 Agent 任务节点
- **THEN** 起跑返回 422 和稳定错误码 `agent_execution_unavailable`，不写 `agentRequest` 假成功

#### Requirement: CustomSpecRuntime 每 run GraphSpec 快照

每个经 `CustomSpecRuntime` 起跑的新 run SHALL 在执行前保存完整 GraphSpec、`contentHash`、`runtimeKind` 和来源元数据；快照落库失败时不得执行节点。resume、进程重启重建、fork、export 和 deposit-template SHALL 使用 run 绑定定义，而不是同名最新草稿。其他直接 `GraphService.startRun` 入口本批不宣称 pinned，必须显式标识为 `legacy-unpinned/runtime-defined`。

#### Scenario: 编辑新稿后恢复旧 run

- **WHEN** run 使用草稿 v1 中断，随后同 id 草稿改为 v2 并启动另一个 run
- **THEN** 恢复第一个 run 仍执行 v1，第二个 run 执行 v2，二者事件和导出各自引用自己的 `contentHash`

### 3.2 MODIFIED Requirements

- `POST /api/graph/specs/:id/runs` 保留草稿试跑语义，但增加执行能力预检和快照元数据；不再允许占位 Agent 或空 gate 成功。
- `POST /api/graph/runs/:id/resume` 对 pinned run 只读快照；快照缺失返回 409，不回退最新稿。旧 run 保持 legacy 兼容并显式标识。
- `GET /api/graph/runs/:id/export` 对 pinned run 改读 run 快照；legacy run 如仍读当前草稿，响应必须标 `specSource='legacy-current-draft'`，不得描述为原始定义。
- `POST /api/graph/runs/:id/deposit-template` 只接受 pinned run；legacy run 返回 409 + `run_spec_snapshot_missing`，防止把可能漂移的当前草稿固化成可信模板。
- `DONE_STATUSES` 不再把 `archived` 单独视为 Agent 成功；只有 `done` 可进入现有完成路径，后续 Agent 批再补 worker completed-run 证明。

### 3.3 变更面

全部属于 A 类 `custom/` 改动，不修改 vendor 文件，不新增补丁：

- `custom/server/loop/graph/gate-executor.ts`：新增薄适配器。
- `custom/server/loop/graph/spec-runtime.ts`：真实 gate、能力预检、快照输入。
- `custom/server/loop/graph/graph-assembly.ts`：受信命令目录、真桥/shadow 边界、快照 loader 装配。
- `custom/server/graph/node-executors/index.ts`：取消隐式 DryRun 和 `archived` 成功。
- `custom/server/loop/graph/{types,graph-runtime,graph-service,event-log-store,graph-rest}.ts`：快照、证据和恢复链。
- `custom/server/sandbox/exec-sandbox.ts`：仅在有守门测试时补输出截断标记等兼容字段，不改变既有通过语义。
- `custom/client/loop/orchestrator/components/NodeConfigPanel.vue` 与既有 i18n：明确本批 Agent 不可执行、gate 为真实白名单执行。
- 上述对应 `__tests__`、图执行端到端测试和 `docs/DESIGN.md`。

建议用 Dynamic Workflow 按“gate / snapshot / UI 与集成验证”三个文件归属不相交的工作包并行；共享类型与装配文件由主会话统一收口。

## 4. 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 | 依据 |
|---|---|---|---|---|---|---|
| 首批方向 | A：可信执行地板 | B 健康处方；C 休眠；完整对齐 | 假通过会污染所有后续指标和自动改进 | UserChallenge | **approved（2026-11-16「批准A」）** | 本稿 §2，来源问题 Q1=首批范围 |
| 首批边界 | 真实 gate + fail-closed + run snapshot | 同批实现 Agent/subgraph/publish | 避免同时引入四套生命周期；先建立可信地板 | Taste | approved（随 A 设计批准） | 架构调研 §5 |
| Agent 内核 | 后续复用 Kanban dispatcher；本批不开放 | 新建 worker；复用消息工作流；直接 spawn | 看板与现有 dispatcher 才持有真实执行事实； queued/投递不等于完成 | Mechanical | 待实施 | `custom/server/graph/node-executors/index.ts:1-8` |
| gate 执行器 | 复用 `runSandboxed` | 复用 `phase-nodes.defaultGateExec`；裸 `spawn` | 前者已有禁网、环境净化、写入白名单和 fail-closed；后者没有统一边界 | Mechanical | 待实施 | `custom/server/sandbox/exec-sandbox.ts:69-143` |
| 版本粒度 | 每 run 完整快照 | 只存 version 数字；只存当前 published 指针 | 数字无法 hydrate，指针会随新稿漂移；草稿试跑也必须可恢复 | Mechanical | 待实施 | `graph-service.ts:72-75,141-149` |
| 旧 run 兼容 | `legacy-unpinned` 保留恢复行为；export 明示当前草稿来源；deposit 拒绝 | 自动补 revision 1；全部拒绝；全部继续旧行为 | 历史内容无证据时不编造；兼容等待审批，但不把漂移稿固化为新模板 | Taste | approved（随 A 设计批准） | 项目 fail-soft 不造假原则；builder check Q3 |
| 快照入口 | 仅 `CustomSpecRuntime`；其他入口标 runtime-defined | 同批冻结 RunSpawner/ShadowRunner 闭包 | 闭包、registry 和执行依赖不是 GraphSpec JSON 可表达的，不能假装已冻结 | Taste | approved（随 A 设计批准） | builder check Q1 |
| Director 恢复 | 快照记录 runtimeKind；resume/fork-start 重新提供 JWT | 快照保存 JWT；匿名恢复；换用 editor registry | 不持久化秘密，也不混用执行器；权限按恢复时重新求值 | Mechanical | 待实施 | builder check Q2 |
| 依赖 | 无变更 | 引入新沙箱或 DAG 库 | 现有单元足够 | Mechanical | 待实施 | §5.5 |

## 5. 详细设计

### 5.1 起跑能力预检

`CustomSpecRuntime.startRun` 顺序固定为：

1. 读取并深拷贝 spec。
2. 执行现有结构校验。
3. 执行新增能力预检：不可执行 Agent/subgraph、gate 目录、gate 重试/失败绕行、DryRun 是否显式授权。
4. hydrate GraphDef。
5. 构造快照元数据并持久化。
6. 注册供新 run 使用的定义，调用 `GraphService.startRun` 并绑定该定义。

任何一步失败都不执行节点。预检错误使用可区分类型，不再只靠 message 字符串猜 HTTP 状态：

- 结构/配置非法：400 或 422；
- spec 不存在：404；
- 执行能力不可用：422 + `agent_execution_unavailable` / `gate_execution_unavailable`；
- 快照持久化失败：500/503，且不执行节点；
- pinned 快照恢复缺失：409 + `run_spec_snapshot_missing`。

### 5.2 受信 gate 命令目录

`spec.meta` 和节点 config 只能提供目录键 `command`，不能提供 argv、cwd、env 值或 writableRoots，也不能扩大服务端目录。

装配方把现有 `LOOP_GATE_COMMANDS` 升级为目录项：

- `command`：编辑器精确匹配键；
- `argv`：服务端固定参数数组；首批兼容无引号、无 shell 控制符的简单命令，复杂命令拒绝，不做空白猜测解析；
- `cwd`：服务端显式配置的真实目录，未配置则 gate 不可用；禁止取自编辑器；
- `timeoutMs`：服务端上限，Graph 节点超时须留出收尾余量；
- `envAllowlist`：只允许变量名，不记录变量值；
- `writableRoots`：服务端显式声明并 canonicalize 的目录，缺省只读。

现有字符串配置可迁移为受信目录，但缺少真实 cwd 时必须 fail-closed，不再以不确定的进程 cwd 执行。`gate-executor` 强制要求 `HERMES_SANDBOX_WORKSPACES_ROOT` 存在，为 run/node/attempt 建立独立审计与临时工作目录并登记 lease；固定项目 cwd 与该 lease 目录分别 canonicalize，禁止符号链接逃逸。

### 5.3 gate 执行、重试与证据

通过判定只有：

```text
sandboxResult.status === 'ok' && sandboxResult.exitCode === 0
```

其他结果统一失败，但保留 `fail / timeout / unavailable / spawn-error / inconclusive` 的可区分原因。`exitCode:null` 不等于成功。

本批禁止 gate 节点自动重试以及 `onError:goto/retry-goto`，防止副作用命令被盲重放，或失败后仍被路由成完成。显式人工从节点重跑属后续独立验收，不在本批暗开。

节点事件保存白名单证据：

- runId、nodeId、attempt、命令目录键、argv、cwd、backend、leaseId；
- status、exitCode、durationMs、startedAt/finishedAt；
- stdout/stderr 的有界尾部和截断标志；
- 不保存 env 值、JWT、模型密钥或完整命令目录秘密配置。

输出复用 `redactSensitive` 后截断；若 `exec-sandbox` 增加截断字段，只作兼容新增并有独立测试。GraphRuntime 增加可选 evidence/error details 时不得改变既有状态机和 reducer 语义。

### 5.4 Agent、DryRun 与 archived

- 通用 `agent` 删除“写 `agentRequest` 后成功”的实现，未注入真实 executor 时抛稳定能力错误。
- `subgraph` 保持未注册或缺 runner 即失败；本批不制造替代成功路径。
- `registerSimulationNodeTypes` 不得隐式 new DryRun。测试/shadow 必须显式传 `DryRunKanbanBridge` 和 shadow 标志；生产 director 无 token 时不再把 DryRun 结果当真实完成。
- `DONE_STATUSES` 移除 `archived`。本批不宣称已完成通用 Agent 接线，也不把 queued、消息投递成功或 archived 当完成证明。

### 5.5 快照数据与依赖方向

新增 `graph_run_specs`：

| 字段 | 含义 |
|---|---|
| `run_id` | 主键 |
| `spec_id` | 图 id |
| `revision` | 本批恒 null；发布批保留扩展位 |
| `draft_version` | 当前 GraphSpec.version，不冒充发布 revision |
| `spec_json` | 完整深拷贝 GraphSpec |
| `runtime_kind` | `editor` 或 `director`；用于重启后选择对应 registry/factory，不是凭据 |
| `content_hash` | `canonicalize(spec)` 的 SHA-256 |
| `created_at` / `created_by` | 起跑时间与当前操作者；无身份时按现有本机操作者规则处理 |

复用 `custom/server/eval/fingerprint.ts` 的 `canonicalize`，新建 graph 侧 SHA-256 封装，不改变 Eval 既有 SHA-1 指纹。

`RunRecord` 持有本 run 的 GraphDef 和 snapshot 元数据。`GraphService` 不 import REST 层；通过 `GraphServiceOptions.loadRunDefinition(runId, context)` 注入快照读取和 hydrate，`context` 至少包含当前 actor、`runtimeKind` 和按需重新提供的 JWT，但 JWT 只活在本次调用上下文，不写快照、事件或 checkpoint。

行为固定为：

- start：快照先落库，再执行；RunRecord 捕获 def 和 runtimeKind。
- resume：优先 RunRecord def；重启后由 loader 按 runtimeKind 恢复；pinned 快照缺失 fail-closed。
- Director resume/fork-start：调用方必须重新提供有效 JWT，loader 使用 `directorRuntimeFactory` 创建对应 registry/bridge；无 JWT 返回 `actor_credentials_required`，不得匿名恢复、保存旧 JWT 或改用 editor registry。
- Editor resume：使用 editor 对应 registry，并重新检查当前命令目录和真实桥能力。
- rebuild：只重建状态不重新执行节点；pinned/legacy 两态分别处理。runtime-defined 入口保持 legacy，不尝试把闭包序列化成 GraphSpec。
- fork：pinned 父 run 复制快照和 def，fork 事件写相同 hash；legacy 父 run 可保持旧回退，但子 run 仍标 `legacy-unpinned`，不得升级成 pinned。
- export：pinned 读快照；legacy 若取当前草稿，响应同时返回 `specSnapshot:null` 和 `specSource:'legacy-current-draft'`。
- deposit-template：只接受 pinned run；legacy 返回 409，不用当前草稿代替历史定义。

快照只冻结 SOP 内容，不冻结权限。resume 仍重新检查当前 actor、命令目录和沙箱能力；被撤销授权不能借旧快照复活。JWT、密钥和运行环境值不得进入快照。

### 5.6 复用约束

| 既有单元 | 复用方式 |
|---|---|
| `custom/server/sandbox/exec-sandbox.ts` | 直接调用 `runSandboxed`，不另写进程执行器 |
| `custom/server/sandbox/sandbox-lease.ts` | 复用 lease 和清扫，不新增工作区账本 |
| `custom/server/eval/fingerprint.ts` | 复用 `canonicalize` |
| `custom/server/toolcontract/contract.ts` | 复用 `redactSensitive` |
| `GraphService/GraphRuntime/EventLogStore` | 扩展同一执行与持久化链，不新建 DAG 或事件库 |
| `KanbanBridge` | 本批只修边界；真实 Agent 后续复用，不复制派发循环 |
| `NodeConfigPanel.vue` 与既有 i18n | 原位修正文案，不新增页面 |

新增胶水仅限 gate 适配、快照存取和预检。没有新治理门、hook、脚本或机制账本，因此不新增 `config/mechanism-budget.json` 条目。

### 5.7 安全约束

- 命令注入：编辑器只选目录键；argv/cwd/env/writableRoots 由服务端持有，spec.meta 不能扩权。
- 路径穿越与 symlink：所有根目录 realpath 后做根内判定；lease 清扫继续使用现有非 symlink 限制。
- 权限：起跑、resume、export、deposit-template 保持既有认证，并补人责身份；快照不恢复已撤销权限。
- 副作用：禁网、缺省只读、固定超时；本批禁止 gate 自动重试和失败绕行。
- 日志：不记秘密 env；输出脱敏、有界；事件证据不包含 JWT。
- 多租户：本批不扩大声明，sandbox 仍以服务进程身份运行，只允许管理员目录中的固定命令。
- 依赖：无升级、无新增第三方依赖。

## 6. 接口与兼容

| 方法 | 路径 | 变化 | 错误与幂等 |
|---|---|---|---|
| POST | `/api/graph/specs/:id/runs` | 增加预检；响应增加 `specSnapshot:{revision:null,draftVersion,runtimeKind,contentHash}` | 同一调用只创建一个 run；快照失败不执行 |
| POST | `/api/graph/runs/:id/resume` | pinned run 使用快照；Director 重新提供 JWT | 缺快照 409；缺 Director 凭据 401/403；interrupt 规则不变 |
| GET | `/api/graph/runs/:id` | 增加可选 snapshot 元数据；旧 run 为 `legacy-unpinned` | 只读 |
| GET | `/api/graph/runs/:id/export` | pinned spec 改读 run 快照；legacy 明示 `legacy-current-draft` | 保留事件 limit/truncated 语义 |
| POST | `/api/graph/runs/:id/deposit-template` | 只接受 pinned run | legacy 409；仍只允许 completed run；台账失败如实返回 |

旧 `graph_specs` 表和 draft upsert 不变；新增表为 additive，不 DROP、不改旧事件。旧库无新表时自动建表；旧事件无快照不自动伪造发布版本。

## 7. 验证

### 7.1 先写失败测试，再实现

| 面 | 必写用例 |
|---|---|
| gate | 缺 command；非目录命令不 spawn；spec.meta 不能扩权；只有 ok+0 通过；非零/null/timeout/error/unavailable 全失败；输出有界；retry/onError 绕行拒绝 |
| 预检 | Agent/subgraph/无真桥 agent-task 在任一 function/gate 副作用前失败；显式 shadow 才可 DryRun；archived 不成功 |
| 快照 | v1 中断后启动 v2，resume v1 仍执行 v1；SQLite 重启 hydrate；draft 修改不影响 awaiting-input；fork 继承；pinned 缺失拒绝；legacy 兼容；runtime-defined 不冒充 pinned |
| Director 上下文 | 重启后无 JWT 拒绝；新 JWT 只用于本次恢复且不进入快照/事件；editor 与 director registry 不串用；fork-start 同样重新求权 |
| 存储 | InMemory/SQLite 往返、深副本、旧库打开、删除 draft 不删 run snapshot |
| REST | 每个修改端点的正常、401/403、400/422、404、409、依赖失败；pinned export/deposit 不读新稿；legacy export 明示来源、legacy deposit 拒绝 |
| 回归 | 现有 HITL、join、retry、replay、sim director、显式 shadow 和 checkpoint 测试 |

### 7.2 命令与通过口径

1. `npx vitest run custom/server/loop/graph custom/server/graph custom/server/sandbox custom/client/loop`。
2. `npm run typecheck:harness`。
3. 在 macOS 真实 `sandbox-exec` 跑一个零退出和一个非零退出 gate；检查事件证据和后续节点未执行。Linux 无 bwrap 时只能验证 unavailable，不能宣称 Linux 真执行已验收。
4. `npm test` 全量；pre-existing 红与本批新增红分开记录，本批新增必须清零。
5. 启动后端与前端，浏览器走查：Agent 不可执行提示、非法 gate 起跑失败、成功/失败 gate 的证据、v1/v2 恢复与导出。截图只作运行证据，不替代测试。

完成判据不是“测试全绿”一句：必须零新缺陷完成上述目标、集成、真实沙箱、负面、回归和 UI 全轮验证。未执行的平台或外部能力明确写“未验证”。

### 7.3 变异探针

至少手工或自动注入三种变异验证守门有效性：

- 把 `exitCode===0` 改成恒 true，非零退出测试必须失败。
- 把 resume 改回 `this.graphs.get(graphId)`，v1/v2 测试必须失败。
- 恢复隐式 DryRun，能力预检测试必须失败。

## 8. 风险、回滚与运维

| 风险 | 缓解与回滚 |
|---|---|
| 既有依赖隐式 DryRun 的 shadow 流程被破坏 | 全部改为显式 shadow；运行 sim 回归；回滚只恢复显式兼容，不恢复生产假成功 |
| gate 配置缺少 cwd 导致旧 spec 不可跑 | 起跑前返回明确配置错误和迁移说明；不静默使用进程 cwd |
| 新表迁移或快照写失败阻断起跑 | additive migration、事务先存后跑；git revert 后旧代码忽略新表，已有新 run 不降级成 legacy |
| stdout 含敏感信息 | 复用脱敏、有界尾部、无 env 值；发现泄露立即停止该目录命令并清除已落证据 |
| GraphRuntime 公共行为回归 | 类型只加可选字段；跑图全域与全量测试；不在本批重构 BSP |

运维日志使用既有 graph 事件，不新增指标平台。重点观察 `gate.execution` 的 status/exitCode/duration/backend、`run_spec_snapshot_missing` 和 `agent_execution_unavailable`。告警处置：先停止相关目录命令，再检查沙箱、目录和快照，不允许以关闭校验作为恢复手段。

## 9. 任务卡与批准前六问

### 9.1 任务卡七项

1. **业务完成条件**：§1.2 五项全部有机检和实物证据。
2. **输入与来源**：GraphSpec 来自现有 specStore；命令目录、身份和沙箱能力来自服务端，不接受 spec 扩权。
3. **工作流边界**：预检和快照是硬依赖；legacy 只兼容旧 run；任何人工审批仍走现有 interrupt。
4. **工具与副作用**：固定目录命令、禁网、限时、写入白名单；本批无自动重试。
5. **结果与证据**：退出码、状态、耗时、hash、run/node/attempt 和有界输出可回查。
6. **异常与恢复**：无权限、超时、快照缺失、沙箱缺席均 fail-closed；旧 run 明确 legacy。
7. **验收反例**：空 gate 通过、DryRun 冒充完成、archived 成功、v1 按 v2 恢复、导出最新稿，全部必须判失败。

### 9.2 批准前六问

1. **决策**：维护者决定能否信任 SOP 的执行与恢复结果；给运行、审查和验收人员看。
2. **口径**：执行结果只认 sandbox status/exitCode；版本只认 run snapshot/hash，不认自述。
3. **可逆性**：代码 git revert；新表 additive，旧代码可忽略；不删除已有事件。
4. **署名**：起跑/恢复操作者沿用现有认证身份，发布责任人为本批合入审查人。
5. **停止条件**：出现秘密落日志、任意编辑器命令可执行、旧 run 被改义、无法区分 DryRun 与真实执行，立即停批回退。
6. **语法**：收紧执行权限与完成判据；不改预算、考核或数据权属。

## 10. 设计文档影响

- DESIGN_SYNC: none（Task 1 仅新增 additive 内部快照存储与内容指纹，尚未接入图执行链；全批设计同步由 Task 7 声明并同批修订，不在本任务扩大提交范围）
  - 后续 Task 7 修订 `docs/DESIGN.md` 的图执行能力行：真实 sandbox gate、不可执行节点 fail-closed、每 run GraphSpec 快照与 legacy 兼容边界；明确本批未开放通用 Agent/subgraph/publish。
  - 数字总账不触及：无新增补丁、治理门、依赖或机制预算条目；spec 索引由既有生成器随实现批更新。

## 11. 实现者可以自行决定的事项

- 错误类、快照类型和辅助函数的具体命名与文件内组织，但不得改变本稿状态语义。
- InMemory/SQLite 的共享实现抽取方式，以及测试 fixture 的具体构造。
- 输出尾部截断长度和事件字段命名，但必须有上限、脱敏和截断标志。
- 为减少改动而作的不改变行为的局部重构；不得顺带改旧 gate、workflow manager 或 Kanban 状态机。

## 12. 设计审查处置

独立 builder check 提出三项问题，均已在稿内关闭，无需额外扩大用户问题：

1. **快照入口过宽**：收窄为 `CustomSpecRuntime`；闭包型 RunSpawner/ShadowRunner 明确不在本批 pinned 范围。这是设计者的范围取舍，理由是 JSON spec 无法冻结闭包和执行依赖。
2. **Director 凭据与执行器恢复**：快照增加 `runtimeKind`；resume/fork-start 重新提供 JWT并选择对应 factory。JWT 不落持久层，缺凭据即拒绝。
3. **legacy 导出与模板语义**：legacy resume/fork 保留显式回退；export 明示当前草稿来源；deposit-template 拒绝无快照 run，避免制造来源不明的新模板。

## 13. 参考资料

- `custom/server/loop/graph/spec-runtime.ts:54-83,332-355`
- `custom/server/loop/graph/graph-service.ts:72-75,82-151,270-337`
- `custom/server/sandbox/exec-sandbox.ts:19-40,69-143`
- `custom/server/graph/node-executors/index.ts:58-85,220-306`
- LoopForge：`internal/engine/run_environment.go:17-34`、`internal/engine/run_start.go:57-163`、`internal/runeval/facts.go:22-116`、`internal/httpapi/run_eval.go:80-142,225-404`
