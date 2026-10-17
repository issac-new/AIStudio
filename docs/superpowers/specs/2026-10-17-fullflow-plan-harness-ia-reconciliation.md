# 全流程推演方案与程序对产品 IA 重构的对账总表（V8.37 批）

日期：2026-10-17
状态：执行中批次的唯一归属源（裁决表）
方法：新鲜扫描（产品面事实以 2026-10-17 overlay main `9a6945ef` 实读为准）→ 前向唯一家 → 反向依据 → 冲突裁决 → 取代声明。本批改稿按本文逐行执行；改完即冻结为对账依据，产品 IA 再变更时按方案纪律 75 重开新表。

## 〇、结论先行

产品重规划轮（overlay `e6bedf96`→`9a6945ef`，134 commit，2026-10-15 至 10-17）把一级导航从「三中心」改为时序六阶段＋旅程首页，术语按 D18 标准化 33 项。方案正本 V8.36 仅 §2.5.1 三行同步且用词是 D18 前旧口径，另有 18 处旧口径引用；simharness 侧六阶段零符号级引用，唯一交接点是 `mux/capture-plan.env:33` 挂账备注。旧路由全保留为零断链工具舱，经重定向矩阵可达，采集不断链；但方案描述与报告叙事呈现的仍是旧界面口径。

本批裁决：方案升 V8.37（18 处重锚＋§2.5.1 扩节＋纪律 75 新增），harness 六件联动（注册表迁新键、入口表重锚、生成器事实修正、术语映射、prelaunch 机械检查、词表增补）。26 步主链、STEPS 键、帧 id、闸体系、§3.3 完成键零改动。

关键数字：六阶段路由 6 条＋旅程页 1 条新增入表；旧 `?tab=` 键 10 条重定向全覆盖；方案引用点 18 处待改；harness 改动 6 件＋场景脚本注释 4 行；产品需求基线（14 FR＋8 NFR＋J1-J12/JN1-JN7）首次被方案引用。

## 一、产品面终态事实（新鲜扫描）

### 1.1 一级导航：时序六阶段

| 阶段 | 名称 | 路由 | run-state 完成键（任一命中即完成） |
|---|---|---|---|
| ① | 搭建 Setup | /app/stage/setup | smoke_done / appinit_done / people_done |
| ② | 需求 Requirements | /app/stage/reqs | g1_frozen |
| ③ | 分析设计 Analysis & Design | /app/stage/design | analysis_done / anexec_done / review_done / g2_arch_pass / plan_done |
| ④ | 开发 Development | /app/stage/build | devimpl_done / defect_done / testpass_done |
| ⑤ | 验收 Acceptance | /app/stage/accept | g5_ready / release_done / uat_done |
| ⑥ | 治理 Governance | /app/stage/govern | workmgr_done / audit_done / retro_done / report_done |

事实源：`custom/client/ia2/stage-meta.ts:36-107`（标签单一事实源，D18 收敛）；`nav-centers.ts:38-44`（CENTER_NAVS 由 STAGE_META 派生）；`routes.ts:177-187`（六条路由）。顶栏结构＝注意力条置顶（J10）＋页头六阶段＋岛屿组（IDE／流程架构／本体／评测／技能治理，`nav-centers.ts:85-91`）。

### 1.2 旅程首页

`/app` 默认落地旅程页 `ia2.journey`（`routes.ts:168-175`），两区十卡：搭建五步（`SETUP_STEPS`，`stage-meta.ts:125-167`）＋交付五阶段（STAGE_META ②-⑥）。状态由 `GET /api/hermes/sim/run-state` 步键推导；无轮次数据显示引导态。旧 `/app/journey` 书签重定向可达（`routes.ts:176`）。

### 1.3 工具舱（旧三中心数据页，路由全保留）

| 工具舱 | 路由 | 组成 |
|---|---|---|
| 仿真中心 | /app/sim | 六签：运行总览／监督面板／运行监控／证据库／交付健康／需求追溯（`routes.ts:331-360`；文案源 `sim-tabs.ts`）；运行编排挂面 /app/sim/orchestration、运行设置 /app/sim/settings（:362-372） |
| 治理中心 | /app/gov | 七签：质量门与流程／组织与资产／遗留项清算／问题清单对账／审计与变更／文档评审／度量检查（`routes.ts:256-295`；文案源 `gov-tabs.ts`）；组织与资产签含密钥台账＋组织与知识＋能力与规则；文档评审签页底管理维护区仍挂 AppRegistryEditor＋OrgEditor（`GovDocsReviewView.vue:229-232`） |
| 看板 | /app/board | 3 页签：看板／任务协同／协作与知识（`i18n-tasks-tabs.ts:22-33`；`TasksView.vue`） |
| 沟通协作 | /app/collab | 三栏工作台（`routes.ts:188-192`） |
| 其余工作页 | — | 审批收件箱 /app/inbox（:245-250）、交付案例 /app/cases（:318-323）、账户管理 /app/accounts（:304-309）、团队管理 /app/teams（D18 新，:296-303）、工作台概览 /app/dash（活路由，:193-199）、IDE /app/ide |

