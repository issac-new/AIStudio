# 全流程推演方案与程序对最新工作台 IA 的重构对账（V8.44 批）

日期：2026-10-18
状态：执行中批次的唯一归属源（裁决表）
基线：overlay `main` `b313ba08`（2026-10-18，Cua 轮收口）；simharness `main` `b435d55`
方法：新鲜扫描产品代码与 10-17/10-18 spec → 前向唯一家 → 反向依据 → 冲突裁决 → 取代声明。本批改稿按本文逐行执行。

## 〇、结论先行

产品在 2026-10-18 完成了工作台信息架构的第二次重构：一级导航从「顶栏时序六阶段」改为「左侧常驻导航 + 顶部上下文栏 + 阶段页单层页签」，并把原来与六阶段平行的「仿真中心/治理中心」拆解为两部分——⑥治理并入阶段页签，监控面独立为「全流程推演」专区。方案正本 V8.42 与推演程序仍按上一版 IA 描述和拍摄（顶栏六阶段、`/app/gov/*` 七签、`/app/sim` 六签、旅程首页）。本批把方案、`capture-plan.env`、`steps_entry.py`、`mx-prelaunch-check`、报告叙事与词表六处同批对账，26 步主链、STEPS 键、六道关卡、§3.3 完成键零改动。

关键数字：左侧导航 5 组；六阶段页共 29 个页签（①6/②5/③4/④5/⑤6/⑥6，其中文档评审在③⑥两处复用）；全流程推演 6 签（4 条路由签 + 运行编排/推演设置 2 条 query 签）；旧 `/app/gov/*` 7 条深链全部 redirect；26 步拍摄位 24 条迁到阶段页/专区，2 条 IDE 位保持；新增 IA 面帧 5 类。

## 一、产品面终态事实（新鲜扫描）

### 1.1 左侧导航与顶部上下文栏

左侧导航五组（单一事实源=`custom/client/ia2/components/IaSideNav.vue:48-110`）：

| 组 | 子项 | 路由 |
|---|---|---|
| 常用 | 流程总览 / 工作台 / 看板 / 审批收件箱 / 检索 | `/app`、`/app/collab`、`/app/board`、`/app/inbox`、`/app/search` |
| 流程 | ①搭建 / ②需求 / ③分析设计 / ④开发 / ⑤验收 / ⑥治理 | `/app/stage/setup` … `/app/stage/govern` |
| 整轮 | 全流程推演 | `/app/sim` |
| 专题 | 流程架构 / 本体 / 评测 / 技能治理 | `/app/bpa`、`/app/ontology`、`/app/eval`、`/app/skillgov` |
| 管理 | 系统设置 | `/app/gov/settings` |

顶部只保留：注意力条、页头（品牌/主题/语言/连接、沟通协作|IDE 切换、运行上下文、搜索、通知、账户）。六阶段不再出现在顶栏；左侧栏 216px、可折叠 58px，窄屏自动收起，折叠状态持久化。事实锚=`2026-10-18-ia-leftnav-stage-tabs.md` §四、§七。

### 1.2 六阶段页单层页签

页签注册表单一事实源=`custom/client/ia2/stage-tabs.ts:16-70`；页面壳=`custom/client/ia2/views/stage/StageShell.vue`。页签状态写 `?tab=`，可刷新、可分享：

| 阶段 | 路由 | 页签（key） |
|---|---|---|
| ①搭建 | `/app/stage/setup` | steps 五步进度 / org 组织 / accounts 账号 / teams 团队 / assets 环境与资产 / agents 智能体 |
| ②需求 | `/app/stage/reqs` | reqs 需求与冻结 / docs 文档评审 / g1 质量门 G1 / preflight 启动准备 / launch 启动运行 |
| ③分析设计 | `/app/stage/design` | tasks 任务分解 / analysis 系统分析 / g2 质量门 G2 / schedule 排期 |
| ④开发 | `/app/stage/build` | today 今日工作 / board 看板 / approvals 审批待办 / risk 风险与交接 / quality 质量与测试 |
| ⑤验收 | `/app/stage/accept` | overview 验收总览 / trace 需求追溯 / delivery 交付健康 / uat UAT 判定 / g5 G5 审批 / cases 交付案例 |
| ⑥治理 | `/app/stage/govern` | clearance 遗留项清算 / issues 问题清单 / audit 审计与变更 / metrics 度量检查 / docs 文档评审 / gateLog 质量门记录 |

