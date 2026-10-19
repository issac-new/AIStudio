<!-- overlay/custom/client/ia2/views/gov/HarnessImprovePanel.vue
     Harness² 改进实验台（2026-10-19 调研轮）：⑥治理 → 改进实验。
     四段：可编辑面 / 改进提案（提出-探测-组合-晋级-回滚）/ 经验库 / 边界。
     纪律：本页不跑模型；探测只认 Eval Studio 真实运行；缺证据标「—」，不放行。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { improveMessages } from '@/custom/governance/improve-i18n'
import {
  addWorkbenchExperience,
  attachWorkbenchBaseline,
  composeWorkbenchProposal,
  createWorkbenchProbes,
  createWorkbenchProposal,
  decideWorkbenchProposal,
  fetchWorkbenchOverview,
  importWorkbenchExperiences,
  promoteWorkbenchProposal,
  recordWorkbenchProbe,
  rollbackWorkbenchProposal,
  setWorkbenchExperienceStatus,
  submitWorkbenchProposal,
  type ExperienceDto,
  type ProbeDto,
  type ProposalDto,
  type ProposalStatus,
  type SurfaceKey,
  type WorkbenchOverviewDto,
} from '@/custom/governance/api/workbench'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return improveMessages[loc.startsWith('zh') ? 'zh' : 'en']
})

const data = ref<WorkbenchOverviewDto | null>(null)
const busy = ref(false)
const error = ref('')
const actionError = ref('')
const showCreate = ref(false)

interface ProposalForm {
  baselineRunId: string
  selectedVariant: string
  rationale: string
  rollbackReason: string
  actor: string
  note: string
  apply: boolean
  cue: string
  lesson: string
  evidence: string
  confidence: 'low' | 'medium' | 'high'
}
const forms = reactive<Record<string, ProposalForm>>({})
const probeInputs = reactive<Record<string, { evalRunId: string; regressionRunId: string }>>({})

const createForm = reactive({
  title: '',
  hypothesis: '',
  surfaceKey: 'system_prompt' as SurfaceKey,
  targetPath: '',
  mode: 'parallel' as 'parallel' | 'sequential',
  domain: 'general',
  budgetCapUsd: 5,
  evidenceRefs: '',
  variants: [{ label: '候选 A', tree: false, content: '', files: [{ path: '', content: '' }], deletions: '' }] as Array<{
    label: string; tree: boolean; content: string; files: Array<{ path: string; content: string }>; deletions: string
  }>,
  // #5 经验库合流：引用经验新建提案（把经验 id 传入 experienceIds，激活原死字段）
  experienceIds: [] as string[],
})

const expForm = reactive({
  statement: '',
  surfaceKey: '' as SurfaceKey | '',
  evidenceRefs: '',
  confidence: 'medium' as 'low' | 'medium' | 'high',
})

// #5 经验库合流：按经验域筛选（消「导入全 general 后无法分域检索」的盲区）。
const expDomainFilter = ref('')

const experienceDomains = computed<string[]>(() => {
  const all = (data.value?.experiences ?? []).map((e) => e.domain || 'general')
  return [...new Set(all)].sort()
})

const filteredExperiences = computed(() => {
  const all = data.value?.experiences ?? []
  if (!expDomainFilter.value) return all
  return all.filter((e) => (e.domain || 'general') === expDomainFilter.value)
})

function formFor(id: string): ProposalForm {
  if (!forms[id]) {
    forms[id] = {
      baselineRunId: '', selectedVariant: '', rationale: '', rollbackReason: '', actor: '', note: '',
      apply: false, cue: '', lesson: '', evidence: '', confidence: 'medium',
    }
  }
  return forms[id]
}

function probeInput(probeId: string): { evalRunId: string; regressionRunId: string } {
  if (!probeInputs[probeId]) probeInputs[probeId] = { evalRunId: '', regressionRunId: '' }
  return probeInputs[probeId]
}

function surfaceName(key: SurfaceKey): string {
  return data.value?.surfaces.find((s) => s.key === key)?.nameZh ?? key
}

const STATUS_LABEL: Record<ProposalStatus, keyof typeof improveMessages.zh> = {
  draft: 'statusDraft',
  submitted: 'statusSubmitted',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  probing: 'statusProbing',
  composed: 'statusComposed',
  promoted: 'statusPromoted',
  rolled_back: 'statusRolledBack',
}

function statusLabel(s: ProposalStatus): string {
  return L.value[STATUS_LABEL[s]]
}

function contextLabel(ctx: 'always_on' | 'on_demand' | 'tool_loop'): string {
  return ctx === 'always_on' ? L.value.sourceAlwaysOn : ctx === 'on_demand' ? L.value.sourceOnDemand : L.value.sourceToolLoop
}

function riskLabel(r: 'low' | 'medium' | 'high'): string {
  return r === 'high' ? L.value.riskHigh : r === 'medium' ? L.value.riskMedium : L.value.riskLow
}

