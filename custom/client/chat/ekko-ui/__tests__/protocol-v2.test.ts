// @vitest-environment node
// overlay/custom/client/chat/ekko-ui/__tests__/protocol-v2.test.ts
// 协议 v2 守门：新表达式（算术/比较/格式化/条件/合并/长度/拼接/循环）、新部件、新动作、
// 能力协商、v1/v2 双协议分流与求值预算。v1 行为不变由 protocol.test.ts 原样锁定。
import { describe, expect, it } from 'vitest'
import {
  EKKO_UI_PROTOCOL,
  EKKO_UI_PROTOCOL_V2,
  applyActions,
  clientCapabilities,
  evaluateExpression,
  validateSpec,
  type EkkoUIExpression,
  type EkkoUISpec,
  type EkkoUIState,
} from '../protocol'

function v2Spec(overrides: Partial<EkkoUISpec> = {}): EkkoUISpec {
  return {
    protocol: EKKO_UI_PROTOCOL_V2,
    surfaceId: 'estimator',
    title: '估算器',
    fallbackText: '可调参数的估算卡片。',
    state: { seats: 8, price: 29, items: [{ name: '甲', qty: 2 }, { name: '乙', qty: 3 }] },
    root: {
      id: 'root',
      type: 'stack',
      children: [
        { id: 'seats', type: 'range', bind: 'seats', props: { min: 1, max: 50 } },
        {
          id: 'total',
          type: 'metric',
          props: {
            label: '月费',
            value: {
              $expr: {
                kind: 'format',
                as: 'currency',
                value: { kind: 'arith', op: '*', left: { kind: 'state', path: 'seats' }, right: { kind: 'state', path: 'price' } },
              },
            },
          },
        },
        {
          id: 'go',
          type: 'button',
          props: { text: '提交', variant: 'primary' },
          events: {
            click: { type: 'surface.submit', actionId: 'submit', payload: { kind: 'state', path: '' } },
          },
        },
      ],
    },
    ...overrides,
  }
}