### 1.4 旧键重定向矩阵（零断链依据）

路由级（`routes.ts`）：`/app/runs`→`/app/sim`（:380-383）；`/app/runs/:runId`→`/app/sim?run=:runId`（:384-394）；`/app/eng`→`/app/sim/orchestration`（:310-317）；`/app/journey`→旅程页（:176）。

页签级（`TasksView.vue:16-30` legacyTabRedirect，整页跳转）：trace→/app/sim/trace；accounts→/app/sim/delivery；observatory→/app/sim/ops；gov-registry→/app/gov/org-assets；gov-audit→/app/gov/audit；gov-docs→/app/gov/docs；gov-harness／gov-cluster／gov-ontology／gov-session-health→/app/gov/metrics。

语义修正一处：`?tab=gov-registry` 重定向落组织与资产签（能力与规则视图），但应用资产编辑器实体在文档评审签管理维护区（`GovDocsReviewView.vue:231`）——appinit_done 的证据锚直指 /app/gov/docs＋`[data-testid=app-registry-editor]`，不经重定向。

### 1.5 页签计数裁决

方案 L985「十三个平级页签」与 L1031「看板 12 页签」均为历史口径。现行事实：/app/board＝3 页签；治理域合计＝仿真中心 6 签＋治理中心 7 签＋看板 3 页签。V8.37 按此改写，计数以 `i18n-tasks-tabs.ts`／`sim-tabs.ts`／`gov-tabs.ts` 实数为锚。

### 1.6 需求冻结基线（方案首次引用）

14 FR＋8 NFR＝`2026-10-16-swarmstudio-requirements-analysis.md:32-58`；旅程式 IA 需求 J1-J12＋JN1-JN7＝`2026-10-17-journey-ia-terminology-redesign.md` §二。方案 §1.5 与 §2.5 引用其作为产品能力基线。

## 二、术语采用边界（D18 §5.5 的适用面）

裁定：产品面文字用标准词，推演叙事词不动。

- 改（产品面文字：方案 §2.5 表内界面名与入口名、词表产品词条、steps_entry 入口路径、STEPS_META 帧注、注册表注释）：推演中心→仿真中心、轮次总览→运行总览、运行观测→运行监控、闸修复单→质量门修复单、清偿门→遗留项清算、度量体检→度量检查、把关待办／待审收件箱→审批待办／审批收件箱、介入卡→人工介入请求、收尾令→收尾指令、系分（界面自由文本）→系统分析、判词链（界面名）→判定链、生产位→开发工作位、IDE 画布→IDE 工作区、驾驶舱／驾驶位→工作台／工作台概览、净额→净计、语义体检→本体校验、工程效能→研发效能、任务工厂模板→任务模板、评审闸口→待审评审、开轮／开跑→启动运行、姿态→运行模式、场景编排→运行编排、派发器→调度器、休眠工作者→空闲工作者、BPA（导航词）→流程架构。
- 不改（推演叙事与机器锚）：26 步步名与 §3.3 完成键（`steps-registry.ts` 前端副本＋`sim-overview-panel.test.ts` 守门，术语档 §5.5 末段明文「本轮不改」）；七幕名（序幕·搭台／第四幕·并行生产——术语档 §四「推演方案内部称之为并行生产，产品对外用标准词」）；判词／姿态／闸／开轮等词在方案机制条款中的既有用法（词表已定义，属推演域词汇）；账号名／事件键／帧 id／闸键／testid 机器锚。
- 方案词表处置：「驾驶舱」词条按新 IA 重写；新增词条（时序六阶段、旅程首页、工具舱、仿真中心、运行总览、质量门修复单、遗留项清算、审批待办、IDE 工作区、运行编排、运行模式）以术语档 §5.5 为术语正本。

## 三、方案正本引用点对账表（V8.36→V8.37）

