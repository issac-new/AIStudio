# 侧边栏待办徽标（每项挂「审批收件箱」同款待办数提醒）

- 日期：2026-10-22
- 需求：用户原话「侧边栏的每一项都加一个类似审批收件箱这样的代办标号数字，以提醒用户」
- 交付面：overlay custom client（IaSideNav/IaSideNavItem + 新 composable），验证走浏览器 web 版（8651 临时实例走查 + 8649 常驻换装）。

## 决策记录

1. **徽标只挂有真实待办语义的项，0 不渲染、不造数字**。逐项口径（全部复用既有聚合，零新 API、零新轮询）：

| 项 | 口径 | 数据源 |
|---|---|---|
| 流程总览 | 需关注∪待决策（attentionRows 已含 waitItems，评审门 gateRows 另加，相加=无重不漏并集） | useAttentionRows + useDecisionRows.gateRows |
| 工作台 | 需关注（阻塞任务+阻塞循环+等我+失败会话） | useAttentionRows |
| 看板 | 受阻任务数（与注意力条同源同口径） | workspace.tasks status=blocked |
| 审批收件箱 | 待决策（等我三源+评审门）——自 IaSideNav 内联式迁入统一装配，口径不变 | useDecisionRows |
| 阶段③ 分析设计 | 本阶段在办（triage/todo/scheduled/ready，STAGE_BOARD_STATUSES 单一事实源） | workspace.tasks + stage-task-filter |
| 阶段④ 开发 | 本阶段在办（running/blocked/review） | 同上 |

2. **不挂徽标的项与理由**：检索（无待办概念）；阶段①②⑤⑥（无看板态映射，保留原状态点；⑤验收的待验收已由审批收件箱/④ review 口径覆盖，不重复计数）；专题四岛（流程架构/本体/评测/技能治理——各域待办面需逐岛接 API，本轮不做，避免导航挂载期打四个新请求；留后续按岛逐个接）。推演模式六签为 run 专属视图，不在本需求面。
3. **徽标与阶段状态点共存**：IaSideNavItem 右侧槽原为互斥三选一（badge/status/meta），改为 badge 与 status 并列、meta 仅在两者缺席时显示——阶段③④同时显示在办数与当前阶段状态点，不互相挤占。
4. **>99 封顶「99+」**：防三位数撑爆 18px 行槽；折叠态沿用既有徽标绝对定位样式。
5. **计数核抽纯函数模块**（badge-count.ts）：composable 传递依赖 @/router（模块级 createWebHashHistory，node 测试环境即炸——2026-10-18 已知坑同源），守门测试只碰纯模块 + 源文本一致性断言（徽标 map 键集合正反面钉死：无待办语义的 key 不得入）。
6. **悬停说明**：有数的项挂 title 说明数字口径（中英双语），无徽标保持无 title 现状。

## 验证证据

- 守门测试：side-nav-badges.test.ts 9 项（计数核/口径接线面/共存模板序/99+）+ side-nav.test.ts 扩 1 项（渲染面：常用四项与③④出数、检索/①②⑤⑥不出、③✓④●与数字同显、title 挂载）全绿；全量 vitest **5985 通过/0 失败**。
- 浏览器走查（8651 主检出实例，真实 8647 后端）：流程总览 15、工作台 15、看板 14、审批收件箱 1、阶段③ 11（✓ 同显）、阶段④ 17（● 同显）、其余项无徽标；零页面错误；数字与右栏待办面板同源可对账。
- 既有 side-nav.test.ts 因新增 composable 触发 pinia 缺位红——按其 mock 模式补 useSideNavBadges 固定数 mock 后恢复，并顺势把徽标断言纳入该测试。

## 残留与移交

- 专题四岛徽标待逐岛接待办 API（见决策 2），接一个开一个。
- serve-main 换装：合并后重钉新提交，8649 常驻实例 HMR 即得同内容。
