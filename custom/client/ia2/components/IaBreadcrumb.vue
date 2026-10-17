<!-- overlay/custom/client/ia2/components/IaBreadcrumb.vue -->
<!-- 面包屑（2026-10-17 驾驶舱层级批）：全站此前零 breadcrumb，末端页回上级只能靠
     页签条常驻或顶栏重选，「层级深乱/不知道自己在哪」是用户实报痛点。位置感知=
     旅程（首页）＞中心/阶段＞页签；标签取单一事实源（sim-tabs/gov-tabs/STAGE_META），
     当前段 aria-current；旅程页自身与未知名不渲染。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { SIM_TABS_TEXT } from '../views/sim/sim-tabs'
import { GOV_TABS_TEXT } from '../views/gov/gov-tabs'
import { STAGE_META } from '../stage-meta'
import { stageContextQuery } from '../nav-centers'

interface Crumb { label: string; to?: { name: string; query?: Record<string, string> } }

// 无路由/无 i18n 上下文（嵌板测试态）兜底：两者都可能返回无 locale/route 的
// 对象（TabIntroBanner 同款守卫先例）；跳转用 button+router.push 而非
// router-link——最小测试路由器缺 ia2.journey 时 link 的 resolve 会直接抛。
const route = useRoute() as ReturnType<typeof useRoute> | undefined
const router = useRouter() as ReturnType<typeof useRouter> | undefined
const i18nCtx = useI18n() as { locale?: { value?: string } }
const lang = computed(() => (String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh') ? 'zh' : 'en') as 'zh' | 'en')

function go(c: Crumb): void {
  if (c.to) void router?.push(c.to)
}
const sim = computed(() => SIM_TABS_TEXT[lang.value])
const gov = computed(() => GOV_TABS_TEXT[lang.value])

const PAGE_LABEL: Record<string, { zh: string; en: string }> = {
  // 键=去 ia2. 前缀的路由名（i18n 覆盖守门只豁免 name:/case 语境，对象键会被
  // 误判为文案键——去前缀后查表统一 slice，字面量不再落在扫描面）
  board: { zh: '看板', en: 'Board' },
  inbox: { zh: '审批收件箱', en: 'Approvals Inbox' },
  collab: { zh: '工作台', en: 'Workbench' },
  dash: { zh: '驾驶舱概览', en: 'Cockpit Overview' },
  teams: { zh: '团队', en: 'Teams' },
  agents: { zh: '智能体', en: 'Agents' },
  accounts: { zh: '账户管理', en: 'Accounts' },
  deliveryCases: { zh: '交付案例', en: 'Delivery Cases' },
  simOrchestration: { zh: '场景编排', en: 'Orchestration' },
  simSettings: { zh: '仿真设置', en: 'Simulation Settings' },
  govSettings: { zh: '系统设置', en: 'System Settings' },
  govModelProviders: { zh: '模型服务商', en: 'Model Providers' },
}
const SIM_TAB_LABEL: Record<string, keyof typeof SIM_TABS_TEXT.zh> = {
  'ia2.sim': 'tabOverview',
  'ia2.simSupervision': 'tabSupervision',
  'ia2.simOps': 'tabOps',
  'ia2.simEvidence': 'tabEvidence',
  'ia2.simDelivery': 'tabDelivery',
  'ia2.simTrace': 'tabTrace',
}
const GOV_TAB_LABEL: Record<string, keyof typeof GOV_TABS_TEXT.zh> = {
  'ia2.governance': 'tabProcess',
  'ia2.govOrgAssets': 'tabOrgAssets',
  'ia2.govClearance': 'tabClearance',
  'ia2.govIssues': 'tabIssues',
  'ia2.govAudit': 'tabAudit',
  'ia2.govDocs': 'tabDocs',
  'ia2.govMetrics': 'tabMetrics',
}

const crumbs = computed<Crumb[]>(() => {
  const name = String(route?.name ?? '')
  const short = name.replace(/^ia2\./, '')
  const zh = lang.value === 'zh'
  const out: Crumb[] = [{ label: zh ? '旅程' : 'Journey', to: { name: 'ia2.journey' } }]

  // 来路阶段随中心层级链保留：从②需求进文档评审，点面包屑回治理中心仍亮②
  const fromQ = stageContextQuery(route?.query?.from)
  const stage = STAGE_META.find(m => `ia2.stage${m.no}` === name)
  if (stage) {
    out.push({ label: `${'①②③④⑤⑥'[stage.no - 1]} ${zh ? stage.navLabel : stage.navLabelEn}` })
    return out
  }
  const simKey = SIM_TAB_LABEL[name]
  if (simKey || short === 'simOrchestration' || short === 'simSettings') {
    out.push({ label: sim.value.shellTitle, to: { name: 'ia2.sim', query: fromQ } })
    // 中心根路径不再追加默认签段：旅程＞仿真中心 已经说清位置（签级才加第三段）
    if (name !== 'ia2.sim') out.push({ label: simKey ? String(sim.value[simKey]) : (PAGE_LABEL[short]?.[lang.value] ?? '') })
    return out
  }
  const govKey = GOV_TAB_LABEL[name]
  if (govKey || short === 'govSettings' || short === 'govModelProviders') {
    out.push({ label: gov.value.shellTitle, to: { name: 'ia2.governance', query: fromQ } })
    if (name !== 'ia2.governance') out.push({ label: govKey ? String(gov.value[govKey]) : (PAGE_LABEL[short]?.[lang.value] ?? '') })
    return out
  }
  const page = PAGE_LABEL[short]
  if (page) out.push({ label: page[lang.value] })
  return out
})
</script>

<template>
  <nav v-if="crumbs.length > 1" class="ia-bc" aria-label="面包屑" data-testid="ia-breadcrumb">
    <ol class="ia-bc__list">
      <li v-for="(c, i) in crumbs" :key="i" class="ia-bc__item">
        <button v-if="c.to && i < crumbs.length - 1" type="button" class="ia-bc__link" @click="go(c)">{{ c.label }}</button>
        <span v-else class="ia-bc__current" aria-current="page" :data-testid="i === crumbs.length - 1 ? 'ia-breadcrumb-current' : undefined">{{ c.label }}</span>
        <span v-if="i < crumbs.length - 1" class="ia-bc__sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.ia-bc { font-size: 12px; line-height: 1.4; color: var(--text-muted); }
.ia-bc__list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; list-style: none; margin: 0; padding: 0; }
.ia-bc__item { display: inline-flex; align-items: center; gap: 4px; }
.ia-bc__link { border: none; background: transparent; padding: 0; font: inherit; color: var(--accent-primary); text-decoration: none; cursor: pointer; }
.ia-bc__link:hover { text-decoration: underline; text-underline-offset: 3px; }
.ia-bc__current { color: var(--text-primary); font-weight: 600; }
.ia-bc__sep { opacity: 0.5; }
</style>
