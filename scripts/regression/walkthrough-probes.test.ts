import { describe, expect, it } from 'vitest'
import { isBlankContent, isLateRequest, routeReached, routeSettled } from './walkthrough-probes.mjs'

describe('只读走查探针', () => {
  it('加载中或壳层图标页不能误判为内容就绪，canvas 可以无文本', () => {
    expect(isBlankContent({ contentLen: 12, hasVisual: false, loading: true })).toBe(true)
    expect(isBlankContent({ contentLen: 12, hasVisual: false, loading: false })).toBe(true)
    expect(isBlankContent({ contentLen: 0, hasVisual: true, loading: false })).toBe(false)
    expect(isBlankContent({ contentLen: 120, hasVisual: false, loading: false })).toBe(false)
  })

  it('重定向和 canonical 深链必须等浏览器地址与路由状态共同稳定', () => {
    expect(routeSettled({ current: '/app/board', browser: '/app/tasks', expected: '/app/tasks', kind: 'redirect' })).toBe(false)
    expect(routeSettled({ current: '/app/sim', browser: '/app/sim', expected: '/app/tasks', kind: 'redirect' })).toBe(true)
    expect(routeSettled({ current: '/app/board', browser: '/app/history/session/missing', expected: '/app/history/session/missing', kind: 'page', allowCanonical: true })).toBe(false)
    expect(routeSettled({ current: '/app/history', browser: '/app/history', expected: '/app/history/session/missing', kind: 'page', allowCanonical: true })).toBe(true)
    expect(routeSettled({ current: '/app/history/session/missing', browser: '/app/history/session/missing', expected: '/app/history/session/missing', kind: 'page', allowCanonical: true })).toBe(true)
  })

  it('允许页面自写查询参数，并按发起页识别跨页延迟请求', () => {
    expect(routeSettled({
      current: '/hermes/models?modelProfile=default', browser: '/hermes/models?modelProfile=default',
      expected: '/hermes/models', kind: 'page', allowQuery: true,
    })).toBe(true)
    expect(routeSettled({
      current: '/hermes/skills?modelProfile=default', browser: '/hermes/skills?modelProfile=default',
      expected: '/hermes/models', kind: 'page', allowQuery: true,
    })).toBe(false)
    expect(isLateRequest({ origin: 'http://localhost/#/hermes/petdex', pageAtResponse: 'http://localhost/#/hermes/version-preview' })).toBe(true)
    expect(isLateRequest({ origin: 'http://localhost/#/hermes/models', pageAtResponse: 'http://localhost/#/hermes/models?modelProfile=default' })).toBe(false)
  })
})
