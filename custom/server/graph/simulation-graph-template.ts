// overlay/custom/server/graph/simulation-graph-template.ts
// 推演全流程 GraphSpec 模板（26 步→DAG）+ 需求→图编译器
// 北极星落地：用户说需求 → AI 拆模块 → 生成这张图 → 图引擎自动跑 → 驾驶舱看全程
//
// 设计锚：
// - GraphSpec 格式=graph-spec.ts（节点+边+通道+入口+终止+限额）
// - 闸门=join 屏障（joinMode:'all' 等全部前驱完成）
// - 模块并行=fan-out 四路+fan-in 集成
// - 缺陷循环=守卫回边（测试失败→修复→重测，maxIterations 有限终止）
// - 治理步=与集成并发（joinMode:'any' 任一前驱即触发）

import type { GraphSpec, NodeSpec, EdgeSpec } from '../../loop/graph/graph-spec'

// ── 通道（节点间传数据的变量）──
const SIM_CHANNELS: GraphSpec['channels'] = {
  rfd_id: { reducer: 'overwrite', default: '' },
  rfd_doc: { reducer: 'overwrite', default: '' },
  modules: { reducer: 'overwrite', default: [] as string[] },
  analysis_docs: { reducer: 'appendById', default: [] },
  design_doc: { reducer: 'overwrite', default: '' },
  dev_branches: { reducer: 'appendById', default: [] },
  test_report: { reducer: 'overwrite', default: '' },
  issues: { reducer: 'appendById', default: [] },
}

// ── 节点工厂：按模块生成四段子流水线（分析→评审→编码→测试）──
function moduleNodes(moduleName: string, assignee: string): { nodes: NodeSpec[]; edges: EdgeSpec[] } {
  const p = moduleName // e.g. 'pay-core'
  const nodes: NodeSpec[] = [
    {
      id: `analysis-${p}`,
      type: 'agent-task',
      config: { task: `系分 ${moduleName}`, assignee, skill: 'requirements-analyst',
        output: `docs/analysis/AN-${moduleName.toUpperCase()}-analysis.md`,
        gate: { ac: ['接口签名', '数据模型', '错误码', '幂等键', '工作量人日'] } },
      timeoutMs: 45 * 60 * 1000, retry: { maxAttempts: 2, backoffMs: 5000 },
    },
    {
      id: `review-${p}`,
      type: 'agent-review',
      config: { reviewer: 'arch', subject: `AN-${moduleName.toUpperCase()}`,
        checklist: ['设计五要素', '爆炸半径', '验证计划前移', '备选方案', '历史偏差'] },
      timeoutMs: 15 * 60 * 1000,
    },
    {
      id: `coding-${p}`,
      type: 'agent-task',
      config: { task: `开发 ${moduleName}`, assignee, skill: 'xxx-dev',
        output: `feat/DEV-${moduleName.toUpperCase()}`,
        gate: { tests: '≥6', coverage: '分支覆盖', style: 'snake_case' } },
      timeoutMs: 60 * 60 * 1000, retry: { maxAttempts: 2, backoffMs: 10000 },
    },
    {
      id: `testing-${p}`,
      type: 'agent-test',
      config: { tester: 'qi', target: moduleName,
        output: `docs/test/TEST-${moduleName.toUpperCase()}-testlog.txt` },
      timeoutMs: 30 * 60 * 1000,
    },
  ]
  const edges: EdgeSpec[] = [
    { from: `analysis-${p}`, to: `review-${p}` },
    { from: `review-${p}`, to: `coding-${p}`, condition: { op: 'eq', lhs: '$review.verdict', rhs: 'PASS' } },
    // 缺陷修复回边：测试不过→修复→重测（有限循环）
    { from: `coding-${p}`, to: `testing-${p}` },
    { from: `testing-${p}`, to: `coding-${p}`, condition: { op: 'eq', lhs: '$test.verdict', rhs: 'FAIL' },
      guard: { maxIterations: 3, breakCondition: { op: 'eq', lhs: '$test.verdict', rhs: 'PASS' } },
      label: '缺陷回流修复' },
  ]
  return { nodes, edges }
}

