// overlay/registries/server/index.ts
// server 端注册中枢。保留给"可在 listen 后挂载"的 server A 类路由使用。
// 注意:当前所有 server 改动(element-web 中间件、matrix/kanban 路由)均已作为
// B 类 patch 或 custom/server 独立模块处理,本 registry 暂无注册项。
import type Router from '@koa/router'

interface RoutePrefix {
  prefix: string
  router: Router
}

const registry = {
  routePrefixes: [] as RoutePrefix[],
  middlewares: [] as unknown[],
}

export function registerRoute(prefix: string, router: Router): void {
  registry.routePrefixes.push({ prefix, router })
}

export function registerMiddleware(mw: unknown): void {
  registry.middlewares.push(mw)
}

export function getRegisteredRoutePrefixes(): RoutePrefix[] {
  return registry.routePrefixes
}

export function getRegisteredMiddlewares(): unknown[] {
  return registry.middlewares
}
