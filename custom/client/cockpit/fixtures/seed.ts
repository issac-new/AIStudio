// 驾驶舱演示种子数据。
// 从 CockpitView.vue onMounted 抽离（批次 1），视图只负责装配，数据源集中于此。
// 仅 import type 引 store 类型，编译期擦除，无运行时循环依赖。
// 后续接入 kanban API 时，用真实 fetch 替换 loadSeed 即可。
import type {
  CockpitTask,
  AttentionItem,
  CockpitEvent,
  GraphNode,
  WorkItem,
  FileNode,
  CollabChannel,
  ChatMessage,
  HistoryItem,
  A2uiTemplate,
  GraphRelation,
} from '@/custom/cockpit/store/cockpit'

// P1 种子：Kanban 任务 + 注意力条
export const seedTasks: CockpitTask[] = [
  { id: '1', title: 'PR #142 · 重构 auth', category: 'human', priority: 'P0', status: 'review', assignee: '@张三', workspace: '~/ws/auth-svc' },
  { id: '2', title: '前端联调 auth', category: 'human', priority: 'P1', status: 'blocked', assignee: '@李四', workspace: '~/ws/web-fe' },
  { id: '3', title: 'API 文档补全', category: 'human', priority: 'P1', status: 'running', assignee: '@王五', workspace: '~/ws/api-docs' },
  { id: '4', title: '发版方案评估', category: 'cluster', priority: 'P1', status: 'running', assignee: 'arch/qa', workspace: '~/ws/platform' },
  { id: '5', title: '部署架构选型', category: 'cluster', priority: 'P2', status: 'triage', assignee: 'arch', workspace: '~/ws/platform' },
  { id: '6', title: 'cli-helper · 迁移脚本', category: 'direct', priority: 'P1', status: 'todo', assignee: '你↔cli', workspace: '~/ws/db-mig' },
]

export const seedAttention: AttentionItem[] = [
  { id: 'a1', severity: 'high', title: 'PR #142 · review 标风险', taskId: '1' },
  { id: 'a2', severity: 'medium', title: '集群提问：阻塞发版？', taskId: '4' },
  { id: 'a3', severity: 'low', title: '前端联调 · 等接口', taskId: '2' },
]

// P2 种子：时序事件 + 拓扑（P5 接入 Kanban event API）
export const seedEvents: CockpitEvent[] = [
  { id: 'e1', taskId: '1', actor: '张三', kind: 'A2H', what: '提交 PR #142', when: '14:32', pending: false, ts: 1732, nodeIds: ['n1'] },
  { id: 'e2', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '自评：结构良好', when: '14:35', pending: false, ts: 1735, nodeIds: ['n1', 'n2'] },
  { id: 'e3', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '2 处边界未覆盖 → 委派 qa', when: '14:36', pending: true, ts: 1736, nodeIds: ['n2'] },
  { id: 'e4', taskId: '1', actor: 'qa-agent', kind: 'A2H', what: '用例写完 → 待审', when: '现在', pending: true, ts: 1740, nodeIds: ['n2'] },
]

export const seedAppTopology: GraphNode[] = [
  { id: 'n1', taskId: '1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'] },
  { id: 'n2', taskId: '1', label: 'auth.spec', kind: 'test', focus: false, links: [] },
]

export const seedReqTopology: GraphNode[] = [{ id: 'r1', taskId: '1', label: '认证重构', kind: 'req', focus: true }]
export const seedProjTopology: GraphNode[] = [{ id: 'p1', taskId: '1', label: 'auth-platform', kind: 'project', focus: true }]

// P3 种子：工作项 + 文件树（后续接入 listFiles API）
export const seedWorkItems: WorkItem[] = [
  {
    id: 'w1', taskId: '1', decision: 'conditional',
    riskTags: ['concurrency', 'test-gap'], opinion: '建议合并前补充 token 并发刷新用例，其余结构 OK。',
    modifiedFiles: ['refresh.ts', 'token.ts', 'auth.spec.ts'], score: 4,
  },
]

