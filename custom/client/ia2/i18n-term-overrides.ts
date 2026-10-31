// overlay/custom/client/ia2/i18n-term-overrides.ts
// Tier-2 术语覆盖（D18 术语标准化，2026-10-17 设计正本 §5.5 第二层）：
// 上游 locale 树（patch 473 注入）里的 ia2/approvals 键值本轮改不动——禁 inject
// 期改补丁不生效，只造成补丁与注入树漂移。改走运行时 mergeLocaleMessage，
// 入口挂 registries/client/entry.mts 的 i18nReady 钩子（A 类注册位）。
// 存量键只收中文侧非标准词；英文侧本就是标准词（Approvals/Cockpit overview/Review
// gates）不动。上游没收录的新键（六阶段导航、J 批三问）必须 zh/en 成对注册——
// fallbackLocale=en，缺 en 会裸显键名。键清单与裁决理由对账设计正本 §5.5 与 §5.9。
// 测试环境默认 mock vue-i18n（t 返回键本身）；cockpit-overview.test 例外：它加载
// 本模块的 zh 覆盖表并断言无裸键/内部码。

/** 六阶段一级导航词条（设计正本 §5.8-3 清偿：IA_AREAS 六行 labelKey 逐行指向
 *  ia2.nav.stageN，终结同指 ia2.nav.collab 的六同名项）。键值由 STAGE_META 派生
 *  （标签单一事实源），zh/en 双侧注册——属新增键而非改上游非标准词，故破例入 en。 */
import { STAGE_META } from './stage-meta'

const STAGE_NAV_ZH: Record<string, string> = Object.fromEntries(
  STAGE_META.map(s => [`stage${s.no}`, s.navLabel]),
)
const STAGE_NAV_EN: Record<string, string> = Object.fromEntries(
  STAGE_META.map(s => [`stage${s.no}`, s.navLabelEn]),
)

/** 覆盖字典（存量键 zh 单侧 + 新增键 zh/en 成对）。结构即 locale 子树，mergeLocaleMessage 深合并不动其余键 */
export const IA2_TERM_OVERRIDES_ZH = {
  approvals: {
    // 同一功能三个名字（title/pageTitle=审批收件箱、navLabel=待审收件箱）合一
    navLabel: '审批收件箱',
    // 决策值 reject（服务端审批历史回流）词表从未收录，zh 回落 en——走查批 D 补键
    choice: { reject: '拒绝' },
  },
  ia2: {
    overview: {
      // 注意力条标签与提示（2026-10-17 术语残留批）：英文标签不符合行业术语体系，
      // 提示仍写「双击」而交互早已是单击——统一改「看板」与人话提示。
      swarmKanbanLabel: '看板',
      swarmKanbanHint: '点击打开看板（全部任务）',
    },
    // J 批三问重排（spec 2026-10-31-cockpit-attention-panel §4.1/§4.2）：
    // 卡片顺序=现在需要我做什么→系统是否健康→工作进展；标签写「等谁+要什么」，
    // 健康节仅异常显形。旧「最近判定」词条随评审闸口卡合并退场。
    overviewDash: {
      title: '工作台概览',
      needMe: '现在需要我做什么',
      flowHint: '先看要不要你动手，再看系统有没有问题，最后看活干到哪了。',
      waitingApproval: '等你批准',
      myRaci: '等你决定',
      systemIssue: '系统问题：{label}',
      healthTitle: '系统是否健康、在做对的事',
      healthMore: '还有 {n} 条',
      progress: '工作进展',
      recentWork: '最近一条工作历史',
      recentWorkEmpty: '暂无工作记录',
      serviceDown: '{service}不可用',
      healthServiceDetail: '需要你检查服务进程或网络后重试',
      // 服务名与任务阶段均为用户可见标签，英文内部码不直出（§4.2 规则四）
      service: { gateway: '网关', studio: '工作台', synapse: '消息服务', hindsight: '记忆服务' },
      status: {
        triage: '待分诊', todo: '待办', scheduled: '已排期', ready: '就绪',
        running: '进行中', blocked: '受阻', review: '评审中', done: '已完成',
        archived: '已归档', unknown: '状态未知',
      },
      scopeNote: '统计全部看板任务，不限当前运行；未全部完成时不会显示 100%。',
    },
    wm: { mergeBack: '合并回工作台' },
    // 2026-10-20 走查：流程导航分组标题与交付案例状态在运行时缺键，界面裸显
    // IA2.FLOW.CHATSECTION / ia2.delivery.completed。此处补两条双侧词条。
    flow: { chatSection: '聊天' },
    delivery: { completed: '已完成' },
    nav: STAGE_NAV_ZH,
  },
} as const

/** en 侧只含新增键（六阶段导航、审批 reject、J 批三问等）；存量英文词条本就是标准词，见文件头注 */
export const IA2_TERM_OVERRIDES_EN = {
  approvals: { choice: { reject: 'Reject' } },
  ia2: {
    overview: { swarmKanbanLabel: 'Kanban', swarmKanbanHint: 'Open the Kanban board (all tasks)' },
    overviewDash: {
      needMe: 'What needs me now',
      flowHint: 'Check what needs you first, then system health, then delivery progress.',
      waitingApproval: 'Waiting on your approval',
      myRaci: 'Waiting on your decision',
      systemIssue: 'System issue: {label}',
      healthTitle: 'System health and doing the right thing',
      healthMore: '{n} more',
      progress: 'Work progress',
      recentWork: 'Latest work history',
      recentWorkEmpty: 'No work history yet',
      serviceDown: '{service} unavailable',
      healthServiceDetail: 'Check the service process or network, then retry',
      service: { gateway: 'Gateway', studio: 'Workspace', synapse: 'Messaging', hindsight: 'Memory' },
      status: {
        triage: 'Triage', todo: 'To do', scheduled: 'Scheduled', ready: 'Ready',
        running: 'Running', blocked: 'Blocked', review: 'In review', done: 'Done',
        archived: 'Archived', unknown: 'Unknown status',
      },
      scopeNote: 'Counts all board tasks, not the selected run; 100% only when every task is complete.',
    },
    flow: { chatSection: 'Chats' },
    delivery: { completed: 'Completed' },
    nav: STAGE_NAV_EN,
  },
} as const

/** 结构型入参：不 import vue-i18n 类型，避免与上游 i18n 模块的装载时序耦合 */
interface MergeableI18n {
  global: { mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void }
}

export function applyIa2TermOverrides(i18n: MergeableI18n): void {
  i18n.global.mergeLocaleMessage('zh', IA2_TERM_OVERRIDES_ZH as unknown as Record<string, unknown>)
  i18n.global.mergeLocaleMessage('en', IA2_TERM_OVERRIDES_EN as unknown as Record<string, unknown>)
}
