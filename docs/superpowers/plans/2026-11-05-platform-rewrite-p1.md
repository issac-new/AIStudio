# AIStudio 平台重写 P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立注入事务、部署状态、产物身份与发布准出核心，使"尝试过/记录在档"不再能伪装成"已成功"，并为 release:gate 提供真实证据链。

**Architecture:** 注入 Planner/Executor/Journal 位于 `scripts/platform/inject/`，manifest v2 记录逐补丁真实状态；`scripts/platform/release/` 编排发布准出；`custom/server/platform/delivery/` 承载 bundle 身份与图运行 UUID；runtime 资源解析器在 `custom/server/lib/`。P0 已建立的契约（identity/execution/evidence）继续作为唯一事实源。P1 在 `refactor/platform-rewrite` 分支继续累积提交，仍不单独合入 main，最终与 P2 一次性切换。

**Tech Stack:** Node 24 ESM、SQLite（node:sqlite）、git apply、Vitest、Koa、qgate CLI。

## Global Constraints

- 工作树固定为 `/Users/cuishi/lab/AIStudio/.claude/worktrees/platform-rewrite`，不在 main 修改。
- 测试统一 `HOME=/tmp/aistudio-platform-p0-home.cTijpN`（已含 profiles 夹具）；注入类测试用临时 `OVERLAY_STATE_OUT` 与临时 vendor 快照，不得写真实宿主运行树。
- 失败、跳过、部分完成不得进入任何 applied/success 投影；兼容旧读取方的数组只能从真实 applied 项派生。
- v1 manifest 不可自动收养为 v2；只允许"已验证精确前缀后的尾部增量"。
- 保留"默认不覆盖宿主差异、--force 先备份"的部署安全边界；kept/conflict 必须产出 partial 而非成功。
- release:gate 的每步证据必须绑定当前 HEAD；缓存、waived、CONDITIONAL、过期证据不得形成普通 pass。
- 不升级依赖；vendor 只走 patches/ 通道；每个任务目标测试绿后单独提交。
- P0 终审判定的五项前置（OS 证明、无 context 相对路径、路由重叠、EvidenceRecord 九字段、默认拒绝覆盖面）在 Task 1-2 处置，不得顺延。

---

### Task 1: P1 前置清扫（终审前置条件①②③⑤）

**Files:**
- Modify: `custom/platform/contracts/execution.ts`
- Modify: `custom/server/toolpipeline/enforce-gate.ts`（如需传 govbus 事件）
- Create: `custom/server/platform/authz/__tests__/route-overlap.test.ts`（或并入 route-policy.test.ts）
- Modify: `registries/server/platform-route-policy.ts`（文件头边界声明）
- Test: `custom/server/toolpipeline/__tests__/enforce-identity-sandbox.test.ts`、`custom/server/platform/__tests__/route-policy.test.ts`

**Interfaces:**
- Produces: `osSandboxAttestation()`（改名+探测混合：env 置值时附加探测信号并落 govbus 事件）；`sandboxPathViolation` 在 ROOTS 配置但无 context 时返回特殊标记 `{ skippedNoContext: true }` 由调用方记观测事件；`assertNoPolicyPathOverlap(policies)`。
- Consumes: P0 的 `osSandboxProofActive`、`sandboxPathViolation`、`platformRoutePolicies`。

- [x] **Step 1: 写负例**——①env 声明 PROOF=container 但本机无 /.dockerenv 时，attestation 记录 `declaredOnly:true` 且 govbus 收到 autonomy/sandbox-attestation 事件；②ROOTS 配置+无 context 的相对路径调用产生观测事件（不断言拒——本任务只加可见性，fail-closed 留 P2 执行面统一）；③构造静态 `/api/x/special` 与参数 `/api/x/:id` 重叠的政策清单时 `assertNoPolicyPathOverlap` 抛错。
- [x] **Step 2: 确认红**（新函数不存在/旧行为放行）。
- [x] **Step 3: 实现**——`osSandboxAttestation` 返回 `{declared, probeSignals:{dockerenv, cgroupContainer, sandboxExec}, declaredOnly}`；enforce-gate 解锁 terminal 时 `declaredOnly=true` 则附 warning 并 `appendGovEvent`（fire-and-forget，同 permmodes 先例）；`sandboxPathViolation` 增加第三返回形态；启动对账调用 `assertNoPolicyPathOverlap`。
- [x] **Step 4: 注册表文件头写边界声明**——"当前默认拒绝覆盖 6 个受管 router；harness/eval/orchestrator 等写面按 P2 扩展节奏登记"（处置前置⑤的书面化）。
- [x] **Step 5: 跑 toolpipeline+platform 目标测试绿后提交** `feat(platform): P1 前置——沙箱证明可观测化与路由重叠守卫`。

