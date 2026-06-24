import type { App } from 'vue';
import type { Router } from 'vue-router';
import { registerRoute } from '../../../registries/client';
import { features } from '../../../config/features';

export async function registerMatrixChat(_app: App) {
  if (!features.matrixChat) {
    console.log('[Custom] Matrix chat disabled via feature flag');
    return;
  }

  console.log('[Custom] Matrix chat feature registered');

  // Register Matrix chat main route
  registerRoute({
    path: '/hermes/matrix-chat',
    name: 'hermes.matrixChat',
    component: () => import('./views/MatrixChatView.vue'),
  });

  // Register Matrix chat room route
  registerRoute({
    path: '/hermes/matrix-chat/room/:roomId',
    name: 'hermes.matrixChatRoom',
    component: () => import('./views/MatrixChatView.vue'),
  });
}

export function registerMatrixChatRoutes(_router: Router) {
  // Routes registered via registerRoute() in registerMatrixChat()
}
