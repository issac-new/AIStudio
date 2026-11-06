<!-- overlay/custom/client/governance/components/JudgmentRecordsSection.vue -->
<!-- 人署名记录（2026-11-06 第一增量）：验收/打回/推翻/升级/暂停/组织能力六类。
     只收人填写（human-entry），理由≥20 字；缺口态如实显示。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { humanDateTime } from '@/custom/ia2/format'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  title: '人署名记录', sub: '验收结论 · 打回理由 · 推翻依据 · 升级 · 暂停 · 组织能力贡献——只收人填写，不从遥测派生',
  colKind: '类别', colSubject: '对象', colBy: '署名', colAt: '时间', colRationale: '理由',
  refresh: '刷新', submit: '提交署名',
  formUnit: '执行单元 id', formKind: '类别', formSubject: '对象引用', formRationale: '理由（≥20 字，写依据不写结论）',
  formBy: '署名人（person.id）', formEvid: '证据引用（逗号分隔）',
  kinds: { acceptance: '验收', rejection: '打回', override: '推翻', escalation: '升级', pause: '暂停', capability: '组织能力' },
  empty: '暂无署名记录', fail: '操作失败',
} : {
  title: 'Human Judgment Records', sub: 'Acceptance / rejection / override / escalation / pause / capability — human-entry only, never derived from telemetry',
  colKind: 'Kind', colSubject: 'Subject', colBy: 'Signed by', colAt: 'At', colRationale: 'Rationale',
  refresh: 'Refresh', submit: 'Submit',
  formUnit: 'Unit id', formKind: 'Kind', formSubject: 'Subject ref', formRationale: 'Rationale (≥20 chars)',
  formBy: 'Signed by (person.id)', formEvid: 'Evidence refs (comma separated)',
  kinds: { acceptance: 'acceptance', rejection: 'rejection', override: 'override', escalation: 'escalation', pause: 'pause', capability: 'capability' },
  empty: 'No records', fail: 'Operation failed',
})

interface Record { id: string; unitId: string; kind: string; subjectRef: string; rationale: string; signedBy: string; signedAt: number; source: string }
interface Identity { id: string; name: string }

const records = ref<Record[]>([])
const units = ref<Identity[]>([])
const error = ref('')
const busy = ref(false)
const form = ref({ unitId: '', kind: 'acceptance', subjectRef: '', rationale: '', signedBy: '', evid: '' })

function auth(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

async function refresh(): Promise<void> {
  busy.value = true; error.value = ''
  try {
    const res = await fetch('/api/governance/agent-identity', { headers: auth() })
    const body = await res.json()
    units.value = body.identities ?? []
    const recs: Record[] = []
    for (const u of units.value) {
      const r = await fetch(`/api/governance/agent-identity/${encodeURIComponent(u.id)}/judgments`, { headers: auth() })
      const jb = await r.json()
      recs.push(...(jb.records ?? []))
    }
    records.value = recs.sort((a, b) => b.signedAt - a.signedAt)
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

async function submit(): Promise<void> {
  error.value = ''
  const res = await fetch(`/api/governance/agent-identity/${encodeURIComponent(form.value.unitId)}/judgments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify({
      kind: form.value.kind, subjectRef: form.value.subjectRef, rationale: form.value.rationale,
      signedBy: form.value.signedBy,
      evidenceRefs: form.value.evid.split(',').map((s) => s.trim()).filter(Boolean),
    }),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok || json.ok === false) { error.value = json.problems?.join('；') ?? `HTTP ${res.status}`; return }
  form.value.rationale = ''; form.value.subjectRef = ''
  await refresh()
}

const kindLabel = (k: string): string => (T.value.kinds as Record<string, string>)[k] ?? k
const unitName = (id: string): string => units.value.find((u) => u.id === id)?.name ?? id
const fmtTime = (ts: number): string => humanDateTime(ts)

onMounted(() => void refresh())
</script>

<template>
  <div class="jr" data-testid="gov-judgment-records">
    <div class="jr__bar">
      <h3 class="jr__title">{{ T.title }}</h3>
      <button type="button" :disabled="busy" @click="refresh()">{{ T.refresh }}</button>
    </div>
    <p class="jr__sub">{{ T.sub }}</p>
    <p v-if="error" class="jr__err" data-testid="gov-judgment-err">{{ T.fail }}：{{ error }}</p>

    <div class="jr__form">
      <label>{{ T.formUnit }}
        <select v-model="form.unitId">
          <option value="" disabled>—</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
      </label>
      <label>{{ T.formKind }}
        <select v-model="form.kind">
          <option v-for="k in Object.keys(T.kinds)" :key="k" :value="k">{{ kindLabel(k) }}</option>
        </select>
      </label>
      <label>{{ T.formSubject }}<input v-model="form.subjectRef" /></label>
      <label class="jr__wide">{{ T.formRationale }}<textarea v-model="form.rationale" rows="2" /></label>
      <label>{{ T.formBy }}<input v-model="form.signedBy" /></label>
      <label>{{ T.formEvid }}<input v-model="form.evid" /></label>
      <button type="button" class="jr__btn" @click="submit()">{{ T.submit }}</button>
    </div>

    <table v-if="records.length" class="jr__table">
      <thead>
        <tr><th>{{ T.colKind }}</th><th>{{ T.colSubject }}</th><th>{{ T.colRationale }}</th><th>{{ T.colBy }}</th><th>{{ T.colAt }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in records" :key="r.id" :data-testid="`gov-judgment-row-${r.id}`">
          <td><span class="jr__kind" :class="`jr__kind--${r.kind}`">{{ kindLabel(r.kind) }}</span></td>
          <td>{{ unitName(r.unitId) }} · {{ r.subjectRef }}</td>
          <td class="jr__rat">{{ r.rationale }}</td>
          <td>{{ r.signedBy }}</td>
          <td>{{ fmtTime(r.signedAt) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="jr__empty">{{ T.empty }}</p>
  </div>
</template>

<style scoped lang="scss">
.jr { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color, var(--border-color)); border-radius: 8px; }
.jr__bar { display: flex; align-items: center; justify-content: space-between; }
.jr__title { margin: 0; font-size: 13.5px; }
.jr__sub { margin: 0; font-size: 11.5px; color: var(--text-muted, var(--text-muted)); }
.jr__err { color: var(--error); margin: 0; font-size: 12px; }
.jr__form { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.jr__wide { grid-column: 1 / -1; }
.jr__form label { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; }
.jr__btn { align-self: flex-start; grid-column: 1 / -1; }
.jr__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.jr__table th, .jr__table td { border-bottom: 1px solid var(--border-color, var(--border-color)); padding: 4px 6px; text-align: left; }
.jr__kind { border-radius: 8px; padding: 0 8px; font-size: 11px; background: var(--text-secondary); color: var(--bg-primary); }
.jr__kind--override, .jr__kind--rejection { background: var(--error); }
.jr__kind--escalation, .jr__kind--pause { background: var(--warning); }
.jr__kind--acceptance { background: var(--success); }
.jr__rat { max-width: 360px; }
.jr__empty { color: var(--text-muted, var(--text-muted)); font-size: 12px; }
</style>
