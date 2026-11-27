<!-- overlay/custom/client/governance/components/WorkUnitLedgerSection.vue -->
<!-- 执行单元责任台账（2026-11-06 第一增量）：台账表 + 责任卡编辑 + 状态迁移。
     2026-11-24 数字员工批一：责任卡带三组准入证据；业务负责人签署是独立动作（绑定卡版本）；
     迁移人/退出确认人只取登录身份（请求体不送 by/confirmedBy）；变更后重启须两条证据；退役必填交接事项。
     数据面 /api/governance/agent-identity* 与 /api/governance/people；
     判定全在服务端，本层只做展示与提交，缺口如实显示不装绿。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  title: '执行单元责任台账', sub: '每个 AI 执行单元：责任卡 · 五阶段生命周期 · 顶岗型复核人分离 · 扩权须就绪或豁免（登记→准入→运行→变更→退出）',
  colName: '执行单元', colStage: '阶段', colType: '单元类型', colRisk: '风险档', colCollab: '协作等级', colOwner: '结果责任人', colReviewer: '复核人', colBinding: '绑定目标', colGaps: '缺口',
  gapsNone: '无', people: '自然人名单', activate: '启用', deactivate: '停用', registerMe: '以登录名登记并启用', refresh: '刷新',
  saveCard: '保存责任卡', transition: '迁移', judgments: '署名记录',
  stageRegistered: '登记', stageAdmitted: '准入', stageRunning: '运行', stageChanging: '变更', stageRetired: '退出',
  formOwner: '主责任人（person.id）', formReviewer: '复核人（顶岗型必填，且不得与主责任人同一人）', formRisk: '风险档',
  formType: '单元类型', formCollab: '协作等级', formCollabNote: '第四级标注',
  typeAssistant: '助手型', typePost: '顶岗型', typeUnset: '请选择（未声明不得准入）', collabUnset: '未声明',
  riskTier1: '一级（可独立执行）', riskTier2: '二级（复核后生效）', riskTier3: '三级（只提供线索和建议）',
  riskTier1Short: '一级', riskTier2Short: '二级', riskTier3Short: '三级',
  collab1: '1 · 人操作', collab2: '2 · AI 建议', collab3: '3 · AI 承接，人验收', collab4: '4 · AI 端到端，人管例外（仅单点验证）', collab5: '5 · AI 管理循环，人定边界',
  readinessTitle: '扩权就绪度（只记录，不评分）', readinessYes: '就绪', readinessNo: '未就绪', readinessUnknown: '未知',
  rNet: '净贡献核算', rCorrection: '纠错通道', rDiscretion: '裁量保障', rReliability: '可靠性检验', rCase: '用例维护',
  formWaiver: '扩权豁免理由（本次变更扩大了范围且五项未全就绪时必填；由当前登录人署名）',
  postSelfConfirmHint: '顶岗型执行单元：退出确认人不得与主责任人为同一人',
  formStandard: '交付标准', formEscalation: '升级条件（每行一条）', formPause: '暂停条件（每行一条）',
  formTaker: '接管人', formTestCase: '检验用例版本', formBudget: '成本预算（数值）', formUnit: '预算单位',
  formMaintainer: '技术维护人', formLocation: '部署位置',
  formEvTasks: '准入证据·代表性任务（每行一条）', formEvEdge: '准入证据·边界情况（每行一条）',
  formEvData: '准入证据·数据与权限评估（每行一条）',
  signer: '签署人', signNone: '未签署', signStale: '签署已失效（卡面已变更），须重新签署', signAction: '以当前登录身份签署',
  formReason: '迁移理由', formBy: '迁移人', formTo: '目标阶段', submitTrans: '提交迁移',
  formEvidence: '重启证据引用（重新验证、重新授权，每行一条）',
  formExitKind: '退出类型', exitPause: '暂停', exitRevoke: '撤权', exitDecommission: '下线',
  formExitItems: '交接事项（每行一条，必填）', formExitConfirm: '退出确认人',
  readinessEmpty: '暂无就绪度读数',
  exitItemsRequired: '退出须登记交接事项（每行一条）',
  me: '当前登录身份', meNone: '未登录（单机部署需设置 AISTUDIO_LOCAL_OPERATOR）',
  empty: '暂无执行单元', fail: '操作失败', okMsg: '已提交',
} : {
  title: 'Work-unit Responsibility Ledger', sub: 'Per AI unit: responsibility card · 5-stage lifecycle · reviewer separation for post type · expansion needs readiness or a waiver (register→admit→run→change→retire)',
  colName: 'Unit', colStage: 'Stage', colType: 'Unit type', colRisk: 'Risk tier', colCollab: 'Collab level', colOwner: 'Result owner', colReviewer: 'Reviewer', colBinding: 'Bindings', colGaps: 'Gaps',
  gapsNone: 'none', people: 'People', activate: 'Activate', deactivate: 'Deactivate', registerMe: 'Register & activate as me', refresh: 'Refresh',
  saveCard: 'Save card', transition: 'Transition', judgments: 'Judgments',
  stageRegistered: 'registered', stageAdmitted: 'admitted', stageRunning: 'running', stageChanging: 'changing', stageRetired: 'retired',
  formOwner: 'Primary owner (person.id)', formReviewer: 'Reviewer (required for post type; must differ from primary owner)', formRisk: 'Risk tier',
  formType: 'Unit type', formCollab: 'Collab level', formCollabNote: 'Level-4 note',
  typeAssistant: 'Assistant', typePost: 'Post', typeUnset: 'Select (undeclared cannot be admitted)', collabUnset: 'Not declared',
  riskTier1: 'Tier 1 (independent execution)', riskTier2: 'Tier 2 (effective after review)', riskTier3: 'Tier 3 (leads and suggestions only)',
  riskTier1Short: 'Tier 1', riskTier2Short: 'Tier 2', riskTier3Short: 'Tier 3',
  collab1: '1 · Human operates', collab2: '2 · AI suggests', collab3: '3 · AI delivers, human accepts', collab4: '4 · AI end-to-end, human handles exceptions (single-point verification only)', collab5: '5 · AI runs the loop, human sets boundaries',
  readinessTitle: 'Expansion readiness (recorded only, never scored)', readinessYes: 'Ready', readinessNo: 'Not ready', readinessUnknown: 'Unknown',
  rNet: 'Net contribution', rCorrection: 'Correction channel', rDiscretion: 'Manager discretion', rReliability: 'Reliability check', rCase: 'Test-case maintenance',
  formWaiver: 'Expansion waiver (required when this change widens scope and the five capabilities are not all ready; signed by the current user)',
  postSelfConfirmHint: 'Post-type unit: the exit confirmer must differ from the primary owner',
  formStandard: 'Delivery standard', formEscalation: 'Escalation conditions (one per line)', formPause: 'Pause conditions (one per line)',
  formTaker: 'Taker-over', formTestCase: 'Test case version', formBudget: 'Cost budget (number)', formUnit: 'Budget unit',
  formMaintainer: 'Maintainer', formLocation: 'Deployment location',
  formEvTasks: 'Admission evidence · representative tasks (one per line)', formEvEdge: 'Admission evidence · edge cases (one per line)',
  formEvData: 'Admission evidence · data & permission review (one per line)',
  signer: 'Signed by', signNone: 'Unsigned', signStale: 'Signature stale (card changed) — sign again', signAction: 'Sign as current user',
  formReason: 'Transition reason', formBy: 'By', formTo: 'Target stage', submitTrans: 'Submit transition',
  formEvidence: 'Restart evidence refs (re-validation, re-authorization; one per line)',
  formExitKind: 'Exit kind', exitPause: 'pause', exitRevoke: 'revoke', exitDecommission: 'decommission',
  formExitItems: 'Handover items (one per line, required)', formExitConfirm: 'Exit confirmed by',
  readinessEmpty: 'No readiness readings yet',
  exitItemsRequired: 'Exit requires handover items (one per line)',
  me: 'Signed in as', meNone: 'Not signed in (set AISTUDIO_LOCAL_OPERATOR for local single-machine deployment)',
  empty: 'No units registered', fail: 'Operation failed', okMsg: 'Submitted',
})

