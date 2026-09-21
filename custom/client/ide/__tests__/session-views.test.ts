// overlay/custom/client/ide/__tests__/session-views.test.ts
// 三段视图守门（用户截图理念：进行中/已完成/工作空间）：
// bucketSessions 分桶口径 / isActiveSession 边界 / 侧栏 taskGroups 视图接线
// （工作空间强制 project 分桶）/ patch 347 漂移守卫。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { bucketSessions, isActiveSession, ACTIVE_WINDOW_MS } from '../utils/sessionBuckets'
import type { Session } from '@/stores/hermes/chat'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const NOW = 1_700_000_000_000

function mkSession(over: Partial<Session>): Session {
  return {
    id: over.id ?? 's',
    title: over.title ?? 't',
    messages: [],
    createdAt: NOW - 100_000,
    updatedAt: NOW - 100_000,
    ...over,
  } as Session
}

describe('isActiveSession / bucketSessions 分桶口径', () => {
  it('流式进行中 = active（无视时间）；24h 内活跃 = active；超窗 = done', () => {
    expect(isActiveSession(mkSession({ isStreaming: true } as never), NOW)).toBe(true)
    expect(isActiveSession(mkSession({ updatedAt: NOW - ACTIVE_WINDOW_MS / 2 }), NOW)).toBe(true)
    expect(isActiveSession(mkSession({ updatedAt: NOW - ACTIVE_WINDOW_MS - 1 }), NOW)).toBe(false)
    // 边界：正好 24h 算 active（≤）
    expect(isActiveSession(mkSession({ updatedAt: NOW - ACTIVE_WINDOW_MS }), NOW)).toBe(true)
  })

  it('lastActiveAt 优先于 updatedAt；归档一律不进桶', () => {
    expect(isActiveSession(mkSession({ lastActiveAt: NOW - 1000, updatedAt: NOW - 10 * ACTIVE_WINDOW_MS }), NOW)).toBe(true)
    const buckets = bucketSessions(
      [
        mkSession({ id: 'a', updatedAt: NOW - 1000 }),
        mkSession({ id: 'old', updatedAt: NOW - 10 * ACTIVE_WINDOW_MS }),
        mkSession({ id: 'arch', updatedAt: NOW - 1000, isArchived: true }),
      ],
      NOW,
    )
    expect(buckets.active.map((s) => s.id)).toEqual(['a'])
    expect(buckets.done.map((s) => s.id)).toEqual(['old'])
    expect(buckets.byWorkspace.every((g) => g.sessions.every((s) => s.id !== 'arch'))).toBe(true)
  })

  it('工作空间分桶：按 workspace 分组、组内按 updatedAt 逆序、组间按最新会话逆序', () => {
    const buckets = bucketSessions(
      [
        mkSession({ id: 'a1', workspace: '/w/a', updatedAt: NOW - 5000 }),
        mkSession({ id: 'a2', workspace: '/w/a', updatedAt: NOW - 1000 }),
        mkSession({ id: 'b1', workspace: '/w/b', updatedAt: NOW - 2000 }),
        mkSession({ id: 'd1', workspace: '', updatedAt: NOW - 3000 }),
      ],
      NOW,
    )
    expect(buckets.byWorkspace.map((g) => g.workspace)).toEqual(['/w/a', '/w/b', ''])
    const aGroup = buckets.byWorkspace.find((g) => g.workspace === '/w/a')!
    expect(aGroup.sessions.map((s) => s.id)).toEqual(['a2', 'a1'])
  })
})

describe('patch 347 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('347 双语含 view 三键 + views；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/347-client-i18n-ide-session-views.patch'), 'utf8')
    for (const key of ['view_active', 'view_done', 'view_workspace', 'views']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('347-client-i18n-ide-session-views.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('347-client-i18n-ide-session-views.patch')
  })

  it('侧栏接线存在：bucketSessions 调用 + 三段 chip + 工作空间强制 project', () => {
    const sidebar = readFileSync(resolve(overlayRoot, 'custom/client/ide/views/IdeTaskSidebar.vue'), 'utf8')
    expect(sidebar).toContain('bucketSessions(')
    expect(sidebar).toContain('ide-task-view-active')
    expect(sidebar).toContain('ide-task-view-done')
    expect(sidebar).toContain('ide-task-view-workspace')
    expect(sidebar).toContain("sessionView === 'workspace' ? 'project'")
  })

  it('store 存在：sessionView 状态 + setSessionView + 旧偏好回填（loadJson 合并）', () => {
    const store = readFileSync(resolve(overlayRoot, 'custom/client/ide/store/ide.ts'), 'utf8')
    expect(store).toContain("sessionView: 'active'")
    expect(store).toContain('setSessionView')
    // loadJson 的 {...fallback, ...parsed} 合并天然回填缺失字段（无 IIFE——
    // IIFE 破坏 Vue 同步响应式追踪，探针实锤后改回直调）
    expect(store).toContain('loadJson(SIDEBAR_KEY, DEFAULT_SIDEBAR)')
    expect(store).not.toContain('sessionView ?? DEFAULT_SIDEBAR.sessionView')
  })
})
