# AIStudio 九段架构执行校正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户给出的九段架构成为有授权边界、有真实执行链和有机械证据的产品主链。

**Architecture:** 保留既有驾驶舱、Matrix、gateway、kanban、Ycode 和 swarm-yuan 正身，以小型适配层补齐授权投影、任务上下文和审批 grant。先复验 core-chain 未提交成果，再按授权与人工门、gateway、ACP、技能与推演门、文档的顺序增量交付。

**Tech Stack:** TypeScript/Vue 3/Koa/Vitest；Python 3.14/pytest；Shell；Matrix/ACP/JSON-RPC。

**Spec:** `docs/superpowers/specs/2026-10-26-aistudio-architecture-execution-alignment.md`

## Global Constraints

- 工作目录固定为本 worktree；命令显式 `cd /Users/cuishi/lab/AIStudio/.claude/worktrees/core-chain`。
- 不改 `vendor/**` 作为交付源；上游行为走 `patches/` 或 `runtime/`，注入态只用于验证。
- 注释中文、标识符英文；测试先红后绿；子代理不得写同一文件。
- 不覆盖真实 profiles，不启动完整推演，不推送远端；失败和未验证项必须保留在交付说明。
- 既有 core-chain 改动逐批复验，不把 spec 中已有“通过”文字当本轮证据。

## Review Focus

- 空用户、匿名用户与 super_admin 的语义不同：启用鉴权时缺用户不得默认放行。Task 1/2 用显式双账户与匿名负例锁定。
- 空 `profiles`、缺键和坏 board.json 不是同一状态：托管板均须 fail-closed。Task 1 复用 `board_team_keys.py` 并补三态测试。
- 相对路径、符号链接和任务目录未物化不能猜成有效 workspace。Task 4 用路径逃逸与未物化负例锁定。
- 审批后任务正文、提交或工作区变化会使旧批准失效。Task 2/4 用 revision 变化测试锁定。
- 骨架生成、严格验证、激活和 Skill 调用是四个不同事实。Task 5/6 分别断言，禁止一项成功代替其余三项。

---

### Task 1: 授权投影与团队边界

**Files:**
- Create: `custom/server/services/hermes/overview-access.ts`
- Modify: `custom/server/controllers/hermes/fleet.ts`、`custom/server/services/hermes/kanban-overview.ts`、`custom/server/controllers/ia2/identity-chat.ts`、`custom/server/skillprovision/controller.ts`
- Modify: `patches/685-server-workflow-route.patch` 的后续追加挂载 patch（不改历史补丁正文）
- Test: `custom/server/services/hermes/__tests__/overview-access.test.ts`、`custom/server/controllers/ia2/__tests__/identity-chat.test.ts`、`custom/server/skillprovision/__tests__/`

**Interfaces:**
- `projectOverviewForUser(raw, canAccess): KanbanOverviewResult`：`canAccess(profile)` 复用现有 `userCanAccessProfile`；任务按 assignee 过滤，板计数重算。
- `identityChatNativeRoutes(deps?: { canAccessProfile(user, profile): boolean })`：身份清单、历史和聊天共用检查；无鉴权部署保留现有本地语义。

- [ ] 写双账户、共享缓存、空板、缺团队、匿名和 super_admin 负向测试并确认旧实现失败。
- [ ] 运行 `npx vitest run custom/server/services/hermes custom/server/controllers/ia2 custom/server/skillprovision`，记录红灯来自越权而非夹具错误。
- [ ] 实现单一授权投影并接入 REST/WS、身份三条路由和技能写面；profile_scope/profiles 复用 `board_team_keys.py` 的优先级。
- [ ] 复跑上述目标测试与 `custom/server/controllers/hermes` 相邻测试，确认全部通过。
- [ ] 提交 `fix(security): 统一看板与身份聊天的账户授权投影`。

### Task 2: 认证人工门与授权 grant

**Files:**
- Create: `custom/server/approvals/decision-grant.ts`、`custom/server/approvals/__tests__/decision-grant.test.ts`
- Modify: `custom/server/approvals/human-gate.ts`、`custom/server/governance/governance-controller.ts`、`custom/server/loop/graph/graph-rest.ts`、`custom/client/ia2/components/gov/OrgEditor.vue`
- Modify: `runtime/hermes_cli/kanban_db_dispatch.py`、`runtime/tools/kanban_tools.py`
- Test: `custom/server/approvals/__tests__/`、`custom/server/governance/__tests__/org-cosign-guard.test.ts`、`runtime/tests/hermes_cli/`