行号为 V8.36 快照行号（main `9a6945ef`），改稿时以内容定位为准。裁决词汇：重锚＝改表述／路由，语义不变；扩节＝小节升格；新增＝新条款；确认＝复核后不动。

| # | 位置 | 现状 | 裁决 |
|---|---|---|---|
| S1 | L5 总述 | 「让 AI 像一家软件公司一样干活的驾驶舱」 | 重锚：改「桌面工作台」，比喻句保留 |
| S2 | L48 词表 | 驾驶舱＝六区定义 | 重写词条＋按 §二新增词条 |
| S3 | L189 | 「全程在驾驶舱六功能区内完成」 | 重锚：六阶段＋工具舱表述 |
| S4 | L207 数字表 | 界面｜驾驶舱 6 区｜六区枚举 | 重写：一级导航 6 阶段＋旅程首页 |
| S5 | L265/L271 §1.5 | 副驾形态「人类操作员的驾驶舱」 | 重锚：工作台；产品范围声明引 14 FR＋8 NFR 基线 |
| S6 | L300 §2.1 组件表 | 信息架构 2.0 六区总述＋治理中心承载描述 | 重写：时序六阶段 IA（D13-D19）＋工具舱；治理证据改指 /app/gov 七签 |
| S7 | L374 架构图 L1 节点 | 驾驶舱单窗口多区域 | 重写：注意力条＋六阶段页头＋工具舱 |
| S8 | L472-490 步 4 冒烟组 | 页头 chips／运行中心工作流页签／主侧栏仅驾驶舱 | 重锚：注意力条置顶＋页头六阶段；运行中心→仿真中心运行总览；L478 一级入口＝六阶段导航 |
| S9 | L918/L935 步 26 | 走查三界面＝驾驶舱三功能区；联动地图六分区色块 | 重锚：三界面＝旅程首页／看板（工具舱）／IDE 工作区；联动地图→六阶段旅程图口径 |
| S10 | L962-980 §2.5 大表 | 26 步路由按旧 ?tab= 键与十三页签 | 逐行重锚：按 §五映射表迁新路由；组件名按七签／六签新名 |
| S11 | L984-987 路由事实块 | 十三页签＋四页签运行中心 | 重写：§1.1-1.5 事实（六阶段＋旅程＋工具舱＋重定向矩阵＋页签计数） |
| S12 | L989-992 QGate 判定流 | /app/cases 同步判定＋accounts 机器执法 | 小改：保留 /app/cases；tab 表述按重定向矩阵更正 |
| S13 | L1027-1040 对照表 | 缺口列含 inbox／eng／history 等 | 刷新：inbox 已落地（/app/inbox）；eng→运行编排挂面；补六阶段／旅程面行；引 PR 清单 |
| S14 | L1043-1045 §2.5.1 | 三行备注，用词「①搭台／④生产／旅程总览挂 /journey」 | 扩节：六阶段表＋旅程首页两区十卡＋工具舱兼容矩阵；D18 用语；引本文与术语档 |
| S15 | L1071-1126 §2.6 各条 | BPA／eval／ontology 产品面描述 | 术语重锚：业务流程架构（BPA）等按 §二 |
| S16 | L2040 §5.5 五面 | 沟通／任务／审批／度量／编码按旧六区 | 重锚五面路由：沟通＝/app/s/chat、任务＝/app/board、审批＝/app/inbox、度量＝/app/gov/metrics、编码＝/app/ide；阈值 ≥4/5 不变 |
| S17 | L2077-2083 §5.6 必采清单 | 旧拍摄位 | 增：旅程首页帧＋六阶段一级导航帧（帧命名锚通道） |
| S18 | §4.3 纪律区（L1588 附近） | 纪律 40-74 | 新增纪律 75 产品 IA 同步律（四点联动＋单一事实源＋prelaunch 机械检查挂钩） |

确认不动：L1352 前置⑤（路由校验机制，改稿后自会校验新表）；L1281-1298 §3.3 完成键列；§2.4 步名；§5.8.3 外部标准表；七幕名。

## 四、harness 引用点对账表

