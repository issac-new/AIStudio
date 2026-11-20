# AI 原生组织运行模型·批二（共享认知与学习）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清偿批一欠账四小修＋补丁 807 继承补全＋mxid 桥放开 gateway 双签＋全量快照与召回留痕＋学习候选与同口径对照＋浏览器三面走查，以试点 II（第二同口径结果证明召回）准出。

**Architecture:** 全部落在批一 outcome 域与既有通道上加法扩展；快照信封沿用；双侧（TS/Python）契约继续以 decision-vectors.json 与既有 806 补丁面承载。

**Tech Stack:** TS/Koa（vitest）、Python（vendor 补丁＋runtime 镜像，pytest）、Vue3（组件测试）。

**Spec:** `docs/superpowers/specs/2026-11-20-ai-native-cognition-batch2.md`（母本设计 spec §2 批表/§4.4/§4.5）

## Global Constraints

- 沿批一：OUTCOME_WORKBENCH 门、K19 ok/fail/bodyOf、注释中文、台账哈希链与原子写、不新增依赖。
- 补丁号续 807（series 尾 806）；806 更新走重生成＋runtime 镜像同步。
- 每任务 TDD 先红后绿；commit 只含本任务文件。

## Review Focus

1. **状态门不拦 deny**——cancelled/settled 合同的绑定条目 deny 照常 settle（否决不设门），approve/reject-to-approve 才 409。
2. **mxid 桥不放大**——未登记 mxids 的 person 永不命中；同人两 mxid 不构成两签；CLI/transport 面仍 deny-only。
3. **未 approved 经验不进快照**——candidate/rejected/超域候选在 content 与 approvedExperienceVersions 双面缺席。
4. **召回留痕可反查**——recordInjection 行带 snapshotId，且该 snapshot 的 approvedExperienceVersions 含被注入候选指纹。
5. **effect 不足即 unknown**——单个已结算结果的对照投影恒 unknown 且带缺口说明。

---

### Task 1: outcome 域小修包（吞行回移＋读 authz）

**Files:**
- Modify: `custom/server/outcome/outcome-store.ts`（events/snapshots 两追加面前置 ensureLineTerminated——从 snapshot.ts 内联实现上移为本域共享助手或复制同构并注明）
- Modify: `custom/server/outcome/outcome-controller.ts`（GET /:id、/:id/context、/:id/measurements、/:id/settlement 读面：owner/verifier 得全量；其他登录用户 200 但 content/measures/结算摘要脱去、含 `readScope:'metadata'` 标记；404/门语义不变）
- Test: `custom/server/outcome/__tests__/outcome-store.test.ts`（追加半行隔离用例）、`__tests__/outcome-controller.test.ts`（追加读 authz 用例）

**Interfaces:**
- Produces: 读面响应增可选 `readScope: 'full' | 'metadata'`；metadata 态不含 `snapshotContent/measures[].definition/settlement.rationale`（字段级脱去清单实现者按敏感度最小集定，测试钉死 measures 与 snapshot content 两处）。

- [ ] TDD 红→实现→绿（npx vitest run custom/server/outcome/）→typecheck→commit `fix(outcome): 事件吞行回移与读面 authz 收口（批二 T1）`。

### Task 2: 收件箱小修包（合同状态门＋tap fail-open）

**Files:**
- Modify: `custom/server/approval-inbox/pending-controller.ts`（enforceOutcomeBinding 增合同状态检查：cancelled/settled→approve 路径 409 `outcome_not_active`；deny 放行；fleet: 分支 tap 读取异常→条目标 `outcomeUnverified`，decide 面按 outcome_unavailable 409、autopass 拒）
- Test: `custom/server/approval-inbox/__tests__/outcome-binding.test.ts`（追加：终态合同 approve 409/deny 放行；tap 异常三面）

- [ ] TDD 红→实现→绿（approval-inbox ＋ outcome 域回归）→commit `fix(outcome): 收件箱合同状态门与 tap 瞬态收口（批二 T2）`。

### Task 3: 补丁 807 建卡继承补全

**Files:**
- Create: `patches/807-agent-kanban-create-parent-outcome.patch`（vendor kanban_db.py `create_task`：parents 非空时取首父 outcome_id 继承，异值拒同 805 语义；kanban_swarm/CLI --parent 路径自然覆盖）
- Modify: `patches/series`；runtime 镜像同步
- Test: `runtime/tests/hermes_cli/test_outcome_inheritance.py`（追加 swarm 三 parents 场景与 CLI --parent 场景）

- [ ] TDD 红（pytest）→补丁＋镜像→apply-check 双向→pytest/vitest 绿→commit `feat(outcome): 建卡路径继承补全（补丁 807）`。

### Task 4: person↔mxid 桥与 gateway 双签放开

