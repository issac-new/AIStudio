# SwarmStudio 旅程式信息架构重构设计（0→1 时序导航·术语标准化·注意力条置顶）

日期：2026-10-17
状态：**需求冻结候选**。本文冻结后作为开工依据。界面级微调随工单验收不走变更，沿用 2026-10-16 需求分析正本 §七 Q5 分级。
分支：`feat/journey-ia-terminology`（overlay 仓）
上游依据有三份。全流程推演方案正本（`2026-10-05-mux-v8-fullflow-plan.md`）给出 26 步七幕、G1-G6 质量门、关键卡点与动线。前轮需求冻结（`2026-10-16-swarmstudio-requirements-analysis.md` R1-R14）。IA 决策正本（`2026-10-16-frontend-visual-redesign.md` D1-D17）。

## 〇、结论先行

用户 2026-10-17 对现状不满的根因不是功能缺失，而是三件事没做到位。产品不按 0→1 的使用时序引导人，旅程页做了却成孤儿。菜单词不是行业标准术语。注意力条不在最顶端。本轮用四个改动回应。把旅程页立为默认入口，重构为「五搭建步骤＋五交付阶段」一张时序图。把团队管理从被重定向架空的状态救回来。把全链菜单术语换成行业标准译名。把注意力条移到顶区第一行。全部改动落在 `custom/client/`，不 inject、不重启后端，在跑推演零打扰。验证走三条路：8649 热更新浏览器走查、ia2 测试套件、vue-tsc。收口前全绿才合 main。

## 一、现状问题（每个结论带锚点）

1. 旅程页是孤儿。D12 裁定旅程首页为默认入口（`2026-10-16-frontend-visual-redesign.md` D12）。实际 `/app` 默认路由是 StageShell 阶段 1（`custom/client/ia2/routes.ts:168-174`）。旅程页挂在 `/app/journey`（`routes.ts:180-184`），全仓没有任何导航入口指向它，用户从产品里走不到。
2. 搭建阶段没走完五步。顶栏①搭台的工具卡只有三项（`custom/client/ia2/views/stage/StageShell.vue:59-63`）。用户要求的建立账号、建立团队领导和协调关系没有步骤位。团队管理面板（领导邀请、值守分派、派发列表）唯一挂载点 EngScene 已被重定向到场景编排（`routes.ts:303-306`），整块不可达。
3. 两套分期并存。旅程页八阶段（`custom/client/ia2/views/journey/JourneyView.vue:41-74`）与顶栏六阶段（`custom/client/ia2/nav-centers.ts:30-37`）不同源，用户看到两个互相矛盾的地图。
4. 术语是内部黑话。推演中心、轮次、姿态、六闸、清偿门、欠账、度量体检、把关待办、介入卡、系分、判词、在制、生产位一类词散落全链，清单见 §5.5。这与行业标准术语体系的要求直接冲突。
5. 注意力条在顶区第 4 行。挂载顺序是页头、后台工作条、交付读数条、注意力条（`custom/client/ia2/components/IaGlobalTop.vue:86-98`）。「现在需要你处理什么」被压在品牌栏下面。

## 二、需求清单（本轮新增与修订，验收判据可机械检查）

继承前轮 R1-R14 不重开。本轮是需求级变更，按前轮正本 §七 机制登记。需求编号 J1-J12、JN1-JN7 由需求分析波产出，每条带证据锚。

