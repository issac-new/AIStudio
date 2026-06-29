import type { App } from 'vue';
import type { Router } from 'vue-router';
import { features } from '../../../config/features';

export async function registerMatrixChat(_app: App) {
  if (!features.matrixChat) {
    console.log('[Custom] Matrix chat disabled via feature flag');
    return;
  }

  console.log('[Custom] Matrix chat feature registered');

  // Matrix chat routes are added as children of the cockpit route
  // (registered dynamically in bootstrap.ts after cockpit is defined)
}

export function registerMatrixChatRoutes(router: Router) {
  if (!features.matrixChat) return;
  // Add matrix-chat as children of the cockpit parent route
  router.addRoute('hermes.cockpit', {
    path: 'matrix-chat',
    name: 'hermes.matrixChat',
    component: () => import('./views/MatrixChatView.vue'),
  });
  router.addRoute('hermes.cockpit', {
    path: 'matrix-chat/room/:roomId([^?]+)',
    name: 'hermes.matrixChatRoom',
    component: () => import('./views/MatrixChatView.vue'),
  });
}
