// REST 直连全量白名单守门（边界设计 §2/§3-E6/§6-T1）：
// ① `_matrix/client/v3` client-server REST 直连仅限白名单模块（初始化/管理面/派发摘要），
//    跨机协作消息一律走 task-protocol.ts 协议事件；sim harness（scripts/aipay）为
//    sim-only 写者（mx-lib.sh 头部归属声明），同样锁白名单。
// ② `com.swarmstudio.` 协议事件类型字面量在 custom/server 内唯一源是 task-protocol.ts。
// 新增消费方必须先过 docs/superpowers/specs/2026-09-25-capability-boundaries-design.md §6-T1 裁决。
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { describe, expect, it } from 'vitest'

const serverRoot = join(__dirname, '..', '..') // custom/server
const overlayRoot = join(__dirname, '..', '..', '..', '..') // overlay 根

const REST_WHITELIST = [
  'matrix/raci-matrix.ts', // 初始化（建群/邀人）+ 协议事件 + 人读摘要，唯一 REST 通道
  'matrix/admin-service.ts', // 管理面（whoami/displayname/synapse admin）
]
const HARNESS_REST_WHITELIST = [
  'scripts/aipay/mux/mx-lib.sh', // sim 编排（mx/mx_send/mx_create_room）
  'scripts/aipay/mux/mx-scenario-lib.sh', // sim 场景（dm_room/auto_approve）
  'scripts/aipay/mux/mx-smoke.sh', // sim 冒烟（经 mx_send 收发核验）
  'scripts/aipay/mux/mx-delivery-lib.sh', // M3 delivery 协议轮（事件收发，mx_messages 同款直连）
  'scripts/aipay/mux/mx-delivery-smoke.sh', // M3 六阶段协议轮（断言读回）
  'scripts/aipay/aipay-scenario.sh', // sim 导演兜底（补邀/读消息）
]
const PROTOCOL_SOURCE = 'matrix/task-protocol.ts'

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name === '.git') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

describe('REST 直连白名单守门（custom/server）', () => {
  it('_matrix/client/v3 直连仅白名单模块可出现', () => {
    const offenders: string[] = []
    for (const file of walk(serverRoot, ['.ts'])) {
      const rel = relative(serverRoot, file).split(sep).join('/')
      if (REST_WHITELIST.includes(rel)) continue
      if (readFileSync(file, 'utf8').includes('_matrix/client/v3')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('协议事件类型字面量唯一源是 task-protocol.ts', () => {
    const offenders: string[] = []
    for (const file of walk(serverRoot, ['.ts'])) {
      const rel = relative(serverRoot, file).split(sep).join('/')
      if (rel === PROTOCOL_SOURCE) continue
      if (readFileSync(file, 'utf8').includes('com.swarmstudio.')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})

describe('REST 直连白名单守门（sim harness）', () => {
  it('scripts/aipay 的 synapse REST 封装仅白名单脚本可出现', () => {
    const harnessDir = join(overlayRoot, 'scripts', 'aipay')
    const offenders: string[] = []
    for (const file of walk(harnessDir, ['.sh'])) {
      const rel = relative(overlayRoot, file).split(sep).join('/')
      if (HARNESS_REST_WHITELIST.includes(rel)) continue
      const src = readFileSync(file, 'utf8')
      if (src.includes('_matrix/client/v3') || /\bmx_send\b|\bmx_create_room\b/.test(src)) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })
})
