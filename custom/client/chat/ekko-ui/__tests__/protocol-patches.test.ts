// @vitest-environment node
// overlay/custom/client/chat/ekko-ui/__tests__/protocol-patches.test.ts
// 批二协议守门：六种补丁与拒绝条件、可修复错误（带可用值）、目录投影、回执摘要、
// 续接消息格式、工具名识别、能力位翻转。
import { describe, expect, it } from 'vitest'
import {
  EKKO_UI_CATALOG,
  EKKO_UI_LIMITS,
  EKKO_UI_PROTOCOL,
  EKKO_UI_PROTOCOL_V2,
  applySurfacePatches,
  catalogProjection,
  clientCapabilities,
  formatSurfaceTurnMessage,
  formatValidationErrors,
  isPersistentSurfaceToolName,
  isSurfaceToolName,
  surfaceDigest,
  surfaceIdFor,
  validateSpec,
  validateSurfacePatches,
  type EkkoUISpec,
} from '../protocol'

function spec(overrides: Partial<EkkoUISpec> = {}): EkkoUISpec {
  return {
    protocol: EKKO_UI_PROTOCOL_V2,
    surfaceId: 'estimator',
    title: '估算器',
    fallbackText: '可调参数的估算卡片。',
    state: { seats: 8, price: 29 },
    root: {
      id: 'root',
      type: 'stack',
      children: [
        { id: 'title', type: 'heading', props: { text: '估算', level: 3 } },
        { id: 'seats', type: 'range', bind: 'seats', props: { min: 1, max: 50 } },
        { id: 'total', type: 'text', props: { text: '合计' } },
        { id: 'go', type: 'button', props: { text: '提交', variant: 'primary' }, events: { click: { type: 'surface.submit', actionId: 'submit', payload: { kind: 'state', path: '' } } } },
      ],
    },
    ...overrides,
  }
}

const ok = (result: { ok: boolean; errors: { code: string; message: string }[] }, label = '') => {
  expect(result.ok, `${label} ${JSON.stringify(result.errors)}`).toBe(true)
}
const codes = (result: { ok: boolean; errors: { code: string }[] }) => result.errors.map(error => error.code)

describe('六种补丁', () => {
  it('set-props 只改给定属性，其余属性保留', () => {
    const result = applySurfacePatches(spec(), [{ op: 'set-props', nodeId: 'seats', props: { max: 100 } }])
    ok(result)
    expect(result.spec?.root.children?.[1].props).toEqual({ min: 1, max: 100 })
    expect(result.changed).toEqual(['seats'])
    // 不改原对象
    expect(spec().root.children?.[1].props).toEqual({ min: 1, max: 50 })
  })

  it('set-style 整体替换样式', () => {
    const result = applySurfacePatches(spec({ root: { ...spec().root, style: { gap: 'sm', padding: 'md' } } }), [
      { op: 'set-style', nodeId: 'root', style: { direction: 'row', gap: 'lg' } },
    ])
    ok(result)
    expect(result.spec?.root.style).toEqual({ direction: 'row', gap: 'lg' })
  })

  it('replace-node 换掉整个节点，id 必须一致', () => {
    const result = applySurfacePatches(spec(), [
      { op: 'replace-node', nodeId: 'total', node: { id: 'total', type: 'metric', props: { label: '合计', value: 232 } } },
    ])
    ok(result)
    expect(result.spec?.root.children?.[2].type).toBe('metric')
    expect(result.spec?.root.children?.[1].type).toBe('range')

    const mismatch = applySurfacePatches(spec(), [
      { op: 'replace-node', nodeId: 'total', node: { id: 'renamed', type: 'text', props: { text: 'x' } } },
    ])
    expect(codes(mismatch)).toContain('patch.id_mismatch')
  })

  it('insert-child：无 afterId 追加到末尾，有 afterId 插在指定子节点之后', () => {
    const appended = applySurfacePatches(spec(), [
      { op: 'insert-child', parentId: 'root', node: { id: 'hint', type: 'alert', props: { text: '提示' } } },
    ])
    ok(appended)
    expect(appended.spec?.root.children?.map(node => node.id)).toEqual(['title', 'seats', 'total', 'go', 'hint'])

    const inserted = applySurfacePatches(spec(), [
      { op: 'insert-child', parentId: 'root', afterId: 'title', node: { id: 'sub', type: 'text', props: { text: '副标题' } } },
    ])
    ok(inserted)
    expect(inserted.spec?.root.children?.map(node => node.id)).toEqual(['title', 'sub', 'seats', 'total', 'go'])
  })

  it('remove-node 删节点，根节点不可删', () => {
    const result = applySurfacePatches(spec(), [{ op: 'remove-node', nodeId: 'total' }])
    ok(result)
    expect(result.spec?.root.children?.map(node => node.id)).toEqual(['title', 'seats', 'go'])

    expect(codes(applySurfacePatches(spec(), [{ op: 'remove-node', nodeId: 'root' }]))).toContain('patch.root_removed')
  })

  it('set-state 改状态初值，路径不合法被拒', () => {
    const result = applySurfacePatches(spec(), [{ op: 'set-state', path: 'seats', value: 12 }, { op: 'set-state', path: 'meta.note', value: '草稿' }])
    ok(result)
    expect(result.spec?.state).toEqual({ seats: 12, price: 29, meta: { note: '草稿' } })
    expect(codes(applySurfacePatches(spec(), [{ op: 'set-state', path: '__proto__.x', value: 1 }]))).toContain('patch.state_path')
  })

  it('多个补丁按顺序应用，changed 汇总去重', () => {
    const result = applySurfacePatches(spec(), [
      { op: 'set-props', nodeId: 'seats', props: { max: 100 } },
      { op: 'set-props', nodeId: 'seats', props: { min: 2 } },
      { op: 'remove-node', nodeId: 'title' },
    ])
    ok(result)
    expect(result.changed).toEqual(['seats', 'title'])
  })
})

