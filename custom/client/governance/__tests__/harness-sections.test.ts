// 驾驭工程四 Section 组件守门（B1-B4 展示面，2026-10-02）：
// ① 挂载渲染：目录表+四要素徽标/六成本卡/L1-L5 阶梯+指标表/八原语矩阵（mock API 全量供给）
// ② GovHarnessView 聚合四板块（页签面板壳）
// ③ 降级诚实：API 抛错渲染错误行，不编造数据
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('@/custom/governance/api/harness', () => ({
  fetchCapabilityCatalog: vi.fn(async () => ({
    ok: true,
    source: 'all',
    entries: [
      {
        source: 'mcpcatalog', kind: 'mcp-server', id: 'demo', name: 'demo',
        version: null, registeredAt: 1700000000000, auditTrail: null, permissionBound: true,
        note: 'scope=global authState=authorized',
        factors: { registered: true, permission: true, version: false, audit: false },
        gaps: ['version', 'audit'],
      },
    ],
    gapSummary: {
      totalEntries: 1,
      bySource: {
        mcpcatalog: { source: 'mcpcatalog', total: 1, byFactor: { registered: 0, permission: 0, version: 1, audit: 1 }, gapRate: 0.5, entriesWithAnyGap: 1 },
        extmarket: { source: 'extmarket', total: 0, byFactor: { registered: 0, permission: 0, version: 0, audit: 0 }, gapRate: 0, entriesWithAnyGap: 0 },
        'registry-admin': { source: 'registry-admin', total: 0, byFactor: { registered: 0, permission: 0, version: 0, audit: 0 }, gapRate: 0, entriesWithAnyGap: 0 },
      },
      overall: { factorSlots: 4, gapFactorCount: 2, gapRate: 0.5, entriesWithAnyGap: 1 },
    },
    sources: [
      { id: 'mcpcatalog', available: true, count: 1 },
      { id: 'extmarket', available: false, note: '技能目录缺席', count: 0 },
      { id: 'registry-admin', available: true, count: 0 },
    ],
    meta: { scope: '三系只读聚合读模型 + 四要素缺口报告', notDoing: '统一写通道 / 三系迁移 / 目录代管不在本轮' },
  })),
  fetchCostAccounts: vi.fn(async () => ({
    ok: true,
    days: 7,
    accounts: [
      { key: 'token', available: true, sources: [{ id: 'hermes-web-ui.db', available: true }], data: { dbPath: '/x.db', sessionsCount: 2, inputTokens: 300, outputTokens: 150, cacheReadTokens: 30, cacheWriteTokens: 15, reasoningTokens: 3, totalTokens: 498, windowed: true } },
      { key: 'humanIntervention', available: true, sources: [], data: { sampleCap: 500, events: 3, byAction: [{ action: 'command:approved', count: 2 }] } },
      { key: 'toolExecution', available: true, sources: [], data: { auditToolActions: 2, traceDir: null, traceFiles: null, traceSpanCount: null } },
      { key: 'waitLatency', available: true, sources: [], data: { boards: ['b1'], tasksDone: 2, avgSeconds: 60, medianSeconds: 30, p95Seconds: 90 } },
      { key: 'rework', available: true, sources: [], data: { requests: 2, reworkHours: 4.5 } },
      { key: 'securityGovernance', available: false, note: '审计与冻结窗口均缺席', sources: [], data: { severityBuckets: { high: 0, medium: 0, low: 0 }, freezeWindows: { total: null, active: null } } },
    ],
    _defs: {
      token: { title: 'token 成本', definition: 'sessions token 列求和', sources: ['schemas.ts SESSIONS_SCHEMA'] },
      humanIntervention: { title: '人工干预成本', definition: '审批/升级/裁决类计数', sources: ['governance-audit.ts'] },
      toolExecution: { title: '工具执行成本', definition: 'audit 工具类动作+traces span', sources: ['governance-audit.ts'] },
      waitLatency: { title: '等待时延成本', definition: 'done 任务 created→completed', sources: ['governance-analytics.ts'] },
      rework: { title: '故障返工成本', definition: 'implement 回填工时求和', sources: ['change-governance-store.ts'] },
      securityGovernance: { title: '安全治理成本', definition: '严重级分桶+冻结窗口', sources: ['governance-audit.ts'] },
    },
  })),
  fetchMaturity: vi.fn(async () => ({
    ok: true,
    days: 7,
    levels: [
      { level: 1, key: 'L1', name: '工具接入', achieved: true, items: [{ title: '能力目录有条目', passed: true, evidence: '能力目录 1 条（mcpcatalog 1 / extmarket 0 / registry-admin 0）' }] },
      { level: 2, key: 'L2', name: '运行底座', achieved: null, items: [{ title: '会话在档', passed: null, evidence: 'hermes-web-ui.db 不可用' }] },
      { level: 3, key: 'L3', name: '治理闭环', achieved: false, items: [{ title: '审批规则在档', passed: false, evidence: '审批规则 0 条' }] },
      { level: 4, key: 'L4', name: '协同自治', achieved: null, items: [{ title: '人工介入率有数且 ≤ 30%', passed: null, evidence: '派发数据缺席', metric: 'human-intervention-rate' }] },
      { level: 5, key: 'L5', name: '规模生产', achieved: null, items: [{ title: '审计完整率 100%', passed: null, evidence: '在档 1/4 源', metric: 'audit-completeness' }] },
    ],
    metrics: [
      { key: 'human-intervention-rate', value: null, unit: 'ratio', source: '干预/派发', note: '派发台账无数据' },
      { key: 'mttr', value: null, unit: 'minutes', source: '（暂无数据源）', note: 'unavailable：不造数' },
    ],
    meta: { note: '自检清单非认证：本报告是达成项证据清单，不是成熟度认证分', levelsNote: 'L1 工具接入 / L2 运行底座 / …' },
  })),
  fetchPrimitives: vi.fn(async () => ({
    ok: true,
    primitives: [
      {
        key: 'task', name: '任务', enName: 'Task', idPattern: 'kanban tasks.id', storage: '板库 kanban.db',
        versionSource: '无版本列（缺口）', lifecycle: ['triage', 'done'], auditHook: 'task_events',
        anchors: ['custom/server/governance/governance-analytics.ts kanbanDbFiles'],
        coverage: { identity: '有', version: '缺', lifecycle: '有', audit: '有' },
        coverageNotes: { version: '无任务级版本字段' },
        liveCount: 3, liveCountNote: undefined,
      },
      {
        key: 'tool', name: '工具', enName: 'Tool', idPattern: 'server:tool', storage: 'mcp-config',
        versionSource: '配置无版本字段', lifecycle: ['configured', 'authorized'], auditHook: '无',
        anchors: ['custom/server/mcpconfig/mcp-config.ts'],
        coverage: { identity: '有', version: '缺', lifecycle: '部分', audit: '缺' },
        coverageNotes: {},
        liveCount: null, liveCountNote: '能力目录聚合失败',
      },
    ],
    matrix: {
      totalPrimitives: 2,
      byAttribute: {
        identity: { '有': 2, '部分': 0, '缺': 0 },
        version: { '有': 0, '部分': 0, '缺': 2 },
        lifecycle: { '有': 1, '部分': 1, '缺': 0 },
        audit: { '有': 1, '部分': 0, '缺': 1 },
      },
      fullyCovered: 0,
    },
  })),
  fetchEvalLayers: vi.fn(async () => ({
    ok: true,
    days: 7,
    layers: [
      { key: 'result', metrics: [
        { key: 'dispatchDeliveredRate', status: 'instrumented', value: 0.9, unit: 'ratio', source: 'dispatch-ledger', note: '窗口 7 天 · 42 次派发' },
        { key: 'escapedDefectRate', status: 'gap', value: null, unit: 'ratio', source: 'V5 长线', definition: '逃逸到发布后的缺陷 / 发布前已知缺陷' },
      ] },
      { key: 'execution', metrics: [
        { key: 'routeViolationRate', status: 'gap', value: null, unit: 'ratio', source: 'loop', definition: '触发未声明边的次数 / 总边选择次数' },
      ] },
      { key: 'resource', metrics: [
        { key: 'tokenTotal', status: 'instrumented', value: 123456, unit: 'tokens', source: 'cost-accounts' },
      ] },
      { key: 'governance', metrics: [
        { key: 'humanInterventions', status: 'instrumented', value: 6, unit: 'count', source: 'governance-audit' },
        { key: 'duplicateSideEffectRate', status: 'gap', value: null, unit: 'ratio', source: 'loop eid', definition: '重复执行的外部动作数 / 外部动作总数' },
      ] },
    ],
    counts: { instrumented: 3, gap: 3 },
    meta: { note: '四层评估', source: 'Harness·Loop·Graph 选型文', gapNote: 'gap 不造数' },
  })),
  fetchNineLayers: vi.fn(async () => ({
    ok: true,
    days: 7,
    layers: [
      { key: 'tools', status: 'covered', score: 100, checks: [
        { key: 'contracts', label: '工具契约', status: 'yes', evidence: '已声明契约 30 项', critical: true },
        { key: 'summary', label: '审计参数摘要', status: 'yes', evidence: '100% 的调用带参数摘要（60/60）' },
        { key: 'errors', label: '错误分类', status: 'yes', evidence: '100% 的失败带错误分类（10/10）' },
        { key: 'duplicates', label: '重复调用识别', status: 'yes', evidence: '窗口内命中 0 次' },
      ], gaps: [], actions: [] },
      { key: 'loop', status: 'covered', score: 100, checks: [
        { key: 'bounds', label: '有界循环', status: 'yes', evidence: 'runaway guard=在，回边守卫=在', critical: true },
        { key: 'stuck', label: '卡死检测', status: 'yes', evidence: '停滞检测器在档' },
        { key: 'retry', label: '按类别重试', status: 'yes', evidence: '图节点按错误类别重试' },
        { key: 'checkpoints', label: '检查点', status: 'yes', evidence: '检查点 40 个' },
      ], gaps: [], actions: [] },
      { key: 'memory', status: 'partial', score: 75, checks: [
        { key: 'graphCheckpoint', label: '图执行检查点', status: 'yes', evidence: '图检查点 40 个', critical: true },
        { key: 'agentCheckpoint', label: 'agent 进展检查点', status: 'yes', evidence: '3 个' },
        { key: 'handoff', label: '跨会话交接', status: 'partial', evidence: '交接检查点 0 个' },
        { key: 'restore', label: '重启后可恢复', status: 'no', evidence: '自动恢复判定仍缺' },
      ], gaps: ['跨会话交接：交接检查点 0 个'], actions: ['交接文件纳入统一恢复判定'] },
      { key: 'context', status: 'covered', score: 100, checks: [
        { key: 'rootEntry', label: '项目入口', status: 'yes', evidence: '根 AGENTS.md 80 行', critical: true },
        { key: 'modules', label: '模块入口', status: 'yes', evidence: '2 个' },
        { key: 'specs', label: '规格文档', status: 'yes', evidence: '100 份' },
        { key: 'progressive', label: '渐进披露', status: 'yes', evidence: '80 行' },
      ], gaps: [], actions: [] },
      { key: 'sandbox', status: 'partial', score: 60, checks: [
        { key: 'permissions', label: '权限矩阵', status: 'yes', evidence: '在档' },
        { key: 'workspace', label: '目录边界', status: 'partial', evidence: 'workspace 校验在档；目录白名单缺', critical: true },
        { key: 'network', label: '网络放行', status: 'no', evidence: '规则无执行期消费者' },
        { key: 'secrets', label: '密钥不落盘', status: 'yes', evidence: '默认不落原值', critical: true },
        { key: 'limits', label: '资源限额', status: 'partial', evidence: '有超时；无任务后销毁' },
      ], gaps: ['目录边界：白名单缺'], actions: ['terminal 增加目录白名单'] },
      { key: 'verification', status: 'covered', score: 87, checks: [
        { key: 'gates', label: '自动化门禁', status: 'yes', evidence: '15 个 gate pack', critical: true },
        { key: 'evalGate', label: '评测回归门', status: 'partial', evidence: '尚未接入常用 profile' },
        { key: 'external', label: '外部证据', status: 'yes', evidence: '发布门在档' },
        { key: 'release', label: '发布准出', status: 'yes', evidence: 'release gate 在档' },
      ], gaps: ['评测回归门：尚未接入常用 profile'], actions: ['把 L3 eval-regression 纳入常用 profile'] },
      { key: 'permissions', status: 'partial', score: 60, checks: [
        { key: 'enforce', label: '执行层强制', status: 'yes', evidence: '执法门已接线', critical: true },
        { key: 'identity', label: '按发起用户鉴权', status: 'no', evidence: '裁决只看 profile', critical: true },
        { key: 'scope', label: '审批带范围', status: 'no', evidence: '缺 scope/expiresAt', critical: true },
        { key: 'allowAudit', label: '放行可审计', status: 'no', evidence: '放行不落账', critical: true },
        { key: 'approvals', label: '审批记录', status: 'yes', evidence: '20 条' },
      ], gaps: ['按发起用户鉴权：裁决只看 profile'], actions: ['把 userId 接进 enforce-gate 裁决'] },
      { key: 'observability', status: 'covered', score: 80, checks: [
        { key: 'audit', label: '逐工具审计', status: 'yes', evidence: '120 条', critical: true },
        { key: 'duration', label: '耗时', status: 'yes', evidence: '100%' },
        { key: 'errors', label: '错误分类', status: 'yes', evidence: '100%' },
        { key: 'manifest', label: '运行清单', status: 'no', evidence: '未发现' },
        { key: 'cost', label: '运行级成本', status: 'no', evidence: '只有按天聚合' },
      ], gaps: ['运行清单：未发现'], actions: ['新增 run manifest'] },
      { key: 'evals', status: 'partial', score: 50, checks: [
        { key: 'fixedSets', label: '固定评测集', status: 'yes', evidence: '2 套', critical: true },
        { key: 'dimensions', label: '七维覆盖', status: 'partial', evidence: '3/7' },
        { key: 'heldout', label: '密封集', status: 'partial', evidence: '20 道' },
        { key: 'gate', label: '评测阻断', status: 'no', evidence: '仅回放打分' },
      ], gaps: ['七维覆盖：3/7'], actions: ['补工具参数与失败恢复评测'] },
    ],
    counts: { covered: 4, partial: 4, missing: 0 },
    meta: { source: 'governance/harness', note: '九层体检是自检清单，不是认证；数据缺席按 unavailable/partial 计，不造运行数据。', layersOrder: ['tools', 'loop', 'memory', 'context', 'sandbox', 'verification', 'permissions', 'observability', 'evals'] },
  })),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

async function mountComp(rel: string) {
  const mod = await import(rel)
  return mount(mod.default, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('驾驭工程四 Section 挂载渲染', () => {
  it('B1 目录：条目行 + 四要素徽标（有/缺双色）+ 缺口率汇总 + 本轮边界注记', async () => {
    const w = await mountComp('@/custom/governance/components/CapabilityCatalogSection.vue')
    await flushPromises()
    expect(w.find('[data-testid="harness-catalog-row-demo"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-catalog-row-demo"]').findAll('.hc__badge--ok')).toHaveLength(2)
    expect(w.find('[data-testid="harness-catalog-row-demo"]').findAll('.hc__badge--gap')).toHaveLength(2)
    expect(w.find('[data-testid="harness-catalog-summary"]').text()).toContain('50%')
    expect(w.find('[data-testid="harness-catalog-boundary"]').text()).toContain('不在本轮')
    // 缺席源 chip 如实降级
    expect(w.find('[data-testid="harness-catalog-sources"]').text()).toContain('不可用')
  })

  it('B2 成本账：六卡片 + 值渲染 + 缺席卡降级（不猜数）+ 口径折叠在卡内', async () => {
    const w = await mountComp('@/custom/governance/components/CostAccountsSection.vue')
    await flushPromises()
    const grid = w.find('[data-testid="harness-cost-grid"]')
    expect(grid.findAll('.hcost__card')).toHaveLength(6)
    expect(w.find('[data-testid="harness-cost-card-token"]').text()).toContain('498')
    expect(w.find('[data-testid="harness-cost-card-securityGovernance"]').classes()).toContain('hcost__card--off')
    expect(w.find('[data-testid="harness-cost-card-securityGovernance"]').text()).toContain('数据缺席')
    expect(w.find('[data-testid="harness-cost-card-rework"]').find('details').exists()).toBe(true)
  })

  it('B3 成熟度：五级阶梯三态 + 指标 unavailable + meta 非认证注记', async () => {
    const w = await mountComp('@/custom/governance/components/MaturitySection.vue')
    await flushPromises()
    for (const k of ['L1', 'L2', 'L3', 'L4', 'L5']) {
      expect(w.find(`[data-testid="harness-maturity-level-${k}"]`).exists(), k).toBe(true)
    }
    expect(w.find('[data-testid="harness-maturity-level-L1"]').classes()).toContain('hm__level--ok')
    expect(w.find('[data-testid="harness-maturity-level-L3"]').classes()).toContain('hm__level--fail')
    expect(w.find('[data-testid="harness-maturity-metric-mttr"]').text()).toContain('unavailable')
    expect(w.find('[data-testid="harness-maturity-item-L1-0"]').text()).toContain('能力目录 1 条')
    expect(w.find('[data-testid="harness-maturity-note"]').text()).toContain('自检清单非认证')
  })

  it('B4 原语：覆盖矩阵徽标 + 活体计数（缺席行有 note）+ 汇总 chip', async () => {
    const w = await mountComp('@/custom/governance/components/PrimitivesSection.vue')
    await flushPromises()
    expect(w.find('[data-testid="harness-primitives-row-task"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-primitives-row-task"]').findAll('.hp__status--ok')).toHaveLength(3)
    expect(w.find('[data-testid="harness-primitives-row-tool"]').text()).toContain('能力目录聚合失败')
    expect(w.find('[data-testid="harness-primitives-summary"]').text()).toContain('0 / 2')
  })

  it('B5 四层评估：四宫格 + instrumented/gap 双态 + 口径展示 + gap 不造数', async () => {
    const w = await mountComp('@/custom/governance/components/EvalLayersSection.vue')
    await flushPromises()
    for (const k of ['result', 'execution', 'resource', 'governance']) {
      expect(w.find(`[data-testid="harness-eval-layer-${k}"]`).exists(), k).toBe(true)
    }
    expect(w.find('[data-testid="harness-eval-metric-dispatchDeliveredRate"]').text()).toContain('90%')
    expect(w.find('[data-testid="harness-eval-metric-escapedDefectRate"]').classes()).toContain('el__metric--gap')
    expect(w.find('[data-testid="harness-eval-metric-escapedDefectRate"]').text()).toContain('口径')
    expect(w.find('[data-testid="harness-eval-metric-escapedDefectRate"]').text()).toContain('—')
    expect(w.find('[data-testid="harness-eval-metric-duplicateSideEffectRate"]').text()).toContain('重复执行的外部动作数')
    expect(w.find('[data-testid="harness-eval-gapnote"]').text()).toContain('3')
  })

  it('B7 九层体检：九卡齐备 + 三态徽标 + 证据/差距/建议动作 + 非认证注记', async () => {
    const w = await mountComp('@/custom/governance/components/NineLayersSection.vue')
    await flushPromises()
    for (const k of ['tools', 'loop', 'memory', 'context', 'sandbox', 'verification', 'permissions', 'observability', 'evals']) {
      expect(w.find(`[data-testid="harness-nine-layer-${k}"]`).exists(), k).toBe(true)
    }
    expect(w.find('[data-testid="harness-nine-layer-tools"]').classes()).toContain('nl__layer--covered')
    expect(w.find('[data-testid="harness-nine-layer-permissions"]').classes()).toContain('nl__layer--partial')
    expect(w.find('[data-testid="harness-nine-check-permissions-identity"]').text()).toContain('裁决只看 profile')
    expect(w.find('[data-testid="harness-nine-layer-permissions"]').text()).toContain('把 userId 接进 enforce-gate 裁决')
    expect(w.find('[data-testid="harness-nine-summary"]').text()).toContain('4')
    expect(w.find('[data-testid="harness-nine-note"]').text()).toContain('不是认证')
  })

  it('GovHarnessView 聚合四板块（页签面板壳）', async () => {
    const w = await mountComp('@/custom/ia2/views/gov/GovHarnessView.vue')
    await flushPromises()
    expect(w.find('[data-testid="ia-tasks-panel-gov-harness"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-catalog"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-cost"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-maturity"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-primitives"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-eval-layers"]').exists()).toBe(true)
    expect(w.find('[data-testid="harness-nine-layers"]').exists()).toBe(true)
  })

  it('降级诚实：API 抛错渲染错误行，不编造数据', async () => {
    const api = await import('@/custom/governance/api/harness')
    vi.mocked(api.fetchCostAccounts).mockRejectedValueOnce(new Error('backend down'))
    const w = await mountComp('@/custom/governance/components/CostAccountsSection.vue')
    await flushPromises()
    expect(w.find('.hcost__error').exists()).toBe(true)
    expect(w.find('[data-testid="harness-cost-grid"]').findAll('.hcost__card')).toHaveLength(0)
  })
})
