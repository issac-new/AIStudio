# 附录 B：实施计划与研究/复盘档索引（54＋31）

> 附件，非正本。覆盖 `overlay/docs/superpowers/plans/` 54 份与 `overlay/docs/` 顶层 31 份研究/复盘档。核实日 2026-10-21。

## B.1 实施计划 54 份

| 文件名 | 主旨 | 落地状态 |
|---|---|---|
| 2026-06-19-kanban-comment-bar | 评论移底部、输入 sticky、气泡化 | 已实施 |
| 2026-06-19-matrix-account-integration-plan | Matrix 登录为主认证，账户接 admin API | 已实施 |
| 2026-06-21-overlay-architecture-migration | 二开迁独立 overlay 仓 | 已实施 |
| 2026-06-22-cockpit-techdebt-batch0-testinfra | 修 vitest alias，13 测试可执行 | 已实施 |
| 2026-06-22-cockpit-techdebt-batch1-codequality | 抽种子、迁样式、校审计 | 已实施后被替换 |
| 2026-06-22-cockpit-techdebt-batch2-graph-to-timeline | 图节点切换时序 | 逻辑保留、UI 退役 |
| 2026-06-22-cockpit-techdebt-batch3-node-occupants | 节点在场者圆点 | 已退役 |
| 2026-06-22-cockpit-techdebt-batch4-visual-polish | 视觉细化 | 已实施后退役 |
| 2026-06-22-decouple-kanban | Swarm 看板独立路由 | 已实施 |
| 2026-06-22-login-remember-me | 登录记住账号密码 | 已实施 |
| 2026-06-22-matrix-techdebt | 上传/转发/搜索/音视频占位 | 已实施 |
| 2026-06-22-swarm-studio-cockpit-p1 | 三栏骨架+左栏 Kanban+注意力条+选中联动 | 已实施后退役 |
| 2026-06-22-swarm-studio-cockpit-p2 | 中栏协作图+时序事件流 | 已实施后退役 |
| 2026-06-22-swarm-studio-cockpit-p3 | 右栏 A2UI 工作区+文件树 | 已实施后退役 |
| 2026-06-22-swarm-studio-cockpit-p4 | 模式切换+协作入口+嵌入式聊天 | 已实施后退役 |
| 2026-06-22-swarm-studio-cockpit-p5 | Claude Code 终端+历史回溯+归档只读 | 部分保留（终端） |
| 2026-06-22-swarm-studio-cockpit-p6 | A2UI 模板化+协作图关系标签 | 已退役 |
| 2026-06-22-threads-migration | Threads 对齐 element-web | 已实施并保留 |
| 2026-06-23-attention-kanban-filter | 注意力筛看板 | 逻辑保留、UI 退役 |
| 2026-06-23-cockpit-history-filters | 历史五类筛选 | 逻辑保留、UI 退役 |
| 2026-06-23-cockpit-kanban-integration | cockpit 100% 真数据 | 已实施（15 adapter） |
| 2026-06-23-cockpit-notify-panel | 未读聚合直达 | 部分保留 |
| 2026-06-23-cockpit-rightsidebar-gaps | 右栏 12 项补齐 | 已实施后退役 |
| 2026-06-23-cockpit-schedule | 日程月历+待办 | 已实施并保留 |
| 2026-06-23-cockpit-workspace-redesign | 工作项三区+附件 API | 已实施后退役 |
| 2026-06-23-kanban-search-and-taskid | 跨源搜索+混合分组 | 部分保留 |
| 2026-06-24-cockpit-workitem-kanban-migration | 抽屉要素迁工作项 | 已实施后退役 |
| 2026-06-24-filter-gateway-shutdown-notice | 网关告警紧凑提示 | 已实施 |
| 2026-06-24-gateway-notice-banner | 可关闭粘性横幅 | 已实施 |
| 2026-06-27-run-trace-view | 纯前端证据图+技能下钻 | 已实施并保留 |
| 2026-07-11-loop-engineering | 个人层五阶段引擎 | 已实施后被图引擎取代 |
| 2026-07-12-loop-engineering-phase2-3 | 团队层/SaaS 层 | 已实施、适配器保留 |
| 2026-09-09-loop-graph-p0-kernel | 图内核（守卫/终止/日志/checkpoint） | 已实施 |
| 2026-09-09-loop-graph-p1-production-switch | 图内核接管+双跑+断链修复 | 已实施 |
| 2026-09-10-loop-graph-p2-runcenter | 运行中心五件+R1 Brief | 已实施 |
| 2026-09-10-loop-graph-p3-ia | 六区导航+旧 cockpit 退役 | 已实施 |
| 2026-09-11-loop-graph-p4-orchestrator | 可视化编排器+台账清偿 | 已实施/部分 |
| 2026-09-16-ide-main-page | IDE 主页 | 已实施 |
| 2026-09-16-loop-graph-multiview | 壳+四场景 | 已废弃（被六阶段/三模式取代） |
| 2026-09-18-delivery-protocol-m1 | 交付三事件+索引+HumanGate | 已实施 |
| 2026-09-18-ide-zcode-3123-parity-v2 | /ide 对齐 3.12.3 | 部分实施 |
| 2026-09-20-cockpit-mvp-breakdown | 七切片 R0+M-A..G | 部分实施/被吸收 |
| 2026-09-20-m-a-protocol-v2 | 协议六字段族+两级索引 | 已实施 |
| 2026-09-20-m-a-registration-runbook | Synapse bot 注册通道实测 | 已执行 |
| 2026-09-23-zcode-foundation-r1 | zcode 编码回合可运行性实证 | 已执行 |
| 2026-09-23-zcode-foundation-r4 | hermes↔zcode WS 通道 | 已实施 |
| 2026-09-24-qgate-v0.1-landing-plan | QGate v0.1 落地 | 已执行闭环 |
| 2026-10-10-parallel-capability-phase3-impl | 并行粒度 estimate_days 全链 | 已实施 |
| 2026-10-11-run15-prelaunch-plan | run15 前十件四批 | 全部完成 |
| 2026-10-12-run15-retro-report | run15 复盘 | 已交付并修复 |
| 2026-10-12-v816-saturation-parallel-draft | 全阶段饱和并行 | 已并入 V8.16 |
| 2026-10-16-three-centers-implementation-plan | 三中心 36 工单 | 部分实施 |
| 2026-10-18-ide-workspace-deep-improvement | 13 缺陷四类结构债 | 部分实施 |
| 2026-10-19-eval-closure-and-baseline-repair | 处置单+冻结复评+机械关闭 | 已实施 |

