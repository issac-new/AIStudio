// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/duty-badge.test.ts
// 值守徽标守门：归属判定命中房间集合；MatrixRoomList 渲染徽标。
// 预检 ruling：vi.mock 全部 hoisted 顶层（写在 it() 体内无效）；
// mock 面按 MatrixRoomList 实际源码契约对齐（store 经 pinia 解包访问 →
// reactive(ref) 包装，同 teams-panel.test.ts 惯例）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import type { DutyContent } from '../protocol'
import { onDutyRoomIds } from '../adapters/accounts'
import type { TeamAccountView } from '../adapters/accounts'

const accounts: TeamAccountView[] = [
  { userId: '@alice:sv', displayName: 'alice', isLeader: false, declared: true,
    agentTeams: [{ slug: 'ops', name: 'Ops', profiles: ['pa'] }] },
]
// bob 需带已声明的 dev team 才构成「自有 agentTeam」命中——dutyAppliesToUser（Task 2 定稿）
// 对 agentTeam 命中以 accounts 内的声明为准，brief 原稿传 [] 的用例与其矛盾，此处修 fixture 不改语义。
const bobAccounts: TeamAccountView[] = [
  { userId: '@bob:sv', displayName: 'bob', isLeader: false, declared: true,
    agentTeams: [{ slug: 'dev', name: 'Dev', profiles: ['pb'] }] },
]
const duties: Record<string, DutyContent> = {
  '!r1:sv': { assigneeKind: 'account', assigneeId: '@alice:sv', updatedBy: '@l:sv', updatedAt: 1 },
  '!r2:sv': { assigneeKind: 'agentTeam', assigneeId: '@bob:sv/dev', updatedBy: '@l:sv', updatedAt: 2 },
}

describe('onDutyRoomIds', () => {
  it('account 直配与自有 agentTeam 都命中；他人不命中', () => {
    expect(onDutyRoomIds(duties, '@alice:sv', accounts)).toEqual(new Set(['!r1:sv']))
    expect(onDutyRoomIds(duties, '@bob:sv', bobAccounts)).toEqual(new Set(['!r2:sv']))
    expect(onDutyRoomIds(duties, '@carol:sv', [])).toEqual(new Set())
  })
})

// ── MatrixRoomList 徽标渲染（mock 全部顶层 hoisted，ruling 要求）──
const registryState = vi.hoisted(() => ({
  accounts: { value: [] as unknown[] }, duties: { value: {} as Record<string, unknown> },
  registryRoomId: { value: '!reg:sv' }, leaders: { value: [] as string[] },
  undeclared: { value: [] as string[] }, ready: { value: true },
  lastError: { value: null }, isLeader: { value: false },
  ensureListening: vi.fn(), detectRegistry: vi.fn(async () => {}), registryCandidateRooms: vi.fn(() => []),
  setRegistryRoom: vi.fn(async () => {}), createRegistryRoom: vi.fn(async () => null),
  writeSelfAccount: vi.fn(async () => false), writeLeaders: vi.fn(async () => false),
  writeDuty: vi.fn(async () => false), clearDuty: vi.fn(async () => false),
  inviteMember: vi.fn(async () => false), attachRoom: vi.fn(), rebuild: vi.fn(async () => {}),
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', async () => {
  const { ref, reactive } = await import('vue')
  for (const k of ['registryRoomId', 'accounts', 'leaders', 'undeclared', 'duties', 'ready', 'lastError', 'isLeader'] as const) {
    ;(registryState as unknown as Record<string, unknown>)[k] = ref((registryState as unknown as Record<string, { value: unknown }>)[k].value)
  }
  return { useTeamRegistryStore: () => reactive(registryState) }
})
vi.mock('@/custom/matrix-chat/stores/matrix-client', async () => {
  const { ref, reactive } = await import('vue')
  // MatrixRoomList 读 syncState/authenticated（同步/空态判定）；徽标读 userId。
  return {
    useMatrixClientStore: () => reactive({
      client: ref({}), userId: ref('@alice:sv'), authenticated: ref(true), syncState: ref('PREPARED'),
    }),
  }
})
vi.mock('@/custom/matrix-chat/stores/matrix-room', async () => {
  const { ref, reactive } = await import('vue')
  // MatrixRoomList 实际消费面：sortedRooms（含 timeline/name）、activeRoomId、selectRoom
  // + avatar/加密/公开/未读/通知等级五个查询函数（源码 sed -n '1,80p' 对齐）。
  return {
    useMatrixRoomStore: () => reactive({
      sortedRooms: ref([
        { roomId: '!r1:sv', name: '值守群', timeline: [] },
        { roomId: '!r3:sv', name: '普通群', timeline: [] },
      ]),
      activeRoomId: ref(null),
      selectRoom: vi.fn(),
      getRoomAvatarUrl: vi.fn(() => null),
      isRoomEncrypted: vi.fn(() => false),
      isRoomPublic: vi.fn(() => false),
      getRoomUnreadCount: vi.fn(() => 0),
      getRoomNotificationLevel: vi.fn(() => 'total' as const),
    }),
  }
})

import MatrixRoomList from '@/custom/matrix-chat/components/MatrixRoomList.vue'

const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
  messages: { en: { teams: { duty: { mine: 'On duty' } } } } })

beforeEach(() => {
  setActivePinia(createPinia())
  ;(registryState as unknown as { accounts: { value: unknown[] } }).accounts.value = accounts
  ;(registryState as unknown as { duties: { value: Record<string, unknown> } }).duties.value = duties
})

it('MatrixRoomList 对本账号值守房间渲染徽标，非值守房间不渲染', async () => {
  // 注：setup.ts 全局 mock useI18n（t 返回原键，组件测试只断言结构不断言文案），
  // 徽标断言即存在性（ruling：值守房间有 room-duty-badge、非值守无）。
  const w = mount(MatrixRoomList, { global: { plugins: [i18n] } })
  expect(w.find('[data-testid="room-!r1:sv"]').exists()).toBe(true)
  expect(w.find('[data-testid="room-!r1:sv"] [data-testid="room-duty-badge"]').exists()).toBe(true)
  expect(w.find('[data-testid="room-!r3:sv"]').exists()).toBe(true)
  expect(w.find('[data-testid="room-!r3:sv"] [data-testid="room-duty-badge"]').exists()).toBe(false)
})
