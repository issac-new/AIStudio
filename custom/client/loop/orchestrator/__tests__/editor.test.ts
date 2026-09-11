// overlay/custom/client/loop/orchestrator/__tests__/editor.test.ts
// P4 T6/T7 —— 编辑器纯函数层重点单测：
//   通道自动补齐（plan/boN/converge）与删节点反向清理 / 画布↔spec 往返一致 /
//   回边自动 guard / 容器序列化与合并语义 / 导入版本仲裁 / 编辑守卫
//  （id 词表、结构镜像 fanout≥2、validateGraphSpec 透传、死图警告、entry 兜底）。
import { describe, it, expect } from 'vitest'
import {
  emptySpec, addToSpec, removeNode, addEdge, removeEdge, moveNode, updateNodeConfig,
  normalizeGuards, wrapNodesInContainer, unwrapContainer, nextNodeId, nextContainerId,
  canvasToSpec, specToCanvas, importSpec, parseSpecJson, validateEditorDoc, checkNodeStructures,
  requiredChannels, autoPosition, edgeId, DEFAULT_MAX_ITERATIONS,
} from '../adapters/editor'

/** 线性三节点图夹具：seed → work → done（构造走真实 addToSpec/addEdge 链路） */
function linearDoc(): ReturnType<typeof emptySpec> {
  let doc = emptySpec()
  doc.id = 'my-graph'
  doc = addToSpec(doc, 'function')
  doc = addToSpec(doc, 'function')
  doc = addToSpec(doc, 'function')
  doc = addEdge(doc, 'function-1', 'function-2')
  doc = addEdge(doc, 'function-2', 'function-3')
  return doc
}

describe('emptySpec / id 生成 / 自动落位', () => {
  it('空图骨架：无节点无通道、entryNode 空、limits.maxSteps 就绪', () => {
    const doc = emptySpec()
    expect(doc.nodes).toEqual([])
    expect(doc.channels).toEqual({})
    expect(doc.entryNode).toBeNull()
    expect(doc.limits.maxSteps).toBeGreaterThan(0)
    expect(doc.containers).toEqual([])
  })

  it('nextNodeId 取最小不冲突正整数（删除后复用空位）', () => {
    const nodes = [{ id: 'plan-1' }, { id: 'plan-3' }]
    expect(nextNodeId(nodes, 'plan')).toBe('plan-2')
    expect(nextNodeId([], 'gate')).toBe('gate-1')
  })

  it('autoPosition 首个空闲网格单元；已有 (0,0) 节点则下移一格', () => {
    expect(autoPosition([])).toEqual({ x: 0, y: 0 })
    expect(autoPosition([{ x: 0, y: 0 }])).toEqual({ x: 200, y: 0 })
    expect(autoPosition([{ x: 0, y: 0 }, { x: 200, y: 0 }])).toEqual({ x: 400, y: 0 })
  })
})

describe('通道自动补齐（脚手架）', () => {
  it('plan 节点补三通道：planResult=append、planDecision/planMode=overwrite', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'plan')
    expect(doc.channels).toEqual({
      planResult: { reducer: 'append' },
      planDecision: { reducer: 'overwrite' },
      planMode: { reducer: 'overwrite' },
    })
    // 首节点自动成为入口候选
    expect(doc.entryNode).toBe('plan-1')
  })

  it('bo-n-variant + converge 共享默认收集通道、converge 另补中选通道', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'fanout')
    doc = addToSpec(doc, 'bo-n-variant')
    doc = addToSpec(doc, 'bo-n-variant')
    doc = addToSpec(doc, 'converge')
    expect(doc.channels).toEqual({
      'boN.candidates': { reducer: 'append' },
      'boN.winner': { reducer: 'overwrite' },
    })
    expect(Object.keys(requiredChannels('converge', {}))).toEqual(['boN.candidates', 'boN.winner'])
  })

  it('config 覆盖通道名时按覆盖值补齐（variant 自定义 collectChannel）', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'bo-n-variant')
    doc = updateNodeConfig(doc, 'bo-n-variant-1', { collectChannel: 'my.candidates' })
    expect(doc.channels['my.candidates']).toEqual({ reducer: 'append' })
    // 默认通道已无使用者 → 清理
    expect(doc.channels['boN.candidates']).toBeUndefined()
  })

  it('已有同名通道不覆盖（保留用户改过的 reducer）', () => {
    let doc = emptySpec()
    doc = { ...doc, channels: { 'boN.candidates': { reducer: 'merge' } } }
    doc = addToSpec(doc, 'bo-n-variant')
    expect(doc.channels['boN.candidates']).toEqual({ reducer: 'merge' })
  })
})

