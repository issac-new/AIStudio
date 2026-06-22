// overlay/custom/client/cockpit/index.ts
// Cockpit (Swarm Studio) — AI Collaboration Center
// A 类注册:路由、导航、组件、store、样式、i18n 增量的运行时注册。
import type { App } from 'vue';
import type { Router } from 'vue-router';
import { registerRoute, registerNavEntry } from '../../../registries/client';
import { features } from '../../../config/features';

export async function registerCockpit(_app: App) {
  if (!features.cockpit) {
    console.log('[Custom] Cockpit disabled via feature flag');
    return;
  }

  console.log('[Custom] Cockpit (AI Collaboration Center) registered');

  // Register the cockpit route (component lazy-loaded from custom dir)
  registerRoute({
    path: '/hermes/cockpit',
    name: 'hermes.cockpit',
    component: () => import('./views/CockpitView.vue'),
    meta: { fullscreen: true },
  });

  // Register sidebar navigation entry
  registerNavEntry({
    id: 'hermes.cockpit',
    label: 'AI Collaboration Center', // i18n key: sidebar.cockpit
    section: 'agent',
    // icon handled by AppSidebar patch
  });
}

export function registerCockpitRoutes(_router: Router) {
  // Routes registered via registerRoute above
}
