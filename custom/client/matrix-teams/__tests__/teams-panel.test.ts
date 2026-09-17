// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/teams-panel.test.ts
// Teams 管理面板守门：未配置态（创建+候选）、账号树渲染、自己可编辑、leader 管理区显隐。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'

const registryState = vi.hoisted(() => ({
  registryRoomId: { value: null as string | null },
  accounts: { value: [] as Array<Record<string, unknown>> },
  leaders: { value: [] as string[] },
  undeclared: { value: [] as string[] },
  duties: { value: {} as Record<string, unknown> },
  ready: { value: false },
  lastError: { value: null },
  isLeader: { value: false },
  ensureListening: vi.fn(),
  detectRegistry: vi.fn(async () => {}),
  registryCandidateRooms: vi.fn(() => [{ roomId: '!reg:sv', name: 'Swarm Teams' }]),
  setRegistryRoom: vi.fn(async () => {}),
  createRegistryRoom: vi.fn(async () => '!new:sv'),
  writeSelfAccount: vi.fn(async () => true),
  writeLeaders: vi.fn(async () => true),
  inviteMember: vi.fn(async () => true),
  writeDuty: vi.fn(async () => true),
  clearDuty: vi.fn(async () => true),
  attachRoom: vi.fn(),
  rebuild: vi.fn(async () => {}),
}))
// 预检 ruling 允许的适配：brief 的 mock 是普通 { value } 对象，无响应性——
// 「isLeader 变化后重渲染」「registryRoomId 变化切区」依赖响应式。
// 工厂内用真 ref 替换同名字段，再以 reactive 包装（等价 pinia store 的 ref 解包语义），
// 断言意图与断言本体不变。
vi.mock('../stores/team-registry', async () => {
  const { ref, reactive } = await import('vue')
  for (const k of ['registryRoomId', 'accounts', 'leaders', 'undeclared', 'duties', 'ready', 'lastError', 'isLeader'] as const) {
    ;(registryState as unknown as Record<string, unknown>)[k] = ref((registryState as unknown as Record<string, { value: unknown }>)[k].value)
  }
  return { useTeamRegistryStore: () => reactive(registryState) }
})
// Task 7 接线后 tmp__side 挂 DutyAssignPanel，其消费 roomStore.sortedRooms；
// 与 duty-panel.test.ts 同款 mock（真 store 在 jsdom 下 init 面不可控）。
vi.mock('@/custom/matrix-chat/stores/matrix-room', async () => {
  const { ref, reactive } = await import('vue')
  return {
    useMatrixRoomStore: () => reactive({
      sortedRooms: ref([
        { roomId: '!room1:sv', name: '客户一群', timeline: [] },
        { roomId: '!room2:sv', name: '客户二群', timeline: [] },
      ]),
    }),
  }
})
vi.mock('@/stores/hermes/profiles', async () => {
  const { ref, reactive } = await import('vue')
  return { useProfilesStore: () => reactive({ profiles: ref([{ name: 'alice' }, { name: 'alice-2' }]) }) }
})
vi.mock('@/custom/matrix-chat/stores/matrix-client', async () => {
  const { ref, reactive } = await import('vue')
  return {
    // Task 10 接线后右栏挂 DispatchList；task-dispatch store 在 setup 顶层挂监听
    //（终审修复，pinia effect scope）→ 实例化即调 SDK on/off；
    // mock client 补齐监听面（真 store 在 jsdom 下 init 面不可控，同 roomStore mock 理由）。
    useMatrixClientStore: () => reactive({
      client: ref({ on: () => {}, off: () => {} }), userId: ref('@alice:sv'), authenticated: ref(true),
    }),
  }
})

import TeamsManagePanel from '../views/TeamsManagePanel.vue'

const i18n = createI18n({
  legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
  messages: { en: { teams: {
    title: 'Teams', 'registry.none': 'No registry', 'registry.create': 'Create', 'registry.setName': 'Name',
    'registry.inviteIds': 'Invite', 'registry.candidates': 'Candidates', 'registry.useThis': 'Use',
    accounts: 'Accounts', 'accounts.empty': 'Empty', 'leader.badge': 'leader', 'leader.manage': 'Leaders',
    'leader.add': 'Add', 'invite.button': 'Invite', 'self.hint': 'Edit', matrixOffline: 'offline',
    agentTeams: 'Agent Teams', 'agentTeams.add': 'Add team', 'agentTeams.name': 'Name',
    'agentTeams.profiles': 'Profiles', 'agentTeams.defaultProfile': 'Default', 'agentTeams.save': 'Save',
  } } },
})