describe('删节点通道清理', () => {
  it('plan 全删后三通道清理；function 节点的用户通道不受脚手架清理影响', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'function')
    doc = addToSpec(doc, 'plan')
    doc = { ...doc, channels: { ...doc.channels, scratch: { reducer: 'append' } } }
    expect(Object.keys(doc.channels)).toContain('planResult')

    doc = removeNode(doc, 'plan-1')
    expect(Object.keys(doc.channels)).toEqual(['scratch'])
  })

  it('多 plan 节点共享通道：删一个仍有使用者，通道保留', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'plan')
    doc = addToSpec(doc, 'plan')
    doc = removeNode(doc, 'plan-1')
    expect(doc.channels).toHaveProperty('planResult')
    doc = removeNode(doc, 'plan-2')
    expect(doc.channels).toEqual({})
  })

  it('删节点级联：入/出边、容器成员、entryNode 回退首节点', () => {
    let doc = linearDoc()
    doc = addToSpec(doc, 'gate')
    doc = addEdge(doc, 'function-3', 'gate-1')
    doc = wrapNodesInContainer(doc, ['function-2', 'function-3'])

    doc = removeNode(doc, 'function-2')
    expect(doc.edges.some(e => e.from === 'function-2' || e.to === 'function-2')).toBe(false)
    expect(doc.containers).toEqual([{ id: 'loop-container-1', nodeIds: ['function-3'] }])

    doc = removeNode(doc, 'function-1')
    expect(doc.entryNode).toBe('function-3')
  })
})

describe('回边自动 guard', () => {
  it('连线闭合成环：回边自动补 guard.maxIterations=3，前向边不带 guard', () => {
    let doc = linearDoc()
    doc = addEdge(doc, 'function-3', 'function-1') // 闭合成环
    const back = doc.edges.find(e => e.from === 'function-3' && e.to === 'function-1')
    expect(back?.guard).toEqual({ maxIterations: DEFAULT_MAX_ITERATIONS })
    expect(DEFAULT_MAX_ITERATIONS).toBe(3)
    expect(doc.edges.find(e => e.from === 'function-1' && e.to === 'function-2')?.guard).toBeUndefined()
  })

  it('自环同样成回边、同样自动 guard', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'function')
    doc = addEdge(doc, 'function-1', 'function-1')
    expect(doc.edges[0].guard).toEqual({ maxIterations: 3 })
  })

  it('已带 guard 的回边保留用户值，不被缺省覆盖', () => {
    let doc = linearDoc()
    doc = addEdge(doc, 'function-3', 'function-1')
    doc = {
      ...doc,
      edges: doc.edges.map(e =>
        e.from === 'function-3' && e.to === 'function-1' ? { ...e, guard: { maxIterations: 7 } } : e),
    }
    doc = normalizeGuards(doc)
    expect(doc.edges.find(e => e.from === 'function-3')?.guard).toEqual({ maxIterations: 7 })
  })

  it('重复连线幂等：同 from→to 不产生第二条边', () => {
    let doc = linearDoc()
    doc = addEdge(doc, 'function-1', 'function-2')
    expect(doc.edges.filter(e => e.from === 'function-1' && e.to === 'function-2')).toHaveLength(1)
  })

  it('removeEdge 后序列化可通过（环边删除 → 不再要求 guard）', () => {
    let doc = linearDoc()
    doc = addEdge(doc, 'function-3', 'function-1')
    doc = removeEdge(doc, 'function-3', 'function-1')
    expect(validateEditorDoc(doc).issue).toBeNull()
  })

  it('非法端点拒绝（节点不存在不产生幽灵边）', () => {
    const doc = linearDoc()
    expect(addEdge(doc, 'function-1', 'ghost').edges).toHaveLength(doc.edges.length)
  })
})

