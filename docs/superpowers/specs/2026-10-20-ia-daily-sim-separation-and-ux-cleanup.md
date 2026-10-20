# 驾驶舱全量走查后的 IA 拆分与可用性清理（spec）

日期：2026-10-20
分支：`feat/ux-ia-cleanup`
来源：用户 2026-10-20 全量走查反馈（驾驶舱二三四级模块导航冗余/机读噪声/假功能、Matrix 报错链接、日常与全流程推演互相侵入、布局遮罩溢出），以及当日 87 路由 + 19 专题页签 + 21 IDE 页签的采集结果（`/tmp/ncwk-audit-a/`）。

## 一、变更

### P0 止血（链接、裁切、噪声）

1. **任务直达链接改开抽屉**：`/app/board?task=<id>` 不再只把 ID 塞进搜索框；`SwarmKanbanView` 接收 `openTaskId`，挂载/参数变化时定位任务所在板并直接打开 `KanbanTaskDrawer`。顶部注意力条、工作台右栏、通知、全局搜索的任务链接全部受益。
2. **Matrix 全屏客户端入口修正**：`MatrixRoomHeader` 的「打开完整客户端」不再跳 `/matrix`（该页无认证上下文，只有“未认证”），改为在未连接时隐藏、已连接时落到工作台房间画布 `/app/s/room/:roomId`。
3. **Matrix 离线死胡同**：团队页在 Matrix 未连接时给出「去账户管理 / 回工作台」入口，不只显示“Teams 管理不可用”。
4. **工作台底部裁切**：左/右栏改为 flex 列，`FlowNavPanel` 不再用 `height:100%` 顶穿 26px 栏头；中栏内容区补 `min-height:0` 与滚动边界。
5. **IDE 状态栏溢出**：状态栏路径项加 `min-width:0` + 省略号，长工作区路径不再压住指标；任务栏标题行同样收口。
6. **裸 i18n 键**：补 `ia2.flow.chatSection` 与 `ia2.delivery.completed` 词条（zh/en）。
7. **推演总览机读错误**：隐藏 `{"error":...}`/404 JSON，改为中性人话空态（原始错误只进 title）。
8. **空白/死页下线**：设置并入侧栏移除无内容或纯开发工具入口（学习轨迹、设备互联、文件、终端等）；保留路由兼容但不再出现在员工导航。

### P1 日常 / 推演拆分（导航）

1. 顶栏视图切换扩为三段：**日常工作台 / IDE 工作区 / 全流程推演**（入口层拆分，不改路由）。
2. 左侧栏按模式切换内容：
   - 日常模式：常用（流程总览、工作台、看板、审批收件箱、检索）+ 六阶段 + 专题 + 系统设置；不再出现「整轮」。
   - 推演模式：推演导航（导演台、运行总览、运行监控、证据、编排、设置）+「返回日常」，不出现日常阶段与专题。
3. 去重：移除流程总览上的运行选择器与运行卡点（改由日常阶段/任务数据驱动）；「工作台概览」按钮不再指向隐藏的 `/app/dash`；设置域入口统一到原生系统设置，并入侧栏只保留仍可用条目并标明“高级”。
4. 术语统一：`整轮/全程` 统一为「全流程推演」；面包屑一致。

### P2 推演导演台与内容人话化

1. 推演默认页改为导演台：当前场景/轮次、模拟员工名册、阶段推进、待人介入、开始/续跑入口；26 步表下沉为「技术详情」折叠。
2. 监督面板：原始 journal 行改为可读事件流（时间、角色、动作、结果），原始 JSON/绝对路径只在详情。
3. 证据库：十六进制锚点检索降级为「高级检索」，首屏为截图证据墙与人工判定台账。
4. 运行监控：未接入的探测项直接不渲染，不再显示“未接入/未配置”。
5. 阶段页去除推演选择器与重复质量门入口；保留人工决策与任务数据，推演验证结果以人话徽标呈现。

### P3 内容收敛与布局回归

1. 技能治理/本体实例/IDE 插件目录加搜索、分页/懒加载。
2. 专题页统一壳与单层页签。
3. 全量布局回归：溢出、遮挡、z-index、双页头。

## 二、决策记录

- D-1：先修链接落点再谈重构。`?task=` 打开抽屉是低风险高收益修复，且同时解决“Matrix 裁决任务链接不对”的观感。
- D-2：`/matrix` 不修认证链路，改为不让用户进入未认证页面。全屏 Matrix 客户端不是员工主路径，工作台房间画布已覆盖日常协作。
- D-3：模式拆分放在顶栏而非新增一级侧栏，避免再造一层导航；复用现有 `IaWorkspaceSwitch` 语义。
- D-4：推演与日常共享组件与数据，但不共享导航。任何跨模式跳转必须显式标注「在推演中查看 / 回日常处理」。
- D-5：机读原文不删除，只降级到详情/title；不破坏排查链。
- D-6：设置域先隐藏死页，不删路由；上游并入页的路由兼容与深链保持。

## 三、验证

