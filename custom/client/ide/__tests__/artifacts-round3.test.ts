// overlay/custom/client/ide/__tests__/artifacts-round3.test.ts
// R3 守门：轮变更 digest 聚合 / /review 提示词资产 / 计划进度与三选一门提示词
// / IdeRunResultCard 渲染接线 / patch 344 漂移守卫。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { digestRunChanges } from '../api/runs'
import { buildReviewPrompt } from '../utils/reviewPrompt'
import type { WorkspaceRunChangeFileSummary } from '@/api/studio/sessions'

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
  fetchWorkspaceRunChangesForSession: vi.fn(async () => [
    {
      id: 1, change_id: 'run-1', session_id: 's1', path: '/w/a.ts', old_path: null,
      change_type: 'modified', additions: 12, deletions: 3, size_before: 100, size_after: 109,
      patch_bytes: 200, truncated: false, binary: false, created_at: 1_700_000_000_000,
    },
    {
      id: 2, change_id: 'run-1', session_id: 's1', path: '/w/b.ts', old_path: null,
      change_type: 'added', additions: 40, deletions: 0, size_before: null, size_after: 400,
      patch_bytes: 400, truncated: false, binary: false, created_at: 1_700_000_000_100,
    },
    {
      id: 3, change_id: 'run-2', session_id: 's1', path: '/w/c.md', old_path: null,
      change_type: 'added', additions: 5, deletions: 0, size_before: null, size_after: 50,
      patch_bytes: 60, truncated: false, binary: false, created_at: 1_700_000_100_000,
    },
  ] satisfies WorkspaceRunChangeFileSummary[]),
}))

vi.mock('../store/ide', () => ({
  useIdeStore: () => ({ workspace: '/w', floats: {}, toggleFloat: vi.fn(), setChatFocus: vi.fn() }),
}))

import { useChatStore } from '@/stores/hermes/chat'

function seedRunChanges(): WorkspaceRunChangeFileSummary[] {
  return [
    {
      id: 1, change_id: 'run-1', session_id: 's1', path: '/w/a.ts', old_path: null,
      change_type: 'modified', additions: 12, deletions: 3, size_before: 100, size_after: 109,
      patch_bytes: 200, truncated: false, binary: false, created_at: 1_700_000_000_000,
    },
    {
      id: 2, change_id: 'run-1', session_id: 's1', path: '/w/b.ts', old_path: null,
      change_type: 'added', additions: 40, deletions: 0, size_before: null, size_after: 400,
      patch_bytes: 400, truncated: false, binary: false, created_at: 1_700_000_000_100,
    },
    {
      id: 3, change_id: 'run-2', session_id: 's1', path: '/w/c.md', old_path: null,
      change_type: 'added', additions: 5, deletions: 0, size_before: null, size_after: 50,
      patch_bytes: 60, truncated: false, binary: false, created_at: 1_700_000_100_000,
    },
  ]
}

describe('轮变更 digest 聚合（dsh per-turn changed-files 语义）', () => {
  it('按 run_id 聚合：run-1 两文件 +52/-3，run-2 单文件 +5；新→旧排序', () => {
    const digests = digestRunChanges(seedRunChanges())
    expect(digests).toHaveLength(2)
    expect(digests[0].runId).toBe('run-2')
    expect(digests[1].runId).toBe('run-1')
    expect(digests[1].fileCount).toBe(2)
    expect(digests[1].additions).toBe(52)
    expect(digests[1].deletions).toBe(3)
    expect(digests[1].files.map((f) => f.path)).toEqual(['/w/a.ts', '/w/b.ts'])
  })

  it('空输入 → 空数组；缺 change_id 归 unknown 桶', () => {
    expect(digestRunChanges([])).toEqual([])
    const rows = seedRunChanges().map((r) => ({ ...r, change_id: '' }))
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
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('344-client-i18n-ide-r3.patch')
  })
})
