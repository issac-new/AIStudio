import type { PlatformRoutePolicy } from '../../custom/server/platform/authz/route-guard'

/**
 * 平台统一授权清单。路径与 @koa/router stack 中的实际 path 逐字对应；
 * 禁止通配，新增/删除路由必须同步修改本清单并运行 route-policy 真实枚举测试。
 */
export const platformRoutePolicies: PlatformRoutePolicy[] = [
  // 公开健康检查与登录入口（认证前挂载）。
  { method: 'GET', pathPattern: '/livez', access: 'public' },
  { method: 'GET', pathPattern: '/health', access: 'public' },
  { method: 'GET', pathPattern: '/api/auth/status', access: 'public' },
  { method: 'POST', pathPattern: '/api/auth/login', access: 'public' },
  { method: 'POST', pathPattern: '/api/auth/app-login', access: 'public' },
  { method: 'POST', pathPattern: '/api/auth/mcu-login', access: 'public' },
  { method: 'POST', pathPattern: '/api/auth/matrix-login', access: 'public' },

  // userenv 读写均按 :name 授权，授权先于目录存在性与文件读写。
  { method: 'GET', pathPattern: '/api/userenv/profiles/:name/env', access: 'profile', profileParam: 'name' },
  { method: 'PUT', pathPattern: '/api/userenv/profiles/:name/env', access: 'profile', profileParam: 'name' },

  // 自治阶梯读面保留登录语义，配置写面限平台超级管理员。
  { method: 'GET', pathPattern: '/api/hermes/autonomy-ladder', access: 'authenticated' },
  { method: 'GET', pathPattern: '/api/hermes/autonomy-ladder/:target', access: 'authenticated' },
  { method: 'PUT', pathPattern: '/api/hermes/autonomy-ladder/:target', access: 'super-admin' },
  { method: 'DELETE', pathPattern: '/api/hermes/autonomy-ladder/:target', access: 'super-admin' },

  // 会话权限档读按 profile 授权，切换/清除及引擎调用限平台超级管理员。
  { method: 'GET', pathPattern: '/api/hermes/permmodes/session-mode/:profileId', access: 'profile', profileParam: 'profileId' },
  { method: 'PUT', pathPattern: '/api/hermes/permmodes/session-mode/:profileId', access: 'super-admin' },
  { method: 'DELETE', pathPattern: '/api/hermes/permmodes/session-mode/:profileId', access: 'super-admin' },

  // 审批六源尚无统一归属协议，收件箱与嵌套 human-gate 整体限平台超级管理员。
  { method: 'GET', pathPattern: '/api/approvals/pending', access: 'super-admin' },
  { method: 'GET', pathPattern: '/api/approvals/pending-summary', access: 'super-admin' },
  { method: 'POST', pathPattern: '/api/approvals/:id/decide', access: 'super-admin' },
  { method: 'GET', pathPattern: '/api/approvals/history', access: 'super-admin' },
  { method: 'GET', pathPattern: '/api/approvals/history/chain', access: 'super-admin' },
  { method: 'POST', pathPattern: '/api/approvals/impact-preview', access: 'super-admin' },
  { method: 'GET', pathPattern: '/api/approvals/spotcheck', access: 'super-admin' },
  { method: 'POST', pathPattern: '/api/approvals/spotcheck/:id/resolve', access: 'super-admin' },
  { method: 'POST', pathPattern: '/api/approvals/human-gate', access: 'super-admin' },
  { method: 'POST', pathPattern: '/api/approvals/human-gate/task', access: 'super-admin' },
  { method: 'GET', pathPattern: '/api/approvals/human-gate', access: 'super-admin' },
  { method: 'POST', pathPattern: '/api/approvals/human-gate/:id/decide', access: 'super-admin' },
]
