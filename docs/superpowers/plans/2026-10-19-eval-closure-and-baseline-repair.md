# Eval 收口与测试基线修复实施计划（2026-10-19）

**Goal:** 让评测失败样本可建处置单、按冻结考卷复评、按复评结果机械关闭；同时修掉 8 个基线失败与无证据误判。

**Architecture:** 在现有 Eval JSON store 中追加不可变版本快照与处置单集合；运行器接受版本与指纹约束；控制器新增复评、处置、版本读取端点；客户端报告面板补处置交互。基线修复各自独立，先落地。

**Tech Stack:** TypeScript、Koa Router、Vue 3、Vitest、Node fs。

**Spec:** `docs/superpowers/specs/2026-10-19-eval-closure-and-baseline-repair.md`

## Global Constraints

- 只改 overlay；不直接改 upstream。zcode 缺失文件通过 `scripts/ensure-injected.mjs` 的补丁通道恢复。
- 单一事实源：处置状态、版本号、密封响应只定义一处。
- 失败语义：源缺席返回 `unknown`/`null`，不猜。
- 测试隔离：临时目录、仓库内 fixture，不读宿主共享树。
- 提交信息中文、Conventional Commits。

## Review Focus

1. 密封集写端点是否仍泄露 `tasks`/`attempts`。
2. 无 transcript 时正则红线是否仍可能被判为 clean。
3. 改题后复评是否真的用旧题，而不是当前集。
4. 处置单是否可能在未复评或复评失败时被关闭。
5. RunSelector 是否在列表尚未加载时清空合法深链。

---

### Task 1: 基线失败三件

**Files:**
- Modify: `custom/client/ia2/views/sim/RunSelector.vue`
- Modify: `custom/server/incident/__tests__/incident-window.test.ts`
- Create: `custom/server/incident/__tests__/fixtures/run20-state.env`
- Create: `custom/server/incident/__tests__/fixtures/state-missing-started.env`
- Create: `scripts/lib/zcode-patch-manifest.mjs`
- Modify: `scripts/ensure-injected.mjs`
- Test: `custom/server/zcode/__tests__/zcode-patch-manifest.test.ts`

- [ ] RunSelector 只用本地 `fetchSettled` 判定「列表已权威为空」；`error` 非空不清 query。
- [ ] 事故窗口 fixture 入库，补畸形 state 与显式路径优先断言。
- [ ] 新增补丁新增文件解析器；`ensure-injected` 在 zcode 脏树时校验缺失文件并按文件补放。
- [ ] 跑三组测试，全绿；确认 `node-backend.js` 已恢复。

### Task 2: 版本快照与同卷复评

**Files:**
- Modify: `custom/server/eval/types.ts`、`store.ts`、`runner.ts`、`controller.ts`、`aggregate.ts`
- Test: `custom/server/eval/__tests__/eval-closure.test.ts`

- [ ] `EvalSetRevision`、`EvalRun.setRevision` 类型与 store 追加写入。
- [ ] 运行器解析冻结版本；指纹/版本不符拒绝。
- [ ] `POST /runs/:id/rerun`、版本读取端点、A/B 版本门。
- [ ] 测试：改题后复评用旧题；跨版本 A/B 拒绝；历史运行无版本时指纹不符拒绝。

### Task 3: 处置单与机械关闭

**Files:**
- Modify: `custom/server/eval/types.ts`、`store.ts`、`controller.ts`
- Test: `custom/server/eval/__tests__/eval-closure.test.ts`

- [ ] `RemediationRecord` 与 store 增删查。
- [ ] 建单幂等、密封拒绝、复评验证同集同版本、通过且无风险否决才 closed。
- [ ] 测试：复评失败保持 open；跨版本验证拒绝；无复评不能关闭。

### Task 4: 密封响应与空证据

**Files:**
- Modify: `custom/server/eval/controller.ts`、`judge.ts`
- Test: `custom/server/eval/__tests__/eval-closure.test.ts`、`eval.test.ts`

- [ ] 三个写端点对密封集回摘要。
- [ ] 正则空证据返回 unknown 并写理由。
- [ ] 测试：密封写响应无 tâches/attempts；空证据红线不 clean。

### Task 5: 客户端处置面板

**Files:**
- Modify: `custom/client/eval/api.ts`、`components/EvalReportPanel.vue`、`i18n.ts`
- Test: `custom/client/eval/__tests__/eval-report-closure.test.ts`

- [ ] API 类型与调用。
- [ ] 报告面板：建处置单、处置状态、同卷复评表单、复评后验证。
- [ ] 组件测试：建单与复评调用顺序、失败态如实展示。

### Task 6: 全量验证与收口

- [ ] 目标测试、全量测试、类型检查、构建。
- [ ] 浏览器走查处置闭环。
- [ ] 合入 main、推送、清理 worktree。
