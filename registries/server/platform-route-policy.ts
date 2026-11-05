import type { PlatformRoutePolicy } from '../../custom/server/platform/authz/route-guard'

/**
 * 平台统一授权清单。路径与 @koa/router stack 中的实际 path 逐字对应；
 * 禁止通配，新增/删除路由必须同步修改本清单并运行 route-policy 真实枚举测试。
 *
 * 边界声明（P1 Task 1，处置 P0 终审前置⑤的书面化）：
 * 当前默认拒绝（写路由未登记即 403）只覆盖 6 个受管 router——health、auth（公开
 * 登录面）、userenv、autonomy-ladder、permmodes session-mode、approvals。server
 * 树内其余写面（harness、eval、orchestrator、simcenter、delivery 等域的路由）尚
 * 未纳入本清单与 enforcePlatformRoutePolicy 守卫范围——它们按 P2 的扩展节奏逐域
 * 登记进本清单（登记时同步扩 platformProtectedRouters 与启动对账 union），不在
 * 本清单里的路由不因本文件存在而获得任何默认拒绝保护。
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
  // P0 Task 4（2026-11-05）：自动放行迁入显式写命令——写端点（会放行审批、写响应与台账），access=super-admin。
  { method: 'POST', pathPattern: '/api/approvals/autopass/scan', access: 'super-admin' },
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
