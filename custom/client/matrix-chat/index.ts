import type { App } from 'vue';
import type { Router } from 'vue-router';
import { features } from '../../../config/features';

export async function registerMatrixChat(_app: App) {
  if (!features.matrixChat) {
    console.log('[Custom] Matrix chat disabled via feature flag');
    return;
  }

  console.log('[Custom] Matrix chat feature registered');

  // 2026-09-18 统一导航 Task 1/3：matrix-chat 路由已迁 ia2 沟通场景
  // （ia2/routes.ts 的 /app/comms 子路由 ia2.comms / ia2.commsRoom）；
  // 旧 cockpit 子路由（patch 071 静态定义）随 cockpit 家族退役，由 Task 6 从
  // upstream patch 移除。本模块无动态路由追加。
}

// Kept for backward compatibility with bootstrap.ts call site, but is now a no-op:
// matrix-chat routes live in ia2/routes.ts (comms scene children).
export function registerMatrixChatRoutes(_router: Router) {
  if (!features.matrixChat) return;
  // no-op: routes defined in custom/client/ia2/routes.ts
}
