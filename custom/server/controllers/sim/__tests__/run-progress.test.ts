// overlay/custom/server/controllers/sim/__tests__/run-progress.test.ts
// run-progress 端点守门（2026-10-04 三件套③）：契约解析（harness JSON 形态→产品形态）、
// 坏载荷/缺字段拒绝、端点路由注册与 fail-soft 空态（缺文件=ok:false 不抛）。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseRunProgress, runProgressPath, createSimRunRouter } from '../run-progress'

const validRaw = JSON.stringify({
  run_id: '20261004-v7-run8', done: 11, total: 26,
  done_steps: ['smoke', 'appinit', 'plan'], updated_ts: 1791106836,
})

describe('sim run-progress（后台感知③）', () => {
  it('解析 harness 契约形态（snake_case → camelCase）', () => {
    const r = parseRunProgress(validRaw)
    expect(r).toEqual({
      runId: '20261004-v7-run8', done: 11, total: 26,
      doneSteps: ['smoke', 'appinit', 'plan'], updatedTs: 1791106836,
    })
  })

  it('坏载荷拒收：非 JSON / 缺 run_id / 非法 total', () => {
    expect(parseRunProgress('not json')).toBeNull()
    expect(parseRunProgress(JSON.stringify({ done: 1, total: 2, updated_ts: 1 }))).toBeNull()
    expect(parseRunProgress(JSON.stringify({ run_id: 'x', done: 1, total: 0, updated_ts: 1 }))).toBeNull()
  })

  it('runProgressPath 随 HERMES_HOME 覆盖（SIM studio 注入的根）', () => {
    expect(runProgressPath('/sim/hermes')).toBe('/sim/hermes/run-progress.json')
  })

  it('端点 fail-soft：缺文件→{ok:false,run:null} 不抛；文件在→ok:true+staleMin', async () => {
    const router: any = createSimRunRouter()
    const layer = router.stack.find((l: any) => l.path === '/api/sim/run-progress')
    expect(layer, '路由应注册于 /api/sim/run-progress').toBeTruthy()
    const handler = layer.stack[layer.stack.length - 1]

    const home = mkdtempSync(join(tmpdir(), 'simrun-'))
    process.env.HERMES_HOME = home
    try {
      const ctxEmpty: any = { body: undefined }
      await handler(ctxEmpty)
      expect(ctxEmpty.body.ok).toBe(false)
      expect(ctxEmpty.body.run).toBeNull()

      writeFileSync(join(home, 'run-progress.json'), validRaw, 'utf8')
      const ctxHit: any = { body: undefined }
      await handler(ctxHit)
      expect(ctxHit.body.ok).toBe(true)
      expect(ctxHit.body.run.runId).toBe('20261004-v7-run8')
      expect(ctxHit.body.run.doneSteps).toEqual(['smoke', 'appinit', 'plan'])
      expect(ctxHit.body.run.staleMin).toBeGreaterThanOrEqual(0)
    } finally {
      delete process.env.HERMES_HOME
      rmSync(home, { recursive: true, force: true })
    }
  })
})
