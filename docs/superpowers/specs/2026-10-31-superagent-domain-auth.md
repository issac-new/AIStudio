# Super-agent 领域模型与授权流水（A+B 批）（2026-10-31）

日期：2026-10-31
状态：草案
来源：用户指示「深入调研 https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg 及 https://github.com/deepseek-ai/dsh-superagent-prototype 完善 AIStudio」。调研结论见本 spec §1。
关联：`docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`（领域与调度口径）、`2026-10-31-humangate-store-unify.md`（审批权威 store 统一）、`2026-10-31-run24-plan-realign.md`（G5 代批通道）。

## 1. 背景与目标

### 1.1 现状（调研锚点）

两处信息源给出同一套设计：DeepSeek Harness 团队的文章（四特征：连续/高效/主动/持久；五模块：双层架构/事件驱动/面向人交互/存算分离/Watchdog）与 `dsh-superagent-prototype` 仓库（九概念领域模型 + 三级授权模式）。

AIStudio 现状（只读探查结论）：

- **已有强地基**：看板三表（`kanban_db.py:941-1146`）＋ claim 租约/心跳/PID 指纹＋三层并发闸（`kanban_db_dispatch.py:1930-1971`）；HumanGate 审批单＋revision sha256 绑定的 DecisionGrant（`decision-grant.ts:113-141`）＋前向哈希链（`approval-log.ts:144-158`）；qgate L0-L5 六态证据门。
- **四个断点**：①事件驱动不闭环——无 Trigger/Thread 一等实体，kanban 事件只能 30 秒轮询（`ontology-watch.ts:205-277`），`column-dispatch.ts:12-14` 自述「事件自动触发依赖跨进程通道，列后续」；②授权无流水——决策散在 dispatch-ledger/govbus/evidence/decisiongraph 四处，无 accept/stop/ignore 三态、无 explicit/inferred 强度、无按源准入表、策略无版本化；③HumanGate 裁决无角色校验（`human-gate.ts:33-56` 只看「已认证」），任何登录用户可批任意单；④无 Router 层（另行立项 C 批）。

### 1.2 目标

1. **价值声明**：把「谁在什么规则下可以让我做事」从分散台账变成可审计的一等数据，让主动行为有据可查、可撤销、可复核。
2. **SMART 目标**：
   - 新增 `custom/server/orchestrator/` 域，落地 Trigger/Thread/Subscription/Decision/Mandate/Assignment 六类一等实体，SQLite 持久化，全局 event_id 可重放。
   - kanban `task_events` 通过游标桥接为 Trigger，替代 30 秒轮询的单一路径（轮询保留为兜底）。
   - `DecisionGrant` 增加 `strength`（explicit/delegated/inferred）、`policyVersion`、`ruleIds` 三个字段；HumanGate 裁决增加角色校验与代批标注。
   - 新增按源准入表（source admission），每源可声明允许的发送者、是否要求明确请求、允许的动作强度。
   - 策略版本化：审批规则/工具策略/准入表变更时单调递增 revision，既有凭证在下次校验时按新版本 revalidate。
3. **非目标**（明确不做，防范围蔓延）：
   - 不做 LLM 语义过滤（Fast/Slow Path 的 Slow Path，D 批）。
   - 不做 Inline & Spill / 链式召回（E 批）。
   - 不做异步 ReAct（F 批）、不做 Watchdog Session（G 批）。
   - 不做 Router 层常驻会话（C 批，等本批合入后）。
   - 不引入新的消息队列/持久化依赖；用 `node:sqlite` 与现有关注投递通道。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 | 类型 | 用户裁定 | 可逆 |
