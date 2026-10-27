<!-- overlay/custom/client/ia2/components/IaSettingsSidebar.vue -->
<!-- 设置页侧栏（2026-09-30 用户裁定：位于注意力条下方、壳内左侧；功能面恢复）。
     2026-10-27 产品一致性 Task 7：条目单一事实源=设置目录注册表
     （gov-settings-registry）——surface 声明条目是否进侧栏，superAdmin/
     featureGate/版本预览开关统一在 entryVisible 一处判定；本组件不再自持
     条目表与门控（此前 pet/agentManager/ekko/preview 四处私判是两套可见性
     账的漂移源头）。历史功能面来源：
       · PageSidebarNav（协作域）——模型/工作流（设备互联/文件 2026-10-20 走查移出）；
       · HermesConfigSidebar（配置域）——Agent 管理/技能/插件/MCP/记忆/频道/任务；
       · AppSidebar（系统域）——系统组（主题/技能用量/用量/性能/日志等）+ 目录入口。
     守卫：全部条目 router.hasRoute() 门控（退役/桌面专属路由自动隐，防死链）。
     分组标签全用既有词表键（sidebar.groupTools/groupSystem）+ 品牌名直书
     Hermes——零新增 i18n、零上游补丁。
     悬停/聚焦单页预取保留（prefetchLegacyView，冷首访分片提前拉热）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isStoredSuperAdmin, getStoredUserId } from '@/api/client'
import { clearThemeBackgroundCache } from '@/api/studio/theme'
import { useAuthStore } from '@/stores/hermes/auth'
import RouteLinkItem from '@/components/common/RouteLinkItem.vue'
import { prefetchLegacyView } from '../views/legacy-view-loaders'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import { SIDEBAR_GROUPS, settingsSidebarEntries, entryVisible, type GovSettingEntry } from '../views/gov/gov-settings-registry'

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()

const isSuperAdmin = computed(() => authStore.isSuperAdmin ?? isStoredSuperAdmin())

/** 分组投影=注册表派生（分组定义/条目/门控全部单一事实源，见注册表头注） */
const groupVisible = computed(() => {
  const visible = settingsSidebarEntries().filter(e => entryVisible(e, router, isSuperAdmin.value))
  return SIDEBAR_GROUPS.map(g => ({ ...g, entries: visible.filter((e: GovSettingEntry) => e.sidebarGroup === g.key) }))
})

/** 登出（2026-10-21 修复：旧 SidebarAccountControls 的挂载页脚随早年补丁退役后
 *  全 UI 无可达登出入口）。语义与原实现一致：清主题背景缓存→设手动登出闸门
 *  （LoginView 据此跳过网关自动登录，避免退出即被拉回）→清本地凭据→整页重载回登录页。 */
async function handleLogout(): Promise<void> {
  const userId = getStoredUserId()
  if (userId) await clearThemeBackgroundCache(userId)
  sessionStorage.setItem('hermes_manual_logout', '1')
  localStorage.clear()
  window.location.reload()
}
</script>

<template>
  <aside class="ia-setnav" data-testid="ia-settings-sidebar">
    <div class="ia-setnav__scroll">
      <section v-for="g in groupVisible" :key="g.labelKey ?? g.label" class="ia-setnav__group">
        <h3 class="ia-setnav__label">{{ g.labelKey ? t(g.labelKey) : g.label }}</h3>
        <RouteLinkItem
          v-for="e in g.entries" :key="e.name"
          class="ia-setnav__item" :to="{ name: e.name }"
          @mouseenter="prefetchLegacyView(e.name)"
          @focusin="prefetchLegacyView(e.name)"
        >
          <CockpitIcon :name="e.icon ?? 'grid'" :size="14" />
          <span>{{ e.sidebarLabelKey ? t(e.sidebarLabelKey) : e.sidebarLabel }}</span>
        </RouteLinkItem>
        <p v-if="g.entries.length === 0" class="ui-empty-state ui-empty-state--compact">—</p>
      </section>
    </div>
    <div class="ia-setnav__footer">
      <button type="button" class="ia-setnav__item ia-setnav__logout" data-testid="ia-settings-logout" @click="handleLogout">
        <CockpitIcon name="grid" :size="14" />
        <span>{{ t('sidebar.logout') }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped lang="scss">
/* Pure Ink：仅 CSS 变量；沿侧栏常规形态（bg-card 底/右描边/28px 行/幽灵 hover） */
.ia-setnav { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--bg-card); border-right: 1px solid var(--border-color); min-height: 0; }
.ia-setnav__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 8px 12px; }
.ia-setnav__group { margin-top: 10px;
  &:first-child { margin-top: 0; }
}
.ia-setnav__label { margin: 6px 6px 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; }
.ia-setnav__footer { flex-shrink: 0; padding: 8px 8px 10px; border-top: 1px solid var(--border-color); }
.ia-setnav__logout { width: 100%; border: none; background: transparent; cursor: pointer; text-align: left; font: inherit; }
.ia-setnav__item { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 6px; font-size: 12px; color: var(--text-secondary); text-decoration: none; white-space: nowrap; overflow: hidden;
  .cockpit-icon { color: var(--text-muted); }
  &:hover { background: var(--bg-secondary); color: var(--text-primary); text-decoration: none; }
  &.active { background: var(--bg-secondary); color: var(--text-primary); font-weight: 600;
    .cockpit-icon { color: var(--text-primary); }
  }
}
</style>
