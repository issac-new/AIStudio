<script setup lang="ts">
import PageSidebar from "./PageSidebar.vue";
import SidebarResizeHandle from "./SidebarResizeHandle.vue";
import { usePageSidebarState } from "@/composables/usePageSidebar";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores/hermes/app";
import { useAuthStore } from "@/stores/hermes/auth";
import RouteLinkItem from "@/components/common/RouteLinkItem.vue";
import PageSidebarFooter from "@/components/layout/PageSidebarFooter.vue";
import { isStoredSuperAdmin } from "@/api/client";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
// overlay: 响应式超管判定（authStore 优先，回退 localStorage 快照）
const isSuperAdmin = computed(() => authStore.isSuperAdmin ?? isStoredSuperAdmin());
// overlay[ia2]: P3 六区域新 IA 高亮（Task 8: cockpit 入口随退役移除，仅保留新 IA 项）
const isIa2Area = computed(() => String(route.name ?? "").startsWith("ia2."));

// overlay[nav-restore]: IDE 一级入口恢复（守门口径：一级双入口 驾驶舱+IDE）
const isIdeShellArea = computed(() => String(route.name ?? "").startsWith("ide."));
// overlay[nav]: 系统折叠分组（统一导航裁决）——低频运维/配置入口收敛；
// 当前命中系统页时默认展开
const SYSTEM_ROUTE_NAMES = [
  // V5 补遗⑤ S1：系统组收缩为 设置+日志+用量（+superadmin/桌面条件项）——
  // 技能用量/主题/宠物商店入口摘除（路由与页面保留，主题切换用页头开关）
  "hermes.logs", "hermes.usage", "hermes.performance",
  "hermes.browser", "hermes.versionPreview",
  "hermes.profiles", "hermes.settings",
];
const systemOpen = ref(SYSTEM_ROUTE_NAMES.includes(String(route.name ?? "")));
const isSettingsPage = computed(() => route.name === 'hermes.settings');
const { expanded, isMobile } = usePageSidebarState();
const selectedKey = computed(() => {
  return route.name as string;
});
const isVersionPreview = import.meta.env.VITE_HERMES_PREVIEW === "1";
const isDesktopShell = computed(
  () =>
    (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } })
      .hermesDesktop?.isDesktop === true,
);

function hasRoute(name: string): boolean {
  return router.hasRoute(name);
}

function handleSidebarClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;

  if (!target?.closest(".route-link-item")) {
    return;
  }

  if (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches
  ) {
    expanded.value = false;
  }
}
</script>

<template>
  <PageSidebar>
  <aside
    class="sidebar"
    :class="{
      open: expanded,
      collapsed: !isMobile && appStore.sidebarCollapsed,
    }"
    @click="handleSidebarClick"
  >
    <SidebarResizeHandle />
    <nav class="sidebar-nav">
      <!-- overlay[ia2]: 六区域新 IA 一级入口（P3 登录默认；Task 8 cockpit 退役后唯一入口）。
           V5 补遗⑤ M2：IDE 工作台一级入口移除（归一 /app/ide，驾驶舱子页面；
           进入路径=页头视图切换/任务 ⌨IDE 动线），主侧栏一级仅剩驾驶舱。 -->
      <RouteLinkItem
        class="nav-item"
        :to="{ name: 'ia2.collab' }"
        :active="isIa2Area"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>{{ t("ia2.brand") }}</span>
      </RouteLinkItem>
      <RouteLinkItem
              class="nav-item"
              :to="{ name: 'ide.shell' }"
              :active="isIdeShellArea"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M8 6 3 12l5 6" />
                <path d="M16 6l5 6-5 6" />
              </svg>
              <span>{{ t("sidebar.ideWorkspace") }}</span>
            </RouteLinkItem>
      <!-- overlay[nav]: 系统折叠分组头（统一导航：一级仅 驾驶舱/IDE 双入口） -->
      <button
        class="nav-item sidebar-system-toggle"
        data-testid="sidebar-system-toggle"
        :aria-expanded="systemOpen"
        @click="systemOpen = !systemOpen"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
        <span>{{ t("sidebar.systemGroup") }}</span>
        <svg
          class="sidebar-system-toggle__arrow"
          :class="{ 'sidebar-system-toggle__arrow--open': systemOpen }"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div v-show="systemOpen" class="sidebar-system-items">
      <RouteLinkItem
        class="nav-item"
        :to="{ name: 'hermes.logs' }"
        :active="selectedKey === 'hermes.logs'"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span>{{ t("sidebar.logs") }}</span>
      </RouteLinkItem>
      <RouteLinkItem
        v-if="isSuperAdmin"
        class="nav-item"
        :to="{ name: 'hermes.performance' }"
        :active="selectedKey === 'hermes.performance'"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span>{{ t("sidebar.performance") }}</span>
      </RouteLinkItem>
      <RouteLinkItem
        v-if="isDesktopShell && hasRoute('hermes.browser')"
        class="nav-item"
        :to="{ name: 'hermes.browser' }"
        :active="selectedKey === 'hermes.browser'"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 9h18" />
          <path d="M9 3c-2 5-2 13 0 18" />
          <path d="M15 3c2 5 2 13 0 18" />
        </svg>
        <span>{{ t("sidebar.browser") }}</span>
      </RouteLinkItem>
      <RouteLinkItem
        v-if="
          hasRoute('hermes.versionPreview') && isSuperAdmin && !isVersionPreview
        "
        class="nav-item"
        :to="{ name: 'hermes.versionPreview' }"
        :active="selectedKey === 'hermes.versionPreview'"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
          />
          <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
          <polyline points="7.5 19.79 7.5 14.6 3 12" />
          <polyline points="21 12 16.5 14.6 16.5 19.79" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <span>{{ t("sidebar.versionPreview") }}</span>
      </RouteLinkItem>
      <RouteLinkItem
        v-if="isSuperAdmin"
        class="nav-item"
        :to="{ name: 'hermes.profiles' }"
        :active="selectedKey === 'hermes.profiles'"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>{{ t("sidebar.profiles") }}</span>
      </RouteLinkItem>
      <RouteLinkItem
        class="nav-item"
        :to="{ name: 'hermes.settings' }"
        :active="selectedKey === 'hermes.settings'"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
        <span>{{ t("sidebar.settings") }}</span>
      </RouteLinkItem>
      </div>
    </nav>

    <PageSidebarFooter v-if="!isSettingsPage" :collapsed="appStore.sidebarCollapsed" class="sidebar-account-footer" />

    <div class="sidebar-top-actions">
      <!-- overlay[nav]: 返回驾驶舱 hack 退役——一级已双入口直达，仅保留折叠按钮 -->
      <button
        class="collapse-btn"
        @click="appStore.toggleSidebarCollapsed()"
        :title="
          appStore.sidebarCollapsed
            ? t('sidebar.expand')
            : t('sidebar.collapse')
        "
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline v-if="appStore.sidebarCollapsed" points="9 18 15 12 9 6" />
          <polyline v-else points="15 18 9 12 15 6" />
        </svg>
      </button>
    </div>

  </aside>
  </PageSidebar>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.sidebar {
  position: relative;
  width: $sidebar-width;
  height: auto;
  min-height: 0;
  align-self: stretch;
  margin: 0;
  background-color: var(--theme-sidebar-bg, $bg-sidebar-surface);
  border-inline-end: var(--border-width, 1px) solid $border-color;
  display: flex;
  flex-direction: column;
  padding: calc(8px * var(--spacing-scale, 1)) calc(12px * var(--spacing-scale, 1)) calc(20px * var(--spacing-scale, 1));
  overflow: hidden;
  flex-shrink: 0;
  transition: width $transition-normal;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  padding-top: calc(8px * var(--spacing-scale, 1));
  flex-direction: column;
  gap: calc(6px * var(--spacing-scale, 1));
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--spacing-scale, 1));
  padding: calc(12px * var(--spacing-scale, 1));
  border: none;
  background: none;
  appearance: none;
  text-decoration: none;
  color: $text-secondary;
  font-size: calc(var(--font-size-base, 14px) * 14 / 14);
  border-radius: $radius-sm;
  cursor: pointer;
  transition: all $transition-fast;
  width: 100%;
  text-align: start;

  &:hover {
    background-color: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }

  &.active {
    background-color: rgba(var(--accent-primary-rgb), 0.12);
    color: $accent-primary;
  }

  .beta-tag {
    font-size: calc(var(--font-size-base, 14px) * 10 / 14);
    color: $text-muted;
    margin-inline-start: 2px;
  }
}

