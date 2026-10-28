# run23 前置红项根治批：审计器 R8 悬空引用 + run-gates 单仓解析

日期：2026-10-28 ｜ 分支：fix/sim-gates-audit-run23-redfixes ｜ 关联：run23 prelaunch ①⑧ 两红的根因修复

## 变更

- `simharness/mux/mx-report-audit.py`：R8 的 `_uniq` 原引用从未定义的 `_iss`（融合批六 ac836f5c9 瘦身预解析时删掉赋值、消费点漏改，出厂即带、审计含「问题单终态」的报告必 NameError）。修法：`_iss_lines` 提升为 R8 之前单源定义，R8/A3a/A3b 共用同一次解析与同一唯一键口径（kind·key），A3a 段内重复定义删除。
- `simharness/mux/mx-report-audit.py` R5 时代分支：快照缺席对「配对单源能力上线（融合批六 2026-10-27）前收尾的轮次」降级 WARN 如实标注（处置核验以当轮收尾审计记录为准，不追溯补造）；其后新轮缺席照旧 FAIL。
- `simharness/tests/run-gates.sh`：vitest 回落段裸 `cd "$MX_OVERLAY_ROOT"` 在单仓布局下解析为空、`set -e` 下静默退 1（sh 段全过、vitest 段零输出）。修法：回落解析序对齐 harness-gate-integrity.test.ts 同源序（env ＞ 仓根 patches/+runtime 认定 ＞ 旧 overlay 位），解析成功直接 exec 该树 vitest，失败大声报错退出。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | R8 唯一键口径取 A3a 同款 kind·key，不另立 | 「唯一键」在报告/R8/A3a 三处同词同义；另立口径=计数三源分裂（融合批单源化方向的延续）。 |
| D2 | run-gates 回落直接 exec 目标树 vitest，不再 cd+NODE_PATH+npx | 二进制存在性先验（-x），杜绝 cd 空串静默死；--root 已锚定 harness 根，无需改 cwd。 |
| D3 | simharness/node_modules 缺席以 `npm install` 恢复本地自持（环境态，不入批） | run-gates 头注立法「本地自持优先」；devDeps 本就含 vitest/playwright，装机即恢复设计态。 |
| D4 | R5 时代锚取 RUN_ID 日期前缀（<20261027 降级 WARN），不做产物级时代锚 | harness 快照实查无 commit 字段（baseline/summary.json 只有 generatedAt/runId/studio/endpoints/summary），产物锚不可得；RUN_ID 命名法（YYYYMMDD-v8-runNN）立法使日期前缀确定可审计。新轮缺席照旧 FAIL，链断裂检测强度不降；拒绝追溯补造快照（造假红线）。 |

## 验证

- `python3 -m py_compile mux/mx-report-audit.py` 过；`bash -n tests/run-gates.sh` 过。
- 活体：`python3 mux/mx-report-audit.py --run 20261021-v8-run22` 由 NameError 崩溃恢复为正常出结（四查全过）。
- 活体：`bash tests/run-gates.sh` 全量（sh 聚合+vitest）rc=0 全绿（本仓 worktree 无本地 node_modules，即此跑活体验证了回落分支：仓根解析→exec 仓根 vitest，14 文件/217 测试全过；主路径本地分支由 prelaunch ① 主树实测承载）。
- 回落解析两分支：构造无 patches/ 的伪 HERE 走到「大声报错退 1」分支实测；仓根分支以 -x 存在性静态走查+主路径间接覆盖（worktree 无本地 node_modules 时解析到仓根的分支形态已由 exec 路径同一代码承载）。

## 设计文档影响

DESIGN_SYNC: none —— 审计器内部变量单源化与守门入口解析修复，不触及整合正本/数字总账；run22 复盘「审计器崩溃零容忍」判据由本批延续执行。
