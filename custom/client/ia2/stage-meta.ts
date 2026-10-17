// overlay/custom/client/ia2/stage-meta.ts
// 阶段定义单一事实源（D18 旅程式重构，2026-10-17 用户裁定）：
// 顶栏六阶段（nav-centers CENTER_NAVS）、StageShell 阶段页、旅程页交付区
// 三处消费同一份数据，终结此前三处各自定义的双轨形态。
// 需求与设计正本=docs/superpowers/specs/2026-10-17-journey-ia-terminology-redesign.md
// （§5.0 单一事实源、§5.1 旅程页、§5.5 术语映射表）。
// 完成键口径=views/sim/steps-registry.ts 的 26 步键空间；步 1-4 四合一段共用
// smoke_done；步 16 系分收尾用 close_done，故治理阶段键集不含 close_done
// （修 D13 遗留的双键误判：系分一收尾治理阶段曾显示完成）。
import type { RouteNamedRaw } from 'vue-router'

/** 阶段工具卡：key 是稳定机器锚（testid 拼 key 不拼 label，改名零 churn） */
export interface StageTool {
  key: string
  label: string
  desc: string
  to: string
  name: string
}

export interface StageMeta {
  no: 1 | 2 | 3 | 4 | 5 | 6
  key: string
  title: string
  titleEn: string
  /** 顶栏导航标签（短名，不含圆圈序号；序号由 nav-centers 渲染） */
  navLabel: string
  navLabelEn: string
  what: string
  act: string
  /** run-state 完成键：任一命中即本阶段完成 */
  keys: string[]
  tools: StageTool[]
}

export const STAGE_META: readonly StageMeta[] = [
  {
    no: 1, key: 'stage-setup', title: '搭建：建立组织、账号与资产', titleEn: 'Setup',
    navLabel: '搭建', navLabelEn: 'Setup',
    what: '从 0 开始：建组织、建账号、定编制与团队领导、准备环境与资产、接入 hermes agent，末步跑一次环境冒烟测试。',
    act: '开新组织的第一步；五步全部完成后才进入需求阶段。',
    keys: ['smoke_done', 'appinit_done', 'people_done'],
    tools: [],
  },
  {
    no: 2, key: 'stage-reqs', title: '需求：冻结与启动', titleEn: 'Requirements',
    navLabel: '需求', navLabelEn: 'Requirements',
    what: '第一张需求单进场：验收标准≥3 条可判、范围划清；G1 需求冻结上锁；建群预邀；在运行编排里选运行模式并启动。',
    act: '锁定后不许改，要改须重新走锁定流程；启动后进入分析设计。',
    keys: ['g1_frozen'],
    tools: [
      { key: 'runOverview', label: '运行总览', desc: '运行模式横幅·六道质量门行（G1 状态）·净计卡', to: '/app/sim', name: 'ia2.sim' },
      { key: 'orchestrate', label: '运行编排', desc: '启动/续跑/运行模式切换·启动前检查', to: '/app/sim/orchestration', name: 'ia2.simOrchestration' },
      { key: 'docReview', label: '文档评审', desc: '冻结单字段级核对（缺项红显）', to: '/app/gov', name: 'ia2.governance' },
    ],
  },
  {
    no: 3, key: 'stage-design', title: '分析设计：任务拆解与排期', titleEn: 'Analysis & Design',
    navLabel: '分析设计', navLabelEn: 'Analysis & Design',
    what: '任务分解、四路系统分析、概设定稿；G2 架构评审（历史偏差硬拦）；排期定时间窗口，测试独立成项。',
    act: '没设计不开发——G2 不过不准排期是铁闸。',
    keys: ['analysis_done', 'anexec_done', 'review_done', 'g2_arch_pass', 'plan_done'],
    tools: [
      { key: 'board', label: '看板·任务协同', desc: '任务分解·分诊·依赖图', to: '/app/board', name: 'ia2.board' },
      { key: 'supervision', label: '监督面板', desc: '分析期态势研判·观察窗', to: '/app/sim/supervision', name: 'ia2.simSupervision' },
      { key: 'gates', label: '质量门与流程', desc: 'G2 评审状态·质量门修复单', to: '/app/gov', name: 'ia2.governance' },
    ],
  },
  {
    no: 4, key: 'stage-build', title: '开发：编码、测试与日常协调', titleEn: 'Development',
    navLabel: '开发', navLabelEn: 'Development',
    what: '六路并行开发+独立测试（测试者≠开发者）；期间协调全在工作台：看板流转、群沟通、等你决定的人工介入请求。',
    act: '在制上限（WIP）≤2；完成必带双凭证；缺陷报→修→验全关才准出。',
    keys: ['devimpl_done', 'defect_done', 'testpass_done'],
    tools: [
      { key: 'approvals', label: '审批待办', desc: '人工介入请求·遗留项清算审批·收尾指令模板', to: '/app/inbox', name: 'ia2.inbox' },
      { key: 'workbench', label: '工作台看板', desc: '我的卡·沟通·IDE 工作区', to: '/app/collab', name: 'ia2.collab' },
      { key: 'ide', label: 'IDE 工作区', desc: '开发工作位：任务简报·分支新鲜度', to: '/app/ide', name: 'ide.shell' },
      { key: 'evidence', label: '证据库', desc: '帧图廊·锚点反查·消息存证', to: '/app/sim/evidence', name: 'ia2.simEvidence' },
    ],
  },
  {
    no: 5, key: 'stage-accept', title: '验收：发布准出与 UAT', titleEn: 'Acceptance',
    navLabel: '验收', navLabelEn: 'Acceptance',
    what: 'G5 发布准出（人工批准留痕）·完备性检查·UAT 逐条判定（通过/有条件通过/不通过）——交付完成。',
    act: '判定只认结构化字段；任一条不过回缺陷回流。',
    keys: ['g5_ready', 'release_done', 'uat_done'],
    tools: [
      { key: 'trace', label: '需求追溯', desc: '验收标准→用例→测试→UAT 判定四列', to: '/app/sim/trace', name: 'ia2.simTrace' },
      { key: 'delivery', label: '交付健康', desc: '分支推送·交付物 14 件链', to: '/app/sim/delivery', name: 'ia2.simDelivery' },
      { key: 'approvals', label: '审批待办', desc: 'G5 人工批准入口', to: '/app/inbox', name: 'ia2.inbox' },
    ],
  },
  {
    no: 6, key: 'stage-govern', title: '治理：清算、审计与改进', titleEn: 'Governance',
    navLabel: '治理', navLabelEn: 'Governance',
    what: '工作台账·审计意见书·复盘治理报告；遗留项清算（开新运行前必须清零）；度量检查——组织越跑越聪明。',
    act: '问题清单 100% 有处置结论；复盘行动项进下一轮。',
    keys: ['workmgr_done', 'audit_done', 'retro_done', 'report_done'],
    tools: [
      { key: 'clearance', label: '遗留项清算', desc: '遗留项清单·resolve/waive 审批', to: '/app/gov/clearance', name: 'ia2.govClearance' },
      { key: 'issues', label: '问题清单对账', desc: '处置率·台账全量', to: '/app/gov/issues', name: 'ia2.govIssues' },
      { key: 'metrics', label: '度量检查', desc: '五卡检查·磁盘水位预警', to: '/app/gov', name: 'ia2.governance' },
      { key: 'audit', label: '审计与变更', desc: '四查状态·基线变更记录', to: '/app/gov', name: 'ia2.governance' },
    ],
  },
]

