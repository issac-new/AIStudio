# 技术组件台账最新版与兼容升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将技术组件台账刷新到 2026-11-23 实测状态，把 Studio 升到最新稳定 v0.8.30，并修复 Ycode 宿主 RPC 与当前公开源码的兼容漂移。

**Architecture:** 采用仓库既有 pristine vendor + ordered patches 模型。Studio、Ycode 宿主复制面和台账分别实施，共用一次全量验证与独立审查；公开源码版本、安装版快照版本和本机工具版本分账记录。

**Tech Stack:** TypeScript、Koa、Vue 3、Node.js、Vitest、git vendor-sync/inject、GitHub CLI、npm/PyPI 查询。

**Spec:** `docs/superpowers/specs/2026-11-23-tech-ledger-latest-compat.md`

## Global Constraints

- 所有写入限定在 `.claude/worktrees/ledger-v0830-compat`；vendor  pristine 提交必须显式使用 `VENDOR_SYNC=1`，且基线在 inject 前 stage。
- Studio 目标为 `8a51d1bcfbc4de72f7f578b7876ee9b881c9110b` / v0.8.30；hermes-agent 保持 v0.23.3；Ycode 公开源码保持 3.18.2 / `fec97590`，不得伪标 3.19.1。
- RPC 相对 import 继续省略 `.js` 扩展名；普通闭包文件的预期内容为“上游原文→仅移除相对 import 的 `.js`→添加逐文件规定的精确 X3 头注”，不得使用全文件豁免；`index.ts` 因有意收窄导出，单独断言导出面和 pin。
- 不全局升级 REA/DSH，不修改宿主 runtime 热修目录，不发布、不推送，不自动吸收新增 🔴🟡 调研线。
- 测试失败、环境限制和未执行步骤必须写入交付说明。

## Review Focus

- vendor 注入内容混入 pristine：Task 1 以 staged blob 与 upstream archive 对账防止。
- 补丁“应用成功”但语义丢段：Task 1 对重锚补丁做前后内容并集检查，Task 4 由 pristine replay 和独立审查复核。
- RPC 归一化把真实协议差异也吞掉：Task 2 只允许确定的 import 后缀变化与逐文件精确 X3 头注，其他字节必须一致；`index.ts` 独立验导出面，并保留行为测试。
- 3.19.1 安装版被误写为 Ycode 源码版：Task 3 由 `verify-release-manifest` 三方锚和台账文字共同防守。
- 台账行数、判级和证据不一致：Task 3 机械展开所有表格行并核对汇总，缺失查询标“未核实”，不猜数。

---

### Task 1: Studio v0.8.30 pristine 基线与补丁兼容

**Files:**
- Modify: `vendor/hermes-studio/**`（仅 pristine）
- Modify: `patches/*`、`patches/series`（仅实际失配或退役件）
- Modify: `vendor/VENDOR.md`
- Test: `scripts/__tests__/overlay-pristine-replay.test.ts`

**Interfaces:**
- Consumes: `upstream/hermes-studio` 的 v0.8.30 tag 与现有 `patches/series`。
- Produces: 可从干净 HEAD 重放的 Studio v0.8.30 基线和完整 manifest。

- [ ] **Step 1: 固定来源并替换 pristine 基线**
  在 `upstream/hermes-studio` checkout `v0.8.30^{}`，运行 `npm run vendor:sync -- hermes-studio`；在任何 inject 前 `git add vendor/hermes-studio`，用上游 `git diff --stat` 与 staged 文件面对账。
- [ ] **Step 2: 全量重放并建立失败清单**
  运行 `npm run clean && npm run inject`，保存每条 failed patch、目标文件和根失败原因；不得把交集数量当作冲突数量。
- [ ] **Step 3: 逐件适配并重放**
  上游已吸收者退役到 `.archived-patches/2026-11-23-v0830/`；仍需保留的 fork 语义按 pristine→修好注入态重建补丁。每轮只依据真实失败迭代，最终从头 clean+inject 达到 complete。
- [ ] **Step 4: 验证 pristine 与重放**
  运行 `npx vitest run scripts/__tests__/overlay-pristine-replay.test.ts custom/__tests__/patches-series-guard.test.ts`；预期 2 类测试全绿，manifest 零 failed，第二次 inject 幂等。

### Task 2: Ycode 宿主 RPC 同步与有效守门

**Files:**
- Modify: `custom/server/zcode/vendor/rpc/*.ts`
- Modify: `custom/server/zcode/session-projection.ts`
- Test: `custom/server/__tests__/zcode-engine-bridge.test.ts`
- Test: `custom/server/__tests__/zcode-vendor-rpc-import-form.test.ts`
- Test: `custom/server/__tests__/zcode-session-projection.test.ts`

