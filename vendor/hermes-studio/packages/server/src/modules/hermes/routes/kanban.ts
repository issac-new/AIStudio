import Router from '@koa/router'
import * as ctrl from '../controllers/kanban'
import { getDashboardUrl } from '../../studio/public/config'

// Separate router for the dashboard-url endpoint so it is not shadowed by
// the /:id catch-all in the main kanban router.
export const kanbanDashboardUrlRoutes = new Router()
kanbanDashboardUrlRoutes.get('/api/hermes/kanban/dashboard-url', (ctx) => {
  ctx.body = { url: getDashboardUrl() }
})

export const kanbanRoutes = new Router()

kanbanRoutes.get('/api/hermes/kanban/boards', ctrl.listBoards)
kanbanRoutes.post('/api/hermes/kanban/boards', ctrl.createBoard)
// HERMES_CUSTOM[v020] BEGIN: board project scope
kanbanRoutes.patch('/api/hermes/kanban/boards/:slug', ctrl.patchBoard)
// HERMES_CUSTOM[v020] END
kanbanRoutes.delete('/api/hermes/kanban/boards/:slug', ctrl.archiveBoard)
kanbanRoutes.get('/api/hermes/kanban/capabilities', ctrl.capabilities)
kanbanRoutes.get('/api/hermes/kanban/stats', ctrl.stats)
kanbanRoutes.get('/api/hermes/kanban/assignees', ctrl.assignees)
kanbanRoutes.get('/api/hermes/kanban/diagnostics', ctrl.diagnostics)
kanbanRoutes.get('/api/hermes/kanban/orchestration', ctrl.getOrchestration)
kanbanRoutes.put('/api/hermes/kanban/orchestration', ctrl.setOrchestration)
kanbanRoutes.post('/api/hermes/kanban/dispatch', ctrl.dispatch)
kanbanRoutes.get('/api/hermes/kanban/artifact', ctrl.readArtifact)
kanbanRoutes.get('/api/hermes/kanban/workspace-files', ctrl.listWorkspaceFiles)
kanbanRoutes.get('/api/hermes/kanban/timeline', ctrl.listTimeline)
kanbanRoutes.get('/api/hermes/kanban/search-sessions', ctrl.searchSessions)
kanbanRoutes.post('/api/hermes/kanban/links', ctrl.linkTasks)
kanbanRoutes.delete('/api/hermes/kanban/links', ctrl.unlinkTasks)
kanbanRoutes.post('/api/hermes/kanban/tasks/bulk', ctrl.bulkUpdateTasks)
kanbanRoutes.get('/api/hermes/kanban/home-channels', ctrl.homeChannels)
kanbanRoutes.get('/api/hermes/kanban/debug-home-channels', ctrl.debugHomeChannels)
kanbanRoutes.post('/api/hermes/kanban/:id/home-subscribe/:platform', ctrl.subscribeHome)
kanbanRoutes.delete('/api/hermes/kanban/:id/home-subscribe/:platform', ctrl.unsubscribeHome)
kanbanRoutes.post('/api/hermes/kanban/:id/attachments', ctrl.uploadAttachment)
kanbanRoutes.delete('/api/hermes/kanban/attachments/:id', ctrl.removeAttachment)
kanbanRoutes.post('/api/hermes/kanban/:id/attachments/url', ctrl.uploadAttachmentFromUrl)
// HERMES_CUSTOM[v020] BEGIN: estimate + projects (must precede GET /:id)
kanbanRoutes.post('/api/hermes/kanban/estimate', ctrl.estimateText)
kanbanRoutes.get('/api/hermes/kanban/projects', ctrl.listProjects)
// HERMES_CUSTOM[v020] END
kanbanRoutes.get('/api/hermes/kanban', ctrl.list)
kanbanRoutes.get('/api/hermes/kanban/:id/attachments', ctrl.listAttachments)
kanbanRoutes.get('/api/hermes/kanban/:id/attachments/:attachmentId', ctrl.readAttachment)
kanbanRoutes.get('/api/hermes/kanban/:id', ctrl.get)
kanbanRoutes.post('/api/hermes/kanban', ctrl.create)
kanbanRoutes.post('/api/hermes/kanban/complete', ctrl.complete)
kanbanRoutes.post('/api/hermes/kanban/unblock', ctrl.unblock)
// HERMES_CUSTOM[v121]: review 态打回（等待队列「打回」动线，review→ready 重做）
kanbanRoutes.post('/api/hermes/kanban/reopen-review', ctrl.reopenReview)
kanbanRoutes.post('/api/hermes/kanban/:id/block', ctrl.block)
kanbanRoutes.post('/api/hermes/kanban/:id/assign', ctrl.assign)
kanbanRoutes.post('/api/hermes/kanban/:id/comments', ctrl.addComment)
// HERMES_CUSTOM[v020] BEGIN: per-task estimate
kanbanRoutes.post('/api/hermes/kanban/:id/estimate', ctrl.estimateTask)
// HERMES_CUSTOM[v020] END
kanbanRoutes.get('/api/hermes/kanban/:id/log', ctrl.taskLog)
kanbanRoutes.post('/api/hermes/kanban/:id/reclaim', ctrl.reclaim)
kanbanRoutes.post('/api/hermes/kanban/:id/reassign', ctrl.reassign)
kanbanRoutes.post('/api/hermes/kanban/:id/specify', ctrl.specify)
kanbanRoutes.post('/api/hermes/kanban/:id/decompose', ctrl.decomposeTask)
kanbanRoutes.post('/api/hermes/kanban/:id/estimate', ctrl.estimateTask)
kanbanRoutes.patch('/api/hermes/kanban/:id', ctrl.patchTask)
kanbanRoutes.delete('/api/hermes/kanban/:id', ctrl.deleteTask)
