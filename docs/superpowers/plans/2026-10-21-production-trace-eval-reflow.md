# Production Trace Eval Reflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把生产 session/span 转成可复判的回归题，并确保原证据诊断不能冒充修复或发布证据。

**Architecture:** 新增独立的生产转题编排模块，复用 EvalSet 资产原语与既有采样器。运行器通过显式 `useOrigin` 展开来源引用，客户端在现有 IDE 轨迹页与评测岛串联，不新增中心或运行器。

**Tech Stack:** TypeScript、Vue 3、Koa、Vitest、现有 run-trace JSONL。

**Spec:** `docs/superpowers/specs/2026-10-21-production-trace-eval-reflow.md`

## Global Constraints

- 只修改 overlay。不得修改 upstream。
- 首版只接受完整 legacy JSONL。OTel、空证据和 hash 漂移必须拒绝。
- origin 只保存引用与 SHA-256，不保存原始证据文本。
- 显式 samples 优先。origin/mixed 不得关闭处置单或进入候选晋级。
- 每个行为先写失败测试并确认 RED，再写实现并确认 GREEN。
- 不抢占其他会话的进程、端口或 worktree。

## Review Focus

- 预览后文件变化：必须返回 hash 冲突且不写任务，由 Task 1 测试锁定。
- 用户随后改写原证据文件：自动复判必须在裁判调用前失败，由 Task 2 测试锁定。
- 同一 session 的不同 span：必须生成不同任务，由 Task 1 测试锁定。
- 只有 origin 的单样本诊断通过：不得关闭处置单或晋级，由 Task 2 测试锁定。
- OTel 或无稳定 ref 的节点：不得出现可用转题动作，由 Task 3 测试锁定。

---

### Task 1: 生产轨迹转回归题

**Files:**
- Create: `custom/server/eval/origin.ts`
- Create: `custom/server/eval/trace-reflow.ts`
- Modify: `custom/server/eval/trace-sampler.ts`
- Modify: `custom/server/eval/types.ts`
- Modify: `custom/server/eval/controller.ts`
- Modify: `custom/server/eval/index.ts`
- Test: `custom/server/eval/__tests__/trace-reflow.test.ts`

**Interfaces:**
- Consumes: 既有 `sampleFromTrace()`、`sampleSpanFromTrace()`、`createSet()` 与任务追加/版本原语。
- Produces: `reflowTraceToSet(input)`、`POST /api/hermes/eval/reflow-from-trace`、兼容旧数据的 `ReflowOrigin` 和稳定来源键。

- [ ] **Step 1: 写转题失败测试**

覆盖 session/span 创建、默认回归库和幂等不增 revision。另测同来源定义冲突、不同 span 不去重、密封目标、非法引用、缺 trailer、OTel、空证据、hash 漂移及 origin 不含 transcript。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx vitest run --testTimeout=30000 custom/server/eval/__tests__/trace-reflow.test.ts`
Expected: 因 `origin`/`trace-reflow` 尚不存在而失败。

- [ ] **Step 3: 实现来源类型、严格采样和转题编排**

`traceHash` 使用原始文件字节 SHA-256。转题重新采样并检查 `expectedTraceHash`，再调用既有资产原语。任何失败不得留下半任务。

- [ ] **Step 4: 运行转题与既有采样测试确认 GREEN**

Run: `npx vitest run --testTimeout=30000 custom/server/eval/__tests__/trace-reflow.test.ts custom/server/eval/__tests__/trace-sampler.test.ts custom/server/eval/__tests__/span-sampler.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交 Task 1**

```bash
git add custom/server/eval docs/superpowers
git commit -m "feat(eval): 支持生产轨迹转回归样本"
```

### Task 2: origin 自动复判与新鲜证据门禁

**Files:**
- Modify: `custom/server/eval/runner.ts`
- Modify: `custom/server/eval/store.ts`
- Modify: `custom/server/eval/controller.ts`
- Modify: `custom/server/harness/workbench/service.ts`
- Modify: `custom/server/harness/workbench/evidence.ts`
- Test: `custom/server/eval/__tests__/origin-replay.test.ts`
- Test: `custom/server/eval/__tests__/eval-closure.test.ts`
- Test: `custom/server/harness/workbench/__tests__/`

**Interfaces:**
- Consumes: Task 1 的 `ReflowOrigin`、严格采样与来源引用。
- Produces: `useOrigin?: boolean`、`spanRef?: string`、`evidenceMode: explicit|origin|mixed` 和 fresh-only 门禁。

- [ ] **Step 1: 写 origin 复判和门禁失败测试**

