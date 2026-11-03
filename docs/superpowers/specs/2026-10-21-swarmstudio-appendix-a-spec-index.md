# 附录 A：产品面全量 spec 索引（507 份设计/规格/决策文档）

> 附件，非正本。供「AIStudio 终态设计文档」检索与审计；每条给主旨与结论或状态要点。
> 覆盖与计数（2026-10-28 v1.0.2 发布批后复核：main 376＋目录整理 1＋预检单仓 1＋清偿 1＋run23 两批 2＋对账发布 1＋v1.0.2 发布 1；2026-10-29 ＋安装目录 1＋目录校正 1；2026-10-30 ＋swarm-yuan ub-mode 吸收 1＋HelixHarness 吸收 1＋并行批次 9；2026-10-31 ＋日常工作台回归 1＋产品能力收尾 1＋回归批②deviceId 1＋计数对齐 1＋全功能回归修复 1＋三区全量回归 1＋活体验证收案 1＋日常调研吸收 1＋Loop Graph 任务台账 1＋三区回归二轮 1＋三区未做收口 1＋恢复图 run 详情 1＋studio v0.8.0 升级 1＋RSI 二批 1＋品牌扫尾 1＋zcode 3.17.1 同步 1＋RSI P2 批 1＋v1.0.4 发布 1＋package-lock 版本归一 1＋run24 方案模板重锚 1＋prelaunch 跨轮残留门 1＋super-agent 吸收 A+B 批 1＋RSI 改进方案 1＋工作台概览三问重排 1＋super-agent 吸收 C 批 1＋编排域汇总投递 1＋模型波动加固 1＋pre-push 范围修正 1＋K19 响应形状修正 1＋runtime 回灌 1＋内核门下沉 1＋会话接线 1＋RSI 全量执行后的设计文档同步 1＋推演方案×程序同步二批 1＋编排定时轮与多板接入 1；2026-10-31 合并行去重说明：v0.8.0 升级批曾引入第二条覆盖行且枚举链缺 4 项，本批合并为一条＋RSI 首批执行方案 1；2026-11-01 ＋chat 回合自恢复立项补登记 1（edb3c6636 落 spec 未登记、docs-ssot-guard 主干红，本批清零）＋v1.0.5 发布 1；2026-11-01 ＋v1.0.6 发布 1；2026-11-02 ＋离线 Windows 安装包 1＋测试稳定性 DSL 1＋失败根因分类器 1＋MAET 检索协议 1＋测试词汇 1＋Grader 环 1＋载体对账 1＋技能面板 1；2026-11-02 ＋v1.0.8 发布 1＋方案同步代登记 1（3ec71fd4d 落 spec 未登记，本批代补）＋run25 工具链加固 1＋chat recovery kwarg 修复 1＋场景闸门韧性两件 1＋_sens 重放 unbound 修复 1＋监督器催办闸别分流 1＋机制治理批 1＋run25 全流程复盘 1＋run26 挂账台账 1＋v1.0.9 发布 1；2026-11-03 ＋run25 采集面补流 1＋run26 挂账清偿批 1＋v1.0.10 发布 1＋发布资产两包口径立法 1；2026-11-03 ＋swarm-yuan pstack 吸收批（pstack/addyosmani/mattpocock 源码级调研，12 项）1＋主动式 AI 综述吸收（介入治理）1＋Harmony 多目标演化吸收 1＋四性四格能力 1＋四性四格补齐 1）：只取 `docs/superpowers/specs/*.md` 直接根文件，不递归 `archive/`、`assets/`，不含 2 份 HTML。A.1 收 507 份实际设计、规格与决策文档（含历史业务 spec）；导航、整合正本、数字总账、合并来源地图、A-D 索引与退役拼接指针列入「角色/排除」表。两表不重叠，并集覆盖全部直接根 Markdown；文档不会仅因日期旧被排除。

## A.1 逐份索引（按文件归档序）