| # | 需求陈述 | 证据锚 | 验收判据 | 优先级 |
|---|---|---|---|---|
| J1 | 旅程页成为产品默认入口且可达。`/app` 默认落地旅程页，一级导航提供常驻旅程入口，旅程页不再是孤儿 | `routes.ts:168-174`（默认路由现状）。`routes.ts:180-184`。`JourneyView.vue:41-74` | 访问 `/app` 渲染旅程页（`data-testid="jrn-page"`）。默认路由断言测试 | 高 |
| J2 | 双轨收敛。顶栏六阶段与旅程阶段合一为单一主线，阶段定义只有一处事实源，顶栏词表由它派生 | `nav-centers.ts:30-37`。`StageShell.vue:52-127`。`JourneyView.vue:41-74` | 新增共享阶段定义模块，三处消费方不各自定义。`workbench-nav-centers.test.ts` 词表断言更新为终态 | 高 |
| J3 | 搭建五步全部可达。组织、账号、团队与协调关系、环境与资产、智能体五步，每步从旅程①直达真实功能页 | `StageShell.vue:59-63`（现状三项）。`routes.ts:303-306`（团队不可达） | 五步各带进入按钮，点击到达真实页面且非空壳。新挂载路由进 route-whitelist 快照 | 高 |
| J4 | 团队领导与协调关系可操作。领导邀请、值守分派、派发列表三块在挂载页可渲染可操作，空矩阵态有诚实引导 | `custom/client/matrix-teams/views/TeamsManagePanel.vue`（组件完好）。EngScene 被重定向 | 新挂载点组件测试照 `eng-scene.test.ts` 模式。空态有提示 | 高 |
| J5 | 智能体准备面可达且诚实。档案与编制管理在旅程可达。agentManager 开关默认关的入口要么可达要么显示「未开启」 | `routes.ts:108-113`（门控注释）。`config/features.ts`（开关默认关） | 旅程⑤落地页有智能体列表与档案入口。关闭态显「未开启」，不放假按钮 | 高 |
| J6 | 建立组织诚实呈现。后端无组织实体端点，界面不得出现提交即失败的假流程，以组织登记表语义显示，缺位挂账 | `custom/server/orgloop/orgloop-controller.ts`（仅十类治理端点，无 org CRUD） | 搭台步一没有不可提交的建单表单。缺能力处有「未接入」标注。端点清单负向快照测试 | 高 |
| J7 | 需求到交付全流程动线。旅程覆盖需求进场、G1 冻结、需求分析、设计排期（G2）、开发（G3/G4）、发布验收（G5/UAT）、治理复盘（G6）全链，每步有位置与入口。互动协调面（介入待办、看板、群沟通）在动线上可见 | 全流程推演方案 26 步七幕主线。`StageShell.vue:65-126` | 旅程页每阶段至少一卡且点击可达。G1-G6 有状态位，读 run-state 推导 | 高 |
| J8 | 治理统筹改进收口。交付完成后的清算、审计、复盘、度量、问题单是旅程终点阶段且可达 | `routes.ts:262-286`（治理七签） | 终点阶段卡点击达治理中心对应签 | 中 |
| J9 | 术语标准化。菜单与功能名改用行业标准术语，自造词全量收敛，映射表是单一事实源 | §5.5 映射表。`sim-tabs.ts`、`gov-tabs.ts`、`StageShell.vue` 各锚点 | 新增术语黑名单守门测试，grep 自造词零命中。`ia2-i18n-coverage.test.ts` 绿 | 高 |
| J10 | 注意力条置顶。注意力条放界面最顶端。与页头内态势条的关系裁定为分工，不是合一 | `IaGlobalTop.vue:86-98`。`IaShellHeader.vue:190-204` | 模板序断言。注意力条是顶区第一个子节点。不新增轮询请求 | 高 |
| J11 | 零断链。旧路由、书签、测试断言不因改名与改默认入口破裂 | `routes.ts` 全表。`route-whitelist.test.ts`。`path-deeplink-guard.test.ts` | ia2 测试套件全绿。`/app/journey`、`/app/stage/setup`、`/app/eng` 旧链接均可达。白名单快照变更走显式评审 | 高 |
| J12 | 在跑推演零打扰 | 运维纪律（禁 inject）。当前有 `hermes-sim.py gateway run` 在跑 | `git status` 仅 `custom/client` 变更。无 inject、无 8647 重启、无 `custom/server` 改动 | 高 |

非功能需求：

| # | 约束 | 依据 |
|---|---|---|
| JN1 | 诚实呈现。缺数据、缺端点如实显示缺席，不硬凑，不放假按钮 | 前轮 N1；`JourneyView.vue:23-28`（端点不可达如实报错） |
| JN2 | 术语单一事实源。术语表一处定义，i18n 键与文案模块消费，zh/en 成对 | `i18n-msg-surface.ts` 先例；`ia2-i18n-coverage.test.ts` |
| JN3 | 每条需求可机械验证或可走查，不设「看起来对」 | 前轮 N8 |
| JN4 | 跑轮期间禁 inject，切换装走部署窗 | 前轮 N4；工作区规范 |
| JN5 | 验证默认走浏览器热更新，禁默认装机 | 工作区规范 |
| JN6 | 注意力条置顶与旅程页不新增轮询，沿用 30s 共享时钟 | `useAttentionRows.ts`；`useSitCounts` |
| JN7 | 全部改动落 `custom/client`。确需上游变更只走 `patches/` 加部署窗 inject | 工作区规范 |

