<!-- overlay/custom/client/ia2/views/gov/ReviewGovPanel.vue -->
<!-- ⑥治理·评审治理页签（2026-10-19 评审治理批）。
     来源：Anthropic《How the Claude Code team does code review》2026-10-15。
     一屏四段：熔断状态 → 评审度量 → 风险档策略 → 案例与发现项。
     数据面只读为主，动作只做治理闭环必需的：记录回滚/事故、登记案例、加发现项、
     回答/验证、记录人工审批、上报检查、标记合并。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  addFinding, answerFinding, caseRow, fetchCase, fetchCases, fetchMetrics, fetchPolicy,
  kpiCards, mergeCase, openCase, openFindings, recordApproval, recordSignal, setChecks, tierRows,
  verifyFinding,
  type BreakerView, type CaseDetail, type FindingSeverity, type Resolution, type ReviewCaseView,
  type ReviewMetricsView, type ReviewPolicyView,
} from '../../api/review-gov'

const loading = ref(false)
const error = ref('')
const policy = ref<ReviewPolicyView | null>(null)
const breaker = ref<BreakerView | null>(null)
const metrics = ref<ReviewMetricsView | null>(null)
const cases = ref<ReviewCaseView[]>([])
const selectedId = ref('')
const detail = ref<CaseDetail | null>(null)

// 登记案例表单
const form = ref({
  title: '',
  author: '',
  headCommit: '',
  paths: '',
  diffLines: 20,
  behindFlag: false,
})
const creating = ref(false)

// 加发现项表单
const findingForm = ref({
  file: '',
  line: 1,
  body: '',
  severity: 'important' as FindingSeverity,
  bugClass: '',
  evidence: '',
})
const addingFinding = ref(false)

const kpis = computed(() => (metrics.value ? kpiCards(metrics.value) : []))
const tiers = computed(() => (policy.value ? tierRows(policy.value) : []))
const rows = computed(() => cases.value.map((c) => caseRow(c, policy.value?.convergence.maxRounds ?? 3)))
const findings = computed(() => (detail.value ? openFindings(detail.value.case) : []))
const deferred = computed(() => (detail.value ? detail.value.case.findings.filter((f) => f.deferred) : []))
const selected = computed(() => detail.value?.case ?? null)
const readiness = computed(() => detail.value?.readiness ?? null)

const TIER_ZH = { low: '低风险', medium: '中风险', high: '高风险' } as const
const STATE_ZH = { open: '评审中', ready: '可合并', merged: '已合并', abandoned: '已放弃' } as const
const CHECK_ZH = { green: '全绿', red: '未通过', unknown: '未上报' } as const
const selectedTier = computed(() => (selected.value ? TIER_ZH[selected.value.risk.tier] : ''))
const selectedState = computed(() => (selected.value ? STATE_ZH[selected.value.state] : ''))
const selectedChecks = computed(() => (selected.value ? CHECK_ZH[selected.value.checks] : ''))

async function run(fn: () => Promise<void>): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function loadAll(): Promise<void> {
  await run(async () => {
    const [p, list, m] = await Promise.all([fetchPolicy(), fetchCases({ limit: 200 }), fetchMetrics()])
    policy.value = p.policy
    breaker.value = p.breaker
    cases.value = list
    metrics.value = m
    const first = selectedId.value || list[0]?.caseId
    if (first) await select(first)
  })
}

async function select(caseId: string): Promise<void> {
  selectedId.value = caseId
  detail.value = await fetchCase(caseId)
}

async function refreshLight(): Promise<void> {
  const [list, m, p] = await Promise.all([fetchCases({ limit: 200 }), fetchMetrics(), fetchPolicy()])
  cases.value = list
  metrics.value = m
  policy.value = p.policy
  breaker.value = p.breaker
  if (selectedId.value) detail.value = await fetchCase(selectedId.value)
}

