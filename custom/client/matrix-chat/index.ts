import type { App } from 'vue';
import type { Router } from 'vue-router';
import { features } from '../../../config/features';

export async function registerMatrixChat(_app: App) {
  if (!features.matrixChat) {
    console.log('[Custom] Matrix chat disabled via feature flag');
    return;
  }

  console.log('[Custom] Matrix chat feature registered');

  // Matrix chat routes are defined statically as cockpit children in
  // router/index.ts (patch 071): hermes.matrixChat / hermes.matrixChatRoom.
  // No dynamic addRoute needed — static definition is the single source of truth.
}

// Kept for backward compatibility with bootstrap.ts call site, but is now a no-op:
// matrix-chat routes are statically defined in router/index.ts (patch 071).
// Previously this dynamically added matrix-chat as cockpit children, which
// duplicated the static definition and risked confusion on route replacement.
export function registerMatrixChatRoutes(_router: Router) {
  if (!features.matrixChat) return;
  // no-op: routes defined statically in router/index.ts (patch 071)
}
