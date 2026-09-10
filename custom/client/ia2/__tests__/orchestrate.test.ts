// overlay/custom/client/ia2/__tests__/orchestrate.test.ts
// P3 Task 6 — 编排区 adapter 纯函数单测：
//   projectSpecCard  spec 卡片投影（模板种类/名称派生/计数/limits）
//   layoutFromSpec   GraphSpec → 画布拓扑投影（复用 runcenter buildRunGraph 同一布局器）
//   validateInstantiateForm / isCoarseCron / buildCreatePayload
//                    实例化表单粗校与 POST 体构造（对齐 controllers/loop.ts 白名单）
// 纯函数纪律：不改入参、不触碰网络与 DOM。
import { describe, it, expect } from 'vitest'
import type { RunGraphTopologyLike } from '@/custom/loop/runcenter/adapters/run-graph'
import {
  projectSpecCard, layoutFromSpec,
  validateInstantiateForm, isCoarseCron, buildCreatePayload, slugifyLoopName,
  type GraphSpecLike,
} from '../adapters/orchestrate'

/** compileLoopToSpec 产物的最小同构夹具（五阶段编译模板，graph-compiler.ts §拓扑） */
function fivePhaseSpec(): GraphSpecLike {
  return {
    id: 'loop-alpha',
    version: 1,
    nodes: [
      { id: 'discovery', type: 'phase-discovery', config: { label: 'alpha:discovery' } },
      { id: 'handoff', type: 'phase-handoff', config: { label: 'alpha:handoff' } },
      { id: 'validation', type: 'phase-validation', config: { label: 'alpha:validation' } },
      { id: 'persistence', type: 'phase-persistence', config: { label: 'alpha:persistence' } },
      { id: 'gate', type: 'loop-gate', config: { label: 'alpha:gate' } },
      { id: 'stop-check', type: 'stop-check', config: { label: 'alpha:stop-check' } },
    ],
    edges: [
      { from: 'discovery', to: 'handoff', label: 'has-contracts' },
      { from: 'handoff', to: 'validation', label: 'dispatched' },
      { from: 'validation', to: 'handoff', label: 'repair', guard: { maxIterations: 3 } },
      { from: 'validation', to: 'persistence', label: 'passed' },
      { from: 'persistence', to: 'gate', label: 'persisted' },
      { from: 'gate', to: 'stop-check', label: 'gate-passed' },
      { from: 'gate', to: 'handoff', label: 'gate-repair', guard: { maxIterations: 5 } },
      { from: 'discovery', to: 'stop-check', label: 'no-contracts' },
    ],
    entryNode: 'discovery',
    limits: { maxSteps: 100, maxCost: 200 },
  }
}

// ── projectSpecCard ──
describe('projectSpecCard', () => {
  it('五阶段编译模板：loop- 前缀派生名称、节点/边计数、entryNode、limits', () => {
    const card = projectSpecCard(fivePhaseSpec())
    expect(card).toEqual({
      id: 'loop-alpha',
      name: 'alpha',
      kind: 'five-phase',
      version: 1,
      nodeCount: 6,
      edgeCount: 8,
      entryNode: 'discovery',
      maxSteps: 100,
    })
  })

  it('daily-brief 模板识别为 daily-brief，非 loop- 前缀名称原样', () => {
    const brief = projectSpecCard({
      id: 'daily-brief', version: 2,
      nodes: [{ id: 'collect', type: 'brief-collect', config: {} }],
      edges: [], entryNode: 'collect',
      limits: { maxSteps: 10 },
    })
    expect(brief.kind).toBe('daily-brief')
    expect(brief.name).toBe('daily-brief')
    expect(brief.maxSteps).toBe(10)
  })

  it('未知 id 归 generic；limits 缺失 maxSteps 落 null；version 缺失落 0', () => {
    const card = projectSpecCard({
      id: 'custom-flow',
      nodes: [{ id: 'a', type: 'x', config: {} }, { id: 'b', type: 'y', config: {} }],
      edges: [{ from: 'a', to: 'b' }],
    })
    expect(card.kind).toBe('generic')
    expect(card.maxSteps).toBeNull()
    expect(card.version).toBe(0)
    expect(card.nodeCount).toBe(2)
    expect(card.edgeCount).toBe(1)
  })

  it('畸形输入（null/undefined/空对象）不炸：零值卡片', () => {
    expect(projectSpecCard(null as unknown as GraphSpecLike).nodeCount).toBe(0)
    expect(projectSpecCard(undefined as unknown as GraphSpecLike).id).toBe('')
    expect(projectSpecCard({} as GraphSpecLike).kind).toBe('generic')
  })

  it('纯函数：不改入参（卡片投影与拓扑投影共用夹具）', () => {
    const spec = fivePhaseSpec()
    const snapshot = JSON.stringify(spec)
    projectSpecCard(spec)
    layoutFromSpec(spec)
    expect(JSON.stringify(spec)).toBe(snapshot)
  })
})

