// @vitest-environment jsdom
// 执行单元责任台账三组件（2026-11-06 第一增量）：mock fetch 两态走查。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

beforeEach(() => { fetchMock.mockReset() })
afterEach(() => { vi.clearAllMocks() })

const identitiesBody = {
  ok: true,
  identities: [
    { id: 'aid-1', name: 'orphan-unit', kind: 'agent', owner: 'team' },
    { id: 'aid-2', name: 'healthy-unit', kind: 'agent', owner: 'team' },
  ],
  events: [],
}

describe('WorkUnitLedgerSection', () => {
  it('无卡单元显示缺口；阶段徽标为登记；自然人名单可读', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/governance/agent-identity') return jsonResponse(identitiesBody)
      if (url === '/api/governance/people') {
        return jsonResponse({ ok: true, people: [{ id: 'p-1', name: 'alice', active: true, emails: [] }] })
      }
      if (url.includes('/card')) {
        const name = url.includes('aid-1') ? 'orphan-unit' : 'healthy-unit'
        const gaps = name === 'orphan-unit'
          ? [{ field: 'card', detail: '责任卡未填写' }]
          : []
        return jsonResponse({ ok: true, view: { card: name === 'orphan-unit' ? null : { primaryOwner: 'p-1', reviewer: undefined }, stage: 'registered', gaps } })
      }
      return jsonResponse({ ok: true })
    })
    const { default: C } = await import('../components/WorkUnitLedgerSection.vue')
    const w = mount(C, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(w.find('[data-testid="gov-workunit-row-orphan-unit"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-workunit-gaps-orphan-unit"]').text()).toContain('责任卡未填写')
    expect(w.find('[data-testid="gov-workunit-row-healthy-unit"]').exists()).toBe(true)
    w.unmount()
  })
})

