// REST 直连白名单守门（边界设计 §2/§3-E6/§6-T1）：Matrix client-server REST 通道
// 仅限初始化/管理面/派发摘要，调用方白名单锁死；跨机协作消息一律走 task-protocol.ts
// 协议事件。新增消费方必须先过
// docs/superpowers/specs/2026-09-25-capability-boundaries-design.md §6-T1 裁决。
//
// 四层断言（合成自 c6e2abf 函数级白名单 + 828298e URL/协议唯一源 + 24h 审查 G1/G2 加固，
// 缺任一层即漏）：
//   ① URL 字面量（_matrix/client/v3）仅白名单模块可出现；
//   ② REST 包装函数名逐一断言「引用者 ∈ 允许消费方清单」（G1：仅①会被 import 包装函数绕过）；
//   ③ `com.swarmstudio.` 协议事件类型字面量唯一源是 task-protocol.ts；
//   ④ sim harness（scripts/aipay）REST 原语锁白名单（G2：通用封装 mx/mx_messages 等
//      与 mx_send 同级，只认两个名字即可绕过）。
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { describe, expect, it } from 'vitest'

const customRoot = join(__dirname, '..', '..', '..') // custom
const overlayRoot = join(__dirname, '..', '..', '..', '..') // overlay 根

// ② REST 包装函数清单（单一常量）：client-server REST 全部通道。
// matrixSendProtocolEvent 为协议事件通道（协作信号唯一入口），一并入清单防绕过。
const REST_FNS = ['matrixCreateTaskRoom', 'matrixInviteUser', 'matrixSendMessage', 'matrixSendProtocolEvent']
const ALLOWED_CONSUMERS = [
  'server/matrix/raci-matrix.ts', // 定义处
  'server/services/kanban/raci-dispatch.ts', // 唯一调用方：RACI 派发建群+摘要+协议事件
]
// ① URL 字面量断言白名单（与函数级断言并存）：直连地址仅包装实现与管理面可出现。
const URL_ALLOWED = [
  'server/matrix/raci-matrix.ts', // 初始化（建群/邀人/摘要）REST 通道
  'server/matrix/admin-service.ts', // 管理面（whoami/displayname/synapse admin）
]
// ③ 协议事件类型字面量唯一源。
const PROTOCOL_SOURCE = 'server/matrix/task-protocol.ts'

// ④ sim 侧 REST 原语清单（单一常量）：定义见 scripts/aipay/mux/mx-lib.sh——
// mx_login():132 / mx():138 通用封装（URL 直连在库内）/ mx_send():147 /
// mx_messages():157 / mx_wait_sender():162 / mx_create_room():178 / mx_join():185。
// 命中形态：① 具名原语任意引用；② 裸 mx 调用形态（后随空白+引号/$ 实参）——
// \bmx\b 会误伤 mx-down.sh/mx-lib.sh 类名称，故裸 mx 只认调用形态。
const HARNESS_REST_FNS = ['mx_send', 'mx_create_room', 'mx_messages', 'mx_login', 'mx_join', 'mx_wait_sender']
const HARNESS_REST_RE = new RegExp(
  `\\b(?:${HARNESS_REST_FNS.join('|')})\\b|(?:^|[\\s;|&(])mx\\s+["'$]`, 'm')
const HARNESS_REST_WHITELIST = [
  'scripts/aipay/mux/mx-lib.sh', // sim 编排（mx/mx_send/mx_create_room 等定义处，URL 直连唯一 sim 源）
  'scripts/aipay/mux/mx-scenario-lib.sh', // sim 场景（dm_room/auto_approve/消息收发）
  'scripts/aipay/mux/mx-smoke.sh', // sim 冒烟（经 mx_send 收发核验）
  'scripts/aipay/mux/mx-setup.sh', // sim 账号开通（mx_login 取 token）
  'scripts/aipay/mux/mx-delivery-lib.sh', // M3 delivery 协议轮（事件收发，mx_messages 同款直连）
  'scripts/aipay/mux/mx-delivery-smoke.sh', // M3 六阶段协议轮（断言读回）
  'scripts/aipay/aipay-scenario.sh', // sim 导演兜底（建群/邀人/补邀/读消息）
]

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name === '.git') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

describe('REST 直连白名单守门', () => {
  it('② 矩阵 REST 包装函数仅白名单文件可引用（函数级断言）', () => {
    const offenders: string[] = []
    for (const file of walk(customRoot, ['.ts'])) {
      const rel = relative(customRoot, file).split(sep).join('/')
      if (ALLOWED_CONSUMERS.includes(rel)) continue
      const src = readFileSync(file, 'utf8')
      if (REST_FNS.some((fn) => src.includes(fn))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('① _matrix/client/v3 直连仅白名单模块可出现', () => {
    const offenders: string[] = []
    for (const file of walk(customRoot, ['.ts'])) {
      const rel = relative(customRoot, file).split(sep).join('/')
      if (URL_ALLOWED.includes(rel)) continue
      if (readFileSync(file, 'utf8').includes('_matrix/client/v3')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('③ 协议事件类型字面量唯一源是 task-protocol.ts（服务端；客户端 matrix-teams 持协议常量镜像）', () => {
    const offenders: string[] = []
    for (const file of walk(join(customRoot, 'server'), ['.ts'])) {
      const rel = relative(customRoot, file).split(sep).join('/')
      if (rel === PROTOCOL_SOURCE) continue
      if (readFileSync(file, 'utf8').includes('com.swarmstudio.')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})

describe('REST 直连白名单守门（sim harness）', () => {
  it('④ scripts/aipay 的 synapse REST 原语仅白名单脚本可出现', () => {
    const harnessDir = join(overlayRoot, 'scripts', 'aipay')
    const offenders: string[] = []
    for (const file of walk(harnessDir, ['.sh'])) {
      const rel = relative(overlayRoot, file).split(sep).join('/')
      if (HARNESS_REST_WHITELIST.includes(rel)) continue
      if (HARNESS_REST_RE.test(readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
