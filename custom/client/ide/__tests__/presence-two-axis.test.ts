// 在场两维守门（multica：availability×workload 分离；在线但闲/离线但忙可分）。
import { describe, it, expect } from 'vitest'
import { presenceTwoAxis } from '../utils/presence-two-axis'

describe('两维分离（multica presence 语义）', () => {
  it('心跳阈值三档（30s/90s）；负载三档（working>queued>idle）', () => {
    expect(presenceTwoAxis({ lastHeartbeatAgoMs: 1000, running: 1, queued: 0 })).toMatchObject({ availability: 'online', workload: 'working' })
    expect(presenceTwoAxis({ lastHeartbeatAgoMs: 50_000, running: 0, queued: 2 })).toMatchObject({ availability: 'unstable', workload: 'queued' })
    expect(presenceTwoAxis({ lastHeartbeatAgoMs: 200_000, running: 0, queued: 0 })).toMatchObject({ availability: 'offline', workload: 'idle' })
    expect(presenceTwoAxis({ lastHeartbeatAgoMs: null, running: 0, queued: 0 }).availability).toBe('offline')
  })

  it('两维可独立组合：离线但队里有活/在线但闲——一眼可分', () => {
    const offlineBusy = presenceTwoAxis({ lastHeartbeatAgoMs: 300_000, running: 0, queued: 5 })
    expect(offlineBusy).toMatchObject({ availability: 'offline', workload: 'queued', combo: 'offline-queued' })
    const onlineIdle = presenceTwoAxis({ lastHeartbeatAgoMs: 500, running: 0, queued: 0 })
    expect(onlineIdle.combo).toBe('online-idle')
  })
})