治理中心壳已解体：`/app/gov`、`/app/gov/*` 全部 redirect 到阶段页并带 `?tab=`（`custom/client/ia2/routes.ts:256-295`）；`GovDocsReviewView` 在③ analysis 与⑥ docs 两处复用，`AppRegistryEditor` 与 `OrgEditor` 仍在文档评审签的管理维护区（`custom/client/ia2/views/gov/GovDocsReviewView.vue:238-239`）。组织编辑器另有①org 页签直挂（`StageShell.vue:116`）。

### 1.3 全流程推演专区

原「仿真中心」改名「全流程推演」（`custom/client/ia2/views/sim/sim-tabs.ts` 头注）。页面六签（`SimCenterView.vue:36-45`）：运行总览 / 监督面板 / 运行监控 / 证据库 / 运行编排 / 推演设置。前四签是兄弟路由（`/app/sim`、`/app/sim/supervision`、`/app/sim/ops`、`/app/sim/evidence`），后两签走 `/app/sim?tab=orchestration|settings`。交付健康与需求追溯已迁⑤验收（`/app/sim/delivery`、`/app/sim/trace` 保留 redirect，`routes.ts:374-383`）。运行编排与推演设置不再从页头跳独立页，阶段页内就地开页签。

### 1.4 检索页

新增 `/app/search`（`routes.ts:184-186`），五类对象：会话与房间 / 看板任务 / 运行 / 治理文档 / 人员；支持工作区、团队、状态、负责人、时间过滤，以 `workspace_path` 作为跨对象聚类键（`custom/client/ia2/views/SearchView.vue:2-5,16`）。任务结果就地开 `KanbanTaskDrawer`，不跳看板；其余对象一击直达。

### 1.5 IDE 任务工作区

`GET /api/ide/task-workspace?task=<id>&board=<slug>`（patch 658，`custom/server/controllers/ide/task-workspace.ts:3,134`）把 kanban 任务的 `workspace_kind/workspace_path/branch_name` 解析给 IDE。客户端 `ide.taskWorkspace` 是任务层根目录输入，只有 `materialized` 时才切根；文件树、终端 cwd、记忆面板、新会话跟随任务工作区；任务简报新增「任务工作区」「任务会话」两块（`custom/client/ide/composables/useIdeWorkspace.ts:5,62`）。该能力已在 main（`ead84b77`），是步 18/25 的新证据面。

### 1.6 其它最新能力（main 已在）

| 能力 | 产品面 | 对推演的意义 |
|---|---|---|
| Cua 电脑操作 | `custom/server/cua/broker.ts`、`custom/client/ide/components/IdeCuaFloat.vue`、`custom/client/ide/api/cua.ts` | 步 19/25 可增加桌面 UI 验证证据；会话闸门与 broker 凭据 fail-closed |
| Harness 运行底座（V8.42） | `custom/server/harness/harness-controller.ts:8-12`：nine-layers/process-quality/resume-plan/policy-decisions/run-manifests/budget-status 等 | §2.6.6 已有；本批只把证据入口挂到新 IA 的⑥治理与全流程推演面 |
| 并行派发安全条款 | `custom/server/pipeline/pipeline-engine.ts:14` `DISPATCH_SAFETY` | 派发词自带「worktree 隔离/互不等待/做完即止」，步 9/13/18 派发语义同步 |
| 文档编排器 | `custom/server/pipeline/doc-orchestrator.ts` | 步 14/23/24 的汇总类工作可并行拆片，不再串行等待 |
| 并行评审编排器 | `custom/server/pipeline/parallel-review.ts` | G5 多腿评审的已产品化骨架，步 20 可引用 |

### 1.7 在途能力（不在本批基线）

以下能力在并行分支、尚未合入 main，本批不把它们当产品事实写入 26 步判据：V8.43 run21 收官归档批（`9b29b4a7`）、IDE 深度重构（`8cdc2a33`）、技能供给对账 P1/P2（`0116e52d`）、active-no-artifact 检测器接线（`0c405a28`）。方案只在 §2.5.1 末尾以「在途」注记，不进入拍摄位与验收线；合入后按纪律 75 重开对账。

## 二、裁决

