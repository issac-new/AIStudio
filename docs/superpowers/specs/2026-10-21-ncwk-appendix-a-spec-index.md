# 附录 A：产品面全量 spec 索引（242 份）

> 附件，非正本。供「NCWK 整体产品与设计正本」检索与审计；每条给主旨与结论要点。
> 覆盖：`overlay/docs/superpowers/specs/*.md` 业务 spec 共 242 份（扫描时点；不含三域合一正本的 4 份附录附件，不含 archive/ 与 assets/）。核实日 2026-10-21。

## A.1 逐份索引（按文件名日期升序）

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
| 2026-09-17-multiuser-matrix-collab-sim-report | 三用户 Matrix 协作模拟 | 35/35 通过，真实 gateway 与 LLM |
| 2026-09-17-zcode-3112-parity-analysis | ZCode 3.11.2 对照 | 5005 键/80 ns，三态裁决 |
| 2026-09-18-distributed-delivery-network-design | 多机分布式交付网络 | Matrix 协调、git 制品、本机执行 |
| 2026-09-18-matrix-fleet-deploy-design | 桌面应用多用户部署 | 共享应用加独立 HOME，45 项验收 |
| 2026-09-18-matrix-fleet-deploy-report | Fleet 三实例报告 | 45/45，119 条消息 |
| 2026-09-18-zcode-3123-parity-analysis | ZCode 3.12.3 增量 | 5446 键/87 ns |
| 2026-09-19-swarm-cockpit-architecture-design | 驾驶舱架构裁决 | 任务状态以房间事件为准，集群按用户 |
| 2026-09-20-stats-metrics | 驾驶舱统计口径 | 事件流单一源，纯函数投影 |
| 2026-09-20-swarm-cockpit-prd | 驾驶舱 PRD v1 | 五旅程九模块，三方对账 |
| 2026-09-22-aipaydev-fullchain-sim-report | 支付全流程推演报告 | 20 步走通，6 缺陷闭环，12 缺口 |
| 2026-09-23-gateway-host-ownership | Gateway host 归属判读 | 两类锁语义，patch 373 |
| 2026-09-23-gateway-multiplex-design | 多 profile 共存终态 | port-per-profile 加门闸，不做 multiplex |
| 2026-09-23-llm-dual-channel-failover-design | LLM 双通道塌方 | 编排层可见加 fail-fast，不改上游 |
| 2026-09-23-per-agent-node-modules-design | 每 agent 独立依赖 store | 独立 store 加链接注入，根治互删 |
| 2026-09-23-qgate-universal-delivery-gate-design | QGate 通用交付门禁 v0.2 | 六态 verdict、证据 exercised、四档 |
| 2026-09-23-zcode-foundation-design | 引擎切 zcode 源码底座 | 受管 fork，WS 引擎为主，双栈过渡 |
| 2026-09-24-aipaydev-flow-review | 推演全流程审查 | A1-A5 已修，B1-B4 架构债 |
| 2026-09-25-scheduled-loads-registry | 定时负载登记 | 巡检 60 秒，可关闭 |
| 2026-09-25-ycode-absorption-matrix | Ycode 全量吸收矩阵 | 全仓对账，五批裁决，孤儿三态 |
| 2026-09-26-prefix-reuse-design | 长会话前缀复用 | 指纹链加增量校验，分层接线 |
| 2026-09-27-product-ui-deficiency-fix-plan | 推演暴露 UI 缺陷修复 | P0 构建恢复，P1-P5 审批 RACI |
| 2026-09-28-aipaydev-v4-roadshow-refactor-v4.1-final | V4.1 整合终版 | 26 步六闸加七域映射，并入 V5 |
| 2026-09-28-aipaydev-v4-roadshow-refactor | V4 路演重构 | 七问题域乘能力矩阵 |
| 2026-09-28-fleet-command-approval-gap | Fleet 命令审批缺口 | patch 490 文件审批传输 |
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
| 2026-10-21-ncwk-unified-product-design | 三域合一整体正本 | 三层结构、五纪律、终态、缺口 |
| 2026-10-21-secaudit-pipeline-and-eval-judging-discipline | 安全审计与判分纪律 | 六阶段、自证 409、S0 轨迹 |
| 2026-10-21-sequence-guard | 会话级数据流护栏 | 敏感读到外发拦截 |
| 2026-10-21-sim-visibility-and-ide-task-surface | 推演可见性与 IDE 任务面 | 口径收口，IDE 只读任务段 |
| 2026-10-21-swarmstudio-complete-design | SwarmStudio 完整设计 | 三模式终态、全域详设、历史复盘 |
| 2026-10-21-tool-policy-engine | 工具策略引擎 | 附加约束层、strict、lint |
| 2026-10-21-ycode-environment-recovery | Ycode 环境恢复 | 补丁链、catalog 自适应 |
| 2026-10-21-zcode-3161-baseline-upgrade | zcode 3.16.1 基线 | 源码 main 迁移，8 补丁 |
| 2026-10-21-zcode-context-trend | zcode 上下文趋势 | 精确 token 加估算构成 |
| 2026-10-21-zcode-usage-ledger | zcode 用量账本 | 三表只读，客户端估价 |