### Task 2: EvidenceRecord 九字段契约

**Files:**
- Modify: `custom/platform/contracts/evidence.ts`
- Modify: `custom/server/platform/evidence/gate-evidence.ts`（补 producer/subjectId/ts）
- Create: `custom/server/platform/evidence/evidence-store.ts`（JSONL 追加式存储，路径注入 env 可覆盖）
- Test: `custom/server/platform/evidence/__tests__/evidence-store.test.ts`

**Interfaces:**
- Produces: `EvidenceRecord { evidenceId, subjectId, status, producer, commit, startedAt, endedAt, sourceDigest, artifactRefs[] }`；`appendEvidence(record)`、`latestEvidenceFor(subjectId)`。
- Consumes: P0 gate-evidence 的三字段记录（保持向后兼容读取）。

- [x] **Step 1: 负例**——缺 evidenceId/producer/commit 的记录 `appendEvidence` 抛错；`latestEvidenceFor` 对不存在主体返回 null 不猜。
- [x] **Step 2: 红→实现**——九字段 schema 校验（纯函数 `validateEvidenceRecord`）；JSONL 原子追加；gate-evidence 产出时填充 producer='gate-evidence'、commit=process.env 传入或 null+declaredMissing 标记。
- [x] **Step 3: 绿后提交** `feat(platform): 证据记录九字段与追加式存储`。

### Task 3: 注入 Planner 与 manifest v2 契约（纯函数层）

**Files:**
- Create: `scripts/platform/inject/planner.mjs`
- Create: `scripts/platform/inject/manifest.mjs`
- Create: `scripts/__tests__/inject-planner.test.ts`
- Create: `scripts/__tests__/inject-manifest.test.ts`

**Interfaces:**
- Produces: `buildPlan(seriesText, zcodeSeriesText, patchDir)` → 有序 `PlanItem[]{channel,target,name,sha256,seriesIndex,addedFiles[]}`；`emptyManifest(baseline)`；`applyPlanToManifest(manifest, item, result)`；`deriveAppliedPatches(manifest)`（只从 status==='applied' 派生）；`planIncrement(manifest, plan)` → `{kind:'noop'|'tail-append', items[]}` 或抛 `IncrementRefusedError{reason}`（rename/modify/insert/reorder/baseline-change/root-change/last-failed/v1-manifest）。
- Consumes: 现有 `patches/series` 解析逻辑（从 inject.mjs 抽出，不复制）；补丁 sha256 用 node:crypto。

- [x] **Step 1: 负例（纯函数可直接红）**——修改已应用补丁内容（sha 变）→ IncrementRefused；中插新补丁→Refused；v1 manifest→Refused 且 reason 含 'v1'；尾部纯追加→tail-append；全空 plan→noop；appliedPatches 排除 failed/skipped。
- [x] **Step 2: 红→实现**（不改 inject.mjs 主流程——接线在 Task 5）。
- [x] **Step 3: 绿后提交** `feat(platform): 注入计划器与 manifest v2 契约`。

### Task 4: Executor 与 Journal（事务化注入）

**Files:**
- Create: `scripts/platform/inject/executor.mjs`
- Create: `scripts/platform/inject/journal.mjs`
- Create: `scripts/__tests__/inject-executor.test.ts`

**Interfaces:**
- Produces: `runInjection(plan, opts{roots, stateOut, applyRuntimeDeploy})` → `{manifest, results[]}`；Journal 在每个补丁 apply 前 fsync 目标文件备份（`<stateOut>/journal/<patch>.pre`），apply 后记录 addedFiles 实际落盘清单；失败时 `rollbackTo(journalPoint)` 恢复本次会话已改文件；`git apply --check` 预检；首个失败后同 lane 后续记 `skipped/blocked-by-failed`。
- Consumes: Task 3 的 planner/manifest；现有 inject.mjs 的目标树路由规则（`resolvePatchTargetRoot` 语义，抽出复用）。

- [x] **Step 1: 负例（用临时 git 仓+临时 overlay 快照夹具）**——①注入中强制第 N 个补丁失败→前 N-1 个已应用项全部回滚（文件字节比对）、manifest status=failed、后续 skipped；②部署预检返回 partial→注入中止不写 applied 投影；③成功路径 manifest=complete 且 appliedPatches 与 plan 一致；④中断后重跑→IncrementRefused（last-failed）提示 clean。
- [x] **Step 2: 红→实现**。夹具参照现有 `scripts/__tests__/inject-absent-tree.test.ts` 的临时根构造法。
- [x] **Step 3: 绿后提交** `feat(platform): 事务化注入执行器与回滚日志`。

### Task 5: inject/ensure-injected/clean 切换到平台核心