完整走通“生产失败转题 → origin 复判失败 → 建处置单 → origin 复判不能关闭 → fresh 同卷复评关闭”。另测显式样本优先、hash 漂移时裁判零调用和缺样本整-run 拒绝。再测 span 保留、候选拒绝 origin/mixed、历史 run 使用冻结考卷。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx vitest run --testTimeout=30000 custom/server/eval/__tests__/origin-replay.test.ts`
Expected: 因 `useOrigin` 与 `evidenceMode` 尚不存在而失败。

- [ ] **Step 3: 实现显式 origin 展开与证据模式**

只有 `useOrigin:true` 且显式样本缺失时才补一个来源样本。任何任务无证据来源则整次拒绝。origin 读取失败或 hash 不符时不得调用裁判或落 run。

- [ ] **Step 4: 实现 fresh-only 处置与晋级约束**

旧运行缺省按 explicit 兼容。origin/mixed 只能诊断或作历史基线。候选与历史回归证据读取冻结考卷，不回退当前集。

- [ ] **Step 5: 运行上述服务端套件确认 GREEN**

Run: `npx vitest run --testTimeout=30000 custom/server/eval custom/server/harness/workbench`
Expected: 全部 PASS。既有失败须单独记录并复现检查。

- [ ] **Step 6: 提交 Task 2**

```bash
git add custom/server/eval custom/server/harness/workbench
git commit -m "feat(eval): 区分来源复现与新鲜修复证据"
```

### Task 3: IDE 与 Eval 客户端接线

**Files:**
- Modify: `custom/server/controllers/hermes/trace.ts`
- Modify: `custom/client/ide/components/IdeTrajectoryPane.vue`
- Create: `custom/client/eval/components/TraceCaseComposer.vue`
- Modify: `custom/client/eval/api.ts`
- Modify: `custom/client/eval/views/EvalView.vue`
- Modify: `custom/client/eval/components/EvalReportPanel.vue`
- Modify: `custom/client/eval/components/EvidenceDrawer.vue`
- Modify: `custom/client/eval/i18n.ts`
- Test: `custom/client/eval/__tests__/trace-case-composer.test.ts`
- Test: `custom/client/eval/__tests__/eval-view-origin.test.ts`
- Test: `custom/client/ide/__tests__/trajectory-pane.test.ts`

**Interfaces:**
- Consumes: Task 1/2 的 REST、DTO 和证据模式。
- Produces: session/span 转题入口、人工任务 composer、origin 复判按钮和诊断限制呈现。

- [ ] **Step 1: 写客户端与轨迹图失败测试**

覆盖 composer 预览与必填、hash 冲突、重复转题、成功跳转。IDE session/span ref。无 ref/OTel 不可用。origin 请求、sealed 禁用和诊断不得误触 verify。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx vitest run --testTimeout=30000 custom/client/eval/__tests__/trace-case-composer.test.ts custom/client/eval/__tests__/eval-view-origin.test.ts custom/client/ide/__tests__/trajectory-pane.test.ts`
Expected: 因组件、DTO 与节点 ref 尚不存在而失败。

- [ ] **Step 3: 实现结构化节点 ref 与客户端旅程**

IDE 只提供入口。composer 负责人工定义与隐私提示。EvalView 不自动发起收费判分。报告中明确 origin/mixed 的诊断边界。中英文文案同步。

- [ ] **Step 4: 运行客户端与轨迹图测试确认 GREEN**

Run: `npx vitest run --testTimeout=30000 custom/client/eval custom/client/ide custom/server/controllers/hermes/__tests__/trace-graph.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交 Task 3**

```bash
git add custom/client custom/server/controllers/hermes
git commit -m "feat(ide): 串联生产失败转回归旅程"
```

### Task 4: 全量验证、评审与收口

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-10-21-swarmstudio-complete-design.md`

**Interfaces:**
- Consumes: Tasks 1–3 的全部产物。
- Produces: 可审查分支、验证记录和更新后的落地/挂账状态。

- [ ] **Step 1: 运行类型检查和上述域回归**

把新增服务端文件加入 `typecheck:harness` 清单，运行上述 eval、secaudit、reviewgov、workbench、IDE 与客户端套件。

- [ ] **Step 2: 运行全量测试和构建**

Run: `npm run typecheck:harness && npm test -- --testTimeout=30000 && npm run build`
Expected: 全部成功。任何既有红项如实记录并归因。

- [ ] **Step 3: 浏览器热更新走查**

验证 session/span 转题、重复提交、hash 冲突、origin 复现、fresh 复评关闭和诊断不可晋级。不默认装机，不抢其他会话端口。

- [ ] **Step 4: 独立整分支评审并修复重要发现**

Critical/Important 发现必须先补失败测试再修复，随后重跑上述与全量套件。Minor 如实挂账。

- [ ] **Step 5: 更新设计正本并合入 main**

记录本轮已落地与 OTel、OS 沙箱、通用代码仓审计挂账。按 worktree-flow 合并，清理只走 `git worktree remove/prune`。
