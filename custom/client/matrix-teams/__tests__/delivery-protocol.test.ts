// overlay/custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
// 交付协议守门：事件类型常量 + content schema 解析（容错返回 null）+ 幂等投影 + HumanGate 校验。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  DELIVERY_SCHEMA_VERSION, DELIVERY_EVENT_TYPES, DELIVERY_INDEX_ACCOUNT_DATA_TYPE,
  CASE_ROOM_POWER_LEVELS, isDeliveryEventType,
  DELIVERY_STAGES, DELIVERY_GATES, HUMAN_GATES,
  parseCaseContent, parseIndexContent, parseStageContent, parseGateContent,
  isHumanAccount, samePrincipal, validateGateSender, validateStageSender,
  latestBy, latestGateVerdicts, latestStageOutcomes,
} from '../delivery-protocol'

describe('事件类型常量与 PL 矩阵', () => {
  it('三事件 + index account data 类型符合 spec §5', () => {
    expect(DELIVERY_EVENT_TYPES.case).toBe('com.swarmstudio.delivery.case')
    expect(DELIVERY_EVENT_TYPES.stage).toBe('com.swarmstudio.delivery.stage')
    expect(DELIVERY_EVENT_TYPES.gate).toBe('com.swarmstudio.delivery.gate')
    expect(DELIVERY_INDEX_ACCOUNT_DATA_TYPE).toBe('com.swarmstudio.delivery.index')
    expect(DELIVERY_SCHEMA_VERSION).toBe(1)
  })
  it('PL：case=50（state），stage/gate=0（普通消息）', () => {
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.case]).toBe(50)
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.stage]).toBe(0)
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.gate]).toBe(0)
    expect(CASE_ROOM_POWER_LEVELS.state_default).toBe(50)
    expect(CASE_ROOM_POWER_LEVELS.events_default).toBe(0)
  })
  it('阶段/门禁枚举：P1-P6、G1-G6、人工门=G1/G5', () => {
    expect([...DELIVERY_STAGES]).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
    expect([...DELIVERY_GATES]).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
    expect([...HUMAN_GATES]).toEqual(['G1', 'G5'])
  })
  it('isDeliveryEventType 按前缀识别，team.* 不误判', () => {
    expect(isDeliveryEventType('com.swarmstudio.delivery.case')).toBe(true)
    expect(isDeliveryEventType('com.swarmstudio.team.duty')).toBe(false)
    expect(isDeliveryEventType('m.room.message')).toBe(false)
  })
})

describe('parseCaseContent', () => {
  const ok = {
    schemaVersion: 1, caseId: 'c-001', title: 'stringops v0.2', repoUrl: 'git@example:ops.git',
    tier: 'standard', stage: 'P3', ownerAccount: '@alice:matrix.test',
    frozenAcceptance: 'AC1: pytest 全绿', createdAt: 1, updatedAt: 2, updatedBy: '@alice:matrix.test',
  }
  it('合法 content 原样解析（含可选 frozenAcceptance）', () => {
    expect(parseCaseContent(ok)).toEqual(ok)
  })
  it('可选字段缺省容忍', () => {
    const { frozenAcceptance, ...rest } = ok
    expect(parseCaseContent(rest)).toEqual({ ...rest, frozenAcceptance: undefined })
  })
  it('schemaVersion 缺失或非 1 → null（未知版本降级只读）', () => {
    const { schemaVersion, ...rest } = ok
    expect(parseCaseContent(rest)).toBeNull()
    expect(parseCaseContent({ ...ok, schemaVersion: 2 })).toBeNull()
    expect(parseCaseContent({ ...ok, schemaVersion: '1' })).toBeNull()
  })
  it('tier / stage 非枚举值 → null', () => {
    expect(parseCaseContent({ ...ok, tier: 'heavy' })).toBeNull()
    expect(parseCaseContent({ ...ok, stage: 'P7' })).toBeNull()
  })
  it('必填字段缺失或类型错 → null', () => {
    expect(parseCaseContent(null)).toBeNull()
    expect(parseCaseContent('str')).toBeNull()
    expect(parseCaseContent({ ...ok, ownerAccount: 5 })).toBeNull()
    expect(parseCaseContent({ ...ok, updatedAt: 't' })).toBeNull()
  })
  it('超限幅（title>200 / frozenAcceptance>4000）→ null', () => {
    expect(parseCaseContent({ ...ok, title: 'x'.repeat(201) })).toBeNull()
    expect(parseCaseContent({ ...ok, frozenAcceptance: 'x'.repeat(4001) })).toBeNull()
  })
})