describe('画布 ↔ spec 往返一致', () => {
  it('canvasToSpec：坐标剥离、converge 补 joinMode all、origin=editor、entry 兜底标记', () => {
    let doc = emptySpec()
    doc.id = 'roundtrip'
    doc.description = '  往返测试  '
    doc = addToSpec(doc, 'function')
    doc = addToSpec(doc, 'converge')
    doc = addEdge(doc, 'function-1', 'converge-1')

    const { spec, entryFallback } = canvasToSpec(doc)
    expect(spec.nodes.map(n => n.id)).toEqual(['function-1', 'converge-1'])
    expect((spec.nodes[0] as { x?: number }).x).toBeUndefined()
    expect(spec.nodes.find(n => n.id === 'converge-1')).toMatchObject({ joinMode: 'all' })
    expect(spec.nodes.find(n => n.id === 'function-1')).not.toHaveProperty('joinMode')
    expect(spec.origin).toBe('editor')
    expect(spec.description).toBe('往返测试')
    expect(spec.entryNode).toBe('function-1')
    expect(entryFallback).toBe(false)

    // entryNode 置空 → 兜底取首节点 + entryFallback=true
    const dropped = canvasToSpec({ ...doc, entryNode: null })
    expect(dropped.spec.entryNode).toBe('function-1')
    expect(dropped.entryFallback).toBe(true)
  })

  it('specToCanvas ∘ canvasToSpec 往返：nodes/edges/channels/containers/meta 语义无损', () => {
    let doc = linearDoc()
    doc = addToSpec(doc, 'plan') // 带通道脚手架
    doc = addEdge(doc, 'function-3', 'plan-1')
    doc = addEdge(doc, 'plan-1', 'function-1') // 回边自动 guard
    doc = wrapNodesInContainer(doc, ['function-2', 'function-3'], '修复环')
    doc = { ...doc, meta: { goal: '目标', cron: '0 9 * * *' } }

    const { spec } = canvasToSpec(doc)
    const back = specToCanvas(spec)
    const again = canvasToSpec(back)

    // 节点/边/通道/容器/元数据双往返稳定
    expect(again.spec.nodes).toEqual(spec.nodes)
    expect(again.spec.edges).toEqual(spec.edges)
    expect(again.spec.channels).toEqual(spec.channels)
    expect(again.spec.containers).toEqual(spec.containers)
    expect(again.spec.meta).toEqual(spec.meta)
    expect(again.spec.entryNode).toBe(spec.entryNode)
    // 回画布后坐标存在（布局器落位）且可再拖动
    expect(back.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true)
    expect(back.containers).toEqual([{ id: 'loop-container-1', label: '修复环', nodeIds: ['function-2', 'function-3'] }])
  })
})

