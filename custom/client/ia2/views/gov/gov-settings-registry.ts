// overlay/custom/client/ia2/views/gov/gov-settings-registry.ts
// 设置目录注册表（C9 起源；2026-10-27 产品一致性 Task 7 升格为设置单一事实源）：
// 目录页（GovSettingsView）与设置侧栏（IaSettingsSidebar）都从本表派生——
// 条目 surface 声明出现在目录/侧栏/两者/无；superAdmin、featureGate、版本预览
// 开关统一在 entryVisible 一处判定，两消费面零私货（此前侧栏自带条目表与
// pet/agentManager/ekko/preview 四处门控，与目录页两套账，可见性漂移源头）。
// 表单本体不复制（合并铁律：一处实现处处消费）；分组呈现=治理域语言，
// 用量/性能/日志归「观察诊断」、群组归「协作」（2026-10-27 只改呈现分组，
// 路由与能力不动）。条目清单=对账总表 E8-E27+F9-F16+G 组发现四件 + 侧栏
// 专属面（theme/ekko/目录自身）。
import type { Router } from 'vue-router'
import { isStoredSuperAdmin } from '@/api/client'
import { features } from '../../../../../config/features'

/** 条目呈现面：catalog=设置目录页；sidebar=设置侧栏；both=两者；none=登记不呈现（守门/审计用） */
export type SettingsSurface = 'catalog' | 'sidebar' | 'both' | 'none'

/** 设置侧栏分组键（沿原三侧栏功能面：工具/Hermes/系统） */
export type SidebarGroupKey = 'tools' | 'hermes' | 'system'

export interface GovSettingEntry {
  /** 路由名（hermes 族/ekko 既有设置页/ia2 目录页） */
  name: string
  /** 目录展示名（治理域语言，非侧栏原词） */
  label: string
  /** 来源徽标：原生=AIStudio 原生；旧族=hermes 并入 */
  source: 'native' | 'legacy'
  /** 呈现面声明（目录与侧栏据此派生，防止无差别双向暴露） */
  surface: SettingsSurface
  /** 门控：superAdmin 条目对非管理员不可见（C9 验收门） */
  superAdmin?: boolean
  /** 功能开关门控（features.* 键；versionPreview 叠加 VITE_HERMES_PREVIEW） */
  featureGate?: 'pet' | 'agentManager' | 'ekko' | 'versionPreview'
  /** 侧栏分组（surface 含 sidebar 时必填） */
  sidebarGroup?: SidebarGroupKey
  /** 侧栏词表键（优先；无键词用 sidebarLabel 直书——走 t() 会触发缺键告警） */
  sidebarLabelKey?: string
  /** 侧栏直书文案（品牌名/目录页名等无词表键条目） */
  sidebarLabel?: string
  /** 侧栏组内序（小者在前；显式保序，杜绝域序拉平后顺序漂移） */
  sidebarOrder?: number
  /** CockpitIcon 图标名（目录与侧栏共用） */
  icon?: string
}

export interface GovSettingsDomain {
  key: string
  title: string
  /** 常驻说明（验收门：分区说明常驻） */
  note: string
  entries: GovSettingEntry[]
}