- 定向测试：`npx vitest run custom/client/ia2 custom/client/kanban custom/client/matrix-chat custom/client/matrix-teams custom/client/ide custom/client/skillgov custom/client/ontology`
- 类型检查：`npx vue-tsc --noEmit -p tsconfig.json`（基线含上游既有错误；本次改动文件无新增业务类型错误）
- 浏览器（`npm run dev`，1440×900）逐项回归：
  - 注意力条任务点击 → 看板抽屉打开且任务可见
  - Matrix 房间头部入口不再落「未认证」
  - 工作台底部输入框完整可见、左栏底栏不被裁
  - IDE 状态栏长路径不压指标
  - 日常/推演模式切换侧栏互不出现对方入口
  - 推演总览无 JSON/404 裸露
- 未验证项如实记录。

## 四、落地记录（2026-10-20，feat/ux-ia-cleanup）

### P0

| 项 | 文件 | 结果 |
|---|---|---|
| `?task=` 直接开抽屉 | `ia2/views/TasksView.vue`、`kanban/views/SwarmKanbanView.vue` | 注意力条任务点击后切板 + 打开 `KanbanTaskDrawer`；浏览器实测「实现裁决矩阵…」任务抽屉打开 |
| Matrix 错误链接 | `matrix-chat/components/MatrixRoomHeader.vue` | 「打开完整客户端」改为落工作台房间画布；`/matrix` 未认证页不再作为入口 |
| Matrix 离线死胡同 | `matrix-teams/views/TeamsManagePanel.vue` | 增加「去账户管理 / 返回工作台」 |
| 工作台裁切 | `ia2/views/WorkbenchView.vue`、`ia2/components/flow/FlowNavPanel.vue` | 三栏改 flex 列，子面板吃剩余高度；底部输入框与左栏底栏完整可见 |
| IDE 溢出 | `ide/views/IdeStatusBar.vue` | 工作区路径限宽省略；底栏不再压指标 |
| IDE 双输入框 | `ide/components/IdeMentionPicker.vue` | @ 引用面板默认收起为「@ 引用」按钮，发送后自动收起 |
| 裸 i18n 键 | `ia2/i18n-term-overrides.ts` | 补 `ia2.flow.chatSection`、`ia2.delivery.completed` |
| 机读报错裸露 | `sim/OverviewPanel.vue`、`gov/GovIssuesPanel.vue`、`sim/TracePanel.vue` | 人话空态，原始错误只进 title |
| 空白/开发工具入口 | `ia2/components/IaSettingsSidebar.vue` | 移除学习轨迹、设备互联、文件、终端、浏览器、宠物图鉴；新增「系统设置导航」回原生设置 |

### P1

| 项 | 文件 | 结果 |
|---|---|---|
| 三段模式切换 | `ia2/components/IaWorkspaceSwitch.vue` | 日常工作台 / IDE 工作区 / 全流程推演 |
| 侧栏按模式切换 | `ia2/components/IaSideNav.vue` | 推演模式只出现推演六签+返回日常；日常侧栏移除「整轮」 |
| 运行 chip 归位 | `ia2/components/IaShellHeader.vue` | 仅推演模式显示运行上下文 |
| 面包屑独立 | `ia2/components/IaBreadcrumb.vue` | 推演面包屑根=全流程推演，不再挂流程总览；单层页不渲染 |
| 流程总览去推演侵入 | `ia2/views/journey/JourneyView.vue`、`ia2/stage-meta.ts` | 去掉运行选择器与遗留项卡点；第 4 步改落环境资产页；保留只读「最近推演」提示 |
| 阶段页去选择器 | `ia2/views/stage/StageShell.vue` | 移除运行选择器，改为只读「数据来自最近一次推演」 |
| 跨模式入口明示 | `gov/GateRepairsPanel.vue`、`stage/StagePreflight.vue` 等 | 统一改为「在推演中查看/打开运行编排」 |

### P2

| 项 | 文件 | 结果 |
|---|---|---|
| 导演台 | `sim/DirectorPanel.vue`（新）、`sim/SimCenterView.vue` | 默认签=导演台：阶段推进、步骤/质量门 KPI、模拟员工名册、待人介入、继续运行编排；26 步表/交付物链收进「技术详情」 |
| 运行监控降噪 | `sim/OpsPanel.vue` | 未配置的调度器/空闲工作者探测不再渲染 |
| 监督面板人话化 | `sim/SupervisionPanel.vue` | 数据源只显末两层；研判原文限高，点行看抽屉 |
| 证据库降噪 | `sim/EvidencePanel.vue` | 十六进制锚点检索收进「高级检索」，首屏先看截图与台账 |
| 推演文案 | `sim/sim-tabs.ts`、`ia2/i18n-tab-intros.ts`、`ia2/components/IaSideNav.vue` | 「运行总览」统一为「导演台」 |

### P3

| 项 | 文件 | 结果 |
|---|---|---|
| 检索路径噪声 | `ia2/views/SearchView.vue` | 工作区显示末两层路径；结果分组不再被 flex 压缩裁行 |
| 技能治理大列表 | `skillgov/views/SkillgovView.vue` | 路径末两层；首屏 80 行 + 加载更多 |
| 本体实例大列表 | `ontology/views/OntologyView.vue` | 每页 50 行；深链直达实例页时立即拉取（修复 `?tab=instances` 空表） |
| IDE 插件目录 | `ide/views/IdePluginsPane.vue` | 首屏 30 条 + 加载更多 |
| 顶栏徽章 | `ia2/components/IaShellHeader.vue` | 「今日有日程」长文案改为计数徽章，不再压住铃铛 |