与已冻结需求的关系。J7 继承 R1、R2、R5、R10、R12，J8 继承 R6、R14，JN1 继承 N1，JN4 继承 N4。R8 修订为旅程式归位，一级导航 ≤7 项约束保持。R5 并入旅程互动协调动线表述，语义不变。新增 J3、J4、J5、J6、J9、J10 六条，前轮无对应条目。

## 三、方案对比与裁决

信息架构怎么组织，有三个候选：

| 方案 | 做法 | 代价 | 结论 |
|---|---|---|---|
| A 九项一级导航 | 把五搭建步骤升为一级导航，加交付阶段 | 超过一级导航 ≤7 项上限（JN1）。搭建步骤与交付阶段不同粒度混在一层 | 否 |
| B 六阶段为纲＋旅程页展开 | 顶栏保持六阶段。旅程页把①展开成五步骤、②-⑥显示为五阶段。旅程页立为默认入口 | 需要改默认路由与旅程页结构。团队管理要重新挂路由 | **采纳** |
| C 只改术语不动结构 | 保留六阶段与孤儿旅程页 | 用户「从 0→1 一步步走」的核心诉求没回应 | 否 |

B 方案的关键判断：顶栏回答「现在在哪一站」，旅程页回答「从零开始怎么走、走到哪了」。两者共用一套六阶段口径（J6），旅程页是顶栏的时序展开，不是第二套地图。

术语策略同样先判过。页签与导航文案在 overlay 本地字典（`sim-tabs.ts`、`gov-tabs.ts`、`i18n-tasks-tabs.ts` 头注写明「不依赖 473 locale 树」），改文案不动补丁。少量残留 ia2 词条在上游 locale 树（patch 473），本轮不碰，随既有挂账处理。

## 四、信息架构总图

```
注意力条（最顶端：现在需要你处理什么）
─────────────────────────────────
页头：品牌（点击回旅程首页）｜①搭建 ②需求 ③分析设计 ④开发 ⑤验收 ⑥治理｜搜索｜状态｜通知｜账号
─────────────────────────────────
/app 默认入口 = 旅程页：
  ┌ 从 0 到 1 搭建（①搭建的五步）───────────────────┐
  │ 1 建立组织 → 2 建立账号 → 3 建立团队与协调关系      │
  │ → 4 准备环境与资产 → 5 准备智能体                  │
  └──────────────────────────────────────────────┘
  ┌ 交付全流程（②-⑥ 五阶段）────────────────────────┐
  │ 需求（冻结与启动迭代）→ 分析设计（拆解与排期）      │
  │ → 开发（编码测试与协调）→ 验收（发布准出与 UAT）    │
  │ → 治理（清算、审计与改进）                         │
  └──────────────────────────────────────────────┘
  工具舱（路由全保留，零断链）：/app/sim /app/gov /app/board /app/inbox /app/ide …
```

六阶段顶栏命名定案。①搭建（Setup）、②需求（Requirements）、③分析设计（Analysis & Design）、④开发（Development）、⑤验收（Acceptance）、⑥治理（Governance）。「生产」改为「开发」。软件交付生命周期里这一阶段的标准叫法是开发。推演方案内部称之为并行生产，产品对外用标准词。

## 五、详细设计

### 5.0 阶段定义单一事实源（J2 的落地机制）

新增 `custom/client/ia2/stage-meta.ts`，导出两份数据。六阶段定义 `STAGE_META`，含序号、键、标题（中英）、一句职责、工具卡清单、run-state 完成键。搭建五步定义 `SETUP_STEPS`，含步骤号、名称、一句目的、完成判据、入口路由名、状态键。三个消费方都读它，不再各自定义。顶栏 `nav-centers.ts` 的 CENTER_NAVS 标签由 `STAGE_META` 派生。`StageShell.vue` 的标题与工具卡读 `STAGE_META`，搭建分支读 `SETUP_STEPS`。`JourneyView.vue` 的交付区读 `STAGE_META`，搭建区读 `SETUP_STEPS`。阶段页的内嵌件（D14-D16）与模板分支不动，只换数据源。