- D-1（操作面）：26 步的界面操作面一律以「左侧导航 + 阶段页 `?tab=` + 全流程推演专区」为规范入口；旧 `/app/gov/*`、`/app/sim/trace|delivery`、`/app/accounts` 等只作重定向兜底，不再作为拍摄位首选。
- D-2（版本）：正本升 V8.44；V8.43 是并行分支的 run21 收官归档批，未合入 main，本批不重复其内容，版本号让位不冲突。
- D-3（冻结面）：26 步主链、STEPS 键、六道关卡、§3.3 完成键、七幕名、模板字段语义零改动；只改操作路径、证据面、术语与采集位。
- D-4（拍摄位）：能迁尽迁到阶段页规范 URL；`devimpl_done`/`ide_done` 保持 `/app/ide?task=`；`report_view` 保持 `/app/sim?run=`。appinit 直指 `/app/stage/govern?tab=docs`（编辑器实体在文档评审签管理维护区，不经 redirect 落 gateLog）。
- D-5（新增检查）：prelaunch ⑲ 扩为「左侧栏 + 阶段页签 + 全流程推演 + 检索」四组标记；新增 ㉑「IDE 任务工作区端点编入生效 dist」；㉒「阶段页签注册表与重定向矩阵在位」。
- D-6（术语）：产品面文字按新 IA 用词——仿真中心→全流程推演、治理中心→⑥治理、旅程首页→流程总览、驾驶舱→工作台、运行中心→全流程推演·运行总览、场景编排→运行编排、仿真设置→推演设置。推演叙事词（七幕名、26 步步名、判词/姿态/闸）不改。
- D-7（报告）：报告第 0 章产品面描述与 26 步图注用新 IA；历史轮次报告不回溯改判。
- D-8（残留）：`stage-meta.ts` 的 `tools` 仍写旧路由（`/app/gov/docs`、`/app/sim/trace` 等），因全部 redirect 可达，登记为产品侧欠账，不在本批改产品代码；采集位以本表为准。

## 三、26 步拍摄位映射表（capture-plan.env 裁决明细）

语义=该步证据在产品哪里可见；锚点=拍摄断言用选择器或页面标记。步号以方案 §2.4 为准。

| 步 | 键 | 新拍摄位 | 账号 | 语义/锚点 |
|---|---|---|---|---|
| 1 | smoke_done | `/app/stage/setup?tab=accounts` | fanfan | ①搭建·账号：30 账号在列（`AccountAdminView`） |
| 2 | appinit_done | `/app/stage/govern?tab=docs` + 滚动 | fanfan | 文档评审签管理维护区应用资产表（`[data-testid=app-registry-editor]`） |
| 3 | login_done | `/app/stage/setup?tab=accounts` | fanfan | 登录后就绪面；账号页可达 |
| 3a | people_done | `/app/stage/setup?tab=org` | fanfan | ①搭建·组织：组织名册（`[data-testid=org-editor]`） |
| 5 | g1_frozen | `/app/stage/reqs?tab=docs` | fanfan | ②需求·文档评审：冻结工件与 AC（G1 工件区） |
| 7 | room_done | `/app/s/chat` | fanfan | 沟通协作·分析群会话列表 |
| 8 | register_done | `/app/stage/design?tab=tasks` | fanfan | ③分析设计·任务分解：RFD 主卡与任务卡 |
| 11 | analysis_done | `/app/stage/design?tab=analysis` | fanfan | ③分析设计·系统分析：tasklist 核验 |
| 12 | triage_done | `/app/stage/build?tab=board` | chen | ④开发·看板：chen 板分诊卡 |
| 13 | anexec_done | `/app/stage/design?tab=analysis` | fanfan | ③分析设计·系统分析：四份分析稿 |
| 14 | review_done | `/app/stage/design?tab=analysis` | fanfan | ③分析设计·系统分析：概设定稿 |
| 15 | g2_arch_pass | `/app/stage/design?tab=tasks` | arch | ③分析设计·任务分解：arch 板 G2 评审卡 |
| 16 | close_done | `/app/stage/design?tab=tasks` | fanfan | ③分析设计·任务分解：主卡归档 |
| 17 | plan_done | `/app/stage/design?tab=schedule` | fanfan | ③分析设计·排期：排期卡挂接 |
| 18 | devimpl_done | `/app/ide?task=DEV-PAYCORE-S` | fanfan | IDE 工作区·任务简报（任务工作区/任务会话两块） |
| 19 | testpass_done | `/app/stage/build?tab=board` | qi | ④开发·看板：qi 板测试卡 |
| 20 | release_done | `/app/stage/accept?tab=g5` | fanfan | ⑤验收·G5 审批：人工批准留痕 |
| 21 | uat_done | `/app/stage/accept?tab=trace` | fanfan | ⑤验收·需求追溯：AC 判定链 |
| 22 | workmgr_done | `/app/stage/accept?tab=delivery` | fanfan | ⑤验收·交付健康：跨账号板状态分布（`[data-testid=capacity-section]`） |
| 23a | audit_done | `/app/stage/govern?tab=audit` | fanfan | ⑥治理·审计与变更：审计意见书 |
| 23b | deliver_gate | `/app/stage/accept?tab=cases` | fanfan | ⑤验收·交付案例：六道质量门灯 |
| 24 | retro_done | `/app/stage/govern?tab=metrics` | fanfan | ⑥治理·度量检查：治理度量 |
| 25 | ide_done | `/app/ide?task=DEV-PAYCORE-S` | fanfan | IDE 工作区·任务简报与 git 图谱 |
| 26 | report_view | `/app/sim?run=<runId>` | fanfan | 全流程推演·运行总览：报告查看面 |

