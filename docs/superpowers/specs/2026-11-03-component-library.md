# 组件库：把晋级的「零件」沉淀下来（PluginRSI 吸收）

日期：2026-11-03
状态：implemented
触发：补充调研《PluginRSI：把 Harness 拆成插件》（arXiv 2609.32423，中科大/美团/武大/NUS）。论文指整机重写式自进化的三个硬伤——归因不清、好机制被下轮重写删掉、经验不沉淀（插件库 75→132 个、Workflow 始终 <300 行、把长好的库直接喂新 Agent 两轮就到 69% vs 从零 65%）。仓内改进实验台有「提案→冠军→回滚」，冠军保住了整机，但**验证有效的零件没被单独存下来复用**。

## 变更

- 新增 `custom/server/harness/workbench/component-library.ts`：
  - `ComponentEntry`：`id = <kind>:<name>@<digest8>`、kind（面 key）、name（目标文件 basename 或候选标签）、content/files、evidence（proposalId/variantId/evalRunId/passAt1/delta/verificationTier）、version、promotedAt/By。
  - `recordComponent`：晋级入库，**同 digest 幂等**、**同 (kind,name) 版本递增且旧版本保留**、空内容不入库。
  - `listComponents`（kind/surfaceKey/latestOnly/limit）、`librarySummary`（按类目组件数/版本数 + 各组件最新版本）、坏档 `.corrupt-*` 隔离、环形上限 500。
- `service.ts`：`promoteProposal` 成功后入库（fail-soft：库写失败不阻断晋级）；导出 `componentLibrary()` 只读投影。
- `controller.ts`：`GET /api/harness/workbench/library?kind=&surfaceKey=&latestOnly=&limit=`。
- 设计同步：正本 §5.8 增「零件沉淀」句；总账增「组件库口径」一行；附录 A.1 登记。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 组件身份用 `面 key + 目标文件 basename` 推导，不新增强制字段 | 存量提案没有 component 字段；用现有事实推导零迁移成本，且与「一个插件=一份实现+一份配置」的形状一致 | 新增必填 component 字段（否决：存量全废） | 是 |
| D2 | 入库挂在晋级之后、且 fail-soft | 库是复用资产，不是晋级前置条件；写库失败不该让已过门禁的晋级失败 | 入库失败即回滚晋级（否决：把资产问题升级成流程故障） | 是 |
| D3 | 同 digest 幂等、同组件版本递增且旧版本保留 | 论文的核心诉求就是「好零件不许被后续覆盖」；覆盖式存储会把这条纪律抹掉 | 只存最新版（否决：等于回到整机重写的丢失模式） | 是 |
| D4 | 本批不实现「从组件库自动重组新提案」 | 重组要先有「零件拼装」的表示（多组件内容合并语义），仓内 compose 目前是候选二选一/整文件合并；硬上会造出一个没人敢用的自动拼装器 | 直接做自动重组（否决：合并语义未定义，易产出不可评估的组合） | 是 |
| D5 | 不做组件库裁剪策略 | 论文自陈「库膨胀如何管理/裁剪是待解决问题」；仓内先累积样本，等有淘汰证据再定规则 | 先设保留窗口（否决：无基线就定阈值是拍脑袋） | 是 |

## 验证

- `custom/server/harness/workbench/__tests__/component-library.test.ts`：身份推导两态、入库字段/版本、幂等、版本递增且旧版保留、空内容不入库、树候选存 files、坏档隔离、latestOnly/kind 过滤、概览计数（9 例）。
- `custom/server/harness/workbench/__tests__/workbench-http.test.ts`：晋级后 `/library` 可见该组件（全链断言内）。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 增零件沉淀句。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增组件库口径一行。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec。