interface SignView { signedBy?: string; stale?: boolean }
interface ReadinessView { id: string; state: 'yes' | 'no' | 'unknown'; gap: string }
interface CardView {
  card: Record<string, unknown> | null
  stage: string
  gaps: { field: string; detail: string }[]
  unitType?: 'assistant' | 'post' | null
  riskTier?: 'tier1' | 'tier2' | 'tier3' | null
  collabLevel?: number | null
  readiness?: ReadinessView[]
}
interface Identity { id: string; name: string; kind: string; owner: string; runtimeBindings?: { agents?: string[]; matrixAccounts?: string[] } }
interface Person { id: string; name: string; active: boolean; emails: string[] }
type Row = Identity & { view?: CardView }

// 与服务端 lifecycle.LEGAL 同口径：目标阶段下拉只列当前阶段的合法去向
const LEGAL_TARGETS: Record<string, string[]> = {
  registered: ['admitted', 'retired'],
  admitted: ['running', 'retired'],
  running: ['changing', 'retired'],
  changing: ['running', 'retired'],
  retired: [],
}

const rows = ref<Row[]>([])
const people = ref<Person[]>([])
const error = ref('')
const msg = ref('')
const busy = ref(false)
const me = ref<string | null>(null)
const editing = ref<string>('')
const form = ref<Record<string, string>>({})
const transFor = ref<string>('')
const transTo = ref('')
const transReason = ref('')
const transEvidence = ref('')
const transWaiver = ref('')
// 豁免框按需出现：是否扩权由服务端判定，界面不预先诱导填写
const waiverNeeded = ref(false)
const exitKind = ref('pause')
const exitItems = ref('')