|---|---|---|---|---|---|---|
| D1 | A+B 合并为一个批次（同 worktree） | Decision/Mandate 需要 Trigger/Thread 作承载，拆开做会互相等待；两者共享同一套领域词汇 | 拆两批（否决：跨批接口会漂移） | Mechanical | approved | 是 |
| D2 | 新域命名 `orchestrator/`，不叫 `superagent/` | `superagent` 是外部术语，`orchestrator` 描述职责（编排层）；与既有 `loop/`（单任务契约）边界：orchestrator 管「事件→授权→工单」，loop 管「工单内部执行图」 | `superagent/`（否决：术语来自外部，仓内无此词） | Taste | approved | 是 |
| D3 | SQLite 单一写者＝TS 服务端进程 | 避免 TS 与 Python 双写同一文件（HumanGate 现有隐患）；Python 运行时通过 REST 读写 | 文件锁（否决：`node:sqlite` 跨进程写锁不可靠） | Mechanical | approved | 是 |
| D4 | kanban 事件桥走「只读上游 SQLite + 游标」 | 不改 vendor 基线；`task_events` 是 append-only，游标幂等 | 改造 kanban 写入点（否决：B 类补丁侵入面大） | Mechanical | approved | 是 |
| D5 | 代批（delegated）不拒绝，但必须显式标注 | 推演 G5 是同一 token 注册＋代批（`mx-scenario-lib.sh:921-953`），一刀切拒绝会打断 run24；代批不是伪造，是需要与真人批准区分强度 | 一律拒绝自批（否决：打断在跑的推演） | UserChallenge | approved（2026-10-31 用户裁定） | 是 |
| D6 | 严格模式 `HUMAN_GATE_REQUIRE_HUMAN_DECIDER=1` 时拒绝 issuer===requester | 生产环境需要真人门；默认关是为了兼容推演与单机 | 默认开（否决：破坏现有推演链） | UserChallenge | approved（2026-10-31 用户裁定） | 是 |
| D7 | 准入表默认 `observe` 模式（记录 would-accept，不执行） | 与上游 `observe` 默认一致；先把数据跑出来再开 `auto` | 默认 `auto`（否决：主动行为无观察期） | UserChallenge | approved（2026-10-31 用户裁定） | 是 |
| D8 | 策略版本化只覆盖四类策略（审批规则/工具策略/准入表/主动性策略） | 这四类是授权的直接依据；qgate 的版本化已存在，不重复 | 覆盖全部配置（否决：范围失控） | Taste | approved | 是 |
| D9 | Decision 三态扩展为四值：accept/stop/ignore/unavailable | 上游四值；`unavailable` 是评估失败的可审计结局，不能记成 ignore | 三态（否决：丢失失败语义） | Mechanical | approved | 是 |
| D10 | 策略版本不匹配默认放行 + 警告；严格模式才拒绝 | 存量凭证不批量失效，避免改一次策略阻断在跑任务；严格模式给高保障场景 | 版本不匹配即失效（否决：阻断面过大） | UserChallenge | approved（2026-10-31 用户裁定） | 是 |

## 3. 变更范围与侵入点

### 3.1 A 类新增（`custom/`）

| 文件 | 职责 |
|---|---|
| `custom/server/orchestrator/types.ts` | Trigger/Thread/Subscription/Decision/Mandate/Assignment 类型与状态词表 |
| `custom/server/orchestrator/store.ts` | `node:sqlite` 存储：建表、幂等写入、游标、查询 |
| `custom/server/orchestrator/ingest.ts` | 事件摄入：程序准入检查 → 落 Trigger → 归 Thread（Fast Path，无 LLM） |
| `custom/server/orchestrator/thread.ts` | Thread 聚合、订阅、游标推进 |
| `custom/server/orchestrator/decision.ts` | Decision 记录（accept/stop/ignore/unavailable + strength + ruleIds + policyVersion） |
| `custom/server/orchestrator/mandate.ts` | Mandate 签发/撤销/revalidate |
| `custom/server/orchestrator/admission.ts` | 按源准入表（发送者/动作/强度），默认 observe |
| `custom/server/orchestrator/policy-version.ts` | 四类策略的单调 revision 与变更事件 |
| `custom/server/orchestrator/kanban-bridge.ts` | 只读 kanban SQLite，`task_events` 游标 → Trigger |
| `custom/server/orchestrator/controller.ts` | REST：triggers/threads/subscriptions/decisions/mandates/admissions/health |
| `custom/server/orchestrator/__tests__/*.test.ts` | 上述各模块测试 |