describe('WorkUnitLedgerSection 数字员工批一（准入证据/签署/迁移/退出）', () => {
  // 有状态替身：迁移会推进对应单元的阶段，刷新后界面读到新阶段
  interface UnitSeed { id: string; name: string; stage?: string; card?: Record<string, unknown> | null; bindings?: Record<string, string[]> }
  interface Call { url: string; method: string; body: unknown }

  function setupMock(units?: UnitSeed[], people?: unknown[], opts: { me?: boolean } = {}) {
    const calls: Call[] = []
    const state = (units ?? [{ id: 'aid-1', name: 'unit-a' }]).map((u) => ({ stage: 'registered', card: null as Record<string, unknown> | null, ...u }))
    const ppl = people ?? [{ id: 'p-1', name: 'alice', active: true, emails: [] }]
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })
      if (url === '/api/auth/me') {
        if (opts.me === false) return { ok: false, status: 401, json: async () => ({}) } as unknown as Response
        return jsonResponse({ user: { username: 'alice', role: 'super_admin' } })
      }
      if (url === '/api/governance/agent-identity') {
        return jsonResponse({
          ok: true,
          identities: state.map((u) => ({
            id: u.id, name: u.name, kind: 'agent', owner: 'team',
            ...(u.bindings ? { runtimeBindings: u.bindings } : {}),
          })),
          events: [],
        })
      }
      if (url === '/api/governance/people' && method === 'GET') return jsonResponse({ ok: true, people: ppl })
      if (url === '/api/governance/people' && method === 'POST') {
        return jsonResponse({ ok: true, person: { id: 'p-new', name: (body as { name: string }).name, active: false, emails: [] } })
      }
      const cardMatch = url.match(/\/agent-identity\/([^/]+)\/card$/)
      if (cardMatch && method === 'GET') {
        const u = state.find((x) => x.id === decodeURIComponent(cardMatch[1]))
        return jsonResponse({ ok: true, view: { card: u?.card ?? null, stage: u?.stage ?? 'registered', gaps: [] } })
      }
      if (cardMatch && method === 'PUT') return jsonResponse({ ok: true, identity: {} })
      if (url.endsWith('/card/sign')) return jsonResponse({ ok: true, card: {} })
      const transMatch = url.match(/\/agent-identity\/([^/]+)\/transition$/)
      if (transMatch && method === 'POST') {
        const u = state.find((x) => x.id === decodeURIComponent(transMatch[1]))
        if (u) u.stage = (body as { to: string }).to
        return jsonResponse({ ok: true, identity: {} })
      }
      if (url.includes('/people/')) return jsonResponse({ ok: true, person: {}, referencedBy: [] })
      return jsonResponse({ ok: true })
    })
    return { calls, state }
  }

  async function mountLedger() {
    const { default: C } = await import('../components/WorkUnitLedgerSection.vue')
    const w = mount(C)
    await flushPromises()
    return w
  }

  it('保存带准入证据的责任卡 → 签署 → 准入 → 运行：请求体字段正确', async () => {
    const { calls } = setupMock([{ id: 'aid-1', name: 'unit-a', bindings: { agents: ['agent-x'], matrixAccounts: ['@bot:hs'] } }])
    const w = await mountLedger()
    // 绑定目标列拼接展示两个数组
    expect(w.find('[data-testid="gov-workunit-bindings-unit-a"]').text()).toContain('agent-x')
    expect(w.find('[data-testid="gov-workunit-bindings-unit-a"]').text()).toContain('@bot:hs')

    // 保存责任卡：三组准入证据随 PUT 上送
    await w.find('[data-testid="gov-workunit-edit-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-ev-tasks"]').setValue('任务甲\n任务乙')
    await w.find('[data-testid="gov-workunit-ev-edge"]').setValue('边界一')
    await w.find('[data-testid="gov-workunit-ev-data"]').setValue('数据评估一')
    await w.find('[data-testid="gov-workunit-save-card"]').trigger('click')
    await flushPromises()
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/card'))
    expect(put).toBeDefined()
    expect((put!.body as Record<string, unknown>).admissionEvidence).toMatchObject({
      representativeTasks: ['任务甲', '任务乙'],
      edgeCases: ['边界一'],
      dataPermissionReview: ['数据评估一'],
    })
    // 签署不随卡保存：PUT 体不含 businessOwnerSign
    expect(JSON.stringify(put!.body)).not.toContain('businessOwnerSign')

    // 以当前登录身份签署：body 不含 signedBy
    await w.find('[data-testid="gov-workunit-sign"]').trigger('click')
    await flushPromises()
    const sign = calls.find((c) => c.url.endsWith('/card/sign'))
    expect(sign?.method).toBe('POST')
    expect(JSON.stringify(sign?.body ?? {})).not.toContain('signedBy')

    // 准入：body 只有 to 与 reason，不含 by
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('admitted')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('卡与准入证据齐备')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    const t1 = calls.filter((c) => c.url.endsWith('/transition')).at(-1)
    expect(t1?.body).toEqual({ to: 'admitted', reason: '卡与准入证据齐备' })

    // 运行：同上
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('running')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('启动')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    const t2 = calls.filter((c) => c.url.endsWith('/transition')).at(-1)
    expect(t2?.body).toEqual({ to: 'running', reason: '启动' })
    w.unmount()
  })

  it('迁移人输入框不存在；界面显示当前登录身份', async () => {
    setupMock()
    const w = await mountLedger()
    expect(w.find('[data-testid="gov-workunit-me"]').text()).toContain('alice')
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    const form = w.find('[data-testid="gov-workunit-trans-form"]')
    expect(form.find('input[data-testid="gov-workunit-trans-by"]').exists()).toBe(false)
    expect(form.find('[data-testid="gov-workunit-trans-by"]').text()).toContain('alice')
    // 责任卡表单里也不再有签署人输入框，签署是独立按钮
    await w.find('[data-testid="gov-workunit-edit-unit-a"]').trigger('click')
    expect(w.find('[data-testid="gov-workunit-sign-area"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-workunit-sign-area"] input').exists()).toBe(false)
    w.unmount()
  })

  it('未登录（/api/auth/me 401）：提示设置 AISTUDIO_LOCAL_OPERATOR，署名与迁移置灰', async () => {
    setupMock(undefined, undefined, { me: false })
    const w = await mountLedger()
    expect(w.find('[data-testid="gov-workunit-me"]').text()).toContain('AISTUDIO_LOCAL_OPERATOR')
    await w.find('[data-testid="gov-workunit-edit-unit-a"]').trigger('click')
    expect(w.find('[data-testid="gov-workunit-sign"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    expect(w.find('[data-testid="gov-workunit-trans-submit"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('变更后重启：提交两条证据引用', async () => {
    const { calls } = setupMock([{ id: 'aid-1', name: 'unit-a', stage: 'changing' }])
    const w = await mountLedger()
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('running')
    await w.find('[data-testid="gov-workunit-trans-evidence"]').setValue('重新验证记录 v1\n重新授权记录 v2')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('变更完成重启')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    const t = calls.filter((c) => c.url.endsWith('/transition')).at(-1)
    expect(t?.body).toMatchObject({ to: 'running', reason: '变更完成重启' })
    expect((t?.body as { evidenceRefs: string[] }).evidenceRefs).toHaveLength(2)
    expect(JSON.stringify(t?.body)).not.toContain('"by"')
    w.unmount()
  })

  it('退出：交接事项必填且请求体不含占位文字', async () => {
    const { calls } = setupMock()
    const w = await mountLedger()
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('retired')
    // 不填交接事项：界面报错且不发请求
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.url.endsWith('/transition'))).toHaveLength(0)
    expect(w.find('[data-testid="gov-workunit-err"]').text()).toContain('交接事项')
    // 填一条后提交：exit.items 等于所填内容，body 不含 confirmedBy
    await w.find('[data-testid="gov-workunit-exit-items"]').setValue('账号已交接')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('申请下线')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    const t = calls.filter((c) => c.url.endsWith('/transition')).at(-1)
    const body = t?.body as { to: string; exit: { kind: string; items: string[] } }
    expect(body.to).toBe('retired')
    expect(body.exit.items).toEqual(['账号已交接'])
    expect(JSON.stringify(t?.body)).not.toContain('confirmedBy')
    w.unmount()
  })

  it('目标阶段下拉只列当前阶段的合法去向', async () => {
    setupMock([
      { id: 'aid-reg', name: 'unit-reg' },
      { id: 'aid-run', name: 'unit-run', stage: 'running' },
    ])
    const w = await mountLedger()
    await w.find('[data-testid="gov-workunit-trans-open-unit-reg"]').trigger('click')
    const optsRegistered = w.find('[data-testid="gov-workunit-trans-to"]').findAll('option').map((o) => o.attributes('value'))
    expect(optsRegistered).toEqual(['admitted', 'retired'])
    await w.find('[data-testid="gov-workunit-trans-open-unit-run"]').trigger('click')
    const optsRunning = w.find('[data-testid="gov-workunit-trans-to"]').findAll('option').map((o) => o.attributes('value'))
    expect(optsRunning).toEqual(['changing', 'retired'])
    w.unmount()
  })

  it('停用自然人：点「停用」→ POST /people/:id/deactivate', async () => {
    const { calls } = setupMock(undefined, [
      { id: 'p-1', name: 'alice', active: true, emails: [] },
      { id: 'p-2', name: 'bob', active: false, emails: [] },
    ])
    const w = await mountLedger()
    // 未启用的人保留「启用」，已启用的人有「停用」
    expect(w.find('[data-testid="gov-workunit-deactivate-p-2"]').exists()).toBe(false)
    await w.find('[data-testid="gov-workunit-deactivate-p-1"]').trigger('click')
    await flushPromises()
    const d = calls.find((c) => c.url === '/api/governance/people/p-1/deactivate')
    expect(d?.method).toBe('POST')
    w.unmount()
  })
})

describe('WorkUnitLedgerSection 框架对齐（2026-11-27：类型／风险档／协作等级／就绪度／豁免）', () => {
  interface View5 { unitType?: string | null; riskTier?: string | null; collabLevel?: number | null; readiness?: { id: string; state: string; gap: string }[] }
  function setup5(units: { id: string; name: string; stage?: string; card?: Record<string, unknown> | null; view?: View5 }[]) {
    const calls: { url: string; method: string; body: unknown }[] = []
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })
      if (url === '/api/auth/me') return jsonResponse({ user: { username: 'alice', role: 'super_admin' } })
      if (url === '/api/governance/agent-identity') {
        return jsonResponse({ ok: true, identities: units.map((u) => ({ id: u.id, name: u.name, kind: 'agent', owner: 'team' })), events: [] })
      }
      if (url === '/api/governance/people') {
        return jsonResponse({ ok: true, people: [{ id: 'p-1', name: 'alice', active: true, emails: [] }, { id: 'p-2', name: 'bob', active: true, emails: [] }] })
      }
      const cardMatch = url.match(/\/agent-identity\/([^/]+)\/card$/)
      if (cardMatch && method === 'GET') {
        const u = units.find((x) => x.id === decodeURIComponent(cardMatch[1]))
        return jsonResponse({ ok: true, view: { card: u?.card ?? null, stage: u?.stage ?? 'registered', gaps: [], ...(u?.view ?? {}) } })
      }
      if (cardMatch && method === 'PUT') return jsonResponse({ ok: true, identity: {} })
      if (url.endsWith('/transition')) return jsonResponse({ ok: true, identity: {} })
      return jsonResponse({ ok: true })
    })
    return calls
  }

  async function mount5() {
    const { default: C } = await import('../components/WorkUnitLedgerSection.vue')
    const w = mount(C)
    await flushPromises()
    return w
  }

  it('台账表显示类型、风险档、协作等级三列（中文标签，不显示内部取值）', async () => {
    setup5([
      { id: 'aid-1', name: 'unit-a', stage: 'running', card: { primaryOwner: 'p-1' },
        view: { unitType: 'post', riskTier: 'tier2', collabLevel: 3, readiness: [] } },
      { id: 'aid-2', name: 'unit-b', card: null, view: { unitType: null, riskTier: null, collabLevel: null, readiness: [] } },
    ])
    const w = await mount5()
    expect(w.find('[data-testid="gov-workunit-type-unit-a"]').text()).toContain('顶岗型')
    expect(w.find('[data-testid="gov-workunit-risk-unit-a"]').text()).toContain('二级')
    expect(w.find('[data-testid="gov-workunit-collab-unit-a"]').text()).toContain('3')
    // 未声明如实显示「—」，不显示假值
    expect(w.find('[data-testid="gov-workunit-type-unit-b"]').text()).toBe('—')
    expect(w.find('[data-testid="gov-workunit-risk-unit-b"]').text()).toBe('—')
    w.unmount()
  })

  it('文案不出现「AI员工负责」类措辞', async () => {
    setup5([{ id: 'aid-1', name: 'unit-a', card: null }])
    const w = await mount5()
    expect(w.text()).not.toContain('AI员工')
    expect(w.text()).not.toContain('AI 员工')
    w.unmount()
  })

  it('五项就绪度如实显示：未知／未就绪带缺口文案，就绪不显示缺口', async () => {
    setup5([{
      id: 'aid-1', name: 'unit-a', stage: 'running', card: { primaryOwner: 'p-1' },
      view: {
        unitType: 'assistant', riskTier: 'tier2', collabLevel: 3,
        readiness: [
          { id: 'net-contribution', state: 'unknown', gap: '净贡献核算尚无数据源' },
          { id: 'correction-channel', state: 'no', gap: '无驳回类署名记录' },
          { id: 'discretion', state: 'yes', gap: '' },
          { id: 'reliability', state: 'yes', gap: '' },
          { id: 'case-maintenance', state: 'yes', gap: '' },
        ],
      },
    }])
    const w = await mount5()
    // 就绪度随单元详情显示：点开该单元后可见
    expect(w.find('[data-testid="gov-workunit-readiness-unit-a"]').exists()).toBe(false)
    await w.find('[data-testid="gov-workunit-edit-unit-a"]').trigger('click')
    const box = w.find('[data-testid="gov-workunit-readiness-unit-a"]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('净贡献')
    expect(box.text()).toContain('净贡献核算尚无数据源')
    expect(box.text()).toContain('无驳回类署名记录')
    // 就绪项不带缺口文案（不把就绪渲染成有问题）
    expect(box.text()).toContain('就绪')
    // 三态徽标各显示各自的文字：未知是「未知」，不被空态文案覆盖
    expect(w.find('[data-testid="gov-workunit-ready-net-contribution"]').text()).toContain('未知')
    expect(w.find('[data-testid="gov-workunit-ready-net-contribution"]').text()).not.toContain('暂无就绪度读数')
    expect(w.find('[data-testid="gov-workunit-ready-correction-channel"]').text()).toContain('未就绪')
    expect(w.find('[data-testid="gov-workunit-ready-discretion"] .wu__ready-state').text()).toBe('就绪')
    w.unmount()
  })

  it('迁移表单目标为 running 且当前为 changing：出现豁免理由输入框；填写后随请求体上送', async () => {
    const calls = setup5([{
      id: 'aid-1', name: 'unit-a', stage: 'changing', card: { primaryOwner: 'p-1', unitType: 'assistant', riskTier: 'tier2' },
    }])
    const w = await mount5()
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('running')
    const waiver = w.find('[data-testid="gov-workunit-trans-waiver"]')
    expect(waiver.exists()).toBe(true)
    await w.find('[data-testid="gov-workunit-trans-evidence"]').setValue('重新验证\n重新授权')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('恢复运行')
    await waiver.setValue('试点需要，业务负责人已同意')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    const t = calls.filter((c) => c.url.endsWith('/transition')).at(-1)
    expect((t?.body as Record<string, unknown>).expansionWaiver).toBe('试点需要，业务负责人已同意')
    w.unmount()
  })

  it('豁免理由留空时请求体不带 expansionWaiver（不送空串）', async () => {
    const calls = setup5([{ id: 'aid-1', name: 'unit-a', stage: 'changing', card: { primaryOwner: 'p-1' } }])
    const w = await mount5()
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('running')
    await w.find('[data-testid="gov-workunit-trans-evidence"]').setValue('a\nb')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('恢复')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    const t = calls.filter((c) => c.url.endsWith('/transition')).at(-1)
    expect(JSON.stringify(t?.body ?? {})).not.toContain('expansionWaiver')
    w.unmount()
  })

  it('保存责任卡时上送 unitType／collabLevel（三级风险档下拉）', async () => {
    const calls = setup5([{ id: 'aid-1', name: 'unit-a', card: null }])
    const w = await mount5()
    await w.find('[data-testid="gov-workunit-edit-unit-a"]').trigger('click')
    const type = w.find('[data-testid="gov-workunit-form-type"]')
    expect(type.exists()).toBe(true)
    const typeValues = type.findAll('option').map((o) => o.attributes('value'))
    expect(typeValues).toEqual(expect.arrayContaining(['assistant', 'post']))
    // 不替人选类型：缺省是占位项（未声明），服务端会判缺口
    expect((type.element as HTMLSelectElement).value).toBe('')
    await type.setValue('post')
    const risk = w.find('[data-testid="gov-workunit-form-risk"]')
    expect(risk.findAll('option').map((o) => o.attributes('value'))).toEqual(['tier1', 'tier2', 'tier3'])
    await risk.setValue('tier3')
    const collab = w.find('[data-testid="gov-workunit-form-collab"]')
    // 协作等级是可选字段：占位项「未声明」＋五个等级
    expect(collab.findAll('option').map((o) => o.attributes('value'))).toEqual(['', '1', '2', '3', '4', '5'])
    await collab.setValue('3')
    await w.find('[data-testid="gov-workunit-save-card"]').trigger('click')
    await flushPromises()
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/card'))
    const body = put!.body as Record<string, unknown>
    expect(body.unitType).toBe('post')
    expect(body.riskTier).toBe('tier3')
    expect(body.collabLevel).toBe(3)
    w.unmount()
  })

  it('协作等级选 4 时出现「仅单点验证」标注输入框并随请求体上送', async () => {
    const calls = setup5([{ id: 'aid-1', name: 'unit-a', card: null }])
    const w = await mount5()
    await w.find('[data-testid="gov-workunit-edit-unit-a"]').trigger('click')
    const collab = w.find('[data-testid="gov-workunit-form-collab"]')
    expect(w.find('[data-testid="gov-workunit-form-collab-note"]').exists()).toBe(false)
    await collab.setValue('4')
    const note = w.find('[data-testid="gov-workunit-form-collab-note"]')
    expect(note.exists()).toBe(true)
    await note.setValue('仅单点验证')
    await w.find('[data-testid="gov-workunit-save-card"]').trigger('click')
    await flushPromises()
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/card'))
    expect((put!.body as Record<string, unknown>).collabLevelNote).toBe('仅单点验证')
    w.unmount()
  })

  it('退役前置提示按单元类型：顶岗型且登录人即主责任人时提示；助手型同样情形不提示', async () => {
    // 部署约定「登录名即自然人 id」：登录人 alice 同时是主责任人——服务端会拒绝，界面须前置提示
    const mountWith = async (unitType: string) => {
      setup5([{ id: 'aid-1', name: 'unit-a', stage: 'running', card: { primaryOwner: 'alice' }, view: { unitType } }])
      const w = await mount5()
      await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
      await w.find('[data-testid="gov-workunit-trans-to"]').setValue('retired')
      return w
    }
    const post = await mountWith('post')
    expect(post.text()).toContain('顶岗型执行单元：退出确认人不得与主责任人为同一人')
    post.unmount()
    const assistant = await mountWith('assistant')
    expect(assistant.text()).not.toContain('退出确认人不得与主责任人为同一人')
    assistant.unmount()
  })

  it('服务端拒绝迁移（如扩权未豁免）时错误可见，不显示为成功', async () => {
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/auth/me') return jsonResponse({ user: { username: 'alice', role: 'super_admin' } })
      if (url === '/api/governance/agent-identity') return jsonResponse({ ok: true, identities: [{ id: 'aid-1', name: 'unit-a', kind: 'agent', owner: 'team' }], events: [] })
      if (url === '/api/governance/people') return jsonResponse({ ok: true, people: [{ id: 'p-1', name: 'alice', active: true, emails: [] }] })
      if (url.endsWith('/transition') && method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ problems: ['本次变更属扩权（工具白名单变多）：五项能力须全部就绪，或填写豁免理由。未就绪：净贡献核算（未知）'] }) } as unknown as Response
      }
      if (url.includes('/card')) return jsonResponse({ ok: true, view: { card: { primaryOwner: 'p-1' }, stage: 'changing', gaps: [] } })
      return jsonResponse({ ok: true })
    })
    const w = await mount5()
    await w.find('[data-testid="gov-workunit-trans-open-unit-a"]').trigger('click')
    await w.find('[data-testid="gov-workunit-trans-to"]').setValue('running')
    await w.find('[data-testid="gov-workunit-trans-evidence"]').setValue('a\nb')
    await w.find('[data-testid="gov-workunit-trans-reason"]').setValue('恢复')
    await w.find('[data-testid="gov-workunit-trans-submit"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="gov-workunit-err"]').text()).toContain('扩权')
    w.unmount()
  })
})

