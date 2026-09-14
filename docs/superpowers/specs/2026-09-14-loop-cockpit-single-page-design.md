# 循环驾驶舱单页重构设计（Loop Cockpit）

日期：2026-09-14 · 分支：`feat/loop-cockpit` · 状态：实施中

## 主旨

用户裁决：Loop Graph 页面菜单太多，应整合为**一个页面**，以「动态循环生长图」为核心，整体呈现智能驾驶舱的科技感。本文写给后续维护者，回答三件事：改了什么、为什么这样改、怎么验证。

## 决策

### D1 两个入口收敛到同一个驾驶舱视图

`/hermes/loop`（AppSidebar「循环工程图」入口，patch 246-248 冻结不动）与 `/app`（登录默认落点 + cockpit 顶栏 "Swarm Studio" 入口）**渲染同一个 `LoopCockpitView`**。旧 `LoopSpineView`（P0 列表页）退役删除。路由名 `hermes.loop` / `ia2.overview` 均保留，冻结入口与兼容守卫（guard.ts）零改动。

### D2 去菜单：拆 IaNav 六区域导航栏

IaShell 的左侧 IaNav 窄栏删除。六区域路由（编排/运行/介入/工作项/沟通）**全部保留**（深链、兼容重定向、`ia2.*` 路由名不变），改为两类入口：

- 驾驶舱页头动作区：新建循环（主按钮）、编排、运行中心、溢出菜单（介入中心/工作项/沟通/设置）；
- 子页 slim 页头：`← 返回驾驶舱` + 区域标题（非 overview 区域渲染）。

### D3 中央生长图：数据驱动的 SVG 动画

`LoopGrowthViz` 渲染 `buildGrowthScene()`（纯函数，`ia2/adapters/growth.ts`）产出的场景：

- 核心（Core）居中常脉动；循环（loop）与自建图（seed，graphId 无对应 loop 的 spec 运行）落在内环，按状态排序分布；
- 每个循环的运行（run，`run.graphId` 即 loop id）生长为向外分支：**分支长度 = 业务阶段进度**（discovery→stop 六级半径步进）+ 迭代加成——阶段推进（socket 实时事件）时分支肉眼可见地生长；
- 运行中分支有沿边粒子流（SMIL animateMotion）+ 节点呼吸；完成态绽放淡出；失败红色；待介入琥珀色；
- 背景雷达环 + 旋转扫描线营造驾驶舱氛围；`prefers-reduced-motion` 全量降级为静态。

### D4 驾驶舱信息架构（总览内容收编，不丢功能）

单页自上而下：注意力条（复用 AttentionStrip）→ KPI 条（活跃循环/运行中/待介入/7日完成/7日均耗时）→ 主体三栏：左=介入收件箱（待决 run，点击进详情）、中=生长图 + 图例、右=循环列表面板（含 run/pause/delete 动作 + mini LoopGraph）+ 工作项状态分布（复用 StatusDistributionCard）+ 今日计划。`OverviewView` 退役，其适配器（overview.ts 纯函数）与 AttentionStrip/StatusDistributionCard/CockpitScheduleModal 复用保留；五张概览小卡（ActiveRuns/InboxPreview/Schedule/Metrics/…）被 KPI 条与三栏吸收后删除。

### D5 视觉

驾驶舱容器自带深色径向渐变底 + 霓虹色板（青 #22d3ee / 紫 #a78bfa / 琥珀 #fbbf24 / 绿 #34d399 / 红 #f87171），scoped 于本页，不污染全局 Pure Ink 变量体系。这是「科技感」用户诉求的显式偏离，记录在案。

## 验证

- `growth-adapter.test.ts`：布局确定性、graphId 分组、未知 graphId → seed、阶段→半径单调、每环 run 上限 + 溢出计数、点击导航目标；
- `cockpit-view.test.ts`（替代 overview-components）：装配、KPI 数字、面板空态、动作接线；
- `ia-shell.test.ts`（替代 ia-nav）：子页头渲染/返回导航、六菜单栏不存在；
- `routes.test.ts` 更新 overview 懒组件指向；既有 compat-guard / appsidebar-loop-entry / observatory 测试不改不破；
- 全量 overlay vitest + 上游 `npm run build`（vue-tsc 门禁）+ clean/inject 重放。
