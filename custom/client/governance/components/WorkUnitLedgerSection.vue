<!-- overlay/custom/client/governance/components/WorkUnitLedgerSection.vue -->
<!-- 执行单元责任台账（2026-11-06 第一增量）：台账表 + 责任卡编辑 + 状态迁移。
     数据面 /api/governance/agent-identity* 与 /api/governance/people；
     判定全在服务端，本层只做展示与提交，缺口如实显示不装绿。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  title: '执行单元责任台账', sub: '每个 AI 执行单元：责任卡 · 五阶段生命周期 · 高风险复核人分离（登记→准入→运行→变更→退出）',
  colName: '执行单元', colStage: '阶段', colOwner: '结果责任人', colReviewer: '复核人', colGaps: '缺口',
  gapsNone: '无', people: '自然人名单', activate: '启用', refresh: '刷新',
  saveCard: '保存责任卡', transition: '迁移', judgments: '署名记录',
  stageRegistered: '登记', stageAdmitted: '准入', stageRunning: '运行', stageChanging: '变更', stageRetired: '退出',
  formOwner: '主责任人（person.id）', formReviewer: '复核人（高风险必填）', formRisk: '风险档',
  formStandard: '交付标准', formEscalation: '升级条件（每行一条）', formPause: '暂停条件（每行一条）',
  formTaker: '接管人', formTestCase: '检验用例版本', formBudget: '成本预算（数值）', formUnit: '预算单位',
  formMaintainer: '技术维护人', formLocation: '部署位置', formSign: '业务负责人签署（person.id）',
  formReason: '迁移理由', formBy: '迁移人（person.id）', formTo: '目标阶段',
  empty: '暂无执行单元', fail: '操作失败', okMsg: '已提交',
} : {
  title: 'Work-unit Responsibility Ledger', sub: 'Per AI unit: responsibility card · 5-stage lifecycle · reviewer separation for high risk (register→admit→run→change→retire)',
  colName: 'Unit', colStage: 'Stage', colOwner: 'Result owner', colReviewer: 'Reviewer', colGaps: 'Gaps',
  gapsNone: 'none', people: 'People', activate: 'Activate', refresh: 'Refresh',
  saveCard: 'Save card', transition: 'Transition', judgments: 'Judgments',
  stageRegistered: 'registered', stageAdmitted: 'admitted', stageRunning: 'running', stageChanging: 'changing', stageRetired: 'retired',
  formOwner: 'Primary owner (person.id)', formReviewer: 'Reviewer (required for high risk)', formRisk: 'Risk tier',
  formStandard: 'Delivery standard', formEscalation: 'Escalation conditions (one per line)', formPause: 'Pause conditions (one per line)',
  formTaker: 'Taker-over', formTestCase: 'Test case version', formBudget: 'Cost budget (number)', formUnit: 'Budget unit',
  formMaintainer: 'Maintainer', formLocation: 'Deployment location', formSign: 'Business owner sign (person.id)',
  formReason: 'Transition reason', formBy: 'By (person.id)', formTo: 'Target stage',
  empty: 'No units registered', fail: 'Operation failed', okMsg: 'Submitted',
})

interface CardView { card: Record<string, unknown> | null; stage: string; gaps: { field: string; detail: string }[] }
interface Identity { id: string; name: string; kind: string; owner: string }
interface Person { id: string; name: string; active: boolean; emails: string[] }
type Row = Identity & { view?: CardView }

const rows = ref<Row[]>([])
const people = ref<Person[]>([])
const error = ref('')
const msg = ref('')
const busy = ref(false)
const editing = ref<string>('')
const form = ref<Record<string, string>>({})
const transTo = ref('admitted')
const transBy = ref('')
const transReason = ref('')

