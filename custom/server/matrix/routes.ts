// packages/server/src/custom/matrix/routes.ts
import type Koa from 'koa';
import Router from '@koa/router';
import { readGatewayMatrixEnv } from './gateway-env';

export function registerMatrixAuthRoutes(app: Koa) {
  const router = new Router({ prefix: '/api/matrix' });

  // C2 自动登录：返回本机 gateway dotenv 的 Matrix 凭据三元组，供 Studio 免密自动登录。
  // 同一信任域（用户本机 gateway 与 Studio 同身份），brief-matrix-delivery 已服务端消费
  // 同源凭据；此处仅把三元组交客户端走既有 POST /api/auth/matrix-login（本就收 access_token
  // 而非密码）建立会话。无 gateway 凭据时返回 { configured:false }，客户端回落手动登录页。
  router.get('/gateway-credentials', (ctx) => {
    const env = readGatewayMatrixEnv();
    if (!env) {
      ctx.status = 404;
      ctx.body = { configured: false };
      return;
    }
    ctx.body = {
      configured: true,
      homeserverUrl: env.homeserverUrl,
      accessToken: env.accessToken,
      userId: env.userId,
    };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
}
