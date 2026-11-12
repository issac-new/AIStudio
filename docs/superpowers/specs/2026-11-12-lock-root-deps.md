# 2026-11-12 overlay 依赖 lock 根清单补齐（依赖错位根治）

> 决策事实源。来源：复盘 P1-9 前置——CI 依赖链修正批（`d366ca9fc`）定谳的根因链收口。
> 病：patch 017/136 等向 vendor package.json 注入 overlay 依赖，patch 687/573/576 也维护
> lock 的 node_modules 条目，但**没人把 overlay 依赖写进 lock 的根依赖清单**
> （`packages[""].dependencies`）——`npm ci` 按这份清单对账，对不上就静默跳过
> （fresh 克隆 903 包缺 matrix-js-sdk/cron-parser，TS2307×8 实证；主检出长期无感是因为
> README 恰好用「先注入后 npm install」且历史上手动 install 会顺手改 lock）。

## 变更

1. **新增 patch 768**（`patches/768-package-lock-root-deps.patch`，24 行双 hunk）：把注入态
   manifest 声明而 pristine 没有的 8 个依赖写进 lock 根清单——dependencies 7 项
   （cron-parser/echarts/lunar-typescript/matrix-js-sdk/pg/proper-lockfile/three）＋
   devDependencies 1 项（chromium-bidi）。文本级插入，不重排任何既有键序（JSON 对象序
   语义自由，npm ci 只看内容）。series 尾追加。
2. 不动 vendor 基线文件、不动 687（其 node_modules 条目仍需要）、不折补丁族
   （017×4 重复键与 103 的叠区压实仍留 P1-9 主批——今天验证过单独去重 017 会打断 103
   上下文）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 补根清单 hunk 而非整树重生成 lock | `npm install` 重生成会引入全量 churn＋镜像源 resolved 改写（仓内记忆有实录）；24 行补丁把 lock 从「部分正确」变「与注入态 manifest 对账一致」，改动面最小且可逆 |
| D2 | 走 patch 通道而非 VENDOR_SYNC 改基线 lock | lock 的 overlay 面本就由 patch 族维护（687/573/576 先例）；根清单是同一族的自然成员，走同一通道保持「基线 pristine＋overlay 皆补丁」的架构不变 |
| D3 | CI 工作流本批不动（保持 npm install） | install 与 ci 现在都正确；切回 ci 是行为收紧，留 CI 平台差批一起做，避免与该批的 workflow 改动（ffmpeg 步）撞行 |
| D4 | 补丁族压实（017/103/136 等 10 件收敛为 1 件）仍留 P1-9 | 根治已达成（ci 可用）；折族是补丁卫生问题，收益在升级重放面，独立立项 |

## 验证

- worktree clean+inject 全链重放：`768 applied`、`RESULT status=complete`（series 462 件全过）。
- **fresh 克隆端到端**：clone → 注入 → `npm ci`（**added 942 packages，matrix-js-sdk/cron-parser
  在位**——修复前同链 903 包缺二件）→ 注入②补软链 → `npm run typecheck:harness` rc=0。
- `npx vitest run scripts/__tests__/overlay-pristine-replay.test.ts`：提交后跑（自引用守门，
  预期双用例绿——768 对 pristine 干净适用）。
- `npx vitest run scripts/__tests__/inject-clean-v2.test.ts scripts/__tests__/inject-check.test.ts`
  ＋全量 `npm test`（后台，Tests 行随批报告）。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本未改。本批补的是注入管线的 lock 维护缺口（补丁族既有职责的自然补全），
不改变「vendor pristine＋构建期注入」的架构事实与任何契约。