// ── 全局节点（闸门/集成/治理/报告）──
function globalNodes(modules: string[]): { nodes: NodeSpec[]; edges: EdgeSpec[] } {
  const nodes: NodeSpec[] = [
    // G1 需求锁定
    { id: 'g1-lock', type: 'human-gate', config: { title: '需求冻结',
      checks: ['AC 可判定≥3', '范围外清单', '影响面', '涉敏评估'] },
      timeoutMs: 5 * 60 * 1000 },
    // 派发（fan-out 起点）
    { id: 'dispatch', type: 'dispatch', config: { action: 'fan-out', targets: '$modules' } },
    // 集成测试（join 屏障：等全部模块测试通过）
    { id: 'integration-test', type: 'agent-test', joinMode: 'all',
      config: { tester: 'qi', target: 'integration',
        output: 'docs/test/RFD-001-test-report.md' },
      timeoutMs: 30 * 60 * 1000 },
    // G5 发布准出
    { id: 'g5-release', type: 'human-gate', joinMode: 'all',
      config: { title: '发布准出',
      checks: ['测试证据挂卡', '同commit复现', '依赖无新增', '回滚方案', '灰度三档', '用户收益', '人工批准'] },
      timeoutMs: 15 * 60 * 1000 },
    // UAT 验收
    { id: 'uat', type: 'agent-task', config: { task: 'UAT 逐条对账', assignee: 'fanfan',
      output: 'docs/acceptance/RFD-001-acceptance.md' },
      timeoutMs: 40 * 60 * 1000 },
    // 治理三步（并发，不等彼此）
    { id: 'work-report', type: 'agent-task', joinMode: 'any',
      config: { task: '工作台账', assignee: 'fanfan', output: 'work-report.md' } },
    { id: 'audit', type: 'agent-task', joinMode: 'any',
      config: { task: '独立审计', assignee: 'audit', output: 'docs/retro/audit-opinion.md' } },
    { id: 'retro', type: 'agent-task', joinMode: 'any',
      config: { task: '复盘 G6', assignee: 'fanfan', output: 'docs/retro/retrospective.md' } },
    // G6 终闸
    { id: 'g6-final', type: 'human-gate', joinMode: 'all',
      config: { title: '复盘关闸', checks: ['三段式', '行动项四要素', '问题 100% DISP', '经验入库'] },
      timeoutMs: 10 * 60 * 1000 },
    // HTML 报告
    { id: 'report', type: 'report-gen', config: { format: 'html', output: 'final-report.html' } },
  ]

  const edges: EdgeSpec[] = [
    { from: 'g1-lock', to: 'dispatch' },
    // fan-out：dispatch→每模块的 analysis
    ...modules.map(m => ({ from: 'dispatch', to: `analysis-${m}` })),
    // fan-in：每模块的 testing→integration-test
    ...modules.map(m => ({ from: `testing-${m}`, to: 'integration-test' })),
    { from: 'integration-test', to: 'g5-release' },
    { from: 'g5-release', to: 'uat', condition: { op: 'eq', lhs: '$g5.verdict', rhs: 'PASS' } },
    // 治理三步并发（g5 过后即触发，joinMode:'any' 不互等）
    { from: 'g5-release', to: 'work-report' },
    { from: 'g5-release', to: 'audit' },
    { from: 'g5-release', to: 'retro' },
    // G6 等全部治理步完成
    { from: 'uat', to: 'g6-final' },
    { from: 'work-report', to: 'g6-final' },
    { from: 'audit', to: 'g6-final' },
    { from: 'retro', to: 'g6-final' },
    { from: 'g6-final', to: 'report' },
  ]
  return { nodes, edges }
}

// ── 需求→GraphSpec 编译器（北极星核心：AI 读需求→拆模块→出图）──
export interface RequirementInput {
  title: string
  description: string
  modules?: string[]   // 可选：预指定模块；缺省由 AI 拆分
  assignees?: Record<string, string>  // 可选：模块→人映射
}

export function compileRequirementToGraph(req: RequirementInput): GraphSpec {
  // 模块拆分（预指定或从需求推导）
  const modules = req.modules ?? inferModules(req.description)
  const assignees = req.assignees ?? defaultAssignees(modules)

  // 生成模块子流水线
  const moduleParts = modules.map(m => moduleNodes(m, assignees[m] || 'chen'))
  const allModuleNodes = moduleParts.flatMap(p => p.nodes)
  const allModuleEdges = moduleParts.flatMap(p => p.edges)

  // 全局节点+边
  const global = globalNodes(modules)

  return {
    id: `sim-${Date.now()}`,
    version: 1,
    channels: SIM_CHANNELS,
    nodes: [...allModuleNodes, ...global.nodes],
    edges: [...allModuleEdges, ...global.edges],
    entryNode: 'g1-lock',
    endCondition: { op: 'eq', lhs: '$g6.verdict', rhs: 'PASS' },
    limits: { maxSteps: 500, maxCost: 100, maxDurationMs: 4 * 60 * 60 * 1000 },
    description: `推演全流程：${req.title}（${modules.length} 模块并行流水）`,
    meta: { goal: req.title, permissionLevel: 'standard',
      gateCommands: ['qgate run --profile feature-close'] },
    origin: 'template',
  }
}

// AI 模块推导（简化版：关键词匹配；完整版接 LLM）
function inferModules(desc: string): string[] {
  const mods: string[] = []
  if (/支付|pay|charge|order/.test(desc)) mods.push('pay-core')
  if (/微信|wechat|wx/.test(desc)) mods.push('channel-wechat')
  if (/支付宝|alipay|ali/.test(desc)) mods.push('channel-alipay')
  if (/收银|cashier|前端|frontend|小程序|mini/.test(desc)) mods.push('cashier-mp')
  return mods.length > 0 ? mods : ['pay-core', 'channel-wechat', 'channel-alipay', 'cashier-mp']
}

function defaultAssignees(modules: string[]): Record<string, string> {
  const devs = ['chen', 'hu', 'lin', 'xiao']
  const map: Record<string, string> = {}
  modules.forEach((m, i) => { map[m] = devs[i % devs.length] })
  return map
}

// ── 导出标准推演模板（可直接 startRun）──
export function defaultSimulationGraph(): GraphSpec {
  return compileRequirementToGraph({
    title: '收单商户多端小程序支付收银台',
    description: '微信/支付宝双渠道支付收银台，含支付核心/渠道适配/小程序前端',
    modules: ['pay-core', 'channel-wechat', 'channel-alipay', 'cashier-mp'],
    assignees: { 'pay-core': 'chen', 'channel-wechat': 'hu', 'channel-alipay': 'lin', 'cashier-mp': 'xiao' },
  })
}
