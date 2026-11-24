<!-- overlay/custom/client/governance/components/AgentIdentitySection.vue -->
<!-- P10 agent 身份与委托链台账（2026-10-04 九源轮）：唯一身份/责任人/工具白名单/
     可撤销凭证/委托链（环检测）/事件流。2026-11-24 数字员工批一：户口五要素
     （能力边界/审计要求）登记与补全、运行时绑定编辑、户口缺口列（判据只在服务端
     rosterGaps 定义一份，本层按 id 对行显示）。工具白名单与委托白名单已在工具
     调用前执法；凭证状态与派单门为记录与派单约束。
     数据面 /api/governance/agent-identity*。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { humanDateTime } from '@/custom/ia2/format'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  title: 'Agent 身份与委托链', sub: '每个智能体：唯一身份 · 责任人 · 工具白名单 · 可撤销凭证 · 委托链可追溯；户口五要素缺口如实列出',
  colName: '身份', colKind: '类型', colOwner: '责任人', colCreds: '凭证', colDeleg: '委托', colGap: '户口缺口',
  credActive: (n: number) => `${n} 有效`, credNone: '未登记', delegOut: (n: number) => `${n} 出边`,
  gapNone: '齐备',
  refresh: '刷新', register: '登记身份', regName: '身份名', regOwner: '责任人（谁为它负责）', regKind: '类型',
  regAllowlist: '工具白名单（每行一个）', regCan: '能做什么（每行一条）', regCannot: '不做什么（每行一条）',
  regSampling: '审计抽样比例（0–1）', regRetention: '留存天数',
  delegate: '委托', dlgTo: '目标（身份名或 id）', dlgScope: '范围（如：代表我跑测试）', do: '执行',
  revokeCred: '撤销凭证', revokeDlg: '撤销委托', chain: '委托链', chainEmpty: '无有效委托出边',
  credLabel: '凭证名', addCred: '登记凭证', events: '台账事件（近 50）', empty: '暂无身份登记',
  complete: '补全', edTitle: (name: string) => `补全户口五要素与运行时绑定：${name}`,
  bindAgents: '派单目标绑定（每行一个）', bindMatrix: 'Matrix 账号绑定（每行一个）',
  bindHint: '绑定为整体替换：两个数组（派单目标与 Matrix 账号）随提交一起发送，留空即解绑——只改一类时另一类也必须带上原值，否则会误删',
  save: '保存', cancel: '取消',
  boundary: '边界：工具白名单与委托白名单已在工具调用前执法；凭证状态与生命周期派单门（绑定后）为记录与派单约束，不吊销真实凭证。',
  fail: '操作失败', kindAgent: 'agent', kindHuman: 'human', kindBot: 'bot', kindService: 'service',
} : {
  title: 'Agent Identity & Delegation', sub: 'Per agent: unique identity · owner · tool allowlist · revocable credentials · traceable delegation chain; roster gaps listed as-is',
  colName: 'Identity', colKind: 'Kind', colOwner: 'Owner', colCreds: 'Credentials', colDeleg: 'Delegations', colGap: 'Roster gaps',
  credActive: (n: number) => `${n} active`, credNone: 'none', delegOut: (n: number) => `${n} out`,
  gapNone: 'complete',
  refresh: 'Refresh', register: 'Register', regName: 'Name', regOwner: 'Owner (who answers for it)', regKind: 'Kind',
  regAllowlist: 'Tool allowlist (one per line)', regCan: 'Can do (one per line)', regCannot: 'Cannot do (one per line)',
  regSampling: 'Audit sampling (0–1)', regRetention: 'Retention days',
  delegate: 'Delegate', dlgTo: 'Target (name or id)', dlgScope: 'Scope (e.g. run tests on my behalf)', do: 'Apply',
  revokeCred: 'Revoke credential', revokeDlg: 'Revoke delegation', chain: 'Delegation chain', chainEmpty: 'No active delegation edges',
  credLabel: 'Credential label', addCred: 'Add credential', events: 'Ledger events (last 50)', empty: 'No identities registered',
  complete: 'Complete', edTitle: (name: string) => `Complete roster & runtime bindings: ${name}`,
  bindAgents: 'Dispatch target bindings (one per line)', bindMatrix: 'Matrix account bindings (one per line)',
  bindHint: 'Bindings are replaced wholesale: both arrays (dispatch targets and Matrix accounts) are sent together; empty means unbind — when editing only one kind, include the other array\'s current values or they will be removed',
  save: 'Save', cancel: 'Cancel',
  boundary: 'Boundary: tool allowlist and delegation allowlist are enforced before tool calls; credential status and the lifecycle dispatch gate (once bound) are records and dispatch constraints — real credentials are not revoked.',
  fail: 'Operation failed', kindAgent: 'agent', kindHuman: 'human', kindBot: 'bot', kindService: 'service',
})

