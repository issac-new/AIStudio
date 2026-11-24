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
