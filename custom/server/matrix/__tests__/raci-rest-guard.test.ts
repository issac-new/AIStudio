// REST 直连白名单守门（边界设计 §2/§3-E6）：Matrix client-server REST 三函数
// （建群/邀人/发摘要）仅限初始化与派发摘要，调用方白名单锁死；跨机协作消息
// 一律走 matrix-teams/delivery 协议事件。新增消费方必须先过
// docs/superpowers/specs/2026-09-25-capability-boundaries-design.md §6-T1 裁决。
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { describe, expect, it } from 'vitest'

const customRoot = join(__dirname, '..', '..', '..')

const REST_FNS = ['matrixCreateTaskRoom', 'matrixInviteUser', 'matrixSendMessage']
const ALLOWED_CONSUMERS = [
  'server/matrix/raci-matrix.ts', // 定义处
  'server/services/kanban/raci-dispatch.ts', // 唯一调用方：RACI 派发建群+摘要
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('REST 直连白名单守门', () => {
  it('矩阵 REST 三函数仅白名单文件可引用', () => {
    const offenders: string[] = []
    for (const file of walk(customRoot)) {
      const rel = relative(customRoot, file).split(sep).join('/')
      if (ALLOWED_CONSUMERS.includes(rel)) continue
      const src = readFileSync(file, 'utf8')
      for (const fn of REST_FNS) {
        if (src.includes(fn)) offenders.push(`${rel} → ${fn}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
