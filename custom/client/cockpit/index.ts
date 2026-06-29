// overlay/custom/client/cockpit/index.ts
// Cockpit (Swarm Studio) — AI Collaboration Center
// A 类注册:路由、导航、组件、store、样式、i18n 增量的运行时注册。
import type { App } from 'vue';
import { registerNavEntry } from '../../../registries/client';
import { features } from '../../../config/features';

// 全局布局样式（Pure Ink）：三列布局、折叠竖条、统一选中态、modal overlay。
import './styles/cockpit.scss';

export async function registerCockpit(_app: App) {
  if (!features.cockpit) {
    console.log('[Custom] Cockpit disabled via feature flag');
    return;
  }

  console.log('[Custom] Cockpit (AI Collaboration Center) registered');

  // Cockpit route is defined statically in router/index.ts (patch 071)
  // with chat/group/history/workflow/swarm-kanban as nested children.
  // Matrix chat room routes are added dynamically as cockpit children in bootstrap.

  // Register sidebar navigation entry
  registerNavEntry({
    id: 'hermes.cockpit',
    label: 'AI Collaboration Center',
    section: 'agent',
  });
}

export function registerCockpitRoutes(_router: Router) {
  // Routes registered via registerRoute above
}