### 5.1 旅程页（`/app` 默认入口，组件 `views/journey/JourneyView.vue` 重构）

两个分区、十张卡，一卡五要素：序号、名称、状态、一句话做什么、进入入口。

搭建区五步。无轮次数据时整体显示引导态。有轮次时按 run-state 键推导。步 2 与步 4 共用 smoke_done，因为步 1 至 4 在 26 步登记表里是四合一段，两张卡的状态会同时翻转，卡片脚注写明这个口径。步 3 与步 5 没有对应键，状态区显示轮次内不跟踪，不假装完成。

| 步 | 名称 | 做什么 | 入口（路由名） | 状态键 |
|---|---|---|---|---|
| 1 | 建立组织 | 登记组织信息，定人员编制与 RACI 责任矩阵 | ia2.govOrgAssets | people_done |
| 2 | 建立账号 | 为每位成员建账号、定角色、配 AI 助理 | ia2.accounts | appinit_done / login_done |
| 3 | 建立团队与协调关系 | 建团队与房间、指派领导、设值守分派与派发列表 | ia2.teams（新） | 无键，如实显示「轮次内不跟踪」 |
| 4 | 准备环境与资产 | 四服务拓扑健康、密钥台账、模型服务商配置、应用资产 | ia2.simOps | smoke_done |
| 5 | 准备智能体 | 建 hermes agent 档案与编制，确认就位 | ia2.settingsSidebarAgent（智能体管理） | 无键，链就绪探测 |

交付区五阶段与顶栏②-⑥同名同序，状态键沿用现有推导（g1_frozen／analysis_done、anexec_done、review_done／archgate_done／devimpl_done、defect_done、testpass_done／g5_ready、release_done、uat_done／workmgr_done、audit_done、retro_done、report_done、close_done）。

诚实标注。第 3、5 步在轮次状态里没有对应键，卡片状态区显示「轮次内不跟踪本步」，不假装完成。第 1、2 步的键是近似映射（编制与初始化），卡片脚注写明口径。

卡点提示条。有轮次数据时，旅程页顶部显示当前第一道未过的质量门及其拦截线一句话，取自方案 §5.3 判据。没有就不显示。

### 5.2 ①搭建阶段页（`StageShell.vue` stage=1 分支重构）

五步骤有序清单读 `SETUP_STEPS` 渲染，替换原三工具卡。每步一行，含步骤号、名称、一句目的、完成判据、进入按钮。步骤 4 下方保留密钥台账内嵌，这是 D14 既有件，属环境与资产。页尾留「更多配置」链接，通向既有组织级配置门户，原第二张工具卡的职责由五步覆盖。其余五个阶段页只改文案不改结构，D14-D16 内嵌件全部保留。第 5 步的智能体管理入口受 feature 开关门控，关闭时按钮显示「未开启」并禁用，不假装可达。

### 5.3 团队管理重新挂载

新增 `custom/client/ia2/views/TeamsView.vue`：异步挂载 `matrix-teams/views/TeamsManagePanel.vue`（沿用 EngScene 的 defineAsyncComponent 隔离手法），新路由 `{ path: 'teams', name: 'ia2.teams' }`（`routes.ts` ia2.shell 子路由）。`nav-centers.ts` 的 `centerForPath` 增加 `/app/teams` 归①搭建。`/app/eng` 重定向保持不动（旧链接不死）。不复活 EngScene：编排已迁 `/app/sim/orchestration`、交付案例在 `/app/cases`，EngScene 三签中两签已有新家，只剩 Teams 一签，直接挂比留空壳场景合理。

### 5.4 注意力条置顶