interface Cred { kind: string; label: string; status: string }
interface Deleg { id: string; to: string; scope: string; revokedAt?: number }
interface CapabilityBoundary { can: string[]; cannot: string[] }
interface AuditRequirement { sampling: number; retentionDays: number; note?: string }
interface RuntimeBindings { agents?: string[]; matrixAccounts?: string[] }
interface Identity {
  id: string; name: string; kind: string; owner: string; toolAllowlist: string[]
  capabilityBoundary?: CapabilityBoundary; auditRequirement?: AuditRequirement
  runtimeBindings?: RuntimeBindings
  credentials: Cred[]; delegations: Deleg[]
}
interface Event { ts: number; actor: string; action: string; targetId: string; detail: string }
// 户口缺口行（服务端 listRosterGaps 下发；判据不在界面复制）
interface GapRow { id: string; name: string; kind: string; status: 'complete' | 'blocked'; gaps: { field: string; detail: string }[] }

const identities = ref<Identity[]>([])
const events = ref<Event[]>([])
const gapRows = ref<GapRow[]>([])
const error = ref('')
const busy = ref(false)
const chainOf = ref<{ id: string; paths: string[][] } | null>(null)

// 登记表单
const regName = ref(''); const regOwner = ref(''); const regKind = ref('agent')
const regAllowlist = ref(''); const regCan = ref(''); const regCannot = ref('')
const regSampling = ref(''); const regRetention = ref('')
// 委托表单
const dlgFrom = ref(''); const dlgTo = ref(''); const dlgScope = ref('')
// 凭证表单
const credId = ref(''); const credLabel = ref('')
// 补全编辑（五要素 + 运行时绑定）
const editing = ref<{ id: string; name: string } | null>(null)
const edAllowlist = ref(''); const edCan = ref(''); const edCannot = ref('')
const edSampling = ref(''); const edRetention = ref('')
const edAgents = ref(''); const edMatrix = ref('')

