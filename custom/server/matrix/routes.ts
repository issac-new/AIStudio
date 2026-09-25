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

/** 主机名（Host/Origin 的 hostname，去端口/方括号）是否本机回环名。 */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  let h = host.trim().toLowerCase();
  const bracket = /^\[([^\]]+)\]/.exec(h);
  if (bracket) h = bracket[1];
  else if (h !== '::1') h = h.split(':')[0];
  return h === 'localhost' || isLoopbackPeer(h);
}

/** 转发头里的客户端 IP（X-Forwarded-For 链 / RFC 7239 Forwarded 的 for=），无转发头 → 空。 */
function forwardedClients(ctx: { request?: { headers?: Record<string, string | string[] | undefined> } }): string[] {
  const headers = ctx.request?.headers ?? {};
  const out: string[] = [];
  const xff = headers['x-forwarded-for'];
  for (const entry of String(Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',')) {
    if (entry.trim()) out.push(entry.trim());
  }
  const fwd = String(headers['forwarded'] ?? '');
  for (const m of fwd.matchAll(/for=("?\[?)([^\]";,]+)/gi)) {
    out.push(m[2].trim());
  }
  return out;
}

export function registerMatrixAuthRoutes(app: Koa) {
  const router = new Router({ prefix: '/api/matrix' });

  // C2 自动登录：返回本机 gateway dotenv 的 Matrix 凭据三元组，供 Studio 免密自动登录。
  // 同一信任域（用户本机 gateway 与 Studio 同身份），brief-matrix-delivery 已服务端消费
  // 同源凭据；此处仅把三元组交客户端走既有 POST /api/auth/matrix-login（本就收 access_token
  // 而非密码）建立会话。无 gateway 凭据时返回 { configured:false }，客户端回落手动登录页。
  //
  // 来源约束（S1，G3 加固）：本路由挂在鉴权中间件之前、服务默认绑 0.0.0.0，不设约束则
  // 同网段任意主机都能拿走长期 access_token。四道闸：
  //   ① TCP 对端 loopback——取 ctx.request.socket.remoteAddress（真实 TCP 对端）而非
  //      ctx.ip（可被 X-Forwarded-For 伪造）；
  //   ② 转发头闸：X-Forwarded-For/Forwarded 任一存在且含非回环客户端即 403——本机代理
  //      （vite dev）转发同机请求时客户端仍是回环（本机代理等价 loopback）；XFF 可被直连
  //      伪造，但直连非回环已被①挡下，本地进程与 gateway 同信任域；
  //   ③ Origin 白名单：带 Origin（浏览器跨源/DNS rebinding fetch）则须 localhost/127.x，
  //      无 Origin（curl/同源 GET）放行；
  //   ④ Host 白名单：Host 须回环名——挡 DNS rebinding 导航（Host=恶意域名但对端回环）。
  // dev:lan 多机取凭据被有意禁止：Host/Origin 非回环即 403，LAN 用户走手动登录。
  // 已知残余：upstream vite.config.ts createProxyConfig（:11-29）无 xfwd 且剥 origin/
  // referer、changeOrigin 改写 Host——经 vite dev 代理的请求与本机直连在后端不可区分，
  // dev:lan 下经 vite 代理路径的多机取凭据端到端禁止需代理侧加 xfwd 配合（上游只读，
  // 不在本仓改动面）。DNS rebinding 残余见③④。
  router.get('/gateway-credentials', (ctx) => {
    const headers = ctx.request.headers ?? {};
    if (!isLoopbackPeer(ctx.request.socket?.remoteAddress)) {
      ctx.status = 403;
      ctx.body = { configured: false, reason: 'loopback_only' };
      return;
    }
    if (forwardedClients(ctx).some((ip) => !isLoopbackHost(ip))) {
      ctx.status = 403;
      ctx.body = { configured: false, reason: 'forwarded_non_loopback' };
      return;
    }
    const origin = headers['origin'] ? String(headers['origin']) : undefined;
    if (origin !== undefined) {
      let originHost: string | undefined;
      try { originHost = new URL(origin).hostname; } catch { originHost = undefined; }
      if (!isLoopbackHost(originHost)) {
        ctx.status = 403;
        ctx.body = { configured: false, reason: 'origin_not_allowed' };
        return;
      }
    }
    const host = headers['host'] ? String(headers['host']) : undefined;
    if (host !== undefined && !isLoopbackHost(host)) {
      ctx.status = 403;
      ctx.body = { configured: false, reason: 'host_not_allowed' };
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
