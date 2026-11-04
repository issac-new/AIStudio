// overlay/custom/client/projects/__tests__/projects-api.test.ts
// 项目工作流客户端纯断言面：api 层（URL 拼接/参数序列化/422 problems 透传/
// 409 文案透传，mock authFetch）+ utils 纯函数（状态徽标 class 映射、按钮
// 禁用矩阵、byStatus 分布行与占比、timeline 倒序）。视图挂载面不在本文件
// （E2E 面随 simharness 走查），此处只锁契约形状。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetchMock = vi.fn()
vi.mock('../../shared/http', () => ({ authFetch: (...args: unknown[]) => authFetchMock(...args) }))

const { fetchProjects, fetchProject, setProjectPaused, completeProject, isProjectActionError } = await import('../api/projects')
const {
  statusBadgeClass, statusLabel, actionAvailability,
  distributionRows, distributionSegments, timelineDescending,
} = await import('../utils')

/** Response 形状桩（api 层只消费 ok/status/json/text） */
function res(status: number, body?: unknown, raw?: string): {
  ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string>
} {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body))
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (body ?? {}),
    text: async () => text,
  }
}

beforeEach(() => { authFetchMock.mockReset() })

describe('api：列表与详情（GET）', () => {
  it('fetchProjects 命中列表端点并透传数组', async () => {
    const projects = [{ id: 'p1', status: 'active', taskStats: { total: 3, byStatus: { todo: 3 } } }]
    authFetchMock.mockResolvedValue(res(200, { ok: true, projects }))
    const out = await fetchProjects()
    expect(out).toEqual(projects)
    expect(authFetchMock).toHaveBeenCalledTimes(1)
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects')
  })

  it('fetchProjects 缺席字段回落空数组（fail-soft）；ok:false 抛错', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await expect(fetchProjects()).resolves.toEqual([])
    authFetchMock.mockResolvedValue(res(200, { ok: false }))
    await expect(fetchProjects()).rejects.toThrow('项目列表获取失败')
  })

  it('fetchProject 拼详情 URL 且 id 走 encodeURIComponent', async () => {
    const project = { id: 'p 1', status: 'paused', taskStats: { total: 0, byStatus: {} }, timeline: [], unfinished: [] }
    authFetchMock.mockResolvedValue(res(200, { ok: true, project }))
    await expect(fetchProject('p 1')).resolves.toEqual(project)
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects/p%201')
  })

  it('非 2xx 非 JSON 响应按 json() 包装形态抛「路径 → 状态：正文」', async () => {
    authFetchMock.mockResolvedValue(res(502, undefined, 'bad gateway'))
    await expect(fetchProjects()).rejects.toThrow('/api/projectworkflow/projects → 502：bad gateway')
  })
})

describe('api：暂停/恢复（POST pause|resume）', () => {
  it('paused=true/false 分别命中 pause/resume 端点并返回 project 快照', async () => {
    const project = { id: 'p1', status: 'paused', taskStats: { total: 1, byStatus: { todo: 1 } } }
    authFetchMock.mockResolvedValue(res(200, { ok: true, project }))
    await expect(setProjectPaused('p1', true)).resolves.toEqual(project)
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects/p1/pause')
    expect(authFetchMock.mock.calls[0][1]).toEqual({ method: 'POST' })
    await setProjectPaused('p1', false)
    expect(authFetchMock.mock.calls[1][0]).toBe('/api/projectworkflow/projects/p1/resume')
  })

  it('恢复已完成项目 → 409 ProjectActionError 透传服务端 error 文案', async () => {
    authFetchMock.mockResolvedValue(res(409, { ok: false, error: '项目已完成，不能恢复' }))
    await expect(setProjectPaused('p1', false)).rejects.toMatchObject({
      name: 'ProjectActionError', status: 409, message: '项目已完成，不能恢复', problems: [],
    })
  })

  it('响应缺 project 抛错（契约违约不猜形状）', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await expect(setProjectPaused('p1', true)).rejects.toThrow('pause 响应缺少 project')
  })
})