async function refresh(): Promise<void> {
  busy.value = true; error.value = ''
  try {
    const res = await fetch('/api/governance/agent-identity', { headers: auth() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    identities.value = body.identities ?? []
    events.value = body.events ?? []
    gapRows.value = body.gaps ?? []
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

function auth(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
    if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return false }
    await refresh()
    return true
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); return false }
}

/** 多行文本 → 字符串数组（去空白行）。 */
function lines(s: string): string[] {
  return s.split('\n').map((x) => x.trim()).filter(Boolean)
}

/** 某身份的缺口行（仅 blocked 返回；complete 不渲染缺口说明）。 */
function gapOf(id: string): GapRow | null {
  const row = gapRows.value.find((r) => r.id === id)
  return row && row.status === 'blocked' && row.gaps.length ? row : null
}

async function register(): Promise<void> {
  const body: Record<string, unknown> = {
    name: regName.value, owner: regOwner.value, kind: regKind.value,
    toolAllowlist: lines(regAllowlist.value),
  }
  // 未填的组不随请求发出：未声明 ≠ 空声明（服务端对缺键与空值都报缺口，但语义不同）
  const can = lines(regCan.value); const cannot = lines(regCannot.value)
  if (can.length || cannot.length) body.capabilityBoundary = { can, cannot }
  // type=number 的 v-model 会被 Vue 转成数值，统一 String 后再判空
  const samplingRaw = String(regSampling.value).trim(); const retentionRaw = String(regRetention.value).trim()
  if (samplingRaw || retentionRaw) {
    body.auditRequirement = { sampling: Number(samplingRaw) || 0, retentionDays: Number(retentionRaw) || 0 }
  }
  await post('/api/governance/agent-identity/register', body)
}

function openEdit(it: Identity): void {
  editing.value = { id: it.id, name: it.name }
  // 预填当前值：整体替换语义下，提交什么就是什么，未改字段靠预填保留
  edAllowlist.value = (it.toolAllowlist ?? []).join('\n')
  edCan.value = (it.capabilityBoundary?.can ?? []).join('\n')
  edCannot.value = (it.capabilityBoundary?.cannot ?? []).join('\n')
  edSampling.value = it.auditRequirement ? String(it.auditRequirement.sampling) : ''
  edRetention.value = it.auditRequirement ? String(it.auditRequirement.retentionDays) : ''
  edAgents.value = (it.runtimeBindings?.agents ?? []).join('\n')
  edMatrix.value = (it.runtimeBindings?.matrixAccounts ?? []).join('\n')
}

async function submitEdit(): Promise<void> {
  if (!editing.value) return
  // runtimeBindings 服务端整体替换（不猜合并意图）：两个数组必须一起发，只发一类会误删另一类
  const body: Record<string, unknown> = {
    toolAllowlist: lines(edAllowlist.value),
    capabilityBoundary: { can: lines(edCan.value), cannot: lines(edCannot.value) },
    auditRequirement: { sampling: Number(edSampling.value) || 0, retentionDays: Number(edRetention.value) || 0 },
    runtimeBindings: { agents: lines(edAgents.value), matrixAccounts: lines(edMatrix.value) },
  }
  if (await post(`/api/governance/agent-identity/${editing.value.id}/update`, body)) editing.value = null
}

const nameById = computed(() => {
  const m = new Map<string, string>()
  for (const i of identities.value) m.set(i.id, i.name)
  return (id: string) => m.get(id) ?? id
})

async function showChain(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(id)}/chain`, { headers: auth() })
    const body = await res.json()
    chainOf.value = { id, paths: body.paths ?? [] }
  } catch { chainOf.value = null }
}

function fmtTime(ts: number): string { return humanDateTime(ts) }

onMounted(() => void refresh())
</script>

<template>
  <div class="ai" data-testid="gov-agent-identity">
    <div class="ai__bar">
      <h3 class="ai__title">{{ T.title }}</h3>
      <button type="button" class="ai__refresh" data-testid="gov-agent-identity-refresh" :disabled="busy" @click="refresh()">{{ busy ? '…' : T.refresh }}</button>
    </div>
    <p class="ai__sub">{{ T.sub }}</p>
    <div v-if="error" class="ai__error" data-testid="gov-agent-identity-error">{{ T.fail }}：{{ error }}</div>

    <div v-if="!identities.length" class="ui-empty-state" data-testid="gov-agent-identity-empty">{{ T.empty }}</div>

    <div v-if="identities.length" class="ai__tablewrap">
      <table class="ai__table" data-testid="gov-agent-identity-table">
        <thead>
          <tr>
            <th>{{ T.colName }}</th><th>{{ T.colKind }}</th><th>{{ T.colOwner }}</th>
            <th>{{ T.colCreds }}</th><th>{{ T.colDeleg }}</th><th>{{ T.colGap }}</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in identities" :key="it.id" :data-testid="`gov-agent-identity-row-${it.name}`">
            <td><code>{{ it.id }}</code> {{ it.name }}</td>
            <td>{{ it.kind }}</td>
            <td>{{ it.owner }}</td>
            <td>
              <template v-if="it.credentials.filter(c => c.status === 'active').length">
                {{ T.credActive(it.credentials.filter(c => c.status === 'active').length) }}
                <button v-for="c in it.credentials.filter(c => c.status === 'active')" :key="c.label"
                  type="button" class="ai__mini" :title="`${T.revokeCred}：${c.label}`"
                  @click="post(`/api/governance/agent-identity/${it.id}/credential/revoke`, { label: c.label })">✕ {{ c.label }}</button>
              </template>
              <span v-else class="ai__dim">{{ T.credNone }}</span>
            </td>
            <td>
              {{ T.delegOut(it.delegations.filter(d => !d.revokedAt).length) }}
              <button v-for="d in it.delegations.filter(d => !d.revokedAt)" :key="d.id"
                type="button" class="ai__mini" :title="`${T.revokeDlg}：${d.id}`"
                @click="post(`/api/governance/agent-identity/${it.id}/delegation/${d.id}/revoke`, {})">✕ {{ d.id }}</button>
            </td>
            <td>
              <div v-if="gapOf(it.id)" class="ai__gaps" :data-testid="`gov-ai-gap-${it.name}`">
                <div v-for="g in gapOf(it.id)!.gaps" :key="g.field">{{ g.detail }}</div>
              </div>
              <span v-else class="ai__dim">{{ T.gapNone }}</span>
            </td>
            <td>
              <button type="button" class="ai__mini" :data-testid="`gov-ai-edit-${it.name}`" @click="openEdit(it)">{{ T.complete }}</button>
              <button type="button" class="ai__mini" @click="showChain(it.id)">{{ T.chain }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="chainOf" class="ai__chain" data-testid="gov-agent-identity-chain">
      <strong>{{ T.chain }}（{{ nameById(chainOf.id) }}）：</strong>
      <div v-if="!chainOf.paths.length" class="ai__dim">{{ T.chainEmpty }}</div>
      <div v-for="(p, i) in chainOf.paths" :key="i" class="ai__path">{{ p.map(nameById).join(' → ') }}</div>
    </div>

    <div v-if="editing" class="ai__edit" data-testid="gov-ai-edit-panel">
      <strong>{{ T.edTitle(editing.name) }}</strong>
      <div class="ai__form">
        <textarea v-model="edAllowlist" :placeholder="T.regAllowlist" data-testid="gov-ai-ed-allowlist" rows="2" />
        <textarea v-model="edCan" :placeholder="T.regCan" data-testid="gov-ai-ed-can" rows="2" />
        <textarea v-model="edCannot" :placeholder="T.regCannot" data-testid="gov-ai-ed-cannot" rows="2" />
        <input v-model="edSampling" type="number" min="0" max="1" step="0.05" :placeholder="T.regSampling" data-testid="gov-ai-ed-sampling" />
        <input v-model="edRetention" type="number" min="0" step="1" :placeholder="T.regRetention" data-testid="gov-ai-ed-retention" />
      </div>
      <div class="ai__form">
        <textarea v-model="edAgents" :placeholder="T.bindAgents" data-testid="gov-ai-ed-agents" rows="2" />
        <textarea v-model="edMatrix" :placeholder="T.bindMatrix" data-testid="gov-ai-ed-matrix" rows="2" />
      </div>
      <p class="ai__dim ai__bindhint">{{ T.bindHint }}</p>
      <div class="ai__form">
        <button type="button" data-testid="gov-ai-ed-do" @click="submitEdit()">{{ T.save }}</button>
        <button type="button" data-testid="gov-ai-ed-cancel" @click="editing = null">{{ T.cancel }}</button>
      </div>
    </div>

    <details class="ai__forms">
      <summary>{{ T.register }} / {{ T.delegate }} / {{ T.addCred }}</summary>
      <div class="ai__form">
        <input v-model="regName" :placeholder="T.regName" data-testid="gov-ai-reg-name" />
        <input v-model="regOwner" :placeholder="T.regOwner" data-testid="gov-ai-reg-owner" />
        <select v-model="regKind">
          <option value="agent">{{ T.kindAgent }}</option><option value="human">{{ T.kindHuman }}</option>
          <option value="bot">{{ T.kindBot }}</option><option value="service">{{ T.kindService }}</option>
        </select>
      </div>
      <div class="ai__form">
        <textarea v-model="regAllowlist" :placeholder="T.regAllowlist" data-testid="gov-ai-reg-allowlist" rows="2" />
        <textarea v-model="regCan" :placeholder="T.regCan" data-testid="gov-ai-reg-can" rows="2" />
        <textarea v-model="regCannot" :placeholder="T.regCannot" data-testid="gov-ai-reg-cannot" rows="2" />
        <input v-model="regSampling" type="number" min="0" max="1" step="0.05" :placeholder="T.regSampling" data-testid="gov-ai-reg-sampling" />
        <input v-model="regRetention" type="number" min="0" step="1" :placeholder="T.regRetention" data-testid="gov-ai-reg-retention" />
        <button type="button" data-testid="gov-ai-reg-do" @click="register()">{{ T.register }}</button>
      </div>
      <div class="ai__form">
        <input v-model="dlgFrom" placeholder="aid-001" />
        <input v-model="dlgTo" :placeholder="T.dlgTo" />
        <input v-model="dlgScope" :placeholder="T.dlgScope" />
        <button type="button" data-testid="gov-ai-dlg-do" @click="post(`/api/governance/agent-identity/${dlgFrom}/delegate`, { to: dlgTo, scope: dlgScope })">{{ T.delegate }}</button>
      </div>
      <div class="ai__form">
        <input v-model="credId" placeholder="aid-001" />
        <input v-model="credLabel" :placeholder="T.credLabel" />
        <button type="button" data-testid="gov-ai-cred-do" @click="post(`/api/governance/agent-identity/${credId}/credential`, { kind: 'api-key', label: credLabel })">{{ T.addCred }}</button>
      </div>
    </details>

    <details v-if="events.length" class="ai__events">
      <summary>{{ T.events }}</summary>
      <div v-for="(e, i) in events" :key="i" class="ai__ev">
        <span class="ai__dim">{{ fmtTime(e.ts) }}</span> <code>{{ e.action }}</code> {{ e.targetId }} · {{ e.detail }} <span class="ai__dim">by {{ e.actor }}</span>
      </div>
    </details>

    <div class="ai__boundary" data-testid="gov-ai-boundary">{{ T.boundary }}</div>
  </div>
</template>

<style scoped lang="scss">
.ai { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.ai__bar { display: flex; align-items: center; gap: 8px; }
.ai__title { margin: 0; font-size: 14px; }
.ai__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.ai__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.ai__error { color: var(--danger); font-size: 12px; }
.ai__tablewrap { overflow: auto; }
.ai__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ai__table th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--border-color); padding: 4px 6px; white-space: nowrap; }
.ai__table td { border-bottom: 1px solid rgb(0 0 0 / 5%); padding: 4px 6px; vertical-align: top; }
.ai__mini { font-size: 10.5px; padding: 0 5px; margin: 0 2px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; cursor: pointer; }
.ai__dim { opacity: 0.6; }
.ai__gaps { font-size: 11px; color: var(--danger); display: flex; flex-direction: column; gap: 2px; }
.ai__edit { font-size: 12px; border: 1px dashed var(--border-color); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
.ai__bindhint { margin: 0; font-size: 11px; }
.ai__chain { font-size: 12px; border: 1px dashed var(--border-color); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
.ai__path { font-size: 11.5px; }
.ai__forms, .ai__events { font-size: 12px; }
.ai__form { display: flex; gap: 6px; margin: 4px 0; flex-wrap: wrap; }
.ai__form input { width: 160px; font-size: 12px; padding: 2px 6px; }
.ai__form textarea { width: 180px; font-size: 12px; padding: 2px 6px; font-family: inherit; resize: vertical; }
.ai__ev { font-size: 11px; }
.ai__boundary { font-size: 11px; color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.5); border-radius: 6px; padding: 4px 8px; }
</style>