export const seedFileTrees: Record<string, FileNode[]> = {
  '1': [
    {
      id: 'f1', name: 'src', isDir: true,
      children: [
        { id: 'f2', name: 'refresh.ts', isDir: false, modified: true },
        { id: 'f3', name: 'token.ts', isDir: false, modified: true },
        { id: 'f4', name: 'index.ts', isDir: false, modified: false },
      ],
    },
    { id: 'f5', name: 'tests', isDir: true, children: [{ id: 'f6', name: 'auth.spec.ts', isDir: false, modified: true }] },
    { id: 'f7', name: 'package.json', isDir: false, modified: false },
  ],
}

// P4 种子：协作频道 + 消息（后续接入 socket）
export const seedChannels: CollabChannel[] = [
  { id: 'c1', taskId: '1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '李四', '你'] },
  { id: 'c2', taskId: '1', kind: 'chat', label: 'review-agent', members: ['review-agent'] },
]

export const seedMessages: Record<string, ChatMessage[]> = {
  c1: [
    { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'PR #142 我提交了，看看并发刷新。', ts: 1 },
    { id: 'm2', channelId: 'c1', author: 'review-agent', isMe: false, text: '结构 OK，但并发刷新 2 处边界没覆盖，已委派 qa。', ts: 2 },
    { id: 'm3', channelId: 'c1', author: '你', isMe: true, text: '收到，先别合并。李四后端能配合吗？', ts: 3 },
    { id: 'm4', channelId: 'c1', author: '李四', isMe: false, text: '可以，我加个幂等锁。', ts: 4 },
  ],
  c2: [
    { id: 'm5', channelId: 'c2', author: 'review-agent', isMe: false, text: '已委派 qa 补用例，需要你决策是否阻塞。', ts: 5 },
  ],
}

// P5 种子：历史事件（后续接入 Kanban event API）
export const seedHistory: HistoryItem[] = [
  { id: 'h1', when: '今天 14:36', taskId: '1', action: '审批', title: '审批 PR #142（有条件通过）', archived: false },
  { id: 'h2', when: '今天 13:20', taskId: '4', action: '决策', title: '决定延后发版', archived: false },
  { id: 'h3', when: '今天 11:05', taskId: '6', action: '补充', title: '确认迁移脚本参数', archived: false },
  { id: 'h4', when: '昨天 18:40', taskId: '1', action: '审批', title: '审批 v2.2 发版', archived: true },
  { id: 'h5', when: '3 天前', taskId: '1', action: '评估', title: '评估旧版 auth 重构', archived: true },
]

// P6 种子：A2UI 模板 + 拓扑关系
export const seedTemplates: A2uiTemplate[] = [
  { id: 'tpl1', name: 'PR 标准审核', decision: 'conditional', riskTags: ['concurrency', 'test-gap'], opinion: '建议补用例再合并', modifiedFiles: [] },
]

export const seedAppRelations: GraphRelation[] = [
  { id: 'rel1', taskId: '1', from: 'n1', to: 'n2', label: 'A2A' },
  { id: 'rel2', taskId: '1', from: 'n2', to: 'n1', label: 'A2H' },
]

/**
 * 把演示种子装入 store。语义与原 CockpitView.vue onMounted 完全一致（逐字搬移）。
 * 后续接 kanban API 时，用真实数据加载替换本函数体即可。
 */
export function loadSeed<
  S extends {
    tasks: CockpitTask[]
    attention: AttentionItem[]
    selectTask: (id: string) => void
    events: CockpitEvent[]
    appTopology: GraphNode[]
    reqTopology: GraphNode[]
    projTopology: GraphNode[]
    workItems: WorkItem[]
    fileTrees: Record<string, FileNode[]>
    channels: CollabChannel[]
    messages: Record<string, ChatMessage[]>
    history: HistoryItem[]
    templates: A2uiTemplate[]
    appRelations: GraphRelation[]
  },
>(store: S): void {
  store.tasks = seedTasks
  store.attention = seedAttention
  store.selectTask('1')
  store.events = seedEvents
  store.appTopology = seedAppTopology
  store.reqTopology = seedReqTopology
  store.projTopology = seedProjTopology
  store.workItems = seedWorkItems
  store.fileTrees = seedFileTrees
  store.channels = seedChannels
  store.messages = seedMessages
  store.history = seedHistory
  store.templates = seedTemplates
  store.appRelations = seedAppRelations
}