## B.2 研究/复盘档 31 份

| 文件名 | 来源 | 核心结论 | 落地去向 |
|---|---|---|---|
| 2026-10-01-upstream-absorption-analysis | 12 上游组件 | 差距在消息面/轨迹/治理暗能力；27 项收口 | Spotlight/线程/轨迹账本/证据契约 |
| 2026-10-01-upstream-absorption-round2-exhaustive | 12 组件+69 IMP | 最大未利用面是上游自身 | Web 终端/会话搜索/changelog/房间排序 |
| 2026-10-04-nine-sources-harness-research | 8 文+DSH 文档 | 弱在工具瀑布/按需暴露/UI 插槽/评估量化 | Blast Radius/四层评估/P1-P12 |
| 2026-10-02-swarm-capability-research-4articles | 动态本体/驾驭工程/无损换窗 | KG 演化/治理量化/无损换窗三缺口 | KG 批量熔断回滚、六类成本、verbatim |
| 2026-10-05-run8-retrospective | run7/8 实测 | 带伤完成；六型 Bash 静默+投递丢弃 | fail-visible 门禁、载荷挂驱动、投递兜底 |
| 2026-10-09-run11-retrospective | run11 五次 attempt | 容量双重失配+G5 低效+报告无守门 | 并发 30、event_id 锚、多锚等待 |
| 2026-10-09-run11-retrospective-fixes | run11 报告+代码 | 报告视觉零缺陷，实质在运行时 | 完成闸 422、ACP L1、容量 30 |
| 2026-10-10-run13-retrospective | run13/V8.4 | 报告机器面 12+7+5+7 项缺陷 | F1-F18、issue_once、段界行 |
| 2026-10-11-run14-retrospective | run14/V8.8 | 结论可信、证据不可信 | V8.9 证据面、起跑预检、版本锚 |
| 2026-10-16-run20-retrospective | run20 报告+实物 | 存在性判据取代归属判据 | 纪律 70-74、report_truth、清偿门 |
| 2026-10-15-run20-supervisor-rescue-and-inspector-closure | run20 监督日 | 5h 孤儿、验收命令 bug、上 main 当生效 | 纪律 67-69、检测器闭环 |
| 2026-10-16-run21-prelaunch-checklist | run20 复盘 | prelaunch 十八项；四项待首验 | 起跑门禁清单 |
| 2026-10-04-48h-audit-closeout | 24 会话盘点 | 7 待办+8 裁决全处置；3 静默坑 | mx-clean 兜底、全角变量修复 |
| 2026-10-04-background-work-awareness | run8 驾驶舱 | 执行环是盲区，需活体感知三件套 | 卡徽章、顶栏 chip、run-progress |
| 2026-09-30-org-design-semantica-research | 组织方法论+Semantica | 五流断点/机制归因/决策溯源缺口 | org-diagnosis、决策图谱、PROV-O |
| 2026-09-29-change-gov-three-accounts-research | 变更治理/三账 | 分级/SLA/五维评估/三冻结缺口 | change-gov 域、三账页签 |
| comm-collab-v13-research | multica/routa 源码 | 沟通页缺活动指示/分诊/语义回放 | activity.ts、AttentionList、语义块 |
| comm-collab-v14-unified-chat | 用户指令+协议实证 | 双侧栏根因=上游画布自带；matrix 只统一传输 | Phase1 UI 统一；Phase2 ChatBridge |
| 2026-10-01-absorb-round2-remaining-plans | 二轮剩余四项 | 四项方案与代价 | settings 分层、团队卡、契约库 |
| 2026-10-01-plugin-seam-definition | DSH/dsh-TUI 等 | 插件八组 24 缝，只读优先 | 插件宿主设计资产（未实施） |
| 2026-10-01-tasks-flat-tabs-refactor | 用户裁定+页签盘点 | 二级页签清零，治理五区拆平 | 8 单层页签、路由重定向 |
| absorption-domain-README | 吸收域索引 | 吸收事实单一索引入口 | 索引+验证资产清单 |
| 2026-10-02-sim-perf-rootcause-and-fix | run7 实测 | background_review 空转占 79% | 自动 review 关闭、12 卡点 |
| 2026-10-03-full-regression-report | 42 路由回归 | 9 缺陷修 8，含 P0 整页冻结 | 524 import、550 i18n、551 路由 |
| 2026-10-03-ux-review-cockpit | 101 跳转点 | 联动连贯；管理面四套/任务五呈现/计数四口径 | 管理面跳转、useAttentionRows |
| 2026-10-17-swarmstudio-frontend-ux-consolidation-report | 全页面复盘 | 605 裸 hex/1700 死 fallback/25 幽灵变量 | raw-hex 预算、共享空态 |
| 2026-10-18-ide-workspace-full-regression | 17 页签回归 | 修 13 项+15 探针自检；媒体内联 401 | boot 会话、文件根、自检入口 |
| 2026-10-06-product-backlog-schedule | 差异审计五件 | 五件销账；看板是 DOM；审批统一不做 | testid、runs 摄取、prework 门禁 |
| 2026-10-16-agent-security-check-report | 6 域 20 项 | 0 完全符合、4 不符合；三重症 | 整改 P0-P2、十项挂起 |
| 2026-10-16-agent-security-checklist | 外部审查材料 | 20 项判据只认配置/代码/日志 | 检查报告骨架 |
| windows-x64-setup | win-x64 排查 | 注入/构建已根治；须 Windows 打包 | junction、autocrlf、serve |
| 2026-10-21-wx-3accounts-research | 三公众号全量精读 | 295 篇语料/126 借鉴项；五路线/三环节/FDE/DDD 六件套/四层评测/κ 校准；14 项挂账 | wx-research-absorption 六件 |