describe('v2 表达式：校验与求值', () => {
  const state: EkkoUIState = {
    seats: 8,
    price: 29,
    name: 'Ada',
    tags: ['a', 'b'],
    none: null,
    items: [{ name: '甲', qty: 2 }, { name: '乙', qty: 3 }],
  }

  it('接受含新表达式的 v2 spec', () => {
    const result = validateSpec(v2Spec())
    expect(result.ok).toBe(true)
  })

  it('arith：四则运算与取余，非数字与除零得 undefined', () => {
    const ctx = { state }
    expect(evaluateExpression({ kind: 'arith', op: '*', left: { kind: 'state', path: 'seats' }, right: { kind: 'state', path: 'price' } }, ctx)).toBe(232)
    expect(evaluateExpression({ kind: 'arith', op: '/', left: { kind: 'literal', value: 1 }, right: { kind: 'literal', value: 0 } }, ctx)).toBeUndefined()
    expect(evaluateExpression({ kind: 'arith', op: '+', left: { kind: 'state', path: 'name' }, right: { kind: 'literal', value: 1 } }, ctx)).toBeUndefined()
    expect(evaluateExpression({ kind: 'arith', op: '%', left: { kind: 'literal', value: 7 }, right: { kind: 'literal', value: 3 } }, ctx)).toBe(1)
  })

  it('compare：数字与字符串有序比较', () => {
    const ctx = { state }
    expect(evaluateExpression({ kind: 'compare', op: '>', left: { kind: 'state', path: 'seats' }, right: { kind: 'literal', value: 5 } }, ctx)).toBe(true)
    expect(evaluateExpression({ kind: 'compare', op: '<=', left: { kind: 'state', path: 'name' }, right: { kind: 'literal', value: 'Bob' } }, ctx)).toBe(true)
  })

  it('format：number/currency/percent/date', () => {
    const ctx = { state }
    expect(evaluateExpression({ kind: 'format', as: 'number', decimals: 1, value: { kind: 'literal', value: 1234.567 } }, ctx)).toBe('1,234.6')
    expect(evaluateExpression({ kind: 'format', as: 'currency', value: { kind: 'literal', value: 232 } }, ctx)).toBe('¥232.00')
    expect(evaluateExpression({ kind: 'format', as: 'currency', currency: '$', value: { kind: 'literal', value: 9.5 } }, ctx)).toBe('$9.50')
    expect(evaluateExpression({ kind: 'format', as: 'percent', value: { kind: 'literal', value: 0.42 } }, ctx)).toBe('42.0%')
    expect(evaluateExpression({ kind: 'format', as: 'date', value: { kind: 'literal', value: '2026-11-24T10:00:00Z' } }, ctx)).toBe('2026-11-24')
    expect(evaluateExpression({ kind: 'format', as: 'date', value: { kind: 'literal', value: 'not-a-date' } }, ctx)).toBeUndefined()
  })

  it('length / concat / if / coalesce', () => {
    const ctx = { state }
    expect(evaluateExpression({ kind: 'length', value: { kind: 'state', path: 'tags' } }, ctx)).toBe(2)
    expect(evaluateExpression({ kind: 'length', value: { kind: 'state', path: 'name' } }, ctx)).toBe(3)
    expect(evaluateExpression({
      kind: 'concat',
      values: [{ kind: 'literal', value: '共 ' }, { kind: 'length', value: { kind: 'state', path: 'tags' } }, { kind: 'literal', value: ' 项' }],
    }, ctx)).toBe('共 2 项')
    expect(evaluateExpression({
      kind: 'if',
      cond: { kind: 'compare', op: '>', left: { kind: 'state', path: 'seats' }, right: { kind: 'literal', value: 5 } },
      then: { kind: 'literal', value: '多' },
      else: { kind: 'literal', value: '少' },
    }, ctx)).toBe('多')
    expect(evaluateExpression({
      kind: 'coalesce',
      values: [{ kind: 'state', path: 'none' }, { kind: 'literal', value: '' }, { kind: 'literal', value: '兜底' }],
    }, ctx)).toBe('兜底')
  })

  it('map：列表模板绑定 item/index，非数组得 undefined', () => {
    const ctx = { state }
    const expr: EkkoUIExpression = {
      kind: 'map',
      list: { kind: 'state', path: 'items' },
      item: 'it',
      index: 'i',
      body: {
        kind: 'concat',
        values: [
          { kind: 'var', name: 'i' },
          { kind: 'literal', value: ':' },
          { kind: 'var', name: 'it', path: 'name' },
          { kind: 'literal', value: 'x' },
          { kind: 'var', name: 'it', path: 'qty' },
        ],
      },
    }
    expect(evaluateExpression(expr, ctx)).toEqual(['0:甲x2', '1:乙x3'])
    expect(evaluateExpression({ kind: 'map', list: { kind: 'literal', value: 1 }, item: 'it', body: { kind: 'var', name: 'it' } }, ctx)).toBeUndefined()
  })

  it('object/array：构造结构化值（map 产出 {label,value} 行）', () => {
    const ctx = { state }
    expect(evaluateExpression({
      kind: 'map',
      list: { kind: 'state', path: 'items' },
      item: 'it',
      body: {
        kind: 'object',
        fields: {
          label: { kind: 'var', name: 'it', path: 'name' },
          value: { kind: 'var', name: 'it', path: 'qty' },
        },
      },
    }, ctx)).toEqual([{ label: '甲', value: 2 }, { label: '乙', value: 3 }])
    expect(evaluateExpression({
      kind: 'array',
      values: [{ kind: 'state', path: 'name' }, { kind: 'literal', value: 1 }],
    }, ctx)).toEqual(['Ada', 1])
  })

  it('求值预算：超深链校验期拒绝，DAG 共享子树按访问数拒绝，超限 map 求值返回 undefined', () => {
    // 链式：每层新对象，深度 40 > 32
    let chain: EkkoUIExpression = { kind: 'literal', value: 1 }
    for (let i = 0; i < 40; i++) chain = { kind: 'if', cond: { kind: 'literal', value: true }, then: chain, else: { kind: 'literal', value: 0 } }
    const deepBad = validateSpec(v2Spec({
      root: { id: 't', type: 'text', props: { text: 'x' }, visibleWhen: chain as never },
    }))
    expect(deepBad.ok).toBe(false)
    if (!deepBad.ok) expect(deepBad.errors.some(error => error.code === 'expression.depth')).toBe(true)

    // DAG：同一对象既作 then 又作 else——深度只有 40，但 JSON 序列化与访问路径都是 2^40。
    // 两道防线都必须快速拒绝：byteLength 预算化估算（spec.bytes）与表达式访问预算（expression.steps）。
    // 修复前这里会把校验挂死数小时（DoS 面，本用例即回归守门）
    let dag: EkkoUIExpression = { kind: 'literal', value: 1 }
    for (let i = 0; i < 40; i++) dag = { kind: 'if', cond: { kind: 'literal', value: true }, then: dag, else: dag }
    const started = Date.now()
    const dagBad = validateSpec(v2Spec({
      root: { id: 't', type: 'text', props: { text: 'x' }, visibleWhen: dag as never },
    }))
    expect(Date.now() - started).toBeLessThan(2000)
    expect(dagBad.ok).toBe(false)
    if (!dagBad.ok) {
      expect(dagBad.errors.some(error =>
        error.code === 'spec.bytes' || error.code === 'expression.steps' || error.code === 'expression.depth',
      )).toBe(true)
    }

    const big = evaluateExpression({
      kind: 'map',
      list: { kind: 'literal', value: Array.from({ length: 500 }, (_v, i) => i) },
      item: 'it',
      body: { kind: 'var', name: 'it' },
    }, { state: {} })
    expect(big).toBeUndefined()
  })

  it('v1 spec 拒绝 v2 表达式/部件/动作（不静默降级）', () => {
    const arithInV1 = validateSpec({
      ...v2Spec(),
      protocol: EKKO_UI_PROTOCOL,
      root: {
        id: 'root', type: 'stack',
        children: [{ id: 't', type: 'text', props: { text: 'x' }, visibleWhen: { kind: 'arith', op: '+', left: { kind: 'literal', value: 1 }, right: { kind: 'literal', value: 2 } } as never }],
      },
    })
    expect(arithInV1.ok).toBe(false)
    if (!arithInV1.ok) expect(arithInV1.errors.some(error => error.code === 'expression.unknown')).toBe(true)

    const chartInV1 = validateSpec({
      ...v2Spec(),
      protocol: EKKO_UI_PROTOCOL,
      root: { id: 'c', type: 'chart', props: { kind: 'bar', data: [] } },
    })
    expect(chartInV1.ok).toBe(false)
    if (!chartInV1.ok) expect(chartInV1.errors.some(error => error.code === 'node.type.unknown')).toBe(true)

    const turnInV1 = validateSpec({
      ...v2Spec(),
      protocol: EKKO_UI_PROTOCOL,
      root: {
        id: 'root', type: 'stack',
        children: [{ id: 'b', type: 'button', props: { text: 'x' }, events: { click: { type: 'surface.turn', text: { kind: 'literal', value: 'hi' } } } }],
      },
    })
    expect(turnInV1.ok).toBe(false)
    if (!turnInV1.ok) expect(turnInV1.errors.some(error => error.code === 'action.unknown')).toBe(true)
  })
})