| # | 文件:位置 | 现状 | 裁决 |
|---|---|---|---|
| H1 | mux/capture-plan.env:38-63 生效位 | 旧 ?tab= 键与 /app/runs | 按 §五映射表逐行迁新键；user 列不动 |
| H2 | mux/capture-plan.env:9-12 SSOT 注 | i18n-tasks-tabs 12 页签口径 | 更新：3 键＋sim-tabs 6 签＋gov-tabs 7 签＋stage-meta.ts 六阶段 |
| H3 | mux/capture-plan.env:33-35 挂账 | 「下轮注册表迁新键时对账」 | 清偿：本批即下轮；备注改指本文 |
| H4 | mux/capture-plan.env:14-32 陷阱备忘 | 旧陷阱＋无重定向说明 | 增补：重定向矩阵摘要＋「迁新键后回落 URL 仍可用」说明 |
| H5 | mux/steps_entry.py:22-75 | 26 步入口按旧 IA（九页签勘误史） | 逐行重锚新 IA；头注勘误史续写 2026-10-17 轮 |
| H6 | mux/mx-report-gen.py:1571 STEPS_META 帧注、:180 等四处 ui-03-cockpit 帧注 | 「治理中心·XX」「驾驶舱全景」 | 术语映射（§二）：治理中心签名按七签新名；驾驶舱全景→旅程首页口径 |
| H7 | mux/mx-report-gen.py:3402 _pats | 三功能区命中正则（cockpit/kanban/ide） | 扩展：journey／sim／gov 命中词（A7/F7bis 断言兼容） |
| H8 | mux/mx-report-gen.py:150-158 PHASES | 推演叙事六阶段 | 确认不动＋加一行区分注（与产品六阶段不同概念） |
| H9 | mux/report_narrative.py:536-555 | 六功能区句＋三面正则＋26 步六阶段分幕 | 重写：旅程首页＋六阶段＋工具舱口径；`#/app` 断言不变 |
| H10 | mux/capture-ui.mjs:57-118 | ui-03b-dash 拍 /app/dash | 确认路由仍活（`routes.ts:193-199`），注释更正「工作台概览」；ui-03-cockpit 注释改旅程首页 |
| H11 | mux/verify-governance.sh:33,41 | 直跳 board?tab=gov-org 断言「治理中心」 | 重锚：直跳 /app/gov（治理中心 shellTitle 仍为「治理中心」，断言不变） |
| H12 | mux/glossary.txt | 无新 IA 词条 | 增补 §二新词（过 jargon 门禁） |
| H13 | mux/mx-prelaunch-check.sh | 无产品 IA 版本检查 | 新增机械检查：PRODUCT_DIST 资产含 /app/stage/ 路由族与旅程视图标记（防旧 dist 上轮） |
| H14 | aipay-scenario.sh:2399-2401、:2603 等 4 处 entry 注释 | 「/app/runs → 案例面板」等旧口径 | 仅改注释文案，URL 回落不动（注册表覆盖机制生效） |
| H15 | mux/jargon-source-gate.test.sh | 词表来源＝方案正本＋glossary | 确认机制不动；随词表增补跑绿 |

## 五、26 步拍摄位映射表（H1 的裁决明细）

语义＝该步证据在产品哪里可见；锚点＝拍摄断言用选择器。走查（8649 热更新）逐行复核后回填「复核」列。

| 步 | 键 | 旧位 | 新位 | 语义 | 锚点 |
|---|---|---|---|---|---|
| 1 | smoke_done | /app/accounts | 确认不动 | 账户管理·账号在列 | ia2.accounts |
| 2 | appinit_done | /app/board?tab=gov-registry | /app/gov/docs＋滚动 | 应用资产编辑器 | [data-testid=app-registry-editor] |
| 3a | people_done | /app/board?tab=gov-docs | /app/gov/docs＋滚动 | 组织名册 | [data-testid=org-editor] |
| 3b | login_done | /app/accounts | 确认不动 | 登录后就绪面 | — |
| 5 | g1_frozen | /app/board?tab=trace | /app/sim/trace | 需求追溯·冻结工件与 AC | 仿真中心签 6 |
| 8 | room_done | /app/s/chat | 确认不动 | 分析群会话列表 | — |
| 10 | register_done | /app/board | 确认不动 | fanfan 板·主卡 | 看板页签 |
| 11 | analysis_done | ?tab=gov-docs | /app/gov/docs | tasklist 核验 | 文档评审签 |
| 12 | triage_done | /app/board（chen） | 确认不动 | chen 板分诊卡 | — |
| 13 | anexec_done | ?tab=gov-docs | /app/gov/docs | 四份系统分析稿 | 文档评审签 |
| 14 | review_done | ?tab=gov-docs | /app/gov/docs | 概设核验 | 文档评审签 |
| 15 | g2_arch_pass | /app/board（arch） | 确认不动 | arch 板评审卡 | — |
| 16 | close_done | /app/board | 确认不动 | 主卡归档 | — |
| 17 | plan_done | /app/board | 确认不动 | 排期卡挂接 | — |
| 18 | devimpl_done | /app/ide?task= | 确认不动 | IDE 工作区·简报抽屉 | ?task= 防聊天壳 |
| 19 | testpass_done | /app/board（qi） | 确认不动 | qi 板测试卡 | — |
| 20 | release_done | /app/board | 确认不动 | REL 三卡登记 | — |
| 21 | uat_done | ?tab=trace | /app/sim/trace | AC 判定链 | 仿真中心签 6 |
| 22 | workmgr_done | ?tab=accounts | /app/sim/delivery | 交付健康·板状态分布 | 容量节 scrollIntoView |
| 23a | audit_done | /app/runs | /app/sim | 运行总览·运行记录 | 走查复核报告入口 |
| 23b | deliver_gate | /app/cases | 确认不动 | 六道质量门禁灯 | — |
| 24 | retro_done | ?tab=gov-harness | /app/gov/metrics | 度量检查·治理度量 | — |
| 25 | ide_done | /app/ide?task= | 确认不动 | IDE 工作区 | — |
| 26 | report_view | /app/runs | /app/sim?run=轮次 | 运行总览·报告查看 | 走查复核锚点抽屉 |