**Interfaces:**
- `requireAuthenticatedActor(ctx): { id: string; username: string; role: string }`：需要人责证据时拒绝匿名和请求体代报。
- `DecisionGrant = { taskId, board, tier, decision, actor, taskRevision, issuedAt, expiresAt? }`；`grantAllows(grant, task, tier)` 校验任务版本、有效期和批准内容。
- HumanGate 发布批准引用同一 grant；release-state 只投影发布生命周期。

- [ ] 写伪造 approver、同人自签、匿名批准、持久化失败、过期 grant、任务变更后 grant 的负向测试。
- [ ] 运行目标测试，确认旧实现接受伪造身份或缺少执行门。
- [ ] 实现认证 actor、原子持久化、grant 校验和 dispatcher/关键副作用检查；OrgEditor 移除手填会签人。
- [ ] 复跑 approvals/governance/graph/runtime 目标测试和 OrgEditor 组件测试。
- [ ] 提交 `fix(governance): 关键决策绑定认证人与任务版本`。

### Task 3: gateway 统一执行入口

**Files:**
- Create: `custom/server/gateway/profile-client.ts`、`custom/server/gateway/__tests__/profile-client.test.ts`
- Modify: `custom/server/controllers/ia2/identity-chat.ts`、`custom/server/matrix/chat-bridge.ts`、`custom/server/harness/workbench/service.ts`、`custom/server/kanban/column-automation-controller.ts`
- Test: 各相邻 `__tests__`；`custom/server/kanban/__tests__/column-automation.test.ts`

**Interfaces:**
- `gatewayProfileClient` 提供 `ensureBotChat(profile)`、`chat(profile, message, sid?)`、`messages(profile, sid)`；超时保留 queued 语义。
- 列派发输入以 `taskId` 为准，服务端解析 workspace；输出保留 taskId/runId/outcome 关联。

- [ ] 写 Matrix 入向不得 `processMentions`、Harness REST 不得直接 CLI、列派发不得直接 Ycode `createSession` 的测试。
- [ ] 运行目标测试确认旧旁路被击中。
- [ ] 抽取共享 gateway client；ChatBridge 只投影；Harness 产品入口改 gateway；列派发转 kanban/gateway 且防双写。本地诊断 CLI 明确标注非产品主链。
- [ ] 复跑 matrix/harness/kanban/identity 相邻测试。
- [ ] 提交 `fix(gateway): 收口产品内 agent 执行入口`。

### Task 4: taskId 到 Ycode 的确定性委托

**Files:**
- Create: `runtime/tools/kanban_acp_context.py`、`runtime/tests/tools/test_kanban_acp_context.py`
- Modify: `team/profiles/worker-coder/plugins/acp-client/__init__.py` 及同哈希副本、`team/patches/acp-client-codex-fix__init__.py`
- Modify: `runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py`
- Test: `team/tests/test_core_coding_chain.py`、新增 ACP wire/permission 测试、`runtime/tests/hermes_skills/`

**Interfaces:**
- `buildAcpTaskContext(taskId, board, instruction) -> { taskId, board, cwd, prompt, contextSha256, taskRevision }`；复用 `build_worker_context` 与 `resolve_workspace`。
- ACP client 池键为 `(provider, canonicalCwd)`；`session/new.cwd === cwd`；provider/model 回读不符即失败。
- 权限只允许一次或取消；写路径必须留在该 session 的任务根。

- [ ] 写任务正文/handoff/评论/验收标准、路径逃逸、未物化、模型不符、关闭自动批准仍放行、重铺丢 ZCode 的负向测试。
- [ ] 运行 pytest 目标并确认旧实现失败。
- [ ] 实现上下文适配、provider+workspace 隔离、env/model 校验和权限边界；同步插件派生副本与重铺源。
- [ ] 用 fake ACP server 验证 initialize→session/new→session/prompt、taskId/sessionId/cwd/prompt 哈希和非零失败语义。
- [ ] 提交 `fix(acp): 任务上下文与工作区由程序传给 Ycode`。

### Task 5: 项目技能准备与真实使用

