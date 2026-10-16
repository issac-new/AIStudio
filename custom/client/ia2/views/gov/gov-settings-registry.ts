// overlay/custom/client/ia2/views/gov/gov-settings-registry.ts
// 治理·系统设置分区注册表（C9，R9——设计正本 §二 设置·治理·系统设置页）。
// 导航层视图：既有设置页（hermes.* 旧族 E 组/原生 F 组）按治理域分组呈现，
// 来源只标注不分隔（同域同区合并——对账总表 E/F/G 合账裁决）；表单本体不
// 复制，点入各设置页编辑（合并铁律：一处实现处处消费）。
// 条目清单=对账总表 E8-E27+F9-F16+G 组发现四件的治理侧投影，行号随注。
import type { Router } from 'vue-router'
import { isStoredSuperAdmin } from '@/api/client'
import { features } from '../../../../../config/features'

export interface GovSettingEntry {
  /** 路由名（hermes 族与 ekko 既有设置页） */
  name: string
  /** 展示名（治理域语言，非侧栏原词） */
  label: string
  /** 来源徽标：原生=SwarmStudio 原生（F 组）；旧族=hermes 并入（E 组） */
  source: 'native' | 'legacy'
  /** 门控：superAdmin 条目对非管理员不可见（C9 验收门） */
  superAdmin?: boolean
  /** 功能开关门控（features.* 键） */
  featureGate?: 'pet' | 'agentManager' | 'ekko' | 'versionPreview'
}

export interface GovSettingsDomain {
  key: string
  title: string
  /** 常驻说明（验收门：六域分区说明常驻） */
  note: string
  entries: GovSettingEntry[]
}

/** 分区注册表（单一事实源；条目按对账总表治理域归属投影） */
export const GOV_SETTINGS_DOMAINS: GovSettingsDomain[] = [
  {
    key: 'general', title: '总务', note: '全局配置、版本与运维入口——系统底座类设置。',
    entries: [
      { name: 'hermes.settings', label: '设置主页（含账号/用户/webhook/显示等九页签）', source: 'native' },
      { name: 'hermes.configSettings', label: '配置编辑', source: 'legacy' },
      { name: 'hermes.versionPreview', label: '版本预览', source: 'legacy', featureGate: 'versionPreview' },
    ],
  },
  {
    key: 'people', title: '人员', note: '编制、档案与账号行政——谁在组织里、能进什么。',
    entries: [
      { name: 'hermes.profiles', label: '档案管理', source: 'legacy', superAdmin: true },
      { name: 'hermes.groupChat', label: '群组', source: 'legacy' },
      { name: 'hermes.agentManager', label: 'agent 编制管理', source: 'legacy', superAdmin: true, featureGate: 'agentManager' },
    ],
  },
  {
    key: 'process', title: '流程', note: '看板、工作流与定时任务——过程如何流转。',
    entries: [
      { name: 'hermes.kanban', label: '看板配置', source: 'legacy' },
      { name: 'hermes.workflow', label: '工作流配置', source: 'legacy' },
      { name: 'hermes.jobs', label: '定时任务', source: 'legacy' },
    ],
  },
  {
    key: 'function', title: '功能', note: 'agent、插件与技能装载——组织会什么、装了什么。',
    entries: [
      { name: 'hermes.plugins', label: '插件（功能开关）', source: 'legacy' },
      { name: 'hermes.skills', label: '技能装载', source: 'legacy' },
      { name: 'hermes.petdex', label: '宠物图鉴', source: 'legacy', featureGate: 'pet' },
    ],
  },
  {
    key: 'assets', title: '资产', note: '工具接入、渠道、连接与记忆库——组织依赖的外部资产。',
    entries: [
      { name: 'hermes.mcp', label: '工具接入', source: 'legacy' },
      { name: 'hermes.channels', label: '渠道接入', source: 'legacy' },
      { name: 'hermes.connections', label: '连接管理', source: 'legacy' },
      { name: 'hermes.memory', label: '记忆库配置', source: 'legacy' },
    ],
  },
  {
    key: 'cost', title: '成本', note: '模型、用量与性能——组织跑起来的开销面。',
    entries: [
      { name: 'hermes.models', label: '模型配置', source: 'legacy' },
      { name: 'hermes.usage', label: '用量', source: 'legacy' },
      { name: 'hermes.skillsUsage', label: '技能用量', source: 'legacy' },
      { name: 'hermes.performance', label: '性能', source: 'legacy', superAdmin: true },
    ],
  },
  {
    key: 'audit', title: '审计', note: '日志与留痕——事后可查的凭据面。',
    entries: [
      { name: 'hermes.logs', label: '日志', source: 'legacy' },
    ],
  },
]

/** 条目可见性（镜像 IaSettingsSidebar 语义：superAdmin/功能开关/路由在场）。 */
export function entryVisible(entry: GovSettingEntry, router: Router, superAdmin: boolean): boolean {
  if (entry.superAdmin && !superAdmin) return false
  if (entry.featureGate === 'pet' && !features.pet) return false
  if (entry.featureGate === 'agentManager' && !features.agentManager) return false
  if (entry.featureGate === 'ekko' && !features.ekko) return false
  if (entry.featureGate === 'versionPreview') return true // 侧栏按 isVersionPreview 收敛；此处导航层不重复判，路由侧自守
  return router.hasRoute(entry.name)
}

/** 当前管理员工况（读取即问，避免引整 store——与侧栏 isStoredSuperAdmin 同源）。 */
export function currentSuperAdmin(): boolean {
  return isStoredSuperAdmin()
}
