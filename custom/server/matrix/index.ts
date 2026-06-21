// packages/server/src/custom/matrix/index.ts
import type Koa from 'koa';
import { registerMatrixAuthRoutes } from './routes';

export function registerMatrixRoutes(app: Koa) {
  registerMatrixAuthRoutes(app);
}