describe('v2 部件目录', () => {
  it('chart：kind 枚举与 data 必填', () => {
    const bad = validateSpec(v2Spec({ root: { id: 'c', type: 'chart', props: { kind: 'radar', data: [] } } }))
    expect(bad.ok).toBe(false)
    const good = validateSpec(v2Spec({
      root: { id: 'c', type: 'chart', props: { kind: 'bar', data: [{ label: '一', value: 3 }], height: 160 } },
    }))
    expect(good.ok).toBe(true)
  })

  it('image：静态 src 走 scheme 白名单', () => {
    for (const src of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://x/y.png']) {
      const result = validateSpec(v2Spec({ root: { id: 'i', type: 'image', props: { src } } }))
      expect(result.ok, src).toBe(false)
    }
    for (const src of ['https://example.com/a.png', 'data:image/png;base64,iVBOR']) {
      const result = validateSpec(v2Spec({ root: { id: 'i', type: 'image', props: { src, alt: '图' } } }))
      expect(result.ok, src).toBe(true)
    }
  })

  it('metric/steps/empty/descriptions 必填与形状', () => {
    expect(validateSpec(v2Spec({ root: { id: 'm', type: 'metric', props: { label: 'x' } } })).ok).toBe(false)
    expect(validateSpec(v2Spec({ root: { id: 'm', type: 'metric', props: { label: '月费', value: 232, unit: '元' } } })).ok).toBe(true)
    expect(validateSpec(v2Spec({ root: { id: 's', type: 'steps', props: { items: [{ title: '一', status: 'done' }] } } })).ok).toBe(true)
    expect(validateSpec(v2Spec({ root: { id: 'e', type: 'empty', props: { text: '暂无数据' } } })).ok).toBe(true)
    expect(validateSpec(v2Spec({ root: { id: 'd', type: 'descriptions', props: { items: [{ label: '甲', value: 1 }] } } })).ok).toBe(true)
  })

  it('tabs 只接受 tab-panel，tab-panel 必须在 tabs 内', () => {
    const orphan = validateSpec(v2Spec({ root: { id: 'p', type: 'tab-panel', props: { label: 'A' } } }))
    expect(orphan.ok).toBe(false)
    const mixed = validateSpec(v2Spec({
      root: {
        id: 'tabs', type: 'tabs',
        children: [
          { id: 'p1', type: 'tab-panel', props: { label: 'A' }, children: [{ id: 't1', type: 'text', props: { text: 'a' } }] },
          { id: 'x', type: 'text', props: { text: 'not a panel' } },
        ],
      },
    }))
    expect(mixed.ok).toBe(false)
    const good = validateSpec(v2Spec({
      root: {
        id: 'tabs', type: 'tabs',
        children: [
          { id: 'p1', type: 'tab-panel', props: { label: 'A' }, children: [{ id: 't1', type: 'text', props: { text: 'a' } }] },
          { id: 'p2', type: 'tab-panel', props: { label: 'B' }, children: [{ id: 't2', type: 'text', props: { text: 'b' } }] },
        ],
      },
    }))
    expect(good.ok).toBe(true)
  })

  it('字符串类属性接受 $state/$template 绑定包装（v2），危险路径拒绝', () => {
    const bound = validateSpec(v2Spec({
      root: { id: 't', type: 'text', props: { text: { $state: 'name' } } },
    }))
    expect(bound.ok).toBe(true)
    const evil = validateSpec(v2Spec({
      root: { id: 't', type: 'text', props: { text: { $state: '__proto__.x' } } },
    }))
    expect(evil.ok).toBe(false)
  })
})

