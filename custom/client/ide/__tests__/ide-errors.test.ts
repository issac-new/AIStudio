// @vitest-environment node
// IDE 错误分级守门：状态码/网络/引擎离线/超时都映射成人话与级别。
import { describe, it, expect } from 'vitest'
import { classifyIdeStatus, friendlyIdeError, ideErrorFrom } from '../utils/ideErrors'

describe('ideErrors', () => {
  it('状态码分级：401/403/404/503/500', () => {
    expect(classifyIdeStatus(401)).toMatchObject({ kind: 'auth', severity: 'error' })
    expect(classifyIdeStatus(403)).toMatchObject({ kind: 'forbidden', severity: 'warn' })
    expect(classifyIdeStatus(404)).toMatchObject({ kind: 'not-found', severity: 'warn' })
    expect(classifyIdeStatus(503)).toMatchObject({ kind: 'unavailable', severity: 'warn' })
    expect(classifyIdeStatus(500)).toMatchObject({ kind: 'server', severity: 'error' })
  })

  it('错误对象带 status：优先按状态码', () => {
    expect(ideErrorFrom(Object.assign(new Error('boom'), { status: 403 })).kind).toBe('forbidden')
  })

  it('消息内嵌 http_401（工作流 getJson 形态）', () => {
    expect(friendlyIdeError(new Error('http_401: unauthorized'))).toContain('登录态')
  })

  it('引擎离线/超时/网络/非 Git 仓库', () => {
    expect(ideErrorFrom(new Error('engine_unreachable: connect ECONNREFUSED 127.0.0.1:3030')))
      .toMatchObject({ kind: 'unavailable', severity: 'warn' })
    expect(ideErrorFrom(new Error('Request timeout'))).toMatchObject({ kind: 'timeout' })
    expect(ideErrorFrom(new Error('Failed to fetch'))).toMatchObject({ kind: 'network' })
    expect(ideErrorFrom(Object.assign(new Error('not repo'), { code: 'not_a_repo' })))
      .toMatchObject({ kind: 'not-found', severity: 'warn' })
  })

  it('未知错误保留原始消息', () => {
    expect(friendlyIdeError(new Error('自定义失败'), '兜底')).toBe('自定义失败')
  })
})
