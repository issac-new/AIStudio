# 驾驶舱技术债清理 · 批次 0：测试基建修复

**日期**：2026-06-22
**状态**：待评审
**适用范围**：`overlay/`（仅新增 `overlay/vitest.config.ts`，不触碰 upstream）
**前置文档**：
- `docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md`（15 项差距清单）
- `docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（驾驶舱设计）

---

## 1. 背景：整体批次分解

"修复智能驾驶舱所有技术债"范围过大，需分解为可独立交付的子项目。按依赖关系排成 6 个批次：

| 批次 | 内容 | 规模 | 阻塞关系 |
|------|------|------|----------|
| **批次 0：测试基建（本文档）** | 修复 `@/custom` alias 解析，让 13 个 cockpit 测试可执行，建立 `npm test` 验证基线 | 小 | **所有后续批次的前置依赖** |
| 批次 1：代码质量债 | store 491 行按 P2/P3/P4/P5/P6 拆分；CockpitView 100+ 行硬编码种子数据抽离到 fixtures；联动方法收敛 | 中 | 依赖批次 0 |
| 批次 2：🟠 联动断裂（4 项） | #9 图→时序、#10 时序→右栏、#11 注意力→右栏、#12 归档只读态 | 中 | 依赖批次 0 |
| 批次 3：🔴 严重缺失（4 项） | #1 顶栏日程/时钟、#2 diff 块、#3 评估打分、#4 空间-组织双视图 | 大 | 依赖批次 0 |
| 批次 4：🟡 视觉走样（4 项） | #5 注意力条、#6 右栏重心、#7 折叠竖条、#8 协作图画布 | 中 | 依赖批次 0 |
| 批次 5：🟢 小差异（3 项） | #13–#15 收尾打磨 | 小 | 依赖批次 0 |

每批是一个独立的 spec → plan → implementation 循环。**本 spec 只覆盖批次 0**。

## 2. 问题根因（已诊断）

### 现象

在 overlay 目录执行 `npm test`（= `vitest run`），13 个 cockpit 测试文件**全部失败**，且失败发生在模块收集阶段（transform/import-analysis），**零断言执行**：

```
Error: Failed to resolve import "@/custom/cockpit/store/cockpit"
       from "custom/client/cockpit/__tests__/cockpit-store.test.ts"

