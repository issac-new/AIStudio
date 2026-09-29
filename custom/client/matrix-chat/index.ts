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

// A10 复活（2026-09-29）：全屏 Matrix 客户端路由恢复。matrix-chat 三件套
// （MatrixChatView/MatrixChatPanel/MatrixRoomList/MatrixJoinRoomDialog）自 patch 297
// 删 cockpit 家族路由后成孤儿，房间列表/房间目录浏览能力不可达。此处以顶层
// fullscreen 路由重新挂载（/app 三栏内的房间画布不变，两处共享 matrix-room store）。
export function registerMatrixChatRoutes(router: Router) {
  if (!features.matrixChat) return;
  router.addRoute({
    path: '/matrix',
    name: 'matrix.client',
    component: () => import('./views/MatrixChatView.vue'),
    meta: { fullscreen: true },
  });
  router.addRoute({
    path: '/matrix/room/:roomId',
    name: 'matrix.clientRoom',
    component: () => import('./views/MatrixChatView.vue'),
    meta: { fullscreen: true },
  });
}