## B.3 主题聚类与关键结论

**T1 上游吸收与插件接缝（5 份）**：首轮 27 项实为「六件早已存在、八件新落、三件记档」；二轮把最大缺口指向上游自身六个有而没用的面；69 条改进点约 45 条已被覆盖。纪律固化：核实优先于重造、落点只在既有功能区、运行通道缺失不做空 UI。锚点：`2026-10-01-upstream-absorption-analysis:7-27`、`round2-exhaustive:86-94`、`:199`。

**T2 外部文章与组织协作（4 份）**：九源收敛为工具瀑布/按需暴露/UI 插槽/评估量化四缺口；四文指出 KG 演化治理、驾驭工程量化、无损换窗三弧线；组织设计给五流断点与机制归因；变更治理给 L1-L4/SLA/五维/三冻结。锚点：`nine-sources:43-68`、`4articles:5-8`、`org-design:18-35`、`change-gov:84-108`。

**T3 方案结构演进（4 份）**：V6 认定 run7 约 4 小时耗在未定义行为面；V7 认定五层混编、报告五块拼凑；V8 审计指出机制层高兑现、产品承载层系统性旁路；性能根因 background_review 空转 79%。锚点：`v6-plan-issue:9`、`v7-structure-audit:5-7`、`v8-intent-gap:5,29`、`sim-perf:23-24`。

