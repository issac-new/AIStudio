// @vitest-environment node
// overlay/custom/client/chat/ekko-ui/__tests__/protocol.test.ts
// 协议核心守门：白名单、路径安全、表达式/动作 reducer、工具消息解析。
import { describe, expect, it } from 'vitest'
import {
  EKKO_UI_PROTOCOL,
  applyActions,
  evaluateExpression,
  extractSurfaceSpec,
  getStateValue,
  isSafeStatePath,
  isSurfaceToolName,
  parseSurfaceToolResult,
  setStateValue,
  surfaceIdFor,
  validateSpec,
  type EkkoUISpec,
  type EkkoUIState,
} from '../protocol'

function baseSpec(overrides: Partial<EkkoUISpec> = {}): EkkoUISpec {
  return {
    protocol: EKKO_UI_PROTOCOL,
    surfaceId: 'trip-form',
    title: '预订',
    fallbackText: '两天两人行程，需要你选择日期与时间。',
    state: { date: '', party: 2 },
    root: {
      id: 'root',
      type: 'form',
      children: [
        { id: 'title', type: 'heading', props: { text: '预订信息', level: 3 } },
        {
          id: 'date-field',
          type: 'field',
          props: { label: '日期', required: true },
          children: [{ id: 'date', type: 'date', bind: 'date', props: { required: true } }],
        },
        { id: 'people', type: 'number', bind: 'party', props: { min: 1, max: 8 } },
        {
          id: 'submit',
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

describe('validateSpec（白名单与安全）', () => {
  it('接受带表单/输入/按钮的完整 spec', () => {
    const result = validateSpec(baseSpec())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec.surfaceId).toBe('trip-form')
  })

  it('未知组件拒绝（不静默降级）', () => {
    const spec = baseSpec()
    ;(spec.root.children as any[]).push({ id: 'html', type: 'raw-html', props: { html: '<b>x</b>' } })
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(error => error.code === 'node.type.unknown')).toBe(true)
  })

  it('未知属性拒绝', () => {
    const spec = baseSpec()
    ;(spec.root.children as any[])[1].props.onclick = 'alert(1)'
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(error => error.code === 'prop.unknown')).toBe(true)
  })

  it('重复节点 id 拒绝', () => {
    const spec = baseSpec()
    ;(spec.root.children as any[]).push({ id: 'title', type: 'text', props: { text: '重复' } })
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(error => error.code === 'node.id.duplicate')).toBe(true)
  })

  it('原型污染路径拒绝', () => {
    const spec = baseSpec()
    ;(spec.root.children as any[])[2].bind = '__proto__.polluted'
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    expect(isSafeStatePath('__proto__.polluted')).toBe(false)
    expect(isSafeStatePath('form.name')).toBe(true)
  })

  it('未知动作与非法 actionId 拒绝', () => {
    const spec = baseSpec()
    ;(spec.root.children as any[])[3].events = { click: { type: 'eval', code: 'alert(1)' } }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(error => error.code === 'action.unknown')).toBe(true)

    const spec2 = baseSpec()
    ;(spec2.root.children as any[])[3].events = {
      click: { type: 'surface.submit', actionId: '../x', payload: { kind: 'literal', value: 1 } },
    }
    const result2 = validateSpec(spec2)
    expect(result2.ok).toBe(false)
    if (!result2.ok) expect(result2.errors.some(error => error.code === 'action.actionId')).toBe(true)
  })

  it('深度/节点数与字符串上限', () => {
    let node: any = { id: 'leaf', type: 'text', props: { text: 'x' } }
    for (let i = 0; i < 20; i++) node = { id: `n${i}`, type: 'box', children: [node] }
    const result = validateSpec(baseSpec({ root: node }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(error => error.code === 'depth.limit')).toBe(true)

    const longText = validateSpec(baseSpec({
      root: { id: 't', type: 'text', props: { text: 'x'.repeat(5000) } },
    }))
    expect(longText.ok).toBe(false)
  })

  it('选项必须是 1-50 项且带 label', () => {
    const bad = validateSpec(baseSpec({
      root: { id: 'r', type: 'radio', bind: 'pick', props: { options: [{ nope: 1 }] } },
    }))
    expect(bad.ok).toBe(false)
    const good = validateSpec(baseSpec({
      root: { id: 'r', type: 'radio', bind: 'pick', props: { options: ['A', { label: 'B', value: 'b' }] } },
    }))
    expect(good.ok).toBe(true)
  })

  it('style 只允许枚举字段', () => {
    const result = validateSpec(baseSpec({
      root: { id: 'root', type: 'card', style: { background: 'url(javascript:1)' } as any },
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some(error => error.code === 'style.unknown')).toBe(true)
  })
})

describe('state / expression / action', () => {
  const state: EkkoUIState = { profile: { name: 'Ada', age: 36 }, tags: ['a'], active: false }

  it('路径读写与嵌套创建', () => {
    expect(getStateValue(state, 'profile.name')).toBe('Ada')
    setStateValue(state, 'profile.city', 'Paris')
    expect(getStateValue(state, 'profile.city')).toBe('Paris')
    setStateValue(state, '__proto__.polluted', 'x')
    expect(({} as any).polluted).toBeUndefined()
  })

  it('表达式：state/equals/and/not', () => {
    expect(evaluateExpression({ kind: 'state', path: 'profile.age' }, { state })).toBe(36)
    expect(evaluateExpression({
      kind: 'and',
      values: [
        { kind: 'equals', left: { kind: 'state', path: 'profile.name' }, right: { kind: 'literal', value: 'Ada' } },
        { kind: 'not', value: { kind: 'state', path: 'active' } },
      ],
    }, { state })).toBe(true)
  })

  it('本地动作：set/toggle/append/remove 与 submit', () => {
    const draft: EkkoUIState = { name: '', active: false, tags: ['a'] }
    applyActions({ type: 'state.set', path: 'name', value: { kind: 'literal', value: 'Lin' } }, draft)
    applyActions({ type: 'state.toggle', path: 'active' }, draft)
    applyActions({ type: 'array.append', path: 'tags', value: { kind: 'literal', value: 'b' } }, draft)
    applyActions({ type: 'array.remove', path: 'tags', index: { kind: 'literal', value: 0 } }, draft)
    expect(draft).toEqual({ name: 'Lin', active: true, tags: ['b'] })

    const outcome = applyActions({
      type: 'surface.submit', actionId: 'ok', payload: { kind: 'state', path: '' },
    }, draft)
    expect(outcome.submit?.actionId).toBe('ok')
    expect(outcome.submit?.payload).toEqual(draft)
  })
})

describe('工具消息桥接', () => {
  it('识别带 MCP 前缀的工具名', () => {
    expect(isSurfaceToolName('show_surface')).toBe(true)
    expect(isSurfaceToolName('ekko_studio_show_surface')).toBe(true)
    expect(isSurfaceToolName('mcp__ekko-studio-interaction__ekko_studio_show_surface')).toBe(true)
    expect(isSurfaceToolName('clarify')).toBe(false)
  })

  it('从字符串化参数与嵌套 arguments 中取 spec', () => {
    const spec = baseSpec()
    expect(extractSurfaceSpec({ spec }).spec).toEqual(spec)
    expect(extractSurfaceSpec(JSON.stringify({ arguments: JSON.stringify({ spec }) })).spec).toEqual(spec)
    expect(extractSurfaceSpec(JSON.stringify({ spec })).spec).toEqual(spec)
  })

  it('解析提交结果（含嵌套 result 与错误）', () => {
    expect(parseSurfaceToolResult(JSON.stringify({ status: 'submitted', surface_id: 'srf:1:x', revision: 1, payload: { a: 1 } })))
      .toEqual({ status: 'submitted', surfaceId: 'srf:1:x', revision: 1, payload: { a: 1 }, actionId: undefined, reason: undefined, error: undefined })
    expect(parseSurfaceToolResult(JSON.stringify({ ok: true, result: { status: 'cancelled', reason: 'timed_out' } }))?.status).toBe('cancelled')
    expect(parseSurfaceToolResult(JSON.stringify({ error: 'boom' }))?.error).toBe('boom')
    expect(parseSurfaceToolResult('not json')).toBeNull()
  })

  it('surface_id 公式稳定', () => {
    expect(surfaceIdFor('s1', 'trip')).toBe('srf:s1:trip')
  })
})
