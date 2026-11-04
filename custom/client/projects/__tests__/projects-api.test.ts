// overlay/custom/client/projects/__tests__/projects-api.test.ts
// 项目工作流客户端纯断言面：api 层（URL 拼接/参数序列化/422 problems 透传/
// 409 文案透传，mock authFetch）+ utils 纯函数（状态徽标 class 映射、按钮
// 禁用矩阵、byStatus 分布行与占比、timeline 倒序）。视图挂载面不在本文件
// （E2E 面随 simharness 走查），此处只锁契约形状。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetchMock = vi.fn()
vi.mock('../../shared/http', () => ({ authFetch: (...args: unknown[]) => authFetchMock(...args) }))

const { fetchProjects, fetchProject, setProjectPaused, completeProject, isProjectActionError, fetchProjectGraph, fetchMermaidBrand } = await import('../api/projects')
const {
  statusBadgeClass, statusLabel, actionAvailability,
  distributionRows, distributionSegments, timelineDescending,
  TOPOLOGY_PANEL_INITIAL, topologyPanelNext, topologyNeedsLoad,
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

describe('api：项目拓扑（GET graph JSON / mermaid 源）', () => {
  const graph = {
    projectId: 'p1', projectStatus: 'active',
    nodes: [{ id: 't1', title: 'A', status: 'todo', board: 'default' }],
    edges: [], next: ['t1'], interrupts: [],
  }

  it('默认 JSON：命中 graph 端点并透传四元投影', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true, graph }))
    await expect(fetchProjectGraph('p1')).resolves.toEqual(graph)
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects/p1/graph')
  })

  it("format='mermaid' → 带 query 且 res.text() 直取（非 JSON 端点不走 json 包装）", async () => {
    authFetchMock.mockResolvedValue(res(200, undefined, 'graph TD\n  T0["A"]'))
    await expect(fetchProjectGraph('p1', 'mermaid')).resolves.toBe('graph TD\n  T0["A"]')
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/projectworkflow/projects/p1/graph?format=mermaid')
  })

  it('非 2xx / ok:false / 缺 graph 均抛错（fail-soft 只留给字段，不留给契约）', async () => {
    authFetchMock.mockResolvedValue(res(500, undefined, 'boom'))
    await expect(fetchProjectGraph('p1')).rejects.toThrow('项目拓扑获取失败')
    authFetchMock.mockResolvedValue(res(200, { ok: false }))
    await expect(fetchProjectGraph('p1')).rejects.toThrow('项目拓扑获取失败')
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await expect(fetchProjectGraph('p1')).rejects.toThrow('项目拓扑获取失败')
  })
})

describe('api：mermaid 品牌渲染（POST mermaid-brand）', () => {
  it('请求体 {source, title?} POST 到品牌端点，响应原样透传（ok:false 不抛）', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true, html: '<!doctype html>…', kind: 'flowchart' }))
    await expect(fetchMermaidBrand('graph TD', '项目任务拓扑')).resolves.toEqual({
      ok: true, html: '<!doctype html>…', kind: 'flowchart',
    })
    const call = authFetchMock.mock.calls[0]
    expect(call[0]).toBe('/api/hermes/diagram/mermaid-brand')
    expect(call[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ source: 'graph TD', title: '项目任务拓扑' }) })

    // 服务端提取失败=HTTP 200 + ok:false（契约在 body 不在状态码），透传给视图回退。
    authFetchMock.mockResolvedValue(res(200, { ok: false, reason: 'unsupported_kind' }))
    await expect(fetchMermaidBrand('graph TD')).resolves.toMatchObject({ ok: false, reason: 'unsupported_kind' })
    expect(authFetchMock.mock.calls[1][1]).toMatchObject({ body: JSON.stringify({ source: 'graph TD' }) })
  })

  it('非 2xx（如 invalid_source 400）抛错', async () => {
    authFetchMock.mockResolvedValue(res(400, { ok: false, error: 'source 必填' }))
    await expect(fetchMermaidBrand('')).rejects.toThrow('mermaid 品牌渲染请求失败')
  })
})

describe('utils：拓扑折叠区状态机', () => {
  it('toggle 只翻 open 不丢已加载内容；再展开不重拉（needsLoad 仅 idle+open）', () => {
    let s = topologyPanelNext(TOPOLOGY_PANEL_INITIAL, { type: 'toggle' })
    expect(s).toEqual({ open: true, status: 'idle' })
    expect(topologyNeedsLoad(s)).toBe(true)

    s = topologyPanelNext(s, { type: 'load-start', source: 'graph TD' })
    expect(s).toEqual({ open: true, status: 'loading', source: 'graph TD' })
    expect(topologyNeedsLoad(s)).toBe(false)

    s = topologyPanelNext(s, { type: 'load-ok', html: '<html></html>' })
    expect(s).toEqual({ open: true, status: 'ok', source: 'graph TD', html: '<html></html>' })

    s = topologyPanelNext(s, { type: 'toggle' })
    expect(s).toMatchObject({ open: false, status: 'ok', html: '<html></html>' })
    expect(topologyNeedsLoad(s)).toBe(false)

    s = topologyPanelNext(s, { type: 'toggle' })
    expect(s).toMatchObject({ open: true, status: 'ok', html: '<html></html>' })
    expect(topologyNeedsLoad(s)).toBe(false) // 已加载：不重拉
  })

  it('fallback 保源文本（内容不丢）清 html；error 记 note', () => {
    let s = topologyPanelNext({ open: true, status: 'loading', source: 'graph TD', html: 'stale' }, { type: 'load-fallback', source: 'graph TD', note: '不支持' })
    expect(s).toEqual({ open: true, status: 'fallback', source: 'graph TD', html: undefined, note: '不支持' })
    s = topologyPanelNext(s, { type: 'load-error', note: '网络失败' })
    expect(s).toMatchObject({ status: 'error', note: '网络失败' })
    expect(s.html).toBeUndefined()
  })
})
