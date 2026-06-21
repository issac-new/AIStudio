import type { App } from 'vue';
import type { Router } from 'vue-router';

export async function registerMatrixChat(_app: App) {
  console.log('[Custom] Matrix chat feature registered');
}

export function registerMatrixChatRoutes(_router: Router) {
  // Routes will be registered here
}