**T4 运行复盘与门禁纪律（12 份）**：run8 六型静默；run11 容量双失配+G5 六轮；run13 报告声称≠台账；run14 结论可信≠证据可信；run15 六闸全过仍采集退化；run20 存在性判据+代偿 179 笔+监督器死 5h。共沉淀纪律 70-74、prelaunch 18→30、report_truth 三件、部署三件套。锚点：`run8:12-18`、`run11:24-29`、`run13:21-66`、`run14:19-59`、`run15-retro:30-75`、`run20:36-54`、`run20-supervisor:17-43`。

**T5 三栏驾驶舱演进（24 份）**：三栏 UI 组件已全部退役，store/adapter/RunTrace/Schedule/Terminal 以新形态保留；数据纪律从自持种子转 computed+15 adapter；代价约 3000 行死视图。锚点：`cockpit-kanban-integration:5,1583`、`background-work-awareness:11-18`。

**T6 IA/UX 与 IDE（10 份）**：二级页签清零、治理拆平；101 跳转点测绘证明「需要注记才能用的界面=职责不清晰」；605 裸 hex 收编 token；IDE 修 13 项+15 自检。锚点：`tasks-flat-tabs:33-40`、`ux-review-cockpit:22-25`、`frontend-ux-report:47-66`、`ide-regression:21-44`。

**T7 Loop/Graph 与运行中心（7 份）**：单引擎+State Store → 图唯一主干+事件日志；P0 内核、P1 双跑接管、P2 运行中心、P3 六区 IA、P4 编排器。锚点：`loop-engineering:5`、`p0-kernel:5-7`、`p1-switch:5-7`、`p2-runcenter:5`、`p3-ia:5-7`。