/** 分区注册表（单一事实源；条目按治理域归属投影） */
export const GOV_SETTINGS_DOMAINS: GovSettingsDomain[] = [
  {
    key: 'general', title: '总务', note: '全局配置、外观、版本与运维入口——系统底座类设置。',
    entries: [
      // 目录页自身只挂侧栏（「系统设置导航」入口的派生源），不进目录避免自引用
      { name: 'ia2.govSettings', label: '设置目录', source: 'native', surface: 'sidebar', sidebarGroup: 'system', sidebarOrder: 1, icon: 'settings', sidebarLabel: '系统设置导航' },
      // 2026-10-27 单一设置入口：hermes.settings 在目录内改称「通用设置」，
      // 不再是第二个「设置主页」（设置主页=目录页 ia2.govSettings）
      { name: 'hermes.settings', label: '通用设置', source: 'native', surface: 'both', sidebarGroup: 'system', sidebarOrder: 2, icon: 'settings', sidebarLabelKey: 'sidebar.settings' },
      // 侧栏专属面入册（Task 7）：主题外观此前不在注册表——目录/侧栏派生单源后防丢
      { name: 'hermes.theme', label: '主题外观', source: 'legacy', surface: 'sidebar', sidebarGroup: 'system', sidebarOrder: 4, icon: 'palette', sidebarLabelKey: 'sidebar.theme' },
      { name: 'hermes.configSettings', label: '配置编辑', source: 'legacy', surface: 'catalog' },
      // ekko 运维面（2026-10-02 开门）：上游 /ekko/* 页自有壳与 ekkoConfig 守卫
      // （patch 523），superadmin+features.ekko 双门控——只挂侧栏
      { name: 'ekko.settings', label: 'ekko 运维', source: 'legacy', surface: 'sidebar', superAdmin: true, featureGate: 'ekko', sidebarGroup: 'hermes', sidebarOrder: 8, icon: 'grid', sidebarLabel: 'ekko 运维' },
      { name: 'hermes.versionPreview', label: '版本预览', source: 'legacy', surface: 'both', superAdmin: true, featureGate: 'versionPreview', sidebarGroup: 'system', sidebarOrder: 9, icon: 'refresh', sidebarLabelKey: 'sidebar.versionPreview' },
    ],
  },
  {
    key: 'people', title: '人员', note: '编制、档案与账号行政——谁在组织里、能进什么。',
    entries: [
      { name: 'hermes.profiles', label: '档案管理', source: 'legacy', surface: 'both', superAdmin: true, sidebarGroup: 'system', sidebarOrder: 3, icon: 'user', sidebarLabelKey: 'sidebar.profiles' },
      { name: 'hermes.agentManager', label: 'agent 编制管理', source: 'legacy', surface: 'both', superAdmin: true, featureGate: 'agentManager', sidebarGroup: 'hermes', sidebarOrder: 1, icon: 'users', sidebarLabelKey: 'sidebar.agentManager' },
    ],
  },
  {
    key: 'collab', title: '协作', note: '群组与协同面——人和 agent 在哪一起说话、一起干活。',
    entries: [
      // 群组由工作台自持入口（2026-10-27 归「协作」域呈现；侧栏不重复挂）
      { name: 'hermes.groupChat', label: '群组', source: 'legacy', surface: 'catalog' },
    ],
  },
  {
    key: 'process', title: '流程', note: '看板、工作流与定时任务——过程如何流转。',
    entries: [
      { name: 'hermes.workflow', label: '工作流配置', source: 'legacy', surface: 'both', sidebarGroup: 'tools', sidebarOrder: 2, icon: 'fork', sidebarLabelKey: 'sidebar.workflow' },
      { name: 'hermes.jobs', label: '定时任务', source: 'legacy', surface: 'both', sidebarGroup: 'hermes', sidebarOrder: 7, icon: 'clock', sidebarLabelKey: 'sidebar.jobs' },
    ],
  },
  {
    key: 'function', title: '功能', note: 'agent、插件与技能装载——组织会什么、装了什么。',
    entries: [
      { name: 'hermes.plugins', label: '插件', source: 'legacy', surface: 'both', sidebarGroup: 'hermes', sidebarOrder: 3, icon: 'plug', sidebarLabelKey: 'sidebar.plugins' },
      { name: 'hermes.skills', label: '技能装载', source: 'legacy', surface: 'both', sidebarGroup: 'hermes', sidebarOrder: 2, icon: 'decompose', sidebarLabelKey: 'sidebar.skills' },
      // petdex 随 features.pet（默认关）；侧栏已按员工导航收敛移出，只留目录
      { name: 'hermes.petdex', label: '宠物图鉴', source: 'legacy', surface: 'catalog', featureGate: 'pet' },
    ],
  },
  {
    key: 'assets', title: '资产', note: '工具接入、渠道、连接与记忆库——组织依赖的外部资产。',
    entries: [
      { name: 'ia2.modelProviders', label: '模型服务商', source: 'native', surface: 'catalog' },
      { name: 'hermes.mcp', label: '工具接入', source: 'legacy', surface: 'both', sidebarGroup: 'hermes', sidebarOrder: 4, icon: 'terminal', sidebarLabelKey: 'sidebar.mcp' },
      { name: 'hermes.channels', label: '渠道接入', source: 'legacy', surface: 'both', sidebarGroup: 'hermes', sidebarOrder: 6, icon: 'mail', sidebarLabelKey: 'sidebar.channels' },
      // 连接管理 2026-10-20 移出员工导航（空白页走查），目录保留
      { name: 'hermes.connections', label: '连接管理', source: 'legacy', surface: 'catalog' },
      { name: 'hermes.memory', label: '记忆库配置', source: 'legacy', surface: 'both', sidebarGroup: 'hermes', sidebarOrder: 5, icon: 'archive', sidebarLabelKey: 'sidebar.memory' },
    ],
  },
  {
    key: 'cost', title: '成本', note: '模型与配置开销——组织跑起来的钱花在哪。',
    entries: [
      { name: 'hermes.models', label: '模型配置', source: 'legacy', surface: 'both', sidebarGroup: 'tools', sidebarOrder: 1, icon: 'cpu', sidebarLabelKey: 'sidebar.models' },
    ],
  },
  {
    key: 'diagnostics', title: '观察诊断', note: '用量、性能与日志——组织运转状态的观察与取证面。',
    entries: [
      { name: 'hermes.usage', label: '用量', source: 'legacy', surface: 'both', sidebarGroup: 'system', sidebarOrder: 7, icon: 'chart', sidebarLabelKey: 'sidebar.usage' },
      { name: 'hermes.skillsUsage', label: '技能用量', source: 'legacy', surface: 'both', sidebarGroup: 'system', sidebarOrder: 5, icon: 'specify', sidebarLabelKey: 'sidebar.skillsUsage' },
      { name: 'hermes.performance', label: '性能', source: 'legacy', surface: 'both', superAdmin: true, sidebarGroup: 'system', sidebarOrder: 8, icon: 'activity', sidebarLabelKey: 'sidebar.performance' },
      { name: 'hermes.logs', label: '日志', source: 'legacy', surface: 'both', sidebarGroup: 'system', sidebarOrder: 6, icon: 'file', sidebarLabelKey: 'sidebar.logs' },
    ],
  },
]