`IaGlobalTop.vue` 模板内把 `<AttentionStrip>` 从第 4 位上移到 `div.ia-gtop` 第一个子节点（`IaShellHeader` 之上）。新次序是注意力条、页头、后台工作条、交付读数条。两条状态条的关系裁定为分工，不是合一。注意力条在顶区第一行，回答「现在有哪些事等你处理」，条目来自 blocked 任务、blocked 循环与人工介入队列。页头内态势条留在原位，回答「全局任务与在线概况」，是两个汇总口径，合并会丢信息。联动处置有四点。`.ia-attn` 的 `border-bottom` 保留，与页头分隔。页头浮层（`IaShellHeader.vue:344` `__sitpanel` top:100%）打开时盖住注意力条，属正常下拉层叠，不加特殊处理。三个壳（IaShell、IaLegacyShell、IdeShell）只挂 IaGlobalTop 整体，无需改动。四个壳组件头注里「页头＋注意力条」的次序描述同步更新。

### 5.5 术语体系（行业标准译名，全链落地）

映射表是本轮唯一术语事实源，实现与测试都按此对账。分两层落地。第一层改 overlay 自有文件里的字面量与本地字典，本轮完成。第二层是上游 locale 树里的 ia2 键（patch 473 注入），禁 inject 期不生效，走 `registries/client/entry.mts` 的 `i18nReady` 钩子用 `mergeLocaleMessage` 运行时覆盖，同样不碰补丁。

| 现状词 | 标准术语（中／英） | 理由 | 落点 |
|---|---|---|---|
| ①搭台 | ①搭建／Setup | 搭台是口语隐喻 | nav-centers.ts:31、IaCentersNav.vue:53 |
| ④生产 | ④开发／Development | 软件交付生命周期标准阶段名 | nav-centers.ts:34 |
| 推演中心 | 仿真中心／Simulation Center | simulation 标准译名，英文侧本就是 Simulation Center | sim-tabs.ts |
| 轮次总览 | 运行总览／Run Overview | 与 run-state 端点的 run 同名 | sim-tabs.ts、StageShell |
| 开轮／开跑 | 启动运行／启动新运行受阻 | 开轮是自造词 | StageShell:67、i18n-tab-intros.ts |
| 姿态 | 运行模式／Run Mode | mode 标准译名 | StageShell:67、OrchestrationView、i18n-tab-intros.ts |
| 场景编排 | 运行编排／Run Orchestration | 避免与测试域的场景混淆 | StageShell:73 |
| 六闸／闸修复单 | 六道质量门／质量门修复单／Quality Gate | quality gate 标准译名 | StageShell、gov-tabs.ts、GateRepairsPanel 标题 |
| 清偿门／欠账 | 遗留项清算／遗留项／Clearance | 清偿是财务隐喻 | gov-tabs.ts、StageShell:116、ClearancePanel 标题 |
| 度量体检 | 度量检查／Metrics Checkup | 体检是比喻 | gov-tabs.ts、StageShell:123 |
| 磁盘水位 | 保留，首现补口径「磁盘使用率」 | watermark 是容量告警惯用译名 | CapacityLampBanner |
| 把关待办 | 审批待办／Approval Queue | 审批是标准职能名 | StageShell:96、GatekeeperSection 标题 |
| 待审收件箱 | 审批收件箱（与既有 title 合一） | 同一功能三个名字 | FlowNavPanel:149 |
| 介入卡 | 人工介入请求／Human Intervention Request | 介入卡是自造词 | GatekeeperSection、StageShell |
| 收尾令 | 收尾指令／Closing Instruction | 令是自造敬语 | GatekeeperSection |
| 系分／四路系分 | 系统分析／四路系统分析／System Analysis | 系分是内部缩略黑话 | StageShell:79、JourneyView、i18n-tab-intros.ts |
| 判词／AC 判词链 | 判定／AC 判定链／Verdict | 判词是法律术语错配 | StageShell:105、TracePanel 标题 |
| 生产位 | 开发工作位／Dev Workspace | 生产位是生造词 | StageShell:98 |
| IDE 画布 | IDE 工作区／IDE Workspace | 画布是图形编辑器术语 | IaCentersNav.vue:61、StageShell:98 |
| 运行观测 | 运行监控／Run Monitoring | 监控是标准说法 | sim-tabs.ts、StageShell:62 |
| 派发器 | 调度器／Dispatcher | dispatcher 标准译名 | StageShell:62、OpsPanel:63 |
| 休眠工作者 | 空闲工作者／Idle Workers | 休眠偏口语 | OpsPanel:74 |
| 活性 | 运行活性／Liveness | liveness 是云原生探针标准术语 | OpsPanel:93 |
| 就位探测 | 就绪检查／Readiness Check | readiness probe 标准译名 | StageShell:62 |
| 环境冒烟 | 环境冒烟测试／Smoke Test | 补全文种 | StageShell:55 |
| 本体（岛） | 保留 | GB/T 48000.3 本体建模标准依据，与知识图谱是不同实体 | nav-centers.ts:76 |
| BPA（岛） | 业务流程架构（BPA）／Business Process Architecture | 首现给全称 | nav-centers.ts:75 |
| 驾驶舱／驾驶位 | 工作台／工作台概览／Workbench Overview | 驾驶舱是比喻 | CockpitOverview、IaPopoutBar |
| 净额 | 净计／Net | 净额是财务词 | StageShell:72 |
| 机器执法实况 | 机器门禁实况／Machine Gates | 执法是行政比喻 | GovHealthSection |
| 语义体检 | 本体校验／Ontology Validation | 实体是 GovOntologySection | i18n-gov-tabs.ts |
| 工程效能 | 研发效能／Engineering Effectiveness | 效能是标准词 | i18n-gov-tabs.ts |
| G3 编码门禁 | G3 代码门禁／Code Gate | 动词改名词 | SimGateBadge |
| G4 独立测试 | G4 独立验证／Independent Verification | V&V 标准术语 | SimGateBadge |
| 任务工厂模板 | 任务模板／Task Template | 工厂是比喻 | OrchestrationView |
| 评审闸口 | 待审评审／Pending Reviews | 随 gate 译名统一 | CockpitOverview |
| 协作流 | 保留 | 消息面标准词，stream 概念 | FlowNavPanel:145 |
| 技能治理／技能安全 | 导航用技能治理，页内用技能安全扫描 | 同一功能两个名字，按位置分工 | nav-centers.ts:78、skillgov i18n |
| 其余 15 项（见下注） | 保留 | 已是行业通用或已译 | — |