**Interfaces:**
- Consumes: `vendor/zcode/packages/rpc/src` @ `fec97590` 及宿主现有 `connectZCodeEngine`。
- Produces: 同一 pin 的 RPC import 闭包；归一化内容比较；错误透传与订阅清理回归测试。

- [ ] **Step 1: 先写失败测试**
  把全豁免改为确定性预期内容比较：完整闭包包含 `channels.shared.ts`、`channelServer.ts`、`delayedChannel.ts`；普通文件为“上游原文→仅移除相对 import 的 `.js`→添加逐文件精确 X3 头注”，`index.ts` 单独断言收窄导出与 pin。为 `retryable`、`profileId`、`EventError` 和 listener 清理添加行为断言。运行目标测试，确认旧复制面失败且失败原因是协议漂移。
- [ ] **Step 2: 同步最小 import 闭包**
  从当前公开基线复制实际使用文件，按既有 X3 规则只移除相对 import 的 `.js` 后缀并回放逐文件精确头注；更新 `index.ts` 与 `session-projection.ts` 的真实 pin，不引入未被宿主引用的 RPC 模块。
- [ ] **Step 3: 运行 RPC 与类型验证**
  运行上述三个 Vitest 文件和 `npm run typecheck:harness`，预期全绿；再跑 `npm run zcode:ensure` 与 `npm run catalog-check`，记录真实结果。

### Task 3: 全量技术组件台账与版本投影

**Files:**
- Modify: `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`
- Modify: `RELEASE-MANIFEST.json`、`RELEASE-NOTES.md`
- Modify: `README.md`、`AGENTS.md`、`docs/DESIGN.md`
- Modify: `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`
- Modify: `docs/manuals/*` 中当前版本载体及 `custom/__tests__/aistudio-complete-training-manual.test.ts` 版本断言
- Modify: `docs/manuals/aistudio-design-document-index.md`（生成器）
- Test: `scripts/__tests__/verify-release-manifest.test.ts`

**Interfaces:**
- Consumes: 当日 gh/npm/PyPI 实测结果和 Task 1/2 的真实终态。
- Produces: 单一终态台账、三方一致的版本锚和可复现验证命令。

- [ ] **Step 1: 更新分域行与判级**
  每条记录版本、精确差量、pushed_at、默认/集成分支和处置；RETIRED 只按复活证据调级。新 🔴🟡 标“待增量调研裁决”，不写成已吸收。
- [ ] **Step 2: 更新汇总、能力差异、欠账和验证锚**
  写入 2026-11-23 批注；保留历史批注，订正当前事实。分域行数与判级合计机械对账，所有数字能回溯到命令或既有当日报告。
- [ ] **Step 3: 同步版本投影并生成索引**
  运行 `node scripts/maintenance/gen-doc-indexes.mjs --write` 与 `npm run docs:sync`，只改当前载体，不批量替换历史记录；README 基线表和 `docs/DESIGN.md` 的当前值一并从旧口径对齐。驾驶舱进位为 `0.8.30-studio.1`，在 `RELEASE-NOTES.md` 增加当前版本节并同步培训测试断言。
- [ ] **Step 4: 验证版本与文档**
  运行 `npm run release:check` 和相关手册/设计测试；预期 Ycode 仍为 3.18.2 / `fec97590`，Studio 为 v0.8.30 / `8a51d1bcf`，活跃补丁数与 series 一致。

### Task 4: 全量回归、独立审查与收口

**Files:**
- Modify: `docs/superpowers/specs/2026-11-23-tech-ledger-latest-compat.md`（回填实测）
- Modify: 审查发现涉及的具体文件

**Interfaces:**
- Consumes: Task 1–3 的完整工作树。
- Produces: 可审查、可合并的一批改动及明确未验证清单。

- [ ] **Step 1: 运行受影响目标测试与全量测试**
  先跑目标测试，再运行 `npm test`；记录 passed/skipped/failed。若涉及 UI 行为变化，使用隔离 HOME/DB 启动前后端并做实物走查，否则明确未做及理由。
- [ ] **Step 2: 独立审查并修复**
  审查 pristine、补丁语义并集、RPC 归一化、台账证据和版本投影；P0/P1 必须修复并复审，P2 记录处置，不得把未运行写成零发现。
- [ ] **Step 3: 回填 spec、提交与合并**
  所有验证以真实输出回填；按仓规运行目标测试和合并前全量测试后提交。fetch 后在 worktree rebase `origin/main`，最终由本属主会话 `--no-ff` 合并；推送和 worktree 清理只在合并成功后执行。