async function onSignal(kind: 'revert' | 'incident'): Promise<void> {
  await run(async () => {
    await recordSignal(kind, kind === 'revert' ? '治理页手工登记回滚' : '治理页手工登记事故')
    await refreshLight()
  })
}

async function onCreateCase(): Promise<void> {
  const f = form.value
  if (!f.title.trim()) { error.value = '案例标题必填'; return }
  creating.value = true
  await run(async () => {
    const changedPaths = f.paths.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    const res = await openCase({
      caseId: `ui-${Date.now().toString(36)}`,
      title: f.title.trim(),
      author: f.author.trim() || undefined,
      headCommit: f.headCommit.trim() || undefined,
      changedPaths,
      diffLines: f.diffLines,
      behindFlag: f.behindFlag,
    })
    selectedId.value = res.case.caseId
    detail.value = res
    form.value = { title: '', author: '', headCommit: '', paths: '', diffLines: 20, behindFlag: false }
    await refreshLight()
  })
  creating.value = false
}

async function onAddFinding(): Promise<void> {
  if (!selected.value) return
  const f = findingForm.value
  if (!f.file.trim() || !f.body.trim()) { error.value = '文件与问题描述必填'; return }
  addingFinding.value = true
  await run(async () => {
    const res = await addFinding(selected.value!.caseId, {
      file: f.file.trim(),
      line: Number(f.line) || 1,
      body: f.body.trim(),
      severity: f.severity,
      bugClass: f.bugClass.trim() || undefined,
      evidence: f.evidence.trim() || undefined,
      authorKind: 'agent',
    })
    detail.value = res
    findingForm.value = { file: '', line: 1, body: '', severity: 'important', bugClass: '', evidence: '' }
    await refreshLight()
  })
  addingFinding.value = false
}

async function onAnswer(findingId: string, resolution: Resolution): Promise<void> {
  if (!selected.value) return
  await run(async () => {
    detail.value = await answerFinding(selected.value!.caseId, findingId, resolution)
    await refreshLight()
  })
}

async function onVerify(findingId: string): Promise<void> {
  if (!selected.value) return
  await run(async () => {
    detail.value = await verifyFinding(selected.value!.caseId, findingId, 'confirm', 'ui-verifier')
    await refreshLight()
  })
}

async function onApprove(): Promise<void> {
  if (!selected.value) return
  await run(async () => {
    detail.value = await recordApproval(selected.value!.caseId, {
      actorKind: 'human',
      decision: 'approve',
      commit: selected.value!.headCommit,
      note: '治理页人工审批',
    })
    await refreshLight()
  })
}

async function onChecks(): Promise<void> {
  if (!selected.value) return
  await run(async () => {
    detail.value = await setChecks(selected.value!.caseId, 'green')
    await refreshLight()
  })
}

async function onMerge(): Promise<void> {
  if (!selected.value) return
  await run(async () => {
    detail.value = await mergeCase(selected.value!.caseId)
    await refreshLight()
  })
}

onMounted(() => { void loadAll() })
</script>

