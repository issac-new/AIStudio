// packages/server/src/custom/kanban/index.ts
import type Koa from 'koa';
import { nudgeRouter } from './owner-routed-nudge';

export function registerKanbanRoutes(app: Koa) {
  // 催办 owner 动态路由（run21+22 复盘产品化①）：POST /api/kanban/nudge/route
  // 卡源注入由装配点负责（setNudgeCardProvider）——缺省无源端点显式 503 不猜。
  app.use(nudgeRouter.routes());
}
