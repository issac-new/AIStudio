// 交付案例面板 store 投影守门（M2）：index 发现→case state→stage/gate 事件
// →案例视图（阶段条/门禁灯数据面）。同 gate 取最新 at；stage done 计数去重；
// 无 case state 的房间不投影。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/custom/matrix-chat/stores/matrix-client', () => {
  // 真 store 是 setup-store：client 以 ref 暴露，pinia 消费方读 .client（已解包）。
  // mock 直接给可变 client 属性，勿用 {value}。
  const holder = { client: null as unknown }
  return { useMatrixClientStore: () => holder }
})
const clientHolder = (await import('@/custom/matrix-chat/stores/matrix-client')).useMatrixClientStore() as { client: unknown }

function fakeEvent(type: string, content: unknown) {
  return { getType: () => type, getContent: () => content }
}
function fakeRoom(roomId: string, caseContent: unknown | null, timeline: Array<{ getType(): string; getContent(): unknown }>) {
  return {
    roomId,
    currentState: { getStateEvents: (type: string) => caseContent ? [fakeEvent(type, caseContent)] : [] },
    getLiveTimeline: () => ({ getEvents: () => timeline }),
  }
}

describe('delivery-cases store 投影', () => {
  beforeEach(() => { setActivePinia(createPinia()); clientHolder.client = null })

  it('index 发现→投影案例：阶段/门禁/同 gate 取最新', async () => {
    const caseRoom = fakeRoom('!case1:m.x', {
      schemaVersion: 2, caseId: 'dlv-1', title: '示例', repoUrl: 'https://x',
      tier: 'standard', stage: 'P4', ownerAccount: 'fanfan',
      createdAt: 1, updatedAt: 2, updatedBy: 'fanfan',
    }, [
      fakeEvent('com.swarmstudio.delivery.stage', {
        schemaVersion: 2, caseId: 'dlv-1', stage: 'P1', worker: { account: 'fanfan' },
        outcome: 'done', reportedBy: 'fanfan', at: 10,
      }),
      fakeEvent('com.swarmstudio.delivery.stage', {
        schemaVersion: 2, caseId: 'dlv-1', stage: 'P2', worker: { account: 'fanfan' },
        outcome: 'done', reportedBy: 'fanfan', at: 11,
      }),
      fakeEvent('com.swarmstudio.delivery.gate', {
        schemaVersion: 2, caseId: 'dlv-1', gate: 'G4', verdict: 'reject',
        evidence: { kind: 'command-exit', summary: 'exit 1' }, reason: '修测试',
        decidedBy: 'qi', at: 20,
      }),
      fakeEvent('com.swarmstudio.delivery.gate', {
        schemaVersion: 2, caseId: 'dlv-1', gate: 'G4', verdict: 'pass',
        evidence: { kind: 'command-exit', summary: 'exit 0' },
        decidedBy: 'qi', at: 30,
      }),
    ])
    const noise = fakeRoom('!noise:m.x', null, [])
    clientHolder.client = {
      getAccountDataFromServer: vi.fn().mockResolvedValue({
        schemaVersion: 2, roomIds: ['!case1:m.x'], updatedBy: 'fanfan', updatedAt: 1,
      }),
      getRoom: (rid: string) => (rid === '!case1:m.x' ? caseRoom : null),
      getRooms: () => [caseRoom, noise],
    }
    const { useDeliveryCasesStore } = await import('../stores/delivery-cases')
    const store = useDeliveryCasesStore()
    await store.refresh()
    expect(store.cases).toHaveLength(1)
    const c = store.cases[0]!
    expect(c.caseId).toBe('dlv-1')
    expect(c.stage).toBe('P4')
    expect(c.stagesDone).toEqual(['P1', 'P2'])
    expect(c.gates).toHaveLength(1)
    expect(c.gates[0]!.verdict).toBe('pass') // 同 gate 取最新 at
    expect(c.gates[0]!.evidence).toBe('exit 0')
  })

  it('index 缺失回落全量扫描：仅投影有 case state 的房间', async () => {
    const caseRoom = fakeRoom('!c2:m.x', {
      schemaVersion: 2, caseId: 'dlv-2', title: 't', repoUrl: 'https://x',
      tier: 'lite', stage: 'P1', ownerAccount: 'bella',
      createdAt: 1, updatedAt: 2, updatedBy: 'bella',
    }, [])
    const noise = fakeRoom('!n2:m.x', null, [])
    clientHolder.client = {
      getAccountDataFromServer: vi.fn().mockRejectedValue(new Error('no index')),
      getRoom: () => null,
      getRooms: () => [caseRoom, noise],
    }
    const { useDeliveryCasesStore } = await import('../stores/delivery-cases')
    const store = useDeliveryCasesStore()
    await store.refresh()
    expect(store.cases.map(c => c.caseId)).toEqual(['dlv-2'])
    expect(store.loaded).toBe(true)
  })

  it('client 未 init 时 refresh 先兜底 initClient 再投影（/app/cases 深链直达实证缺口）', async () => {
    // 2026-10-06 R29 实证：initClient 此前仅 MatrixChatPanel/MatrixRoomCanvas 调用，
    // 深链直落 /app/cases 时 client 恒 null、协议事件全落房而面板零投影。
    const caseRoom = fakeRoom('!c3:m.x', {
      schemaVersion: 2, caseId: 'dlv-3', title: 't', repoUrl: 'https://x',
      tier: 'standard', stage: 'P1', ownerAccount: 'fanfan',
      createdAt: 1, updatedAt: 2, updatedBy: 'fanfan',
    }, [])
    clientHolder.client = null
    const holder = clientHolder as { client: unknown; initClient?: unknown }
    holder.initClient = vi.fn(async () => {
      holder.client = {
        getAccountDataFromServer: vi.fn().mockResolvedValue({
          schemaVersion: 2, roomIds: ['!c3:m.x'], updatedBy: 'fanfan', updatedAt: 1,
        }),
        getRoom: (rid: string) => (rid === '!c3:m.x' ? caseRoom : null),
        getRooms: () => [caseRoom],
      }
    })
    const { useDeliveryCasesStore } = await import('../stores/delivery-cases')
    const store = useDeliveryCasesStore()
    await store.refresh()
    expect(holder.initClient).toHaveBeenCalledTimes(1)
    expect(store.cases.map(c => c.caseId)).toEqual(['dlv-3'])
  })
})

