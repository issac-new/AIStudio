// overlay/custom/client/ide/__tests__/artifacts-round3.test.ts
// R3 守门：轮变更 digest 聚合 / /review 提示词资产 / 计划进度与三选一门提示词
// / IdeRunResultCard 渲染接线 / patch 344 漂移守卫。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { digestRunChanges } from '../api/runs'
import { buildReviewPrompt } from '../utils/reviewPrompt'
import type { WorkspaceRunChangeSummary } from '@/api/studio/sessions'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k) }) }))

vi.mock('@/stores/hermes/chat', () => {
  const fake = reactive({
    sessions: [] as Array<Record<string, unknown>>,
    activeSessionId: null as string | null,
    isRunActive: false,
    abortState: null,
    runStartedAt: new Map<string, number>(),
    get activeSession(): Record<string, unknown> | null {
      return fake.sessions.find((s) => s.id === fake.activeSessionId) ?? null
    },
  })
  return { useChatStore: () => fake }
})

vi.mock('@/api/studio/sessions', () => ({
  // 契约守卫：mock 必须是 upstream 真实形态——按 run 聚合的 summary（自带
  // files_changed/additions/deletions 与 files 子数组），不是扁平文件行。
  fetchWorkspaceRunChangesForSession: vi.fn(async () => seedSummaries()),
}))

vi.mock('../store/ide', () => ({
  useIdeStore: () => ({ workspace: '/w', floats: {}, toggleFloat: vi.fn(), setChatFocus: vi.fn() }),
}))

import { useChatStore } from '@/stores/hermes/chat'

function seedSummaries(): WorkspaceRunChangeSummary[] {
  return [
    {
      change_id: 'chg-1', session_id: 's1', run_id: 'run-1', source: 'run',
      workspace: '/w', workspace_kind: 'git',
      started_at: 1_700_000_000_000, finished_at: 1_700_000_050_000,
      files_changed: 2, additions: 52, deletions: 3,
      truncated: false, total_patch_bytes: 600, created_at: 1_700_000_050_000,
      files: [
        {
          id: 1, change_id: 'chg-1', session_id: 's1', path: '/w/a.ts', old_path: null,
          change_type: 'modified', additions: 12, deletions: 3, size_before: 100, size_after: 109,
          patch_bytes: 200, truncated: false, binary: false, created_at: 1_700_000_000_000,
        },
        {
          id: 2, change_id: 'chg-1', session_id: 's1', path: '/w/b.ts', old_path: null,
          change_type: 'added', additions: 40, deletions: 0, size_before: null, size_after: 400,
          patch_bytes: 400, truncated: false, binary: false, created_at: 1_700_000_000_100,
        },
      ],
    },
    {
      change_id: 'chg-2', session_id: 's1', run_id: 'run-2', source: 'run',
      workspace: '/w', workspace_kind: 'git',
      started_at: 1_700_000_100_000, finished_at: 1_700_000_150_000,
      files_changed: 1, additions: 5, deletions: 0,
      truncated: false, total_patch_bytes: 60, created_at: 1_700_000_150_000,
      files: [
        {
          id: 3, change_id: 'chg-2', session_id: 's1', path: '/w/c.md', old_path: null,
          change_type: 'added', additions: 5, deletions: 0, size_before: null, size_after: 50,
          patch_bytes: 60, truncated: false, binary: false, created_at: 1_700_000_100_000,
        },
      ],
    },
  ]
}

describe('轮变更 digest 聚合（upstream 按 run 聚合 summary 契约）', () => {
  it('run-1 两文件 +52/-3，run-2 单文件 +5；按 finished_at 新→旧排序', () => {
    const digests = digestRunChanges(seedSummaries())
    expect(digests).toHaveLength(2)
    expect(digests[0].runId).toBe('run-2')
    expect(digests[1].runId).toBe('run-1')
    expect(digests[1].fileCount).toBe(2)
    expect(digests[1].additions).toBe(52)
    expect(digests[1].deletions).toBe(3)
    expect(digests[1].files.map((f) => f.path)).toEqual(['/w/a.ts', '/w/b.ts'])
  })

  it('数字后缀 run id 按时间排序不字典序错位（run-10 新于 run-9 时排前）', () => {
    const base = seedSummaries()
    const digests = digestRunChanges([
      { ...base[0], run_id: 'run-9', finished_at: 1_700_000_050_000 },
      { ...base[1], run_id: 'run-10', finished_at: 1_700_000_950_000 },
    ])
    expect(digests[0].runId).toBe('run-10')
    expect(digests[1].runId).toBe('run-9')
  })

  it('空输入 → 空数组；缺 run_id/change_id 归 unknown 桶', () => {
    expect(digestRunChanges([])).toEqual([])
    const rows = seedSummaries().map((r) => ({ ...r, run_id: '', change_id: '' }))
    expect(digestRunChanges(rows)[0].runId).toBe('unknown')
  })
})

