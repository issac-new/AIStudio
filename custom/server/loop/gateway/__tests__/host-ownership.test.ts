import { describe, expect, it } from 'vitest'
import { gatewayStatusLooksHostOwned } from '../host-ownership'

describe('gateway host 占用检测（host-gateway-ownership：他人 gateway 占 host 不服务本 profile）', () => {
  it('host 守卫报"不服务本 profile"→ 判 host-owned（须 --force，不得误当在跑）', () => {
    const out = "A gateway already owns this host and will not serve profile 'bella'. PID 65060 (launched by profile 'orchestrator')"
    expect(gatewayStatusLooksHostOwned(out)).toBe(true)
  })
  it('自身 runtime lock（同 profile 重复启动）→ 非 host-owned（是合法幂等）', () => {
    expect(gatewayStatusLooksHostOwned(
      'Gateway runtime lock is already held by another instance. Exiting.',
    )).toBe(false)
  })
  it('纯在跑状态 → 非 host-owned', () => {
    expect(gatewayStatusLooksHostOwned('Gateway is running')).toBe(false)
  })
  it('大小写不敏感', () => {
    expect(gatewayStatusLooksHostOwned("A GATEWAY ALREADY OWNS THIS HOST and will not serve profile 'x'")).toBe(true)
  })
})