describe('发起向导 createCase（M2）', () => {
  beforeEach(() => { setActivePinia(createPinia()); clientHolder.client = null })

  it('建案例房+case state+index 登记三发；网络读数含 HumanGate 待审计数', async () => {
    const calls: Array<[string, string, unknown]> = []
    const caseRoom = fakeRoom('!c3:m.x', {
      schemaVersion: 2, caseId: 'dlv-3', title: '向导案例', repoUrl: 'https://r',
      tier: 'standard', stage: 'P1', ownerAccount: 'fanfan',
      createdAt: 1, updatedAt: 1, updatedBy: 'fanfan',
    }, [
      fakeEvent('com.swarmstudio.delivery.gate', {
        schemaVersion: 2, caseId: 'dlv-3', gate: 'G1', verdict: 'pass',
        evidence: { kind: 'human', summary: 's' }, decidedBy: 'fanfan', at: 5,
      }),
    ])
    clientHolder.client = {
      getUserId: () => '@fanfan:matrix.test',
      createRoom: vi.fn().mockResolvedValue({ room_id: '!c3:m.x' }),
      sendStateEvent: vi.fn().mockImplementation(async (rid: string, type: string, content: unknown) => {
        calls.push([rid, type, content]); return {}
      }),
      getAccountDataFromServer: vi.fn().mockRejectedValue(new Error('none')),
      setAccountData: vi.fn().mockImplementation(async (type: string, content: unknown) => {
        calls.push(['', type, content])
      }),
      getRoom: (rid: string) => (rid === '!c3:m.x' ? caseRoom : null),
      getRooms: () => [caseRoom],
    }
    const { useDeliveryCasesStore } = await import('../stores/delivery-cases')
    const store = useDeliveryCasesStore()
    await store.createCase({ title: '向导案例', repoUrl: 'https://r', tier: 'standard' })
    const stateSend = calls.find(([rid, type]) => rid === '!c3:m.x' && type === 'com.swarmstudio.delivery.case')!
    expect((stateSend![2] as { caseId: string }).caseId).toMatch(/^dlv-/)
    expect((stateSend![2] as { stage: string }).stage).toBe('P1')
    const index = calls.find(([, type]) => type === 'com.swarmstudio.delivery.index')!
    expect((index![2] as { roomIds: string[] }).roomIds).toContain('!c3:m.x')
    // 网络读数（P0 新口径）：1 在途（非完成态）；G1 已 pass、G5 缺 → 待审人工门 = 1
    expect(store.networkReadings.inFlight).toBe(1)
    expect(store.networkReadings.pendingHumanGates).toBe(1)
  })
})

