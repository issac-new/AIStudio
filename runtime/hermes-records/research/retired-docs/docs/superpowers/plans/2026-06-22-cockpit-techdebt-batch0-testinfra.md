# 驾驶舱技术债清理 · 批次 0：测试基建修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `cd overlay && npm test` 能收集并执行 13 个 cockpit 测试文件（不再因 `@/custom` alias 解析失败而零测试），为后续技术债批次建立可验证基线。

**Architecture:** 在 overlay 新建一份自包含的 `vitest.config.ts`，复刻构建期 `vite.config.overlay.ts` 的 alias 数组，使测试不再依赖 `npm run inject` 是否跑过。测试从 overlay 目录直接运行。

**Tech Stack:** vitest 3.2.4、@vitejs/plugin-vue 6.0.7、jsdom（均已通过 upstream `node_modules` 软链可用）、Vue 3 单文件组件、TypeScript。

**Spec:** `docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch0-testinfra-design.md`

---

## 前置准备

**分支（遵循 AGENTS.md）：** 在 overlay 仓库基于 main 建 feature 分支，所有提交落在此分支。

**工作目录约定：** 本计划所有 `cd overlay` 均指 `cd /Volumes/nvme2230/lab/ncwk/overlay`。计划中命令用相对 overlay 根的写法，实际执行时用绝对路径或确保在 overlay 目录下。

**关键边界（来自 spec §3 非目标）：**
- 不修改 `000-vitest-custom-alias.patch`
- 不修改任何 cockpit 组件 / store / 测试文件代码
- 不修改 upstream 任何文件
- 不改 `overlay/package.json` 的 `scripts.test`（保持 `vitest run`）
- 本计划**只新增** `overlay/vitest.config.ts` 一个文件 + 建分支时的初始基线确认

**当前已知失败基线（实现前必须复现）：**

```
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test
→ Test Files 13 failed (13), Tests no tests
→ Error: Failed to resolve import "@/custom/cockpit/..." 
```

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `overlay/vitest.config.ts` | **新建** | overlay 测试权威配置：声明 vue 插件、`@/custom`+`@` alias、include 范围。自包含，不依赖 inject。 |

**不改动清单（明确边界）：**
- `overlay/vite.config.overlay.ts`（构建期配置，inject 生成，已在 .gitignore）
- `overlay/patches/000-vitest-custom-alias.patch`（留作独立任务）
- `overlay/package.json`（test 脚本保持 `vitest run`）
- `overlay/custom/client/cockpit/**`（所有业务代码与测试）
- `upstream/**`（全部只读）

---

### Task 1: 建 feature 分支并复现失败基线

**Files:**
- 无文件改动，仅 git 操作 + 基线验证

- [ ] **Step 1: 确认 overlay 在 main 且工作树状态**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git status --short && git branch --show-current
```

Expected: 在 `main` 分支。工作树可能有与本次任务无关的未提交改动（如 matrix-chat 组件），这些**不属于本计划范围，不要碰**。如果工作树完全干净则更好。

- [ ] **Step 2: 基于 main 建 feature 分支**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git checkout -b fix/cockpit-techdebt-batch0-testinfra
```

Expected: 切到新分支 `fix/cockpit-techdebt-batch0-testinfra`。Step 1 中如存在的未提交改动会随分支带过来（无害，本计划不提交它们）。

- [ ] **Step 3: 复现失败基线（证明问题存在）**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -20
```

Expected: 失败，输出包含：
```
Error: Failed to resolve import "@/custom/cockpit/..."
 Test Files  13 failed (13)
      Tests  no tests
```

**记录**这行输出（贴入提交说明或保留终端记录），作为"修复前"证据。若输出与预期不符（例如测试竟然能跑），**停止**并与用户确认——说明环境已变化，本计划前提不成立。

- [ ] **Step 4: 确认 upstream vitest.config.ts 未被注入 alias（验证根因）**

Run:
```bash
grep -c "@/custom" /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/vitest.config.ts
```

Expected: `0`（upstream config 干净，`000` patch 未生效）。这证实了"测试依赖 inject 是脆弱设计"的根因。

- [ ] **Step 5: 此步不提交**（分支刚建，尚无新改动）

---

### Task 2: 新建 `overlay/vitest.config.ts`

**Files:**
- Create: `overlay/vitest.config.ts`

- [ ] **Step 1: 创建配置文件**

写入 `overlay/vitest.config.ts`，完整内容如下：

```ts
// overlay 测试权威配置。
// 与 vite.config.overlay.ts（构建期，inject 生成）平行，互不依赖：
//   - 构建 config 由 scripts/inject.mjs 派生，被 .gitignore 忽略
//   - 本文件手写、入库、随 overlay 仓库跟踪
// ⚠️ 若 alias 需调整，两处保持同步（见下方 alias 块注释）。
//
// 设计依据：docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch0-testinfra-design.md
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// overlay 根（本文件所在目录）。
const overlayRoot = __dirname
// 上游 client src：@ 兜底 alias 的目标（@/api、@/views 等解析到上游）。
const upstreamClientSrc = resolve(overlayRoot, '../upstream/hermes-studio/packages/client/src')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // ⚠️ 与 vite.config.overlay.ts 的 alias 数组保持同步。
    // 数组形式按声明顺序匹配——更具体的前缀（@/custom）必须在兜底（@）之前，
    // 否则 '@' 会先吃掉 '@/custom/...'（对象形式 alias 不保证顺序，故用数组）。
    alias: [
      { find: '@/custom', replacement: resolve(overlayRoot, 'custom/client') },
      { find: '@custom', replacement: resolve(overlayRoot, 'custom/client') },
      // @ 兜底指向上游 client src
      { find: '@', replacement: upstreamClientSrc },
    ],
  },
  test: {
    // 只跑 overlay 自己的测试，不混跑 upstream 的 tests/**。
    include: ['custom/**/*.test.ts'],
    // environment 由各测试文件头部的 // @vitest-environment jsdom 指令按需指定；
    // store 级测试无需 DOM，config 层不强制全局 environment 以减少开销。
  },
})
```

- [ ] **Step 2: 确认文件未被 .gitignore 忽略**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git check-ignore vitest.config.ts && echo "IGNORED!" || echo "tracked-able"
```