describe('容器序列化', () => {
  it('wrapNodesInContainer：≥2 成员成容器、label 缺省省略；成员迁移（不双归属）', () => {
    let doc = linearDoc()
    doc = wrapNodesInContainer(doc, ['function-1', 'function-2'])
    expect(doc.containers).toEqual([{ id: 'loop-container-1', nodeIds: ['function-1', 'function-2'] }])

    // 把 function-2 并入新容器 → 旧容器移除该成员（仍有 function-1 在册则保留）
    doc = wrapNodesInContainer(doc, ['function-2', 'function-3'], 'loop')
    expect(doc.containers).toEqual([
      { id: 'loop-container-1', nodeIds: ['function-1'] },
      { id: 'loop-container-2', label: 'loop', nodeIds: ['function-2', 'function-3'] },
    ])

    // 序列化进 spec
    const { spec } = canvasToSpec(doc)
    expect(spec.containers).toEqual([
      { id: 'loop-container-1', nodeIds: ['function-1'] },
      { id: 'loop-container-2', label: 'loop', nodeIds: ['function-2', 'function-3'] },
    ])

    // unwrap 只删元数据（节点与边不动）；两个容器逐一解散
    doc = unwrapContainer(doc, 'loop-container-2')
    expect(doc.containers).toEqual([{ id: 'loop-container-1', nodeIds: ['function-1'] }])
    doc = unwrapContainer(doc, 'loop-container-1')
    expect(doc.containers).toEqual([])
    expect(doc.nodes).toHaveLength(3)
  })

  it('少于 2 成员不成容器；未知节点被过滤', () => {
    const doc = linearDoc()
    expect(wrapNodesInContainer(doc, ['function-1']).containers).toEqual([])
    expect(wrapNodesInContainer(doc, ['function-1', 'ghost']).containers).toEqual([])
    expect(nextContainerId([{ id: 'loop-container-1' }])).toBe('loop-container-2')
  })
})

describe('导入 / 版本仲裁', () => {
  const SPEC_JSON = {
    id: 'imported',
    version: 2,
    channels: { planResult: { reducer: 'append' } },
    nodes: [
      { id: 'a', type: 'function', config: { set: { seed: true } } },
      { id: 'b', type: 'plan', config: { planText: 'p', todo: [], onReject: 'fail' } },
    ],
    edges: [{ from: 'a', to: 'b' }],
    entryNode: 'a',
    limits: { maxSteps: 50 },
    origin: 'editor',
  }

  it('parseSpecJson：合法 JSON 进画布；坏 JSON / 畸形结构 throw 可直显 message', () => {
    expect(parseSpecJson(JSON.stringify(SPEC_JSON)).id).toBe('imported')
    expect(() => parseSpecJson('{oops')).toThrow('Invalid JSON')
    expect(() => parseSpecJson('{"id":"x","nodes":1}')).toThrow('Invalid GraphSpec')
  })

  it('导入 id 已存在：version = 同 id 最大版本 +1；不存在则原样', () => {
    const doc = importSpec(parseSpecJson(JSON.stringify(SPEC_JSON)), [
      { id: 'imported', version: 7 },
    ])
    expect(doc.version).toBe(8)
    const fresh = importSpec(parseSpecJson(JSON.stringify(SPEC_JSON)), [{ id: 'other', version: 9 }])
    expect(fresh.version).toBe(2)
    // 进画布后节点与坐标就绪
    expect(doc.nodes.map(n => n.id)).toEqual(['a', 'b'])
    expect(doc.nodes.every(n => Number.isFinite(n.x))).toBe(true)
  })
})

