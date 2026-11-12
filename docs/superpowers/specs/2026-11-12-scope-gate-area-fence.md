# 2026-11-12 scope 门重定义：作业区围栏＋可选 task-intent

> 决策事实源。来源：2026-11-12 全仓设计复盘 P0-3「scope 门改 task-intent 派生」。
> 现场病：`.qgate/scope.yaml` 4 周从 19 行长到 848 行、721 条（含 70 条 `**` 宽 glob），
> 「本次预期改动面」变成「历史触碰面并集」——范围门逐日变宽直至失效，且每批都要追加登记。

## 变更

### 1. `scope.yaml` 重定义为「作业区围栏」

- 条目从 721 条具体路径压到 34 条：17 个顶层目录 `**`＋17 个根文件白名单。
- 语义改写进文件头：围栏只挡「不该出现的路径」（临时文件/外部目录/机器态被误提交），
  不再声明「本批预期面」；批次级范围交给 task-intent。
- 删除全部累积路径（历史可从 git 追溯，不再承担判定职责）。

### 2. `L0.scope-check` 声明可选 task-intent

```yaml
taskIntent:
  file: ".qgate/registers/task-intent.json"
  require: false
```

登记了意图 → 判定取「围栏 ∩ 意图 scope」；未登记 → 只查围栏（不阻塞）。
`scope.ts` 现有逻辑已支持（缺文件 + require:false 时按围栏兜底并明示），本批不改执行器。

### 3. 新增守门 `custom/__tests__/qgate-repo-scope-fence.test.ts`

四条断言：条目 ≤60；条目只能是 `目录/**` 或根文件白名单（拒绝具体文件路径）；围栏必须覆盖
六大作业区；gate 配置保留可选 taskIntent 声明。这条测试就是「不许再长回清单」的棘轮。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 围栏化，而不是删掉 scope 门 | 删门会失去「不该出现的路径」这层最低防线；围栏成本近零且不随批次增长 |
| D2 | 批次范围改由 task-intent 可选收窄，不强制 | 强制会让每次 push 必须先登记意图＝新增固定税；可选登记在需要严格范围时启用（`qgate intent`） |
| D3 | 不自动清理旧条目「留作档案」 | 留着会让门在语义上继续按并集放行（实际等于没删）；历史在 git 与 spec 里可查 |
| D4 | 守门测试放 `custom/__tests__` 而非 qgate 包内 | 它守的是「本仓数据文件」而非 qgate 引擎行为；放仓级测试与 docs-ssot-guard 同层 |

## 验证

- `npx vitest run custom/__tests__/qgate-repo-scope-fence.test.ts`：4/4 过。
- `node custom/qgate/dist/cli.js run L0.scope-check --include-disabled --changed custom/__tests__/x.ts`
  （或构建后等价命令）：PASS，summary 含 `34 globs`。
- 负例（手工）：把 `custom/x.ts` 改成 `tmp/x.ts` 后门 FAIL 点名——围栏仍有效。
- `node scripts/merge-invariants.mjs --check`：docs-index pass（新 spec 已进机械索引）。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本未改。scope 门是 qgate 的 L0 执行面配置，不是 DESIGN_DOCS 中的机制定义；
本批把「数据文件语义」与「门配置」对齐，执行器代码零改动。
