<!-- overlay/custom/client/governance/components/PremiseLogSection.vue -->
<!-- 假设登记簿（2026-11-05 组织治理能力批）：承重判断的台账 + 到期队列 +
     被推翻 → 影响面 → 重评队列三步链路。
     纪律：影响面是读侧探测，探测根未识别时一律标"不可核验"，不把"探测不到"说成"已失联"。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  createPremise, fetchPremiseDue, fetchPremises, fetchReeval, refutePremise, resolveReeval,
  type ImpactReportDto, type PremiseDto, type PremiseKindDto, type ReevalItemDto,
} from '@/custom/governance/api/org-governance'

const KIND_TITLES: Record<PremiseKindDto, string> = {
  market: '市场', tech: '技术', org: '组织', cost: '成本', compliance: '合规',
}
const STATUS_TITLES: Record<string, string> = {
  hold: '成立中', pending: '待复核', refuted: '已推翻', expired: '已过期',
}

const entries = ref<PremiseDto[]>([])
const due = ref<{ premise: PremiseDto; overdueDays: number }[]>([])
const reeval = ref<ReevalItemDto[]>([])
const loading = ref(false)
const msg = ref('')
const errorMsg = ref('')

const impact = ref<{ report: ImpactReportDto; recognized: boolean; detail?: string } | null>(null)
const impactFor = ref('')

const form = reactive({
  statement: '',
  kind: 'market' as PremiseKindDto,
  scope: '',
  reviewAt: '',
  confidence: 'medium' as 'high' | 'medium' | 'low',
})

const refuteFor = ref('')
const refuteEvidence = ref('')
const dismissNote = ref('')