describe('parseIndexContent', () => {
  const ok = { schemaVersion: 1, roomIds: ['!r1:x', '!r2:x'], updatedBy: '@alice:matrix.test', updatedAt: 3 }
  it('合法解析；roomIds 混入非字符串 → null', () => {
    expect(parseIndexContent(ok)).toEqual(ok)
    expect(parseIndexContent({ ...ok, roomIds: ['!r1:x', 1] })).toBeNull()
  })
  it('roomIds 超 50 → null', () => {
    expect(parseIndexContent({ ...ok, roomIds: Array.from({ length: 51 }, (_, i) => `!r${i}:x`) })).toBeNull()
  })
  it('schemaVersion/updatedBy 缺失 → null', () => {
    const { schemaVersion, ...rest } = ok
    expect(parseIndexContent(rest)).toBeNull()
    expect(parseIndexContent({ ...ok, updatedBy: undefined })).toBeNull()
  })
})

describe('parseStageContent', () => {
  const ok = {
    schemaVersion: 1, caseId: 'c-001', stage: 'P3',
    worker: { account: '@bob:matrix.test', agentTeam: 'backend', profile: 'worker-coder' },
    outcome: 'done', artifactRef: 'git:main#abc123:docs/delivery/c-001/design.md',
    reportedBy: '@bob-agent:matrix.test', at: 10,
  }
  it('合法 content 原样解析（可选项缺省容忍）', () => {
    expect(parseStageContent(ok)).toEqual(ok)
    const { artifactRef, ...rest } = ok
    expect(parseStageContent(rest)).toEqual({ ...rest, artifactRef: undefined })
  })
  it('stage 非枚举 / outcome 非枚举 / worker 缺 account → null', () => {
    expect(parseStageContent({ ...ok, stage: 'P9' })).toBeNull()
    expect(parseStageContent({ ...ok, outcome: 'paused' })).toBeNull()
    expect(parseStageContent({ ...ok, worker: { agentTeam: 'x' } })).toBeNull()
    expect(parseStageContent({ ...ok, worker: null })).toBeNull()
  })
  it('schemaVersion 缺失 / at 非数 / artifactRef 超限 → null', () => {
    expect(parseStageContent({ ...ok, schemaVersion: 99 })).toBeNull()
    expect(parseStageContent({ ...ok, at: 'now' })).toBeNull()
    expect(parseStageContent({ ...ok, artifactRef: 'x'.repeat(513) })).toBeNull()
  })
})

describe('parseGateContent', () => {
  const pass = {
    schemaVersion: 1, caseId: 'c-001', gate: 'G1', verdict: 'pass',
    evidence: { kind: 'human', summary: 'owner 冻结验收边界' },
    decidedBy: '@alice:matrix.test', at: 20,
  }
  const rejected = {
    ...pass, gate: 'G4', verdict: 'reject',
    evidence: { kind: 'command-exit', summary: 'pytest exit 1: 2 failed' },
    reason: '[REJECT:用例不足] 补边界用例后重验',
    decidedBy: '@carol:matrix.test',
  }
  it('pass 合法（reason 可选）；reject 带 reason 合法', () => {
    expect(parseGateContent(pass)).toEqual(pass)
    expect(parseGateContent(rejected)).toEqual(rejected)
  })
  it('verdict=reject/conditional 而 reason 缺失 → null（spec §6 纪律 2：打回必附方向）', () => {
    const { reason, ...noReason } = rejected
    expect(parseGateContent(noReason)).toBeNull()
    expect(parseGateContent({ ...rejected, verdict: 'conditional', reason: undefined })).toBeNull()
  })
  it('gate 非枚举 / verdict 非枚举 / evidence 非法 → null', () => {
    expect(parseGateContent({ ...pass, gate: 'G7' })).toBeNull()
    expect(parseGateContent({ ...pass, verdict: 'maybe' })).toBeNull()
    expect(parseGateContent({ ...pass, evidence: null })).toBeNull()
    expect(parseGateContent({ ...pass, evidence: { kind: 'vibes', summary: 's' } })).toBeNull()
    expect(parseGateContent({ ...pass, evidence: { kind: 'human' } })).toBeNull()
  })
  it('summary 超 400 / reason 超 1000 → null', () => {
    expect(parseGateContent({ ...pass, evidence: { kind: 'human', summary: 'x'.repeat(401) } })).toBeNull()
    expect(parseGateContent({ ...rejected, reason: 'x'.repeat(1001) })).toBeNull()
  })
})