function auth(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

// 当前登录身份：受保护接口 /api/auth/me；未开启登录的单机部署返回 401，
// 此时署名与迁移置灰并提示设置 AISTUDIO_LOCAL_OPERATOR（与服务端 human-gate 口径一致）
async function loadMe(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { headers: auth() })
    if (!res.ok) { me.value = null; return }
    const body = (await res.json()) as { user?: { username?: unknown } }
    const name = body?.user?.username
    me.value = typeof name === 'string' && name.trim() ? name : null
  } catch { me.value = null }
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

// 类型／风险档／协作等级的显示标签：取视图归一后的读数，未声明显示「—」（不猜默认值）
function typeLabel(r: Row): string {
  const t = r.view?.unitType
  return t === 'post' ? T.value.typePost : t === 'assistant' ? T.value.typeAssistant : '—'
}
function riskLabel(r: Row): string {
  const t = r.view?.riskTier
  return t === 'tier1' ? T.value.riskTier1Short : t === 'tier2' ? T.value.riskTier2Short : t === 'tier3' ? T.value.riskTier3Short : '—'
}
function collabLevelOption(lv: number): string {
  const map: Record<number, string> = { 1: T.value.collab1, 2: T.value.collab2, 3: T.value.collab3, 4: T.value.collab4, 5: T.value.collab5 }
  return map[lv] ?? String(lv)
}
function collabLabel(r: Row): string {
  const lv = r.view?.collabLevel
  if (lv == null) return '—'
  const map: Record<number, string> = { 1: T.value.collab1, 2: T.value.collab2, 3: T.value.collab3, 4: T.value.collab4, 5: T.value.collab5 }
  return map[lv] ?? '—'
}
const readinessName: Record<string, string> = {
  'net-contribution': 'rNet', 'correction-channel': 'rCorrection', discretion: 'rDiscretion', reliability: 'rReliability', 'case-maintenance': 'rCase',
}
function readinessLabel(id: string): string {
  return T.value[readinessName[id] as keyof typeof T.value] ?? id
}
function readinessStateLabel(state: 'yes' | 'no' | 'unknown'): string {
  return state === 'yes' ? T.value.readinessYes : state === 'no' ? T.value.readinessNo : T.value.readinessUnknown
}