**Files:**
- Modify: `custom/server/agentidentity/people.ts`（Person.mxids?: string[]；校验：非重复、@前缀形态宽松校验）＋种子脚本 mxid 导入列（scripts/maintenance/hrgov-seed.mjs 可选读）
- Modify: `patches/806-agent-approval-outcome-guard.patch` 重生成（vendor tools/approval.py＋runtime/tools/outcome_policy.py：dual-sign 释放判定改为——两笔 consent 的 actor 经 mxid 桥映射到 owner/verifier 两个不同 person 方释放；桥数据经 outcome_policy 读 people.json（同 outcome_store 根约定）；CLI/transport 维持 deny-only＋文案更新「已支持 mx: gateway 卡片双签，本面请用收件箱」）
- Test: `runtime/tests/tools/test_outcome_policy.py`（追加：桥命中释放/同人两 mxid 不释放/未登记 mxid 不命中/CLI 仍拒）；`custom/server/agentidentity/__tests__/`（mxids 校验）

- [ ] TDD 红→实现（先 people 后补丁）→pytest＋vitest 绿→commit `feat(outcome): mxid 桥与 gateway 双签释放（批二 T4）`。

### Task 5: 全量快照与召回留痕

**Files:**
- Modify: `custom/server/outcome/snapshot.ts`（buildFullSnapshot：input 增 resolves {panorama(), decisions(), premises(), experiences()}；content 增四区块；approvedExperienceVersions=候选 id@updatedAt 指纹数组；沿用临界/脱敏/excludedSources）
- Modify: `custom/server/outcome/kanban-resolution.ts`＋`column-dispatch.ts`（派单改用全量快照；经验区块经 exp-inject 同源选择器 selectableExperiences＋scope；recordInjection 调用增 snapshotId）
- Test: `custom/server/outcome/__tests__/snapshot.test.ts`（未 approved 缺席双面/临界/源失败分级）、`kanban-resolution.test.ts`/`dispatch-outcome.test.ts`（召回留痕含 snapshotId 且可反查快照指纹）

- [ ] TDD 红→实现→绿→typecheck→commit `feat(outcome): 全量上下文快照与召回留痕（批二 T5）`。

### Task 6: 学习候选与同口径对照

**Files:**
- Create: `custom/server/outcome/learning.ts`（settlement→ExpCandidate 生成/更新：statement 取结算 rationale 摘要＋verdict；scope 按 rootTask 板列；双闸 learningOptIn＋EXPERIENCE_INJECT 写闸；幂等按 sourceSettlementId）
- Create: `custom/server/outcome/comparison.ts`＋控制器 `GET /:id/comparison`（同 measureId 定义并排基线/评估测量与结算 verdict；effect: |evals 结算|<2 或 measure 定义不同口径→unknown+缺口说明；否则按 target 命中数比较 improved/degraded——纯投影不写账）
- Modify: `custom/client/kanban/api/outcome.ts`＋`OutcomeSection.vue`（对照行只读渲染）
- Test: `custom/server/outcome/__tests__/learning.test.ts`、`comparison.test.ts`、面板组件用例

- [ ] TDD 红→实现→绿→commit `feat(outcome): 学习候选生成与同口径对照投影（批二 T6）`。

### Task 7: 浏览器三面实物走查

**Files:**（缺陷修复落相关文件；走查记录入报告）
- 隔离起服：NODE_ENV=production、OUTCOME_WORKBENCH=1、HERMES_WEB_UI_HOME/HERMES_HOME 指 /tmp、端口避 8647；浏览器实操三面全交互；缺陷修复后复走查。
- Test: 无新增（既有测试守修复）

- [ ] 起服→三面走查（OutcomeSection 全交互/OrchestrationView 三态/Inbox 双签两笔）→缺陷修复→复走查→commit（如有修复）＋报告留操作步骤与所见。

### Task 8: 试点 II、收口与合并准备

**Files:**
- 试点 II：以批一试点 outcome 为基线，第二同口径结果全链（建卡→合同→激活→派单全量快照含经验→双签→observing→测量→结算→对照投影 effect=unknown 单结果缺口说明）。
- `config/mechanism-budget.json` 登记（mxid 桥/全量快照/对照投影＋配对收敛）；`docs/DESIGN.md` 两句；本 spec 验证段回填；全量门（npm test＋merge-invariants＋governance-lint）；gen-doc-indexes。
- [ ] 执行→回填→全量门→commit `chore(outcome): 批二收口`→主会话合并。

---

## 执行说明

- 并行：T1（outcome 域）/T2（approval-inbox）/T3（vendor 补丁）文件面不相交，可三路并行；T4 依赖 people 先行（其内含）；T5 依赖 T1；T6 依赖 T5；T7 依赖 T5/T6 UI；T8 收口。
- 批二准出：试点 II 召回留痕可反查＋未 approved 不出现＋单结果对照恒 unknown＋浏览器三面走查闭环。
