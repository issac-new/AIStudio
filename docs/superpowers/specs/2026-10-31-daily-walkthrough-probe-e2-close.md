# 走查探针微批：E2 抽屉关毕验证（日常工作台回归收尾）

日期：2026-10-31 ｜ 轮次：日常工作台回归·探针收尾微批 ｜ 类型：test（probe 1 处）

触发：收官走查 E4 建卡连续假红。定谳：E2 抽屉「关闭」点击实取 `[data-testid=kanban-task-drawer] button` 的 first button——非关闭钮（NDrawerContent closable 的关闭钮是右上角图标钮）——抽屉残留开启，后续 ?new=1 建卡的创建钮点击全部落在抽屉遮罩上（无 toast、无建卡，API 侧无请求）。独立流程（不带抽屉步骤）同探针全绿佐证为序列性探针缺陷，非产品缺陷。

## 1. 变更

scripts/regression/daily-workbench-walkthrough.mjs E2 段：关闭改「Escape（抽屉键盘关闭路径）×4 轮＋.n-drawer-close 点击兜底＋关毕可见性验证」，并新增台账项 E2b（抽屉关毕；未关毕时明确标注后续 E4 结果不可信）。

## 2. 决策记录

1. **关毕验证入台账而非静默重试**：抽屉残留会让后续建卡断言失真，台账显式区分「产品红」与「探针前置失败」，防误判（不隐瞒失败红线在本探针面的落地）。
2. **定性不修产品**：真实用户不会点击被遮罩覆盖的按钮（遮罩即模态语义），非产品缺陷；仅探针需保证自身序列干净。

## 3. 验证

收官走查 `node scripts/regression/daily-workbench-walkthrough.mjs`：E2b 过且 E4 建卡→E5 抽屉→E6 催办 UI→E7 删卡清理全链绿；台账 0 defect。

## 4. 设计文档影响

DESIGN_SYNC: none。理由：纯走查探针（scripts/regression）稳定性修复，不触及任何产品契约/阈值/格式。附录 A.1 随批登记。
