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
})