### 新增 IA 面帧（帧命名锚通道，不占必采分母 15）

| 帧名 | 拍摄位 | 语义 |
|---|---|---|
| ia-leftnav | `/app/stage/build?tab=today` | 左侧导航五组常驻 + 顶部上下文栏 |
| ia-stages | `/app/stage/accept?tab=overview` | 阶段页单层页签（⑥治理可再加 `/app/stage/govern?tab=clearance`） |
| ia-sim | `/app/sim` | 全流程推演专区与运行上下文 |
| ia-search | `/app/search` | 全站检索五类对象与工作区过滤 |
| ia-task-workspace | `/app/ide?task=<任务ID>` | IDE 任务工作区根与任务会话块 |

缺席记问题单 `type=ia-frame-missing`，按纪律 40⑩ 处置；不占 15 项分母。

## 四、方案正本引用点对账表（V8.42→V8.44）

行号为 `main` `b313ba08` 快照行号，改稿时以内容定位为准。裁决词汇：重锚=改表述/路由，语义不变；扩节=小节升格；新增=新条款；确认=复核后不动。

| # | 位置 | 现状 | 裁决 |
|---|---|---|---|
| S1 | L86 版本定位行 | 现行 V8.42，按顶栏六阶段/旅程首页描述 | 重写：V8.44 左栏+阶段页签+全流程推演；注 V8.43 在途 |
| S2 | L44-72 词表 | 工作台=顶栏六阶段+旅程首页；仿真中心六签；治理中心七签 | 重写 4 词条，新增 5 词条（左侧导航/阶段页签/全流程推演区/检索/任务工作区） |
| S3 | L476-495 步 4 冒烟 | 页头六阶段、仿真中心运行总览 | 重锚：左侧栏五组+顶部上下文栏+全流程推演 |
| S4 | L500-535 步 5/6 | 治理中心·文档评审签/组织编辑器 | 重锚：⑥治理·文档评审 / ①搭建·组织 |
| S5 | L536-553 步 7 | 治理中心·文档评审签 G1 工件区 | 重锚：②需求·文档评审 |
| S6 | L593-650 步 10-12 | 看板/分析 | 重锚：③任务分解/系统分析、④看板 |
| S7 | L671-748 步 14-17 | 看板/排期 | 重锚：③分析设计四签 |
| S8 | L749-800 步 18-19 | IDE/运行监控 | 重锚：IDE 任务工作区；④开发·看板/质量与测试 |
| S9 | L801-847 步 20-21 | 审批收件箱/仿真中心·需求追溯 | 重锚：⑤验收·G5 审批/需求追溯 |
| S10 | L848-883 步 22-23 | 仿真中心·交付健康/运行总览 | 重锚：⑤验收·交付健康/⑥治理·审计 |
| S11 | L884-919 步 24-25 | 治理中心/IDE | 重锚：⑥治理·度量检查；IDE 任务工作区 |
| S12 | L920-935 步 26 | 旅程首页/看板/IDE 三界面、/app/runs | 重锚：流程总览/看板/IDE；全流程推演运行总览 |
| S13 | L958-1035 §2.5 大表 | 旧路由与旧页签名 | 整表重写：26 步对应阶段页签（见 §三） |
| S14 | L1037-1045 路由与页签事实块 | 顶栏六阶段+仿真/治理中心六/七签 | 重写：左栏五组+阶段页 29 签+全流程推演 6 签+检索+重定向矩阵 |
| S15 | L1048-1070 §2.5.1 | 时序六阶段 IA 与旅程首页（V8.37） | 扩节：V8.44 左栏/阶段页签/推演区分批事实；旧段保留为历史层并加「已被 V8.44 取代」 |
| S16 | L1094-1130 §2.6 各条 | 仿真中心/治理中心产品面 | 术语重锚 |
| S17 | L2091-2096 §5.6 五面与 IA 面帧 | 度量=/app/gov/metrics；IA 帧=旅程+页头六阶段 | 重锚：度量=/app/stage/govern?tab=metrics；IA 帧=左栏/阶段页/推演区/检索/任务工作区 |
| S18 | L1730 纪律 75 | 单一事实源=stage-meta.ts+routes.ts；四处消费面 | 重锚：单一事实源增 stage-tabs.ts/IaSideNav.vue；四处消费面保留，补「报告叙事与词表」 |
| S19 | L1071-1126 §2.6.6 | Harness 运行底座九层 | 确认不动；补一句证据入口在⑥治理/全流程推演 |