describe('编辑守卫 validateEditorDoc', () => {
  it('合法线性图：issue=null（无终止配置的黄条属警告级，不阻断保存）', () => {
    const v = validateEditorDoc(linearDoc())
    expect(v.issue).toBeNull()
    expect(v.entryFallback).toBe(false)
  })

  it('id 非法（空 / 含空格中文）→ idInvalid，保存禁', () => {
    const doc = linearDoc()
    expect(validateEditorDoc({ ...doc, id: '' }).issue).toMatchObject({ kind: 'idInvalid' })
    expect(validateEditorDoc({ ...doc, id: '我的 图' }).issue).toMatchObject({ kind: 'idInvalid' })
  })

  it('空画布 → empty（id 合法前提下的空节点集）', () => {
    expect(validateEditorDoc({ ...emptySpec(), id: 'blank' }).issue).toMatchObject({ kind: 'empty' })
  })

  it('孤立节点（无入边）→ validate 透传服务端 message', () => {
    let doc = linearDoc()
    doc = addToSpec(doc, 'gate') // 无入边
    const v = validateEditorDoc(doc)
    expect(v.issue).toMatchObject({ kind: 'validate' })
    expect((v.issue as { message: string }).message).toContain('Unreachable node')
  })

  it('fanout 结构镜像：<2 条无条件出边一针见血报错', () => {
    let doc = emptySpec()
    doc.id = 'fanout-spec'
    doc = addToSpec(doc, 'fanout')
    doc = addToSpec(doc, 'function')
    doc = addEdge(doc, 'fanout-1', 'function-1')
    const v = validateEditorDoc(doc)
    expect(v.issue).toMatchObject({ kind: 'structure' })
    expect((v.issue as { message: string }).message).toContain('fanout node \'fanout-1\'')
  })

  it('plan 缺通道（通道被手工删空）→ 结构镜像报三通道', () => {
    let doc = emptySpec()
    doc.id = 'plan-spec'
    doc = addToSpec(doc, 'plan')
    doc = addToSpec(doc, 'function')
    doc = addEdge(doc, 'plan-1', 'function-1')
    doc = { ...doc, channels: {} }
    const v = validateEditorDoc(doc)
    expect(v.issue).toMatchObject({ kind: 'structure' })
    expect((v.issue as { message: string }).message).toContain('planResult')
  })

  it('无终止配置黄条：no-end-condition 警告（有守卫环则消）', () => {
    const v = validateEditorDoc(linearDoc())
    expect(v.warnings.map(w => w.code)).toContain('no-end-condition')

    let looped = linearDoc()
    looped = addEdge(looped, 'function-3', 'function-1')
    expect(validateEditorDoc(looped).warnings.map(w => w.code)).not.toContain('no-end-condition')
  })

  it('fanout 分支不收敛警告（fanout-no-converge）', () => {
    let doc = emptySpec()
    doc.id = 'bo-spec'
    doc = addToSpec(doc, 'fanout')
    doc = addToSpec(doc, 'bo-n-variant')
    doc = addToSpec(doc, 'bo-n-variant')
    doc = addToSpec(doc, 'converge')
    doc = addEdge(doc, 'fanout-1', 'bo-n-variant-1')
    doc = addEdge(doc, 'fanout-1', 'bo-n-variant-2')
    doc = addEdge(doc, 'bo-n-variant-1', 'converge-1')
    doc = addEdge(doc, 'bo-n-variant-2', 'converge-1')
    // 补终止：converge 回 fanout 守卫环
    doc = addEdge(doc, 'converge-1', 'fanout-1')
    const v = validateEditorDoc(doc)
    expect(v.issue).toBeNull()
    expect(v.warnings.map(w => w.code)).not.toContain('fanout-no-converge')
  })

  it('checkNodeStructures 镜像服务端 validateEditorSpec 语义（converge 缺中选通道）', () => {
    const spec = {
      id: 'x', version: 1,
      channels: { 'boN.candidates': { reducer: 'append' } },
      nodes: [
        { id: 'c', type: 'converge', config: {} },
      ],
      edges: [],
      entryNode: 'c',
      limits: { maxSteps: 10 },
    }
    expect(checkNodeStructures(spec as never)).toContain("converge node 'c' requires channels: boN.winner")
  })
})

describe('updateNodeConfig / moveNode', () => {
  it('config 整体替换并联动脚手架通道；moveNode 纯替换坐标', () => {
    let doc = emptySpec()
    doc = addToSpec(doc, 'converge')
    doc = updateNodeConfig(doc, 'converge-1', { expect: 3, winnerChannel: 'pick.winner' })
    expect(doc.nodes[0].config).toEqual({ expect: 3, winnerChannel: 'pick.winner' })
    expect(doc.channels).toEqual({
      'boN.candidates': { reducer: 'append' },
      'pick.winner': { reducer: 'overwrite' },
    })
    doc = moveNode(doc, 'converge-1', 42, 24)
    expect(doc.nodes[0]).toMatchObject({ x: 42, y: 24 })
  })

  it('edgeId 生成与 RunGraphCanvas 边 id 同构', () => {
    expect(edgeId('a', 'b')).toBe('a->b')
  })
})