// ── layoutFromSpec ──
describe('layoutFromSpec', () => {
  it('spec → 全 idle 画布拓扑：label 取 config.label、guard 徽标保留', () => {
    const graph = layoutFromSpec(fivePhaseSpec())
    expect(graph.nodes).toHaveLength(6)
    expect(graph.nodes.every(n => n.status === 'idle')).toBe(true)
    expect(graph.nodes.every(n => n.iteration === 0 && n.durationMs === 0)).toBe(true)
    const discovery = graph.nodes.find(n => n.id === 'discovery')!
    expect(discovery.label).toBe('alpha:discovery')
    expect(discovery.type).toBe('phase-discovery')
    // 回边 guard → 画布虚线弧 + ×3 徽标的渲染源
    expect(graph.edges.find(e => e.id === 'validation->handoff')!.guard).toBe(3)
    expect(graph.edges.find(e => e.id === 'gate->handoff')!.guard).toBe(5)
    // 普通边无 guard 键
    expect(graph.edges.find(e => e.id === 'handoff->validation')!.guard).toBeUndefined()
  })

  it('缺 label 的节点回退 nodeId；契约形状可直接喂 RunGraphCanvas（结构赋哨兵）', () => {
    const graph = layoutFromSpec({
      nodes: [{ id: 'solo', type: 't', config: {} }],
      edges: [],
    })
    expect(graph.nodes[0].label).toBe('solo')
    expect(graph.edges).toEqual([])
    // 画布契约哨兵：产物可结构赋给 RunGraphTopologyLike 的消费形状（RunGraphData）
    const topology: RunGraphTopologyLike = {
      nodes: graph.nodes.map(n => ({ id: n.id, type: n.type, config: {} })),
      edges: graph.edges.map(e => ({ from: e.from, to: e.to })),
      entryNode: 'solo',
    }
    expect(topology.nodes).toHaveLength(1)
  })

  it('事件空流投影语义：taken 恒 false（只读模板无执行事实）', () => {
    const graph = layoutFromSpec(fivePhaseSpec())
    expect(graph.edges.every(e => e.taken === false)).toBe(true)
  })
})

// ── isCoarseCron / validateInstantiateForm ──
describe('isCoarseCron', () => {
  it.each([
    ['0 9 * * *', true],
    ['*/5 * * * *', true],
    ['0 9-18 * * 1-5', true],
    ['0 9,12,18 * * *', true],
    ['0 */2 * * *', true],
    ['30 8 1 * *', true],
    ['  0 9 * * *  ', true], // 首尾空白容忍
    ['* * * * * *', true],   // 6 域（带秒）放行
  ])('合法 %j → true', (expr, ok) => {
    expect(isCoarseCron(expr)).toBe(ok)
  })

  it.each([
    ['', false],
    ['   ', false],
    ['0 9 * *', false],         // 4 域
    ['0 9', false],
    ['0 9 * * * extra', false], // 7 域
    ['a b c d e', false],
    ['0 9 * * *!', false],      // 非法记号
    ['@hourly', false],         // 描述符不支持
    ['0 9 * * 0-7/2/x', false], // 步进残缺
  ])('非法 %j → false', (expr, ok) => {
    expect(isCoarseCron(expr)).toBe(ok)
  })
})

describe('validateInstantiateForm', () => {
  const ok = { name: '晨检', goal: '每天早上检查站内告警', cron: '0 9 * * *' }

  it('齐全且合法 → 空错误表', () => {
    expect(validateInstantiateForm(ok)).toEqual([])
  })

  it('name / goal 各自必填（空白串等同缺失）', () => {
    expect(validateInstantiateForm({ ...ok, name: '   ' })).toEqual(['nameRequired'])
    expect(validateInstantiateForm({ ...ok, goal: '' })).toEqual(['goalRequired'])
    expect(validateInstantiateForm({ ...ok, name: '', goal: ' ' })).toEqual(['nameRequired', 'goalRequired'])
  })

  it('cron 粗校失败 → cronInvalid；多错误按 name→goal→cron 稳定排序', () => {
    expect(validateInstantiateForm({ ...ok, cron: '9 点跑' })).toEqual(['cronInvalid'])
    expect(validateInstantiateForm({ name: '', goal: '', cron: '' })).toEqual([
      'nameRequired', 'goalRequired', 'cronInvalid',
    ])
  })

  it('tenant 可选：缺省与带值都合法', () => {
    expect(validateInstantiateForm({ ...ok, tenant: '' })).toEqual([])
    expect(validateInstantiateForm({ ...ok, tenant: 'room:topic' })).toEqual([])
  })
})

// ── slugifyLoopName / buildCreatePayload ──
describe('buildCreatePayload', () => {
  it('构造 POST /api/loop/loops 白名单体：cron 调度 + slug id + 时间戳（对齐 LoopCreateWizard 惯例）', () => {
    const payload = buildCreatePayload(
      { name: '晨检 Loop', goal: '检查告警', cron: '0 9 * * *' },
      1_760_000_000_000,
    )
    expect(payload).toEqual({
      id: `loop-${slugifyLoopName('晨检 Loop')}-1760000000000`,
      name: '晨检 Loop',
      goal: '检查告警',
      schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      tenant: null,
    })
  })

  it('中文名 slug 化落在安全字符集（服务端 validateLoopId 同词表）；非法字符清空', () => {
    expect(slugifyLoopName('晨检 Loop')).toMatch(/^[a-z0-9._-]+$/)
    expect(slugifyLoopName('晨检 Loop')).toBe('loop')
    expect(slugifyLoopName('  Alpha__Beta 12 ')).toBe('alpha__beta-12')
    expect(slugifyLoopName('!!!')).toBe('')
  })

  it('tenant 带值裁剪透传、空白归 null（服务端白名单同语义）', () => {
    const withTenant = buildCreatePayload(
      { name: 'n', goal: 'g', cron: '* * * * *', tenant: '  room:topic  ' },
      1,
    )
    expect(withTenant.tenant).toBe('room:topic')
  })

  it('纯函数：不改入参', () => {
    const form = { name: 'x', goal: 'y', cron: '0 9 * * *', tenant: ' t ' }
    const snap = JSON.stringify(form)
    buildCreatePayload(form, 1)
    expect(JSON.stringify(form)).toBe(snap)
  })
})