<template>
  <section class="rg" data-testid="review-gov">
    <header class="rg__head">
      <div>
        <h4 class="rg__title">评审治理</h4>
        <p class="rg__sub">
          按改动风险分配人工审批，Agent 审批不占名额；互审最多 3 轮，第 3 轮起只看新增 diff；
          回滚率或事故抬头时自动收紧审批。口径见 Anthropic 工程博客（2026-10-15）。
        </p>
      </div>
      <div class="rg__head-actions">
        <button class="rg__btn" :disabled="loading" data-testid="rg-refresh" @click="loadAll">刷新</button>
      </div>
    </header>

    <p v-if="error" class="rg__error" data-testid="rg-error">{{ error }}</p>

    <!-- 熔断状态 -->
    <div v-if="breaker" class="rg__breaker" :class="breaker.active ? 'is-warn' : 'is-ok'" data-testid="rg-breaker">
      <div class="rg__breaker-main">
        <span class="rg__badge">{{ breaker.active ? '已收紧' : '正常' }}</span>
        <span class="rg__breaker-text">
          窗口 {{ breaker.windowHours }}h：合并 {{ breaker.merges }} · 回滚 {{ breaker.reverts }} ·
          事故 {{ breaker.incidents }}
          <template v-if="breaker.revertRate !== null"> · 回滚率 {{ (breaker.revertRate * 100).toFixed(1) }}%</template>
        </span>
      </div>
      <div class="rg__breaker-actions">
        <button class="rg__btn rg__btn--danger" :disabled="loading" @click="onSignal('revert')">记录回滚</button>
        <button class="rg__btn rg__btn--danger" :disabled="loading" @click="onSignal('incident')">记录事故</button>
      </div>
      <p v-if="breaker.active && breaker.reasons.length" class="rg__breaker-reasons">
        {{ breaker.reasons.join('；') }}。熔断期间风险档自动升一档，低风险快速通道关闭。
      </p>
    </div>

    <!-- 度量 -->
    <div class="rg__kpis">
      <div
        v-for="k in kpis"
        :key="k.key"
        class="rg__kpi"
        :class="`is-${k.state}`"
        :data-testid="`rg-kpi-${k.key}`"
      >
        <div class="rg__kpi-label">{{ k.label }}</div>
        <div class="rg__kpi-value">{{ k.value }}</div>
        <div class="rg__kpi-detail">{{ k.detail }}</div>
      </div>
      <p v-if="!kpis.length && !loading" class="rg__hint">暂无度量数据；登记第一个评审案例后开始累计。</p>
    </div>

    <!-- 策略 -->
    <section v-if="policy" class="rg__card" data-testid="rg-policy">
      <h5 class="rg__card-title">风险档与审批名额</h5>
      <table class="rg__table">
        <thead>
          <tr><th>档位</th><th>人工审批</th><th>典型改动</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in tiers" :key="t.tier" :data-testid="`rg-tier-${t.tier}`">
            <td><span class="rg__tier" :class="`is-${t.tier}`">{{ t.label }}</span></td>
            <td>{{ t.approvals }}</td>
            <td>{{ t.examples }}</td>
          </tr>
        </tbody>
      </table>
      <p class="rg__meta">
        收敛：最多 {{ policy.convergence.maxRounds }} 轮 · 第 {{ policy.convergence.diffOnlyAfterRound + 1 }} 轮起只看新增 diff ·
        每轮 nit 上限 {{ policy.convergence.nitBudgetPerRound }} 条 ·
        熔断窗口 {{ policy.circuitBreaker.windowHours }}h（回滚率 &gt; {{ (policy.circuitBreaker.revertRateThreshold * 100).toFixed(1) }}% 或事故 ≥ {{ policy.circuitBreaker.incidentCountThreshold }} 起）。
      </p>
      <details class="rg__details">
        <summary>受保护路径（永远 2 人）与敏感路径（至少 1 人）</summary>
        <p class="rg__paths"><strong>受保护：</strong>{{ policy.protectedPaths.join('、') }}</p>
        <p class="rg__paths"><strong>敏感：</strong>{{ policy.sensitivePaths.join('、') }}</p>
      </details>
    </section>

    <div class="rg__cols">
      <!-- 案例列表 -->
      <section class="rg__card rg__cases" data-testid="rg-cases">
        <h5 class="rg__card-title">评审案例 <span class="rg__count">{{ rows.length }}</span></h5>
        <p v-if="!rows.length" class="rg__hint">暂无案例。展开下方「登记评审案例」开始。</p>
        <button
          v-for="r in rows"
          :key="r.caseId"
          class="rg__case"
          :class="{ 'is-active': r.caseId === selectedId }"
          :data-testid="`rg-case-${r.caseId}`"
          @click="select(r.caseId)"
        >
          <span class="rg__tier" :class="`is-${r.tier}`">{{ r.tierLabel }}</span>
          <span class="rg__case-title">{{ r.title }}</span>
          <span class="rg__case-meta">轮次 {{ r.roundText }} · {{ r.findingsText }} · 审批 {{ r.approvalText }} · {{ r.stateLabel }}</span>
        </button>

        <details class="rg__details rg__new">
          <summary>登记评审案例</summary>
          <div class="rg__form">
            <label>标题<input v-model="form.title" placeholder="例如：修复缓存穿透" /></label>
            <label>提交<input v-model="form.headCommit" placeholder="head commit（可选）" /></label>
            <label>作者<input v-model="form.author" placeholder="author（可选）" /></label>
            <label class="rg__wide">变更路径<textarea v-model="form.paths" rows="3" placeholder="每行一个，例如 packages/server/src/cache/x.ts" /></label>
            <label>diff 行数<input v-model.number="form.diffLines" type="number" min="0" /></label>
            <label class="rg__check"><input v-model="form.behindFlag" type="checkbox" /> 藏在特性开关后</label>
            <button class="rg__btn rg__btn--primary rg__wide" :disabled="creating" @click="onCreateCase">登记</button>
          </div>
        </details>
      </section>

      <!-- 案例详情 -->
      <section class="rg__card rg__detail" data-testid="rg-detail">
        <p v-if="!selected" class="rg__hint">选择左侧案例查看详情。</p>
        <template v-else>
          <div class="rg__detail-head">
            <h5 class="rg__card-title">{{ selected.title }}</h5>
            <span class="rg__tier" :class="`is-${selected.risk.tier}`">{{ selectedTier }}</span>
            <span class="rg__state">{{ selectedState }}</span>
          </div>
          <p class="rg__meta">
            第 {{ selected.rounds.length }}/{{ policy?.convergence.maxRounds ?? 3 }} 轮 ·
            提交 {{ selected.headCommit || '未绑定' }} ·
            检查 {{ selectedChecks }} ·
            人工审批 {{ readiness?.humanApprovals ?? 0 }}/{{ readiness?.requiredHumanApprovals ?? 0 }}
            · Agent 审批 {{ readiness?.agentApprovals ?? 0 }}
          </p>
          <p class="rg__reasons" data-testid="rg-risk-reasons">{{ selected.risk.reasons.join('；') }}</p>
          <p v-if="readiness" class="rg__blockers" :class="{ 'is-ready': readiness.ready }" data-testid="rg-readiness">
            {{ readiness.ready ? '合并就绪：人工审批、自动检查与阻塞发现均满足。' : `未就绪：${readiness.blockers.join('；')}` }}
          </p>

          <div class="rg__actions">
            <button class="rg__btn" :disabled="loading" @click="onApprove">记录我的审批</button>
            <button class="rg__btn" :disabled="loading" @click="onChecks">标记检查全绿</button>
            <button class="rg__btn rg__btn--primary" :disabled="loading || !readiness?.ready || selected.state === 'merged'" @click="onMerge">标记合并</button>
          </div>

          <details class="rg__details" open>
            <summary>未决发现项（{{ findings.length }}）</summary>
            <p v-if="!findings.length" class="rg__hint">没有未决发现项。</p>
            <div v-for="f in findings" :key="f.findingId" class="rg__finding" :data-testid="`rg-finding-${f.findingId}`">
              <div class="rg__finding-head">
                <span class="rg__sev" :class="`is-${f.severity}`">{{ f.severity }}</span>
                <code class="rg__loc">{{ f.file }}:{{ f.line }}</code>
                <span class="rg__finding-round">第 {{ f.round }} 轮</span>
              </div>
              <p class="rg__finding-body">{{ f.body }}</p>
              <p v-if="f.evidence" class="rg__evidence">证据：{{ f.evidence }}</p>
              <p class="rg__finding-meta">
                验证 {{ f.verifications.filter(v => v.vote === 'confirm').length }} 确认 /
                {{ f.verifications.filter(v => v.vote === 'reject').length }} 反对
                <template v-if="f.duplicateCount"> · 去重 {{ f.duplicateCount }} 次</template>
              </p>
              <div class="rg__finding-actions">
                <button class="rg__btn rg__btn--mini" :disabled="loading" @click="onVerify(f.findingId)">验证确认</button>
                <button class="rg__btn rg__btn--mini" :disabled="loading" @click="onAnswer(f.findingId, 'fixed')">已修复</button>
                <button class="rg__btn rg__btn--mini" :disabled="loading" @click="onAnswer(f.findingId, 'wrong')">误报</button>
                <button class="rg__btn rg__btn--mini" :disabled="loading" @click="onAnswer(f.findingId, 'intentional')">有意为之</button>
                <button class="rg__btn rg__btn--mini" :disabled="loading" @click="onAnswer(f.findingId, 'didnt_matter')">无关紧要</button>
              </div>
            </div>
          </details>

          <details v-if="deferred.length" class="rg__details">
            <summary>延后队列（{{ deferred.length }}）：存量问题与超预算 nit</summary>
            <div v-for="f in deferred" :key="f.findingId" class="rg__finding is-deferred">
              <div class="rg__finding-head">
                <span class="rg__sev" :class="`is-${f.severity}`">{{ f.severity }}</span>
                <code class="rg__loc">{{ f.file }}:{{ f.line }}</code>
              </div>
              <p class="rg__finding-body">{{ f.body }}</p>
              <p class="rg__finding-meta">{{ f.deferredReason }}</p>
            </div>
          </details>

          <details class="rg__details">
            <summary>加一条发现项（Agent 评审回流）</summary>
            <div class="rg__form">
              <label>文件<input v-model="findingForm.file" placeholder="packages/server/src/x.ts" /></label>
              <label>行号<input v-model.number="findingForm.line" type="number" min="1" /></label>
              <label>严重级
                <select v-model="findingForm.severity">
                  <option value="important">important</option>
                  <option value="nit">nit</option>
                  <option value="preexisting">preexisting</option>
                </select>
              </label>
              <label>bug 类<input v-model="findingForm.bugClass" placeholder="null-deref（可空）" /></label>
              <label class="rg__wide">问题描述<textarea v-model="findingForm.body" rows="2" /></label>
              <label class="rg__wide">证据（important 必填）<input v-model="findingForm.evidence" placeholder="npm test 输出 / 截图引用" /></label>
              <button class="rg__btn rg__btn--primary rg__wide" :disabled="addingFinding" @click="onAddFinding">入库</button>
            </div>
          </details>
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.rg { display: flex; flex-direction: column; gap: 10px; }
.rg__head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.rg__title { margin: 0; font-size: 13px; font-weight: 600; }
.rg__sub { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); max-width: 680px; }
.rg__head-actions { margin-left: auto; }
.rg__error { color: var(--error); font-size: 12px; margin: 0; word-break: break-all; }
.rg__hint { font-size: 12px; color: var(--text-muted); margin: 0; }

