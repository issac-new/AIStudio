// 知识分区组件守门（KG 演化治理 UI，2026-10-02）：
// ① 挂载渲染：自动同步状态行（启用态/pending/arm-disarm 按钮）+ 版本下拉 + 回滚确认链
// ② 同步报告：governed/dedup 统计与熔断原因如实展示
// ③ 收件箱：merge-review 条目带相似度标签
// ④ 交互：disarm→disarmKg 被调；选版本→回滚两步确认→rollbackKg(board, ts)
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const api = await import('@/custom/governance/api/governance')

const TS = 1_727_000_000_000

vi.mock('@/custom/governance/api/governance', () => ({
  fetchKgSummary: vi.fn(async () => ({ ok: true, board: 'demo', nodes: 3, edges: 1, byType: { task: 2, agent: 1 }, recent: [] })),
  fetchConflictInbox: vi.fn(async () => ({
    ok: true,
    inbox: [{
      inboxId: 'ci-1', ts: Date.now(), board: 'demo', entityId: 'agent:bob workers', field: 'name',
      existing: 'bob worker', incoming: 'bob workers', resolved: false, kind: 'merge-review', similarity: 0.62,
    }],
  })),
  syncKnowledgeGraph: vi.fn(async () => ({
    ok: true,
    results: [{
      board: 'demo', scanned: 5, ingested: 3, relations: 2, conflicts: [], kgAvailable: true,
      governed: { auto: 2, manual: 1, breaker: false }, dedup: { autoAlias: 1, review: 1 },
    }],
  })),
  resolveConflict: vi.fn(async () => ({ ok: true })),
  kgEvolutionStatus: vi.fn(async () => ({
    ok: true, envEnabled: true, armed: true, running: false, intervalMs: 60_000, batchSize: 3, batchWindowMs: 30_000,
    minSyncIntervalMs: 300_000, pendingCount: 2,
    pending: [{ slug: 'b1', mtimeMs: 1, firstSeenAt: 1, count: 5, ageMs: 10 }],
    lastSuccessAt: Date.now() - 600_000, throttleRemainMs: 0,
  })),
  tickKg: vi.fn(async () => ({ ok: true, tick: { synced: true, reason: 'forced', pendingCount: 0 } })),
  armKg: vi.fn(async () => ({ ok: true, armed: true, envEnabled: true })),
  disarmKg: vi.fn(async () => ({ ok: true, armed: false, envEnabled: true })),
  fetchKgVersions: vi.fn(async () => ({ ok: true, board: 'demo', versions: [{ ts: TS, file: `/v/kg-${TS}.json`, bytes: 2048, nodes: 7 }] })),
  rollbackKg: vi.fn(async () => ({ ok: true, board: 'demo', ts: TS, preRollback: '/v/pre-rollback-1.json' })),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

async function mountSection() {
  const { default: KnowledgeGraphSection } = await import('@/custom/governance/components/KnowledgeGraphSection.vue')
  return mount(KnowledgeGraphSection, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('KnowledgeGraphSection KG 演化治理扩展', () => {
  it('自动同步状态行：启用态 + pending 数 + arm/disarm/tick 按钮；disarm 走 API', async () => {
    const w = await mountSection()
    await flushPromises()
    expect(w.find('[data-testid="kg-autosync"]').exists()).toBe(true)
    expect(w.find('[data-testid="kg-autosync-on"]').exists()).toBe(true)
    expect(w.find('[data-testid="kg-autosync"]').text()).toContain('待同步板 2')
    expect(w.find('[data-testid="kg-disarm"]').exists()).toBe(true)
    await w.find('[data-testid="kg-tick"]').trigger('click')
    await flushPromises()
    expect(api.tickKg).toHaveBeenCalledTimes(1)
    await w.find('[data-testid="kg-disarm"]').trigger('click')
    await flushPromises()
    expect(api.disarmKg).toHaveBeenCalledTimes(1)
  })

  it('同步报告显示 governed/dedup 统计；收件箱 merge-review 带相似度标签', async () => {
    const w = await mountSection()
    await flushPromises()
    await w.find('[data-testid="kg-sync"]').trigger('click')
    await flushPromises()
    const log = w.find('[data-testid="kg-sync-log"]').text()
    expect(log).toContain('自动放行 2')
    expect(log).toContain('转人工 1')
    expect(log).toContain('自动别名 1')
    expect(log).toContain('去重待审 1')
    const tag = w.find('[data-testid="kg-merge-review-tag"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('0.62')
  })

  it('版本与回滚：下拉选择 → 两步确认 → rollbackKg(board, ts)', async () => {
    const w = await mountSection()
    await flushPromises()
    const select = w.find('[data-testid="kg-version-select"]')
    expect(select.exists()).toBe(true)
    expect(select.findAll('option')).toHaveLength(2)  // 占位 disabled + 1 份快照
    // 未选版本时回滚按钮禁用
    expect((w.find('[data-testid="kg-rollback"]').element as HTMLButtonElement).disabled).toBe(true)
    await select.setValue(String(TS))
    await w.find('[data-testid="kg-rollback"]').trigger('click')
    expect(w.find('[data-testid="kg-rollback-confirm"]').exists()).toBe(true)  // 第一步：出确认文案
    expect(w.find('.kg__versions').text()).toContain('pre-rollback')  // 确认文案含可再回滚语义
    await w.find('[data-testid="kg-rollback-confirm"]').trigger('click')  // 第二步：真回滚
    await flushPromises()
    expect(api.rollbackKg).toHaveBeenCalledWith('demo', TS)
  })
})
