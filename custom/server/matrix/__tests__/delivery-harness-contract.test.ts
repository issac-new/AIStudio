// M3 合同守门：mx harness 的 delivery 事件构造器（delivery-event.mjs CLI）输出
// 必须逐字通过客户端 delivery-protocol.ts v2 解析器——bash 发事件、TS 读事件的
// 两侧合同由本测试钉死，schema 漂移当场 fail。
// 对应：分布式设计 §10 M3；协议 v2（DELIVERY_SCHEMA_VERSION=2）。
import { execFileSync } from 'child_process'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  parseCaseContent, parseGateContent, parseIndexContent, parseStageContent,
} from '../../../client/matrix-teams/delivery-protocol'

const BUILDER = join(__dirname, '..', '..', '..', '..', 'scripts', 'aipay', 'mux', 'delivery-event.mjs')

function build(args: string[]): Record<string, unknown> {
  const out = execFileSync('node', [BUILDER, ...args], { encoding: 'utf8' })
  return JSON.parse(out)
}

describe('delivery 事件构造器 ↔ 协议 v2 解析器合同', () => {
  it('case 事件：完整字段过解析且语义保真', () => {
    const c = build(['case', '--case-id', 'case-1', '--title', '示例案例', '--repo-url',
      'https://git.example/case-1.git', '--tier', 'standard', '--stage', 'P1',
      '--owner', 'fanfan', '--updated-by', 'fanfan', '--at', '1700000000000'])
    const parsed = parseCaseContent(c)
    expect(parsed).not.toBeNull()
    expect(parsed!.caseId).toBe('case-1')
    expect(parsed!.tier).toBe('standard')
    expect(parsed!.stage).toBe('P1')
    expect(parsed!.schemaVersion).toBe(2)
  })

  it('stage 事件：worker 对象/outcome/artifactRef 过解析', () => {
    const c = build(['stage', '--case-id', 'case-1', '--stage', 'P3',
      '--worker-account', 'chen', '--worker-team', 'chen-pay-core', '--worker-profile', 'chen-csw-pay-core',
      '--outcome', 'done', '--artifact-ref', 'git:main#abc123:docs/delivery/case-1/impl.md',
      '--reported-by', 'chen', '--at', '1700000001000'])
    const parsed = parseStageContent(c)
    expect(parsed).not.toBeNull()
    expect(parsed!.worker).toEqual({ account: 'chen', agentTeam: 'chen-pay-core', profile: 'chen-csw-pay-core' })
    expect(parsed!.outcome).toBe('done')
    expect(parsed!.artifactRef).toBe('git:main#abc123:docs/delivery/case-1/impl.md')
  })

  it('gate 事件：pass 过解析；reject 缺 reason 时构造器拒绝（exit 4）', () => {
    const c = build(['gate', '--case-id', 'case-1', '--gate', 'G1', '--verdict', 'pass',
      '--evidence-kind', 'human', '--evidence-summary', 'owner 拍板',
      '--decided-by', 'fanfan', '--at', '1700000002000'])
    const parsed = parseGateContent(c)
    expect(parsed).not.toBeNull()
    expect(parsed!.gate).toBe('G1')
    expect(parsed!.evidence.kind).toBe('human')
    expect(parsed!.signoff).toBeUndefined() // 缺省签核=事件本身
    let failed = false
    try {
      execFileSync('node', [BUILDER, 'gate', '--case-id', 'case-1', '--gate', 'G4', '--verdict', 'reject',
        '--evidence-kind', 'command-exit', '--evidence-summary', 'exit 1', '--decided-by', 'qi'])
    } catch (err: any) {
      failed = err.status === 4
    }
    expect(failed).toBe(true) // 打回必附方向：无 reason 构造期即拒
  })

  it('index 事件：roomIds 数组过解析（案例发现机制）', () => {
    const c = build(['index', '--room-id', '!a:b', '--room-id', '!c:d',
      '--updated-by', 'fanfan', '--at', '1700000003000'])
    const parsed = parseIndexContent(c)
    expect(parsed).not.toBeNull()
    expect(parsed!.roomIds).toEqual(['!a:b', '!c:d'])
    expect(parsed!.schemaVersion).toBe(2)
  })
})
