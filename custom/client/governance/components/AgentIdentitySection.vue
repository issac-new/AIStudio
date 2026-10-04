<!-- overlay/custom/client/governance/components/AgentIdentitySection.vue -->
<!-- P10 agent 身份与委托链台账（2026-10-04 九源轮）：唯一身份/责任人/工具白名单/
     可撤销凭证/委托链（环检测）/事件流。台账层——不接线鉴权（网关/JWT 面不动）。
     数据面 /api/governance/agent-identity*。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  title: 'Agent 身份与委托链', sub: '每个智能体：唯一身份 · 责任人 · 工具白名单 · 可撤销凭证 · 委托链可追溯（台账层，鉴权接线后续轮）',
  colName: '身份', colKind: '类型', colOwner: '责任人', colCreds: '凭证', colDeleg: '委托',
  credActive: (n: number) => `${n} 有效`, credNone: '未登记', delegOut: (n: number) => `${n} 出边`,
  refresh: '刷新', register: '登记身份', regName: '身份名', regOwner: '责任人（谁为它负责）', regKind: '类型',
  delegate: '委托', dlgTo: '目标（身份名或 id）', dlgScope: '范围（如：代表我跑测试）', do: '执行',
  revokeCred: '撤销凭证', revokeDlg: '撤销委托', chain: '委托链', chainEmpty: '无有效委托出边',
  credLabel: '凭证名', addCred: '登记凭证', events: '台账事件（近 50）', empty: '暂无身份登记',
  boundary: '边界：本面板是台账不是鉴权——凭证状态为记录，enforcement 走既有网关/JWT 面',
  fail: '操作失败', kindAgent: 'agent', kindHuman: 'human', kindBot: 'bot', kindService: 'service',
} : {
  title: 'Agent Identity & Delegation', sub: 'Per agent: unique identity · owner · tool allowlist · revocable credentials · traceable delegation chain (ledger layer; enforcement wiring is a later round)',
  colName: 'Identity', colKind: 'Kind', colOwner: 'Owner', colCreds: 'Credentials', colDeleg: 'Delegations',
  credActive: (n: number) => `${n} active`, credNone: 'none', delegOut: (n: number) => `${n} out`,
  refresh: 'Refresh', register: 'Register', regName: 'Name', regOwner: 'Owner (who answers for it)', regKind: 'Kind',
  delegate: 'Delegate', dlgTo: 'Target (name or id)', dlgScope: 'Scope (e.g. run tests on my behalf)', do: 'Apply',
  revokeCred: 'Revoke credential', revokeDlg: 'Revoke delegation', chain: 'Delegation chain', chainEmpty: 'No active delegation edges',
  credLabel: 'Credential label', addCred: 'Add credential', events: 'Ledger events (last 50)', empty: 'No identities registered',
  boundary: 'Boundary: this panel is a ledger, not enforcement — credential status is a record; gates stay with the existing gateway/JWT layer',
  fail: 'Operation failed', kindAgent: 'agent', kindHuman: 'human', kindBot: 'bot', kindService: 'service',
})

interface Cred { kind: string; label: string; status: string }
interface Deleg { id: string; to: string; scope: string; revokedAt?: number }
interface Identity { id: string; name: string; kind: string; owner: string; toolAllowlist: string[]; credentials: Cred[]; delegations: Deleg[] }
interface Event { ts: number; actor: string; action: string; targetId: string; detail: string }

const identities = ref<Identity[]>([])
const events = ref<Event[]>([])
const error = ref('')
const busy = ref(false)
const chainOf = ref<{ id: string; paths: string[][] } | null>(null)

// 登记表单
const regName = ref(''); const regOwner = ref(''); const regKind = ref('agent')
// 委托表单
const dlgFrom = ref(''); const dlgTo = ref(''); const dlgScope = ref('')
// 凭证表单
const credId = ref(''); const credLabel = ref('')

async function refresh(): Promise<void> {
  busy.value = true; error.value = ''
  try {
    const res = await fetch('/api/governance/agent-identity', { headers: auth() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    identities.value = body.identities ?? []
    events.value = body.events ?? []
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

function auth(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
    if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
    await refresh()
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
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

function fmtTime(ts: number): string { return ts ? new Date(ts).toLocaleString() : '' }

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

    <div v-if="!identities.length" class="ai__empty" data-testid="gov-agent-identity-empty">{{ T.empty }}</div>

    <div v-if="identities.length" class="ai__tablewrap">
      <table class="ai__table" data-testid="gov-agent-identity-table">
        <thead>
          <tr>
            <th>{{ T.colName }}</th><th>{{ T.colKind }}</th><th>{{ T.colOwner }}</th>
            <th>{{ T.colCreds }}</th><th>{{ T.colDeleg }}</th><th></th>
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
            <td><button type="button" class="ai__mini" @click="showChain(it.id)">{{ T.chain }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="chainOf" class="ai__chain" data-testid="gov-agent-identity-chain">
      <strong>{{ T.chain }}（{{ nameById(chainOf.id) }}）：</strong>
      <div v-if="!chainOf.paths.length" class="ai__dim">{{ T.chainEmpty }}</div>
      <div v-for="(p, i) in chainOf.paths" :key="i" class="ai__path">{{ p.map(nameById).join(' → ') }}</div>
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
        <button type="button" data-testid="gov-ai-reg-do" @click="post('/api/governance/agent-identity/register', { name: regName, owner: regOwner, kind: regKind })">{{ T.register }}</button>
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

    <div class="ai__boundary">{{ T.boundary }}</div>
  </div>
</template>

<style scoped lang="scss">
.ai { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.ai__bar { display: flex; align-items: center; gap: 8px; }
.ai__title { margin: 0; font-size: 14px; }
.ai__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.ai__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.ai__error { color: var(--danger, #dc2626); font-size: 12px; }
.ai__empty { font-size: 12px; opacity: 0.6; }
.ai__tablewrap { overflow: auto; }
.ai__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ai__table th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--border-color, #e5e7eb); padding: 4px 6px; white-space: nowrap; }
.ai__table td { border-bottom: 1px solid rgb(0 0 0 / 5%); padding: 4px 6px; vertical-align: top; }
.ai__mini { font-size: 10.5px; padding: 0 5px; margin: 0 2px; border-radius: 8px; border: 1px solid var(--border-color, #e5e7eb); background: transparent; cursor: pointer; }
.ai__dim { opacity: 0.6; }
.ai__chain { font-size: 12px; border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
.ai__path { font-size: 11.5px; }
.ai__forms, .ai__events { font-size: 12px; }
.ai__form { display: flex; gap: 6px; margin: 4px 0; flex-wrap: wrap; }
.ai__form input { width: 160px; font-size: 12px; padding: 2px 6px; }
.ai__ev { font-size: 11px; }
.ai__boundary { font-size: 11px; color: var(--warning-ink, #92400e); background: rgb(254 243 199 / 50%); border-radius: 6px; padding: 4px 8px; }
</style>