### 未完成/未验证（如实挂账）

1. **导演台尚未真正控制场景与模拟员工发送**：当前是推演运行的只读导演视图 + 跳转运行编排；场景选择、员工名册编排、`humansim` 受控发言 UI 未接。
2. **监督/证据仅首屏降噪**：原始 journal、commit 反查仍在抽屉/高级检索中，未删除。
3. **阶段页仍读最近一次推演数据**：运行选择器已移除，但质量门/追溯/交付健康/UAT 仍以运行数据为源，尚未改为纯日常任务视图。
4. **专题页未统一壳**：BPA/本体/评测/技能治理仍各自一套页签与布局。
5. **全量 npm test 结果**：`npm test` = 777 文件 / 5656 用例，**5647 通过、8 跳过、1 失败**。唯一失败 `custom/server/toolpipeline/__tests__/tool-waterfall-gate.test.ts > ekko registry.ts 三段瀑布`（期望 `execIdx > preIdx`，实际 `-1`）为服务端注入态基线问题，本次前端改动零改 `custom/server/`，单独复跑同样失败，登记为既有失败。
6. **生产构建**：`npm run build` rc=0（client+server 构建，`verify-dist` 通过，出厂默认口令扫描零命中）。
7. **类型检查基线**：`npx vue-tsc --noEmit -p tsconfig.json` 仍报上游/别名基线错误；本次新增 `DirectorPanel.vue` 仅一处已修（DecisionRow.status → kind），无新增业务类型错误。

### 浏览器回归（Playwright，1440×900）

- `/app`：顶部三段模式、日常侧栏无「整轮」、流程总览无运行选择器；「最近推演」提示只读。
- `/app/sim`：侧栏只剩推演六签 + 返回日常；导演台渲染 KPI/阶段/名册/待人介入；面包屑不重复。
- `/app/board?task=t_a6b4127b`：任务抽屉自动打开（矩阵任务链接修复）。
- `/app/collab`：底部输入框与左栏「新建聊天/管理」完整可见；`IA2.FLOW.CHATSECTION` 已显示为「聊天」。
- `/app/ide`：@ 引用面板默认收起，仅一个主输入框；状态栏长路径省略，不再压指标。
- `/app/teams`：Matrix 离线显示「去账户管理 / 返回工作台」。
- `/app/search`：工作区显示末两层路径（如 `hermes-docker-sandbox/workspace`）。
- `/app/skillgov`：首屏 80 行 + 加载更多；目录列末两层路径。
- `/app/ontology?tab=instances`：深链直达即加载，分页 50 行/页（修复原先直链空表）。
- 控制台：推演页仍有可选端点 503（未配置能力面），不再渲染为界面错误；看板 `diagnostics` 能力不支持为既有后端告警。


## 决策记录（补批 2026-10-20）

- D-7：监督研判原文常是整行 JSON；首屏只取 `situation`/`brief` 字段做人话展示，原文仍由行点击抽屉提供，不删除证据链。

## 决策记录（补批 2026-10-20 · IDE 任务栏与设置去重）

- D-8：IDE 任务栏改为 `taskbar > body(flex:1,min-height:0) > scroll(flex:1 1 0,height:0,overflow-y:auto)`，任务列表在固定列高内滚动，不再把整列顶到 1500px。
- D-9：设置并入侧栏移除「看板配置」（与主界面看板重复且为旧版横向列）；看板只保留 `/app/board` 一个入口。

## 决策记录（补批 2026-10-20 · 导演台文案）

- D-10：导演台不提供“假启动”。启动/续跑仍由 harness 执行；按钮统一为「查看运行编排」，导语明确写出 harness 边界，避免让用户以为页面能直接起跑。

## 验证账（补批 2026-10-20 · 布局复检）

- 全站 87 路由溢出探针（1440×900）复跑后，仅剩：
  - `/hermes/kanban` 旧版横向看板列超出视口——该入口已从设置侧栏移除，主界面看板为唯一入口；
  - `/app/stage/govern?tab=reviewGov` 两处行内按钮被卡片标题层覆盖（评审卡布局，登记待后续）。
- IDE 任务栏已限高：`taskbar 737px / scroll 481px / scrollHeight 1116px`，列表内部滚动，Shell 不再溢出（此前 1466px）。
- `npm run build` rc=0（补批后复跑，`verify-dist` 通过）。
- 定向测试：`sim-center-shell` + `ia-settings-sidebar` + `engine-round5` 27/27 通过；`engine-round5` 单跑 13.5s，低于 15s 但接近阈值，全量并发时曾超时，登记为负载敏感。
- 全量 `npm test` 早前结果：1 个服务端注入态基线失败（tool-waterfall-gate）+ 1 个 IDE 超时（并发负载，单跑通过），其余 5647 通过。