function verdictLabel(q: string | undefined): string {
  if (q === 'improved') return L.value.qualityImproved
  if (q === 'regressed') return L.value.qualityRegressed
  if (q === 'neutral') return L.value.qualityNeutral
  return L.value.qualityUnknown
}

function expStatusLabel(s: ExperienceDto['status']): string {
  return s === 'adopted' ? L.value.expAdopted : s === 'retired' ? L.value.expRetired : L.value.expCandidate
}

function fmtPct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function fmtDelta(v: number | null | undefined): string {
  return v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`
}

function fmtRatio(v: number | null | undefined): string {
  return v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`
}

function fmtNum(v: number | null | undefined): string {
  return v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))
}

function fmtUsd(v: number | null | undefined): string {
  return v == null ? '—' : `$${v.toFixed(2)}`
}

function short(s: string | null | undefined): string {
  return s ? s.slice(0, 12) : '—'
}

function probeOf(p: ProposalDto, variantId: string): ProbeDto | undefined {
  return p.probes.find((x) => x.variantId === variantId)
}

function defaultVariant(p: ProposalDto): string {
  return p.derived.selectedVariantId ?? p.variants[0]?.id ?? ''
}

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchWorkbenchOverview()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function act(fn: () => Promise<unknown>): Promise<boolean> {
  actionError.value = ''
  try {
    await fn()
    await refresh()
    return true
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
    return false
  }
}

function splitRefs(raw: string): string[] {
  return raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20)
}

