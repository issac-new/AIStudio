<!-- overlay/custom/client/ia2/components/IaSettingsSidebar.vue -->
<!-- 设置页侧栏（2026-09-30 用户裁定：位于注意力条下方、壳内左侧；功能面恢复）。
     功能面 = 原 hermes-studio 三侧栏并集：
       · PageSidebarNav（协作域）——模型/工作流/连接/文件（聊天/群聊/历史由
         驾驶舱工作台自持，不重复挂）；
       · HermesConfigSidebar（配置域）——Agent 管理/技能/插件/MCP/记忆/频道/
         任务/看板/学习轨迹（configSettings 经设置页页签流转直达，不重复挂）；
       · AppSidebar（系统域）——系统组全集，主题/宠物/技能用量等统一导航与
         P10 收缩批摘除项全量恢复（路由与页面本就在）。
     守卫：全部条目 router.hasRoute() 门控（退役/桌面专属路由自动隐，防死链）；
     superadmin 项随权限显隐（authStore 响应式 + localStorage 快照回退，与
     AppSidebar 同款）；版本预览随 VITE_HERMES_PREVIEW（同 AppSidebar）。
     分组标签全用既有词表键（sidebar.groupTools/groupSystem）+ 品牌名直书
     Hermes——零新增 i18n、零上游补丁。
     视图双入口（驾驶舱/IDE 工作台）退役：与页头品牌位切换器重复
     （2026-09-30 用户裁定保留页面顶部即可）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isStoredSuperAdmin } from '@/api/client'
import { useAuthStore } from '@/stores/hermes/auth'
import RouteLinkItem from '@/components/common/RouteLinkItem.vue'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import { features } from '../../../../config/features'

interface NavEntry {
  name: string
  icon: string
  labelKey?: string
  /** 直书文案（品牌名/无词表键时用，与分组 label 同规——走 t() 会触发 intlify 缺键告警） */
  label?: string
  superAdmin?: boolean
}

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()

const isSuperAdmin = computed(() => authStore.isSuperAdmin ?? isStoredSuperAdmin())
const isVersionPreview = import.meta.env.VITE_HERMES_PREVIEW === '1'

/** 三域分组；labelKey 用既有词表键，label 为直书文案（Hermes 是品牌名，词表
 *  无该键——走 t() 会触发 intlify 缺键告警并渲染裸键名） */
const GROUPS: Array<{ labelKey?: string; label?: string; entries: NavEntry[] }> = [
  {
    labelKey: 'sidebar.groupTools',
    entries: [
      { name: 'hermes.models', icon: 'cpu', labelKey: 'sidebar.models' },
      { name: 'hermes.workflow', icon: 'fork', labelKey: 'sidebar.workflow' },
      { name: 'hermes.connections', icon: 'link', labelKey: 'sidebar.connections' },
      { name: 'hermes.files', icon: 'folder', labelKey: 'sidebar.files' },
    ],
  },
  {
    label: 'Hermes',
    entries: [
      { name: 'hermes.agentManager', icon: 'users', labelKey: 'sidebar.agentManager', superAdmin: true },
      { name: 'hermes.skills', icon: 'decompose', labelKey: 'sidebar.skills' },
      { name: 'hermes.plugins', icon: 'plug', labelKey: 'sidebar.plugins' },
      { name: 'hermes.mcp', icon: 'terminal', labelKey: 'sidebar.mcp' },
      { name: 'hermes.memory', icon: 'archive', labelKey: 'sidebar.memory' },
      { name: 'hermes.channels', icon: 'mail', labelKey: 'sidebar.channels' },
      { name: 'hermes.jobs', icon: 'clock', labelKey: 'sidebar.jobs' },
      { name: 'hermes.kanban', icon: 'kanban', labelKey: 'sidebar.kanban' },
      { name: 'hermes.journey', icon: 'history', labelKey: 'sidebar.journey' },
      // ekko 运维面（2026-10-02 用户裁定开门）：上游 /ekko/* 四页（memory/skills/
      // mcp/settings）入口；superadmin+features.ekko 双门控，页面自带 ekkoConfig
      // meta 守卫（patch 523）——四页经 URL 直达，本入口落配置页
      { name: 'ekko.settings', icon: 'grid', label: 'ekko 运维', superAdmin: true },
    ],
  },
  {
    labelKey: 'sidebar.groupSystem',
    entries: [
      { name: 'hermes.settings', icon: 'settings', labelKey: 'sidebar.settings' },
      { name: 'hermes.profiles', icon: 'user', labelKey: 'sidebar.profiles', superAdmin: true },
      { name: 'hermes.theme', icon: 'palette', labelKey: 'sidebar.theme' },
      { name: 'hermes.petdex', icon: 'users', labelKey: 'sidebar.petdex' },
      { name: 'hermes.skillsUsage', icon: 'specify', labelKey: 'sidebar.skillsUsage' },
      { name: 'hermes.logs', icon: 'file', labelKey: 'sidebar.logs' },
      { name: 'hermes.usage', icon: 'chart', labelKey: 'sidebar.usage' },
      { name: 'hermes.performance', icon: 'activity', labelKey: 'sidebar.performance', superAdmin: true },
      { name: 'hermes.terminal', icon: 'terminal', labelKey: 'sidebar.terminal', superAdmin: true },
      { name: 'hermes.browser', icon: 'globe', labelKey: 'sidebar.browser' },
      { name: 'hermes.versionPreview', icon: 'refresh', labelKey: 'sidebar.versionPreview' },
    ],
  },
]

