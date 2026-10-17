# 组织与资产页分析块默认收起（spec）

日期：2026-10-17
分支：`fix/org-assets-knowledge-collapse`
来源：0→1 实机走查第 1 步「建立组织」落在 `/app/gov/org-assets`，整页正文约 13.3 万字符，首屏被「组织与知识」的断点诊断/知识图谱/决策图谱三张长表占满，组织登记、密钥台账与资产规则被推到下方。

## 变更

- `GovCenterView.vue` 组织与资产签：`GovOrgKnowledgeView` 包进原生 `<details data-testid="gov-org-knowledge-details">`，摘要为「组织与知识（协作断点诊断 · 知识图谱 · 决策图谱）」，默认收起；展开后仍是原组件全量。
- `gov-center.test.ts` 新增断言：该 details 存在且默认 `open === false`。

## 决策记录

1. **默认收起而非删除**：组织与知识是治理页的合法分析面，删除会丢能力；默认收起让核心操作回到首屏，需要时一键展开。
2. **不改组件与数据面**：`GovOrgKnowledgeView` 本体、接口、查询全部不动；本批只改挂载容器。
3. **与阶段页减负同一模式**：③阶段页、④阶段页交接说明已采用「默认收起/按需展开」，本页保持同一交互语言。

## 验证

- `npx vitest run custom/client/ia2/__tests__/gov-center.test.ts` 通过。
- 合并后 8649 实机：`/app/gov/org-assets` 首屏出现组织登记、密钥台账与资产规则，分析块折叠；展开后分析内容正常。
