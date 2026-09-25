// packages/server/src/custom/matrix/routes.ts
import type Koa from 'koa';
import Router from '@koa/router';
import { readGatewayMatrixEnv } from './gateway-env';

/** TCP 对端是否本机回环（127.0.0.0/8 / ::1 / ::ffff:127.x）。 */
function isLoopbackPeer(addr: string | undefined): boolean {
  if (!addr) return false;
  const lower = addr.trim().toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('127.')) return true;
  // IPv4-mapped IPv6（::ffff:127.0.0.1）
  return /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower);
}

export function registerMatrixAuthRoutes(app: Koa) {
  const router = new Router({ prefix: '/api/matrix' });

  // C2 自动登录：返回本机 gateway dotenv 的 Matrix 凭据三元组，供 Studio 免密自动登录。
  // 同一信任域（用户本机 gateway 与 Studio 同身份），brief-matrix-delivery 已服务端消费
  // 同源凭据；此处仅把三元组交客户端走既有 POST /api/auth/matrix-login（本就收 access_token
  // 而非密码）建立会话。无 gateway 凭据时返回 { configured:false }，客户端回落手动登录页。
  //
  // 来源约束（S1）：本路由挂在鉴权中间件之前、服务默认绑 0.0.0.0，不设约束则同网段
  // 任意主机都能拿走长期 access_token。仅 TCP 对端是 loopback 时才返回凭据——判定取
  // ctx.request.socket.remoteAddress（真实 TCP 对端）而非 ctx.ip（可被 X-Forwarded-For
  // 伪造）。vite dev 走本地代理，后端看到的对端是 127.0.0.1，主流程不受影响。
  // 残余风险：DNS rebinding——恶意页面诱导浏览器访问解析到 127.0.0.1 的域名时，请求仍以
  // loopback 对端到达本路由。此处不加鉴权是 bootstrap 免密登录自举需要：首次登录前没有任何
  // token 可校验，凭据本身就是登录材料；只能靠来源约束 + 浏览器同源策略兜底。
  router.get('/gateway-credentials', (ctx) => {
    if (!isLoopbackPeer(ctx.request.socket?.remoteAddress)) {
      ctx.status = 403;
      ctx.body = { configured: false, reason: 'loopback_only' };
      return;
    }
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