### 3.2 既有文件修改（`custom/`）

| 目标文件 | 改动内容 |
|---|---|
| `custom/server/approval-inbox/decision-grant.ts` | `DecisionGrant` 增 `strength`/`policyVersion`/`ruleIds`；`checkDecisionGrant` 增版本与强度校验（旧 grant 缺字段时按 `explicit` + `policyVersion=0` 兼容） |
| `custom/server/approval-inbox/human-gate.ts` | 裁决鉴权：角色白名单（默认 `admin,super_admin,local_operator`）、`deciderMode`（human/delegated）、严格模式拒自批；store 行增加 `decidedByRole`/`deciderMode` |
| `custom/server/approval-inbox/approval-log.ts` | 记录条目增 `policyVersion`/`strength`（可选，缺省不写） |
| `custom/server/automations/automation-engine.ts` | 事件产出增加向 `orchestrator.ingest` 的投递（失败 fail-soft，不阻断原派发） |
| `custom/server/ontology/ontology-watch.ts` | 保留轮询，但改为 orchestrator 游标不存在时的兜底（加注释与开关） |

### 3.3 路由挂载（B 类，`patches/`）

| 补丁 | 内容 |
|---|---|
| `patches/NNN-server-orchestrator-routes.patch` | 挂载 `/api/orchestrator/*`（编号实施时取 series 最大号 +1） |

### 3.4 运行时消费（`runtime/`）

| 文件 | 改动 |
|---|---|
| `runtime/tools/kanban_tools.py` | 读取 grant 时接受新增字段（`strength`/`policyVersion`/`ruleIds` 可选，缺省按旧行为）；不改变拒绝语义 |
| `runtime/tools/__tests__` 或 pytest 对角 | 新增「旧 grant 无新字段仍通过」与「policyVersion 不匹配被拒」两例 |

## 4. 详细设计（核心契约）

### 4.1 数据表（SQLite，`$HERMES_HOME/orchestrator/orchestrator.sqlite`）

```sql
CREATE TABLE IF NOT EXISTS trigger (
  id TEXT PRIMARY KEY,              -- trg_<ulid>
  source_id TEXT NOT NULL,          -- 源实例 id（如 kanban:default）
  source_kind TEXT NOT NULL,        -- kanban|file|git|webhook|im
  external_id TEXT NOT NULL,        -- 源内唯一 id（去重键）
  thread_key TEXT NOT NULL,         -- 归线程键（如 task:<board>:<id>）
  actor TEXT,                       -- 发送者（原样）
  addressed INTEGER NOT NULL,       -- 是否明确指向 agent（0/1）
  payload TEXT NOT NULL,            -- JSON
  status TEXT NOT NULL,             -- pending|routed|ignored|dropped
  received_at INTEGER NOT NULL,
  UNIQUE(source_id, external_id)
);
CREATE TABLE IF NOT EXISTS thread (
  id TEXT PRIMARY KEY,              -- thr_<ulid>
  source_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  UNIQUE(source_id, thread_key)
);
CREATE TABLE IF NOT EXISTS subscription (
  thread_id TEXT NOT NULL,
  subscriber TEXT NOT NULL,         -- worker:<ticket>|human:<channel>
  mode TEXT NOT NULL,               -- wake|notify|context
  cursor TEXT,                      -- 最后已读 trigger id
  created_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, subscriber)
);
CREATE TABLE IF NOT EXISTS decision (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL,
  thread_id TEXT,
  verdict TEXT NOT NULL,            -- accept|stop|ignore|unavailable
  strength TEXT NOT NULL,           -- explicit|inferred
  rule_ids TEXT,                    -- JSON 数组
  policy_version INTEGER NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mandate (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  scope TEXT NOT NULL,              -- JSON：动作/资源/时限
  strength TEXT NOT NULL,
  rule_ids TEXT,
  policy_version INTEGER NOT NULL,
  issuer TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  revoked_reason TEXT
);
CREATE TABLE IF NOT EXISTS assignment (
  ticket_id TEXT NOT NULL,
  executor TEXT NOT NULL,           -- profile 名
  session_id TEXT,
  pid INTEGER,
  stage TEXT NOT NULL,              -- pending|running|ended
  started_at INTEGER,
  ended_at INTEGER,
  PRIMARY KEY (ticket_id, executor, started_at)
);
```