async function create(): Promise<void> {
  const variants = createForm.variants
    .map((v, i) => {
      const label = v.label.trim() || `候选 ${i + 1}`
      if (v.tree) {
        const files = v.files.filter((f) => f.path.trim()).map((f) => ({ path: f.path.trim(), content: f.content }))
        if (files.length === 0) return null
        return {
          label, files,
          deletions: v.deletions.split(/[,，\n]+/).map((x) => x.trim()).filter(Boolean),
        }
      }
      return v.content.trim() ? { label, content: v.content } : null
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
  const ok = await act(() => createWorkbenchProposal({
    title: createForm.title.trim(),
    hypothesis: createForm.hypothesis.trim(),
    surfaceKey: createForm.surfaceKey,
    targetPath: createForm.targetPath.trim() || undefined,
    mode: createForm.mode,
    domain: createForm.domain.trim() || 'general',
    budgetCapUsd: Number(createForm.budgetCapUsd) || 0,
    evidenceRefs: splitRefs(createForm.evidenceRefs),
    ...(createForm.experienceIds.length ? { experienceIds: createForm.experienceIds } : {}),
    variants,
  }))
  if (ok) {
    showCreate.value = false
    createForm.title = ''
    createForm.hypothesis = ''
    createForm.targetPath = ''
    createForm.evidenceRefs = ''
    createForm.domain = 'general'
    createForm.experienceIds = []
    createForm.variants = [{ label: '候选 A', tree: false, content: '', files: [{ path: '', content: '' }], deletions: '' }]
  }
}

function addVariant(): void {
  createForm.variants.push({
    label: `候选 ${String.fromCharCode(65 + createForm.variants.length)}`,
    tree: false, content: '', files: [{ path: '', content: '' }], deletions: '',
  })
}

function removeVariant(i: number): void {
  if (createForm.variants.length > 1) createForm.variants.splice(i, 1)
}

function addFile(v: { files: Array<{ path: string; content: string }> }): void {
  v.files.push({ path: '', content: '' })
}

function removeFile(v: { files: Array<{ path: string; content: string }> }, i: number): void {
  if (v.files.length > 1) v.files.splice(i, 1)
}

async function attachBaseline(p: ProposalDto): Promise<void> {
  await act(() => attachWorkbenchBaseline(p.id, formFor(p.id).baselineRunId.trim()))
}

async function submit(p: ProposalDto): Promise<void> {
  await act(() => submitWorkbenchProposal(p.id))
}

async function decide(p: ProposalDto, decision: 'approve' | 'reject'): Promise<void> {
  const f = formFor(p.id)
  await act(() => decideWorkbenchProposal(p.id, decision, f.actor.trim() || 'operator', f.note.trim()))
}

async function createProbes(p: ProposalDto): Promise<void> {
  await act(() => createWorkbenchProbes(p.id))
}

async function recordProbe(p: ProposalDto, probe: ProbeDto): Promise<void> {
  const input = probeInput(probe.id)
  const f = formFor(p.id)
  await act(() => recordWorkbenchProbe(p.id, probe.id, {
    evalRunId: input.evalRunId.trim(),
    regressionRunId: input.regressionRunId.trim() || undefined,
    actor: f.actor.trim() || 'operator',
  }))
}

async function compose(p: ProposalDto): Promise<void> {
  const f = formFor(p.id)
  await act(() => composeWorkbenchProposal(p.id, {
    variantId: f.selectedVariant || defaultVariant(p),
    rationale: f.rationale.trim(),
  }))
}

async function promote(p: ProposalDto): Promise<void> {
  const f = formFor(p.id)
  if (f.apply && !window.confirm(L.value.confirmApply)) return
  const reflection = f.cue.trim() && f.lesson.trim() && f.evidence.trim()
    ? { cue: f.cue.trim(), lesson: f.lesson.trim(), evidence: f.evidence.trim(), confidence: f.confidence }
    : undefined
  await act(() => promoteWorkbenchProposal(p.id, f.apply, reflection))
}

async function rollback(p: ProposalDto): Promise<void> {
  const f = formFor(p.id)
  await act(() => rollbackWorkbenchProposal(p.id, f.rollbackReason.trim()))
}

async function importExperiences(): Promise<void> {
  await act(() => importWorkbenchExperiences())
}

// #5：把经验加入待引用清单（创建提案时作为 experienceIds 传入，激活死字段）。
// 同时把经验域带到提案 domain，保证「同域经验互相检索」语义贯穿。
function citeExperience(exp: { id: string; domain?: string | null }): void {
  if (!createForm.experienceIds.includes(exp.id)) createForm.experienceIds.push(exp.id)
  if (exp.domain) createForm.domain = exp.domain
  showCreate.value = true
}

function unciteExperience(id: string): void {
  createForm.experienceIds = createForm.experienceIds.filter((x) => x !== id)
}

// #5：提案详情展示其引用的经验（experienceIds → 经验摘要，激活死字段的可视消费）。
function citedExperiencesOf(p: { experienceIds?: string[] }): Array<{ id: string; domain?: string | null; statement: string }> {
  const ids = p.experienceIds ?? []
  if (!ids.length) return []
  const all = data.value?.experiences ?? []
  return all.filter((e) => ids.includes(e.id))
}

async function addExperience(): Promise<void> {
  const ok = await act(() => addWorkbenchExperience({
    surfaceKey: expForm.surfaceKey || null,
    statement: expForm.statement.trim(),
    evidenceRefs: splitRefs(expForm.evidenceRefs),
    confidence: expForm.confidence,
  }))
  if (ok) {
    expForm.statement = ''
    expForm.evidenceRefs = ''
  }
}

async function setExperienceStatus(exp: ExperienceDto, status: ExperienceDto['status']): Promise<void> {
  await act(() => setWorkbenchExperienceStatus(exp.id, status))
}

onMounted(() => void refresh())
</script>

<template>
  <div class="hi" data-testid="harness-improve">
    <TabIntroBanner tab="gov-improve" />
    <header class="hi__bar">
      <div>
        <h2 class="hi__title">{{ L.title }}</h2>
        <p class="hi__sub">{{ L.sub }}</p>
      </div>
      <button type="button" class="hi__btn" data-testid="hi-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L.loading : L.refresh }}
      </button>
    </header>

    <div v-if="error" class="hi__error" data-testid="hi-error">{{ L.loadFailed }}：{{ error }}</div>
    <div v-if="actionError" class="hi__error" data-testid="hi-action-error">{{ L.actionFailed }}：{{ actionError }}</div>

    <template v-if="data">
      <div class="hi__summary" data-testid="hi-summary">
        <div class="hi__stat"><b>{{ data.counts.surfaces }}</b><span>{{ L.surfacesTitle }}（{{ L.managed }} {{ data.counts.managedSurfaces }}）</span></div>
        <div class="hi__stat"><b>{{ data.counts.openProposals }}</b><span>{{ L.proposalsTitle }}</span></div>
        <div class="hi__stat"><b>{{ data.counts.recordedProbes }}</b><span>{{ L.probes }}</span></div>
        <div class="hi__stat"><b>{{ data.counts.champions }}</b><span>{{ L.promote }}</span></div>
        <div class="hi__stat"><b>{{ fmtUsd(data.budget.observedUsd) }}</b><span>{{ L.formBudget }}</span></div>
      </div>

      <section class="hi__section" data-testid="hi-surfaces">
        <div class="hi__sectionHead">
          <h3>{{ L.surfacesTitle }}</h3>
          <p>{{ L.surfacesSub }}</p>
        </div>
        <div class="hi__surfaces">
          <article
            v-for="s in data.surfaces" :key="s.key" class="hi__surface"
            :class="{ 'hi__surface--off': !s.available }" :data-testid="`hi-surface-${s.key}`"
          >
            <div class="hi__surfaceTop">
              <strong>{{ s.nameZh }}</strong>
              <span class="hi__chip" :class="s.applyMode === 'managed' ? 'hi__chip--ok' : 'hi__chip--muted'">
                {{ s.applyMode === 'managed' ? L.managed : L.advisory }}
              </span>
              <span class="hi__chip" :class="`hi__chip--risk-${s.risk}`">{{ riskLabel(s.risk) }}</span>
            </div>
            <div class="hi__meta">{{ L.artifactCount }} {{ s.artifacts.count }} · {{ L.revision }} {{ short(s.revision) }}</div>
            <div v-if="!s.available" class="hi__missing">{{ L.noArtifacts }} · <code>{{ s.expected }}</code></div>
            <ul v-else class="hi__samples">
              <li v-for="x in s.artifacts.samples.slice(0, 3)" :key="x"><code>{{ x }}</code></li>
            </ul>
            <div class="hi__meta">{{ L.managedBy }}：{{ s.managedBy }}</div>
            <div class="hi__meta">
              {{ L.sourceMap }}：<code>{{ s.source.components.join('/') }}</code>
              · {{ contextLabel(s.source.context) }} · <code>{{ s.source.opencode }}</code>
            </div>
          </article>
        </div>
      </section>

      <section class="hi__section" data-testid="hi-proposals">
        <div class="hi__sectionHead hi__sectionHead--row">
          <div>
            <h3>{{ L.proposalsTitle }}</h3>
            <p>{{ L.proposalsSub }}</p>
          </div>
          <button type="button" class="hi__btn hi__btn--primary" data-testid="hi-create-toggle" @click="showCreate = !showCreate">
            {{ showCreate ? L.cancel : L.newProposal }}
          </button>
        </div>

        <form v-if="showCreate" class="hi__form" data-testid="hi-create" @submit.prevent="create()">
          <label>{{ L.formTitle }}<input v-model="createForm.title" data-testid="hi-create-title" required /></label>
          <label>{{ L.formHypothesis }}<textarea v-model="createForm.hypothesis" rows="2" data-testid="hi-create-hypothesis" required /></label>
          <div class="hi__formRow">
            <label>{{ L.formSurface }}
              <select v-model="createForm.surfaceKey" data-testid="hi-create-surface">
                <option v-for="s in data.surfaces" :key="s.key" :value="s.key">{{ s.nameZh }}</option>
              </select>
            </label>
            <label>{{ L.formBudget }}<input v-model.number="createForm.budgetCapUsd" type="number" min="0" step="0.5" /></label>
            <label>{{ L.formDomain }}<input v-model="createForm.domain" placeholder="general" /></label>
            <label>{{ L.formMode }}
              <select v-model="createForm.mode">
                <option value="parallel">{{ L.formParallel }}</option>
                <option value="sequential">{{ L.formSequential }}</option>
              </select>
            </label>
          </div>
          <label>{{ L.formTarget }}<input v-model="createForm.targetPath" :placeholder="'profiles/orchestrator/SOUL.md'" /><small>{{ L.formTargetHint }}</small></label>
          <label>{{ L.formEvidence }}<input v-model="createForm.evidenceRefs" :placeholder="'task:DEV-123, run:run-xxx'" /><small>{{ L.formEvidenceHint }}</small></label>
          <div class="hi__variantsForm">
            <div class="hi__meta">{{ L.formVariants }}</div>
            <div v-for="(v, i) in createForm.variants" :key="i" class="hi__variantForm hi__variantForm--col">
              <div class="hi__row">
                <input v-model="v.label" :placeholder="L.formVariant" />
                <label class="hi__check">
                  <input v-model="v.tree" type="checkbox" :data-testid="`hi-create-tree-${i}`" />
                  {{ L.formModeTree }}
                </label>
                <button type="button" class="hi__btn hi__btn--ghost" @click="removeVariant(i)">{{ L.removeVariant }}</button>
              </div>
              <textarea
                v-if="!v.tree" v-model="v.content" rows="3"
                :placeholder="L.formVariantContent" :data-testid="`hi-create-variant-${i}`"
              />
              <div v-else class="hi__treeForm" :data-testid="`hi-create-treeform-${i}`">
                <div v-for="(f, fi) in v.files" :key="fi" class="hi__fileRow">
                  <input v-model="f.path" :placeholder="L.formFilePath" :data-testid="`hi-create-file-path-${i}-${fi}`" />
                  <textarea v-model="f.content" rows="2" :placeholder="L.formFileContent" />
                  <button type="button" class="hi__btn hi__btn--ghost" @click="removeFile(v, fi)">{{ L.removeFile }}</button>
                </div>
                <button type="button" class="hi__btn" @click="addFile(v)">{{ L.addFile }}</button>
                <label>{{ L.formDeletions }}
                  <textarea v-model="v.deletions" rows="2" :placeholder="'scripts/old.py'" />
                  <small>{{ L.formDeletionsHint }}</small>
                </label>
              </div>
            </div>
            <button type="button" class="hi__btn" @click="addVariant">{{ L.addVariant }}</button>
          </div>
          <div class="hi__formRow">
            <button type="submit" class="hi__btn hi__btn--primary" data-testid="hi-create-submit" :disabled="busy">{{ busy ? L.creating : L.create }}</button>
            <button type="button" class="hi__btn" @click="showCreate = false">{{ L.cancel }}</button>
          </div>
        </form>

        <p v-if="data.proposals.length === 0" class="hi__empty">{{ L.emptyProposals }}</p>

        <article v-for="p in data.proposals" :key="p.id" class="hi__proposal" :data-testid="`hi-proposal-${p.id}`">
          <header class="hi__proposalHead">
            <strong>{{ p.title }}</strong>
            <span class="hi__chip" :class="`hi__chip--status-${p.status}`">{{ statusLabel(p.status) }}</span>
            <span class="hi__meta">{{ surfaceName(p.surfaceKey) }} · {{ p.domain }} · {{ riskLabel(p.risk) }} · {{ fmtUsd(p.budgetCapUsd) }}</span>
          </header>
          <p class="hi__hyp">{{ p.hypothesis }}</p>
          <div v-if="p.targetPath" class="hi__meta">{{ L.formTarget }}：<code>{{ p.targetPath }}</code></div>
          <div v-if="citedExperiencesOf(p).length" class="hi__meta" data-testid="hi-proposal-cited">
            {{ L.citedExperiences }}：<span v-for="e in citedExperiencesOf(p)" :key="e.id"><code>{{ e.domain || L.general }}/{{ e.statement.slice(0, 24) }}</code> </span>
          </div>
          <div class="hi__meta">
            {{ L.baseline }}：<code>{{ p.baselineRunId ?? '—' }}</code>
            · {{ L.approvalApproved }}：{{ p.approval ? `${p.approval.actor}（${p.approval.decision === 'approved' ? L.approvalApproved : L.approvalRejected}）` : L.approvalNone }}
            · {{ L.probes }}：{{ p.derived.recordedProbes }}/{{ p.derived.totalProbes }}
            · {{ L.cost }}：{{ fmtUsd(p.derived.cost.total) }} / {{ fmtUsd(p.budgetCapUsd) }}
          </div>

          <details class="hi__details" open>
            <summary>
              {{ L.variants }}（{{ p.variants.length }}）
              · {{ L.diversity }} {{ p.derived.diversity.nDistinct }}/{{ p.derived.diversity.n }}
              · {{ (p.derived.diversity.meanLineJaccard * 100).toFixed(0) }}%
            </summary>
            <table class="hi__table">
              <thead>
                <tr>
                  <th>{{ L.formVariant }}</th><th>{{ L.diff }}</th><th>{{ L.probes }}</th><th>{{ L.quality }}</th>
                  <th>{{ L.passAt1 }}</th><th>{{ L.trajectory }}</th><th>{{ L.tokens }}</th><th>{{ L.cost }}</th><th>{{ L.regression }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in p.variants" :key="v.id">
                  <td>
                    {{ v.label }} <small class="hi__meta">{{ v.id }}</small>
                    <div v-if="v.files" class="hi__meta">{{ L.fileCount }} {{ v.files.length }}</div>
                    <div v-if="v.files" class="hi__fileList">
                      <code v-for="f in v.files.slice(0, 4)" :key="f.path">{{ f.path }}</code>
                      <span v-if="v.files.length > 4" class="hi__meta">+{{ v.files.length - 4 }}</span>
                    </div>
                    <div v-if="v.deletions?.length" class="hi__del">-{{ v.deletions.length }} 删除</div>
                  </td>
                  <td><span class="hi__add">+{{ v.diffSummary.added }}</span> / <span class="hi__del">-{{ v.diffSummary.removed }}</span></td>
                  <td>
                    <span v-if="probeOf(p, v.id)" class="hi__chip" :class="probeOf(p, v.id)?.status === 'recorded' ? 'hi__chip--ok' : 'hi__chip--muted'">
                      {{ probeOf(p, v.id)?.status === 'recorded' ? L.probeRecorded : L.probePlanned }}
                    </span>
                    <span v-else>—</span>
                  </td>
                  <td>
                    <span class="hi__chip" :class="`hi__chip--verdict-${probeOf(p, v.id)?.contrast?.quality ?? 'unknown'}`">
                      {{ verdictLabel(probeOf(p, v.id)?.contrast?.quality) }}
                    </span>
                  </td>
                  <td>{{ fmtPct(probeOf(p, v.id)?.evidence?.passAt1) }} <small class="hi__meta">{{ fmtDelta(probeOf(p, v.id)?.contrast?.passAt1Delta) }}</small></td>
                  <td>{{ fmtPct(probeOf(p, v.id)?.evidence?.trajectoryPassRate) }} <small class="hi__meta">{{ fmtDelta(probeOf(p, v.id)?.contrast?.trajectoryPassRateDelta) }}</small></td>
                  <td>{{ fmtNum(probeOf(p, v.id)?.evidence?.tokens) }} <small class="hi__meta">{{ fmtRatio(probeOf(p, v.id)?.contrast?.tokenDeltaPct) }}</small></td>
                  <td>{{ fmtUsd(probeOf(p, v.id)?.evidence?.costUsd) }} <small class="hi__meta">{{ fmtRatio(probeOf(p, v.id)?.contrast?.costDeltaPct) }}</small></td>
                  <td>
                    <span v-if="probeOf(p, v.id)?.evidence?.regression">
                      {{ probeOf(p, v.id)?.evidence?.regression?.failed }} / {{ probeOf(p, v.id)?.evidence?.regression?.total }}
                    </span>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </details>

          <div class="hi__gate" :class="p.derived.gate.ok ? 'hi__gate--ok' : 'hi__gate--blocked'" :data-testid="`hi-gate-${p.id}`">
            <b>{{ L.gate }}：{{ p.derived.gate.ok ? L.gateOk : L.gateBlocked }}</b>
            <ul v-if="p.derived.gate.blockers.length">
              <li v-for="b in p.derived.gate.blockers" :key="b.code"><code>{{ b.code }}</code> {{ b.message }}</li>
            </ul>
            <ul v-if="p.derived.gate.warnings.length" class="hi__warn">
              <li v-for="w in p.derived.gate.warnings" :key="w.code"><code>{{ w.code }}</code> {{ w.message }}</li>
            </ul>
          </div>

          <details class="hi__details" data-testid="`hi-actions-${p.id}`">
            <summary>{{ L.submit }} / {{ L.approve }} / {{ L.probes }} / {{ L.compose }} / {{ L.promote }}</summary>
            <div class="hi__actions">
              <div v-if="!p.baseline" class="hi__row">
                <input v-model="formFor(p.id).baselineRunId" :placeholder="L.baselineRunId" />
                <button type="button" class="hi__btn" @click="attachBaseline(p)">{{ L.attachBaseline }}</button>
                <span class="hi__meta">{{ L.baselineHint }}</span>
              </div>

              <div v-if="p.status === 'draft'" class="hi__row">
                <button type="button" class="hi__btn hi__btn--primary" @click="submit(p)">{{ L.submit }}</button>
                <span v-if="!p.baseline" class="hi__meta">{{ L.baselineMissing }}</span>
              </div>

              <div v-if="p.status === 'submitted'" class="hi__row">
                <input v-model="formFor(p.id).actor" :placeholder="L.actor" />
                <input v-model="formFor(p.id).note" :placeholder="L.note" />
                <button type="button" class="hi__btn hi__btn--primary" @click="decide(p, 'approve')">{{ L.approve }}</button>
                <button type="button" class="hi__btn" @click="decide(p, 'reject')">{{ L.reject }}</button>
              </div>

              <div v-if="p.status === 'approved' || p.status === 'probing'" class="hi__row">
                <button type="button" class="hi__btn" @click="createProbes(p)">{{ L.createProbes }}</button>
                <span class="hi__meta">{{ L.recordHint }}</span>
              </div>

              <div v-for="probe in p.probes.filter((x) => x.status === 'planned')" :key="probe.id" class="hi__row">
                <code>{{ probe.id }}</code>
                <input v-model="probeInput(probe.id).evalRunId" :placeholder="L.evalRunId" />
                <input v-model="probeInput(probe.id).regressionRunId" :placeholder="L.regressionRunId" />
                <button type="button" class="hi__btn" @click="recordProbe(p, probe)">{{ L.record }}</button>
              </div>

              <div v-if="p.status === 'probing' || p.status === 'composed'" class="hi__row">
                <select v-model="formFor(p.id).selectedVariant">
                  <option value="">{{ L.selectedVariant }}</option>
                  <option v-for="v in p.variants" :key="v.id" :value="v.id">{{ v.label }}（{{ v.id }}）</option>
                </select>
                <input v-model="formFor(p.id).rationale" :placeholder="L.composeRationale" />
                <button type="button" class="hi__btn" @click="compose(p)">{{ L.composeAction }}</button>
                <span class="hi__meta">{{ L.composeHint }}</span>
              </div>

              <div v-if="p.status === 'composed'" class="hi__reflection">
                <div class="hi__meta"><b>{{ L.reflectionTitle }}</b> · {{ L.reflectionHint }}</div>
                <div class="hi__row">
                  <input v-model="formFor(p.id).cue" :placeholder="L.reflectionCue" />
                  <input v-model="formFor(p.id).lesson" :placeholder="L.reflectionLesson" />
                  <input v-model="formFor(p.id).evidence" :placeholder="L.reflectionEvidence" />
                  <select v-model="formFor(p.id).confidence">
                    <option value="low">{{ L.confidenceLow }}</option>
                    <option value="medium">{{ L.confidenceMedium }}</option>
                    <option value="high">{{ L.confidenceHigh }}</option>
                  </select>
                </div>
                <div class="hi__row">
                  <label class="hi__check"><input v-model="formFor(p.id).apply" type="checkbox" />{{ L.promoteApply }}</label>
                  <button type="button" class="hi__btn hi__btn--primary" @click="promote(p)">{{ L.promoteAction }}</button>
                  <span class="hi__meta">{{ L.promoteApplyHint }}</span>
                </div>
              </div>

              <div v-if="p.status === 'promoted'" class="hi__row">
                <input v-model="formFor(p.id).rollbackReason" :placeholder="L.rollbackReason" />
                <button type="button" class="hi__btn" @click="rollback(p)">{{ L.rollbackAction }}</button>
                <span v-if="p.promotion" class="hi__meta">{{ L.promote }}：{{ p.promotion.applied ? L.managed : L.advisory }} · {{ short(p.promotion.digest) }}</span>
              </div>
            </div>
          </details>
        </article>
      </section>

      <section class="hi__section" data-testid="hi-experiences">
        <div class="hi__sectionHead hi__sectionHead--row">
          <div>
            <h3>{{ L.experiencesTitle }}</h3>
            <p>{{ L.experiencesSub }}</p>
          </div>
          <button type="button" class="hi__btn" data-testid="hi-exp-import" @click="importExperiences">{{ L.importExperiences }}</button>
        </div>
        <div class="hi__row" v-if="data.experiences.length > 0">
          <label class="hi__meta">{{ L.filterByDomain }}
            <select v-model="expDomainFilter" data-testid="hi-exp-domain-filter">
              <option value="">{{ L.general }}（全部）</option>
              <option v-for="d in experienceDomains" :key="d" :value="d">{{ d }}</option>
            </select>
          </label>
          <span v-if="createForm.experienceIds.length" class="hi__meta" data-testid="hi-cited-count">
            {{ L.citedExperiences }}: {{ createForm.experienceIds.length }}
            <button type="button" class="hi__btn" @click="createForm.experienceIds = []">×</button>
          </span>
        </div>
        <p v-if="filteredExperiences.length === 0" class="hi__empty">{{ L.emptyExperiences }}</p>
        <ul class="hi__expList">
          <li v-for="exp in filteredExperiences" :key="exp.id" class="hi__exp" :data-testid="`hi-exp-${exp.id}`">
            <div class="hi__expMain">
              <span>{{ exp.statement }}</span>
              <span class="hi__meta">
                {{ exp.surfaceKey ? surfaceName(exp.surfaceKey) : L.general }} ·
                {{ exp.domain || L.general }} ·
                {{ exp.confidence === 'high' ? L.confidenceHigh : exp.confidence === 'low' ? L.confidenceLow : L.confidenceMedium }} ·
                {{ expStatusLabel(exp.status) }}
              </span>
              <span v-if="exp.cue" class="hi__meta">cue: {{ exp.cue }}</span>
              <span v-if="exp.lesson" class="hi__meta">lesson: {{ exp.lesson }}</span>
            </div>
            <div class="hi__meta">
              <code v-for="ref in exp.evidenceRefs.slice(0, 3)" :key="ref">{{ ref }}</code>
            </div>
            <div class="hi__row">
              <button type="button" class="hi__btn" :data-testid="`hi-exp-cite-${exp.id}`" @click="citeExperience(exp)">{{ L.citeForProposal }}</button>
              <button v-if="exp.status === 'candidate'" type="button" class="hi__btn" @click="setExperienceStatus(exp, 'adopted')">{{ L.adopt }}</button>
              <button v-if="exp.status !== 'retired'" type="button" class="hi__btn" @click="setExperienceStatus(exp, 'retired')">{{ L.retire }}</button>
            </div>
          </li>
        </ul>
        <details class="hi__details">
          <summary>{{ L.newExperience }}</summary>
          <div class="hi__actions">
            <textarea v-model="expForm.statement" rows="2" :placeholder="L.experienceStatement" data-testid="hi-exp-statement" />
            <div class="hi__row">
              <select v-model="expForm.surfaceKey">
                <option value="">{{ L.general }}</option>
                <option v-for="s in data.surfaces" :key="s.key" :value="s.key">{{ s.nameZh }}</option>
              </select>
              <select v-model="expForm.confidence">
                <option value="low">{{ L.confidenceLow }}</option>
                <option value="medium">{{ L.confidenceMedium }}</option>
                <option value="high">{{ L.confidenceHigh }}</option>
              </select>
              <input v-model="expForm.evidenceRefs" :placeholder="L.formEvidence" />
              <button type="button" class="hi__btn" @click="addExperience">{{ L.newExperience }}</button>
            </div>
          </div>
        </details>
      </section>

      <p class="hi__boundary">{{ L.boundary }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.hi { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px 24px; }
.hi__bar { display: flex; align-items: flex-start; gap: 10px; }
.hi__title { margin: 0; font-size: 15px; }
.hi__sub { margin: 2px 0 0; font-size: 12px; opacity: 0.72; max-width: 860px; }
.hi__btn { font-size: 12px; padding: 3px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); cursor: pointer; }
.hi__btn:hover { border-color: var(--accent); }
.hi__btn:disabled { opacity: 0.5; cursor: default; }
.hi__btn--primary { border-color: var(--accent); color: var(--accent); }
.hi__btn--ghost { border-style: dashed; }
.hi__bar > .hi__btn { margin-left: auto; flex-shrink: 0; }
.hi__error { font-size: 12px; color: var(--danger); border: 1px solid var(--danger); border-radius: 8px; padding: 6px 10px; }
.hi__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.hi__stat { border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; background: var(--bg-primary); }
.hi__stat b { font-size: 18px; }
.hi__stat span { font-size: 11px; opacity: 0.7; }
.hi__section { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-primary); }
.hi__sectionHead h3 { margin: 0; font-size: 14px; }
.hi__sectionHead p { margin: 2px 0 0; font-size: 11.5px; opacity: 0.7; }
.hi__sectionHead--row { display: flex; align-items: flex-start; gap: 10px; }
.hi__sectionHead--row > .hi__btn { margin-left: auto; flex-shrink: 0; }
.hi__surfaces { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.hi__surface { border: 1px solid var(--border-color); border-radius: 8px; padding: 7px 9px; display: flex; flex-direction: column; gap: 3px; }
.hi__surface--off { border-style: dashed; opacity: 0.75; }
.hi__surfaceTop { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hi__surfaceTop strong { font-size: 12.5px; }
.hi__chip { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid currentColor; }
.hi__chip--ok { color: var(--success); }
.hi__chip--muted { color: var(--text-muted); }
.hi__chip--risk-low { color: var(--success); }
.hi__chip--risk-medium { color: var(--ia-stale); border-style: dashed; }
.hi__chip--risk-high { color: var(--danger); }
.hi__chip--verdict-improved { color: var(--success); }
.hi__chip--verdict-regressed { color: var(--danger); }
.hi__chip--verdict-neutral { color: var(--text-muted); }
.hi__chip--verdict-unknown { color: var(--ia-stale); border-style: dashed; }
.hi__chip--status-draft, .hi__chip--status-submitted { color: var(--ia-stale); border-style: dashed; }
.hi__chip--status-approved, .hi__chip--status-probing, .hi__chip--status-composed { color: var(--accent); }
.hi__chip--status-promoted { color: var(--success); }
.hi__chip--status-rejected, .hi__chip--status-rolled_back { color: var(--danger); }
.hi__meta { font-size: 11px; opacity: 0.68; }
.hi__missing { font-size: 11px; color: var(--ia-stale); }
.hi__samples { margin: 0; padding-left: 16px; font-size: 10.5px; display: flex; flex-direction: column; gap: 1px; }
.hi__samples code, .hi__meta code, .hi__exp code { background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; margin-right: 4px; }
.hi__form { border: 1px dashed var(--border-color); border-radius: 8px; padding: 9px; display: flex; flex-direction: column; gap: 7px; }
.hi__form label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; }
.hi__form input, .hi__form textarea, .hi__form select, .hi__row input, .hi__row select, .hi__actions textarea, .hi__actions input, .hi__actions select {
  font-size: 12px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);
}
.hi__form small { font-size: 10.5px; opacity: 0.6; }
.hi__formRow, .hi__row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hi__variantsForm { display: flex; flex-direction: column; gap: 6px; }
.hi__variantForm { display: grid; grid-template-columns: 120px 1fr auto; gap: 6px; align-items: start; }
.hi__variantForm--col { display: flex; flex-direction: column; }
.hi__treeForm { display: flex; flex-direction: column; gap: 6px; border: 1px dashed var(--border-color); border-radius: 7px; padding: 6px 8px; }
.hi__treeForm label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; }
.hi__treeForm small { font-size: 10px; opacity: 0.6; }
.hi__fileRow { display: grid; grid-template-columns: minmax(160px, 240px) 1fr auto; gap: 6px; align-items: start; }
.hi__fileRow textarea { width: 100%; }
.hi__fileList { display: flex; flex-direction: column; gap: 1px; margin-top: 2px; }
.hi__fileList code { font-size: 10px; }
.hi__variantForm textarea { width: 100%; }
.hi__empty { font-size: 12px; opacity: 0.65; margin: 0; }
.hi__proposal { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }
.hi__proposalHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hi__proposalHead strong { font-size: 13px; }
.hi__hyp { margin: 0; font-size: 11.5px; opacity: 0.8; }
.hi__details { border-top: 1px dashed var(--border-color); padding-top: 5px; }
.hi__details summary { cursor: pointer; font-size: 11.5px; opacity: 0.8; }
.hi__table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 5px; }
.hi__table th { text-align: left; font-weight: 600; opacity: 0.65; border-bottom: 1px solid var(--border-color); padding: 3px 4px; white-space: nowrap; }
.hi__table td { border-bottom: 1px solid rgb(0 0 0 / 4%); padding: 3px 4px; vertical-align: top; }
.hi__add { color: var(--success); }
.hi__del { color: var(--danger); }
.hi__gate { border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 11px; }
.hi__gate--ok { border-color: var(--success); }
.hi__gate--blocked { border-color: var(--danger); }
.hi__gate ul { margin: 3px 0 0; padding-left: 16px; }
.hi__warn { color: var(--ia-stale); }
.hi__actions { display: flex; flex-direction: column; gap: 6px; margin-top: 5px; }
.hi__reflection { border: 1px dashed var(--border-color); border-radius: 7px; padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.hi__check { display: flex; align-items: center; gap: 4px; font-size: 11.5px; }
.hi__expList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.hi__exp { border: 1px solid var(--border-color); border-radius: 7px; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.hi__expMain { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.hi__boundary { margin: 0; font-size: 11px; color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.45); border-radius: 7px; padding: 6px 9px; }
</style>