**Files:**
- Modify: `scripts/inject.mjs`（主流程改调 planner/executor/journal；保留 CLI 入口与 --config-only/--clean 语义）
- Modify: `scripts/ensure-injected.mjs`（改读 v2 manifest+planIncrement；删除"cockpit 路由存在即放行部分失败"与"脏树无标志 exit 0"两条假绿路径）
- Modify: `scripts/deploy-agent-runtime.mjs`（RESULT status= 行；kept/conflict→exit 2，missing→exit 1，全同→0）
- Create: `scripts/__tests__/deploy-agent-runtime.test.ts`
- Test: 既有 `scripts/__tests__/inject-absent-tree.test.ts`、`custom/server/__tests__/ensure-injected-delta-guard.test.ts` 适配

**Interfaces:**
- Produces: `.overlay-injected.json` schemaVersion=2；`clean` 按 manifest.addedFiles 的 targetRoot 分树删除（containment 校验）；deploy 输出末行 `RESULT status=complete|partial|failed`。
- Consumes: Task 3/4 全部接口。

- [x] **Step 1: 负例**——①agent 补丁新增文件经 clean 后从 hermes-agent 树消失、studio 树同路径不动（P0 审查实锤缺陷的反面）；②deploy kept>0 → exit 2 且 inject 不写 complete；③ensure 对 last-failed manifest 非零退出。
- [x] **Step 2: 红→改主流程**（v1 manifest 存在时 ensure 打印一次性迁移指引退出 3，不自动收养）。
- [x] **Step 3: 隔离快照完整重放**——临时 HOME/SIM_ROOT/HERMES_HOME 下 clean→inject→clean→inject 幂等二连，`cmp` 逐字节对账（Task 2 同款验证法）。
- [x] **Step 4: 绿后提交** `feat(platform): 注入链切换平台核心——严格增量与分树清理`。

### Task 6: 统一 upstream 根解析与入口前置

**Files:**
- Create: `scripts/platform/lib/upstream-root.mjs`
- Modify: `scripts/build.mjs`、`scripts/build-dmg.mjs`、`scripts/serve-server.mjs`、`scripts/verify-dist.mjs`
- Test: `scripts/__tests__/upstream-root.test.ts`

**Interfaces:**
- Produces: `resolveUpstreamRoots()` → `{overlayRoot, upstreamRoot, hermesStudioRoot, hermesAgentRoot, zcodeRoot}`（env 显式 > 仓内 vendor > 旧兄弟 upstream，realpath 规范化）。
- Consumes: 各入口现有内联解析（删除副本）。

- [ ] **Step 1: 负例**——无仓外 upstream 的临时检出中 build/serve/build-dmg 解析到仓内 vendor；build-dmg 不再回落 `../upstream`（当前 scripts/build-dmg.mjs:13-20 的旧根副本删除后有测试证明行为变化）。
- [ ] **Step 2: 红→实现**——build.mjs/build-dmg.mjs/serve-server.mjs 显式调用 `ensure-injected` 前置（serve 起 SPA 前检查，partial 不起服）；build-dmg 的 tracked restore 复用 treeGitCtx 语义（vendor 子目录无自身 .git 时不得裸 `git checkout -- .`）。
- [ ] **Step 3: 绿后提交** `feat(platform): 统一上游根解析与四入口注入前置`。

### Task 7: runtime 资源统一解析与产物校验

**Files:**
- Create: `custom/server/lib/runtime-resources.ts`
- Create: `scripts/platform/lib/runtime-assets.mjs`（资产清单生成）
- Modify: `custom/server/tokens/pricing.ts`、`custom/server/zcode/squad-protocol.ts`、`custom/server/kanban/column-automation.ts`、`custom/server/governance/governance-ledger.ts`
- Modify: `scripts/build.mjs`（复制到真 `dist/server/runtime`）、`scripts/verify-dist.mjs`
- Test: `custom/server/lib/__tests__/runtime-resources.test.ts`、`scripts/__tests__/verify-dist-runtime.test.ts`

**Interfaces:**
- Produces: `resolveRuntimeResource(rel, fromDir)`（向上探测 `<dir>/runtime/<rel>`，拒绝绝对路径与 `..`；全 miss 返回 null）；`runtime-assets.json` 清单（pricing/roster/semantica-bridge）；verify-dist 校验清单逐项存在。
- Consumes: 四模块现有 env 覆盖优先逻辑保留。

- [ ] **Step 1: 负例**——源码态命中仓根 runtime/；bundle 态（临时目录模拟 dist/server 布局）命中同级 runtime/；越界 rel 抛错；verify-dist 缺任一清单资产非零。
- [ ] **Step 2: 红→实现**（`resolveRosterFile` 降级为兼容 wrapper）。
- [ ] **Step 3: 绿后提交** `feat(platform): 运行时资源单一解析器与产物清单校验`。