describe('v2 动作', () => {
  it('surface.turn/copy/open_url 校验与出口', () => {
    const ok = validateSpec(v2Spec({
      root: {
        id: 'root', type: 'stack',
        children: [
          { id: 'b1', type: 'button', props: { text: '继续' }, events: { click: { type: 'surface.turn', text: { kind: 'concat', values: [{ kind: 'literal', value: '人数 ' }, { kind: 'state', path: 'seats' }] } } } },
          { id: 'b2', type: 'button', props: { text: '复制' }, events: { click: { type: 'surface.copy', text: { kind: 'state', path: 'name' } } } },
          { id: 'b3', type: 'button', props: { text: '打开' }, events: { click: { type: 'surface.open_url', url: { kind: 'literal', value: 'https://example.com' } } } },
        ],
      },
    }))
    expect(ok.ok).toBe(true)

    const state: EkkoUIState = { seats: 8, name: 'Ada' }
    const turn = applyActions({ type: 'surface.turn', text: { kind: 'concat', values: [{ kind: 'literal', value: '人数 ' }, { kind: 'state', path: 'seats' }] } }, state)
    expect(turn.turn).toEqual({ text: '人数 8' })
    const copy = applyActions({ type: 'surface.copy', text: { kind: 'state', path: 'name' } }, state)
    expect(copy.copy).toEqual({ text: 'Ada' })
    const open = applyActions({ type: 'surface.open_url', url: { kind: 'literal', value: 'https://example.com' } }, state)
    expect(open.openUrl).toEqual({ url: 'https://example.com' })
  })

  it('open_url 出口复验 scheme：javascript: 等被丢弃', () => {
    const state: EkkoUIState = {}
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      const outcome = applyActions({ type: 'surface.open_url', url: { kind: 'literal', value: url } }, state)
      expect(outcome.openUrl, url).toBeUndefined()
    }
    expect(applyActions({ type: 'surface.open_url', url: { kind: 'literal', value: 'mailto:a@b.c' } }, state).openUrl)
      .toEqual({ url: 'mailto:a@b.c' })
  })

  it('tabs.open 只写本地状态，不跨边界', () => {
    const state: EkkoUIState = {}
    const outcome = applyActions({ type: 'tabs.open', nodeId: 'tabs', value: 'p2' }, state)
    expect(outcome).toEqual({})
    expect(state).toEqual({ __tabs: { tabs: 'p2' } })
  })
})

describe('能力协商', () => {
  it('clientCapabilities 返回双协议与按批启用的 features', () => {
    const caps = clientCapabilities()
    expect(caps.protocolVersions).toContain(EKKO_UI_PROTOCOL)
    expect(caps.protocolVersions).toContain(EKKO_UI_PROTOCOL_V2)
    expect(caps.features.blocking).toBe(true)
    expect(caps.features.persistent).toBe(false)
    expect(caps.features.updates).toBe(false)
    expect(caps.features.logicRuntime).toBe(false)
    expect(caps.features.appBlock).toBe(false)
    expect(caps.components.length).toBeGreaterThanOrEqual(38)
  })
})
