// overlay/custom/client/matrix-teams/__tests__/qgate-bridge.test.ts
// QGate→Matrix 桥接守门：换算表完整性 + GateContent 协议形态 + store 上报流（sendEvent mock）。
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  QGATE_TO_DELIVERY, toDeliveryGateContent, DOMAIN_TO_GATE,
  useQGateBridgeStore, loadBridgeState, saveBridgeState,
} from '../stores/qgate-bridge'
import { parseGateContent, DELIVERY_EVENT_TYPES, validateGateSender } from '../delivery-protocol'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('桥接换算（纯函数）', () => {
  it('QGate 六态全映射进 delivery 三态（与 align 表一致）', () => {
    for (const v of ['PASS', 'FAIL', 'CONDITIONAL', 'INCONCLUSIVE', 'WAIVED', 'NOT_APPLICABLE']) {
      expect(['pass', 'conditional', 'reject']).toContain(QGATE_TO_DELIVERY[v])
    }
    expect(QGATE_TO_DELIVERY.PASS).toBe('pass')
    expect(QGATE_TO_DELIVERY.FAIL).toBe('reject')
    expect(QGATE_TO_DELIVERY.INCONCLUSIVE).toBe('conditional') // 不确定降 conditional，绝不冒 pass
    expect(QGATE_TO_DELIVERY.WAIVED).toBe('conditional')
  })

  it('domain → G 门映射：L1→G3、L2/L3→G4、L4/L5→G5、未知保守落 G4', () => {
    expect(DOMAIN_TO_GATE.L0).toBe('G1')
    expect(DOMAIN_TO_GATE.L1).toBe('G3')
    expect(DOMAIN_TO_GATE.L2).toBe('G4')
    expect(DOMAIN_TO_GATE.L3).toBe('G4')
    expect(DOMAIN_TO_GATE.L4).toBe('G5')
    expect(DOMAIN_TO_GATE.L5).toBe('G5')
    const content = toDeliveryGateContent({ caseId: 'c', gateId: 'x', verdict: 'PASS' })
    expect(content?.gate).toBe('G4')
  })

  it('产出 content 过协议解析器（wire 形态合法）；decidedBy=qgate-bridge 不冒人', () => {
    const content = toDeliveryGateContent({
      caseId: 'case-001', gateId: 'data.persistence-integrity', domain: 'L2',
      verdict: 'FAIL', runId: 'run-x', summary: 'field-diff:fail', conditions: ['clear x'],
    })
    expect(content).not.toBeNull()
    const reparsed = parseGateContent(content)
    expect(reparsed).not.toBeNull()
    expect(reparsed).toMatchObject({
      caseId: 'case-001', gate: 'G4', verdict: 'reject',
      decidedBy: 'qgate-bridge',
    })
    expect(reparsed?.reason).toContain('clear x') // 打回必附方向
    expect(reparsed?.evidence.summary).toContain('data.persistence-integrity')
  })

  it('reject/conditional 必带 reason（协议纪律）；PASS 可不带', () => {
    const fail = toDeliveryGateContent({ caseId: 'c', gateId: 'g', domain: 'L1', verdict: 'FAIL' })
    expect(fail?.reason).toBeTruthy()
    const cond = toDeliveryGateContent({ caseId: 'c', gateId: 'g', domain: 'L1', verdict: 'INCONCLUSIVE' })
    expect(cond?.reason).toBeTruthy()
    const pass = toDeliveryGateContent({ caseId: 'c', gateId: 'g', domain: 'L1', verdict: 'PASS' })
    expect(pass?.reason).toBeUndefined()
  })

  it('非法 verdict → null', () => {
    expect(toDeliveryGateContent({ caseId: 'c', gateId: 'g', verdict: 'BOGUS' as never })).toBeNull()
  })
})

// ── store 上报流（mock SDK，同 mc-review-center 模式）──
const sentEvents: Array<{ roomId?: string; type: string; content: Record<string, unknown> }> = []
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ roomId, type, content }) },
}
import { vi } from 'vitest'
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({
    client: { value: sdkClient },
    userId: { value: '@bot-agent:sv' },
    registryRoomId: { value: '!registry:sv' },
  }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  sentEvents.length = 0
})

describe('qgate-bridge store 上报', () => {
  it('案例房已知 → 判走进案例房；未知 → 注册房兜底', async () => {
    const store = useQGateBridgeStore()
    store.learnCaseRoom('case-001', '!case:sv')
    const r1 = await store.reportVerdict({ caseId: 'case-001', gateId: 'engineering.basic-check', domain: 'L1', verdict: 'PASS' })
    expect(r1.ok).toBe(true)
    expect(sentEvents[0]).toMatchObject({ roomId: '!case:sv', type: DELIVERY_EVENT_TYPES.gate })
    const r2 = await store.reportVerdict({ caseId: 'case-ghost', gateId: 'g', domain: 'L1', verdict: 'FAIL' })
    expect(r2.ok).toBe(true)
    expect(sentEvents[1].roomId).toBe('!registry:sv')
  })

  it('从 delivery.case 事件学习案例房映射', async () => {
    const store = useQGateBridgeStore()
    await store.handleTimelineEvent(
      { getType: () => DELIVERY_EVENT_TYPES.case, getContent: () => ({
        schemaVersion: 2, caseId: 'case-x', title: 't', repoUrl: 'r', tier: 'standard',
        stage: 'P3', ownerAccount: '@alice:sv', createdAt: 1, updatedAt: 2, updatedBy: '@alice:sv',
      }) },
      { roomId: '!casex:sv' },
    )
    const r = await store.reportVerdict({ caseId: 'case-x', gateId: 'g', domain: 'L1', verdict: 'PASS' })
    expect(r.ok).toBe(true)
    expect(sentEvents[0].roomId).toBe('!casex:sv')
  })

  it('bot sender 非人：非人工门（G3）sender 校验通过；decidedBy=qgate-bridge 与 sender 不同主体记错', async () => {
    const store = useQGateBridgeStore()
    store.learnCaseRoom('case-001', '!case:sv')
    await store.reportVerdict({ caseId: 'case-001', gateId: 'g', domain: 'L1', verdict: 'PASS' })
    const content = sentEvents[0].content as ReturnType<typeof toDeliveryGateContent> & object
    // G3 非 HUMAN_GATES，bot 判定合法；decidedBy=qgate-bridge 非 sender 主体 → 应用层读端会标 decidedBy 不符
    // ——这是有意的：机器判定标机械来源，不冒人（桥接语义，见 store 文件头注释）
    const errors = validateGateSender(content, '@qgate-bot-agent:sv')
    expect(errors.some((e) => e.includes('human'))).toBe(false)
  })
})

describe('bridge-state 镜像（本地持久化）', () => {
  it('save/load 往返；坏文件兜底空', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-bridge-'))
    try {
      const qgateDir = join(dir, '.qgate')
      mkdirSync(qgateDir, { recursive: true })
      expect(loadBridgeState(qgateDir)).toEqual({})
      saveBridgeState(qgateDir, { 'case-001': '!case:sv' })
      expect(loadBridgeState(qgateDir)).toEqual({ 'case-001': '!case:sv' })
      writeFileSync(join(qgateDir, 'bridge-state.json'), '{broken', 'utf8')
      expect(loadBridgeState(qgateDir)).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
