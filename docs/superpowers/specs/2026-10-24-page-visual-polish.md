# 全页面视觉走查与效果优化（2026-10-24）

## 背景

用户指示「走查所有页面，对页面效果都优化下」。2026-10-24 用无头浏览器（Playwright +
系统 Chrome，1440×900）对 47 条路由逐页截图走查，覆盖六阶段页、工作台、看板、审批、
检索、推演专区、专题岛（BPA/本体/评测/技能治理）、IDE 与收编的 /hermes-* 页。

## 走查结论（按影响排序）

1. **页面标题层级过弱**：旅程/阶段/推演页标题统一 16px，和正文 12px 挤在一条视觉带上；
   区块标题（12px muted）与卡片标题（13px）几乎同权，扫读时找不到落点。
2. **卡片密度高、留白不均**：旅程卡片内距 8/12px、描述 11.5px 单行截断；阶段页头与页签
   间距 10px；推演页签为小号描边按钮，与阶段页签形态不统一。
3. **空态缺乏落点**：推演监督/运行监控/编排页在无数据时留下整屏空白，只有一行小字提示。
4. **主页面裸露机读信息**：BPA 工作台页头直接显示本机绝对路径；运行监控把
   `fetch failed`、`14ms (HTTP 200)` 原样铺在服务列表里。
5. 上游 /hermes-* 页与工作台三栏为上游组件，视觉调整须走 patch；本轮不改，留作后续批次。

## 变更

- `custom/client/ia2/views/journey/JourneyView.vue`：标题 20px/600、说明文字 13px；
  卡片内距 14/16px、描述两行可读；步骤序号改圆形徽标；引导条改实底 CTA；窄屏保持单列。
- `custom/client/ia2/views/stage/StageShell.vue`：阶段标题 20px、状态改语义胶囊；
  主操作由描边改实心强调；阶段工具与页签统一为 13px、增大点击区；内容区留白 18/24px。
- `custom/client/ia2/views/sim/SimCenterView.vue`：标题 20px、页签改下划线式（与阶段页一致）、
  引导语 13px；面板圆角 10px、内距 16px。
- `custom/client/ia2/views/sim/OpsPanel.vue`：服务状态改中文人话（未连接/正常/响应 xx ms），
  原始探测细节收进「技术详情」折叠；探测时刻本地化。
- `custom/client/bpa/views/BpaView.vue`：页头绝对路径收进悬浮提示，正文显示「数据存于本机」。
- `custom/client/ia2/components/IaSideNavItem.vue`：行高 30→32px、字号 12.5→13px，
  徽标改中性底+语义字色，降低整列红色徽标的噪声。
- `custom/client/styles/polish.scss`：补 reduced-motion 全局降级与按钮 active 反馈。

## 决策记录

- **不动上游**：/hermes-* 与工作台三栏属上游组件，任何改动必须走 `patches/`；本轮只改
  overlay 自有壳层与页面，避免为纯视觉引入补丁漂移。
- **只调层级不加功能**：本轮不做 IA 调整、不新增入口，只改字号/间距/圆角/状态表达。
- **状态色仍走 token**：不新增裸 hex；继续使用 `--ia-fresh/--ia-stale/--ia-fail` 与
  `--accent-primary`，保证浅/深两套主题一致。
- **机读信息降级而非删除**：BPA 存储路径、服务探测耗时保留在 `title`/折叠区，可审计但不干扰主视线。

## 验证

- `npx vitest run custom/client/ia2`：104 文件 / 748 用例全绿。
- `npx vitest run custom/client/__tests__ custom/client/bpa`：14 文件 / 60 用例全绿。
- `npm test`（全仓）：870 文件通过、5 跳过；6262 用例通过、8 跳过。
- 浏览器 web 版（vite dev，8651 端口）逐页复查：旅程、六阶段、推演四签、BPA、检索、收件箱，
  浅色与深色主题各看一遍；确认收起态无空徽标、暗色表单控件不再白底。
- 测试契约同步：`sim-b4-b6-panels.test.ts` 的运行监控断言改为「主视图读人话 + 原始原因保留在
  title/技术详情」，与本次人话化口径一致。
- 未验证：上游 /hermes-* 页（本轮无改动）；Electron 壳（纯 CSS，无主进程改动）。