注：保留的 15 项是看板、任务协同、监督面板、证据库、需求追溯、交付健康、组织与资产、审计与变更、文档评审、问题单对账、账户管理、系统设置、审批收件箱、RACI、UAT。

三条边界。26 步登记表（`steps-registry.ts`）的步名是推演方案正本的前端副本，`sim-overview-panel.test.ts` 有抽查断言，本轮不改，界面自由文本里的系分一类词随本表改。圆圈序号①至⑥是阶段标记不是术语，保留。data-testid 拼自 label 的一处（`StageShell.vue:192`）顺手解耦，给 Tool 加稳定 key，后续改名零 churn。

英文词条随 zh 成对更新，字典守门测试断言 zh/en 键成对，漏改即红。

### 5.6 接口与逻辑

五步入口全部接既有路由与端点，不新增 API。只有第 3 步需要新代码。

| 步 | 入口 | 消费面 | 缺口与处置 |
|---|---|---|---|
| 1 建立组织 | ia2.govOrgAssets | 治理注册表（org、app-registry、知识图谱、决策图谱端点） | 无组织实体 CRUD，组织数据实为 git 台账：挂账，不做假创建向导 |
| 2 建立账号 | ia2.accounts | roster 读写与 matrix-users 建号，写面 superAdmin 闸 | 无邀请流，仅管理员直建：挂账 |
| 3 团队协调 | ia2.teams（新路由） | TeamsManagePanel 全走 Matrix 通道与看板 API，无 HTTP 写端点。PL0 自写、PL50 领导层，isLeader 门控加 store 层双闸 | 无缺口：实现 |
| 4 环境资产 | ia2.simOps | 拓扑、调度器健康、空闲工作者三探测端点加密钥台账、IDE 模型服务商配置 | 模型服务商配置散在 IDE 内：挂账统一入口 |
| 5 智能体 | hermes.agentManager | profiles 端点。双门控：superAdmin 加 agentManager 开关，开关默认关 | agent 级模型绑定无写端、启停无壳内 UI：挂账。开关关闭时入口显示未开启 |

