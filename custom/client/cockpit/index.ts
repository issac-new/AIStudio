// overlay/custom/client/cockpit/index.ts
// Cockpit — AI 协作能力模块（store/组件/adapters/样式）。
// A 类注册:路由、导航、组件、store、样式、i18n 增量的运行时注册。
import type { App } from 'vue';
import { features } from '../../../config/features';

// 全局布局样式（Pure Ink）：三列布局、折叠竖条、统一选中态、modal overlay。
// 2026-09-18 统一导航 Task 3：/hermes/cockpit 路由家族退役，三栏迁入 ia2
// 协作场景（/app/collab）；ia2/index.ts 顶部同步 import 同款样式（双落点幂等，
// 确保壳页头 IaShellHeader 与 CollabScene 的 cockpit-* 类在两个入口链都有样式）。
import './styles/cockpit.scss';

export async function registerCockpit(_app: App) {
  if (!features.cockpit) {
    console.log('[Custom] Cockpit disabled via feature flag');
    return;
  }

  console.log('[Custom] Cockpit (collab capability module) registered');

  // 2026-09-18 统一导航 Task 3：registerNavEntry 块删除——getRegisteredNavEntries
  // 在 overlay/upstream 全仓零消费（侧栏入口为上游 AppSidebar 静态配置，patch 注入），
  // 属死注册；且条目指向的旧 cockpit 路由已退役。
}