// 绑定目标列：runtimeBindings 两个数组拼接展示
function bindingsOf(r: Row): string {
  const b = r.runtimeBindings
  if (!b) return '—'
  const all = [...(b.agents ?? []), ...(b.matrixAccounts ?? [])]
  return all.length ? all.join('、') : '—'
}

const lines = (v: string): string[] => v.split('\n').map((s) => s.trim()).filter(Boolean)

function startEdit(row: Row): void {
  editing.value = row.id
  const c = (row.view?.card ?? {}) as Record<string, unknown>
  const ev = (c.admissionEvidence ?? {}) as { representativeTasks?: string[]; edgeCases?: string[]; dataPermissionReview?: string[] }
  form.value = {
    primaryOwner: String(c.primaryOwner ?? people.value.find((p) => p.active)?.id ?? ''),
    reviewer: String(c.reviewer ?? ''),
    unitType: c.unitType === 'assistant' || c.unitType === 'post' ? c.unitType : '',
    riskTier: String(row.view?.riskTier ?? 'tier2'),
    collabLevel: row.view?.collabLevel != null ? String(row.view.collabLevel) : '',
    collabLevelNote: String(c.collabLevelNote ?? ''),
    deliveryStandard: String(c.deliveryStandard ?? ''),
    escalation: Array.isArray(c.escalation) ? (c.escalation as string[]).join('\n') : '',
    pauseConditions: Array.isArray(c.pauseConditions) ? (c.pauseConditions as string[]).join('\n') : '',
    takerOver: String(c.takerOver ?? ''),
    testCaseVersion: String(c.testCaseVersion ?? ''),
    costLimit: String((c.costBudget as { limit?: number } | undefined)?.limit ?? ''),
    costUnit: String((c.costBudget as { unit?: string } | undefined)?.unit ?? 'CNY/轮'),
    maintainer: String(c.maintainer ?? ''),
    deploymentLocation: String(c.deploymentLocation ?? ''),
    evTasks: (ev.representativeTasks ?? []).join('\n'),
    evEdge: (ev.edgeCases ?? []).join('\n'),
    evData: (ev.dataPermissionReview ?? []).join('\n'),
  }
}

const editingRow = computed(() => rows.value.find((r) => r.id === editing.value))
const signInfo = computed<SignView | null>(() => (editingRow.value?.view?.card?.businessOwnerSign as SignView | undefined) ?? null)