Expected: `tracked-able`（即未被忽略）。`.gitignore` 只忽略 `vite.config.overlay.ts`，不匹配 `vitest.config.ts`。若输出 `IGNORED!`，**停止**——检查 `.gitignore` 是否有误匹配（如通配 `vite*.ts`），修正 gitignore 规则后再继续，但不要删本计划新建的文件。

- [ ] **Step 3: 暂不运行测试**（下一任务统一验证），先做语法自检

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && node --experimental-strip-types -e "import('./vitest.config.ts').then(m => console.log('config loads OK:', !!m.default))" 2>&1 | tail -5
```

Expected: `config loads OK: true`。若报 TS 语法/路径错误，修正文件内容后重试。

- [ ] **Step 4: 提交**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add vitest.config.ts && git commit -m "test(cockpit): add overlay vitest config to resolve @/custom alias

Before: npm test loaded upstream hermes-studio/vitest.config.ts (which has
no @/custom alias), so all 13 cockpit test files failed at import-analysis
with zero tests collected.

After: overlay owns its own vitest config, mirroring the alias array from
vite.config.overlay.ts. Tests run self-contained from the overlay dir,
without depending on whether 'npm run inject' has been applied.

Batch 0 of cockpit tech-debt cleanup. Success criteria per spec:
tests get collected and executed (not necessarily all green — assertion
failures, if any, are real debt for later batches)."
```

Expected: 提交成功，新增一个 commit。`git log -1 --stat` 应显示只有 `vitest.config.ts` 一个文件。

---

### Task 3: 验证测试可执行（核心验收）

**Files:**
- 无文件改动，仅运行与记录

- [ ] **Step 1: 运行测试套件**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -40
```

Expected（**核心成功标准**）：
- 输出**不再**出现 `Failed to resolve import "@/custom/..."`
- `Test Files` 行显示文件被**收集**（collected），数量接近 13
- `Tests` 行有真实的 pass + fail 计数，**不再是 `no tests`**

可能的两种结果，都算 Task 3 通过：
- **(a) 全绿**：`Test Files X passed (X)` / `Tests Y passed (Y)` — 最理想。
- **(b) 有断言失败**：部分文件 fail，但失败原因是**断言不满足**或**组件运行时缺 mock**（如 vue-router/vue-i18n 未提供），而**不是** import 解析失败。这种情况符合 spec §3 非目标——记录失败清单，本批次不修。

**若仍出现 `Failed to resolve import`**：Task 3 失败，停止。回到 Task 2 检查 alias 数组顺序与路径（尤其 `@/custom` 是否排在 `@` 之前、`resolve(overlayRoot, 'custom/client')` 路径是否正确）。

- [ ] **Step 2: 记录测试结果摘要**

把 Step 1 的尾部输出（`Test Files ... / Tests ...` 那几行）记下来，供后续批次参考。若为结果 (b)，逐条记录失败测试名与失败原因分类：
- 类别 A：断言失败（真实代码债）→ 归批次 1+
- 类别 B：缺 vue-router/vue-i18n 等 mock（测试基建补全）→ 归批次 0 的后续小任务或独立任务
- 类别 C：其他

- [ ] **Step 3: 验证"不依赖 inject"**

确认在**未跑** `npm run inject` 的状态下测试仍能执行。检查 upstream vitest.config.ts 仍是干净的：

Run:
```bash
grep -c "@/custom" /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/vitest.config.ts
```

Expected: `0`（upstream 仍干净）。结合 Step 1 测试已能跑，证明 overlay 测试不再依赖 inject。若此处非 0，说明有人跑了 inject——本验证不成立，但 Step 1 的成功仍然有效（overlay config 是独立生效的）。

- [ ] **Step 4: 验证未污染 upstream 工作树**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio && git status --short vitest.config.ts vite.config.ts
```