确认不动：26 步名与编号、§3.3 完成键、六道关卡判据、七幕名、§5.8.3 外部标准表、模板字段语义。

## 五、harness 引用点对账表

| # | 文件:位置 | 现状 | 裁决 |
|---|---|---|---|
| H1 | `mux/capture-plan.env:38-63` 生效位 | 旧 `/app/gov/*`、`/app/sim/trace|delivery`、`/app/board` 混合 | 按 §三逐行迁阶段页规范 URL |
| H2 | `mux/capture-plan.env:1-35` 头注 | V8.37 六阶段/旅程口径 | 更新：左栏五组+阶段页 29 签+全流程推演 6 签+重定向矩阵 |
| H3 | `mux/capture-plan.env:66-95` 动态位/IA 面帧 | 旅程首页+页头六阶段 | 改为流程总览/左侧栏/阶段页签/推演区/检索/任务工作区 |
| H4 | `mux/steps_entry.py:1-75` | 旧 IA 全表 | 逐行重锚新 IA；头注勘误史续写 2026-10-18 |
| H5 | `aipay-scenario.sh:193-303,421-2649` capture_step call site | 旧 URL/旧注释 | 同步 canonical URL；注释按阶段页签改写 |
| H6 | `mux/mx-prelaunch-check.sh:57-61` ⑲ | 只查 stage/setup+ia2.journey | 扩四组标记；新增 ㉑ 任务工作区端点、㉒ 阶段页签/重定向矩阵 |
| H7 | `mux/report_narrative.py:536-552` | 旅程首页+页头六阶段+治理中心/仿真中心 | 重写：流程总览+左侧栏+阶段页签+全流程推演 |
| H8 | `mux/mx-report-gen.py` 通用图注/产品路径参考 | 驾驶舱/治理中心/仿真中心旧词 | 术语映射；按轮叙事注册不动（历史轮不回溯） |
| H9 | `mux/glossary.txt` | 无左栏/阶段页签/推演区/检索/任务工作区词条 | 增补五词，过 jargon 门禁 |
| H10 | `README.md` Harness 运行面节 | 已含 V8.42 | 补一句 V8.44 采集位与 prelaunch 新增检查 |

## 六、验收

1. `bash -n aipay-scenario.sh`、`python3 -m py_compile mux/steps_entry.py mux/report_narrative.py mux/mx-report-gen.py` 通过。
2. `bash tests/run-gates.sh` 全绿；jargon 词表与方案同步零 HARD。
3. `mx-prelaunch-check` 新增 ⑲/㉑/㉒ 在生效 dist 上可复现（旧 dist 应红，新 dist 应绿）。
4. `capture-plan.env` 每个生效位 URL 可达（旧键 redirect 兜底不替代规范 URL）；26 步无孤儿键、无重复帧 id。
5. 方案 26 步 `**步 N｜` 解析锚、STEPS 键、六道关卡未被改动（生成器/审计器回归）。
6. 报告叙事中产品面描述与词表一致；历史轮次报告不回溯。