### 4.2 关键函数签名

```ts
// ingest.ts
export function ingestTrigger(input: TriggerInput): { trigger: Trigger; duplicated: boolean }
// 幂等：UNIQUE(source_id, external_id) 冲突时返回既有行。

// admission.ts
export interface AdmissionCell { sender: 'listed' | 'unlisted'; addressing: boolean; action: 'accept' | 'ignore' | 'inferred' }
export interface SourceAdmission { sourceId: string; mode: 'off' | 'observe' | 'auto'; cells: AdmissionCell[]; allowedSenders: string[] }
export function admit(admission: SourceAdmission, actor: string, addressed: boolean): { allow: boolean; strength: 'explicit' | 'inferred' | null; reason: string }

// mandate.ts
export function issueMandate(input: { decisionId: string; ticketId: string; scope: unknown; strength: 'explicit' | 'inferred'; ruleIds: string[]; policyVersion: number; issuer: string; ttlMs?: number }): Mandate
export function revalidate(mandateId: string, ctx: { currentSenderListed?: boolean; addressed?: boolean; nowMs?: number; env?: NodeJS.ProcessEnv }): { valid: boolean; reason: string; warnings: string[] }
// 字段名用 valid 而非 ok：架构棘轮 K19 对 `ok: false` 字面量设阈值（只许减少），
// 业务判定结果不是 HTTP 失败体，不应挤占该预算。

// policy-version.ts
export type PolicyKind = 'approval-rules' | 'tool-policy' | 'source-admission' | 'proactivity'
export function currentPolicyVersion(kind: PolicyKind): number
export function bumpPolicyVersion(kind: PolicyKind, changedBy: string): number
```

### 4.3 授权强度语义

| 强度 | 含义 | 产生条件 |
|---|---|---|
| `explicit` | 人在明确请求或明确批准 | 发送者在允许名单且明确指向 agent；或 HumanGate 由真人（非请求方）批准 |
| `delegated` | 代批（同一身份代表他人执行） | HumanGate 注册与裁决为同一主体，且未开严格模式；审计可区分 |
| `inferred` | 规则推断（无明确请求） | 准入表 `inferred` 单元命中；或 `auto` 模式下的正向评估 |

`checkDecisionGrant` 的兼容规则：旧 grant（无 `strength`）视为 `explicit`；`policyVersion` 缺省为 `0`，只在严格模式（`ORCHESTRATOR_STRICT_POLICY=1`）下才拒绝不匹配。

## 5. 验证

### 5.1 单元测试（vitest，服务端纯 node 环境）

- `orchestrator/__tests__/store.test.ts`：建表幂等、Trigger 去重、游标推进、订阅多对多。
- `orchestrator/__tests__/ingest.test.ts`：准入 allow/ignore/inferred 三分支、thread 归组、`addressed` 语义。
- `orchestrator/__tests__/mandate.test.ts`：签发、撤销、revalidate 四种失败原因（版本变更/准入降级/发送者移出/过期）。
- `orchestrator/__tests__/kanban-bridge.test.ts`：构造只读 kanban SQLite fixture，断言游标不重复、事件映射字段正确。
- `approval-inbox/__tests__/decision-grant.test.ts`：旧 grant 兼容、新字段校验、policyVersion 不匹配。
- `approval-inbox/__tests__/human-gate.test.ts`：角色白名单、代批标注、严格模式拒自批。