describe('补丁被拒的条件', () => {
  it('目标节点不存在时点名，并列出可用 id', () => {
    const result = applySurfacePatches(spec(), [{ op: 'set-props', nodeId: 'nope', props: { a: 1 } }])
    expect(codes(result)).toContain('patch.target_missing')
    expect(result.errors[0].message).toContain('root')
    expect(result.errors[0].message).toContain('seats')
  })

  it('afterId 不是该父节点的直接子节点时被拒', () => {
    const result = applySurfacePatches(spec(), [
      { op: 'insert-child', parentId: 'root', afterId: 'ghost', node: { id: 'n', type: 'text', props: { text: 'x' } } },
    ])
    expect(codes(result)).toContain('patch.after_id')
  })

  it('补丁引入重复 id、非法父子关系或未知部件时，打完后整体重校验并拒绝', () => {
    expect(codes(applySurfacePatches(spec(), [
      { op: 'insert-child', parentId: 'root', node: { id: 'seats', type: 'text', props: { text: 'x' } } },
    ]))).toContain('node.id.duplicate')

    expect(codes(applySurfacePatches(spec(), [
      { op: 'insert-child', parentId: 'seats', node: { id: 'n', type: 'text', props: { text: 'x' } } },
    ]))).toContain('patch.parent_no_children')

    const unknown = applySurfacePatches(spec(), [
      { op: 'insert-child', parentId: 'root', node: { id: 'n', type: 'sparkline', props: {} } },
    ])
    expect(codes(unknown)).toContain('node.type.unknown')
    // 错误路径指向落点，便于模型直接修
    expect(unknown.errors[0].path).toBe('root.children[4].type')
  })

  it('形状校验：非数组、空数组、超量、未知操作、缺字段、非法 id', () => {
    expect(validateSurfacePatches('x')[0].code).toBe('patches.invalid')
    expect(validateSurfacePatches([])[0].code).toBe('patches.invalid')
    expect(validateSurfacePatches(Array.from({ length: EKKO_UI_LIMITS.maxPatchOperations + 1 }, () => ({ op: 'remove-node', nodeId: 'a' })))[0].code).toBe('patches.limit')
    expect(validateSurfacePatches([{ op: 'explode', nodeId: 'a' }])[0].code).toBe('patch.op.unknown')
    expect(validateSurfacePatches([{ op: 'set-props', props: {} }])[0].code).toBe('patch.nodeId')
    expect(validateSurfacePatches([{ op: 'set-props', nodeId: 'bad id!', props: {} }])[0].code).toBe('patch.nodeId')
    expect(validateSurfacePatches([{ op: 'set-props', nodeId: 'a', props: 'x' }])[0].code).toBe('patch.props')
    expect(validateSurfacePatches([{ op: 'replace-node', nodeId: 'a' }])[0].code).toBe('patch.node')
    expect(validateSurfacePatches([{ op: 'insert-child', parentId: 'a' }])[0].code).toBe('patch.node')
    expect(validateSurfacePatches([{ op: 'set-style', nodeId: 'a', style: 'x' }])[0].code).toBe('patch.style')
    expect(validateSurfacePatches([{ op: 'set-state', path: 'a', value: undefined }])[0].code).toBe('patch.value')
    expect(validateSurfacePatches([{ op: 'remove-node', nodeId: 'a' }, { op: 'set-props', nodeId: 'a', props: { x: 1 } }])).toEqual([])
  })

  it('共享子树型的补丁输入不会把校验挂死', () => {
    let dag: unknown = { kind: 'literal', value: 1 }
    for (let i = 0; i < 40; i++) dag = { kind: 'if', cond: { kind: 'literal', value: true }, then: dag, else: dag }
    const started = Date.now()
    const result = applySurfacePatches(spec(), [
      { op: 'set-props', nodeId: 'total', props: { text: { $expr: dag } } },
    ])
    expect(Date.now() - started).toBeLessThan(2000)
    expect(result.ok).toBe(false)
  })
})

