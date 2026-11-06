# 2026-11-06 inject 补丁目录 seam 恢复（cognition P0 重构回归修复）

## 变更

- `scripts/inject.mjs`：`patchDir`/`zcodePatchDir` 恢复 `OVERLAY_PATCH_DIR`/`OVERLAY_ZCODE_PATCH_DIR` env seam（P1 Task 5，24385a3b0 引入）；`patchSeriesFile`/`zcodeSeriesFile` 随之指向 seam 目录。
- `scripts/ensure-injected.mjs`：同源恢复双 env seam（patchDir/patchSeriesFile/zcodeSeriesFile/两处 zcodePatchDir）。

## 决策记录

- **回归来源**：cognition P0 批（0aee3bf55）在主树旧检出的工作区直改 `inject.mjs`（其 spec 决策 21 记载的方式），携带的基线早于平台批 24385a3b0，重构合并后 seam 读取被无意识删除——`git log -S OVERLAY_PATCH_DIR` 命中一加一删两提交为证。后果＝e2e 夹具测试的补丁面隔离失效，inject-clean-v2/inject-executor 族把真仓 `patches/001-schemas-matrix-columns.patch` 应用到夹具树报「No such file or directory」。
- **只回植 seam，不回植 v2 会话层**：24385a3b0 的 manifest v2 noop/增量分派＋executor 会话化执行（`managedTree` 跳过脏树门、`runInjection` 事务回滚）同样被 cognition 版剥落，但该手术涉及主链执行序重构，属平台域属主工作，本批不越权代修；v2 会话层测试的存量红随发版 spec 挂账披露。
- **脏树守卫与 v2 幂等冲突的定性**：cognition 版守卫在 manifest complete 的注入态树上仍拦（守卫前置且无 managedTree 旁路），与「幂等二连第二次 noop」设计冲突——同属 v2 会话层回植范围，一并挂账。

## 验证

- `node --check` 两文件过；seam 语义回归：`OVERLAY_PATCH_DIR` 夹具下 `inject-clean-v2` 的「001-schemas-matrix-columns 应用到夹具树」错误消失（败因从 seam 层推进到会话层断言）。
- 主链行为不变：缺省（无 env）时目录=仓内正本，`node scripts/ensure-injected.mjs` 判 noop、`npm run inject` 全量链正常（发布轮实测）。

## 设计文档影响

DESIGN_SYNC: none——seam 是 e2e 测试隔离接口的恢复，非新机制；不触及设计正本参数。