Test Files  13 failed (13)
Tests       no tests
```

### 根因链

1. `overlay/package.json` 的 `scripts.test` = `vitest run`。
2. vitest 启动时按当前工作目录（overlay）查找 config；overlay 目录**没有** `vitest.config.ts`。
3. vitest 向上回溯，最终加载了 `upstream/hermes-studio/vitest.config.ts`。
4. upstream 的 vitest config 只配了 `@` → `packages/client/src` 一条 alias，**没有** `@/custom` / `@custom`（已 grep 验证：`grep -c "@/custom" upstream/.../vitest.config.ts` = 0）。
5. 测试文件里 `import { useCockpitStore } from '@/custom/cockpit/store/cockpit'` 无法解析 → 收集阶段即失败。

### 为什么 `000-vitest-custom-alias.patch` 没救？

`overlay/patches/series` 里确实列了 `000-vitest-custom-alias.patch`，它本应在 `npm run inject` 时把 `@/custom` alias 写进 upstream 的 `vitest.config.ts`。但：

- upstream 的 `vitest.config.ts` 当前是**干净的**（无 `@/custom`），说明 inject 流程没把它应用上去（可能从未成功 apply，或被某次 `--clean` 还原后未重新 inject）。
- 即便修好这个 patch，测试仍然**依赖 inject 是否跑过**——这是脆弱设计：开发者改完代码想跑测试，还得先 inject，否则一片红。

### 结论

overlay 作为自包含二次开发层，测试配置应由 overlay 自己掌控，而非依赖一个易碎的 patch + inject 流程。批次 0 的核心动作是给 overlay 一个自有的测试 config。

## 3. 目标与非目标

### 成功标准

1. `cd overlay && npm test` 直接可用，**不依赖** `npm run inject` 是否执行过。
2. 13 个 cockpit 测试文件全部被 vitest 收集并执行（产出真实的 pass/fail 计数，不再是 "no tests"）。
3. alias 与构建期 `vite.config.overlay.ts` 单一逻辑来源，避免两处漂移。
4. 不引入对 upstream 文件的任何修改（遵守 AGENTS.md）。

### 明确的非目标

- **不**保证所有断言通过。若测试执行后暴露出真实断言失败（区别于当前的 import 解析失败），那是真实代码债，归入后续批次（批次 1+）处理。批次 0 的验收边界是"测试能跑"，不是"测试全绿"。
- **不**修改 `000-vitest-custom-alias.patch`。该 patch 属 inject 流程一致性范畴，留作独立小任务，不混入本批次。
- **不**修改任何 cockpit 组件、store、测试文件代码。本批次只动测试基建。
- **不**改动 `overlay/package.json` 的 `scripts.test`（保持 `vitest run`，vitest 会自动发现新建的 config）。

## 4. 设计

### 4.1 新增 `overlay/vitest.config.ts`

作为 overlay 测试的权威配置。内容要点：

```ts
// overlay/vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const upstreamClientSrc = resolve(__dirname, '../upstream/hermes-studio/packages/client/src')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // ⚠️ 与 vite.config.overlay.ts 的 alias 保持同步（构建期权威 = 测试期权威）
    alias: [
      { find: '@/custom', replacement: resolve(__dirname, 'custom/client') },
      { find: '@custom', replacement: resolve(__dirname, 'custom/client') },
      // @ 兜底指向上游 client src（@/api、@/views 等解析到上游）
      { find: '@', replacement: upstreamClientSrc },
    ],
  },
  test: {
    include: ['custom/**/*.test.ts'],
    // environment 由各测试文件头部的 // @vitest-environment jsdom 指令按需指定，
    // config 层不强制全局 environment（store 测试无需 DOM）。
  },
})
```

### 4.2 设计决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| config 位置 | `overlay/vitest.config.ts` | overlay 是自包含二次开发层；测试从 overlay 目录跑（已确认），config 理应在此 |
| alias 形式 | 数组（`{find, replacement}`） | 与 `vite.config.overlay.ts` 一致；数组按声明顺序匹配，确保 `@/custom` 在 `@` 兜底前命中 |
| alias 是否抽共享模块 | 否，内联两份 | 构建与测试 config 的 alias 形式/用途不同；4 行重复 + 同步注释 < 抽模块的认知成本；两文件均在 overlay 内、git 跟踪、可见 |
| `test.include` | `['custom/**/*.test.ts']` | overlay 目前仅 custom 下有测试；不碰 upstream 的 `tests/**`，避免混跑 |
| 全局 environment | 不设 | 现有测试已用文件级 `// @vitest-environment jsdom` 指令；store 测试无需 DOM，全局设 jsdom 反增开销 |
| setupFiles | 不设 | cockpit 测试自行 `createPinia`，无共享 setup 需求 |
| 是否改 test 脚本 | 否 | `vitest run` 会自动发现 overlay 目录下的 `vitest.config.ts`，无需指定 `--config` |

### 4.3 与构建 config 的关系

```
overlay/vitest.config.ts       ← 新增（测试权威来源）
overlay/vite.config.overlay.ts ← 现有（构建权威来源，由 inject.mjs 生成，已 gitignore）
```

两者平行，各管一域。alias 定义在两处内联，靠注释 `⚠️ 与 vite.config.overlay.ts 保持同步` 约束一致性。这是有意的重复——单一逻辑来源的代价（共享模块）高于两处 4 行重复的维护成本。

## 5. 验证

实现后依次执行并记录输出：

1. **核心验收**：`cd overlay && npm test`
   - 期望：13 个文件被 collect，产出真实 Tests 计数（pass + fail，而非 "no tests"）。
   - 若有断言失败：记录失败清单，标注"属后续批次"，本批次不修。
2. **不依赖 inject**：在未执行 `npm run inject` 的状态下（upstream vitest.config.ts 保持干净）重复步骤 1，结果应一致。
3. **不污染 upstream**：`npm run verify`（可选）确认 upstream 工作树未被改动。

## 6. 风险与回退

| 风险 | 应对 |
|------|------|
| jsdom 下部分组件测试因缺 `vue-router` / `vue-i18n` mock 而失败 | 记录但不修——批次 0 验收边界是"import 解析通过、测试执行"，断言失败归后续批次 |
| `@` 兜底 alias 把测试导向解析上游组件，触发意外副作用 | `test.include` 已限定 `custom/**`，不跑上游测试；若个别 cockpit 组件 import 上游符号导致失败，记录留待后续批次 |
| alias 与构建 config 漂移 | 同步注释约束；两文件均在 overlay 内、改动可见；后续若 alias 增多可再评估抽共享模块 |

**回退**：删除 `overlay/vitest.config.ts` 即完全恢复原状，零副作用（不触碰任何现有文件）。

## 7. 开放问题

无。所有关键决策（方案 A、范围只含测试基建、从 overlay 目录跑）已在 brainstorming 阶段与用户确认。