/** 搭建五步（①阶段的展开，旅程页搭建区与 StageShell stage=1 共用） */
export interface SetupStep {
  no: number
  key: string
  name: string
  purpose: string
  criteria: string
  /** 进入入口（路由名） */
  target: RouteNamedRaw
  /** run-state 完成键；空数组=轮次内不跟踪本步 */
  keys: string[]
  /** 口径或挂账注脚（诚实呈现：不假装有能力） */
  note?: string
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    no: 1, key: 'org', name: '建立组织',
    purpose: '登记组织信息，定人员编制与 RACI 责任矩阵——谁负责、谁审批、咨询谁、告知谁。',
    criteria: '组织与编制表有数据（应用初始化与研发人员管理两步合一判定）',
    target: { name: 'ia2.govOrgAssets' },
    keys: ['appinit_done', 'people_done'],
    note: '组织与编制表单在治理·组织与资产签（保存即 git 提交）。',
  },
  {
    no: 2, key: 'accounts', name: '建立账号',
    purpose: '为每位成员建账号、定角色、配 AI 助理。',
    criteria: '账号名单与编制人数对齐',
    target: { name: 'ia2.accounts' },
    keys: ['smoke_done'],
    note: '账号分配与登录并入序幕四合一段，与步骤 4 共用环境冒烟判定；直建与邀请（一次性初始口令）都在账户管理页。',
  },
  {
    no: 3, key: 'teams', name: '建立团队与协调关系',
    purpose: '建团队与房间、指派领导、设值守分派与派发列表——谁向谁汇报、谁和谁协作。',
    criteria: '至少一个团队有领导且值守分派非空',
    target: { name: 'ia2.teams' },
    keys: [],
    note: '轮次内不跟踪本步；面板按领导身份显示管理区。',
  },
  {
    no: 4, key: 'env', name: '准备环境与资产',
    purpose: '四服务环境拓扑健康、密钥台账（不含密钥本体）、模型服务商配置、应用资产登记。',
    criteria: '环境冒烟测试通过；密钥台账可在搭建页直接维护',
    target: { name: 'ia2.simOps' },
    keys: ['smoke_done'],
    note: '模型服务商配置统一入口未接入，当前在 IDE 内（挂账）。',
  },
  {
    no: 5, key: 'agents', name: '准备智能体',
    purpose: '建 hermes agent 档案与编制，确认就位。',
    criteria: '就绪检查显示预期智能体在线',
    target: { name: 'ia2.agents' },
    keys: [],
    note: '轮次内不跟踪本步；模型绑定与启停在智能体工作台操作。',
  },
]

/** 交付区旅程卡目标：与顶栏②-⑥同序同名 */
export function stageRoute(no: number): RouteNamedRaw {
  return { name: `ia2.stage${no}` as 'ia2.stage1' }
}
