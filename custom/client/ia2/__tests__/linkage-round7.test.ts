// overlay/custom/client/ia2/__tests__/linkage-round7.test.ts
// R7 守门：任务归属链（sessionId 透传 + 卡详情归属区）/ 开发产出回喂
// （buildAttention 第四参 sessions → session-failed 行 + ide 会话跳）。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { toCockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import { buildAttention, type SessionAttentionInput } from '../adapters/activity'
import type { KanbanTask } from '@/api/hermes/kanban'

describe('R7-A 归属链：kanban session_id → CockpitTask.sessionId', () => {
  it('session_id 透传；无 session_id → null', () => {
    const base = {
      id: 't1', title: 'x', body: null, assignee: 'a', status: 'running', priority: 0,
      created_by: null, created_at: 1700, started_at: null, completed_at: null,
      workspace_kind: 'local', workspace_path: '/w/x', tenant: null, project_id: null,
      result: null, skills: null,
    } as unknown as KanbanTask
    expect(toCockpitTask({ ...base, session_id: 's-abc' }).sessionId).toBe('s-abc')
    expect(toCockpitTask({ ...base, session_id: undefined }).sessionId).toBeNull()
    expect(toCockpitTask({ ...base, session_id: null }).sessionId).toBeNull()
  })
})

describe('R7-B 开发产出回喂：buildAttention 第四参 sessions', () => {
  const noTasks: never[] = []
  const noRuns: never[] = []

  it('会话失败（failed）→ session-failed 行（sessionId + 副文 key）', () => {
    const sessions: SessionAttentionInput[] = [
      { id: 's1', title: '重构 utils', failed: true, updatedAt: 1_700_000_000_000 },
    ]
    const rows = buildAttention(noTasks, noRuns, 0, sessions)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('session-failed')
    expect(rows[0].sessionId).toBe('s1')
    expect(rows[0].subKey).toBe('ia2.att.subSessionFailed')
  })

  it('会话受阻（blocked）→ session-failed 行但副文为受阻；无事件不进', () => {
    const sessions: SessionAttentionInput[] = [
      { id: 's2', title: '写测试', blocked: true, updatedAt: 1_700_000_100_000 },
      { id: 's3', title: '正常会话', updatedAt: 1_700_000_200_000 },
    ]
    const rows = buildAttention(noTasks, noRuns, 0, sessions)
    expect(rows).toHaveLength(1)
    expect(rows[0].subKey).toBe('ia2.att.subSessionBlocked')
    expect(rows[0].sessionId).toBe('s2')
  })

  it('第四参缺省 → 兼容旧调用（仅 task/run）', () => {
    const rows = buildAttention(
      [{ id: 't1', title: 'x', status: 'blocked', priority: 'P0', assignee: 'a', workspace: '', tenant: null, boardSlug: 'b', createdAt: 1_700_000_000_000 } as never],
      [], 0,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('task-blocked')
  })
})

describe('R7 接线锚点（源码存在性守门）', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('任务卡归属链区（LinkedTaskList linkage + sessionId/workspace 渲染）', () => {
    const ltl = readFileSync(resolve(overlayRoot, 'custom/client/ia2/components/flow/LinkedTaskList.vue'), 'utf8')
    expect(ltl).toContain('tdp-linkage')
    expect(ltl).toContain('task.sessionId')
    expect(ltl).toContain('task.workspace')
  })

  it('WorkbenchView 会话事件源 + ide 会话跳（sessionAttention + ide.shell?session）', () => {
    const wb = readFileSync(resolve(overlayRoot, 'custom/client/ia2/views/WorkbenchView.vue'), 'utf8')
    expect(wb).toContain('sessionAttention')
    expect(wb).toContain("name: 'ide.shell', query: { session: row.sessionId }")
    expect(wb).toContain('row.sessionId')
    // session-failed 词在 adapter/AttentionList 词表（点击分派只看 sessionId）
    const att = readFileSync(resolve(overlayRoot, 'custom/client/ia2/components/flow/AttentionList.vue'), 'utf8')
    expect(att).toContain("'session-failed'")
  })

  it('patch 353 双语含 att 会话键 + tdp.session；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/353-client-i18n-ia2-r7-linkage.patch'), 'utf8')
    for (const key of ['subSessionFailed', 'subSessionBlocked', 'session']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('353-client-i18n-ia2-r7-linkage.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('353-client-i18n-ia2-r7-linkage.patch')
  })
})
