<!-- overlay/custom/client/ia2/views/gov/SecAuditPanel.vue
     安全审计工作台（2026-10-21 Cloudflare security-audit-skill 吸收）：
     项目/运行/覆盖账本/候选与三态裁决/报告期复核/目标中立报告。
     设计口径：账本先回答"哪些面根本没看"；裁决后端硬约束（自证拒绝/confirmed 门槛/纵深归口）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createProject, fetchCatalog, fetchProjects, finalizeRun, recordReview, startRun, submitCandidate, verifyFinding,
  type AuditProjectView, type FindingStatus, type FindingView, type SurfaceDef,
} from '../../api/sec-audit'

const catalog = ref<SurfaceDef[]>([])
const projects = ref<AuditProjectView[]>([])
const activeProjectId = ref<string>('')
const loading = ref(false)
const error = ref('')
const reportMd = ref('')

const newProjectName = ref('')
const candidateForm = ref({ surfaceClass: 'tool_exec', title: '', detail: '', traceChain: '', observation: '', author: '' })
const verifyForm = ref({ findingId: '', verifier: '', status: 'confirmed' as FindingStatus, severity: 'high', unknownFact: '', refutation: '', defenseInDepth: false })
const reviewForm = ref({ findingId: '', reviewer: '', outcome: 'verified' as 'verified' | 'replaced' })

