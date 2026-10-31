// 补丁 713 落地守门（2026-10-31 日常工作台回归收尾批）：PATCH /api/hermes/kanban/:id
// 被 CLI 状态机拒（cannot X for Y / is not in）时回 409 state_transition_rejected。
// 本测试锁注入态 vendor 控制器含该映射——series 漂移/漏注入即红（B 类补丁的
// 源层守门先例：evidence-binary-freeze 等同套路）。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CTRL = resolve(__dirname, '../../vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban.ts')

describe('补丁 713：PATCH 状态机拒绝 409 语义守门', () => {
  it('注入态 patchTask catch 含 409 state_transition_rejected 映射', () => {
    expect(existsSync(CTRL), 'vendor 控制器文件在（未注入树先跑 npm run inject）').toBe(true)
    const src = readFileSync(CTRL, 'utf8')
    const patchTaskAt = src.indexOf('export async function patchTask')
    expect(patchTaskAt).toBeGreaterThan(0)
    const seg = src.slice(patchTaskAt, patchTaskAt + 1600)
    expect(seg).toContain('state_transition_rejected')
    expect(seg).toMatch(/ctx\.status = 409/)
    expect(seg).toMatch(/cannot.*for|is not in/)
  })
})
