# 工作项区（swarm kanban 页）单层页签重构

日期：2026-10-01 ｜ 分支：`feat/tasks-flat-tabs`（基于 main f90c3d19）｜ 状态：已验证待合入

## 主旨

用户裁定：swarm kanban 详情页面（/app/board，工作项区）**不要二级页签**。本次把该页唯一的二级页签层（治理中心 5 分区）拆平，全站二级页签清零；同时整合语义重复的管理视图（管理三账 + 治理体检）。

## 重构前结构（全面分析）

一级页签 5 个 + 治理中心内部二级分区 5 个（13~14 板块）：

| 一级页签 | 功能 | 内部二级页签 | 数据面 |
|---|---|---|---|
| 看板 board | SwarmKanbanView：状态列看板/搜索/过滤/任务详情抽屉/编排面板/批量操作 | 无（抽屉为分节式非页签） | kanban store（hermes CLI 聚合 + 读缓存） |
| 追溯矩阵 trace | loop goal→run→产出任务→验证轮次矩阵 + 任务链投影 | 无 | loopRest + mind + kanban/runs store join |
| 管理三账 accounts | 进度偏差账/风险分布账/资源结构账 + 三类决策点联动 | 无 | /api/hermes/kanban/overview 聚合 + WS |
| 全链路追踪 observatory | Run Observatory 任务/运行执行拓扑（时间窗+聚焦下钻） | 无 | useKanbanTaskGraph |
| 治理中心 gov | 见下 | **总览/组织与知识/台账与规则/审计与变更/文档评审** | /api/governance/*（git 真仓实查） |

治理二级分区的板块构成：

| 二级分区 | 板块 |
|---|---|
| 总览 | 六闸卡（G1-G6 工件在仓锚点）、六域体检（L0-L5 判定引擎台账） |
| 组织与知识 | 五流断点诊断、板级共享知识图谱、决策图谱 |
| 台账与规则 | 能力台账、状态本体、决策规则闸、运行态 |
| 审计与变更 | 统一审计（四源+PROV-O）、变更治理 |
| 文档评审 | 治理工件库（四组+markdown 全文）、待裁决评审、管理维护（应用资产表+组织关系） |

## 重构决策

1. **二级分区升平级**：组织与知识/台账与规则/审计与变更/文档评审 4 分区各成一级页签（沿用既有板块组合与懒挂载 v-if，切签才取数）。
2. **总览分区并入三账页签**（真整合）：六闸卡+六域体检与三账同属"管理者健康总览"语义——三账看工作项分布健康，六闸/六域看交付治理健康，滚动一屏读全。页签名"三账与体检"。
3. **追溯矩阵与全链路追踪不合并且保平级**：数据面不同（需求-验证链 vs 执行拓扑）、均为全幅画布，合并会互相挤压高度；两者本就是一级页签，无二级问题。
4. **GovernanceView 退役**，拆 5 件：`gov/GovHealthSection.vue`（入三账页签）+ `gov/Gov{OrgKnowledge,RegistryRules,AuditChange,DocsReview}View.vue`（4 平级页签）。板块组件（LedgerSection 等 10 件）原样复用零改动。
5. **独立路由退役为重定向**：`ia2.governance`（/app/gov）→ `/app/board?tab=gov-org`——FlowNavPanel 入口与旧深链不死链；旧 `?tab=gov` 同义映射 gov-org。
6. **页签文案单一事实源**：新 `ia2/i18n-tasks-tabs.ts` 模块字典（zh/en 各 8 键）。不依赖漂移态 patch 473；**根治活缺陷**：原 `rsText.tabGovernance` 键从未定义（vue-tsc 不覆盖 custom client，类型缺口溜进运行时），治理页签一直渲染空标签。`governance/i18n.ts` 的 `govTabs` 死键随迁清除。

重构后：单层 8 页签（看板/追溯矩阵/三账与体检/全链路追踪/组织与知识/台账与规则/审计与变更/文档评审），页面任意内容一跳可达，无嵌套切换。

## 验证（2026-10-01）

- vitest：目标 4 件 21/21；ia2 全目录 + i18n 覆盖 49 文件 424/424（含新增单层纪律守门：治理分区视图无 tablist 永不回潮）。
- 浏览器走查（worktree dev 8651 + 真后端 8647，evidence/20261001-flat-tabs-walkthrough/ 9 图）：8 页签/`[role=tablist]`=1/二级页签=0；三账+体检同屏（ma 面板+六闸 6 卡+六域体检）；治理四分区板块全挂载（决策图谱/规则闸/四源审计/工件四组 20 件/待裁决/管理维护）；observatory/trace 正常；深链 `?tab=gov`→gov-org、`?tab=gov-docs` 直达、`#/app/gov` 重定向 `#/app/board?tab=gov-org` 全过。console 仅有上游壳层（导航栏）既有 Vue 警告，与本次改动无关。
- 局限如实记档：vue-tsc 不覆盖 custom client（既有约束），编译面以 vitest 全组件挂载 + 浏览器 8/8 面板实渲染覆盖。

## 合入说明（后续会话执行）

main 收口被并行会话阻塞：plan-v6 worktree 持有 main 且暂存区有基于旧版 TasksView.vue 的未提交改动（直接推进 main 会让其下次提交静默覆写本重构）。待该批次落地后执行：

```bash
cd <overlay 或任一 main worktree>
git merge --no-ff feat/tasks-flat-tabs -m "merge: 工作项区单层页签重构——二级页签清零（2026-10-01 用户裁定）"
```
