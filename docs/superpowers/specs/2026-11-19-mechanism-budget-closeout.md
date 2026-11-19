# 机制预算收口：去掉 modelcap-build 薄壳

> 日期：2026-11-19
> 状态：实施中（用户指令「继续 完成所有」）
> 关联：`2026-11-19-scheduling-intelligence-wiring.md`（矩阵生产者）
> 读者：需要跑能力矩阵生产、或维护机制预算的运维

## 变更

调度智能批新增 `scripts/maintenance/modelcap-build.mjs` 薄壳后，`node scripts/governance-lint.mjs --budget` 报 `scripts=139 > 138`。按仓规「新增门/钩子/脚本必须配对删除或降级」，本批不抬高预算，改为删除薄壳：

- 删除 `scripts/maintenance/modelcap-build.mjs`（vite-node 薄壳）。
- 保留 `scripts/maintenance/modelcap-build-cli.ts`（TS 主体，不计入 `.mjs` 预算口径）。
- 修订 `2026-11-19-scheduling-intelligence-wiring.md` 的入口说明。
- 运行方式改为：
  `node node_modules/vite-node/vite-node.mjs scripts/maintenance/modelcap-build-cli.ts [--write] [--min-samples 5] [--days 30]`

### 验收判据

1. `node scripts/governance-lint.mjs --budget` 不再报 `scripts` 超限。
2. CLI 主体仍可 dry-run 输出 observations/rejected/cells 摘要。
3. 既有矩阵投影测试保持绿。

## 任务卡

### 完成条件

机制预算回到 138 以内；矩阵生产者仍可用。

### 输入与来源

`scripts/maintenance/modelcap-build-cli.ts`；`eval/store.json`；`modelcap/matrix.ts`。

### 工作流边界

只删薄壳与改文档，不改聚合逻辑、不改 runtime。

### 工具与副作用

直接经 vite-node 跑 TS；默认 dry-run，`--write` 才写 matrix.json。

### 结果与证据

`governance-lint --budget` 输出 scripts 计数 ≤138；CLI 输出 JSON 摘要。

### 异常与恢复

vite-node 缺失 → 用 `npx vite-node` 或先装依赖；eval store 缺失 → `listRuns()` 为空，输出 0 observations。

### 验收反例

薄壳删了但 CLI 不可运行应失败；预算仍 139 应失败；dry-run 不应写 matrix.json。

## 决策记录

### D1 删薄壳而不是抬预算

预算上限是机制通胀的硬闸；一个一次性维护脚本不值得永久抬高上限。TS 主体保留，vite-node 是既有先例（`graph-migrate.mjs` 同样委托 vite-node），直接跑 TS 不损失能力。

### D2 修订已合入的 D spec

删薄壳改变了 D spec 的入口描述；用 `SPEC_REBIND=1` 显式重绑收据，避免文档与实现漂移。

## 验证

```sh
node scripts/governance-lint.mjs --budget
node node_modules/vite-node/vite-node.mjs scripts/maintenance/modelcap-build-cli.ts
npx vitest run custom/server/modelcap/__tests__/from-eval.test.ts
```

结果：预算 scripts=138（不再超限）；CLI dry-run 输出摘要；from-eval 5 例绿。

## 设计文档影响

DESIGN_SYNC: none

理由：只删一个薄壳并修订 spec 入口说明，不触及整合正本、数字总账或架构图。