const refuted = computed(() => entries.value.filter((e) => e.status === 'refuted').length)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [list, d, r] = await Promise.all([fetchPremises(), fetchPremiseDue(), fetchReeval()])
    entries.value = list.entries
    due.value = d.rows
    reeval.value = r.items
  } catch (e) {
    errorMsg.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function defaultReviewAt(): string {
  const d = new Date(Date.now() + 90 * 86400000)
  return d.toISOString().slice(0, 10)
}

async function submit(): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  const reviewAtIso = form.reviewAt || defaultReviewAt()
  const ts = new Date(`${reviewAtIso}T00:00:00`).getTime()
  try {
    const res = await createPremise({
      statement: form.statement.trim(),
      kind: form.kind,
      scope: form.scope.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean),
      reviewAt: ts,
      confidence: form.confidence,
    })
    if (!res.ok) {
      errorMsg.value = (res.problems ?? ['登记被拒']).join('；')
      return
    }
    msg.value = `已登记：${res.entry?.id ?? ''}`
    form.statement = ''
    form.scope = ''
    await refresh()
  } catch (e) {
    errorMsg.value = `登记失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function doRefute(id: string): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  try {
    const res = await refutePremise(id, refuteEvidence.value.trim())
    if (!res.ok) {
      errorMsg.value = (res.problems ?? ['推翻被拒']).join('；')
      return
    }
    msg.value = `已推翻 ${id}，重评项已入队`
    refuteFor.value = ''
    refuteEvidence.value = ''
    await refresh()
  } catch (e) {
    errorMsg.value = `推翻失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function showImpact(id: string): Promise<void> {
  try {
    const { fetchPremiseImpact } = await import('@/custom/governance/api/org-governance')
    const res = await fetchPremiseImpact(id)
    impactFor.value = id
    impact.value = { report: res.report, recognized: res.probe.recognized, detail: res.probe.detail }
  } catch (e) {
    errorMsg.value = `影响面读取失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function resolve(id: string, state: 'done' | 'dismissed'): Promise<void> {
  try {
    const res = await resolveReeval(id, state, state === 'dismissed' ? dismissNote.value.trim() : '')
    if (!res.ok) {
      errorMsg.value = (res.problems ?? ['处置被拒']).join('；')
      return
    }
    dismissNote.value = ''
    await refresh()
  } catch (e) {
    errorMsg.value = `处置失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function day(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

onMounted(refresh)
</script>

<template>
  <div class="pl" data-testid="premise-log-section">
    <div class="pl__bar">
      <h3 class="pl__title">假设登记簿</h3>
      <span class="pl__hint">校准不是提高开会频率，是给每一条假设标上复核日期</span>
    </div>

    <div v-if="errorMsg" class="pl__err" data-testid="pl-error">{{ errorMsg }}</div>
    <div v-else-if="msg" class="pl__msg" data-testid="pl-msg">{{ msg }}</div>

    <div class="pl__stats">
      <span>在册 {{ entries.length }}</span>
      <span>到期 {{ due.length }}</span>
      <span>已推翻 {{ refuted }}</span>
      <span>待重评 {{ reeval.length }}</span>
    </div>

    <table class="pl__table" data-testid="pl-table">
      <thead><tr><th>陈述</th><th>类别</th><th>复核日</th><th>状态</th><th>影响面</th><th></th></tr></thead>
      <tbody>
        <tr v-for="e in entries" :key="e.id">
          <td class="pl__stmt" :title="e.statement">{{ e.statement }}</td>
          <td>{{ KIND_TITLES[e.kind] }}</td>
          <td>{{ day(e.reviewAt) }}</td>
          <td><span class="pl__status" :class="`is-${e.status}`">{{ STATUS_TITLES[e.status] }}</span></td>
          <td>{{ e.scope.length }} 项</td>
          <td class="pl__ops">
            <button type="button" class="pl__op" @click="showImpact(e.id)">影响面</button>
            <button v-if="e.status === 'hold' || e.status === 'pending'" type="button" class="pl__op pl__op--danger" @click="refuteFor = e.id">推翻</button>
          </td>
        </tr>
        <tr v-if="entries.length === 0 && !loading">
          <td colspan="6" class="ui-empty-state ui-empty-state--compact">
            尚无假设登记——「战略第一产物是假设清单」，没有清单说明还没有可被推翻的判断
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="refuteFor" class="pl__block">
      <div class="pl__block-title">推翻 {{ refuteFor }}（须带证据来源）</div>
      <div class="pl__row">
        <input v-model="refuteEvidence" class="pl__input" placeholder="证据：哪次复盘/哪个数据说明它不成立" data-testid="pl-evidence" />
        <button type="button" class="pl__save" @click="doRefute(refuteFor)">确认推翻</button>
        <button type="button" class="pl__cancel" @click="refuteFor = ''">取消</button>
      </div>
    </div>

    <div v-if="impact" class="pl__block" data-testid="pl-impact">
      <div class="pl__block-title">影响面 · {{ impactFor }}（失联 {{ impact.report.stale }} 项）</div>
      <div v-if="!impact.recognized" class="pl__warn">{{ impact.detail }}</div>
      <div v-for="a in impact.report.anchors" :key="a.anchor" class="pl__anchor">
        <span class="pl__anchor-shape">{{ a.shape }}</span>
        <span class="pl__anchor-name" :class="a.exists ? '' : 'is-stale'">{{ a.anchor }}</span>
        <span v-if="!a.exists" class="pl__stale">失联</span>
      </div>
    </div>

    <div v-if="due.length" class="pl__block" data-testid="pl-due">
      <div class="pl__block-title">到期队列（逾期最久的在前）</div>
      <div v-for="d in due.slice(0, 5)" :key="d.premise.id" class="pl__due-row">
        <span class="pl__due-days">逾期 {{ d.overdueDays }} 天</span>
        <span>{{ d.premise.statement }}</span>
      </div>
    </div>

    <div v-if="reeval.length" class="pl__block" data-testid="pl-reeval">
      <div class="pl__block-title">重评队列（dismissed 必带理由——无理由关闭等于把闭环重新切断）</div>
      <div v-for="r in reeval" :key="r.id" class="pl__reeval-row">
        <span class="pl__reeval-reason">{{ r.reason }}</span>
        <span class="pl__reeval-anchors">{{ r.anchors.length }} 个锚</span>
        <button type="button" class="pl__op" @click="resolve(r.id, 'done')">已处置</button>
        <input v-model="dismissNote" class="pl__input pl__input--note" placeholder="关闭理由" />
        <button type="button" class="pl__op pl__op--danger" @click="resolve(r.id, 'dismissed')">不处置</button>
      </div>
    </div>

    <form class="pl__form" data-testid="pl-form" @submit.prevent="submit">
      <div class="pl__block-title">登记假设（陈述须可被证伪；影响面必填）</div>
      <div class="pl__row">
        <input v-model="form.statement" class="pl__input" placeholder="陈述：谁/什么 在什么条件下 会怎样（须含数字或比较或时点）" data-testid="pl-statement" required />
      </div>
      <div class="pl__row">
        <select v-model="form.kind" class="pl__input pl__input--narrow">
          <option v-for="(t, k) in KIND_TITLES" :key="k" :value="k">{{ t }}</option>
        </select>
        <input v-model="form.scope" class="pl__input" placeholder="影响面（分号分隔：spec 文件名 / 域 / 端点 / 看板列）" data-testid="pl-scope" required />
      </div>
      <div class="pl__row">
        <label class="pl__chk">复核日 <input v-model="form.reviewAt" type="date" class="pl__input pl__input--date" :placeholder="defaultReviewAt()" /></label>
        <select v-model="form.confidence" class="pl__input pl__input--narrow">
          <option value="high">高置信</option>
          <option value="medium">中置信</option>
          <option value="low">低置信</option>
        </select>
        <button type="submit" class="pl__save" data-testid="pl-save">登记</button>
      </div>
    </form>
  </div>
</template>

<style scoped lang="scss">
.pl { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); display: flex; flex-direction: column; gap: 8px; }
.pl__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.pl__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.pl__hint { font-size: 10px; color: var(--warning); }
.pl__err { font-size: 11px; color: var(--error); }
.pl__msg { font-size: 11px; color: var(--success); }
.pl__stats { display: flex; gap: 14px; font-size: 10.5px; color: var(--text-muted); }
.pl__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); vertical-align: top; } }
.pl__stmt { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl__status { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-hold { color: var(--success); background: rgba(var(--success-rgb), 0.1); }
  &.is-pending { color: var(--warning); background: rgba(var(--warning-rgb), 0.12); }
  &.is-refuted { color: var(--error); background: rgba(var(--error-rgb), 0.1); }
  &.is-expired { color: var(--text-muted); background: var(--bg-secondary); } }
.pl__ops { white-space: nowrap; }
.pl__op { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--accent-primary); padding: 0 4px; }
.pl__op--danger { color: var(--error); }
.pl__block { border-top: 1px dashed var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.pl__block-title { font-size: 10.5px; font-weight: 600; }
.pl__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pl__input { border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); flex: 1; min-width: 150px; }
.pl__input--narrow { flex: 0; max-width: 120px; }
.pl__input--date { max-width: 150px; flex: 0; }
.pl__input--note { max-width: 160px; flex: 0; }
.pl__chk { font-size: 10.5px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; }
.pl__save { border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 11px; cursor: pointer; }
.pl__cancel { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--text-muted); }
.pl__warn { font-size: 10px; color: var(--warning); }
.pl__anchor { display: flex; gap: 8px; font-size: 10px; align-items: baseline; }
.pl__anchor-shape { color: var(--text-muted); font-size: 9px; min-width: 56px; }
.pl__anchor-name { font-family: ui-monospace, monospace; }
.pl__anchor-name.is-stale { color: var(--error); text-decoration: line-through; }
.pl__stale { color: var(--error); font-size: 9px; }
.pl__due-row { display: flex; gap: 8px; font-size: 10px; }
.pl__due-days { color: var(--error); font-weight: 600; white-space: nowrap; }
.pl__reeval-row { display: flex; gap: 6px; font-size: 10px; align-items: center; flex-wrap: wrap; }
.pl__reeval-reason { flex: 1; min-width: 180px; }
.pl__reeval-anchors { color: var(--text-muted); }
.pl__form { border-top: 1px dashed var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
</style>
