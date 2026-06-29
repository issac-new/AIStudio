// packages/server/src/custom/matrix/routes.ts
import type Koa from 'koa';
import Router from '@koa/router';

export function registerMatrixAuthRoutes(app: Koa) {
  const router = new Router({ prefix: '/api/matrix' });
  
  // Routes will be populated in later tasks
  
  app.use(router.routes());
  app.use(router.allowedMethods());
}