.rg__breaker { border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.rg__breaker.is-ok { border-left: 3px solid var(--success); }
.rg__breaker.is-warn { border-left: 3px solid var(--error); background: color-mix(in srgb, var(--error) 6%, transparent); }
.rg__breaker-main { display: flex; align-items: center; gap: 8px; }
.rg__breaker-actions { margin-left: auto; display: flex; gap: 6px; }
.rg__breaker-reasons { flex-basis: 100%; margin: 0; font-size: 11px; color: var(--text-muted); }
.rg__badge { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 999px; border: 1px solid currentColor; }
.is-ok .rg__badge { color: var(--success); }
.is-warn .rg__badge { color: var(--error); }
.rg__breaker-text { font-size: 12px; }

.rg__kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 1200px) { .rg__kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.rg__kpi { border: 1px solid var(--border-color); border-top: 3px solid var(--border-color); border-radius: 8px; padding: 7px 9px; }
.rg__kpi.is-ok { border-top-color: var(--success); }
.rg__kpi.is-warn { border-top-color: var(--error); }
.rg__kpi.is-muted { border-top-color: var(--text-muted); }
.rg__kpi-label { font-size: 11px; font-weight: 700; }
.rg__kpi-value { font-size: 16px; font-weight: 700; margin-top: 1px; }
.rg__kpi.is-warn .rg__kpi-value { color: var(--error); }
.rg__kpi.is-ok .rg__kpi-value { color: var(--success); }
.rg__kpi-detail { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

.rg__cols { display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.6fr); gap: 10px; align-items: start; }
@media (max-width: 1080px) { .rg__cols { grid-template-columns: 1fr; } }
.rg__card { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); display: flex; flex-direction: column; gap: 8px; }
.rg__card-title { margin: 0; font-size: 13px; font-weight: 600; }
.rg__count { color: var(--text-muted); font-weight: 400; }
.rg__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rg__table th, .rg__table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.rg__table th { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.rg__tier { display: inline-block; font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 999px; border: 1px solid currentColor; }
.rg__tier.is-low { color: var(--success); }
.rg__tier.is-medium { color: var(--warning, #b45309); }
.rg__tier.is-high { color: var(--error); }
.rg__meta { margin: 0; font-size: 11px; color: var(--text-muted); }
.rg__details { font-size: 12px; }
.rg__details summary { cursor: pointer; color: var(--text-muted); }
.rg__paths { margin: 4px 0 0; font-size: 11px; color: var(--text-muted); word-break: break-all; }

.rg__cases { max-height: 640px; overflow: auto; }
.rg__case { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; text-align: left; border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 8px; background: transparent; cursor: pointer; color: inherit; }
.rg__case.is-active { border-color: var(--primary, var(--text-muted)); background: color-mix(in srgb, var(--primary, #888) 8%, transparent); }
.rg__case-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg__case-meta { grid-column: 2; font-size: 10.5px; color: var(--text-muted); }

.rg__detail { min-height: 240px; }
.rg__detail-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rg__state { font-size: 11px; color: var(--text-muted); }
.rg__reasons { margin: 0; font-size: 11px; color: var(--text-muted); }
.rg__blockers { margin: 0; font-size: 12px; color: var(--error); }
.rg__blockers.is-ready { color: var(--success); }
.rg__actions { display: flex; gap: 6px; flex-wrap: wrap; }

.rg__finding { border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.rg__finding.is-deferred { opacity: 0.75; }
.rg__finding-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rg__sev { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 0 5px; border-radius: 4px; border: 1px solid currentColor; }
.rg__sev.is-important { color: var(--error); }
.rg__sev.is-nit { color: var(--text-muted); }
.rg__sev.is-preexisting { color: var(--warning, #b45309); }
.rg__loc { font-size: 11px; }
.rg__finding-round { font-size: 10px; color: var(--text-muted); }
.rg__finding-body { margin: 0; font-size: 12px; }
.rg__evidence { margin: 0; font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.rg__finding-meta { margin: 0; font-size: 10.5px; color: var(--text-muted); }
.rg__finding-actions { display: flex; gap: 4px; flex-wrap: wrap; }

.rg__form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 4px; }
.rg__form label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-muted); }
.rg__form input, .rg__form textarea, .rg__form select { font: inherit; font-size: 12px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: inherit; }
.rg__wide { grid-column: 1 / -1; }
.rg__check { flex-direction: row !important; align-items: center; gap: 4px !important; }
.rg__new { margin-top: 2px; }

.rg__btn { font: inherit; font-size: 11px; padding: 3px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.rg__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rg__btn--primary { border-color: var(--primary, #2563eb); color: var(--primary, #2563eb); font-weight: 600; }
.rg__btn--danger { border-color: var(--error); color: var(--error); }
.rg__btn--mini { padding: 1px 6px; font-size: 10.5px; }
</style>