async function saveCard(): Promise<void> {
  error.value = ''; msg.value = ''
  // 签署不随卡保存（服务端只认 /card/sign 独立端点）；准入证据三组整体随卡上送，
  // 由 startEdit 预填既有值保证不丢已登记证据
  const body = {
    deliveryStandard: form.value.deliveryStandard ?? '',
    // 单元类型必选：未选不送（服务端判缺口并 400），不替人选一个默认类型
    ...(form.value.unitType ? { unitType: form.value.unitType } : {}),
    riskTier: form.value.riskTier || 'tier2',
    ...(form.value.collabLevel ? { collabLevel: Number(form.value.collabLevel) } : {}),
    ...(form.value.collabLevelNote.trim() ? { collabLevelNote: form.value.collabLevelNote } : {}),
    primaryOwner: form.value.primaryOwner ?? '',
    ...(form.value.reviewer ? { reviewer: form.value.reviewer } : {}),
    escalation: lines(form.value.escalation ?? ''),
    pauseConditions: lines(form.value.pauseConditions ?? ''),
    takerOver: form.value.takerOver ?? '',
    testCaseVersion: form.value.testCaseVersion ?? '',
    costBudget: { limit: Number(form.value.costLimit || 0), unit: form.value.costUnit || '' },
    maintainer: form.value.maintainer ?? '',
    deploymentLocation: form.value.deploymentLocation ?? '',
    admissionEvidence: {
      representativeTasks: lines(form.value.evTasks ?? ''),
      edgeCases: lines(form.value.evEdge ?? ''),
      dataPermissionReview: lines(form.value.evData ?? ''),
      recordedAt: Date.now(),
    },
  }
  const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(editing.value)}/card`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  msg.value = T.value.okMsg
  await refresh()
}

// 业务负责人签署：独立动作，签署人由服务端取登录身份，请求体不送 signedBy
async function signCard(): Promise<void> {
  if (!editing.value || !me.value) return
  error.value = ''; msg.value = ''
  const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(editing.value)}/card/sign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: '{}',
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  msg.value = T.value.okMsg
  await refresh()
}

const transRow = computed(() => rows.value.find((r) => r.id === transFor.value))
const legalTargets = computed(() => LEGAL_TARGETS[transRow.value?.view?.stage ?? 'registered'] ?? [])
const needRestartEvidence = computed(() => (transRow.value?.view?.stage ?? '') === 'changing' && transTo.value === 'running')
// 顶岗型单元退役时确认人不得是主责任人（服务端按单元类型判定，此处同规则前置提示）
const postSelfConfirm = computed(() => {
  const v = transRow.value?.view
  // 单元类型读视图顶层的归一读数（与台账列同数据源）；主责任人在卡上
  return transTo.value === 'retired' && v?.unitType === 'post' && !!me.value && v?.card?.primaryOwner === me.value
})

function openTransition(row: Row): void {
  transFor.value = row.id
  transTo.value = LEGAL_TARGETS[row.view?.stage ?? 'registered']?.[0] ?? ''
  transReason.value = ''
  transEvidence.value = ''
  transWaiver.value = ''
  waiverNeeded.value = false
  exitKind.value = 'pause'
  exitItems.value = ''
}

// 迁移请求体只发 to / reason / evidenceRefs? / exit?：by 与 exit.confirmedBy 由服务端取登录身份
async function doTransition(): Promise<void> {
  const row = transRow.value
  if (!row) return
  error.value = ''; msg.value = ''
  const body: Record<string, unknown> = { to: transTo.value, reason: transReason.value }
  if (needRestartEvidence.value) body.evidenceRefs = lines(transEvidence.value)
  // 扩权豁免理由：只在填了非空白时上送（不送空串）；由服务端取登录身份署名
  const waiver = transWaiver.value.trim()
  if (waiver) body.expansionWaiver = waiver
  if (transTo.value === 'retired') {
    const items = lines(exitItems.value)
    if (!items.length) { error.value = T.value.exitItemsRequired; return }
    body.exit = { kind: exitKind.value, items }
  }
  const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(row.id)}/transition`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) {
    error.value = json.problems?.join('；') ?? `HTTP ${res.status}`
    // 服务端判定本次属扩权且未豁免：此时才显示豁免框
    if (/属扩权/.test(error.value)) waiverNeeded.value = true
    return
  }
  msg.value = T.value.okMsg
  transFor.value = ''
  await refresh()
}

async function activate(p: Person): Promise<void> {
  await fetch(`/api/governance/people/${encodeURIComponent(p.id)}/activate`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: '{}' })
  await refresh()
}

async function deactivate(p: Person): Promise<void> {
  error.value = ''; msg.value = ''
  const res = await fetch(`/api/governance/people/${encodeURIComponent(p.id)}/deactivate`, {
    method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '' }),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  await refresh()
}

// 以登录名登记自然人并随即启用：签署/迁移要求操作者是在岗自然人，单机部署首次使用的一步入口
async function registerMe(): Promise<void> {
  if (!me.value) return
  error.value = ''; msg.value = ''
  const res = await fetch('/api/governance/people', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify({ name: me.value, emails: [] }),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[]; person?: { id?: string } }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  const id = json.person?.id
  if (id) {
    await fetch(`/api/governance/people/${encodeURIComponent(id)}/activate`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: '{}' })
  }
  await refresh()
}

onMounted(() => { void loadMe(); void refresh() })
</script>