beforeEach(() => { setActivePinia(createPinia()) })

function mountPanel() {
  return mount(TeamsManagePanel, { global: { plugins: [i18n], stubs: { teleport: true } } })
}

describe('未配置注册房间', () => {
  it('渲染创建区与候选房间；候选可设定', async () => {
    registryState.registryRoomId.value = null
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-setup"]').exists()).toBe(true)
    const cand = w.find('[data-testid="teams-candidate-!reg:sv"]')
    expect(cand.exists()).toBe(true)
    await cand.trigger('click')
    expect(registryState.setRegistryRoom).toHaveBeenCalledWith('!reg:sv')
  })
  it('填写名称点创建 → createRegistryRoom（邀请框留空传 []）', async () => {
    registryState.createRegistryRoom.mockClear()
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="teams-create-name"]').setValue('Swarm Teams')
    await w.find('[data-testid="teams-create-submit"]').trigger('click')
    await flushPromises()
    expect(registryState.createRegistryRoom).toHaveBeenCalledWith('Swarm Teams', [])
  })
  it('邀请框多分隔符混排（半角逗号+全角逗号+空格）→ 解析为四个 Matrix ID', async () => {
    registryState.createRegistryRoom.mockClear()
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="teams-create-name"]').setValue('Swarm Teams')
    await w.find('[data-testid="teams-create-invite"]').setValue('@a:sv,@b:sv，@c:sv  @d:sv')
    await w.find('[data-testid="teams-create-submit"]').trigger('click')
    await flushPromises()
    expect(registryState.createRegistryRoom).toHaveBeenCalledWith('Swarm Teams',
      ['@a:sv', '@b:sv', '@c:sv', '@d:sv'])
  })
})

describe('已配置注册房间', () => {
  beforeEach(() => {
    registryState.registryRoomId.value = '!reg:sv'
    registryState.accounts.value = [
      { userId: '@alice:sv', displayName: 'alice', agentTeams: [{ slug: 'dev', name: 'Dev', profiles: ['alice'], defaultProfile: 'alice' }], isLeader: false, declared: true },
      { userId: '@bob:sv', displayName: 'bob', agentTeams: [], isLeader: true, declared: true },
    ]
    registryState.leaders.value = ['@bob:sv']
    registryState.isLeader.value = true
    registryState.undeclared.value = ['@carol:sv']
  })
  it('账号树渲染成员条目 + agentTeams + leader 徽标', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-account-@alice:sv"]').exists()).toBe(true)
    expect(w.find('[data-testid="teams-account-@bob:sv"]').exists()).toBe(true)
    expect(w.find('[data-testid="teams-account-@bob:sv"] [data-testid="teams-leader-badge"]').exists()).toBe(true)
    expect(w.text()).toContain('@alice:sv/dev')
  })
  it('当前登录账号显示编辑器；保存调 writeSelfAccount', async () => {
    registryState.writeSelfAccount.mockClear()
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-editor"]').exists()).toBe(true)
    await w.find('[data-testid="teams-editor-save"]').trigger('click')
    await flushPromises()
    expect(registryState.writeSelfAccount).toHaveBeenCalled()
  })
  it('编辑器同名两行 → save 出的 slug 去重（第二名加序号后缀）', async () => {
    registryState.writeSelfAccount.mockClear()
    registryState.accounts.value = [
      { userId: '@alice:sv', displayName: 'alice', isLeader: false, declared: true, agentTeams: [
        { slug: 'dev', name: 'Dev', profiles: ['alice'], defaultProfile: 'alice' },
        { slug: 'ops', name: 'Dev', profiles: ['alice-2'], defaultProfile: 'alice-2' },
      ] },
    ]
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="teams-editor-save"]').trigger('click')
    await flushPromises()
    expect(registryState.writeSelfAccount).toHaveBeenCalledTimes(1)
    const saved = registryState.writeSelfAccount.mock.calls[0][0] as Array<{ slug: string }>
    expect(saved.map(t => t.slug)).toEqual(['dev', 'dev-2'])
  })
  it('isLeader=true 显示邀请与 leader 管理；false 隐藏', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-admin"]').exists()).toBe(true)
    registryState.isLeader.value = false
    await flushPromises()
    expect(w.find('[data-testid="teams-admin"]').exists()).toBe(false)
  })
  it('邀请输入 + 点击 → inviteMember(userId)', async () => {
    registryState.inviteMember.mockClear()
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="teams-invite-input"]').setValue('@carol:sv')
    await w.find('[data-testid="teams-invite-submit"]').trigger('click')
    expect(registryState.inviteMember).toHaveBeenCalledWith('@carol:sv')
  })
})