**Files:**
- Create: `runtime/hermes-skills/coding-delegate/scripts/skill_lifecycle.py` 及测试（若现有脚本可承载则改为修改，不另建平行流程）
- Modify: `team/profiles/worker-coder/SOUL.md`、`runtime/hermes-skills/coding-delegate/SKILL.md`、`custom/server/skillgov/skillgov-controller.ts`
- Modify: `runtime-manifest.json`、`scripts/runtime/register-runtime.mjs`
- Test: `runtime/tests/hermes_skills/`、`team/tests/`、`custom/server/skillgov/`、`scripts/__tests__/register-runtime.test.ts`

**Interfaces:**
- 准备结果 `{ status, skillName, skillDir, active, verification, contentHash }`；只有 `active=true` 且 strict 验证通过才可进入实现。
- 实现证据增加真实 `Skill` 工具调用、准备/实现 sessionId 和技能哈希。

- [ ] 写 draft、strict 失败、升级未更新、生成目录错、技能未发现、未调用 Skill 的负向测试。
- [ ] 运行目标测试并确认旧实现会把骨架或缺失技能当可用。
- [ ] 消费 swarm-yuan 既有生成/升级/验证/激活流程；准备后重建该 workspace ACP client，再由正式会话调用项目技能。单一路径实物同时供 Ycode 与 Hermes 发现。
- [ ] 复跑 swarm-yuan 公开接口的相关测试；不改另一分支正在重写的生成器内部。
- [ ] 提交 `feat(skills): 编码前完成项目技能激活与真实装载`。

### Task 6: G3/G5 与报告硬判据

**Files:**
- Modify: `simharness/aipay-scenario.sh`、`simharness/mux/mx-report-gen.py`、`simharness/mux/final-report-merge.py`
- Modify: `simharness/skills/aipaydev-dev/`（仅经真实验证后激活）
- Test: `simharness/tests/harness-gate-integrity.test.ts`、`simharness/mux/tests/`

**Interfaces:**
- `delegate-result.json` 是 G3 的机器证据；字段与 Task 4/5 相同。
- G5 批准含 actor/proxy/revision；strict 只接受认证真人批准，proxy 不计真人净额。

- [ ] 用行为夹具覆盖缺日志、非零 RESULT、错误 cwd、draft、缺 Skill、测试失败、匿名 G5，确认旧脚本仍可能过闸。
- [ ] 实现 G3 缺证即 `_g3_miss` 且不写过闸键；G5 未获有效批准不置 `g5_ready`；报告只从当轮结构化证据计算。
- [ ] 复跑 simharness 目标 Vitest 和 shell 门、`bash -n simharness/aipay-scenario.sh`。
- [ ] 提交 `fix(harness): 编码与发布门只认真实行为证据`。

### Task 7: 现行文档与全量索引

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-swarmstudio-requirements-analysis.md`
- Modify: `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`
- Modify: `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`
- Modify: `docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md`
- Modify: `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`
- Modify: `docs/superpowers/specs/2026-10-24-merged-projects-knowledge-compendium.md`、`README.md`、`docs/USAGE.md`、数字总账
- Create: `scripts/check-design-docs.mjs` 与测试（若已有等价守门则扩展，不新建）

- [ ] 生成当前 specs 全量清单并标正本/派生/历史/专项，检查失效版本指针和相对链接。
- [ ] 更新九段链路和证据状态；整合设计与全流程方案从合入时最高版本续升，历史正文不改。
- [ ] 运行文档守门和 `python3 ~/.zcode/skills/gongwen-bifa/scripts/gongwen-lint.py <本批正本>`；存量规则与新增违规分开报告。
- [ ] 提交 `docs(architecture): 九段主链与现行设计正本对账`。

### Task 8: 全量验证、独立审查与收口

- [ ] 复验既有 core-chain 两批命令：team/pytest、skillgov、register-runtime、board_team_keys、sim-launch、simharness 定向门。
- [ ] 运行 `npm run typecheck:harness`、clean/inject、`npm run build:full` 和全量 `npm test`，与同基线差分对账。
- [ ] 在隔离环境做双账户浏览器、Matrix＋双 gateway/peer、脱敏真实 Ycode ACP 验证；真实模型失败不得改写为成功。
- [ ] 由未参与实现的 reviewer 检查九段追踪、负向测试和旁路；主会话复跑其关键结论。
- [ ] 更新 spec 的实际结果与未验证项，按仓规本地 `--no-ff` 合入，不推送。