describe('/review 提示词资产（codex-product 只读评审语义）', () => {
  it('含只读硬约束/三级严重度/总评先行/建议动作', () => {
    const p = buildReviewPrompt()
    expect(p).toContain('只读')
    expect(p).toContain('P0')
    expect(p).toContain('P1')
    expect(p).toContain('P2')
    expect(p).toContain('总评')
    expect(p).toContain('建议动作')
    expect(p).toContain('git status')
  })

  it('scope 透传；缺省为当前工作区未提交改动', () => {
    expect(buildReviewPrompt({ scope: 'packages/server' })).toContain('packages/server')
    expect(buildReviewPrompt()).toContain('当前工作区全部未提交改动')
  })
})

describe('IdeRunResultCard 接线（codex-product 任务结果卡语义）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  function fakeStore(): ReturnType<typeof useChatStore> {
    return useChatStore()
  }

  async function flushJobs(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }

  it('非运行 + 有 workspace + runStartedAt → 渲染结果卡（时长/变更行/±）', async () => {
    const fake = fakeStore()
    fake.sessions = [
      {
        id: 's1',
        updatedAt: 1_700_000_050_000,
        messages: [{ role: 'assistant', content: '已完成全部 3 处重构。' }],
      },
    ]
    fake.activeSessionId = 's1'
    fake.runStartedAt.set('s1', 1_700_000_000_000) // 50 秒前
    const { default: IdeRunResultCard } = await import('../views/IdeRunResultCard.vue')
    const w = mount(IdeRunResultCard)
    await flushJobs()
    expect(w.find('[data-testid="ide-run-result"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-run-result-verify"]').text()).toContain('已完成全部 3 处重构')
    const rows = w.findAll('[data-testid="ide-run-result-runs"] li')
    expect(rows.length).toBe(2)
    expect(rows[1].text()).toContain('+52')
    expect(rows[1].text()).toContain('−3')
  })

  it('运行中不渲染；接口失败降级为空（不炸）', async () => {
    const fake = fakeStore()
    fake.sessions = [{ id: 's1', updatedAt: 1_700_000_050_000, messages: [] }]
    fake.activeSessionId = 's1'
    fake.isRunActive = true
    const { default: IdeRunResultCard } = await import('../views/IdeRunResultCard.vue')
    const w = mount(IdeRunResultCard)
    await flushJobs()
    expect(w.find('[data-testid="ide-run-result"]').exists()).toBe(false)
    fake.isRunActive = false
    const { fetchWorkspaceRunChangesForSession } = await import('@/api/studio/sessions')
    vi.mocked(fetchWorkspaceRunChangesForSession).mockRejectedValueOnce(new Error('boom'))
    await flushJobs()
    expect(w.find('[data-testid="ide-run-result"]')).toBeTruthy()
  })

  it('切换会话即重载：卡片不残留上一会话的变更行', async () => {
    const fake = fakeStore()
    fake.sessions = [
      { id: 's1', updatedAt: 1_700_000_050_000, messages: [] },
      { id: 's2', updatedAt: 1_700_000_060_000, messages: [] },
    ]
    fake.activeSessionId = 's1'
    fake.runStartedAt.set('s1', 1_700_000_000_000)
    // 显式重建 mock：上一用例 mockRejectedValueOnce 的 once 队列可能未被消费
    // （watcher 在 mock 入队前已跑完），泄漏到本用例会让首个 fetch 意外 reject。
    // 按会话参数化而非 once 队列：前序用例未 unmount 的组件实例也持有
    // activeSessionId watcher，once 值会被谁消费取决于 watcher 注册顺序。
    const { fetchWorkspaceRunChangesForSession } = await import('@/api/studio/sessions')
    const fetchMock = vi.mocked(fetchWorkspaceRunChangesForSession)
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (sid: string) => (sid === 's1' ? seedSummaries() : []))
    const { default: IdeRunResultCard } = await import('../views/IdeRunResultCard.vue')
    const w = mount(IdeRunResultCard)
    await flushJobs()
    expect(w.findAll('[data-testid="ide-run-result-runs"] li').length).toBe(2)

    // 切到 s2：fetch 返回空（无变更），旧会话的 run 行不得残留
    fake.activeSessionId = 's2'
    fake.runStartedAt.set('s2', 1_700_000_010_000)
    await flushJobs()
    expect(w.findAll('[data-testid="ide-run-result-runs"] li').length).toBe(0)
    // 且对新会话发起的是新请求
    expect(fetchMock).toHaveBeenCalledWith('s2')
  })
})

describe('patch 344 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('344 双语含 runResult/plan/paletteCmdReview；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/344-client-i18n-ide-r3.patch'), 'utf8')
    for (const key of ['runResult', 'actImplement', 'paletteCmdReview']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('344-client-i18n-ide-r3.patch')
    // manifest 只存在于执行过 npm run inject 的检出（主 overlay 根）；
    // worktree/CI 检出无注入态时跳过该项，series 守卫已保下限
    const manifestPath = resolve(overlayRoot, '.overlay-injected.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      expect(manifest.appliedPatches).toContain('344-client-i18n-ide-r3.patch')
    }
  })
})