新增 IA 面帧（帧命名锚通道，不占步位、不改单步单 URL 语义）：ia-journey＝/app 旅程首页（有轮态优先，无轮引导态如实）；ia-stages＝六阶段页代表 1-2 张（建议 ⑤验收＋⑥治理）。挂靠 report_view 步前后采集。

动态位注记更新：步 4 冒烟承载页「/app 工作台首页」→/app 旅程页＋页头；步 20 运行中心表述→仿真中心运行总览。

## 六、观察到的产品残留（登记不动手）

- `IaCentersNav.vue:40` aria-label「三中心导航」——D13 前残留，产品侧欠账，PR 候选。
- `routes.ts:37-42` IA_AREAS 六行 labelKey 仍同指 `ia2.nav.collab`——术语档 §5.8-3 列为同批修复项，实读仍在；登记待产品侧确认（并行会话有 ia2 测试未提交改动，可能相关）。
- CenterKey 键名仍三中心字面（`nav-centers.ts:28-30` 挂账项，用户不可见）。
- `routes.ts:324` 注释仍写「推演中心」——代码注释非用户面，不动。

## 七、取代声明

- 本文取代 `mux/capture-plan.env:33-35` 挂账备注（清偿，改指本文）。
- 本文是 V8.37 批方案 §2.5／§2.5.1／词表改写与 harness 六件的裁决依据；`2026-10-15-redesign-reconciliation-ledger.md` 管产品 UI↔功能重构对账，与本文不重叠（本文管推演方案↔程序↔产品 IA 三方）。
- 本批合入后本文冻结为历史依据；产品 IA 再变更时按方案纪律 75 重开新表。

## 决策记录

- D-1（2026-10-17，用户批准本批实施方案）：方案正本升 V8.37 产品功能同步批；26 步主链、STEPS 键、帧 id、闸体系、§3.3 完成键、外部标准表不动；不起跑 run21（只交预备清单）。
- D-2：术语采用边界=产品面文字用 D18 标准词，推演叙事词（七幕名「序幕·搭台／第四幕·并行生产」、26 步步名、判词／姿态／清偿门等机制词）不改——依据术语档 §5.5 末段「26 步登记表本轮不改」与 §四「推演方案内部称之为并行生产」。
- D-3：页签计数裁决=看板 3 页签＋仿真中心 6 签＋治理中心 7 签（以 i18n-tasks-tabs.ts／sim-tabs.ts／gov-tabs.ts 实数为准），废弃方案内「十三页签／12 页签」两版旧口径。
- D-4：拍摄位迁移策略=能迁尽迁（旧 ?tab= 键一律改写为重定向后的规范 URL），证据锚弱的步保留工具舱位拍照；appinit_done 直指 /app/gov/docs 管理维护区（编辑器实体所在，不经 gov-registry 重定向）。
- D-5：IA 面帧（旅程首页＋六阶段导航）走帧命名锚通道新增，不占必采分母 15，缺席记问题单（type=ia-frame-missing）。
- D-6：产品残留（aria-label「三中心导航」、IA_AREAS labelKey 六行同值等）登记本文 §六不动手，归产品侧后续批次。