## 六之二、产品欠账清偿记录（2026-10-19）

- `stage-meta.ts` 六阶段工具卡路由从 `/app/gov/*`、`/app/sim/trace|delivery` 全部迁到阶段页规范路径（`/app/stage/reqs|design|build|accept|govern`），`name` 同步为 `ia2.stageN`；工具卡本身已不渲染，但 `stage-attribution` 仍消费其路径，迁移后归属判定与重定向零冲突。
- `routes.ts` 的 `IA_AREAS` labelKey 已是 `ia2.nav.stage1..6`（旧「六行同指 ia2.nav.collab」欠账在左侧栏批已清），本批复核确认。
- `IaCentersNav.vue`、`IaQuickNav.vue`、`IaViewSwitcher.vue` 已不存在；本批删除无引用的旧导航入口 `IaJourneyEntry.vue`、`IaOverviewEntry.vue`、`GovernanceNavEntry.vue`，并移除对应孤立测试块。
- 用户可见导语：运行编排「十九项机械检查」→「二十二项」；「仿真环境的开关面板」→「推演设置」；页签导语注释统一为全流程推演/⑥治理。
- 保留项（非欠账）：`/app/gov/*`、`/app/sim/trace|delivery`、`/app/runs` 等旧路由的重定向是零断链设计，不删除。

## 六之三、2026-10-19 全页走查结构修复批

- 运行选择器：自动选最新一轮（HEAD 已有）+ 运行中心 `sim-<目录>` 复合 ID 归一为目录名，修掉 `?run=sim-…` 导致的 run-state 404；流程总览/推演总览/阶段页不再停在「选择运行…」空态。
- 工作台 `/app/collab`、`/app/dash` 补 `standaloneEmbed` 元数据；新增补丁 665 让 GroupChatView 嵌入态只 join 不改父路由，工作台不再跳到 `hermes.groupChatRoom`。
- 阶段页 G2 页签补 `TAB_COMPONENTS.g2` 映射（此前整页空白）。
- 工作台 `.wb` 三栏轨道内联 `display:grid`，压过全局同名 `.wb` 的 flex 覆盖，恢复 280/自适应/480 三栏。
- 推演总览 26 步表在 2/3 轨道内横向溢出会压住右栏六道门：左栏加横向滚动、表加最小宽。
- 治理仓根统一 `GOVERNANCE_REPO → OBS_SIM_ROOT/central/aipaydev → 历史 NVMe` 回落；`inject.mjs` 校验上游 custom 符号链接目标，修并行 worktree 旧链接导致服务端编旧代码。
- 推演程序：`ensure_studio_up` 注入 `OBS_SIM_ROOT/SIM_BRANCHES_REPO/SIM_ANCHOR_REPO`；product-dist 快照新鲜度改服务端入口+客户端 index 双 mtime。
- 验证：overlay 全量 720 文件/5237 用例通过、8 跳过；simharness 门禁 8 文件/181 用例全绿。

## 七、取代声明

- 本文取代《2026-10-17-fullflow-plan-harness-ia-reconciliation.md》作为**当期**对账总表；旧表冻结为历史依据（其 V8.37 裁决对当时有效）。
- 本文是 V8.44 批方案 §2.4/§2.5/§2.5.1/§5.5/§5.6/词表/纪律 75 与 harness 六件的裁决依据。
- 产品 IA 再变更时按纪律 75 重开新表；旧路由经 redirect 可达不豁免对账。

## 决策记录

- D-1（2026-10-18，自动执行）：按「最新产品面为规范入口、旧路由只作兜底」重构方案与采集位；26 步/六闸/键空间冻结。
- D-2：V8.43 未合入 main，本批让号 V8.44，不合并并行分支、不 cherry-pick。
- D-3：本批不修改产品代码；`stage-meta.ts` 旧工具卡路由登记为产品侧欠账（全部 redirect 可达）。
- D-4：报告按轮叙事注册表不批量改历史轮；只改通用叙事与产品路径参考表。
- D-5（2026-10-18）：origin/main 并入后方案正文重复一行「文档定位」（合并侧残留），本批删除重复行；26 步/六闸/STEPS 键零改动。