<template>
  <div class="wu" data-testid="gov-workunit-ledger">
    <div class="wu__bar">
      <h3 class="wu__title">{{ T.title }}</h3>
      <span class="wu__me" data-testid="gov-workunit-me">{{ me ? `${T.me}：${me}` : T.meNone }}</span>
      <button type="button" class="wu__btn" :disabled="busy" @click="refresh()">{{ T.refresh }}</button>
    </div>
    <p class="wu__sub">{{ T.sub }}</p>
    <p v-if="error" class="wu__err" data-testid="gov-workunit-err">{{ T.fail }}：{{ error }}</p>
    <p v-if="msg" class="wu__ok">{{ msg }}</p>

    <div v-if="people.length" class="wu__people">
      <span class="wu__people-t">{{ T.people }}：</span>
      <span v-for="p in people" :key="p.id" class="wu__chip" :class="{ 'wu__chip--off': !p.active }">
        {{ p.name }}
        <template v-if="!p.active"> · <button type="button" class="wu__link" @click="activate(p)">{{ T.activate }}</button></template>
        <template v-else> · <button type="button" class="wu__link" :data-testid="`gov-workunit-deactivate-${p.id}`" @click="deactivate(p)">{{ T.deactivate }}</button></template>
      </span>
      <button v-if="me" type="button" class="wu__link" data-testid="gov-workunit-register-me" @click="registerMe()">{{ T.registerMe }}</button>
    </div>

    <table v-if="rows.length" class="wu__table">
      <thead>
        <tr>
          <th>{{ T.colName }}</th><th>{{ T.colStage }}</th><th>{{ T.colType }}</th><th>{{ T.colRisk }}</th><th>{{ T.colCollab }}</th><th>{{ T.colOwner }}</th><th>{{ T.colReviewer }}</th><th>{{ T.colBinding }}</th><th>{{ T.colGaps }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :data-testid="`gov-workunit-row-${r.name}`">
          <td>{{ r.name }}</td>
          <td><span class="wu__stage" :class="`wu__stage--${r.view?.stage ?? 'registered'}`">{{ stageLabel(r.view?.stage ?? 'registered') }}</span></td>
          <td :data-testid="`gov-workunit-type-${r.name}`">{{ typeLabel(r) }}</td>
          <td :data-testid="`gov-workunit-risk-${r.name}`">{{ riskLabel(r) }}</td>
          <td :data-testid="`gov-workunit-collab-${r.name}`">{{ collabLabel(r) }}</td>
          <td>{{ ownerName(r.view?.card?.primaryOwner as string | undefined) }}</td>
          <td>{{ ownerName(r.view?.card?.reviewer as string | undefined) }}</td>
          <td :data-testid="`gov-workunit-bindings-${r.name}`">{{ bindingsOf(r) }}</td>
          <td>
            <span v-if="!r.view?.gaps?.length" class="wu__ok-inline">{{ T.gapsNone }}</span>
            <ul v-else class="wu__gaps" :data-testid="`gov-workunit-gaps-${r.name}`">
              <li v-for="(g, i) in r.view.gaps.slice(0, 3)" :key="i">{{ g.detail }}</li>
              <li v-if="r.view.gaps.length > 3">+{{ r.view.gaps.length - 3 }}</li>
            </ul>
          </td>
          <td>
            <button type="button" class="wu__link" :data-testid="`gov-workunit-edit-${r.name}`" @click="startEdit(r)">{{ T.saveCard }}</button>
            <button type="button" class="wu__link" :data-testid="`gov-workunit-trans-open-${r.name}`" @click="openTransition(r)">{{ T.transition }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="wu__empty">{{ T.empty }}</p>

    <div v-if="editing && editingRow" class="wu__readiness" :data-testid="`gov-workunit-readiness-${editingRow.name}`">
      <h4>{{ T.readinessTitle }}</h4>
      <ul v-if="editingRow.view?.readiness?.length" class="wu__ready">
        <li v-for="item in editingRow.view.readiness" :key="item.id" :class="`wu__ready--${item.state}`" :data-testid="`gov-workunit-ready-${item.id}`">
          <span class="wu__ready-name">{{ readinessLabel(item.id) }}</span>
          <span class="wu__ready-state">{{ readinessStateLabel(item.state) }}</span>
          <span v-if="item.state !== 'yes' && item.gap" class="wu__ready-gap">{{ item.gap }}</span>
        </li>
      </ul>
      <p v-else class="wu__sub">{{ T.readinessEmpty }}</p>
    </div>

    <div v-if="editing" class="wu__form" data-testid="gov-workunit-card-form">
      <h4>{{ T.saveCard }}</h4>
      <label>{{ T.formType }}
        <select v-model="form.unitType" data-testid="gov-workunit-form-type">
          <option value="" disabled>{{ T.typeUnset }}</option>
          <option value="assistant">{{ T.typeAssistant }}</option>
          <option value="post">{{ T.typePost }}</option>
        </select>
      </label>
      <label>{{ T.formStandard }}<textarea v-model="form.deliveryStandard" rows="2" /></label>
      <label>{{ T.formRisk }}
        <select v-model="form.riskTier" data-testid="gov-workunit-form-risk">
          <option value="tier1">{{ T.riskTier1 }}</option>
          <option value="tier2">{{ T.riskTier2 }}</option>
          <option value="tier3">{{ T.riskTier3 }}</option>
        </select>
      </label>
      <label>{{ T.formCollab }}
        <select v-model="form.collabLevel" data-testid="gov-workunit-form-collab">
          <option value="">{{ T.collabUnset }}</option>
          <option v-for="lv in 5" :key="lv" :value="String(lv)">{{ collabLevelOption(lv) }}</option>
        </select>
      </label>
      <label v-if="form.collabLevel === '4'">{{ T.formCollabNote }}<input v-model="form.collabLevelNote" data-testid="gov-workunit-form-collab-note" /></label>
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
      <label>{{ T.formEvTasks }}<textarea v-model="form.evTasks" rows="2" data-testid="gov-workunit-ev-tasks" /></label>
      <label>{{ T.formEvEdge }}<textarea v-model="form.evEdge" rows="2" data-testid="gov-workunit-ev-edge" /></label>
      <label>{{ T.formEvData }}<textarea v-model="form.evData" rows="2" data-testid="gov-workunit-ev-data" /></label>
      <div class="wu__sign-area" data-testid="gov-workunit-sign-area">
        <span v-if="signInfo?.signedBy">
          {{ T.signer }}：{{ signInfo.signedBy }}
          <span v-if="signInfo.stale" class="wu__err-inline">（{{ T.signStale }}）</span>
        </span>
        <span v-else>{{ T.signNone }}</span>
        <button type="button" class="wu__link" :disabled="!me" data-testid="gov-workunit-sign" @click="signCard()">{{ T.signAction }}</button>
      </div>
      <button type="button" class="wu__btn" data-testid="gov-workunit-save-card" @click="saveCard()">{{ T.saveCard }}</button>
    </div>

    <div v-if="transRow" class="wu__trans" data-testid="gov-workunit-trans-form">
      <h4>{{ T.transition }}：{{ transRow.name }}（{{ stageLabel(transRow.view?.stage ?? 'registered') }}）</h4>
      <label>{{ T.formTo }}
        <select v-model="transTo" data-testid="gov-workunit-trans-to">
          <option v-for="s in legalTargets" :key="s" :value="s">{{ stageLabel(s) }}</option>
        </select>
      </label>
      <label>{{ T.formBy }}<span class="wu__readonly" data-testid="gov-workunit-trans-by">{{ me ?? T.meNone }}</span></label>
      <label>{{ T.formReason }}<input v-model="transReason" data-testid="gov-workunit-trans-reason" /></label>
      <label v-if="needRestartEvidence">{{ T.formEvidence }}<textarea v-model="transEvidence" rows="2" data-testid="gov-workunit-trans-evidence" /></label>
      <label v-if="needRestartEvidence && waiverNeeded">{{ T.formWaiver }}<textarea v-model="transWaiver" rows="2" data-testid="gov-workunit-trans-waiver" /></label>
      <template v-if="transTo === 'retired'">
        <label>{{ T.formExitKind }}
          <select v-model="exitKind" data-testid="gov-workunit-exit-kind">
            <option value="pause">{{ T.exitPause }}</option>
            <option value="revoke">{{ T.exitRevoke }}</option>
            <option value="decommission">{{ T.exitDecommission }}</option>
          </select>
        </label>
        <label>{{ T.formExitItems }}<textarea v-model="exitItems" rows="2" data-testid="gov-workunit-exit-items" /></label>
        <label>{{ T.formExitConfirm }}<span class="wu__readonly">{{ me ?? T.meNone }}</span></label>
        <p v-if="postSelfConfirm" class="wu__err">{{ T.postSelfConfirmHint }}</p>
      </template>
      <button type="button" class="wu__btn" :disabled="!me" data-testid="gov-workunit-trans-submit" @click="doTransition()">{{ T.submitTrans }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wu { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color, var(--border-color)); border-radius: 8px; }
.wu__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wu__title { margin: 0; font-size: 13.5px; }
.wu__me { margin-left: auto; font-size: 11.5px; color: var(--text-muted, var(--text-muted)); }
.wu__sub { margin: 0; font-size: 11.5px; color: var(--text-muted, var(--text-muted)); }
.wu__err { color: var(--error); margin: 0; font-size: 12px; }
.wu__err-inline { color: var(--error); }
.wu__ok { color: var(--success); margin: 0; font-size: 12px; }
.wu__people { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11.5px; }
.wu__chip { border: 1px solid var(--border-color, var(--border-color)); border-radius: 10px; padding: 1px 8px; }
.wu__chip--off { opacity: 0.55; }
.wu__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.wu__table th, .wu__table td { border-bottom: 1px solid var(--border-color, var(--border-color)); padding: 4px 6px; text-align: left; vertical-align: top; }
.wu__stage { border-radius: 8px; padding: 0 8px; font-size: 11px; }
.wu__stage--running { background: var(--success); color: var(--bg-primary); }
.wu__stage--admitted { background: var(--accent-info); color: var(--bg-primary); }
.wu__stage--changing { background: var(--warning); color: var(--bg-primary); }
.wu__stage--retired { background: var(--text-muted); color: var(--bg-primary); }
.wu__stage--registered { background: var(--text-secondary); color: var(--bg-primary); }
.wu__gaps { margin: 0; padding-left: 14px; color: var(--warning); font-size: 11.5px; }
.wu__ok-inline { color: var(--success); }
.wu__readiness { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
.wu__readiness h4 { margin: 0; font-size: 12px; }
.wu__ready { margin: 0; padding-left: 14px; display: flex; flex-direction: column; gap: 2px; }
.wu__ready li { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.wu__ready-name { min-width: 88px; }
.wu__ready-state { border-radius: 8px; padding: 0 8px; font-size: 11px; }
.wu__ready--yes .wu__ready-state { background: var(--success); color: var(--bg-primary); }
.wu__ready--no .wu__ready-state { background: var(--error); color: var(--bg-primary); }
.wu__ready--unknown .wu__ready-state { background: var(--text-muted); color: var(--bg-primary); }
.wu__ready-gap { color: var(--text-muted, var(--text-muted)); }
.wu__form, .wu__trans { display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color, var(--border-color)); padding-top: 8px; }
.wu__form label, .wu__trans label { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; }
.wu__sign-area { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.wu__readonly { font-size: 11.5px; }
.wu__btn { align-self: flex-start; }
.wu__link { background: none; border: none; color: var(--primary-color, var(--accent-primary)); cursor: pointer; padding: 0; font-size: 11.5px; }
.wu__link:disabled { opacity: 0.5; cursor: not-allowed; }
.wu__empty { color: var(--text-muted, var(--text-muted)); font-size: 12px; }
</style>
