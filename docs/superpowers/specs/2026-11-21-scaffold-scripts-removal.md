# 2026-11-21 脚手架脚本清理批

> 背景：用户指令「去除各种脚手架」。范围裁决（AskUserQuestion 未答、按最佳判断）：不动 simharness（上轮刚按指令修订保留＋域退役判据立法「设计期零消费方=规划储备」）、不动治理正身机制，清理 **scripts/maintenance 与 scripts/regression 中零活体消费者的一次性脚本**。

## 变更

1. **删除 68 个零活体脚本**（完整清单见提交 diff；类别：①一次性走查族 `*-walkthrough.mjs`/`walk-*.mjs`/`absorb-*` 30+；②历史探针 `*probe/pixel/truth/obs-*` 20+；③迁移/报告残余 `add-i18n-keys`/`migrate-patches`/`drift-audit`/`sec-tool-usage-report`/`modelcap-build-cli` 等；④推演期遗留 `sim-run-replay`/`sim-center-walkthrough`/`serve-dist`）。
2. **保留 20 个活体**（审计定谳）：vitest 收集的 4 个 `.test.ts`（api-expected/ide-workspace-verify/route-manifest/walkthrough-probes）及其依赖（`api-expected.mjs`/`harness.mjs`/`walkthrough-probes.mjs`/`ide-workspace-verify.mjs`）；package.json/CI/hooks/config 活体面引用 6 个（gen-doc-indexes/hrgov-seed/ekko-skill-store-migration/dsl/ide-selfcheck-cli/ide-smoke）；跨目录 import/正身锚 5 个（capability-registry-seed——registry-seed.test.ts import；merge-to-main——AGENTS.md 规则 13 正身；graph-migrate(.mjs/-cli.ts)——loop/graph 活代码 CLI 壳；route-manifest.ts——docs:sync 链消费）。
3. **机制预算配对退役**：`t8-verify-kernel.py` 删除兑现 2026-11-20 delta 的 pairedRemovals 预告（「一次性内核回环验证，合并验收后归档」）；mechanism-budget.json 追加退役 delta（scripts cap 139→138），历史行不改（账本不可变）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 三层活体判定（vitest 收集＋import/字符串提及闭包＋活体面 grep），宁少勿错 | 审计实录两轮修正：相对 import 盲区漏 harness/walkthrough-probes/api-expected（.test.ts 同目录 import）；字符串路径盲区漏 route-manifest/ide-workspace-verify（spawnSync/resolve 构造）；跨目录 import 盲区漏 capability-registry-seed。每处修正都实证「看似 DEAD 实为 LIVE」 |
| D2 | 历史叙事引用（specs/plans/reports/.qgate 运行态/.zcode plans）不算活体 | 删除类先例（域退役批 2026-11-12）：叙事记录引用已删物不构成复活义务，git 历史可考 |
| D3 | simharness 与治理正身机制不动 | 上轮用户指令「修订全流程推演程序」=保留定性；治理机制删除须走机制预算独立裁决 |

## 验证

- [x] `npm test` 全量绿（4 个保留 .test.ts 不红；删除集不含任何 .test.ts）。
- [x] `node scripts/governance-lint.mjs --budget` 过（t8 退役 delta 追加后）。
- [x] `node scripts/merge-invariants.mjs --check` pass。
- [x] 活体面终审零冲突（package.json/CI/hooks/config 对删除集 basename 零匹配，除 mechanism-budget 历史 delta 文本）。

## 设计文档影响

DESIGN_SYNC: none 附理由——纯脚本清理：删除对象全部为零活体消费者的一次性工具（specs 归档叙事不受影响），无契约/能力/版本面变化；机制预算账本按其自身格式追加退役 delta（D3 裁决的逆向合法操作）。