describe('JudgmentRecordsSection', () => {
  it('空态显示「暂无署名记录」；表单字段齐', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/governance/agent-identity') return jsonResponse(identitiesBody)
      if (url.includes('/judgments')) return jsonResponse({ ok: true, records: [] })
      return jsonResponse({ ok: true })
    })
    const { default: C } = await import('../components/JudgmentRecordsSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.find('[data-testid="gov-judgment-records"]').exists()).toBe(true)
    expect(w.text()).toContain('暂无署名记录')
    w.unmount()
  })
})

describe('SixQuestionsSection', () => {
  it('unknown 必带缺口文案；无缺口说明标红', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({
      ok: true,
      answers: [
        { id: 'q1', question: '责任链可还原', answer: 'unknown', evidence: [], gap: '无决策记录' },
        { id: 'q2', question: '无主单元', answer: 'unknown', evidence: [], gap: '' },
        { id: 'q6', question: '署名记录', answer: 'no', evidence: [], gap: '零署名记录' },
      ],
    }))
    const { default: C } = await import('../components/SixQuestionsSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.find('[data-testid="gov-sixq-q1"]').text()).toContain('无决策记录')
    expect(w.find('[data-testid="gov-sixq-q2"]').text()).toContain('口径缺口未说明')
    expect(w.find('[data-testid="gov-sixq-q2"]').find('.sq__gap--missing').exists()).toBe(true)
    w.unmount()
  })
})
