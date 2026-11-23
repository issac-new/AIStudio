# 2026-11-23 N33 挂账清偿批（noop-inject 哨兵＋REA 6.10 盘点）

> 状态：实施中（本批清偿 `2026-11-23-compat-release-pending-batch.md` 的 N33-1/N33-2，N33-4 记中间检查，N33-3/N33-5 维持在册）。

## 变更

1. **N33-1 noop-inject 哨兵根治**：新增 `scripts/platform/inject/lane-touch.mjs`（`noopSentinel`：按清单声明 applied 的 lane 核 git 工作树落盘差异，三态 ok/reverted/mixed）；接入 `scripts/inject.mjs` v2 noop 分支（reverted→废弃残留清单自动全量重放；mixed→响亮拒绝指引 clean）与 `scripts/ensure-injected.mjs` noop 分支（pretest 主路径同款，reverted→删清单触发重放）。
2. **N33-1 守门测试**：新增 `scripts/__tests__/inject-noop-guard.test.ts` 五例（TDD：实现前三例 RED 实证旧缺陷——全部还原后 inject/ensure 仍 noop；实现后 5/5 GREEN）。夹具对齐真实仓忽略规则（node_modules 入 .gitignore）。
3. **N33-2 REA 6.10 盘点**：台账新增 §4.5（UEFI 三件/新格式面/Evidence rev2 breaking/Ghidra 12.2 lane/IDA 收紧/6.10.1 patch＋本机核验＋「Evidence rev2 不适用本仓」判定）；§3.1 REA 行处置与 §八 变更日志同步。
4. **N33-4 中间检查记录**：sia 11-23 实测 pushed_at=2026-08-26（静默 89 天，v0.6.0...main=1c 零新增）——维持 dated，11-24 到线按 §一.3 复核定去留。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 哨兵语义三态：reverted 自动全量重放、mixed 拒绝 | 全还原时树必干净＝全量重放安全前置成立；混合态无法自动判定归属，自动化有破坏在途工作风险 | 一律拒绝指引 clean（否决：本轮事故正例（复基线配方后）完全可自愈，一刀切拒绝把可自动恢复态降级为人工） |
| D2 | 非 git 仓/命令异常按「有差异」放行 | 保守优先：不阻断既有 noop 语义，哨兵只增不改 | 异常即拒绝（否决：引入新故障面，与哨兵目的失衡） |
| D3 | 机制预算不新登记（N33-1 验收③口径收敛） | 仓规 13 枚举面=门/钩子/脚本/账本；本批是**既有 inject 机制内的缺陷修复**（新增 lib 模块非新入口，无新 CLI/门/账本），同类先例=inject 历轮缺陷修复均未登记 | 登记 sunset（否决：名实不符，预算表会通胀） |
| D4 | REA Evidence rev2 判定「不适用本仓」 | 本仓 REA 消费为实时调用型、无持久化 Evidence 资产；重建义务只作用于跨版本复用观测的场景 | 预防性重建（否决：无对象） |

## 验证

- TDD 闭环：`inject-noop-guard.test.ts` 实现前三例 RED（noop 静默跳过实证）→ 实现后 **5/5 GREEN**；健康 noop 不回归（真实仓 `npm run ensure-injected` 二连：complete→「前缀精确一致（v2 noop）无需动作」）。
- 注入族回归：inject-manifest/executor/planner/clean-v2/absent-tree/ensure-injected **42/42**。
- 台账：§4.5 逐条带官方 release notes 主题与本机 `--version`/`--help` 实测锚；`gen-doc-indexes` 随批重建。
- 全量 `npm test` 合并前跑（结果回填交付说明）；合并推送后 product-tests 预期见绿（本批含代码改动，自然触发）。

## 设计文档影响

DESIGN_SYNC: none。哨兵属注入执行层缺陷修复（三条不变量「执行层强制」的正身收敛），不改产品架构与能力面；台账为独立账本随批更新。
