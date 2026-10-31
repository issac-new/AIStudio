// 补丁 716 落地守门（2026-10-31 未做项收口）：kanban 写路径的 profile 可见性只对
// super_admin 放开；admin 仍受 profile 约束。上游测试
// "prevents profile-scoped users from mutating hidden tasks" 已锁行为，本测试在
// 根套件（custom/**）里锁注入态源码，防 series 漂移后根测试无感。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CTRL = resolve(__dirname, '../../vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban.ts')

describe('补丁 716：kanban 写路径 admin 仍受 profile 约束', () => {
  it('authorizeTaskIds 使用 isSuperAdmin 而非 isAdmin 放行可见性', () => {
    expect(existsSync(CTRL), 'vendor 控制器文件在（未注入树先跑 npm run inject）').toBe(true)
    const src = readFileSync(CTRL, 'utf8')
    const start = src.indexOf('async function authorizeTaskIds')
    expect(start).toBeGreaterThan(0)
    const seg = src.slice(start, start + 1200)
    expect(seg).toContain('isSuperAdmin')
    expect(seg).toMatch(/const isSuperAdmin = role === 'super_admin'/)
    expect(seg).not.toMatch(/const isAdmin = role === 'admin'/)
  })
})
