// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/admission-gate.test.ts
// 准入五问守门（4A 治理层 ⑤）：协议解析容错/投影 admissionOk/写入侧闸
// （首宣无答卷拒写、有答卷透传、改 teams 自动沿用既有答卷）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  TEAM_EVENT_TYPES, parseAccountContent, admissionComplete, type AdmissionAnswers,
} from '../protocol'
import { projectAccounts, type RawStateEvent } from '../adapters/accounts'

const FULL: AdmissionAnswers = { q1: 'a1', q2: 'a2', q3: 'a3', q4: 'a4', q5: 'a5', answeredAt: 1000, signer: '@u:sv' }

// ── store 闸用模块级 mock（vi.mock 提升，须在 describe 外定义，对齐 team-registry-store.test.ts 先例）──
const sent: Array<{ roomId: string; type: string; stateKey: string; content: unknown }> = []
const roomStates: Record<string, Array<{ type: string; stateKey: string; sender: string; content: unknown }>> = {}
const sdkClient = {
  on: () => {},
  off: () => {},
  getAccountData: () => undefined,
  setAccountData: async () => {},
  getRoom: (roomId: string) => {
    const states = roomStates[roomId] ?? []
    return {
      roomId,
      name: roomId,
      getJoinedMembers: () => states.map(s => ({ userId: s.sender, membership: 'join' })),
      currentState: { getStateEvents: (type?: string) => type === undefined ? states : states.filter(s => s.type === type) },
    }
  },
  getRooms: () => Object.keys(roomStates).map(id => sdkClient.getRoom(id)),
  createRoom: vi.fn(async () => ({ room_id: '!new:sv' })),
  sendStateEvent: async (roomId: string, type: string, content: unknown, stateKey: string) => {
    sent.push({ roomId, type, stateKey, content })
    roomStates[roomId] = [...(roomStates[roomId] ?? []), { type, stateKey, sender: stateKey, content }]
  },
  invite: vi.fn(async () => ({})),
  sendEvent: vi.fn(async () => ({})),
  userId: '@alice:sv',
}

vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@alice:sv' } }),
}))

import { useTeamRegistryStore } from '../stores/team-registry'

describe('准入协议：解析与判定', () => {
  it('完整答卷解析保留；admissionComplete 通过', () => {
    const parsed = parseAccountContent({ displayName: 'A', agentTeams: [], updatedAt: 1, admission: FULL })
    expect(parsed?.admission?.q1).toBe('a1')
    expect(admissionComplete(parsed?.admission)).toBe(true)
  })

  it('老事件无 admission 照常解析（增量兼容），admissionComplete=false', () => {
    const parsed = parseAccountContent({ displayName: 'A', agentTeams: [], updatedAt: 1 })
    expect(parsed).toBeTruthy()
    expect(parsed?.admission).toBeUndefined()
    expect(admissionComplete(parsed?.admission)).toBe(false)
  })

  it('答卷缺答/形状非法 → admission 视为未过但不拖垮声明（容错）', () => {
    const partial = parseAccountContent({
      displayName: 'A', agentTeams: [], updatedAt: 1,
      admission: { q1: 'a1', q2: '', q3: 'a3', q4: 'a4', q5: 'a5', answeredAt: 1, signer: 's' },
    })
    expect(partial).toBeTruthy()
    expect(partial?.admission).toBeUndefined()
    const wrong = parseAccountContent({ displayName: 'A', agentTeams: [], updatedAt: 1, admission: 'not-an-object' })
    expect(wrong?.admission).toBeUndefined()
  })
})

describe('准入投影：admissionOk 标记', () => {
  it('有答卷 admissionOk=true 且带原文；无答卷 false', () => {
    const events: RawStateEvent[] = [
      { type: TEAM_EVENT_TYPES.account, stateKey: '@a:sv', sender: '@a:sv', content: { displayName: 'A', agentTeams: [], updatedAt: 1, admission: FULL } },
      { type: TEAM_EVENT_TYPES.account, stateKey: '@b:sv', sender: '@b:sv', content: { displayName: 'B', agentTeams: [], updatedAt: 1 } },
    ]
    const views = projectAccounts(events, [])
    expect(views.find(v => v.userId === '@a:sv')?.admissionOk).toBe(true)
    expect(views.find(v => v.userId === '@a:sv')?.admission?.signer).toBe('@u:sv')
    expect(views.find(v => v.userId === '@b:sv')?.admissionOk).toBe(false)
  })
})

describe('准入写入闸（store）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sent.length = 0
    for (const k of Object.keys(roomStates)) delete roomStates[k]
    roomStates['!reg:sv'] = [
      { type: TEAM_EVENT_TYPES.leaders, stateKey: '', sender: '@lead:sv', content: { leaders: ['@lead:sv'] } },
    ]
  })

  function makeStore() {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    return store
  }

  it('首宣无答卷 → 拒写并记 lastError（缺一问不签）', async () => {
    const store = makeStore()
    const ok = await store.writeSelfAccount([{ slug: 'd', name: 'D', profiles: ['p'] }])
    expect(ok).toBe(false)
    expect(store.lastError).toContain('准入五问')
    expect(sent.filter(s => s.type === TEAM_EVENT_TYPES.account)).toHaveLength(0)
  })

  it('首宣带完整答卷 → 写入含 admission', async () => {
    const store = makeStore()
    const ok = await store.writeSelfAccount([{ slug: 'd', name: 'D', profiles: ['p'] }], FULL)
    expect(ok).toBe(true)
    const w = sent.find(s => s.type === TEAM_EVENT_TYPES.account)
    expect((w?.content as { admission?: AdmissionAnswers }).admission?.q5).toBe('a5')
  })

  it('已有完整答卷的账号改 teams 不再索答（自动沿用）', async () => {
    roomStates['!reg:sv'].push({
      type: TEAM_EVENT_TYPES.account, stateKey: '@alice:sv', sender: '@alice:sv',
      content: { displayName: 'alice', agentTeams: [{ slug: 'old', name: 'Old', profiles: ['p0'] }], updatedAt: 1, admission: FULL },
    })
    const store = makeStore()
    await store.rebuild()
    const ok = await store.writeSelfAccount([{ slug: 'new', name: 'New', profiles: ['p1'] }])
    expect(ok).toBe(true)
    const w = sent.find(s => s.type === TEAM_EVENT_TYPES.account)
    expect((w?.content as { admission?: AdmissionAnswers }).admission?.answeredAt).toBe(1000)
  })

  it('带残缺答卷 → 拒写（不全视同无答卷）', async () => {
    const store = makeStore()
    const ok = await store.writeSelfAccount([{ slug: 'd', name: 'D', profiles: ['p'] }], { ...FULL, q3: '' })
    expect(ok).toBe(false)
    expect(sent.filter(s => s.type === TEAM_EVENT_TYPES.account)).toHaveLength(0)
  })
})