describe('可修复错误：带可用值', () => {
  it('未知部件列出可用部件（v1 不含 v2 部件）', () => {
    const v2 = validateSpec(spec({ root: { id: 'x', type: 'foox', props: {} } }))
    expect(v2.ok).toBe(false)
    if (!v2.ok) {
      const message = v2.errors[0].message
      expect(message).toContain('可用')
      for (const def of EKKO_UI_CATALOG) expect(message).toContain(def.type)
    }
    const v1 = validateSpec(spec({ protocol: EKKO_UI_PROTOCOL, root: { id: 'x', type: 'foox', props: {} } }))
    if (v1.ok) throw new Error('v1 应拒绝未知部件')
    expect(v1.errors[0].message).not.toContain('chart')
  })

  it('未知属性列出该部件的属性，未知事件与未知动作同理', () => {
    const prop = validateSpec(spec({ root: { id: 'r', type: 'range', props: { colour: 'red' } } }))
    if (prop.ok) throw new Error('应拒绝未知属性')
    expect(prop.errors[0].message).toContain('colour')
    expect(prop.errors[0].message).toContain('min')
    expect(prop.errors[0].message).toContain('step')

    const event = validateSpec(spec({ root: { id: 't', type: 'text', props: { text: 'x' }, events: { hover: { type: 'state.toggle', path: 'a' } } } }))
    if (event.ok) throw new Error('应拒绝未知事件')
    expect(event.errors[0].message).toContain('不可交互')

    const action = validateSpec(spec({ root: { id: 'b', type: 'button', props: { text: 'x' }, events: { click: { type: 'eval', code: '1' } } } }))
    if (action.ok) throw new Error('应拒绝未知动作')
    expect(action.errors[0].message).toContain('surface.submit')
  })

  it('formatValidationErrors 压成一句话，超出条数时说明还有几处', () => {
    const short = formatValidationErrors([{ path: 'root.type', code: 'a', message: '甲' }, { path: 'root.props', code: 'b', message: '乙' }])
    expect(short).toBe('2 处问题——root.type：甲；root.props：乙')
    const long = formatValidationErrors(Array.from({ length: 9 }, (_, i) => ({ path: `p${i}`, code: 'x', message: `m${i}` })), 5)
    expect(long.startsWith('9 处问题——p0：m0；')).toBe(true)
    expect(long.endsWith('；另有 4 处')).toBe(true)
  })
})

