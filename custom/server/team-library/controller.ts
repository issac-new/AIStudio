// overlay[team-library] 团队库 REST（/api/harness/team-library/*，2026-11-08）。
//
//   GET  /            团队库读模型（available:false 时只给原因与来源）
//   POST /select      建议选择：{ task, familyId?, threshold? } → reuse|cold_start
//
// 只读/建议语义：不接管派单，不写任何状态；选择结果由派单方或 Chairman 裁决。
import Router from '@koa/router'

import { bodyOf, fail, ok } from '../lib/http'
import { loadTeamLibrary, selectTeamFamily } from './team-library'

export const teamLibraryRoutes = new Router()

teamLibraryRoutes.get('/', (ctx) => {
  const report = loadTeamLibrary()
  ok(ctx, {
    available: report.available,
    source: report.source,
    ...(report.available ? { updated: report.updated, families: report.families } : { reason: report.reason }),
  })
})

teamLibraryRoutes.post('/select', (ctx) => {
  const body = bodyOf<{ task?: unknown; familyId?: unknown; threshold?: unknown }>(ctx)
  const task = typeof body.task === 'string' ? body.task.trim() : ''
  if (!task) {
    fail(ctx, 400, 'task 必填（至少一句任务描述）', { code: 'no_task' })
    return
  }
  if (task.length > 2000) {
    fail(ctx, 400, 'task 超过 2000 字符（请压缩成一句协作需求）', { code: 'task_too_long' })
    return
  }
  const report = loadTeamLibrary()
  if (!report.available) {
    ok(ctx, { available: false, reason: report.reason, source: report.source, selection: null })
    return
  }
  const familyId = typeof body.familyId === 'string' && body.familyId.trim() ? body.familyId.trim() : null
  const threshold = typeof body.threshold === 'number' ? body.threshold : undefined
  const selection = selectTeamFamily(report.families, { taskText: task, familyId, threshold })
  ok(ctx, { available: true, source: report.source, selection })
})