状态推导单一来源是 `GET /api/hermes/sim/run-state`。搭建五步的键按 26 步登记表实况定：步 1 用 appinit_done 与 people_done（应用初始化、研发人员管理，卡片脚注写明口径），步 2 与步 4 共用 smoke_done（步 1 至 4 是四合一段，卡片脚注写明并入冒烟判定），步 3 与步 5 无键，卡片显示轮次内不跟踪。交付五阶段键集与 StageShell 现用键一致，修掉两处问题，见 §5.8。

### 5.7 合规与规范对账

| 规范 | 本轮落点 |
|---|---|
| WCAG 2.2 AA | 新标签只用既有 token 色（D7 已校准 AA），旅程卡沿用 role=button 语义 |
| 个人信息保护法／数据最小化 | 不新增任何个人信息采集面。账号步骤只链既有页面 |
| 密钥安全（JR/T 0171 类） | 密钥台账继续不含密钥本体，本轮不改其逻辑 |
| 等级保护／ISO 27001 参照 | 无新增端点与传输面。TeamsManagePanel 重新挂载不扩大 API 暴露（原即可达） |
| 运维规范 | 禁 inject 期零打扰。改动限 custom/client。收口走部署窗 |

### 5.8 同批修复的既有缺陷

设计波盘点出八个既有缺陷，只改皮不改结构会复发，同批修：

1. `close_done` 一键双用。`steps-registry.ts:67` 把它定义为步 16 系分收尾的完成键，`StageShell.vue:119` 与 `JourneyView.vue:72` 又把它当治理阶段完成键。后果是系分一收尾，治理阶段就显示完成。修法是治理阶段键集去掉 close_done，只留 workmgr_done、audit_done、retro_done、report_done。
2. `archgate_done` 是死键。步 15 的闸键实为 `g2_arch_pass`（`steps-registry.ts:86`），阶段 3 键集里的 archgate_done 永远等不到。同批改为 g2_arch_pass，并补入排期键 plan_done。
3. 六阶段路由共用一条标签。`routes.ts:37-42` 六行 labelKey 全指 `ia2.nav.collab`，场景条渲染六个同名项。改为读阶段元数据各自的标签。
4. CenterKey 命名与阶段语义错位。键名还是三中心时代的 workbench、sim、gov、workbench2，`centerForPath` 对 `/app/stage/setup` 返回 workbench。改为 stage1 至 stage6。
5. IDE 分段挂错阶段。`IaCentersNav.vue:57-62` 把 IDE 工作区挂在①搭建分段下，按新命名它属于④开发，移到④的分段。
6. `/app/stage/setup` 路由不存在。`nav-centers.ts:31` 与 `routes.ts:52` 都按这个路径判定，路由树却没有记录，存在性守门会红。补上路由记录，顶栏①入口落它。
7. 同一功能三个名字。审批面有审批收件箱、待审收件箱、把关待办；技能面有技能治理、技能安全。按 §5.5 合一。
8. StageShell 工具卡 testid 拼自 label，改名即换机器锚。给 Tool 加稳定 key 字段解耦。

### 5.9 并行会话分歧裁定

实现期间发现有并行会话在同一工作树做同一任务，用词与结构跟本正本不一致。裁定如下，作为唯一事实源：

1. 术语以本正本 §5.5 为准。在飞用词①初始化、③设计、代码编辑器、待办审批、流程总览，对齐为①搭建、③分析设计、IDE 工作区、审批待办、旅程。
2. 注意力条置顶指 AttentionStrip 移到顶区第一行，SitlineBar 留在页头内，两者分工见 §5.4。在飞把 SitlineBar 挪成页头首行，且 `.cockpit-top` 保留 height 44px 又改 flex-direction column，第二行会被裁掉，另有 `; ;` 残留，按本正本回退该结构改动。
3. 在飞改了 patch 473 的 locale 词条。禁 inject 期不会生效，只造成补丁与注入树漂移，其中英文 locale 被写成中文更是缺陷。回退该改动，Tier-2 术语走 entry.mts 运行时覆盖。
4. 在飞合理的部分保留：IaViewSwitcher 退役收尾、术语轻量替换的意图、gatekeeper 数据面注释更新。

## 六、非目标