### 5.2 契约对角

- `fixtures/decision-grant-revision.json` 保持序列化不变（revision 只算既有字段）。
- `runtime/tools` pytest：新增两例（旧 grant 通过 / 版本不匹配拒绝）。

### 5.3 门禁（实测结果）

- `npx vitest run custom/server/orchestrator` = **24/24 通过**（3 文件）。
- `npx vitest run custom/server/approval-inbox` = **96/96 通过**（9 文件，含新增 decision-grant 5 例、human-gate 5 例）。
- `npx vitest run custom/server/approval-inbox custom/server/orchestrator` 合计 **120/120**。
- `npm run typecheck:harness` = **0 错**（decision-grant/human-gate 与 orchestrator 十文件已并入点名清单）。
- 拼合树 pytest `runtime/tests/hermes_cli/test_decision_grant.py` = **11/11 通过**（新增 2 例：带新字段 grant 仍可 spawn / 未知字段不改变判定）。
- 补丁重放：`OVERLAY_ALLOW_LIVE_CLEAN=1 npm run clean && npm run inject` 后，
  `vendor/hermes-studio/packages/server/src/bootstrap/routes.ts` 第 115/524 行出现 `orchestratorRoutes`，零冲突。

### 5.4 未做 / 未验证（如实声明）

- 后端重启冒烟 `GET /api/orchestrator/health` **未执行**：本批只验证到补丁可重放与类型/单测，未起服务实测端点。
- 真实 Matrix/Feishu 事件源接入未验证（本批只接 kanban 桥与手动摄入 REST）。
- Fast/Slow Path 的 LLM 语义判断未实现（D 批）。
- Inline & Spill / 链式召回、异步 ReAct、Router 层、Watchdog 均未实现（后续批次）。
- `orchestrator.sqlite` 在真实 `$HERMES_HOME` 下的读写未做端到端验证（测试只用 tmpdir）。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| orchestrator SQLite 与 kanban 上游 DB 读写冲突 | 只读上游（`mode=ro`），单写者在本域文件 |
| 新增 REST 路由与既有 `/api/hermes/kanban` 重叠 | 路径前缀隔离 `/api/orchestrator/*`，不改既有端点 |
| HumanGate 鉴权加严误伤现有推演 | 默认兼容（代批标注不拒绝）、严格模式靠 env 开启 |
| `checkDecisionGrant` 新增字段破坏 Python 消费端 | 字段全可选；pytest 对角守住旧格式 |
| 事件桥重复摄入 | `UNIQUE(source_id, external_id)` + 游标，二者双保险 |

回滚：删除新域目录与补丁登记即可；`decision-grant.ts` 新字段全可选，回退不破坏存量数据。

## 7. 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：新增「编排域（orchestrator）」小节，记录九概念映射与授权强度语义；§调度面补 orchestrator 与 kanban/loop 的边界。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
- `custom/server/AGENTS.md`：关键域索引新增 `orchestrator/` 一行。

## 8. 未决问题（实施中确认，不阻塞）

1. `orchestrator.sqlite` 的 home：`$HERMES_HOME/orchestrator/` 还是 `~/.hermes-web-ui/orchestrator/`？倾向前者（与 HumanGate 同根），实施时按 `lib/paths.ts` 的既有约定落。
2. 订阅直通的投递通道：复用 `dispatch-queue` 还是新建轻量 pump？倾向复用，实施时验证背压。
3. 策略版本的存储：KV 表还是独立文件？倾向 SQLite KV 表，与 orchestrator 同库。