describe('目录投影', () => {
  it('含全部部件与写法说明，可按关键词与类别过滤', () => {
    const all = catalogProjection()
    expect(all.protocols).toEqual([EKKO_UI_PROTOCOL, EKKO_UI_PROTOCOL_V2])
    expect(all.components).toHaveLength(EKKO_UI_CATALOG.length)
    expect(all.features.persistent).toBe(true)
    expect(all.features.updates).toBe(true)
    expect(all.expressions.map(item => item.kind)).toEqual(expect.arrayContaining(['literal', 'state', 'arith', 'map', 'format']))
    expect(all.actions).toEqual(expect.arrayContaining(['state.set', 'surface.submit', 'surface.turn']))
    expect(all.limits.maxSpecBytes).toBe(EKKO_UI_LIMITS.maxSpecBytes)
    const chart = all.components.find(item => item.type === 'chart')
    expect(chart?.props.kind).toContain('bar')
    expect(chart?.props.kind).toContain('*')
    expect(all.notes.join('\n')).toContain('$expr')

    expect(catalogProjection({ query: 'chart' }).components.map(item => item.type)).toEqual(['chart'])
    // 类别为 input 的 11 个：field 与十种控件；form 归 layout
    expect(catalogProjection({ category: 'input' }).components.map(item => item.type)).toEqual([
      'field', 'input', 'textarea', 'number', 'select', 'radio', 'checkbox', 'switch', 'range', 'date', 'time',
    ])
    expect(catalogProjection({ query: 'zzz-no-match' }).components).toEqual([])
  })

  // 2026-11-25 真实会话走查：目录只列动作名，模型把 type 写成 action、又给 payload 多包了一层 $expr，连试三次才对。
  it('目录给出每个动作的字段形状与可照抄的样例，且每个样例自身合法', () => {
    const shapes = catalogProjection().actionShapes
    expect(shapes.map(item => item.type).sort()).toEqual(catalogProjection().actions.slice().sort())
    for (const shape of shapes) {
      // 样例去掉外层包装后必须是合法动作：把动作挂到一个按钮的 click 上做整体校验
      const spec = {
        protocol: EKKO_UI_PROTOCOL_V2, surfaceId: 'probe', fallbackText: 'x',
        state: { form: { seats: 8, agree: false }, items: ['a'], result: 'r' },
        root: { id: 'root', type: 'stack', children: [
          { id: 'b', type: 'button', props: { text: 'x' }, events: { click: JSON.parse(shape.example) } },
          { id: 't', type: 'tabs', children: [{ id: 'detail', type: 'tab-panel', props: { label: '明细' }, children: [{ id: 'd', type: 'text', props: { text: 'y' } }] }] },
        ] },
      }
      expect(validateSpec(spec), `${shape.type} 的样例应当合法：${JSON.stringify(validateSpec(spec).errors)}`).toMatchObject({ ok: true })
    }
    const submit = shapes.find(item => item.type === 'surface.submit')
    expect(submit?.example).toBe('{"type":"surface.submit","actionId":"submit","payload":{"kind":"state","path":""}}')
    expect(submit?.fields).toContain('path":""')
    expect(catalogProjection().notes.join('\n')).toContain('不要包 $expr')
  })

  it('按动作名查目录能查到写法（查不到部件的词也能命中动作）', () => {
    expect(catalogProjection({ query: 'submit' }).actionShapes.map(item => item.type)).toEqual(['surface.submit'])
    expect(catalogProjection({ query: 'submit' }).components).toEqual([])
    // 查部件时动作写法不被查询词误伤掉：range 不命中任何动作
    expect(catalogProjection({ query: 'range' }).actionShapes).toEqual([])
  })

  it('提交负载的正确写法一次通过；包了 $expr 时指出怎么改', () => {
    const specWith = (payload: unknown) => ({
      protocol: EKKO_UI_PROTOCOL_V2, surfaceId: 's', fallbackText: 'x', state: { seats: 8 },
      root: { id: 'root', type: 'stack', children: [
        { id: 'seats-slider', type: 'range', bind: 'seats', props: { min: 1, max: 50 } },
        { id: 'submit-btn', type: 'button', props: { text: '提交估算', variant: 'primary' },
          events: { click: [{ type: 'surface.submit', actionId: 'submit', payload }] } },
      ] },
    })
    // 第三次（正确）：裸表达式
    expect(validateSpec(specWith({ kind: 'state', path: '' }))).toMatchObject({ ok: true })
    // 第二次：多包了一层 $expr —— 指向「去掉外层」，而不是「未知表达式类型：undefined」
    const wrapped = validateSpec(specWith({ $expr: { kind: 'state', path: '' } }))
    expect(wrapped.ok).toBe(false)
    if (wrapped.ok) return
    expect(wrapped.errors).toHaveLength(1)
    expect(wrapped.errors[0].path).toBe('root.children[1].events.click[0].payload')
    expect(wrapped.errors[0].message).toContain('不要包 $expr')
    expect(wrapped.errors[0].message).not.toContain('undefined')
  })
})