describe('api：完成（POST complete + override 序列化）', () => {
  it('无豁免不带 query', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await expect(completeProject('p1')).resolves.toBeUndefined()
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects/p1/complete')
  })

  it('豁免理由序列化 override=true&reason=<encoded>（含特殊字符）', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await completeProject('p 1', '遗留收口 & 记录')
    expect(authFetchMock.mock.calls[0][0]).toBe(
      '/api/projectworkflow/projects/p%201/complete?override=true&reason=%E9%81%97%E7%95%99%E6%94%B6%E5%8F%A3%20%26%20%E8%AE%B0%E5%BD%95',
    )
  })

  it('空白理由不发起豁免（不带 query）', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await completeProject('p1', '   ')
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects/p1/complete')
  })

  it('422 未终结任务 → ProjectActionError.problems 原样透传', async () => {
    const problems = [
      { id: 't1', status: 'todo', title: '补文档', board: 'docs' },
      { id: 't2', status: 'review', title: '', board: 'dev' },
    ]
    authFetchMock.mockResolvedValue(res(422, { ok: false, error: '存在未终结任务', problems }))
    let caught: unknown
    try { await completeProject('p1') } catch (e) { caught = e }
    expect(isProjectActionError(caught)).toBe(true)
    const err = caught as { status: number; message: string; problems: unknown[] }
    expect(err.status).toBe(422)
    expect(err.message).toBe('存在未终结任务')
    expect(err.problems).toEqual(problems)
  })

  it('非 JSON 错误体不炸：原文进 message、problems 空', async () => {
    authFetchMock.mockResolvedValue(res(500, undefined, 'boom'))
    await expect(completeProject('p1')).rejects.toMatchObject({
      name: 'ProjectActionError', status: 500, problems: [],
    })
  })
})

describe('utils：状态徽标 class 映射', () => {
  it('三态各得各 class；文案 zh/en', () => {
    expect(statusBadgeClass('active')).toBe('prj-badge--active')
    expect(statusBadgeClass('paused')).toBe('prj-badge--paused')
    expect(statusBadgeClass('completed')).toBe('prj-badge--completed')
    expect(statusLabel('active', 'zh')).toBe('进行中')
    expect(statusLabel('paused', 'en')).toBe('Paused')
    expect(statusLabel('completed', 'zh')).toBe('已完成')
  })
})

describe('utils：操作按钮禁用矩阵', () => {
  it('pause 仅 active；resume 仅 paused；complete 非 completed', () => {
    expect(actionAvailability('active')).toEqual({ pause: true, resume: false, complete: true })
    expect(actionAvailability('paused')).toEqual({ pause: false, resume: true, complete: true })
    expect(actionAvailability('completed')).toEqual({ pause: false, resume: false, complete: false })
  })
})

describe('utils：byStatus 分布', () => {
  it('计数降序、同数按状态字典序（确定序）', () => {
    expect(distributionRows({ todo: 2, review: 5, doing: 2, blocked: 9 }))
      .toEqual([
        { status: 'blocked', count: 9 },
        { status: 'review', count: 5 },
        { status: 'doing', count: 2 },
        { status: 'todo', count: 2 },
      ])
  })

  it('share=count/total；total=0 全 0 不猜分布', () => {
    expect(distributionSegments({ total: 4, byStatus: { todo: 1, done: 3 } })).toEqual([
      { status: 'done', count: 3, share: 0.75 },
      { status: 'todo', count: 1, share: 0.25 },
    ])
    expect(distributionSegments({ total: 0, byStatus: { todo: 0 } }))
      .toEqual([{ status: 'todo', count: 0, share: 0 }])
  })
})

describe('utils：timeline 倒序', () => {
  it('at 降序、同刻稳定保序、不变异入参', () => {
    const a = { at: 3, kind: 'paused' }
    const b = { at: 5, kind: 'resumed' }
    const c = { at: 3, kind: 'note', detail: 'x' }
    const input = [a, b, c]
    expect(timelineDescending(input)).toEqual([b, a, c])
    expect(input).toEqual([a, b, c])
  })
})