const activeProject = computed(() => projects.value.find((p) => p.projectId === activeProjectId.value) ?? null)
const latestRun = computed(() => {
  const runs = activeProject.value?.runs ?? []
  return runs.length > 0 ? runs[runs.length - 1] : null
})

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [c, p] = await Promise.all([fetchCatalog(), fetchProjects()])
    catalog.value = c.catalog
    projects.value = p.projects
    if (!activeProjectId.value && p.projects.length > 0) activeProjectId.value = p.projects[0].projectId
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function onCreateProject(): Promise<void> {
  if (!newProjectName.value.trim()) return
  error.value = ''
  try {
    const p = await createProject({ name: newProjectName.value.trim(), target: { kind: 'agent-deployment' } })
    newProjectName.value = ''
    activeProjectId.value = p.projectId
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function onStartRun(): Promise<void> {
  if (!activeProjectId.value) return
  error.value = ''
  try {
    await startRun(activeProjectId.value)
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function onSubmitCandidate(): Promise<void> {
  if (!activeProjectId.value) return
  error.value = ''
  try {
    await submitCandidate(activeProjectId.value, {
      surfaceClass: candidateForm.value.surfaceClass as never,
      title: candidateForm.value.title,
      detail: candidateForm.value.detail,
      ...(candidateForm.value.traceChain ? { traceChain: candidateForm.value.traceChain } : {}),
      ...(candidateForm.value.observation ? { observation: candidateForm.value.observation } : {}),
      author: candidateForm.value.author,
    })
    candidateForm.value = { surfaceClass: candidateForm.value.surfaceClass, title: '', detail: '', traceChain: '', observation: '', author: candidateForm.value.author }
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function onVerify(): Promise<void> {
  if (!activeProjectId.value || !verifyForm.value.findingId) return
  error.value = ''
  try {
    await verifyFinding(activeProjectId.value, verifyForm.value.findingId, {
      verifier: verifyForm.value.verifier,
      status: verifyForm.value.status,
      ...(verifyForm.value.status === 'confirmed' ? { severity: verifyForm.value.severity as never } : {}),
      ...(verifyForm.value.unknownFact ? { unknownFact: verifyForm.value.unknownFact } : {}),
      ...(verifyForm.value.refutation ? { refutation: verifyForm.value.refutation } : {}),
      ...(verifyForm.value.defenseInDepth ? { defenseInDepth: true } : {}),
    })
    verifyForm.value.findingId = ''
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function onRecordReview(): Promise<void> {
  if (!activeProjectId.value || !reviewForm.value.findingId) return
  error.value = ''
  try {
    await recordReview(activeProjectId.value, reviewForm.value.findingId, {
      reviewer: reviewForm.value.reviewer,
      outcome: reviewForm.value.outcome,
    })
    reviewForm.value.findingId = ''
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function onFinalize(): Promise<void> {
  if (!activeProjectId.value || !latestRun.value) return
  error.value = ''
  try {
    const r = await finalizeRun(activeProjectId.value, latestRun.value.runId)
    reportMd.value = r.markdown
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function pickFinding(f: FindingView, mode: 'verify' | 'review'): void {
  if (mode === 'verify') verifyForm.value.findingId = f.findingId
  else reviewForm.value.findingId = f.findingId
}

function statusLabel(s: FindingStatus): string {
  if (s === 'confirmed') return '已确认'
  if (s === 'rejected') return '已否决'
  return '待验证'
}

function coverageLabel(s: 'full' | 'partial' | 'unchecked'): string {
  if (s === 'full') return '已充分检查'
  if (s === 'partial') return '部分检查'
  return '未检查'
}

onMounted(refresh)
</script>

<template>
  <div class="secaudit" data-testid="sec-audit-panel">
    <header class="secaudit__bar">
      <div>
        <h3 class="secaudit__title">安全审计</h3>
        <p class="secaudit__sub">六阶段流水线：覆盖账本 → 候选登记 → 三态裁决 → 独立复核 → 目标中立报告</p>
      </div>
      <button class="secaudit__btn" type="button" :disabled="loading" data-testid="sec-audit-refresh" @click="refresh">刷新</button>
    </header>

    <p v-if="error" class="secaudit__error" data-testid="sec-audit-error">{{ error }}</p>

    <section class="secaudit__row">
      <div class="secaudit__card">
        <h4>项目</h4>
        <div class="secaudit__form">
          <input v-model="newProjectName" placeholder="新审计项目名" data-testid="sec-audit-new-project" />
          <button type="button" data-testid="sec-audit-create-project" @click="onCreateProject">创建</button>
        </div>
        <ul class="secaudit__list" data-testid="sec-audit-projects">
          <li v-for="p in projects" :key="p.projectId">
            <button type="button" class="secaudit__link" :class="{ 'is-active': p.projectId === activeProjectId }" @click="activeProjectId = p.projectId">
              {{ p.name }} · {{ p.findings.length }} 发现 · {{ p.runs.length }} 轮
            </button>
          </li>
        </ul>
        <button v-if="activeProject" type="button" class="secaudit__btn" data-testid="sec-audit-start-run" @click="onStartRun">开跑一轮</button>
      </div>

      <div v-if="activeProject" class="secaudit__card">
        <h4>覆盖账本（最新一轮）</h4>
        <template v-if="latestRun?.ledger">
          <p class="secaudit__meta">
            覆盖率 {{ (latestRun.ledger.summary.coverageRatio * 100).toFixed(0) }}%
            · 已充分 {{ latestRun.ledger.summary.full }} / 部分 {{ latestRun.ledger.summary.partial }} / 未查 {{ latestRun.ledger.summary.unchecked }}
            · 批评者 {{ latestRun.ledger.critic.length }} 条
          </p>
          <ul class="secaudit__list secaudit__list--tight" data-testid="sec-audit-coverage">
            <li v-for="e in latestRun.ledger.entries" :key="e.id" :class="`cov-${e.status}`">
              <strong>{{ catalog.find((c) => c.class === e.surfaceClass)?.name ?? e.surfaceClass }}</strong>
              <span class="secaudit__tag">{{ coverageLabel(e.status) }}</span>
              <span v-if="e.autoFindingCount !== undefined" class="secaudit__meta">自动 {{ e.autoFindingCount }} 条</span>
              <span v-if="e.evidenceSummary" class="secaudit__meta">{{ e.evidenceSummary }}</span>
              <span v-if="e.partialReason" class="secaudit__warn">{{ e.partialReason }}</span>
            </li>
          </ul>
          <details v-if="latestRun.ledger.critic.length > 0" class="secaudit__critic" data-testid="sec-audit-critic">
            <summary>覆盖批评者（{{ latestRun.ledger.critic.length }}）</summary>
            <ul>
              <li v-for="c in latestRun.ledger.critic" :key="c.id">[{{ c.kind }}] {{ c.detail }}</li>
            </ul>
          </details>
        </template>
        <p v-else class="secaudit__meta">尚未开跑。开跑后自动采集器与人工登记的证据会入账。</p>
      </div>
    </section>

    <section v-if="activeProject" class="secaudit__row">
      <div class="secaudit__card">
        <h4>候选登记</h4>
        <div class="secaudit__form secaudit__form--col">
          <select v-model="candidateForm.surfaceClass" data-testid="sec-audit-cand-surface">
            <option v-for="c in catalog" :key="c.class" :value="c.class">{{ c.name }}</option>
          </select>
          <input v-model="candidateForm.title" placeholder="标题（一句话说清发现）" data-testid="sec-audit-cand-title" />
          <input v-model="candidateForm.author" placeholder="发现者（agent 名或人名）" data-testid="sec-audit-cand-author" />
          <textarea v-model="candidateForm.detail" placeholder="详情" rows="2" data-testid="sec-audit-cand-detail" />
          <input v-model="candidateForm.traceChain" placeholder="完整追踪链（confirmed 必填）" data-testid="sec-audit-cand-trace" />
          <input v-model="candidateForm.observation" placeholder="有界观察（confirmed 必填）" data-testid="sec-audit-cand-obs" />
          <button type="button" data-testid="sec-audit-cand-submit" @click="onSubmitCandidate">登记候选</button>
        </div>
      </div>

      <div class="secaudit__card">
        <h4>三态裁决 / 记录复核</h4>
        <div class="secaudit__form secaudit__form--col">
          <input v-model="verifyForm.findingId" placeholder="findingId（点下面发现行带入）" data-testid="sec-audit-verify-id" />
          <input v-model="verifyForm.verifier" placeholder="验证者（不得是发现者）" data-testid="sec-audit-verify-verifier" />
          <select v-model="verifyForm.status" data-testid="sec-audit-verify-status">
            <option value="confirmed">已确认</option>
            <option value="needs_validation">待验证</option>
            <option value="rejected">已否决</option>
          </select>
          <select v-if="verifyForm.status === 'confirmed'" v-model="verifyForm.severity" data-testid="sec-audit-verify-severity">
            <option value="high">高危</option>
            <option value="medium">中危</option>
            <option value="low">低危</option>
          </select>
          <input v-if="verifyForm.status === 'needs_validation'" v-model="verifyForm.unknownFact" placeholder="未解事实（必填）" data-testid="sec-audit-verify-unknown" />
          <input v-if="verifyForm.status === 'rejected'" v-model="verifyForm.refutation" placeholder="证伪理由（必填）" data-testid="sec-audit-verify-refutation" />
          <label class="secaudit__check">
            <input v-model="verifyForm.defenseInDepth" type="checkbox" data-testid="sec-audit-verify-did" />
            纵深防御缺口（只算加固建议，不算漏洞）
          </label>
          <button type="button" data-testid="sec-audit-verify-submit" @click="onVerify">裁决</button>
        </div>
        <hr />
        <div class="secaudit__form secaudit__form--col">
          <input v-model="reviewForm.findingId" placeholder="findingId（报告期复核）" data-testid="sec-audit-review-id" />
          <input v-model="reviewForm.reviewer" placeholder="复核者（不得是发现者）" data-testid="sec-audit-review-reviewer" />
          <select v-model="reviewForm.outcome" data-testid="sec-audit-review-outcome">
            <option value="verified">已核实</option>
            <option value="replaced">已替换</option>
          </select>
          <button type="button" data-testid="sec-audit-review-submit" @click="onRecordReview">记录复核</button>
          <button v-if="latestRun && latestRun.status === 'open'" type="button" class="secaudit__btn" data-testid="sec-audit-finalize" @click="onFinalize">出报告</button>
        </div>
      </div>
    </section>

    <section v-if="activeProject" class="secaudit__card">
      <h4>发现（{{ activeProject.findings.length }}）</h4>
      <ul class="secaudit__list" data-testid="sec-audit-findings">
        <li v-for="f in activeProject.findings" :key="f.findingId">
          <div class="secaudit__finding">
            <strong>{{ f.candidate.title }}</strong>
            <span class="secaudit__tag" :class="`st-${f.status}`">{{ statusLabel(f.status) }}</span>
            <span v-if="f.severity" class="secaudit__tag">严重性 {{ f.severity }}</span>
            <span v-if="f.defenseInDepth" class="secaudit__tag">加固建议</span>
            <span class="secaudit__meta">{{ catalog.find((c) => c.class === f.candidate.surfaceClass)?.name ?? f.candidate.surfaceClass }}</span>
            <span class="secaudit__meta">发现 {{ f.candidate.author }}<template v-if="f.decidedBy"> · 裁决 {{ f.decidedBy }}</template></span>
            <span class="secaudit__actions">
              <button type="button" class="secaudit__link" @click="pickFinding(f, 'verify')">裁决</button>
              <button type="button" class="secaudit__link" @click="pickFinding(f, 'review')">复核</button>
            </span>
          </div>
          <div v-if="f.unknownFact" class="secaudit__meta">未解事实：{{ f.unknownFact }}</div>
          <div v-if="f.refutation" class="secaudit__meta">证伪：{{ f.refutation }}</div>
        </li>
      </ul>
    </section>

    <section v-if="reportMd" class="secaudit__card">
      <h4>目标中立报告（Markdown）</h4>
      <pre class="secaudit__report" data-testid="sec-audit-report">{{ reportMd }}</pre>
    </section>
  </div>
</template>

<style scoped lang="scss">
.secaudit { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px; overflow: auto; }
.secaudit__bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.secaudit__title { margin: 0; font-size: 14px; font-weight: 600; }
.secaudit__sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted); }
.secaudit__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.secaudit__card { border: 1px solid var(--border-subtle, rgba(255,255,255,.08)); border-radius: 8px; padding: 10px 12px; }
.secaudit__card h4 { margin: 0 0 8px; font-size: 12.5px; }
.secaudit__form { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.secaudit__form--col { flex-direction: column; align-items: stretch; }
.secaudit__form input, .secaudit__form select, .secaudit__form textarea {
  font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-subtle, rgba(255,255,255,.12));
  background: var(--bg-input, transparent); color: inherit;
}
.secaudit__btn, .secaudit__form button {
  font: inherit; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-subtle, rgba(255,255,255,.16));
  background: var(--bg-hover, rgba(255,255,255,.06)); color: inherit; cursor: pointer;
}
.secaudit__link { background: none; border: none; color: var(--accent, #6cf); cursor: pointer; font: inherit; padding: 0; text-align: left; }
.secaudit__link.is-active { font-weight: 700; text-decoration: underline; }
.secaudit__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.secaudit__list--tight { gap: 3px; font-size: 12px; }
.secaudit__list li { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.secaudit__finding { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.secaudit__tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--bg-hover, rgba(255,255,255,.08)); }
.secaudit__tag.st-confirmed { background: rgba(255, 80, 80, .18); }
.secaudit__tag.st-rejected { background: rgba(120, 220, 120, .18); }
.secaudit__meta { font-size: 11px; color: var(--text-muted); }
.secaudit__warn { font-size: 11px; color: var(--warn, #fc6); }
.secaudit__error { color: var(--error, #f66); font-size: 12px; }
.secaudit__critic { margin-top: 6px; font-size: 11.5px; }
.secaudit__critic summary { cursor: pointer; color: var(--warn, #fc6); }
.secaudit__check { display: flex; gap: 6px; align-items: center; font-size: 12px; }
.secaudit__report { white-space: pre-wrap; font-size: 11.5px; margin: 0; }
.secaudit__actions { display: inline-flex; gap: 8px; }
.cov-unchecked { color: var(--error, #f66); }
.cov-partial { color: var(--warn, #fc6); }
</style>