**T8 Matrix 协作与协议（10 份）**：协议 v2、交付三事件、HumanGate；统一聊天裁定「matrix 传输+本地编排+ChatBridge」。锚点：`m-a-protocol-v2:10,83-87`、`comm-collab-v14:21-38,77,119`。

**T9 基建/安全/评测/平台（12 份）**：overlay 边界、qgate 六态、zcode 通道、并行三期、eval 收口、安全 20 项、Windows 硬约束。锚点：`overlay-migration:5-7`、`qgate-v0.1:3-5`、`zcode-r4:7-10`、`parallel-phase3:4`、`eval-closure:3`、`security-check:10-16`、`windows-x64:82-116`。

## B.4 根因索引（42 条，运行与方案复盘）

运行：run8 投递丢弃假停摆/六型 Bash 静默/日志零增长判死；run11 容量双失配/G5 单人七要素/报告无守门/判活双骗/协议只看进程死亡；run13 声称≠台账/DISP 类型广播/三态不闭合/`$NOW` 夹具/并行度无主/采集未挂驱动；run14 40 帧补拍/数字失真/全局降级开关/镜像树落后/证据链软约束；run15 安全闸时序/派单无新鲜度/FAIL 无修复分支/采集退化；run20 存在性判据/问题单空渲染/清偿门未执行/合 main≠生效/监督器 5h；方案：V6 五类未定义行为面；V8 产品承载旁路；性能 background_review 79%。

## B.5 被证伪的假设（50 条，节选）

响应投递丢弃=偷懒；日志零增长=死亡；`id(event)` 可作年龄键；并发闸 1 够用；G5 单人一次产出；报告声称=台账有单；DISP 类型广播归属正确；三态计数天然闭合；`$NOW` 不冒充；采集已挂驱动；补拍=当轮证据；正则前缀可统计缺陷；全局降级=逐步降级；镜像树同步；四查全过=证据可信；安全闸时序不冲突；存在即属本轮；清偿门会执行；合 main=生效；日志新鲜=进程存活；ls-tree 递归；看板是 canvas；配置存在=工具集有效；20 项有完全符合；Semantica 已活用；RSI 闭环=能力提升；密封分数可指导更新；冲突检测跨批次；shift/compact 够用；matrix 可统一本地编排；管理台职责清晰；十余套空态可接受；文件面板标签=根已接线；下载可 query token；/tmp 安全作业区；测试文件相对定位。

## B.6 明确不做（34 条，节选）

音视频/Jitsi/PSTN；贴纸宠物特效；Mjolnir/身份发现/3pid；spaces；kimi tower；Tauri+Rust；iOS；新增一级页；claude mods/codex pets/esp32；主会话 append-only/进程沙箱/完整 Mods；QGate MCP/变异测试/NFR 性能门/独立仓；三中心二级页签；统一聊天改 standaloneChat；IDE 云分享/更新族/SSH/WSL/CUA Helper；Loop 虚拟化/Best-of-N/协作编辑；run15 前沙箱/per-agent 限额；审批统一（用户裁定不做）；run6 补图；41GB 交换重启；变更治理批准后联动/关键路径/Matrix 通知；组织跨机联邦；comm 运行中 STEER/证据包门禁。

## B.7 平台与工程边界（节选）

Windows：junction 免特权、autocrlf=false、安装包须 Windows 原生构建、runtime pin 需环境变量绕行。
插件：八组 24 缝，只读优先，不开一级路由与特权写面。
上游：最大未利用面是自身六个面；上游已更名 ekko-studio。
前端卫生：目录级 raw-hex 预算 ratchet + 幽灵变量断言。
变更治理：L1-L4 SLA 24/48/120/168h + 五维评估 + 三级冻结 409。
评测收口：不可变版本快照 + 同卷指纹复评 + 处置单机械关闭 + 回流回归库。
并行：宽度=工位数，testpass 分片各写 testlog，聚合幂等。
作业区：worktree 固定 lab 卷，`/tmp` 与 `.claude` 非安全作业区。
