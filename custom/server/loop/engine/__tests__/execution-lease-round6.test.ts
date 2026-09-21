// overlay/custom/server/loop/engine/__tests__/execution-lease-round6.test.ts
// R6 执行租约 daemon 形态守门（routa execution-backend 语义）：
// 接管判定（无归属/自己持有/owner 失联到期）/ 续租字段 / leaseAlive / patch 357 漂移。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  canTakeOver, nextLease, leaseAlive, currentInstanceId, LEASE_TTL_MS,
  type LeaseSession,
} from '../execution-lease'

const NOW = 1_700_000_000_000
const ME = 'inst-A'

function sess(over: Partial<LeaseSession>): LeaseSession {
  return { id: 's1', owner_instance_id: '', lease_expires_at: 0, ...over }
}

describe('R6 执行租约（routa execution-backend.ts:54 语义）', () => {
  it('无归属 → 可接管；自己持有 → 可续租；owner 失联到期 → 可接管；owner 未到期 → 不可接管', () => {
    expect(canTakeOver(sess({}), ME, NOW)).toBe(true)
    expect(canTakeOver(sess({ owner_instance_id: ME, lease_expires_at: NOW + 1000 }), ME, NOW)).toBe(true)
    expect(canTakeOver(sess({ owner_instance_id: 'inst-B', lease_expires_at: NOW - 1 }), ME, NOW)).toBe(true)
    expect(canTakeOver(sess({ owner_instance_id: 'inst-B', lease_expires_at: NOW + 5000 }), ME, NOW)).toBe(false)
  })

  it('nextLease：owner=当前实例 + expires=now+300s（routa 同款 TTL）', () => {
    const l = nextLease(ME, NOW)
    expect(l.owner_instance_id).toBe(ME)
    expect(l.lease_expires_at).toBe(NOW + LEASE_TTL_MS)
    expect(LEASE_TTL_MS).toBe(300_000)
  })

  it('leaseAlive：到期判定；currentInstanceId 环境变量优先', () => {
    expect(leaseAlive(sess({ lease_expires_at: NOW + 1 }), NOW)).toBe(true)
    expect(leaseAlive(sess({ lease_expires_at: NOW }), NOW)).toBe(false)
    expect(leaseAlive(sess({ lease_expires_at: NOW - 1 }), NOW)).toBe(false)
    expect(typeof currentInstanceId()).toBe('string')
    expect(currentInstanceId().length).toBeGreaterThan(0)
  })

  it('接管流程：owner 失联 → 他人接管 → 新租约归接管者', () => {
    const stale = sess({ owner_instance_id: 'inst-B', lease_expires_at: NOW - 100 })
    expect(canTakeOver(stale, ME, NOW)).toBe(true)
    const l = nextLease(ME, NOW)
    const after = sess({ ...stale, ...l })
    expect(after.owner_instance_id).toBe(ME)
    expect(canTakeOver(after, 'inst-C', NOW)).toBe(false) // 新 owner 未到期，C 不可抢
  })
})

describe('patch 357 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../../..')

  it('357 含两列 schema 变更；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/357-server-sessions-lease-schema.patch'), 'utf8')
    expect(patch).toContain('owner_instance_id')
    expect(patch).toContain('lease_expires_at')
    expect(patch).toContain('database/schemas.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('357-server-sessions-lease-schema.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('357-server-sessions-lease-schema.patch')
  })
})
