// 真机集成（验收条款：对真实网关四采集面实测）。默认跳过——RUN_REAL=1 且
// HERMES_HOME 指向真实部署时跑（如推演 SIM_ROOT/hermes）。
import { describe, expect, it } from 'vitest'
import { ClusterInspector } from '../inspector'

const run = process.env.RUN_REAL === '1'

describe.skipIf(!run)('cluster-inspector 真机采集（RUN_REAL=1）', () => {
  it('四采集面 fail-soft 且网关面出真值', async () => {
    const insp = new ClusterInspector({})
    const outcome = await insp.runOnce()
    expect(outcome.error).toBeUndefined()
    const snap = insp.snapshot!
    expect(snap.sessions.ok).toBe(true)
    expect(snap.profiles.ok).toBe(true)
    expect(snap.gateway.state || snap.gateway.probe).toBeTruthy()
    // 真机可能查出真异常（如槽位膨胀/卡死）——只断言结构不判值
    for (const a of outcome.anomalies) expect(a).toHaveProperty('summary')
  }, 30_000)
})