describe('P0 完成态区分（run14 形态）', () => {
  beforeEach(() => { setActivePinia(createPinia()); clientHolder.client = null })

  it('P6+G6 pass → completed=true；读数不计在途/待审；未完案例缺 G5 不被完成态豁免', async () => {
    const doneRoom = fakeRoom('!done:m.x', {
      schemaVersion: 2, caseId: 'dlv-done', title: '终局案例', repoUrl: 'https://r',
      tier: 'standard', stage: 'P6', ownerAccount: 'fanfan',
      createdAt: 1, updatedAt: 1, updatedBy: 'fanfan',
    }, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((st, i) => fakeEvent('com.swarmstudio.delivery.stage', {
      schemaVersion: 2, caseId: 'dlv-done', stage: st, worker: { account: 'fanfan' },
      outcome: 'done', reportedBy: 'fanfan', at: 10 + i,
    })).concat(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((g, i) => fakeEvent('com.swarmstudio.delivery.gate', {
      schemaVersion: 2, caseId: 'dlv-done', gate: g, verdict: 'pass',
      evidence: { kind: 'artifact', summary: 's' }, decidedBy: 'fanfan', at: 20 + i,
    }))))
    const stuckRoom = fakeRoom('!stuck:m.x', {
      schemaVersion: 2, caseId: 'dlv-stuck', title: '中断案例', repoUrl: 'https://r',
      tier: 'standard', stage: 'P2', ownerAccount: 'fanfan',
      createdAt: 1, updatedAt: 1, updatedBy: 'fanfan',
    }, [fakeEvent('com.swarmstudio.delivery.gate', {
      schemaVersion: 2, caseId: 'dlv-stuck', gate: 'G1', verdict: 'pass',
      evidence: { kind: 'human', summary: 's' }, decidedBy: 'fanfan', at: 5,
    })])
    clientHolder.client = {
      getAccountDataFromServer: vi.fn().mockResolvedValue({
        schemaVersion: 2, roomIds: ['!done:m.x', '!stuck:m.x'], updatedBy: 'fanfan', updatedAt: 1,
      }),
      getRoom: (rid: string) => (rid === '!done:m.x' ? doneRoom : stuckRoom),
      getRooms: () => [doneRoom, stuckRoom],
    }
    const { useDeliveryCasesStore } = await import('../stores/delivery-cases')
    const store = useDeliveryCasesStore()
    await store.refresh()
    const done = store.cases.find(c => c.caseId === 'dlv-done')!
    const stuck = store.cases.find(c => c.caseId === 'dlv-stuck')!
    expect(done.completed).toBe(true)
    expect(stuck.completed).toBe(false)
    // 读数新口径：完成态只进 completed 计数；在途=1（stuck，缺 G5 → 待审=1）
    expect(store.networkReadings.total).toBe(2)
    expect(store.networkReadings.completed).toBe(1)
    expect(store.networkReadings.inFlight).toBe(1)
    expect(store.networkReadings.pendingHumanGates).toBe(1)
  })
})