### Task 8: bundle 身份与图运行 UUID

**Files:**
- Create: `custom/server/platform/delivery/bundle-identity.ts`
- Modify: `custom/server/loop/graph/graph-service.ts`（seqCounters→UUID）
- Test: `custom/server/platform/delivery/__tests__/bundle-identity.test.ts`、`custom/server/loop/graph/__tests__/graph-service-hardening.test.ts`

**Interfaces:**
- Produces: `computeBundleIdentity({commit, vendorBaselines, patchDigests, runtimeManifestDigest, assetDigests})` → 稳定 sha256；graph 新 run/fork 用 `run-<graphId>-<uuid>`，旧序号记录可读可恢复。
- Consumes: Task 7 的资产清单 digest；vendor 基线 treeOid（Task 3 的 baseline 采集复用）。

- [ ] **Step 1: 负例**——双 service 同 event log 重建后新 runId 不复用（P0 审查实锤缺陷的反面）；bundle 身份对任一输入变化敏感；旧 run-<graph>-1 记录 rebuild/resume 语义不回归。
- [ ] **Step 2: 红→实现**（UUID 用 node:crypto randomUUID；ID_RE 兼容确认）。
- [ ] **Step 3: 绿后提交** `feat(platform): 产物身份与图运行 UUID`。

### Task 9: release:gate 真实准出编排

**Files:**
- Create: `scripts/platform/release/release-gate.mjs`
- Modify: `custom/qgate/src/cli.ts`、`custom/qgate/src/core/run.ts`、`custom/qgate/src/core/report.ts`（`--require-pass`/`--no-cache`/strict release-report）
- Modify: `scripts/make-release-packages.mjs`、`package.json`（`release:gate` script）
- Test: `scripts/__tests__/release-gate.test.ts`、`custom/qgate/__tests__/qgate-p5-p9.test.ts` 适配

**Interfaces:**
- Produces: `release:gate` 顺序执行 qgate:build → basic-check（真 npm test + JUnit 复析）→ harness-eval → typecheck 双门 → build:full（内含 server tsc + verify-dist）→ strict release-report（`--require-pass --no-cache --since <startTs>`）；任一步非 PASS 即非零；receipt 落 `.qgate/release-gate.json`。
- Consumes: Task 2 的 EvidenceRecord（每步产出绑定 HEAD 的证据行）；make-release-packages 实际写包前调用，`--dry-run` 保持只打印计划。

- [ ] **Step 1: 负例（stub 命令注入）**——①任一步 stub 返回非零→gate 非零且不执行后续步；②stub 测试报告含 1 failed 但 exit 0→gate 拦（JUnit 复析）；③waived/CONDITIONAL/缓存命中/早于 --since 的历史 PASS→strict report 非零。
- [ ] **Step 2: 红→实现**（qgate 三处扩展带自身单测；不改变默认任务门行为）。
- [ ] **Step 3: 绿后提交** `feat(platform): 发布准出真实执行链`。

### Task 10: P1 集成验收

**Files:**
- Modify: `docs/superpowers/specs/2026-11-05-platform-rewrite-design.md`（新增「P1 实施验证」小节）
- Modify: `docs/superpowers/specs/2026-11-05-build-release-p1-hardening.md` 不存在则在本 spec 内记录，不新建重复正本

**Interfaces:** 消费 Task 1-9 全部。

- [ ] **Step 1: 隔离环境全链**——clean→inject 幂等二连字节对账；deploy 三态（same/kept/missing）退出码矩阵；干净检出模拟（临时根）build 解析正确。
- [ ] **Step 2: 真实构建**——`npm run build:full` 真跑（worktree 内，产物不入提交）；verify-dist 全清单绿。
- [ ] **Step 3: release:gate 真跑**——预期当前可全绿（typecheck 18≤18、npm test 8,164 绿、build 绿）；若 qgate strict report 因历史证据态红，如实记录并修复证据态而非放宽判据。
- [ ] **Step 4: 变异探针**——①manifest 把 failed 写入 appliedPatches→planner 测试红；②deploy kept 返回 0→deploy 测试红；③release-gate 跳过 typecheck 步→编排测试红；④bundle 身份忽略 runtimeManifestDigest→敏感性测试红。
- [ ] **Step 5: spec 验证小节写入真实计数后提交** `test(platform): P1 交付核心验收`。

P1 到此仍在重写分支累积，不合入。下一阶段以本阶段实际接口编写 P2 计划；最终切换前置项（真启动冒烟、OPTIONS、MXID 竞态、活体验证）在 P2/切换批处理。