Expected: 空输出（这两个文件本计划完全没碰）。若出现改动，说明误操作了 upstream——**停止**，用 `git checkout -- vitest.config.ts vite.config.ts` 还原。

- [ ] **Step 5: 此步不产生新提交**（Task 3 纯验证）

---

### Task 4: 记录批次 0 产出，准备移交下一批次

**Files:**
- 无代码改动；产出是一份结果记录，供后续批次参考

- [ ] **Step 1: 汇总批次 0 结果**

在提交说明或一个临时记录里写清：
1. 新增文件：`overlay/vitest.config.ts`
2. 测试基线：从 `13 failed / no tests` → `<Task 3 Step 1 的真实计数>`
3. 若有断言失败（结果 b）：列出失败测试清单与分类（A/B/C），作为批次 1+ 的输入

- [ ] **Step 2: 确认分支可合并状态**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git log --oneline main..HEAD && git diff --stat main..HEAD
```

Expected:
- `main..HEAD` 显示本批次新增的 commit（Task 2 Step 4 那个）
- `--stat` 显示只有 `vitest.config.ts` 一个文件被新增
- 不包含 Step 1 基线里那些与本任务无关的未提交改动（那些改动不在本分支的 commit 里，是工作树游离改动，合并时不带）

- [ ] **Step 3: 按 AGENTS.md 合入 main**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git checkout main && git merge fix/cockpit-techdebt-batch0-testinfra --no-ff -m "Merge fix/cockpit-techdebt-batch0-testinfra: overlay vitest config for @/custom alias resolution"
```

Expected: 合并成功，fast-forward 或 merge commit 产生。合并后 `main` 上 `npm test` 应同样可执行（可再跑一次 `npm test 2>&1 | tail -5` 确认）。

- [ ] **Step 4: 可选清理 feature 分支**

Run:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git branch -d fix/cockpit-techdebt-batch0-testinfra
```

Expected: 分支删除成功（已合并）。

---

## Self-Review

**1. Spec 覆盖检查：**

| Spec 要求 | 对应 Task |
|-----------|----------|
| §3 成功标准 1：`cd overlay && npm test` 不依赖 inject | Task 3 Step 1 + Step 3 |
| §3 成功标准 2：13 个测试被收集执行 | Task 3 Step 1 |
| §3 成功标准 3：alias 与构建 config 单一逻辑来源（同步注释约束） | Task 2 Step 1 文件内容含 `⚠️ 与 vite.config.overlay.ts 保持同步` 注释 |
| §3 成功标准 4：不修改 upstream | Task 3 Step 4 验证 |
| §3 非目标：不保证全绿、断言失败归后续 | Task 3 Step 1 结果 (b) 分支 + Step 2 分类记录 |
| §3 非目标：不改 `000` patch | 全计划无该文件改动（文件结构清单已声明） |
| §3 非目标：不改 cockpit 业务/测试代码 | 全计划无 `custom/**` 改动 |
| §3 非目标：不改 package.json scripts.test | 全计划无该改动 |
| §4.1 config 内容要点（vue 插件、3 条 alias、include） | Task 2 Step 1 完整代码 |
| §6 回退（删文件即复原） | 分支模型天然支持；Task 4 合并后文件即正式入库 |
| AGENTS.md：overlay 内基于 main 建 feature 分支，完成后合 main | Task 1 Step 2 建分支、Task 4 Step 3 合并 |

无 spec 要求遗漏。

**2. 占位符扫描：** 无 TBD/TODO/「类似 Task N」/「适当处理」等占位语。每个 code step 都有完整代码。每个验证 step 都有确切命令与期望输出，包括失败分支的处理（Task 3 Step 1 明确「仍出现 resolve 失败」时的回退动作）。

**3. 类型一致性：** 本计划仅涉及一个配置文件，无跨 task 的类型/方法命名。alias 的 `find`/`replacement` 键名与 vitest/vite 官方数组 alias 形式一致，与现有 `vite.config.overlay.ts:21-32` 同构。

**4. 额外稳健性检查：**
- Task 2 Step 2 显式校验文件未被 gitignore（防 `.gitignore` 误匹配 `vite*.ts` 导致文件丢失）。
- Task 2 Step 3 在跑测试前先做 config 加载自检，把"config 语法错"和"测试失败"两类问题分离。
- Task 3 Step 4 显式验证 upstream 未被污染，守住 AGENTS.md 红线。
- 明确"本计划只新增 1 个文件"，降低 reviewer 认知负担。

---

## 执行移交

Plan complete and saved to `docs/superpowers/plans/2026-06-22-cockpit-techdebt-batch0-testinfra.md`.

两种执行方式：

1. **Subagent-Driven（推荐）**：每个 Task 派发独立 subagent，任务间评审，迭代快。
2. **Inline Execution**：在当前会话用 executing-plans 批量执行，带检查点。

选哪种？
