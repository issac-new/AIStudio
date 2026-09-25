// Worker 抽象守门（routa：五态心跳推进/capability 路由/三环境）。
import { describe, it, expect } from 'vitest'
import { workerHealth, workerRoutable, type WorkerFacts } from '../worker-abstraction'

const w = (over: Partial<WorkerFacts> = {}): WorkerFacts => ({
  workerId: 'w1', env: 'local', capabilities: ['run', 'net'], lastHeartbeatAgoMs: 1000, ...over,
})

describe('健康状态机（routa 心跳推进）', () => {
  it('五态按心跳 30s/90s/300s 推进', () => {
    expect(workerHealth(w({ lastHeartbeatAgoMs: null }))).toBe('registered')
    expect(workerHealth(w())).toBe('healthy')
    expect(workerHealth(w({ lastHeartbeatAgoMs: 60_000 }))).toBe('suspect')
    expect(workerHealth(w({ lastHeartbeatAgoMs: 120_000 }))).toBe('unhealthy')
    expect(workerHealth(w({ lastHeartbeatAgoMs: 400_000 }))).toBe('dead')
  })

  it('capability 路由：全含才可派；healthy/suspect 可派；dead 不可', () => {
    expect(workerRoutable(w(), ['run'])).toBe(true)
    expect(workerRoutable(w(), ['run', 'gpu'])).toBe(false)  // 缺 gpu
    expect(workerRoutable(w({ lastHeartbeatAgoMs: 60_000 }), ['run'])).toBe(true)  // suspect 可派
    expect(workerRoutable(w({ lastHeartbeatAgoMs: 400_000 }), ['run'])).toBe(false)  // dead 不可
    expect(workerRoutable(w({ env: 'docker' }), ['run'])).toBe(true)  // 三环境同判
  })
})