describe('回执摘要与续接消息', () => {
  it('摘要与键序无关，内容变化则变', () => {
    const a = surfaceDigest(spec())
    const reordered = spec({ state: { price: 29, seats: 8 } })
    expect(surfaceDigest(reordered)).toBe(a)
    expect(surfaceDigest(spec({ state: { seats: 9, price: 29 } }))).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    // 标题与兜底文本不参与摘要：它们不改变界面结构
    expect(surfaceDigest(spec({ title: '改名', fallbackText: '别的兜底' }))).toBe(a)
  })

  it('续接消息含编号、版本、动作与提交内容', () => {
    const text = formatSurfaceTurnMessage({ title: '估算器', surfaceId: 'srf:s1:estimator', revision: 3, actionId: 'submit', payload: { seats: 12 } })
    expect(text).toContain('「估算器」')
    expect(text).toContain('surface_id=srf:s1:estimator')
    expect(text).toContain('revision=3')
    expect(text).toContain('action=submit')
    expect(text).toContain('"seats": 12')
    expect(formatSurfaceTurnMessage({ surfaceId: 'srf:s1:a', revision: 1, actionId: 'go' })).not.toContain('提交内容')
  })

  it('超大的提交内容被截断并注明原长', () => {
    const text = formatSurfaceTurnMessage({ surfaceId: 'srf:s1:a', revision: 1, actionId: 'submit', payload: { blob: 'x'.repeat(20_000) } })
    expect(text.length).toBeLessThan(9000)
    expect(text).toContain('已截断')
  })
})

describe('工具名识别与能力位', () => {
  it('surface_create 渲染卡片，其余四个持久工具是普通轨迹', () => {
    expect(isSurfaceToolName('ekko_studio_surface_create')).toBe(true)
    expect(isSurfaceToolName('mcp__ekko-studio-interaction__ekko_studio_surface_create')).toBe(true)
    expect(isSurfaceToolName('ekko_studio_show_surface')).toBe(true)
    for (const name of ['surface_update', 'surface_inspect', 'surface_close', 'surface_catalog']) {
      expect(isSurfaceToolName(`ekko_studio_${name}`), name).toBe(false)
    }
    expect(isPersistentSurfaceToolName('ekko_studio_surface_create')).toBe(true)
    expect(isPersistentSurfaceToolName('ekko_studio_show_surface')).toBe(false)
    expect(isSurfaceToolName(undefined)).toBe(false)
  })

  it('能力位：持久与更新置真，沙箱与逃生舱仍为假', () => {
    const caps = clientCapabilities()
    expect(caps.features.persistent).toBe(true)
    expect(caps.features.updates).toBe(true)
    expect(caps.features.logicRuntime).toBe(false)
    expect(caps.features.appBlock).toBe(false)
  })

  it('surface_id 公式保持稳定', () => {
    expect(surfaceIdFor('s1', 'estimator')).toBe('srf:s1:estimator')
  })
})