describe('发送者主体校验', () => {
  it('isHumanAccount：-agent 后缀 = bot，其余 = 人类', () => {
    expect(isHumanAccount('@alice:matrix.test')).toBe(true)
    expect(isHumanAccount('@alice-agent:matrix.test')).toBe(false)
    expect(isHumanAccount('@agent:matrix.test')).toBe(true) // 本名就叫 agent，不带 -agent 后缀
  })
  it('samePrincipal：人类与其 bot 同主体，跨账号/跨域不同主体', () => {
    expect(samePrincipal('@alice:matrix.test', '@alice-agent:matrix.test')).toBe(true)
    expect(samePrincipal('@alice-agent:matrix.test', '@alice:matrix.test')).toBe(true)
    expect(samePrincipal('@alice:matrix.test', '@bob:matrix.test')).toBe(false)
    expect(samePrincipal('@alice:x', '@alice-agent:y')).toBe(false)
  })
  it('HumanGate（G1/G5）sender 是 bot → 报错（spec §5 负例）', () => {
    const g1 = { schemaVersion: 1, caseId: 'c', gate: 'G1', verdict: 'pass', evidence: { kind: 'human', summary: 's' }, decidedBy: '@alice:matrix.test', at: 1 } as const
    expect(validateGateSender(g1, '@alice:matrix.test')).toEqual([])
    expect(validateGateSender(g1, '@alice-agent:matrix.test')).toEqual(['gate G1 requires human sender'])
  })
  it('非 HumanGate 门禁允许 bot sender，但 decidedBy 须同主体', () => {
    const g4 = { schemaVersion: 1, caseId: 'c', gate: 'G4', verdict: 'conditional', evidence: { kind: 'command-exit', summary: 's' }, reason: 'r', decidedBy: '@carol:matrix.test', at: 1 } as const
    expect(validateGateSender(g4, '@carol-agent:matrix.test')).toEqual([])
    expect(validateGateSender(g4, '@bob-agent:matrix.test')).toEqual(['decidedBy is not the sender principal'])
  })
  it('stage：sender 须与 worker.account 和 reportedBy 同主体（spec §5 读端忽略依据）', () => {
    const st = { schemaVersion: 1, caseId: 'c', stage: 'P3', worker: { account: '@bob:matrix.test' }, outcome: 'done', reportedBy: '@bob:matrix.test', at: 1 } as const
    expect(validateStageSender(st, '@bob-agent:matrix.test')).toEqual([])
    expect(validateStageSender(st, '@carol-agent:matrix.test')).toEqual(['stage sender does not match worker/reportedBy principal'])
  })
})

describe('幂等投影（spec §5：最新 at 覆盖，幂等语义同 receipt）', () => {
  it('latestBy：同 key 取 at 最大；at 相同取靠后元素', () => {
    const items = [
      { id: 'a', at: 1, v: 'old' },
      { id: 'b', at: 5, v: 'only' },
      { id: 'a', at: 3, v: 'new' },
      { id: 'a', at: 3, v: 'last-wins' },
    ]
    const m = latestBy(items, x => x.id, x => x.at)
    expect(m.get('a')?.v).toBe('last-wins')
    expect(m.get('b')?.v).toBe('only')
    expect(m.size).toBe(2)
  })
  it('latestBy：同 key 降序输入仍取 at 最大（防「恒取末元素」回归）', () => {
    const items = [
      { id: 'a', at: 9, v: 'new' },
      { id: 'a', at: 2, v: 'stale' },
    ]
    const m = latestBy(items, x => x.id, x => x.at)
    expect(m.get('a')?.v).toBe('new')
  })
  it('latestBy：空输入返回空 Map', () => {
    expect(latestBy([], () => '', () => 0).size).toBe(0)
  })
  it('latestGateVerdicts：同案例同门禁取最新 verdict（打回后补验覆盖）', () => {
    const mk = (at: number, verdict: 'reject' | 'pass') => ({
      schemaVersion: 1 as const, caseId: 'c-001', gate: 'G4' as const, verdict,
      evidence: { kind: 'command-exit' as const, summary: 's' },
      ...(verdict === 'reject' ? { reason: '[REJECT:x] r' } : {}),
      decidedBy: '@carol:matrix.test', at,
    })
    const m = latestGateVerdicts([mk(10, 'reject'), mk(12, 'pass')])
    expect(m.get('c-001:G4')?.verdict).toBe('pass')
  })
  it('latestStageOutcomes：同案例同阶段取最新 outcome（started→done）', () => {
    const mk = (at: number, outcome: 'started' | 'done') => ({
      schemaVersion: 1 as const, caseId: 'c-001', stage: 'P3' as const,
      worker: { account: '@bob:matrix.test' }, outcome, reportedBy: '@bob-agent:matrix.test', at,
    })
    const m = latestStageOutcomes([mk(5, 'started'), mk(9, 'done')])
    expect(m.get('c-001:P3')?.outcome).toBe('done')
  })
})

describe('协议守门：delivery 事件类型字符串禁止内联', () => {
  function collect(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...collect(p))
      else if (p.endsWith('.ts') || p.endsWith('.vue')) out.push(p)
    }
    return out
  }
  it('除 delivery-protocol.ts 与测试外，模块内不得出现 com.swarmstudio.delivery. 字面量', () => {
    const root = join(__dirname, '..')
    const offenders = collect(root).filter(
      p => !p.endsWith('delivery-protocol.ts') && !p.includes('__tests__')
        && readFileSync(p, 'utf8').includes('com.swarmstudio.delivery.'),
    )
    expect(offenders).toEqual([])
  })
})
