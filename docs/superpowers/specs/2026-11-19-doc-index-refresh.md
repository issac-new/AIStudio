# 设计文档索引刷新：收编 2026-11-19 六份新 spec

> 日期：2026-11-19
> 状态：实施中（用户指令「完成未做」）
> 关联：`2026-11-19-delivery-truth-acceptance.md`、`2026-11-19-skill-call-authorization.md`、`2026-11-19-delivery-version-binding.md`、`2026-11-19-acp-harness-catalog.md`、`2026-11-19-scheduling-intelligence-wiring.md`、`2026-11-19-mechanism-budget-closeout.md`
> 读者：维护设计文档索引与守门测试的人

## 变更

2026-11-19 新增六份 spec 后，`custom/__tests__/docs-ssot-guard.test.ts` 与 `custom/__tests__/interactive-training-manual.test.ts` 报索引缺失与计数漂移（declared 709 / actual 715）。本批用生成器重写机械段：

- `node scripts/maintenance/gen-doc-indexes.mjs --write`
- 结果：`docs/manuals/aistudio-design-document-index.md` 收编全部 spec；本 spec 自身也纳入后计数为 716。

### 验收判据

1. `gen-doc-indexes --check` 0 problems。
2. `docs-ssot-guard.test.ts` 与 `interactive-training-manual.test.ts` 全绿。
3. 索引无重复条目、无幽灵条目、头计数与集合相等。

## 任务卡

### 完成条件

机械索引覆盖全部 specs 且计数自洽；两个文档守门测试绿。

### 输入与来源

`docs/superpowers/specs/*.md` 的集合；`docs/manuals/aistudio-design-document-index.md` 的机械段。

### 工作流边界

只改生成器产出的索引文件；不改任何 spec 正文、不改设计正本。

### 工具与副作用

生成器原子重写索引机械段；不触碰其他文档。

### 结果与证据

`gen-doc-indexes --check` 输出 actual=declared、0 problems。

### 异常与恢复

若新增 spec 后再次漂移，重跑 `--write` 并将索引随该 spec 同批提交。

### 验收反例

缺 spec 条目应失败；计数不等应失败；重复条目应失败；索引未随 spec 同批提交应被 L2 拦截。

## 决策记录

### D1 索引由生成器重写，不手工编辑

机械段是生成物；手工编辑会再次产生 554/101/96 式多套计数。生成器带集合等式与重复检查，失败信息直接给修复指引。

### D2 本批不新增机制

只刷新文档索引，不新增门/钩子/脚本/账本；无需机制预算登记。

## 验证

```sh
node scripts/maintenance/gen-doc-indexes.mjs --check
npx vitest run custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/interactive-training-manual.test.ts
```

结果：0 problems；29 passed。

## 设计文档影响

DESIGN_SYNC: none

理由：索引是生成的导航产物，不触及整合正本 `docs/DESIGN.md`、数字总账或架构图；本批只让索引与既有 specs 集合对齐。