## A.2 按域聚类（13 域）

| 域 | 份数 | 演化主线（摘要） | 当前终态 | 被推翻/废弃 |
|---|---:|---|---|---|
| D1 工作台与看板 | 59 | 三栏 mock → 接真数据 → 通知/筛选/日程/工作项 → 终端多工具 → 六阶段工作台+唯一看板 | `/app` 六阶段、`/app/board` 唯一看板、看板卡唯一写入口 | patch 028 重写、纯 mock、旧横向看板页、三栏六区菜单 |
| D2 IA 与治理面 | 16 | Loop 单页 → 壳+四场景 → 三中心 → 旅程页 → 六阶段左栏 → 日常/推演拆分 → GovOverlay 退役 | 左栏常用+六阶段+四岛+设置；阶段页 33 单层签；三模式 | 六区域窄栏、顶栏六阶段条、三中心一级导航、角色专属路由、治理独立七签 |
| D3 推演引擎与中心 | 29 | 五阶段 Loop → loop graph（图中心/事件日志）→ P0-P3 → 三模式 → V8.46 + G5/UAT | GraphService 三态、26 步六闸、导演详情分流、run22 在途 | LoopEngine.tick、三 State Store、多需求并行、六区菜单、假启动 |
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

## A.3 跨域单一事实源清单（节选）

阶段定义=`stage-meta.ts`；设计 token=`ia2.scss`；技能期望源=`skill-provisioning.json`；Agent 能力=组织注册表；FIBO 正本=`ontology-fibo.ts`；工具契约=`toolcontract`；并行安全=`DISPATCH_SAFETY`；报告真值=`report_truth.py`；Matrix 地址=`server-info.ts`；评测指标=`METRIC_DEFS`；图事件日志=SQLite；验收标准=方案第五部分；术语=`glossary.txt`。

## A.4 明确否决与未验证（摘要）

否决：音视频/贴纸特效/身份发现/spaces/tower/Tauri/iOS/新一级页；mods/pets/esp32；主会话 append-only/进程沙箱/完整 Mods；Jev-Omni 本地/SAT 策略学习/Hindsight 整体/容器沙箱/L4 决策融合；OWL DL/SPARQL/实例自动摄取/BPMN/运行时 RDF；MCP 投毒扫描/跨会话策略/outcome 校验/kill switch 进程终止；ClickHouse/S3 观测；冠军自动选择；处置单自动分配。

未验证：diagram-export×3、cua×5、tool-waterfall×1、IDE 超时、Matrix 分享房、swarm-yuan 5 家 L1、zcode CUA Windows/Linux 路径、技能供给宿主半写文件、Harness² 四项未移植、FIBO 证券/衍生品/贷款仅只读目录、agent 0.22.1 补丁 19 件待重定位。