function visible(e: NavEntry): boolean {
  if (e.superAdmin && !isSuperAdmin.value) return false
  if (e.name === 'hermes.versionPreview' && !isVersionPreview) return false
  // 门控一致性（2026-10-01 上游自用批 A4）：petdex 条目随 features.pet（S3 既定
  // 语义——pet 三件套默认关，此前侧栏条目漏接开关线）；agentManager 条目随
  // features.agentManager（收编路由同门控，见 routes.ts ANNEXED_LEGACY）。
  if (e.name === 'hermes.petdex' && !features.pet) return false
  if (e.name === 'hermes.agentManager' && !features.agentManager) return false
  // ekko 开门（2026-10-02 用户裁定）：条目随 features.ekko（默认开，false 可关）
  if (e.name === 'ekko.settings' && !features.ekko) return false
  return router.hasRoute(e.name)
}

const groupVisible = computed(() =>
  GROUPS.map(g => ({ ...g, entries: g.entries.filter(visible) })))
</script>

<template>
  <aside class="ia-setnav" data-testid="ia-settings-sidebar">
    <div class="ia-setnav__scroll">
      <section v-for="g in groupVisible" :key="g.labelKey ?? g.label" class="ia-setnav__group">
        <h3 class="ia-setnav__label">{{ g.labelKey ? t(g.labelKey) : g.label }}</h3>
        <RouteLinkItem
          v-for="e in g.entries" :key="e.name"
          class="ia-setnav__item" :to="{ name: e.name }"
        >
          <CockpitIcon :name="e.icon" :size="14" />
          <span>{{ e.labelKey ? t(e.labelKey) : e.label }}</span>
        </RouteLinkItem>
        <p v-if="g.entries.length === 0" class="ia-setnav__empty">—</p>
      </section>
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
.ia-setnav__item { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 6px; font-size: 12px; color: var(--text-secondary); text-decoration: none; white-space: nowrap; overflow: hidden;
  .cockpit-icon { color: var(--text-muted); }
  &:hover { background: var(--bg-secondary); color: var(--text-primary); text-decoration: none; }
  &.active { background: var(--bg-secondary); color: var(--text-primary); font-weight: 600;
    .cockpit-icon { color: var(--text-primary); }
  }
}
.ia-setnav__empty { margin: 2px 6px; font-size: 11px; color: var(--text-muted); }
</style>
