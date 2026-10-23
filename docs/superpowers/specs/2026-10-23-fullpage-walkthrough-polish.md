# 全页面走查与效果优化批（D23）

- 日期：2026-10-23
- 状态：已落地（前置热修批见 2026-10-23-ide-conflict-marker-hotfix.md）
- 载体：`feat/ui-walkthrough-polish`（worktree `ui-polish`，验证前端 8651）

## 走查范围与方法

浏览器 web 版（IAB，1600×1000）逐页走查 + 视觉模型质检 + 源码核实三轮
交叉。覆盖：/app 家族（总览、工作台、检索、看板、审批收件箱、六阶段
6 页、协作、聊天、治理 5 路由、推演 8 路由、智能体、设置、404）、
IDE 工作台首屏与右侧面板、hermes 独立存活页抽查（用量/技能/主题/群聊）。

路由拓扑核实：gov 家族 9 路由与 sim/trace、sim/delivery、cases 均为
阶段页 tab 别名；teams/agents/accounts 重定向到阶段① tab；eng=推演
orchestration 别名。真实独立页面约 25 个 + 阶段页 tab 族 + IDE 内部
页签。

## 走查问题清单与判定（源码核实后）

| # | 视觉走查反馈 | 源码核实判定 | 处置 |
|---|---|---|---|
| 1 | IDE 全家族 500 | 坏提交 483ee8a1 冲突标记（四文件） | 前置热修批已根治 |
| 2 | 顶栏任务 chip 串联过载（「待办 5 · 就绪 6 · 进行中 1 · 受阻 19 · 待审 1」全量横排） | SitlineBar.vue:48-57 全量 join 属实 | **修**（主显收敛） |
| 3 | 侧栏两套徽标形态并存 | InboxNavEntry 自含徽标几何与 isn-item 不一致；但该组件零引用（孤儿） | **修**（防御性对齐） |
| 4 | 空态孤悬文字弱、形态不一 | UiEmptyState 基元无图标层；SearchView 手写 srch__empty 平行实现 | **修**（基元+收编） |
| 5 | 注意力条 chip 可读性（160px 截断太狠） | ia2.scss .ia-attn__item max-width:160 | **修**（160→200） |
| 6 | 「六色阶段胶囊饱和度过高」 | 当前树不存在六色胶囊（左栏=数字圈+灯胆，StageShell=单色 underline） | 证伪，不修 |
| 7 | 「阻. 前缀」「标签截断样式不一」 | 无此代码；实为注意力条 chip ellipsis 正常截断 | 证伪，不修 |
| 8 | 工作台三卡片高度不齐 | CockpitOverview grid 默认 stretch 同行等高 | 证伪（auto-fit 换行属正常流），不修 |
| 9 | 看板空列高度塌陷 | KanbanColumn min-height:200px 已有 | 证伪，不修 |
| 10 | 用量页统计卡数字过大 | 上游视图 UsageView（hermes-studio），overlay 无源 | 挂账（patch 链成本） |
| 11 | 技能页图标同质化/发灰 | 上游视图 | 挂账（图标系统级） |
| 12 | 看板标签墙 40+ 噪音 | D21 已做 kg 冲突墙分页限流 | 挂账观察 |

## 修复内容

1. **SitlineBar 主显收敛**（ia2/components/SitlineBar.vue）：任务 chip
   副注从七态全量串联收敛为「受阻 N」单信号；全量串联移入 title 悬浮
   （tasksTitle），点击展开的 SitDetailPanel 明细不变，信息零损失。
   守门测试 sitline.test.ts 断言同步改写（含新语义：主显受阻+title 全量）。
2. **UiEmptyState 图标层**（ui/UiEmptyState.vue）：新增可选 `icon` prop
   （38px 圆形图标槽），页面级空态从孤悬文字升级为图标+标题+副文三层；
   compact 档隐藏图标保持单行。
3. **SearchView 空态收编**（ia2/views/SearchView.vue）：手写 `.srch__empty`
   平行实现退役，改用 UiEmptyState 组件版（icon 🔍 + boxed 档），删除
   三行平行样式。
4. **InboxNavEntry 徽标几何对齐**（ia2/components/InboxNavEntry.vue）：
   16px 高胶囊、radius 8px、10px 字号，与 IaSideNavItem 徽标同参。该组件
   当前零挂载（孤儿），对齐为防御性（复活即一致）。
5. **注意力条 chip 限宽微调**（ia2/styles/ia2.scss）：.ia-attn__item
   max-width 160→200px；attention-strip.test.ts 守门断言同步。

## 验证

- vitest：ia2+ui 全量 105 文件 / 755 测试绿（含改写的 sitline/attention
  守门）；IDE 家族 125 文件 / 777 测试绿（前置批）
- 活体（8651）：态势条主显「📋 任务 31 待决策 1 受阻 19」+title 全量
  （DOM 实证）；检索空态渲染 `ui-empty-state--boxed` + 图标层
  （DOM class/结构实证 + 截图）；IDE 页面恢复渲染（616 行快照）
- 检索空态触发路径备注：SearchView 首次编译慢（>6s），验证需等编译完成

## 决策记录

1. **视觉走查反馈一律源码核实再动手**：本轮 12 项反馈中 4 项证伪
   （六色胶囊/阻.前缀/卡片不等高/空列塌陷均为误读或旧版印象），避免
   无效改动；视觉模型报告只作线索不作结论。
2. **主显收敛而非删信息**：串联徽标的降噪原则=主显留需立即介入的
   信号（受阻），全量走 title 悬浮与展开面板双通道，信息零损失。
3. **孤儿组件不删只对齐**：InboxNavEntry 零引用但不属于本批清理范围
   （删除属架构决策），几何对齐零成本防御。
4. **挂账明示**：用量页统计卡与技能页图标为上游视图优化，需走 patch
   链，与看板标签墙残余一起列后续批。

## 关联

- 前置热修：2026-10-23-ide-conflict-marker-hotfix.md（本批走查中发现并
  先行根治的 IDE 500）
- 历史批次：D21（布局批）、D22（全局质感基座）——本批为 D23