function auth(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

async function refresh(): Promise<void> {
  busy.value = true; error.value = ''; msg.value = ''
  try {
    const [idRes, pRes] = await Promise.all([
      fetch('/api/governance/agent-identity', { headers: auth() }),
      fetch('/api/governance/people', { headers: auth() }),
    ])
    const idBody = await idRes.json()
    people.value = (await pRes.json()).people ?? []
    const views = await Promise.all((idBody.identities ?? []).map(async (i: Identity) => {
      const v = await fetch(`/api/governance/agent-identity/${encodeURIComponent(i.id)}/card`, { headers: auth() })
      return { ...i, view: (await v.json()).view }
    }))
    rows.value = views
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

function stageLabel(stage: string): string {
  const m: Record<string, string> = {
    registered: T.value.stageRegistered, admitted: T.value.stageAdmitted, running: T.value.stageRunning,
    changing: T.value.stageChanging, retired: T.value.stageRetired,
  }
  return m[stage] ?? stage
}

function ownerName(pid: string | undefined): string {
  if (!pid) return '—'
  return people.value.find((p) => p.id === pid)?.name ?? pid
}

function startEdit(row: Row): void {
  editing.value = row.id
  const c = (row.view?.card ?? {}) as Record<string, unknown>
  form.value = {
    primaryOwner: String(c.primaryOwner ?? people.value.find((p) => p.active)?.id ?? ''),
    reviewer: String(c.reviewer ?? ''),
    riskTier: String(c.riskTier ?? 'medium'),
    deliveryStandard: String(c.deliveryStandard ?? ''),
    escalation: Array.isArray(c.escalation) ? (c.escalation as string[]).join('\n') : '',
    pauseConditions: Array.isArray(c.pauseConditions) ? (c.pauseConditions as string[]).join('\n') : '',
    takerOver: String(c.takerOver ?? ''),
    testCaseVersion: String(c.testCaseVersion ?? ''),
    costLimit: String((c.costBudget as { limit?: number } | undefined)?.limit ?? ''),
    costUnit: String((c.costBudget as { unit?: string } | undefined)?.unit ?? 'CNY/轮'),
    maintainer: String(c.maintainer ?? ''),
    deploymentLocation: String(c.deploymentLocation ?? ''),
    signBy: String((c.businessOwnerSign as { signedBy?: string } | undefined)?.signedBy ?? ''),
  }
}

async function saveCard(): Promise<void> {
  error.value = ''; msg.value = ''
  const lines = (v: string): string[] => v.split('\n').map((s) => s.trim()).filter(Boolean)
  const body = {
    deliveryStandard: form.value.deliveryStandard ?? '',
    riskTier: form.value.riskTier || 'medium',
    primaryOwner: form.value.primaryOwner ?? '',
    ...(form.value.reviewer ? { reviewer: form.value.reviewer } : {}),
    escalation: lines(form.value.escalation ?? ''),
    pauseConditions: lines(form.value.pauseConditions ?? ''),
    takerOver: form.value.takerOver ?? '',
    testCaseVersion: form.value.testCaseVersion ?? '',
    costBudget: { limit: Number(form.value.costLimit || 0), unit: form.value.costUnit || '' },
    maintainer: form.value.maintainer ?? '',
    deploymentLocation: form.value.deploymentLocation ?? '',
    ...(form.value.signBy ? { businessOwnerSign: { signedBy: form.value.signBy, signedAt: Date.now() } } : {}),
  }
  const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(editing.value)}/card`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  msg.value = T.value.okMsg
  await refresh()
}

async function doTransition(row: Row): Promise<void> {
  error.value = ''; msg.value = ''
  const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(row.id)}/transition`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify({
      to: transTo.value, by: transBy.value, reason: transReason.value,
      ...(transTo.value === 'retired' ? { exit: { kind: 'pause', items: ['交接确认：见署名记录'], confirmedBy: transBy.value } } : {}),
    }),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  msg.value = T.value.okMsg
  await refresh()
}

async function activate(p: Person): Promise<void> {
  await fetch(`/api/governance/people/${encodeURIComponent(p.id)}/activate`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: '{}' })
  await refresh()
}

onMounted(() => void refresh())
</script>

<template>
  <div class="wu" data-testid="gov-workunit-ledger">
    <div class="wu__bar">
      <h3 class="wu__title">{{ T.title }}</h3>
      <button type="button" class="wu__btn" :disabled="busy" @click="refresh()">{{ T.refresh }}</button>
    </div>
    <p class="wu__sub">{{ T.sub }}</p>
    <p v-if="error" class="wu__err" data-testid="gov-workunit-err">{{ T.fail }}：{{ error }}</p>
    <p v-if="msg" class="wu__ok">{{ msg }}</p>

    <div v-if="people.length" class="wu__people">
      <span class="wu__people-t">{{ T.people }}：</span>
      <span v-for="p in people" :key="p.id" class="wu__chip" :class="{ 'wu__chip--off': !p.active }">
        {{ p.name }}<template v-if="!p.active"> · <button type="button" class="wu__link" @click="activate(p)">{{ T.activate }}</button></template>
      </span>
    </div>

    <table v-if="rows.length" class="wu__table">
      <thead>
        <tr>
          <th>{{ T.colName }}</th><th>{{ T.colStage }}</th><th>{{ T.colOwner }}</th><th>{{ T.colReviewer }}</th><th>{{ T.colGaps }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :data-testid="`gov-workunit-row-${r.name}`">
          <td>{{ r.name }}</td>
          <td><span class="wu__stage" :class="`wu__stage--${r.view?.stage ?? 'registered'}`">{{ stageLabel(r.view?.stage ?? 'registered') }}</span></td>
          <td>{{ ownerName(r.view?.card?.primaryOwner as string | undefined) }}</td>
          <td>{{ ownerName(r.view?.card?.reviewer as string | undefined) }}</td>
          <td>
            <span v-if="!r.view?.gaps?.length" class="wu__ok-inline">{{ T.gapsNone }}</span>
            <ul v-else class="wu__gaps" :data-testid="`gov-workunit-gaps-${r.name}`">
              <li v-for="(g, i) in r.view.gaps.slice(0, 3)" :key="i">{{ g.detail }}</li>
              <li v-if="r.view.gaps.length > 3">+{{ r.view.gaps.length - 3 }}</li>
            </ul>
          </td>
          <td><button type="button" class="wu__link" @click="startEdit(r)">{{ T.saveCard }}</button></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="wu__empty">{{ T.empty }}</p>

    <div v-if="editing" class="wu__form">
      <h4>{{ T.saveCard }}</h4>
      <label>{{ T.formStandard }}<textarea v-model="form.deliveryStandard" rows="2" /></label>
      <label>{{ T.formRisk }}
        <select v-model="form.riskTier"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
      </label>
      <label>{{ T.formOwner }}<input v-model="form.primaryOwner" /></label>
      <label>{{ T.formReviewer }}<input v-model="form.reviewer" /></label>
      <label>{{ T.formEscalation }}<textarea v-model="form.escalation" rows="2" /></label>
      <label>{{ T.formPause }}<textarea v-model="form.pauseConditions" rows="2" /></label>
      <label>{{ T.formTaker }}<input v-model="form.takerOver" /></label>
      <label>{{ T.formTestCase }}<input v-model="form.testCaseVersion" /></label>
      <label>{{ T.formBudget }}<input v-model="form.costLimit" type="number" min="0" /></label>
      <label>{{ T.formUnit }}<input v-model="form.costUnit" /></label>
      <label>{{ T.formMaintainer }}<input v-model="form.maintainer" /></label>
      <label>{{ T.formLocation }}<input v-model="form.deploymentLocation" /></label>
      <label>{{ T.formSign }}<input v-model="form.signBy" /></label>
      <button type="button" class="wu__btn" @click="saveCard()">{{ T.saveCard }}</button>
    </div>

    <div class="wu__trans">
      <h4>{{ T.transition }}</h4>
      <label>{{ T.formTo }}
        <select v-model="transTo">
          <option value="admitted">admitted</option><option value="running">running</option>
          <option value="changing">changing</option><option value="retired">retired</option>
        </select>
      </label>
      <label>{{ T.formBy }}<input v-model="transBy" /></label>
      <label>{{ T.formReason }}<input v-model="transReason" /></label>
      <ul class="wu__units">
        <li v-for="r in rows" :key="r.id">
          <button type="button" class="wu__link" @click="doTransition(r)">{{ r.name }} → {{ transTo }}</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wu { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color, #333); border-radius: 8px; }
.wu__bar { display: flex; align-items: center; justify-content: space-between; }
.wu__title { margin: 0; font-size: 13.5px; }
.wu__sub { margin: 0; font-size: 11.5px; color: var(--text-muted, #888); }
.wu__err { color: #e06c75; margin: 0; font-size: 12px; }
.wu__ok { color: #67c23a; margin: 0; font-size: 12px; }
.wu__people { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11.5px; }
.wu__chip { border: 1px solid var(--border-color, #444); border-radius: 10px; padding: 1px 8px; }
.wu__chip--off { opacity: 0.55; }
.wu__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.wu__table th, .wu__table td { border-bottom: 1px solid var(--border-color, #333); padding: 4px 6px; text-align: left; vertical-align: top; }
.wu__stage { border-radius: 8px; padding: 0 8px; font-size: 11px; }
.wu__stage--running { background: #2e7d32; color: #fff; }
.wu__stage--admitted { background: #1565c0; color: #fff; }
.wu__stage--changing { background: #b26a00; color: #fff; }
.wu__stage--retired { background: #616161; color: #fff; }
.wu__stage--registered { background: #424242; color: #fff; }
.wu__gaps { margin: 0; padding-left: 14px; color: #e6a23c; font-size: 11.5px; }
.wu__ok-inline { color: #67c23a; }
.wu__form, .wu__trans { display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color, #333); padding-top: 8px; }
.wu__form label, .wu__trans label { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; }
.wu__btn { align-self: flex-start; }
.wu__link { background: none; border: none; color: var(--primary-color, #409eff); cursor: pointer; padding: 0; font-size: 11.5px; }
.wu__empty { color: var(--text-muted, #888); font-size: 12px; }
.wu__units { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 0; padding: 0; }
</style>