不做组织创建实体、账号邀请流、agent 级模型绑定表单、agent 启停 UI，四项挂账见 §5.6。不动推演引擎、harness、任何 `custom/server` 与上游文件。不新增一级导航项与二级页签。不改 G1-G6 判据与 run-state 键体系。不重做 D14-D16 的阶段内嵌件，只改其标题文案。

## 七、风险与回退

1. 默认入口变更影响面：登录后落地、通知跳转、catch-all 兜底都落 `/app`，改后全部落旅程页，语义上是回家，不断链。`ia2.stage1` 路由名有 7 处引用（顶栏入口、IA_AREAS、路由与契约测试），旧语义由新增的 stage/setup 记录保住。回退方式是整块还原 routes.ts 的 hunk。
2. `areaForPath('/app')` 必须保持返回①搭建非空。投影为空时从阶段页跳回 `/app` 会残留上一个阶段高亮。代价是旅程首页顶栏①高亮，可接受。
3. 文案改名触发 data-testid 变化：StageShell 工具卡 testid 拼自 label，本轮顺手解耦加稳定 key，改名与测试同步同一 commit。
4. 术语字典 zh/en 不成对：守门测试断言成对，漏改即红，属期望行为。
5. 并行会话同树作业：按 §5.9 裁定对齐，我方只动互不相交文件，重叠文件等对方空闲后一次对齐，避免互相覆盖。
6. 热更新与在跑推演：vite 只服务 8649 开发实例，推演 agent 走 Matrix 与 API，互不影响。本轮不 inject、不重启后端。

## 八、实施排期（并行波次）

| 波 | 内容 | 并行度 |
|---|---|---|
| 设计波（已完成） | 需求分析／页面及功能设计／架构设计／接口及逻辑设计四路并行，产出并入本文 | 4 路 |
| 实现波 A | 注意力条置顶（IaGlobalTop＋壳头注＋次序断言） | 与 B/C 并行 |
| 实现波 B | 术语全链改名（stage-meta 新件＋StageShell＋JourneyView＋三字典＋ISLAND_NAVS＋各视图标题）＋测试同步 | 与 A/C 并行 |
| 实现波 C | 旅程页重构＋默认入口＋stage/setup 补录＋TeamsView 新路由＋①五步骤＋centerForPath＋IA_AREAS 标签 | 与 A/B 并行 |
| 实现波 D | Tier-2 术语运行时覆盖（entry.mts 钩子＋覆盖字典） | 与 A/B/C 并行 |
| 测试波 | ia2 测试套件＋vue-tsc＋新增断言（默认入口/五步骤/团队路由/注意力条次序） | 1 路 |
| 验收波 | 8649 热更新浏览器走查（旅程页/六阶段/团队/注意力条/旧链接） | 1 路 |
| 性能安全波 | bundle 增量检查＋权限暴露检查＋合规对账 | 1 路 |
| 收口 | commit（Conventional Commits）→ 合 main → 推 origin → 复盘入记忆 | 1 路 |

波 A 动 IaGlobalTop、ia2.scss 与 global-top、attention-strip、ia-shell 三个测试。波 B 动 stage-meta、StageShell、JourneyView、三字典与 stage-shell、journey 测试，只改文案与数据源。波 C 动 routes、TeamsView、nav-centers 的判定函数与 routes、route-whitelist、workbench-flow 测试，只改结构与路由。波 D 动 entry.mts 与新的覆盖字典。四波文件集互不相交；nav-centers 一文件按「B 改标签、C 改判定函数」分区块。

## 九、验收标准汇总

1. `/app` 渲染旅程页：搭建区五步＋交付区五阶段，每卡五要素齐全（J1）。
2. ①搭建阶段页五步骤可进入真实页面。`/app/teams` 渲染团队管理（J2/J3）。
3. `/app/stage/setup` 可解析为 ia2.stage1，旧语义可达（J8）。
4. grep 全链用户可见面无映射表左列词汇残留（J4）。
5. DOM 次序断言：注意力条是顶区第一个子节点（J5）。
6. 旅程页与顶栏单一六阶段口径，治理阶段不再被 close_done 误判完成（J6）。
7. 四项缺口在界面如实标注挂账（J7）。
8. ia2 测试套件全绿＋vue-tsc 零错＋旧链接可达（J8）。
9. 无 inject、无后端重启、无 custom/server 改动（J9）。