| 文件名 | 主旨 | 结论要点 |
|---|---|---|
| 2026-06-18-kanban-advanced-features-design | React 看板高级功能移植 Vue | 诊断条/编排/附件/富文本全量移植 |
| 2026-06-19-kanban-comment-bar-design | 任务抽屉评论输入固定底部 | 聊天式评论，底部留白 |
| 2026-06-19-kanban-maximize-resize-design | 抽屉最大化与评论框缩放 | 720px 可扩近全屏，textarea 原生拖拽 |
| 2026-06-19-matrix-account-integration-design | Matrix 与本地双认证统一 | 渐进迁移，混合角色解析，单账号来源 |
| 2026-06-21-overlay-architecture-design | 三上游仓与二开分离 | overlay A/B 注入，上游纯净 |
| 2026-06-22-cockpit-implementation-gap-audit | 驾驶舱实现与原型差距审计 | 骨架对、联动走样，P0-P2 修复 |
| 2026-06-22-cockpit-techdebt-batch0-testinfra-design | 驾驶舱测试基建 | overlay 自有 vitest config |
| 2026-06-22-cockpit-techdebt-batch1-codequality-design | 代码质量债 | 种子抽 fixtures、样式迁移 |
| 2026-06-22-cockpit-techdebt-batch2-graph-to-timeline-design | 图节点切换时序源 | 新增 nodeIds 过滤 |
| 2026-06-22-cockpit-techdebt-batch3-node-occupants-design | 协作图节点在场者 | 小圆点 hover，不做双栏 |
| 2026-06-22-cockpit-techdebt-batch4-visual-polish-design | 视觉细化三件 | rail 字号、canvas hint、banner |
| 2026-06-22-decouple-kanban-design | Swarm 看板解耦 | 独立路由，移除 patch 028 重写 |
| 2026-06-22-login-remember-me-design | 登录记住账号密码 | 双表单独立 localStorage |
| 2026-06-22-matrix-techdebt-design | Matrix 聊天七项债 | 上传/转发/搜索/通话提示 |
| 2026-06-22-swarm-studio-cockpit-design | 人机协作驾驶舱主界面 | 三栏、Pure Ink、状态三色 |
| 2026-06-22-threads-migration-design | Threads 对齐 element-web | RightPanel phase 模型 |
| 2026-06-23-attention-kanban-filter-design | 注意力项筛选看板 | attentionTaskIds 与手动筛选 AND |
| 2026-06-23-cockpit-history-filters-design | 历史回溯五类筛选 | 时间三选一、类别多选、状态三态 |
| 2026-06-23-cockpit-kanban-integration-design | 驾驶舱接真实 kanban | 16 决策、六 adapter、去 mock |
| 2026-06-23-cockpit-notify-panel-design | 顶栏通知接真实数据 | notify-adapter 归一 |
| 2026-06-23-cockpit-rightsidebar-gaps-design | 右栏功能补缺三批 | 最大化、快捷入口、频道跳转 |
| 2026-06-23-cockpit-schedule-design | 顶栏日程月历 | localStorage 待办加事件聚合 |
| 2026-06-23-cockpit-workspace-redesign-design | 工作项区重构 | 任务头、看板字段、A2UI |
| 2026-06-23-kanban-search-and-taskid-design | 看板搜索分组与任务 ID | 四源检索、混合分组 |
| 2026-06-24-cockpit-workitem-kanban-migration-design | 看板要素迁入工作项 | 字段草稿批量、动作即时 |
| 2026-06-24-filter-gateway-shutdown-notice-design | 折叠网关关闭告警 | 识别打标加灰条，不删消息 |
| 2026-06-24-gateway-notice-banner-design | 网关告警可关闭横幅 | Composable 加 localStorage 记忆 |
| 2026-06-27-observability-landing-analysis | 驾驶舱升级证据平面 | 补工具证据、运行图、证据卷宗三步 |
| 2026-06-27-run-trace-view-design | 运行 L1 证据图 | 纯前端 Socket 事件重构 Node/Edge |
| 2026-07-11-loop-engineering-design | 五阶段循环工程 | 单体引擎加 State Store，首期个人层 |
| 2026-07-16-framework-gates-domain-knowledge-design | 技术框架门禁与领域知识闭环 | ACTIVE_FRAMEWORKS 驱动 --framework，七框架知识带代码证据 |
| 2026-07-24-hermes-agent-019-kanban-migration-design | agent 0.19 看板能力迁移 | 已批准方案 A 四阶段；补字段、wrapper、事件/运行面与 URL 附件 |
| 2026-08-04-hermes-agent-020-kanban-migration-design | agent 0.20 看板能力迁移 | 迁移五项功能，补 reasoning/project/estimate CLI；repair 不做 |
| 2026-08-27-cockpit-terminal-multi-tool-design | 终端多编码工具 | 注册表 claude 优先，服务端探测 |
| 2026-08-28-terminal-pty-leak-postmortem | 终端 PTY 泄漏 P0 复盘 | WS 生命周期修复，patch 192-194 |
| 2026-09-09-loop-graph-aihub-redesign-design | Loop Graph 重构协作中心 | 图中心、事件日志唯一源、四层终止 |
| 2026-09-09-loop-graph-p0-kernel-notes | 图内核落地笔记 | GraphSpec、11 文件、四层终止 |
| 2026-09-10-loop-graph-p2-ledger | P2 遗留核销 | 5 修、27 顺延、1 待决策 |
| 2026-09-10-loop-graph-p3-r4-checklist | P3 体验验收 | 六条全过，通知与主题边界注记 |
| 2026-09-11-p4-research-findings | P4 外部复核 | 画布范式等，不改既有裁决 |
| 2026-09-14-loop-cockpit-single-page-design | Loop 收敛单页驾驶舱 | 去六区菜单，生长图 |
| 2026-09-15-loop-mind-3d-ontology-plan | 3D 思维图谱规划 | 实体/关系/维度通道/语义缩放 |
| 2026-09-16-ide-main-page-design | /ide 主页面 | 三列加顶栏状态栏 |
| 2026-09-16-loop-graph-multiview-design | 壳加四场景 | 总览/管理/Code/运维，零后端 |
| 2026-09-17-matrix-teams-management-design | Matrix 与 hermes teams 分布式管理 | 设计已确认、当时待实施；房间事件单源，任务落本机 kanban 回执 |
| 2026-09-17-multiuser-matrix-collab-sim-design | 三用户 Matrix 协作模拟设计 | 已定稿；同机三隔离实例，真实 Matrix/LLM/git 与证据验收门 |
| 2026-09-17-multiuser-matrix-collab-sim-report | 三用户 Matrix 协作模拟 | 35/35 通过，真实 gateway 与 LLM |
| 2026-09-17-zcode-3112-parity-analysis | ZCode 3.11.2 对照 | 5005 键/80 ns，三态裁决 |
| 2026-09-18-rsi-kernel-design | 任务驱动 RSI 工作内核 | 单机内核已实施；五步主循环加三边界，跨机广播待后续 M2 |
| 2026-09-18-unified-navigation-design | 双壳统一导航 | 已获批驾驶舱六场景加 IDE；旧路由直删，附窗口四态 |
| 2026-09-18-distributed-delivery-network-design | 多机分布式交付网络 | Matrix 协调、git 制品、本机执行 |
| 2026-09-18-matrix-fleet-deploy-design | 桌面应用多用户部署 | 共享应用加独立 HOME，45 项验收 |
| 2026-09-18-matrix-fleet-deploy-report | Fleet 三实例报告 | 45/45，119 条消息 |
| 2026-09-18-zcode-3123-parity-analysis | ZCode 3.12.3 增量 | 5446 键/87 ns |
| 2026-09-19-agent-ui-landscape-research | 编码 Agent UI 四产品调研 | 一手源码与 changelog 对照，给 /ide 25 个吸收点及 vela 参照 |
| 2026-09-19-swarm-cockpit-architecture-design | 驾驶舱架构裁决 | 任务状态以房间事件为准，集群按用户 |
| 2026-09-20-stats-metrics | 驾驶舱统计口径 | 事件流单一源，纯函数投影 |
| 2026-09-20-swarm-cockpit-prd | 驾驶舱 PRD v1 | 五旅程九模块，三方对账 |
| 2026-09-22-aipaydev-full-sim-spec | aipaydev 全流程七缺口实现设计 | RACI、规则熔断、重试、冲突、简报、九用户与沙箱，目标 20 步闭环 |
| 2026-09-22-aipaydev-implementation-plan | aipaydev 七缺口实施计划 | 文档状态=待批准；规划 patch 361-369 与 custom/compose 落点 |
| 2026-09-22-aipaydev-multiuser-sim-design | aipaydev 多用户 Matrix 全流程设计 | 20 步业务流以本文为准；实例拓扑由 09-24 V2 接替 |
| 2026-09-22-aipaydev-fullchain-sim-report | 支付全流程推演报告 | 20 步走通，6 缺陷闭环，12 缺口 |
| 2026-09-23-base-runtimes-design | semantica 与 pua 基础运行时 | 已实施；MCP 目录与技能外目录双 pin，doctor 防浮动和双源漂移 |
| 2026-09-23-gateway-host-ownership | Gateway host 归属判读 | 两类锁语义，patch 373 |
| 2026-09-23-gateway-multiplex-design | 多 profile 共存终态 | port-per-profile 加门闸，不做 multiplex |
| 2026-09-23-llm-dual-channel-failover-design | LLM 双通道塌方 | 编排层可见加 fail-fast，不改上游 |
| 2026-09-23-per-agent-node-modules-design | 每 agent 独立依赖 store | 独立 store 加链接注入，根治互删 |
| 2026-09-23-qgate-universal-delivery-gate-design | QGate 通用交付门禁 v0.2 | 六态 verdict、证据 exercised、四档 |
| 2026-09-23-zcode-foundation-design | 引擎切 zcode 源码底座 | 受管 fork，WS 引擎为主，双栈过渡 |
| 2026-09-24-goal-judge-and-ngram-loop-guard | goal 冷裁判与 ngram 防循环 | 本文立项态=待批；先接 loop，ngram 只发失控信号不自动终止 |
| 2026-09-24-mimo-code-coding-tools-research | MiMo 工具层与运行时吸收 | 转 Ycode 源码底座路线；P2/P5/P6/P7/P9 等落地，P3 原生已有，P4 另轮 |
| 2026-09-24-multiplex-multiuser-feasibility-and-plan-v2 | 单 gateway 多路复用推演 V2 | 可行性成立；单 gateway+单 studio，三补丁补板/团队/授权缺口，20 步不变 |
| 2026-09-24-session-checkpoint-writer | 会话进展 checkpoint 写手 | 结束/中断/预算触顶写五节 checkpoint；校验后供续跑，不自动改任务态 |
| 2026-09-24-aipaydev-flow-review | 推演全流程审查 | A1-A5 已修，B1-B4 架构债 |
| 2026-09-25-capability-boundaries-design | 三系统能力边界与写者归属 | 已实施；四干系人加三层事实源，双写台账与后续工单逐项收口 |
| 2026-09-25-loop-cron-bridge-design | loop 调度 hermes cron 桥接 | 已实施、默认关闭；cron 唯一 timer，token 与 loopback 双重限制 |
| 2026-09-25-scheduled-loads-registry | 定时负载登记 | 巡检 60 秒，可关闭 |
| 2026-09-25-ycode-absorption-matrix | Ycode 全量吸收矩阵 | 全仓对账，五批裁决，孤儿三态 |
| 2026-09-26-prefix-reuse-design | 长会话前缀复用 | 指纹链加增量校验，分层接线 |
| 2026-09-27-product-ui-deficiency-fix-plan | 推演暴露 UI 缺陷修复 | P0 构建恢复，P1-P5 审批 RACI |
| 2026-09-28-aipaydev-v4-roadshow-refactor-v4.1-final | V4.1 整合终版 | 26 步六闸加七域映射，并入 V5 |
| 2026-09-28-aipaydev-v4-roadshow-refactor | V4 路演重构 | 七问题域乘能力矩阵 |
| 2026-09-28-fleet-command-approval-gap | Fleet 命令审批缺口 | patch 490 文件审批传输 |
| 2026-09-29-agent-4a-governance-layer-design | 智能体协作 4A 治理层 | 五期已落地；四注册表、守门、只读投影、预算闸与派发台账 |
| 2026-09-29-ui-visual-audit-run1-run2 | 两轮截图视觉审计 | 19 项 UI 缺陷加 15 处图证不一致 |
| 2026-09-29-x62-orphan-triage-final | 62 件孤儿终局 | 吸收 20、挂起 6、归档 36 |
| 2026-10-01-qgate-upstream-v1.24-research | QGate 上游调研 | 37 门、四态 fail-closed、16 ADR |
| 2026-10-01-qgate-v0.3-port-design | 上游特性移植本地内核 | rawOutput、新鲜度、元门、traceability |
| 2026-10-03-v6-plan-issue-analysis-from-run7-report | run7 方案缺口 | 八缺口：并发/环境/韧性 |
| 2026-10-05-mux-history-and-engineering-archive | 推演历史与工程档案 | 版本沿革、违例先例、纪律台账 |
| 2026-10-05-mux-v8-fullflow-plan | 全流程方案 V8 正本 | 26 步加六闸，五部分分离 |
| 2026-10-05-v7-plan-structure-audit | V7 五层混编排查 | 五层分离、报告反凑数 |
| 2026-10-06-five-article-research-and-capability-plan | 五文调研与能力 | 记忆/多模态/SAT/RSI/围栏 |
| 2026-10-06-v8-design-intent-gap-audit | V8 与初衷差异 | P1-P16，产品面脱节与治理缺口 |
| 2026-10-06-v8-report-consistency-residual | run9 报告一致性 | P17-P22 计数/口径/锚点 |
| 2026-10-07-eval-studio-design | 全量评测工作台 | 四层判定、判分四步、双 Loop |
| 2026-10-07-run10-report-chain-gap-analysis | run10 报告链差距 | 报告失实、生成器病根、UI |
| 2026-10-08-qgate-upstream-v1.31.1-research | QGate 上游增量 | 七件延后项清偿 |
| 2026-10-08-six-article-research-capabilities | 六文能力落地 | 事故报告、hash 链、损益表、总线 |
| 2026-10-08-team-parallel-dev-capability | 团队并行开发 | 任务拆分、工作量、图驱动派发 |
| 2026-10-09-acp-coding-backend-design | ACP 编码后端三档 | L1 技能委托/L2 delegate/L3 headless |
| 2026-10-09-agent-capability-boundaries | Agent 能力四维 | 组织注册表单一源，否定式收窄 |
| 2026-10-09-parallel-capability-foundation-spec | 并行能力基础化 | 五类工作面，四步闭环，容量硬约束 |
| 2026-10-10-capture-surface-gap-plan | 拍摄位四缺口 | IDE 路由、权限、跨账号台账 |
| 2026-10-10-ontology-studio-spec | 本体工作台 | 六要素建模校验，JSON-LD/SHACL |
| 2026-10-10-orchestration-capability-spec | 协同图/任务工厂/容量 | 三面共享依赖与人日数据 |
| 2026-10-11-progress-federation-spec | 跨机进度联邦 | Matrix 房加 60 秒心跳 |
| 2026-10-12-ontology-lens-analysis | 推演本体论透镜诊断 | 词汇与映射缺位，报告层空白 |
| 2026-10-12-sol-pi-harness-efficiency | SoL-Pi 效能落地 | 动作融合、观察打包、证据精简 |
| 2026-10-12-win10-3node-migration-plan | Windows 三机迁移 | 拉取式节点，否决 SSH，零入站 |
| 2026-10-13-eval-tencent-metrics-design | 腾讯评测补强 | 双指标、多裁判、回流、成本 |
| 2026-10-14-ali-15agent-squad-research | 阿里 15-Agent 调研 | A-F 六件全落，经验注入默认关 |
| 2026-10-14-bpa-process-architecture-spec | 流程架构工作台 | 四页签、架构清单、PCF 映射 |
| 2026-10-15-agent-0221-patch-delta | agent 0.22.1 断裂清单 | 19 件断裂，下轮重定位 |
| 2026-10-15-cockpit-full-inventory-redesign | 驾驶舱全量盘点 | 功能到实存锚到新家，四张总图 |
| 2026-10-15-cockpit-sim-gov-ia-redesign | 三中心 IA 正本 | 工作台/推演/治理三中心加岛屿 |
| 2026-10-15-redesign-reconciliation-ledger | UI 重构对账总表 | 前向反向零孤儿，唯一归属 |
| 2026-10-15-role-lens-redesign | 四角色视角 | 旅程条加四镜头，不做专属路由 |
| 2026-10-15-swarmstudio-product-replan | 产品功能重规划 | 三件产品，harness 迁产品面 |
| 2026-10-15-swarmstudio-resilience-and-humansim-design | 韧性与人类模拟七件 | PR-1 至 PR-7 对应代偿缺陷 |
| 2026-10-15-v828-run19-r20-final-synthesis | run19/20 会话结论 | 11 项交付，跨会话接力 |
| 2026-10-15-v828-run19-r20-revision | 方案 V8.28 升版 | 纪律 52-56 |
| 2026-10-15-workflow-supervision-layer-design | 监督编排层 | 只读接管，会话单自动化 |
| 2026-10-16-a7-incident-elements | A7 事故报告跨天 | 窗口取锚定轮 state.env |
| 2026-10-16-agent-security-remediation-plan | 安全整改方案 | 先预警后阻断，删默认账号，十项挂起 |
| 2026-10-16-d6-starvation-card-classify | 饥饿检测加卡分类 | 空转乘压力交集，换会话令 |
| 2026-10-16-delivery-acceptance-perf-security-compliance | 交付验收性能安全合规 | 九要素对账，合规矩阵 |
| 2026-10-16-design-derived-from-requirements | 从需求推导设计 | 页面/架构/接口，继承冻结 |
| 2026-10-16-ewave-retirement-inventory | E 波退役清点 | 帧位同步、测试随迁、退役判据 |
| 2026-10-16-four-major-followup | 四大件黑话清偿 | 词表替换而非豁免 |
| 2026-10-16-frontend-visual-redesign | 前端视觉收敛 | V1 壳、V2 token、V3 旗舰屏 |
| 2026-10-16-gov-center-detailed-design | 治理中心详设 | 七签：关卡/问题/清偿/审计/文档/度量/组织资产 |
| 2026-10-16-run20-retro-fix-spec | run20 复盘修复 | report_truth 单一判据加零交付 |
| 2026-10-16-settings-and-role-lens-detailed-design | 三设置页加角色镜头 | 设置三页照建，镜头层解体 |
| 2026-10-16-sim-center-detailed-design | 推演中心详设 | 六签加场景编排挂面 |
| 2026-10-16-swarmstudio-final-design | 三中心总设计定稿 | 三中心、岛屿、三设置页 |
| 2026-10-16-swarmstudio-requirements-analysis | 需求分析重论证 | 14R 加 8N 冻结 |
| 2026-10-16-upstream-0736-0222-upgrade | studio/agent 升级 | 14 补丁适配，净树三段式 |
| 2026-10-16-workbench-detailed-design | 工作台详设 | 壳/首页/board 三签/inbox/沟通/IDE |
| 2026-10-16-wx-three-article-research | 三文调研 | 腾讯门禁、mod、判断力 A-F |
| 2026-10-16-zero-delivery-detector | 零交付检测器 | 只出候选不定罪，warn 聚合 |
| 2026-10-17-cockpit-fromlog-export | worker log 导出修复 | 补导出不改调用方 |
| 2026-10-17-cockpit-nav-flatten-endpage-usability | 层级动线与末端可用性 | 面包屑、首访展开、run 记忆 |
| 2026-10-17-cockpit-quick-nav-context-stage | 驾驶舱减负二批 | 常用入口常驻，来源阶段高亮 |
| 2026-10-17-d20-backlog-clearance | D20 五项能力清偿 | 组织/邀请/模型绑定/启停/入口 |
| 2026-10-17-frontend-ux-consolidation-redesign | 主题根治加共享基元 | 四批，token 清零，ECharts 联动 |
| 2026-10-17-fullflow-plan-harness-ia-reconciliation | 方案与产品 IA 对账 | 六阶段、工具舱、旧键重定向 |
| 2026-10-17-governance-test-timeout | 治理重型测试超时 | 只调 20 秒，不改产品 |
| 2026-10-17-gui-regression-fixes | GUI 回归首轮 | 登出闸门、ledger、sitpanel |
| 2026-10-17-gui-regression-round2 | GUI 回归二轮 | 任务 404、仿真 503、设备空白 |
| 2026-10-17-hermes-data-surface-supply | hermes 两数据面供给 | 插件签名、前缀、静态 import |
| 2026-10-17-i18n-override-order | 术语覆盖与语言切换 | 入口等待覆盖，失败不阻塞 |
| 2026-10-17-ia-navigation-closure-reconciliation | 导航四面对账 | 路由文案零变动 |
| 2026-10-17-ia-residuals-cleanup-spec | IA 残留词条与 aria | labelKey 逐行化 |
| 2026-10-17-incident-trace-null-anchor-hotfix | 事故证据锚空值热修 | trace 缺失回退 messages |
| 2026-10-17-journey-ia-terminology-redesign | 旅程式 IA 重构 | 八阶段旅程首页、术语标准 |
| 2026-10-17-org-assets-knowledge-collapse | 组织资产分析块 | 默认收起而非删除 |
| 2026-10-17-page-load-perf-batch | 首载性能修复 | service 层缓存加 keep-warm |
| 2026-10-17-plan-v838-ux-quality-sync | V8.38 质量同步 | 术语硬词清零 |
| 2026-10-17-plan-v841-final | V8.41 终稿补记 | 补记不升版 |
| 2026-10-17-plan-v841-sync | V8.41 方案同步 | 只增记方案 |
| 2026-10-17-sim-mautrix-darwin-ungate | macOS mautrix 解门控 | 裸 mautrix 依赖 |
| 2026-10-17-stage-attribution-wiring | 阶段归属接线 | 归属表加 from 优先 |
| 2026-10-17-stage-content-diet-and-terminology-residuals | 阶段页减负与术语 | 默认不挂载，错误人话化 |
| 2026-10-17-stage-page-workbench | 阶段页工作台化 | 内嵌高频件，工具卡保留 |
| 2026-10-17-stage4-agent-patch-archiver | 补丁归档执行器 | Python 单文件分类 |
| 2026-10-17-ux-observations-batch-spec | 走查观察四件 | 头像灰度、分组、顶栏密度 |
| 2026-10-18-capability-directory | 舰队能力发现面 | 中央仓文件，48h 新鲜度 |
| 2026-10-18-control-border-contrast | 表单边框 WCAG | 控件 border token |
| 2026-10-18-drawer-unmount-test-sync | 抽屉卸载测试 | 关闭即卸载，只改测试 |
| 2026-10-18-environment-residuals | 环境遗留清理 | 台账自动发现、journal 回落 |
| 2026-10-18-focus-visible-search | 搜索框焦点可见 | accent token |
| 2026-10-18-fullflow-v844-workbench-refactor | V8.44 工作台对账 | 左侧导航、单层页签、推演专区 |
| 2026-10-18-gui-regression-residuals | 回归残留收尾 | 仿真分支、矩阵首屏、深链 |
| 2026-10-18-harness-p0p2-round | Harness P0-P2 | 身份裁决、审批凭证、运行清单 |
| 2026-10-18-harness-reliability-round | Harness 可靠性 | 工具契约、审计、重试、九层 |
| 2026-10-18-harness-research-gap-analysis | Harness 调研差距 | 三文结论与残余 |
| 2026-10-18-harness-residual-round | Harness 残余七件 | 委托范围、恢复、指标、采样 |
| 2026-10-18-ia-leftnav-stage-tabs | 左栏阶段页签化 | 六阶段左栏，治理七签迁入 |
| 2026-10-18-ia-shell-rail-journey-fix | 双左栏与旅程上下文 | 引用计数、双壳 retain |
| 2026-10-18-ide-backlog-close | IDE 待办清零 | 四页签，17 增至 21 |
| 2026-10-18-ide-briefing-404-only | 简报判死只认 404 | 瞬时故障不误判 |
| 2026-10-18-ide-composer-zcode-parity | 输入区对齐 ZCode | 五控件一排加模型管理 |
| 2026-10-18-ide-cua-and-effort-fix | CUA 真接线加思考档 | 引擎插件态为单一源 |
| 2026-10-18-ide-cua-loop | CUA 完整回路 | fail-closed、broker 凭据、证据浮窗 |
| 2026-10-18-ide-deep-refactor | IDE 深度重构 | P0-P3 四类结构债 |
| 2026-10-18-ide-fixall | IDE 挂账清零 | 媒体 401、补丁顺序、双语 |
| 2026-10-18-ide-regression | IDE 全量回归 | 13 缺陷，引导/深链/存储/自检 |
| 2026-10-18-ide-task-workspace-link | 任务与工作区关联 | 服务端解析，materialized 才切 |
| 2026-10-18-ide-work-modes | 编程与工作双模式 | 呈现层模式加任务内核分流 |
| 2026-10-18-inspector-detectors-closers | push-stalled 闭包修复 | 只补闭包不改逻辑 |
| 2026-10-18-leftnav-closure-ide-models | 左栏闭环加 IDE 模型 | Ycode 配置第一源 |
| 2026-10-18-parallel-dispatch-product-landing | 并行派发沉产品 | DISPATCH_SAFETY 加里程碑契约 |
| 2026-10-18-research-dsh-alpha5-note | dsh 标签核对 | 不切共享检出，双值标注 |
| 2026-10-18-skill-provisioning-reconciliation | 技能供给对账 | manifest 唯一期望源，只增不改 |
| 2026-10-18-steps-display-names | 26 步显示名分层 | name 保留原文，UI 读 displayName |
| 2026-10-18-team-registry-sync-detection | 团队注册同步 | getContent 兼容，等 Sync |
| 2026-10-18-v841-acceptance-record | V8.41 验收记录 | 性能/安全/团队/术语实测 |
| 2026-10-18-wcag-muted-contrast | 次级文字对比度 | muted 与 secondary 分开 |
| 2026-10-18-ycode-cua-plugin-bundled | CUA 插件内置 | 载荷 seed 加默认启用 |
| 2026-10-19-chat-user-kind-and-avatars | 群聊身份与头像 | -agent 白名单，FNV 头像 |
| 2026-10-19-diagram-design-absorption | 图能力六件套 | 技能收编、品牌、self_check |
| 2026-10-19-enterprise-agent-framework-closure | 企业 Agent 框架收口 | 闸门、幽灵、回流、经验库 |
| 2026-10-19-eval-baidu-followup-design | 百度红队扩产 | 规则变体百题加线上回填 |
| 2026-10-19-eval-baidu-paradigm-design | 百度评测补强 | 指标 drives、三角审计、红队 S0 |
| 2026-10-19-eval-baidu-reward-design | 评估器即回报 | 四层指标、资产指纹、种子 |
| 2026-10-19-eval-closure-and-baseline-repair | 评测收口与基线修复 | 考卷快照、同卷复评、机械关闭 |
| 2026-10-19-fullflow-v845-eval-integration | 评测接入 G4 | G4-E 子门，判据单一源 |
| 2026-10-19-fullflow-v846-studio-latest | studio 能力接入 | G6 键统一、处置链、run22 前置 |
| 2026-10-19-harness2-improvement-workbench | Harness² 改进台 | 可编辑面、候选、探测、回归门 |
| 2026-10-19-harness2-source-notes | Harness² 源码笔记 | 八组件树、2K 加 K、匿名选择 |
| 2026-10-19-ide-devtools-clisessions | IDE 工具与 CLI 会话 | 白名单唯一入口，只读展示 |
| 2026-10-19-ide-organize-accuracy | IDE 侧栏项目归类 | 未绑项目诚实兜底 |
| 2026-10-19-ide-organize-from-zcode | 侧栏取 zcode 信息 | directory 唯一项目源 |
| 2026-10-19-ide-sidebar-view-accuracy | 侧栏视图语义 | 改文案不改数据 |
| 2026-10-19-launch-deeplink-fallback | 旧启动深链回退 | 定向到 preflight |
| 2026-10-19-observability-signals-round | 观测信号与告警 | 文件账本、尾决策采样、基线告警 |
| 2026-10-19-p1-consolidation | P1 注意力右栏空态 | 固定 3 条、抽屉、空态出口 |
| 2026-10-19-p1-gaps-and-p3-cleanup | P1 剩余与 P3 术语 | 评测说明页，只删死键 |
| 2026-10-19-p2-density | P2 推演密度与检索计数 | 折叠当前阶段，零计数不显示 |
| 2026-10-19-p27-topic-shell | 专题页统一壳 | 只统一骨架 |
| 2026-10-19-product-ux-errors | 报错清零与开发痕迹 | 目录名降 title |
| 2026-10-19-review-governance | 评审治理 | 风险分级、绑 head、熔断、夜扫 |
| 2026-10-19-run-selector-empty-state | 运行选择器空态 | 空列表清记忆值 |
| 2026-10-19-runtime-write-file-arg-cleanup | write_file 参数清理 | 改运行时供给源 |
| 2026-10-19-stage-board-filter | 阶段页看板过滤 | 只覆盖③④，视图层取交集 |
| 2026-10-19-studio-p2-capabilities-and-deploy | Studio P2 能力与换装 | UAT、G5、审批汇总、scope 矩阵 |
| 2026-10-19-studio-trust-and-attribution-remediation | 信任与归属纠偏 | 完成度、G5 范围、名称兑现 |
| 2026-10-19-upstream-0737-upgrade | studio 0.7.37 升级 | locale 三方合并、补丁归档 |
| 2026-10-19-workbench-page-audit-and-consolidation | 58 路由走查整合 | 9 类结构问题修复 |
| 2026-10-20-cockpit-audit-reconciliation | 驾驶舱审计增量对账 | 用户裁定、服务端增量、假功能 |
| 2026-10-20-cockpit-m3-acceptance | M3 独立验收 | 65 页走查，5653 通过 10 环境失败 |
| 2026-10-20-cockpit-residual-fixes | W2-W4 挂账清零 | 批 A 前端、批 B 运行桥 |
| 2026-10-20-cockpit-split-and-hygiene | 驾驶舱整治与拆分 | matrix 链接、日常推演拆分 |
| 2026-10-20-ia-daily-sim-separation-and-ux-cleanup | 日常与推演拆分 | 三模式、导演台人话 |
| 2026-10-20-matrix-server-info-single-source | Matrix 地址单一源 | server-info 模块加补丁 |
| 2026-10-20-sim-director-takeover | 产品内导演台接管 | 真数据，不做假启动 |
| 2026-10-20-upstream-0738-upgrade | studio 0.7.38 升级 | 净树三段式，26 文件适配 |
| 2026-10-21-agent-governance-toolkit-research | 微软 AGT 调研 | 三件套优先，G 类不做 |
| 2026-10-21-backlog-closure | 遗留清偿 | GovOverlay 退役，G5/UAT 状态机 |
| 2026-10-21-context-insights | 上下文趋势与用量聚合 | 不引运行时依赖，日志重折 |
| 2026-10-21-fibo-official-reference-enhancement | FIBO 官方参照 | 只读场景与导入包分离 |
| 2026-10-21-fibo-ontology-calibration | FIBO 语义索引校准 | 12 加 6 概念实锚 |
| 2026-10-21-fibo-ontology-studio-alignment | FIBO 映射层真 IRI | 36 概念/21 属性/16 公理 |
| 2026-10-21-fibo-operations-runbook | FIBO 运营手册 | 巡检、季度升级、脱敏、回滚 |
| 2026-10-21-fibo-product-rollout-plan | FIBO 产品化 | P0-P4 消费面，不再扩包 |
| 2026-10-21-fibo-ssot-merge | FIBO 单一源合并 | ontology-fibo 正本，qgate 派生 |
| 2026-10-21-governance-surface-closure | 治理面收口 | GovOverlay 退役，三面收敛两面 |
| 2026-10-21-ia-projection-sim-subpage-canonicalization | 阶段路径单投影 | 路径单函数，推演单 URL |
| 2026-10-21-ide-devtools-zcode-dsh | IDE 工具打开 zcode/dsh | 受管 fork CLI，dsh app 按钮 |
| 2026-10-21-logout-entry-fix | 设置面板补登出 | 侧栏底部加手动登出闸门 |
| 2026-10-21-ncwk-design-spec | NCWK 三域设计正本 R6 | 三层结构与跨域契约；文档自述 2026-10-23 并入整合正本，保留历史档案 |
| 2026-10-21-ncwk-product-spec | NCWK 三域产品正本 R5 | 三模式、团队编制与知识生成；文档自述 2026-10-23 并入整合正本，保留历史档案 |
| 2026-10-21-secaudit-pipeline-and-eval-judging-discipline | 安全审计与判分纪律 | 六阶段、自证 409、S0 轨迹 |
| 2026-10-21-sequence-guard | 会话级数据流护栏 | 敏感读到外发拦截 |
| 2026-10-21-sim-visibility-and-ide-task-surface | 推演可见性与 IDE 任务面 | 口径收口，IDE 只读任务段 |
| 2026-10-21-swarmstudio-complete-design | SwarmStudio 完整设计 | 三模式终态、全域详设、历史复盘 |
| 2026-10-21-tool-policy-engine | 工具策略引擎 | 附加约束层、strict、lint |
| 2026-10-21-wx-research-absorption | 三号调研吸收 | 本体 Action 层/工具契约面/callgate/κ 校准/退化禁发/任务账本，D1-D10；14 项挂账 |
| 2026-10-21-ycode-environment-recovery | Ycode 环境恢复 | 补丁链、catalog 自适应 |
| 2026-10-21-zcode-3161-baseline-upgrade | zcode 3.16.1 基线 | 源码 main 迁移，8 补丁 |
| 2026-10-21-zcode-context-trend | zcode 上下文趋势 | 精确 token 加估算构成 |
| 2026-10-21-zcode-usage-ledger | zcode 用量账本 | 三表只读，客户端估价 |
| 2026-10-21-production-trace-eval-reflow | 生产轨迹转回归样本 | origin 复现 vs fresh 修复；混合证据不得关单 |
| 2026-10-21-trace-reflow-debt-clearing | 挂账清偿五批 | 评审 Minor/OTel/OS 沙箱/代码仓审计/换装收尾 |
| 2026-10-21-session-exhaustion-detector | 会话耗尽检测器 | 应答新鲜×真做停摆；warn/high＋换会话建议 |
| 2026-10-21-debt-final-round | 挂账清偿收 | OTel 聚合 11/11＋红队攻防 6/6；exec-sandbox ESM 边界教训 |
| 2026-10-21-mcp-security-scan | MCP 注册面安全扫描 | 四类形态（高危命令/密钥/外联/仿名）；姿态面板 |
| 2026-10-21-g5-uat-state-machine | G5 发布门+UAT 状态机 | 纯函数矩阵/append-only/409 防回流；接管补正本 |
| 2026-10-22-cockpit-audit-fixes | 驾驶舱全量走查修复 D1-D7 | ④阶段崩溃/三簇 koa-router 嵌套死路由/介入卡假按钮/静默失败呈现；nested-mount-guard 守门 |
| 2026-10-22-cockpit-refactor-design | 驾驶舱重构设计 | 四原则＋P0-P2 挂账清单＋死端点守门机制（正本立卷） |
| 2026-10-22-governance-repo-default-sim | 治理仓缺省链三态化 | 显式 env＞SIM 中央仓＞生产仓；重启不依赖带 env |
| 2026-10-22-jargon-allow-director-console | jargon 词表补「导演台」 | 产品功能名专名豁免非行话放行 |
| 2026-10-22-long-horizon-trust-layer | 长程任务可信执行层 | 主张三态审计/双准入/CSWI 栅栏/原子断点；键盘可达随批修正 |
| 2026-10-22-org-admin-cosign-guard | 治理者守卫 | org admin 行 409 拦＋双人会签（单槽/资格异人）＋[BREAK-GLASS] 留痕 |
| 2026-10-22-owner-nudge-and-humangate | 催办 owner 动态路由＋HumanGate 前置批准 | run21/22 两轮错侧催办与 R-5 产品化；8/8＋22/22 |
| 2026-10-22-runtime-mirror-569-reapply | 0.22.4 镜像回套补丁 569 | kanban_watchers_common 丢 _inspect 修复回套 |
| 2026-10-22-sidenav-todo-badges | 侧边栏待办徽标 | useSideNavBadges 单一装配＋badge-count 纯核＋徽标状态点共存 |
| 2026-10-22-stage-status-traffic-light | 阶段状态点交通灯化 | 红=阻塞/黄=进行中/绿=完成；--ia-warn 新 token |
| 2026-10-22-tab-brand-swarm | 标签品牌收尾 | Ekko Studio→SwarmStudio＋data-URI SVG 图标（patch 675 免二进制补丁） |
| 2026-10-22-upgrade-agent-0224 | hermes-agent v0.22.4 升级轮 | 72 agent 补丁 12 个手工移植全绿；镜像 40→44；607 写闸接线；宿主网关换血 |
| 2026-10-23-cockpit-p1-residual | 驾驶舱 P1 残项清偿 | 建板异常定为旧后端载体态；patch 682 修假开关，板 slug 补格式说明 |
| 2026-10-23-column-controls-unify | 工作台栏控窗口语义统一 | 三栏折叠位派生独占态，单钮切换；页面导览整族退役 |
| 2026-10-23-common-recent-trail | 侧栏常用与最近访问轨迹 | fullPath 去重留 20 条并持久化；Teleport 修滚动裁剪，键盘路径留账 |
| 2026-10-23-eval-biz-signals | 行为评测信号与经营摘要 | 已落地；六信号低样本降级，摘要按红线/门禁/证据三态输出 |
| 2026-10-23-fullpage-walkthrough-polish | 全页面走查与效果优化 D23 | 12 项反馈四项证伪、五项修复；态势主显收敛与空态基元落地 |
| 2026-10-23-gateway-profile-provider-prompt-fix | Provider 提示按网关 profile 判定 | patch 678 已落地；读 resolved profile，辅助端点失败回落原行为 |
| 2026-10-23-harnesspro-harness-pitfalls-absorption | HarnessPro 与十一坑双文吸收 | 七机制分域落地；帕累托、阶段阶梯、输出折叠、裁判校准与经验保鲜 |
| 2026-10-23-hp-debt-clearance | HarnessPro 吸收挂账清偿 | G1-G5 全做；S0 草稿人工采纳、事实五档路由、三轴种子与退役建议 |
| 2026-10-23-hygiene-gates-round | 守门卫生批 | patch 677 补催办双语词条，收件箱裸 hex 换 token；两守门回绿 |
| 2026-10-23-ide-conflict-marker-hotfix | IDE 四文件冲突标记热修 | 恢复坏提交父版本；IDE 家族 777 测试与页面渲染通过 |
| 2026-10-23-jd-eval-absorption | 京东评测体系吸收 | 稳定复测、难度/角色分桶与 secrets 采集落地；四项后续挂账 |
| 2026-10-23-loop-to-workflow | 循环改工作流与分布式调度 | 取声明式步骤范式不搬 TS 沙箱；identity 走 peer，Matrix 走房间指令 |
| 2026-10-23-probe-stream-json | 自动探测证据通道根治 | stream-json 优先、trace 后备；单测 110/110，live 复验在当时留后续 |
| 2026-10-23-room-page-audit | 房间页全面排查与修复 | 邀请按语境分流并修 eventId；后续统一新建聊天、通道命名与文字排序 |
| 2026-10-23-rrsi-followup-batch | RRSI 跟进批 | held-out 并排读数加 AI 起草；只产 draft，不审批、不探测 |
| 2026-10-23-rrsi-gap-closure | RRSI 挂账清偿 | spawn 带 stderr 并重试一次；追加段起草；仅无审计线索 draft 可删 |
| 2026-10-23-rrsi-regularized-workbench | RRSI 改进实验台正则化 | 七机制落地；四类 blocker 加四类 warning，噪声 δ 不调参 |
| 2026-10-23-tmall-digital-worker-absorption | 天猫数字员工两文吸收 | 交付效能与协作画像四件套；缺失数据降档，只读 fail-soft |
| 2026-10-23-ui-mxid-short-display | UI 账号去 homeserver 后缀 | 短显逻辑收为单一源；显示短形，协议、路由与注册表仍用全形 |
| 2026-10-23-unified-identity-chat | 统一身份聊天窗口 | @身份统一路由；本机走 peer dm、远程走原生 mention，远程发现与 SSE 留批 2 |
| 2026-10-23-walkthrough-debt-clearance | 走查挂账清偿 D24 | 用量字号、技能对比度与十二板折叠落地；紫菱形主诉经复核证伪 |
| 2026-10-24-aistudio-dev-regen | aistudio-dev 全量重生成 | 单技能覆盖单仓并激活；check_test 66 个预存失败如实另立修复轮 |
| 2026-10-24-aistudio-single-repo-integration | AIStudio 单仓整合 | vendor 基线入库并保留注入链；403 项重放与全新克隆通过，遗留构建/脚本挂账 |
| 2026-10-24-deps-supply-chain-unify | 依赖供应链统一治理 | 八项治理落地；锁文件、registry 与 team 钉版统一，patch 687 专收锁缺口 |
| 2026-10-24-docs-five-layer-refactor | 文档五层重构 | README、USAGE、整合正本 R9 与 GitHub 页统一分层；不另开设计正本 |
| 2026-10-24-func-audit-consolidation | 功能层排查与整合 D25 | 假功能分三档处置，方案孤儿挂回或删除；三个待裁定项交 D26 |
| 2026-10-24-intro-interactive-page | 交互式项目介绍页 | 独立离线 HTML 只借叙事形式；主名 AIStudio，零外部依赖与真实数字 |
| 2026-10-24-kanban-estimate-workload-impl | 看板估算落库与负载重排 | 估算双列、审计事件与 ready 层内重排落地；拼合树 pytest 22 通过 |
| 2026-10-24-page-visual-polish | 全页面视觉走查与优化 | 47 路由走查后修层级、密度、空态与人话；Electron 与未改上游页未验 |
| 2026-10-24-repo-integration-cleanup | 仓库终态整合清理 | 散落正身入库、18 个版本变体删除；spec 台账全保留，估算实现挂账 |
| 2026-10-24-swarm-bench-leaderboard | 群体协作拓扑与跨轮评测榜 | 七指标名次、均位与帕累托；拓扑和节拍只描述不排名，四项挂账 |
| 2026-10-24-swarm-eval-benchmark-absorption | 多 Agent 群体协作评测吸收 | 四维读数加两个红队向量；字符/观察口径如实降档，只透传不进判据 |
| 2026-10-24-swarm-eval-followup-batch | 群体协作评测清账批 | 五项机制落地；消融与拜占庭待真实 run，混合动机独立场景且默认关 |
| 2026-10-24-swarm-task-latency | 群体协作任务锚点时延 | 榜单补第八指标；明确不等于端到端时延，精确 token 与专项首跑仍挂账 |
| 2026-10-24-swarm-yuan-v2.95.0 | swarm-yuan v2.95.0 同步 | 33 文件同步；原仓回归通过，本仓 self-check 有布局受限且 npm test 未跑 |
| 2026-10-24-swarmstudio-stale-refs-cleanup | 单仓与 AIStudio 过期描述清理 | 活文档改新布局、历史正文不改；Windows 单仓流程未重验 |
| 2026-10-24-verdict-restore-batch | 功能并入挂回与呈现恢复 D26 | 三裁定落地；六闸展开和报告入口受无活跃 run 限制，仅源码守门未活体全验 |
| 2026-10-24-workspace-dirs-tidy | 工作区目录整理 | 根层 34 目录逐项定性；清运行垃圾、补导航与三轨忽略规则 |
| 2026-10-25-agent-data-flywheel-absorption | Agent 数据飞轮吸收 | 坏例提炼、五维变体与通过率退化门落地；活体未做，五项后续挂账 |
| 2026-10-25-disable-vendor-announcements | 厂商公告通道关闭 | 默认拦空、env 可恢复；11 项守门与双端实测确认零弹窗 |
| 2026-10-25-flywheel-debts-round2 | 数据飞轮挂账清偿 round 2 | 五项挂账落地并经独立端口走查；embedding 与 canonical 换装仍挂账 |
| 2026-10-25-local-artifacts-ignore-rules | 本地产物忽略规则补齐 | 新增两条通用规则，vendor 69 个注入产物不遮掩；全量测试 6334 过、0 失败 |
| 2026-10-25-r142-followup-routa-codex | R142 routa/codex 裁决补记 | routa main 快进且保留分叉 tag；codex 本地私货判定更正为误报 |
| 2026-10-25-skill-r142-runtime-refresh | swarm-yuan R142 基线刷新 | 22 项核验仅两项升级；注册表路径修复，两个异常转后续裁决 |
| 2026-10-25-upgrade-studio-0739-agent-0225 | studio 0.7.39 与 agent 0.22.5 升级 | 397 补丁重放、pytest 44 通过；规范位残 5 个失败文件逐项定性，未记作全绿 |
| 2026-10-26-acp-client-hardening | ACP 客户端加固 | 权限只允许一次、按工作区分池、env 注入、setModel fail-closed、写界=会话根；真实回合未验 |
| 2026-10-26-delegate-task-context | delegate --task 上下文装配 | build_worker_context 程序注入+delegate-result.json 全路径机器回执；拼合树 46/46 |
| 2026-10-26-g3-g5-hard-gates | G3 委托双证与 G5 真人门 | G3 消费 result.json（exit=0+end_turn）；strict 等真实 HumanGate、standard 记 director-proxy |
| 2026-10-26-chatbridge-projection-only | ChatBridge 入向投影化 | 撤 processMentions 旁路、task.assign 回执 observed；gateway 承接挂独立批 |
| 2026-10-26-a2a-board-harness-alignment | A2A、看板归属与 harness 单仓化校正 | A2A 默认本机、板团队键单源、闸键对齐；真实跨机与合并树行为未验 |
| 2026-10-26-aistudio-architecture-execution-alignment | AIStudio 九段架构执行校正 | 聚焦授权、人工门、任务上下文与技能实证；完整推演、真人会签和多机未验 |
| 2026-10-26-delegate-evidence-wiring | V8.54 编码委托证据位接线 | G3 查 engine_bin_source 身份行＋采集进 evidence；与九段批双证判据互补 |
| 2026-10-26-joyai-closed-loop-absorption | JoyAI 闭环吸收轮 | 统一上下文 ID 串联知识→推演→执行→回流；workitem 全景/impact 需求命中 |
| 2026-10-26-joyai-debts-clearance | JoyAI 闭环挂账清偿 | 未做五件收口（细节见 spec 验证段） |
| 2026-10-27-sim-governance-convergence | 推演×研发治理融合 | 治理实现单源（判词/G1/UAT/熔断/配对/台账阈值/评测判据/指标正本入产品治理域）；D1-D9；五批落分支+残余挂账 |
| 2026-10-26-nine-point-docs-sync | 九点对账三正本同步 | fullflow V8.54/整合正本 R12/总账随批；词表 Ycode 四级解析序＋§5.4.3 证据位 |
| 2026-10-26-proactivity-two-axis | 主动性两轴模型 | 谁定义问题 L1-L5×做到哪一步五档裁决＋目标漂移防线；补丁 695 |
| 2026-10-26-proactivity-followup | 主动性两轴挂账清偿 | /goal 契约变更登记对齐台账＋L4 升仓判据；补丁 696 |
| 2026-10-26-proactivity-govern-tab | 主动性面板加治理页签 | 两轴面板挂⑥治理页签（微轮） |
| 2026-10-26-swarm-yuan-core-refactor | swarm-yuan 可信性重构 | 门禁异常判 pass/激活 fail-open 等结构根治（详见 spec） |
| 2026-10-26-swarm-yuan-single-source-refactor | swarm-yuan 单源与迁移补位 | 与 core 分支零重叠的 P1 项（设计层/源码层） |
| 2026-10-26-cockpit-debt-completion | 驾驶舱挂账清偿 | 恢复 REAP 26 包与两技能、element-web 官方构建与 ELEMENT_WEB_DIR、serve-main 换装 |
| 2026-10-26-cockpit-followup | 驾驶舱未做项清偿 | 生产走查与写流补验，patch 692 修 running 静默；REAP 26 包留原会话处理 |
| 2026-10-26-cockpit-source-design-refactor | 驾驶舱功能设计与源码盘点重构 | 保留 IA，修审批/注意力/轨迹/日程；152 个只读态走查，写流与生产包交后续批 |
| 2026-10-26-core-coding-chain-alignment | ACP→Ycode→项目技能→任务工作区 | provider/cwd 与技能先行接线；定向测试过，live 部署和真实 ACP 回合未验 |
| 2026-10-26-design-sync-followup | 设计文档同步尾部清偿 | PROJECT_DIR 可由 env 覆盖，L3 分支态拦/放双场景固化为 23 项断言 |
| 2026-10-26-dev-skill-design-doc-sync | XXX-DEV 设计文档同步机制 | 四要素声明由 L2/L3 机械核验，合入序列入技能；doc-numbers 基线失败另列 |
| 2026-10-26-element-web-csp | element-web CSP wasm 放行 | 补丁 694 窄放行 wasm-unsafe-eval 根治登录后会话死锁；真实账号双端收发终验 |
| 2026-10-26-nine-point-reconciliation | 九点产品逻辑对账校正 | 该轮裁定 ACP 官方捆绑默认、element fail-soft、done 人闸 opt-in；分叉与 run 级未验 |
| 2026-10-26-skill-roots-claude-compat | Ycode 技能根兼容与落点实证 | 补丁 009 加 .claude/skills 兼容根；项目技能落点 .agents/skills 三引擎通吃，软链方案并存 |
| 2026-10-26-precommit-vendor-guard-restore | pre-commit vendor 挡护还原 | 模板、产物、守门三层同步；自动撤出暂存，VENDOR_SYNC=1 为显式逃生 |
| 2026-10-26-release-manifest | 四模块发布清单 | RELEASE-MANIFEST+release:check 对账门禁；裁定=单仓清单/推演仅仓内/Ycode 以基线代版本 |
| 2026-10-27-module-version-scheme | 模块版本对齐底座 | 三位底座＋-ext.N（teams=0.22.5-team.1/cockpit=0.7.39-studio.1）；standalone inject 缺树 SKIP；17 测绿 |
| 2026-10-27-release-packages | 四模块 4+1 源码包发布 | git archive 打包＋SHA256SUMS；Ycode 版本=底座 3.16.2（JSON 真源）；干净环境安装验证挂账 |
| 2026-10-26-rebrand-aistudio | 产品品牌统一 AIStudio | 用户可见品牌收敛，安装/协议/路径标识保留；历史文档不改写 |
| 2026-10-26-shared-exclusion-leaks | _shared 排除面两漏补齐 | 巡检日志尾与能力上报统一滤 `_` 前缀；41 项测试过，上报 50→49 |
| 2026-10-26-sidenav-badge-dot-merge | 侧栏徽标准确性与状态合一 | 收官 SIM 不再污染日常口径；徽标/状态点合一，三处读数 21/21/20→7/7/7 |
| 2026-10-26-walkthrough-bugs-fix | 重启走查三缺陷修复 | 两族 i18n 缺键与归档目录噪音修复；clean 残留问题转后续批 |
| 2026-10-26-walkthrough-debts-clearance | 走查未做项清偿 | 用量探针改取完备样本；clean 补 tracked 残留兜底并做半注入/全净双验 |
| 2026-10-27-global-search-consolidation | 全局检索合并至顶部弹窗 | 左侧独立检索退役，五类对象/命令/组合筛选合一，旧深链兼容唤起 |
| 2026-10-27-search-dialog-truthiness | 检索弹窗真值修复 | 人员 roster 主源/运行空态去向/筛选换看板轴/0 徽标如实 |
| 2026-10-27-search-session-source-load | 检索弹窗会话源装载 | 弹窗打开即装载 agent 会话与群聊源，fail-soft |
| 2026-10-27-search-sim-sessions | 跨实例只读检索推演会话 | 只读扫 SIM 库+紫色徽章+诚实点击降级 |
| 2026-10-27-state-event-member-names | 状态事件成员文案补账号名 | zh/en 词条占位符根治（补丁 701） |
| 2026-10-27-joyai-annotations-rerank | JoyAI 清偿批二 | map-annotations 持久化＋LLM 重排＋mention 泳道；补丁 698 |
| 2026-10-27-joyai-realtime-squad | JoyAI 清偿批三 | 标注实时协同（LWW+socket+presence）＋squad 链重排；补丁 699 |
| 2026-10-27-swarm-yuan-branch-trunk-order | swarm-yuan 研发四阶段顺序立法（决策 57） | 分支开发→分支测试→主干合并→主干回归；九节点不变、⑤-⑦ 在分支 |
| 2026-10-27-tech-component-ledger-refresh | 技术组件台账整理·差异补齐·挂账清偿 | 46 项台账正本立账（component-ledger.md）；三基线树无新稳定版升级不触发；callgate/taskledger/红队 S1/A2A 四挂账清偿 |
| 2026-10-27-ledger-todos-clearance | 台账 §9 七项待办清偿＋技能域补录 | 待办终态改判（3/5/6/7 完成、1/2 上游阻塞）＋swarm-eval 轻链路三跑＋mx-up/骨架 6 处根治 |
| 2026-10-27-component-ledger-cleanup | 技术组件调研台账结构整理 | 当前状态/待办/主账/技能来源/历史索引分层；保真改写并修正两处物化清单路径 |
| 2026-10-27-version-diff-absorption | 版本差异吸收第一批 | 外部 CLI 会话索引（kimi 2.3.3 #4342 只读版）落地＋其余 8 项差异逐项裁定；修 --strict false 布尔判别不窄化陷阱 |
| 2026-10-27-product-coherence-refactor | AIStudio 产品一致性整合 | 复合任务身份、分域运行引用、设置与页面解析合一、视觉密度与真实状态 |
| 2026-10-28-aistudio-interactive-training | 交互式培训手册（12 幕拓扑导览＋本地启动器） | 独立 HTML/JS 离线手册不植入产品前端；设计/实现/部署/使用四模块各 3 幕独立 SVG 拓扑，自动播放与手动跟练共用 12 幕课程数据；启动器仅监听 127.0.0.1 随机空闲端口（npm run training／双击 .command/.bat）；培训模拟不连生产数据；DESIGN_SYNC none |
| 2026-10-28-ledger-canonical-pointer | 组件台账双源合一 | 现行指针统一到 team/shared/research 终态单文件；旧 docs 正本降为历史档案；附表 C 与吸收域 README 同步 |
| 2026-10-27-swarm-yuan-closeout-merge | swarm-yuan 两分支收口合入＋九段残余对账＋隔离区清理 | 文件级三路合并（integration 基底）73 取 core/16 合并/7 保 main；计数机械重算 9355/104/199；九段五提交零补并全演进在位；D5 版本持平 v2.95.0 |
| 2026-10-27-aistudio-final-design-consolidation | AIStudio 终态设计文档整合 | 正本去轮次化；历史 spec 留档；动态数字退出正文；导航与旧正本指针同步 |
| 2026-10-28-repo-structure-tidy | 仓库目录结构整理 | scripts 根 60→25 分 regression/maintenance；docs 根 30 个日期文件迁 reports/；根级死件退役；旧多仓路径对齐 vendor 优先 |
| 2026-10-28-login-unknown-path-freeze | 登录路径×诚实404 未登录守卫环冻结修复 | /login 非法路径撞 404 改道成守卫重定向环饿死渲染线程；notFound 设 public＋/login 别名直达登录页（run23 采集链首暴露） |
| 2026-10-29-swarm-yuan-agent-skills-dirs | swarm-yuan 安装/落盘目录对齐 Agent Skills 开放标准默认路径 | 自身安装默认 ~/.agent/skills（--agent 通道＋auto 兜底）；生成技能默认项目内 .agent/skills（存量复用不迁移）；产物内部引用随落点自动改写 |
| 2026-10-29-swarm-yuan-agents-dir-rename | swarm-yuan 默认目录校正 .agent→.agents（用户裁定） | zcode 发现根硬编码 .zcode/.agents（roots.ts:10-11），改 .agents 即原生发现；旗标 --agents、宿主 key agents、生成落点/豁免/垫片/守门全量同步；v2.96.2 |
| 2026-10-29-agent-self-reflection | Agent 自我觉察与反省能力立项（长会话治理 B 层） | 自我效能遥测/反省触发/自纠走既有通道＋留痕入证据；舰队层增补：利用率遥测＋跨闸预写（run23 G5 段六工位闲置实录触发，用户批准） |
| 2026-10-28-sim-prelaunch-check4-single-repo | 预检④单仓适配 | 判据排除 vendor/** 注入脏态（AGENTS.md 立法态）；预检轨迹与守门断言跟随 |
| 2026-10-28-debt-clearance | 挂账清偿轮 | 部署默认保留目标+--force；inject 增 OVERLAY_STATE_OUT 隔离测试；runtime 模板回灌 guardrail；repo-root 去外机兜底；compose 下线；evidence 二进制冻结 |
| 2026-10-28-sim-gates-audit-run23-redfixes | run23 前置红项根治（审计器/守门入口） | R8 悬空引用单源化、R5 时代分支、run-gates 单仓回落解析 |
| 2026-10-28-run23-prelude-path-refresh | run23 前置正本路径勘误 | 起跑命令改单仓新址（docs/reports、scripts 子目录） |
| 2026-10-28-design-reconcile-release | 设计与发布对账轮 | 六域 65 条发现（修 52/限制 13）；四模块升版并发布 v1.0.1-overlay |
| 2026-10-28-release-v1.0.2-overlay | 发布轮 v1.0.2-overlay | 架构债收口＋对账清偿后升版：cockpit studio.3 / agent-teams team.3 / full 1.0.2-overlay；产物 local-only 不上传 |
| 2026-10-30-swarm-yuan-ub-mode-absorption | swarm-yuan 吸收 ub-mode | 新增洁净代码度量方法论档；复杂度并入 method-size、重复度并入 reuse，零新增门禁、变量数不变；阈值标定守卫 |
| 2026-10-30-helixharness-absorption | 滴滴 HelixHarness 吸收与强制面修复 | 判定不移植框架形态；补 L2 可复现（判定库入库＋hooks 安装）、qgate pre-push、spec 四段机检＋收据漂移；吸收四层读取计量与评测校准合同（证据级） |
| 2026-10-29-kanban-deps-and-session-rotation | 卡依赖图停滞看门狗＋会话尺寸轮换 | run23 两案根治：依赖图停滞检测与会话按尺寸轮换 |
| 2026-10-30-delivery-cases-credential-bridge | 交付案例空态根治 | matrix 凭据双桥（client initClient 桥接＋服务端网关凭据回落），端到端自愈 |
| 2026-10-30-mux-plan-terminal-state | 推演方案终态化 | 去版本沿革与中间过程产物，按终态表述重写文档层 |
| 2026-10-30-report-frames-and-image-layout | 报告补帧与图版面放大 | 补 defect_done/ready_done 拍摄位；图版面与补拍标注规范 |
| 2026-10-30-run23-closure-batch | run23 收官热线修复批 | DEF 卡纪律＋governance-client unbound 修复＋报告黑话修正 |
| 2026-10-30-run23-divergence-retro | run23 三面差异复盘 | 报告×推演方案×设计对齐：运行口径立法＋推演程序修正（产品能力另批） |
| 2026-10-30-run23-full-retro-batch | run23 全面复盘批 | 轮换档位供给归一（42 profile）＋断言幂等＋确定性失败停摆 |
| 2026-10-30-run23-post-run-backlog | run23 在册挂账批 | DM 死信守门、kanban stuck 假阳性、terminal-incomplete 重试面、venv 包面守卫 |
| 2026-10-30-run23-product-capability | run23 产品能力侧改进 | 评测门禁归因／维度标注／承载面诊断三项；分支未合入 main |
| 2026-10-30-helix-followup-debts | HelixHarness 吸收轮挂账清偿 | 三条既有红根治＋obs-signals/评测验收器活体 10/10；活体抓出三虫（重复 import／cwd 账本路径／服务孤儿进程） |
| 2026-10-30-governance-doc-candidates | 治理工件注册表按轮回落 | 并行批次：按轮命名工件在评审面不再显示缺失（candidates 回落） |
| 2026-10-30-chat-timeline-race-fix | 群聊时间线面板间歇性不挂载根治 | activeRoom null 竞态自愈：点房间后消息稳定可见（前轮漏登记补录） |
| 2026-10-30-report-reshoot-auto-caption | 收尾补拍图注自动标注 | 补拍图注含「补拍」降级口径自动落（前轮漏登记补录） |
| 2026-10-31-matrix-autologin-deviceid | 日常工作台回归批② | Matrix 凭据校验器空 deviceId 误杀根治（网关自动登录会话房间画布恒「未认证」）＋探针时序三处 |
| 2026-10-31-daily-workbench-regression | 日常工作台全功能回归轮 | human-gate store 行级容错＋裸 grant 迁移（收件箱 500 根治）＋房间画布 rooms 悬空引用清偿＋?new=1 建卡深链收窄＋走查探针沉淀 |
| 2026-10-31-ide-workspace-regression-fixes | IDE 工作区全功能回归修复批 | 文件树换根竞态根治＋非 super_admin 权限回落任务域只读树＋板号回填＋i18n pickTask 键 |
| 2026-10-31-run23-clearance-g5-decide | run23 裁决执行批 | 台账全部清账（150 代偿＋41 DISP 终态回写）＋G5 批准走产品 human-gate decide＋fail-soft 维持记录 |
| 2026-10-31-product-capability-finalize | 产品能力收尾批 | 群时间线第二根源根治（补丁 710 rooms 形态守卫）＋企业种子七维映射＋G5 产品通道函数化测试；遗留#5 收案 |
| 2026-10-31-kanban-detail-fast-path | kanban 详情链加固批 | sqlite 直读快道（补丁 709）＋CLI 瞬态重试＋抽屉装载 watch immediate 竞态根治＋验收乐观同步；走查探针沉淀 scripts/regression/ide-workspace-verify |
| 2026-10-31-humangate-store-unify | HumanGate store 合并统一 | 旧版裸 grant 行装载迁移（升级信封行+归一化回写，未知形状仍 fail-closed）；runtime grant 测试 fixture 路径债顺手清偿 |
| 2026-10-30-release-v1.0.3-overlay | 发布轮 v1.0.3-overlay | HelixHarness 吸收两轮＋run23 收官批后升版：cockpit studio.4 / agent-teams team.4 / yuan-skill v2.98.0 / full 1.0.3-overlay（ycode 零变更不动） |
| 2026-10-31-run23-plan-report-retro-revision | run23 方案×报告全面复盘批 | 五机制入册（纪律 85-89）＋提前收尾通道立法＋HumanGate 审批面＋延后清账机械执法＋采集面参数化；附台账清账建议表 |
| 2026-10-31-full-regression-fixes | 全功能回归修复批 | HumanGate 历史 grant 兼容/矩阵画布键名崩溃（并行批已修，本批复核）＋规则 004 并发配额接线（补丁 712）＋SOS 残桩 fail-loud＋SOS 建议客户端消费面（补丁 717）＋loop.ts TS18047 启动阻断根治＋diagram 超时可配置＋IDE 简报 docs 探测 404 降噪＋kanban ?new=1 补键（补丁 711）＋IDE 自检 403 权限告警＋走查白名单补 groupChat＋回归探针 token/条件等待/录屏＋实拍录屏证据 |
| 2026-10-31-daily-walkthrough-probe-e2-close | 走查探针微批 | E2 抽屉关毕验证（first button≠关闭钮致建卡点击落遮罩的序列性假红） |
| 2026-10-31-k19-ghost-closeout | 未做项终清批 | K19 棘轮双红转正（lib/http 收口，extra 保 detail 键）＋看板幽灵卡挂账销案（活跃 run sim 源卡非缺陷） |
| 2026-10-31-daily-workbench-closing | 日常工作台回归收尾批 | 409 状态机语义（补丁 713）＋devAutoLogin 网关让位＋审批面确定性链＋loop 画布惰性建删＋录屏；403 定性接受噪声 |
| 2026-10-31-daily-walkthrough-probe-e5-e6 | 走查探针微批③ | E5 审批钮 review 态前置如实化（状态机拒转记不可达）＋E6 催办条断言修正（遮罩残留根治） |
| 2026-10-31-three-zone-regression-fixes | 驾驶舱三区全量回归批 | roomList 事件外初始快照＋client watch（深链房间页间歇不挂载竞态根治，守门 3 例）＋走查资产四脚本修复（testid 漂移/force 假红/权限前提 SKIP/桥接登录回落） |
| 2026-10-31-live-verification-closure | 活体验证收案批 | 收件箱 hgate decide 路由根治＋dimensions 路由白名单同步＋三面实拍录屏（G5/710 时间线/企业回填 9/9）；F4-F6 观察项挂账 |
| 2026-10-31-daily-research-absorption | 日常调研吸收轮 | 组件台账 37 行刷新（hermes-studio v0.8.0 升级评估不执行）＋v0.8.0 补丁 329 硬冲突/46 条高风险登记＋RSI HDA 等预算归因与约束保持门两项落码 |
| 2026-10-31-loop-graph-task-ledger | Loop Graph 任务台账 | P0–P4 与多视图逐条对账，LG-01～LG-40 任务清单；P0 三条入口跳转到已退役运行详情的断链，交产品裁决，不恢复 UI |
| 2026-10-31-restore-graph-run-detail | 恢复图 run 详情及回放 | RunDetailView 五件套自 250e058d9^ 恢复＋ia2.runDetail 改回实体路由＋守门断言随裁决演进；列表页与 RunCanvas 内嵌节不恢复（LG-01/LG-04 闭环） |
| 2026-10-31-three-zone-regression-r2 | 驾驶舱三区全量回归二轮 | 走查装具就绪化（waitForApp/switchAndWait 空排除/左栏折叠/权限回退 WARN/执行上下文重试）＋推演七入口交互探针；PATCH 状态机 409 由并行补丁 713 交付，本批只核对与活体验证 |
| 2026-10-31-hanging-items-closure | 挂账清零批 | F4/F5 定谳采集登录竞态（r18 reload 根治）＋F6 看门狗自动补刀＋UI 真人裁决全链终证 |
| 2026-10-31-three-zone-undone-closure | 三区回归未做项收口 | PATCH running/WS upgrade 异常/admin 写范围三补丁（714-716）＋棘轮 5 处 fail() 收口＋rawGain 启动阻断＋推演设置/地图标注写回路＋历史 run 26/26 回放＋模型/Agent/Matrix 媒体冒烟 |
| 2026-10-31-studio-v080-upgrade | hermes-studio 基线升级 v0.8.0 | pristine 换血@f67b587b9＋44 失败件重生成（42 落盘/2 退役）＋266·197·528·623 迁位＋esp32→mcu 品牌迁移＋守门三例转注入态树断言；重放零失败全量绿 |
| 2026-10-31-rsi-d2d3-frontend | RSI 二批：D2/D3＋前端录入面 | CHASE 反事实门（counterfactual_gain_collapse）＋垫脚石档案 proposalArchive＋约束/等预算/反事实前端录入（面板 3 测试例） |
| 2026-10-31-brand-v080-new-faces | v0.8.0 新面品牌扫尾 | 补丁 718（33 文件，A/B 双树差分）：11 语种 locale＋desktop＋mcu 新固件＋ekko-agent 文档＋server 提示词残带 Ekko Studio 归 AIStudio；SSID 随 329 先例；净树重放 425 条零失败＋全量 7074/0 |
| 2026-10-31-zcode-3171-sync | zcode 基线同步 a60ba6a7（v3.17.1） | pristine 换血＋8 补丁全重放（002/006 重生成）＋引擎构建绿；附带 L2 design-sync 大变更集 SIGPIPE 误判根治（here-string，独立提交） |
| 2026-10-31-rsi-p2-batch | RSI P2 批：D7/D10/D11 | 起草器进化全史注入＋剪枝删除提案模板＋记忆压缩/遗忘策略（stale 再验证＋孤儿退役，人裁决）；loop 48/http 26/面板 19/保鲜 4 全绿 |
| 2026-10-31-release-v1.0.4-overlay | v1.0.4-overlay 发布轮 | 进位判定＋载体七件＋A.1 登记（覆盖行合并去重）；cockpit 0.8.0-studio.2／agent-teams team.5／yuan-skill v2.98.1／ycode 3.17.1 照发；GitHub Release 只发说明 assets=0 |
| 2026-10-31-package-lock-version-unify | package-lock 版本归一 | 两处 root version→1.0.4-overlay＋release:check 三载体对账门＋守门测试（override 钩子注入陈旧 fixture 断言拦截）；lock 定位=派生载体第八件，不回改已发布产物 |
| 2026-10-31-run24-plan-realign | run24 前重锚 | 方案正本品牌 12 处→AIStudio（裁定引文保留）＋/app/runs/:runId 实体路由＋37 签头注重锚＋治理中心称谓三处＋test-report 补契约用例判据 17＋守门窗口 9200→12000（main 自带红根治）＋run24 prelude；vitest 217/217 |
| 2026-10-31-approval-proxy-dedup | approval-proxy 幂等去重 | 批前查代批日志同 event 前缀跳过（run24 同 pending 32 秒 9 次代批实锤）＋守门符号断言；vitest 112/112 |
| 2026-11-01-gate-verdict-hardening | 闸门判词三件硬化 | 中文分项判词（结论N:过族）＋卡面窗锚60s＋OCR通道⑩c硬检；lifecycle 38/38＋守门 128/128 |
| 2026-11-01-emptystream-ladder-classify | 722 流掐断自恢复 | EmptyStreamError 归类 timeout 入梯子资格（run24 四现场根治）；classifier 192/192；网关热载生效 |
| 2026-11-01-parallel-dispatch-saturation | 并行调度与编制饱和度立项 | 历轮未根治欠账归因（复盘定性错误/代偿豁免/非验收指标）+三件设计（early-start 预备步/跨域依赖看护/利用率入报告）；代码批收官窗落 |
| 2026-11-01-run24-closure | run24 收官批 | operator-closure 通道执行＋26 步叙事/PART1 注册＋报告链 8 轮至审计 rc=0＋pending-batch 9 件清单入册；report_done=1793529073，G5 诚实 FAIL 16 红挂清偿门 |
| 2026-11-02-run24-retro | run24 复盘与根治批 | 问题谱系四层全量归因（137 单 31 键+4 新识别）＋处置映射；驱动 6 件/产品 4 件/方案四修订/模板三张；判据 17 执法器落地 |
| 2026-11-02-run24-retro-driver-batch | 驱动面六件根治 | DM 直达后备/复测预启动钩子/early-start 三预备键/跨域依赖看护/origin 立法+⑩d/G5 风暴去重+快照 out 守卫；vitest 233/233＋17 sh 全过 |
| 2026-11-02-regression-followup | 回归轮挂账四件清偿 | vite 劣化根因＝并行 git 触发自重启（探针加闪断重试）＋matrix 真会话内容探针 5/5＋pytest 拼合树 257/257（410 测试补 refused 字段）＋补丁 070 CSS 三重复制去重 |
| 2026-11-02-agent-patch-injection-list | 补丁注入白名单 | 722/723 纳入 mx_apply_agent_patches＋runtime 副本同步 723 诊断段＋守门两断言（128/128）；原只登记 series 从未应用 |
| 2026-11-02-chat-recovery-kwarg-fix | 725 recovery kwarg 冲突修复 | 补丁 726（pop conversation_history 防御排除）＋series/白名单同批登记＋守门断言；run25 G2 熔断现场三层根因的 B 层根治 |
| 2026-11-02-scenario-gate-resilience | 场景闸门韧性两件 | RACI 复查免等窗（提速④，run25 四组全超时实锤）＋G2 超时分支二轮复审等待（C 层，派单后 2s 即 FAIL 的执行窗缺失根治）＋守门两断言 |
| 2026-11-02-sens-unbound-replay-fix | _sens 重放 unbound 修复 | G2 安全前置硬校验默认空写法＋守门断言；run25 四启 21:55:04 实录（security_review_done 在位时重放必踩，set -u 漂移风险）|
| 2026-11-02-supervisor-nudge-gate-aware | 监督器催办闸别分流 | G2 熔断被 G5 话术误催（run25 实锤三回合抢占修订路径）→breaker.json 实际闸键三分支话术＋守门三断言 |
| 2026-11-02-mechanism-governance | 机制治理批（根治速度追上复杂度） | 五件：机制地图/烧机测试（prelaunch ㉛）/闸门耗时台账/纯函数+行为测试 17 项（补丁 729）/恢复层让位 v1；run25 内耗 120 分钟定谳驱动 |
| 2026-11-03-run25-full-retro | run25 全流程复盘与根治 | 33 唯一键全量归因四层（采集/纪律/接线/容量）；驱动 5 件＋监督器空指纹＋采集映射 2 键＋审计口径 2 处＋六闸事件＋方案 §5.10 七条；门集 254/254、行为测试 21/21 |
| 2026-11-03-run26-pending-batch | run26 挂账台账 | run25 复盘未做项唯一事实源：N01 烧机首跑/N02 审批台账/N03 发布门台账/N04 评测数据/N05 模板两节/N06 DISP 闭环+N07-N09 观察项+N 429 不处置裁定 |
| 2026-11-03-release-v1.0.9-overlay | v1.0.9 发布轮 | run25 收官（六闸全过 11h04m）＋机制治理五件＋复盘根治 12 项；cockpit studio.8/teams team.8/ycode 3.17.1/yuan v2.98.5/fullPackage 1.0.9 |
| 2026-11-03-offline-everything-complete | 离线包 everything 全内嵌 | R134→R145 口径修订：默认档含运行时零知识库、everything 档含知识库零运行时（互补非包含）→ --everything 改为全内嵌（127M）；断网机一次装齐 |
| 2026-11-03-bundle-tracked-only | 离线包只打跟踪文件＋版本覆盖 | cp -R 带入 34 条构建残留（tests/e2e/target、嵌套 .swarm-yuan）→ 改 git ls-files 白名单复制；SWARM_YUAN_OFFLINE_VER 解包名被 describe 后缀污染 |
| 2026-11-03-tar-pax-gnu-repack | 源码包 PAX 头清除 | 中文文件名 >100B 触发 git archive PAX 扩展头（7-Zip 显示为 .paxheader 文件）→ Python tarfile GNU_FORMAT 重打，三包 pax 头归零 |
| 2026-11-02-run24-retro-product-batch | 产品面与报告链四件 | 补丁 723 dispatcher 拒绝原因聚合（根因=board 团队围栏拒子编制 assignee）/利用率报告行/判据 17 执法（查 18） |
| 2026-11-02-full-regression-fixes | 全功能回归轮补丁面两缺陷修复 | 723 尾 hunk 缺尾随上下文致 git apply EOF 锚定误判（inject WARN 跳过＝到达即坏；补计数 3/172→6/175＋3 行尾上下文）＋724 新增 isFullscreen 定义回补（App.vue ReferenceError，070 使用侧在位而 111 定义侧缺席）＋走查探针对齐设计语义（registry 空态/sim fail-closed/locked-ips・files 权限面白名单＋matrix 访客态）；walk-routes C/D 簇清零 |
| 2026-11-02-run24-runtime-closeout | run24 运行面收口 | 722/723 真正加载（白名单+重放）/板围栏 4 板修正（nonspawnable 5→0）/遗留卡 5 张冻结/studio 换装活体三态/归档 35 键审计 rc=0；pending-batch 8/9 闭环 |
| 2026-11-02-chat-turn-recovery | chat 跨回合恢复（725） | 回合终态失败后同会话续做（预算缺省 1/上限 3，确定性失败不重试）；五态自测＋纯净树 apply 过；run24 四现场缺口闭合 |
| 2026-10-31-prelaunch-crossrun-residue-gate | prelaunch ⑩b 跨轮残留门 | 轮次工件七目录零残留硬门（run24 污染根治：AN-*/RFD-* 假真值跳系分）；PRELAUNCH_ALLOW_CROSSRUN_RESIDUE=1 豁免；九个跨轮基础目录设计内保留不在判定面；计数六处同步三十二项；绿红双测过 |
| 2026-10-31-rsi-improvement-plan | AIStudio RSI 改进方案 | 四切面前沿调研＋仓内审计→R1-R12 分档项目（证据自动化/双体系合一/经验库治理/规模化）＋六条不做清单；执行按批次另立 spec |
| 2026-10-31-superagent-domain-auth | super-agent 吸收 A+B 批：编排域与授权流水 | 新域 `custom/server/orchestrator/`（Trigger/Thread/Subscription/Decision/Mandate/Assignment 六表＋准入表＋四类策略版本＋看板事件桥）；DecisionGrant 增 strength/policyVersion/ruleIds；HumanGate 角色白名单与代批标注；patch 719 挂载 `/api/orchestrator/*`；vitest 24/24＋approval-inbox 96/96＋拼合树 pytest 11/11 |
| 2026-10-31-cockpit-attention-panel | 工作台概览三问重排与注意力经济守门 | `/app/dash` 概览按「要我做→是否健康→进展」重排；健康节仅异常显形（最多 3 条＋折叠）、计数=列表长度、标签写「等谁要什么」；五条规则入组件测试；ia2 934/934 绿 |
| 2026-10-31-rsi-exec-batch1 | RSI 执行方案（R1-R12） | R1-R12 十二件全部执行完毕（三批＋残项：探针双缺陷/加权检索/验证分级/三类证据自动供给/CHASE 变换器/留出门/缺口桥/约束消融/advisory 回路/技能差分/任务族/SQLite 渐进）；执行实记与坑随文 |
| 2026-10-31-superagent-router | super-agent 吸收 C 批：Router 能力（语义评估与汇总） | 不新设常驻会话：`evaluator.ts` 走 gateway 会话做语义评估（三项配置缺一即 unavailable，超时/排队不重发）＋`summarizer.ts` 确定性汇总（5 分钟窗、终态留标题、纯列变更静默）＋`pass.ts` 评估轮（仅 auto+accept 推进）；vitest 46/46 |
| 2026-10-31-orchestrator-delivery | 编排域汇总投递 | digest → thread_key → 看板 `kanban_notify_subs` 反查原信道 → `matrixSend` 直发；成功置 delivered、失败累加 attempts/last_error；订阅为空记 skipped；定时器默认关（`ORCHESTRATOR_DELIVER_INTERVAL_MS`）；vitest 7/7 |
| 2026-10-31-orchestrator-tick | 编排定时轮与多板接入 | `tick.ts` 一轮串起 桥接→评估→汇总→投递；`ORCHESTRATOR_TICK_INTERVAL_MS` 默认关、评估每轮上限 2；接入 default/aiteam/data 三板（`~/` 展开）；汇总后推进订阅游标；vitest 7/7 |
| 2026-10-31-model-resilience-hardening | 模型能力波动下的交付确定性加固 | A 完成门 DoD 契约（AC/dod 派生＋结构化回执＋TAP/JUnit 重算＋派发源哈希）；B qgate `runtime-proof` 可解析＋L0 硬件集 pre-push 默认拦截；C 能力矩阵×风险分档路由（高风险无证据 requiresHuman）；D 巡检/轮换补偿默认开＋建卡幂等唯一索引；patches 720-721 |
| 2026-10-31-prepush-push-range-fix | pre-push 判定面修正 | 只判本次推送的提交范围（stdin 引用→merge-base/diff＋`--changed`），不拿 main 工作树的 inject vendor 脏态误拦；删除引用跳过；stdin 回放给 git-lfs；守门 5 例 |
| 2026-11-03-deerflow-source-verification | DeerFlow 源码级核对 | 浅克隆 1dd6d05（2595 py）核对：撤回「四类子代理」硬错（内置只有 bash_agent/general_purpose），补报告契约/验收对账/容量准入/技能延迟发现；MASS 标注摘要级 |
| 2026-11-03-handoff-quality-ledger | 交接质量账本 | MASS/DeerFlow 吸收：认领回合（claimed→终态）交付率/掉落率/中位时长/停滞/抖动/依赖等待；`GET /api/harness/handoff/quality`；只作信号不进判据 |
| 2026-11-03-harmony-multiobjective | Harmony 多目标演化吸收 | 分解搜索（权重向量+Tchebycheff 代表解）、安全作可选第三目标、增益保留率（<30% 告警，可升硬闸）、整块重写警示、结构多样性只监测；分解只出报告不改裁决 |
| 2026-11-03-proactive-intervention-governance | 校准化介入（注意力轴） | 综述 6A 对表后补三缺：介入治理者五档决策（安静时段/预算/冷却/拒绝退避/积压合并/延后升级）、介入台账与反馈校准、三层计分卡；巡检 15min 自动同步 delivery 建议；安全告警与 agent 催办不接该层 |
| 2026-11-01-design-sync-rsi-exec | RSI 执行后设计文档同步 | 工作台专项设计 §4/§5/§6/§14 对齐现行（门禁三档 64 code、26 端点、字段全集）；正本 §5.8 补七条证据约束、§7.3 更正 v0.8.0/zcode 升级状态与台账 41 行口径；总账补三行稳定参数；顺带修 R11 任务态落盘无调用方与 SQLite 连接缓存未绑路径两处实现缺口 |
| 2026-11-01-k19-new-endpoint-response-shape | K19 新增端点响应形状收敛 | modelcap 走 lib/http 的 ok/fail/bodyOf；RouteDecision.ok→routed 解耦域决策；workitem 两处错误体收敛抵掉并行新增；ok:false 878→873、ctx.body 1190→1187，均低于基线 |
| 2026-11-01-runtime-backfill-session-rotation-plugin-api | runtime 模板回灌 | session_rotation←705 软轮换第四类判据（与注入态逐字节同）；plugin_api←RFC 9457 problem+json 冲突体（宿主唯一正本入库）；回灌后 deploy 零保留差异 |
| 2026-11-01-dod-kernel-gate-lineage-reclaim | 完成契约门下沉内核＋血统收回 | dod-drill 两轮穿透实锤（worker 走 installs CLI 无门完成）→门下沉 complete_task 唯一边界＋CLI --receipt＋启动器 shim 收回 .venv 血统＋HERMES_SKIP_UPDATE；内核门测试 5 分支全绿 |
| 2026-11-01-dod-session-context-wiring | 完成契约会话接线 | R3 实锤：内层 agent env 由 bind_worker_context 从 kanban_json 重建、不继承派发 env——契约冻进会话上下文（build_kanban_policy）并随 bind 导出；旧会话豁免 |
| 2026-11-01-sim-dod-sync | 推演方案×程序同步：完成契约门接线 | 方案 §2.6.12（执行层第零道锁，G 判据零改动）；mx-up 固序 provision→patch→deploy；建卡 MX_DOD_CONTRACT 开关（缺省关，run25+ 开）；runbook 换 manifest 通道；守门 ㉖ 五断言＋117/117＋shell 门 ALL-PASS |
| 2026-11-01-sim-resilience-sync | 推演方案×程序同步二批：模型波动支撑面与运行态存储 | 方案 §2.6.12 补四层同族关系（B/C/D 不进判据，D 层建卡幂等走两文件定点补位）、§2.6.8 补代批强度自动标注 delegated；mx-lib 新增 721 定点补位（补丁清单不含 721，实测会硬失败）；mx-clean 归档 orchestrator/modelcap 新存储；守门 ㉗ 四断言＋226/226 |
| 2026-11-01-chat-turn-recovery-design | chat 回合自恢复（agent 主动性产品能力）立项与设计定稿 | 群/DM 派发回合熔断打断后死等无自恢复（run24 三现场实据，看板回合恢复不覆盖）；HERMES_CHAT_TURN_RECOVERY 判定扩展＋无卡恢复 prompt＋会话预算防风暴；状态 designed 待补丁批 |
| 2026-11-01-release-v1.0.5-overlay | v1.0.5 发布轮 | cockpit 0.8.0-studio.3／agent-teams team.6／yuan-skill v2.98.2／ycode 3.17.1 零变更照发；GitHub Release 首次上传构建物（用户明示，local-only 显式例外）；chat-turn 补登记随批清主干守门红 |
| 2026-11-01-release-v1.0.6-overlay | v1.0.6 发布轮 | cockpit 0.8.0-studio.4（补丁 722 载体在 patches/ 属 cockpit 包含面）／agent-teams、yuan-skill、ycode 零变更照发；GitHub Release 构建物上传（用户明示例外同 v1.0.5）；ModelScope 全资产同步 tupang/ollama 仓（aistudio/ 4+1 源码包＋swarm-yuan/ everything 档，术语=本地仓 ollamalinux/ollama 用户立法）；run24 待落批台账（9 件）随批 |
| 2026-11-02-release-v1.0.7-overlay | v1.0.7-overlay 发布轮 | cockpit studio.5（48 文件）／agent-teams team.7（runtime 723 副本）／yuan・ycode 照发；run24 根治＋回归两真缺陷修复＋725 chat 跨回合恢复＋编排定时轮＋离线安装包 Windows amd64；八载体同批 |
| 2026-11-02-offline-windows-package | 离线安装包（Windows amd64）设计与交付 | web 模式（全仓快照＋本机 hermes-agent 工作树快照＋脱敏 env/zcode 模板＋PowerShell 安装链）；Teams 默认全装（D12）；uv 通道（D6）；registry 继承目标机环境变量（D3）；脱敏 fail-closed（D7/D13）；安装链未实机验证如实标注 |
| 2026-11-02-vendor-upgrade-studio-v109 | 第三方依赖升级批：hermes-studio v1.0.9＋element-web v1.12.33＋superpowers v7.0.1 | studio 基线 v0.8.0→v1.0.9（023/042/718 校准＋207 退役：上游原生 pin agent 0.22.5）；element-web 本机构建面 v1.12.33；superpowers 本机插件面 v7.0.1；agent 维持 v0.22.5（80 补丁 pristine 重放存量债挂账） |
| 2026-11-02-agent-debt-recheck | agent「80 补丁存量债」证伪收口批 | 真 pristine 80/80 全绿（昨日 WARN=final inject 重跑伪象：无幂等+已部分注入树）；主检出态=基线+80 补丁完全可再生（431/431 零失败实测）；7 件 .gitignore 误伤补录；VENDOR.md 曾被 pre-commit vendor 撤出丢失随批补回 |
| 2026-11-02-test-stability-dsl | 测试稳定性 DSL 三件套（MTSC2026 AI Native 测试方法论吸收批 A） | 走查面 dsl.mjs（waitFor 谓词轮询/Teardown 逆序恢复/pick 选型，零依赖+harness re-export）＋服务端 test-support（createTeardownScope/bindTeardownToSuite/waitFor）；存量 967 测试零改动，新件供新测试 |
| 2026-11-02-failure-taxonomy | 统一失败根因分类器（方法论吸收批 B） | 六类 taxonomy（SCRIPT/ENV/PRODUCT/TIMEOUT/FLOW/UNKNOWN）正本＋failure-detector `_classify_failure` 规则表（优先级 ENV>TIMEOUT>PRODUCT>SCRIPT>FLOW）＋error-history.jsonl 增 category 字段＋五套台账映射；PRODUCT/FLAKY 留 AI 复核（机械不越权） |
| 2026-11-02-maet-retrieval-ladder | MAET 四路径完备门＋四层知识检索协议（吸收批 C+D） | spec 模板 §19.2 加路径类型列（M/A/E/T，补 Termination 终止路径）＋checklist 完备项＋模板结构守门六态；knowledge-retrieval-ladder 四层协议（L1 边集→L2 索引→L3 语义→L4 实现，四纪律+升层判据）；dist-manifest 补账 failure-taxonomy 漏登记 |
| 2026-11-02-test-vocab | 测试词汇规范：受控动词表（吸收批 F） | glossary 六标准动词（查询/验证/构造/等待/清理/断言，别名治理同义散用）＋模板 §19.2 注记（步骤动词可溯源方法/DSL 件）＋守门扩态 |
| 2026-11-02-plan-program-latest-sync | 产品能力消费面入册（并行批，代登记解堵） | 自主性/审计/评审治理/改进实验四域入册；A.1 登记由落档批补全，此行为机械登记非内容裁决 |
| 2026-11-02-skill-grader | 技能产出 Grader 环：spec 测试设计段语义评估（吸收批 E） | eval 域 skill-grader.ts（S0 机械 MAET/GWT 结构判＋S1 LLM 四维 rubric 反偏置问句）＋基线快照/对比＋POST /api/eval/skill-grade＋stub 测试零模型成本 |
| 2026-11-02-release-carrier-reconcile | 发布载体对账清偿 | cockpit 0.8.0-studio.5→1.0.9-studio.6（底座对齐 VENDOR v1.0.9，N 全局递增惯例）＋yuan-skill v2.98.2→v2.98.5（CHANGELOG 真源追平，吸收批机械漏同步回填）；三存量红清零，整包 1.0.7 不动 |
| 2026-11-02-eval-skill-panel | Eval Studio 技能评估面板（skill-grade UI 接线，E 批挂账清偿） | 第八页签 SkillGradePanel（specText 输入＋基线 runId＋落基线复选→四维判定/四判表/delta 分层呈现）＋api.ts DTO 镜像＋i18n 双语＋组件测试 |
| 2026-11-02-release-v1.0.8-overlay | v1.0.8-overlay 发布轮 | cockpit 1.0.9-studio.6／agent-teams team.8／yuan-skill v2.98.5／ycode 3.17.1 照发＋整包 1.0.8；GitHub 7 资产＋ModelScope 通道恢复源码档（不含构建物，用户本轮令，v1.0.7 暂停口径取代）；fullPackage.tag v1.0.6 滞留漏账随批修正 |
| 2026-11-02-eval-skill-grade-plan-sync | 方案同步：Eval 技能评估环（代登记） | 方案八页签（§2.5/§2.6.3 第 13 条 Grader 环）＋prelaunch ㉓ 断言第八页签与端点＋守门三条；报告证据八 no_data 如实呈现不硬凑；此行为 3ec71fd4d 漏登记的机械代补 |
| 2026-11-02-run25-prelaunch-tooling-hardening | run25 前置暴露的三处工具链缺陷收口 | mx-clean 分支清理面改「除 main 全清」（tag 保全纪律不变）＋中央 bare HEAD 立正 refs/heads/main（工作区克隆坏基线根治）＋ensure_studio_up 显式携带 PIPELINE_TRIGGER/PARALLEL_REVIEW（mx-setup 先行拉起占位致 mx-up 带旗标启动 EADDRINUSE 实锤）＋prelaunch ㉒ 断言目标修指 stage-attribution.ts |
| 2026-11-02-board-fence-full-roster | 板围栏全名册供给（run24/run25 双轮复发根治） | set_board_team 多 agent-id＋mx-setup 第 5 段围栏=全编制名册 42 profiles（SIM 单 home 全编制合法领卡；只挂板主单 profile 致缺陷卡跨板指派整批 skipped_nonspawnable）＋board-supply-check 配方同步；运行态 28 板已回灌 |
| 2026-11-02-g2-breaker-evidence-main-tip | 熔断证据签名并入 main tip（pre-integration 闸复位盲区） | _mx_gate_evidence_sig 增 mtip——G2 阶段修订证据落 main 而签名只看尚不存在的 integration 分支致熔断 35min 不复位（run25 实锤 1d55ba2 全盲）；OVERRIDE 复议口不替代证据复位 |
| 2026-11-02-mx-run-single-entry | mx-run 单入口（监督器随开跑自动携带）＋_sens 重入卫生 | 裸跑驱动熔断退出后 34min 无人续跑（run25 实锤）——README 换单入口、裸跑须显式 --no-supervisor；:1091 _sens 未绑定（重入路径赋值被 security_review_done 短路跳过）改默认展开 |
| 2026-11-02-simrun-supervisor-product | simrun 推演运行监督域（监督器落产品＋同类合一） | custom/server/simrun/（驱动生命周期监督＋网关健康观测；证据指纹三方一源）＋补丁 727 挂载＋/api/simrun/supervisor/*；同类归置表＝驱动/网关监督入产品、卡面（clusterinspector）/编排（pipeline）/回合自愈（722/725）边界不并入；测试 7 断言 |
| 2026-11-03-run25-collection-gaps-backfill | run25 采集面缺失全量补流与根治（注册对账守门＋文件域呈现位＋缺件不埋桶） | 方案/程序采集面 vs run25 实测五类缺失定谳；中央仓五笔补流直接落 main（五轮补件落分支被清丢根治）；dispatch_done/report_done 补注册补拍、mp_runtime_proof 首帧进报告；evidence-push 失败必登记 pending-backfill.tsv；审计四查全过、缺件 2→0 |
| 2026-11-03-run26-pending-clearance | run26 挂账 N10-N13 清偿＋采集呈现两反馈根治 | 18b 接线（prelaunch ㉜ 双通道探针+驱动 fail-soft 核验+守门）；小程序首帧空白页根治（副本重建为正本+mock BFF+等渲染截帧，businessLogicRan=true）；竖屏帧 1/4 排版；方案 HTML 自包含渲染器（mmdc SVG 内联）；四 app 行覆盖实测；N11 补做复核（双人 5/5+5/5 锚实+红线三条过）；中央仓分叉仲裁 0/0 |
| 2026-11-03-release-v1.0.10-overlay | v1.0.10 发布轮（run26 清偿＋采集呈现根治；资产口径收窄=只发 full＋yuan everything 两包） | fullPackage 1.0.9→1.0.10＋cockpit 声明前进 studio.9（包不重发）；GitHub Release 2 资产；ModelScope aistudio/ 只换 full＋仓根 everything zip＋SHA256SUMS-v1.0.10（旧版保留）；全量 7293/0 |
| 2026-11-03-release-asset-policy-twopackage | 发布资产口径立法（上传面永久收窄=两包） | artifactDistribution 旧 local-only 文整体替换为 two-package-only：每版只传 full＋yuan everything（GitHub 2 资产；ModelScope aistudio/ 只换 full＋仓根 zip＋SUMS）；四模块包/构建物不再上传也不打包（make-release-packages 默认只打整体包＋--all-modules 逃生）、存量保留（D1/D2/D3） |
| 2026-11-03-swarm-yuan-absorption-pstack-evals | pstack/addyosmani/mattpocock 三仓源码级吸收 | 门禁 56→59（skill_docs/skill_routing/floor_guard）、eval-routing 与 floor-guard 脚本、第七类产物三模板、九节点三处接线；修 check_spec_first 源文件缺 26 行 |
| 2026-11-03-swarm-yuan-budget-tier3 | 分发预算瘦身＋Tier-3 落地 | code-graph-tools 转 gen_only（642207→598954B，预算不上调）；Tier-3 确定性动作断言脚本+五态守门；修 --runner 静默回落 |
| 2026-11-03-four-gap-completion | 四性四格补齐：制品落盘／矩阵界面／报告节／指纹采集 | AC 追溯与阶段交接键可写入 run 目录并回读（原子写＋run 围栏）；AcTraceSection 挂需求阶段（未采集如实显示）；报告新增四性自评节（fail-soft，缺席写未采集）；模型指纹按 profile/env 解析并出摘要端点（取不到即 unknown） |
| 2026-11-03-four-gap-capabilities | 四性四格能力：姿态准入／AC 追溯／阶段交接键／审阅独立性 | posture 由只读对账升级为可拦判据（report/require-for-gate/strict）；AC→用例→运行结果追溯（unbound/no-result/failed 三分）；四把阶段键入口校验（结构/产物/哈希/提交锚点）；模型指纹三态＋require-for-verified 共模降级；四件默认 report 零行为变化，新增 48 断言 |

### 角色/排除（非 spec 文档）

以下文件保留在 specs 根目录，但不是 A.1 的专题设计、规格或决策文档；排除是角色分类，不是删除或按日期作废。

| 文件名 | 角色/排除 | 说明 |
|---|---|---|
| 2026-10-21-ncwk-unified-product-design | 文档导航 | AIStudio 设计文档导航，指向终态正本、配套档、A-D 与历史档案 |
| 2026-10-21-swarmstudio-appendix-a-spec-index | A 索引，本文件 | specs 根目录唯一文件级 spec 索引；索引自身不重复计入 A.1 |
| 2026-10-21-swarmstudio-appendix-b-plans-research | B 索引 | 实施计划与研究/复盘档索引，覆盖范围不在 specs 根目录文件级集合内 |
| 2026-10-21-swarmstudio-appendix-c-capability-corpus | C 索引 | swarm-yuan 方法论、决策文本与 research 的能力层全库索引 |
| 2026-10-21-swarmstudio-appendix-d-lessons-rules | D 索引 | 历史教训、被证伪假设、明确不做与工作规则的汇编索引 |
| 2026-10-23-ncwk-complete-design-compilation | 退役拼接指针 | 自述六部分拼接版已退役；全文留 git 历史，本页只指向终态正本 |
| 2026-10-23-swarmstudio-design-ledger | 数字附录 | 稳定设计参数、参考部署与版本快照，不是专题设计或业务 spec |
| 2026-10-23-swarmstudio-integrated-design | 当前终态正本 | AIStudio 唯一设计正本；在索引中登记角色，不重复计入 A.1 |
| 2026-10-24-merged-projects-knowledge-compendium | 合并来源地图 | 自述只做映射与对账、不复制正文；登记并入项目、决策与会话来源 |

## A.2 按域聚类（13 域，2026-10-23 历史快照）

| 域 | 份数 | 演化主线（摘要） | 当前终态 | 被推翻/废弃 |
|---|---:|---|---|---|
| D1 工作台与看板 | 59 | 三栏 mock → 接真数据 → 通知/筛选/日程/工作项 → 终端多工具 → 六阶段工作台+唯一看板 | `/app` 六阶段、`/app/board` 唯一看板、看板卡唯一写入口 | patch 028 重写、纯 mock、旧横向看板页、三栏六区菜单 |
| D2 IA 与治理面 | 16 | Loop 单页 → 壳+四场景 → 三中心 → 旅程页 → 六阶段左栏 → 日常/推演拆分 → GovOverlay 退役 | 左栏常用+六阶段+四岛+设置；阶段页 33 单层签；三模式 | 六区域窄栏、顶栏六阶段条、三中心一级导航、角色专属路由、治理独立七签 |
| D3 推演引擎与中心 | 29 | 五阶段 Loop → loop graph（图中心/事件日志）→ P0-P3 → 三模式 → V8.46 + G5/UAT 状态机 | GraphService 三态、26 步六闸、导演详情分流；run22 已收官（六闸全过） | LoopEngine.tick、三 State Store、多需求并行、六区菜单、假启动 |
| D4 方案/报告/文档治理 | 11 | V3 26 步 → V7 混编被指 → V8 五部分 → V8.28/8.37/8.44/8.45/8.46 | 方案唯一正本+机器解析源；验收=第五部分 | V7 五层混编、报告五块拼凑、V4.1 独立方案、旧生成器 |
| D5 评测/观测/Harness | 17 | RunTrace L1 → Eval Studio 四层 → 腾讯/百度 → Harness 可靠 → Harness² | 四层判定、指标 drives、红队 S0、九层体检、31 检测器 | 只打分评测、report_only 装饰、重型观测、冠军自动选择 |
| D6 IDE/Ycode | 27 | codex 默认 → zcode 受管 fork → Ycode 红线 → 深度重构/双模式/CUA → 用量账本/上下文 | 21 页签、双模式、CUA fail-closed、账本只读三表 | codex 底座、聚合器路线、第二套运行时、假 CUA、WSL 假支持 |
| D7 治理/门禁/安全 | 14 | QGate v0.1→v0.2 六态 → v0.3 移植 → 安全整改 → 评审治理/安全审计/策略引擎/序列护栏 | 六态、风险分档、六阶段审计、策略附加层、污点拒绝 | 五态 verdict、vendor 唯一内核、硬失败阻断、保留默认账号、自动回滚 |
| D8 运行面/团队/供给 | 22 | Matrix 迁移 → 三用户模拟 → Fleet → 分布式交付 → 能力四维 → 并行/编排/联邦/三机 → 能力目录/供给 | 15/30/42/28；Matrix 事实源；零新增服务；manifest 唯一源 | 每 agent 独立账号、中央任务服务、中央 delivery server、E2EE/联邦、SSH 直连、五角色硬编码 |
| D9 本体/BPA/FIBO | 9 | 本体六要素 → 透镜诊断 → BPA → FIBO 三线 → SSOT | FIBO 37/21/16 正本，qgate 派生；BPA 四页签 | 运行时 OWL/SPARQL、实例自动摄取、全量 FIBO、BPMN、决策边界 schema |
| D10 跨域调研吸收 | 3 | 五文/三文/X62 | 机制级吸收；孤儿 20/6/36 | 功能照搬、专有代码迁移、假“最新版” |
| D11 基础设施/升级 | 16 | overlay 架构 → gateway/LMM/node_modules → 三轮净树升级 → 性能/环境/地址源 | 382 补丁；净树三段式；port-per-profile | npm 包化/submodule、overlay multiplex、overlay LLM 路由、共享 node_modules |
| D12 UI/UX/无障碍/术语 | 13 | Pure Ink → V1-V3 → token 收敛 → WCAG → 步显示名 | ia2.scss 单一 token；三壳同步；name/displayName 分层 | UI 框架、双主题、全量 WCAG 重校、三套抽屉合一 |
| D13 正本/需求/验收 | 6 | 需求冻结 → 三中心定稿 → 完整设计 → 三域合一 | 三层结构；冲突裁决顺序；146 决策 | 三份并行事实源、旧决策计数、独立档案件、角色镜头波次 |

> 本节保留 2026-10-23 的域聚类快照，份数与「当前终态」均按该日期理解，本轮不重算；不得用本节份数充当当前全量总数。当前文件级覆盖只以 A.1 与「角色/排除」表为准（2026-10-26 复核）。

## A.3 跨域单一事实源清单（节选）

阶段定义=`stage-meta.ts`；设计 token=`ia2.scss`；技能期望源=`skill-provisioning.json`；Agent 能力=组织注册表；FIBO 正本=`ontology-fibo.ts`；工具契约=`toolcontract`；并行安全=`DISPATCH_SAFETY`；报告真值=`report_truth.py`；Matrix 地址=`server-info.ts`；评测指标=`METRIC_DEFS`；图事件日志=SQLite；验收标准=方案第五部分；术语=`glossary.txt`。

## A.4 明确否决与未验证（摘要）

否决：音视频/贴纸特效/身份发现/spaces/tower/Tauri/iOS/新一级页；mods/pets/esp32；主会话 append-only/进程沙箱/完整 Mods；Jev-Omni 本地/SAT 策略学习/Hindsight 整体/容器沙箱/L4 决策融合；OWL DL/SPARQL/实例自动摄取/BPMN/运行时 RDF；MCP 投毒扫描/跨会话策略/outcome 校验/kill switch 进程终止；ClickHouse/S3 观测；冠军自动选择；处置单自动分配。

未验证：diagram-export×3、cua×5、tool-waterfall×1、IDE 超时、Matrix 分享房、swarm-yuan 5 家 L1、zcode CUA Windows/Linux 路径、技能供给宿主半写文件、Harness² 四项未移植、FIBO 证券/衍生品/贷款仅只读目录。（agent 0.22.1 补丁 19 件未验项已由 0.22.4 升级轮消化：12 补丁手工移植全绿、镜像 44 文件、宿主网关换血）