/** 侧栏分组定义（标签用既有词表键或直书品牌名——零新增 i18n） */
export const SIDEBAR_GROUPS: ReadonlyArray<{ key: SidebarGroupKey; labelKey?: string; label?: string }> = [
  { key: 'tools', labelKey: 'sidebar.groupTools' },
  { key: 'hermes', label: 'Hermes' },
  { key: 'system', labelKey: 'sidebar.groupSystem' },
]

/** 版本预览统一判定（Task 7，收编侧栏语义）：预览项只在 VITE_HERMES_PREVIEW
 *  开时显示。上游 AppSidebar 的 `!isVersionPreview` 分支（关时显示）与收编侧栏
 * 矛盾——以本函数为单一实现，目录与侧栏同判；上游 App.vue 侧栏在收编壳
 * fullscreen 语义下不可达，不再各自为政。 */
export function isVersionPreviewEnabled(): boolean {
  return import.meta.env.VITE_HERMES_PREVIEW === '1'
}

/** 条目可见性（目录与侧栏同一判定：superAdmin/功能开关/版本预览开关/路由在场）。 */
export function entryVisible(entry: GovSettingEntry, router: Router, superAdmin: boolean): boolean {
  if (entry.superAdmin && !superAdmin) return false
  if (entry.featureGate === 'pet' && !features.pet) return false
  if (entry.featureGate === 'agentManager' && !features.agentManager) return false
  if (entry.featureGate === 'ekko' && !features.ekko) return false
  if (entry.featureGate === 'versionPreview' && !isVersionPreviewEnabled()) return false
  return router.hasRoute(entry.name)
}

/** 条目是否落在给定呈现面 */
export function onSurface(entry: GovSettingEntry, surface: 'catalog' | 'sidebar'): boolean {
  return entry.surface === surface || entry.surface === 'both'
}

/** 侧栏派生条目（surface 含 sidebar；按分组定义序 + sidebarOrder 保序）。 */
export function settingsSidebarEntries(): GovSettingEntry[] {
  return GOV_SETTINGS_DOMAINS.flatMap(d => d.entries)
    .filter(e => onSurface(e, 'sidebar'))
    .sort((a, b) => {
      const ga = SIDEBAR_GROUPS.findIndex(g => g.key === a.sidebarGroup)
      const gb = SIDEBAR_GROUPS.findIndex(g => g.key === b.sidebarGroup)
      return ga - gb || (a.sidebarOrder ?? 99) - (b.sidebarOrder ?? 99)
    })
}

/** 当前管理员工况（读取即问，避免引整 store——与侧栏 isStoredSuperAdmin 同源）。 */
export function currentSuperAdmin(): boolean {
  return isStoredSuperAdmin()
}