.sidebar-top-actions {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--spacing-scale, 1));
  margin-top: 8px;
  padding-top: calc(8px * var(--spacing-scale, 1));
  border-top: var(--border-width, 1px) solid $border-color;
}

.sidebar-return-tab {
  flex: 1;
  min-width: 0;
  padding: calc(8px * var(--spacing-scale, 1)) calc(10px * var(--spacing-scale, 1));
  font-size: calc(var(--font-size-base, 14px) * 13 / 14);
}

/* overlay[nav]: 系统折叠分组——容器不产生盒模型，仅收拢子项显隐 */
.sidebar-system-items {
  display: contents;
}
.sidebar-system-toggle__arrow {
  margin-left: auto;
  flex: none;
  opacity: 0.7;
  transition: transform 0.15s ease;
}
.sidebar-system-toggle__arrow--open {
  transform: rotate(90deg);
}

.sidebar-account-footer {
  padding: calc(10px * var(--spacing-scale, 1)) 0 0;
  border-top: var(--border-width, 1px) solid $border-color;
}

// ─── Collapsed sidebar (icon-rail mode) ─────────────────────────

.sidebar.collapsed {
  width: $sidebar-collapsed-width;
  padding: calc(8px * var(--spacing-scale, 1)) calc(8px * var(--spacing-scale, 1)) calc(12px * var(--spacing-scale, 1));
  overflow: hidden;

  .collapse-btn {
    display: flex;
    margin: 0;
  }

  .sidebar-top-actions {
    flex-direction: column;
    gap: calc(6px * var(--spacing-scale, 1));
    margin-top: 8px;
    padding-top: calc(8px * var(--spacing-scale, 1));
  }

  .sidebar-return-tab {
    width: 100%;
    flex: 0 0 auto;
    padding: calc(10px * var(--spacing-scale, 1)) calc(4px * var(--spacing-scale, 1));
  }

  .nav-item {
    justify-content: center;
    padding: calc(10px * var(--spacing-scale, 1)) calc(4px * var(--spacing-scale, 1));
    gap: 0;

    span {
      display: none;
    }

    svg {
      flex-shrink: 0;
    }
  }
}

// ─── Collapse button ────────────────────────────────────────────

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  appearance: none;
  text-decoration: none;
  color: $text-muted;
  border-radius: $radius-sm;
  cursor: pointer;
  flex-shrink: 0;
  margin: 0;
  transition: all $transition-fast;

  &:hover {
    color: $text-primary;
    background-color: rgba(var(--accent-primary-rgb), 0.08);
  }
}

@media (max-width: $breakpoint-mobile) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    margin: 0;
    height: auto;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform $transition-normal;
    padding-top: env(safe-area-inset-top, 0px);

    &.open {
      transform: translateX(0);
    }

    .collapse-btn {
      display: flex;
    }

    // Override global utility — sidebar is always 240px wide
    .input-sm {
      width: 90px;
    }
  }
}

</style>
