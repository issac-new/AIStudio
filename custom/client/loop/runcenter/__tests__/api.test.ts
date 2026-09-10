// overlay/custom/client/loop/runcenter/__tests__/api.test.ts
// runcenter REST 封装守门测试（P3 台账 #25 / #30）：
// - getSpec 切到 GET /api/graph/specs/:id（不再列表端 client 侧 find），404 → null
// - exportRun 打包端点：GET /api/graph/runs/:id/export
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  request: (...args: unknown[]) => requestMock(...args),
  getApiKey: () => 'test-key',
  getBaseUrlValue: () => '',
}))

import { runRest } from '../api'

const notFound = (): Error => Object.assign(new Error('API Error 404: Not Found'), { status: 404 })

describe('runRest.getSpec (P3 台账 #25)', () => {
  beforeEach(() => { requestMock.mockReset() })

  it('hits /api/graph/specs/:id and unwraps {id, version, spec} → spec', async () => {
    const spec = { id: 'loop-1', nodes: [], edges: [], entryNode: 'discovery' }
    requestMock.mockResolvedValue({ id: 'loop-1', version: 1, spec })
    const got = await runRest.getSpec('loop-1')
    expect(requestMock).toHaveBeenCalledWith('/api/graph/specs/loop-1')
    expect(got).toEqual(spec)
  })

  it('encodes the id in the path', async () => {
    requestMock.mockResolvedValue({ id: 'loop/a', version: 1, spec: {} })
    await runRest.getSpec('loop/a')
    expect(requestMock).toHaveBeenCalledWith('/api/graph/specs/loop%2Fa')
  })

  it('maps 404 to null (spec unregistered is a legal absence)', async () => {
    requestMock.mockRejectedValue(notFound())
    await expect(runRest.getSpec('nope')).resolves.toBeNull()
  })

  it('rethrows non-404 errors (network/5xx must not masquerade as missing spec)', async () => {
    requestMock.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    await expect(runRest.getSpec('x')).rejects.toThrow('boom')
  })
})

describe('runRest.exportRun (P3 台账 #30)', () => {
  beforeEach(() => { requestMock.mockReset() })

  it('hits /api/graph/runs/:id/export and returns the bundle', async () => {
    const bundle = { run: { instance: { status: 'completed' } }, spec: { id: 'g' }, events: [{ kind: 'run.started' }] }
    requestMock.mockResolvedValue(bundle)
    const got = await runRest.exportRun('run-g1-1')
    expect(requestMock).toHaveBeenCalledWith('/api/graph/runs/run-g1-1/export')
    expect(got).toEqual(bundle)
  })
})
