<!-- overlay/custom/client/governance/components/AutonomyScaleSection.vue -->
<!-- 自治刻度与责任边界（2026-11-05 组织治理能力批）：AL0-AL5 刻度 + 三圈配比 +
     两条退化自检 + 60 分线（缺停止条件即假 AI 化）+ 双签缺口。
     判定全部来自服务端纯函数（assess），前端只呈现不重算——避免第二份判定事实源。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  checkDualSign, deleteAutonomyScale, fetchAutonomyDistribution, fetchAutonomyScale,
  fetchRosterGaps, type AssessmentDto, type AutonomyLevelDto, type AutonomyScaleEntryDto,
  type DistributionReportDto, type DualSignResultDto, type RosterGapDto,
} from '@/custom/governance/api/org-governance'

const TIER_TITLES: Record<'human' | 'collab' | 'auto', string> = {
  human: '人类圈',
  collab: '协作圈',
  auto: '自主圈',
}

const entries = ref<AutonomyScaleEntryDto[]>([])
const report = ref<DistributionReportDto | null>(null)
const roster = ref<RosterGapDto[]>([])
const rosterBlocked = ref(0)
const loading = ref(false)
const msg = ref('')
const errorMsg = ref('')

const form = reactive({
  target: '',
  al: 2 as AutonomyLevelDto,
  criteria: '',
  sample: '',
  stopCondition: '',
  auditSampling: 0.1,
  humanScan: true,
})
const editing = ref(false)

const dual = reactive({
  changeId: '',
  klass: 'production-release',
  signers: '',
  result: null as DualSignResultDto | null,
})

const violations = computed<AssessmentDto[]>(() =>
  entries.value.map((e) => e.assessment).filter((a): a is AssessmentDto => !!a && a.verdict === 'blocked'))
const warnings = computed<AssessmentDto[]>(() =>
  entries.value.map((e) => e.assessment).filter((a): a is AssessmentDto => !!a && a.verdict === 'warn'))
const fakeAi = computed(() => entries.value.filter((e) => e.assessment?.fakeAi).map((e) => e.target))

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [scale, dist, gaps] = await Promise.all([
      fetchAutonomyScale(), fetchAutonomyDistribution(), fetchRosterGaps(),
    ])
    entries.value = scale.entries
    report.value = dist.report
    roster.value = gaps.rows.filter((r) => r.status === 'blocked').slice(0, 8)
    rosterBlocked.value = gaps.blocked
  } catch (e) {
    errorMsg.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function splitList(v: string): string[] {
  return v.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean)
}

async function submit(): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  try {
    const res = await putSafe()
    if (!res) return
    msg.value = `已保存：${form.target} → AL${form.al}`
    form.target = ''
    form.criteria = ''
    form.sample = ''
    form.stopCondition = ''
    editing.value = false
    await refresh()
  } catch (e) {
    errorMsg.value = `保存失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function putSafe(): Promise<boolean> {
  const { putAutonomyScale } = await import('@/custom/governance/api/org-governance')
  const res = await putAutonomyScale(form.target.trim(), {
    al: form.al,
    dod: {
      criteria: splitList(form.criteria),
      sample: form.sample.trim(),
      stopCondition: form.stopCondition.trim(),
    },
    auditSampling: Number(form.auditSampling),
    humanScan: form.humanScan,
  })
  if (!res.ok) {
    errorMsg.value = (res.problems ?? ['保存被拒']).join('；')
    return false
  }
  return true
}

function editEntry(e: AutonomyScaleEntryDto): void {
  editing.value = true
  form.target = e.target
  form.al = e.al
  form.criteria = e.dod.criteria.join('；')
  form.sample = e.dod.sample
  form.stopCondition = e.dod.stopCondition
  form.auditSampling = e.auditSampling
  form.humanScan = e.humanScan
}

async function remove(target: string): Promise<void> {
  try {
    await deleteAutonomyScale(target)
    await refresh()
  } catch (e) {
    errorMsg.value = `移除失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function runDualSign(): Promise<void> {
  dual.result = null
  const signers = splitList(dual.signers).map((by, i) => ({ by, at: Date.now() + i }))
  try {
    const res = await checkDualSign({ changeId: dual.changeId.trim() || '(未命名变更)', klass: dual.klass, signatures: signers })
    dual.result = res.result
  } catch (e) {
    errorMsg.value = `判定失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function pct(v: number | undefined): string {
  return `${((v ?? 0) * 100).toFixed(1)}%`
}

onMounted(refresh)
</script>

<template>
  <div class="as" data-testid="autonomy-scale-section">
    <div class="as__bar">
      <h3 class="as__title">自治刻度与责任边界</h3>
      <span class="as__hint">AL5 不是禁止项而是条件项：须同时具备抽样审计与人工策略扫描</span>
    </div>

    <div v-if="errorMsg" class="as__err" data-testid="as-error">{{ errorMsg }}</div>
    <div v-else-if="msg" class="as__msg" data-testid="as-msg">{{ msg }}</div>

    <div v-if="report" class="as__dist" data-testid="as-distribution">
      <div class="as__bar-track">
        <span class="as__seg is-auto" :style="{ width: pct(report.shares.auto) }" :title="`自主圈 ${report.counts.auto}`"></span>
        <span class="as__seg is-collab" :style="{ width: pct(report.shares.collab) }" :title="`协作圈 ${report.counts.collab}`"></span>
        <span class="as__seg is-human" :style="{ width: pct(report.shares.human) }" :title="`人类圈 ${report.counts.human}`"></span>
      </div>
      <div class="as__legend">
        <span v-for="t in (['auto', 'collab', 'human'] as const)" :key="t">
          {{ TIER_TITLES[t] }} {{ report.counts[t] }}（{{ pct(report.shares[t]) }}）
        </span>
        <span class="as__ref">文章经验值 80/15/5 仅作参考，不作合规线</span>
      </div>
      <div v-for="c in report.checks" :key="c.id" class="as__check" :class="c.verdict === 'warn' ? 'is-warn' : ''">
        {{ c.detail }}
      </div>
    </div>

    <table class="as__table" data-testid="as-table">
      <thead><tr><th>对象</th><th>等级</th><th>圈</th><th>60 分线</th><th>抽样</th><th>判定</th><th></th></tr></thead>
      <tbody>
        <tr v-for="e in entries" :key="e.target">
          <td class="as__target">{{ e.target }}</td>
          <td>AL{{ e.al }}</td>
          <td>{{ TIER_TITLES[e.assessment?.tier ?? 'human'] }}</td>
          <td class="as__dod">
            <span v-if="e.dod.criteria.length">{{ e.dod.criteria.length }} 条判据</span>
            <span v-else class="as__bad">缺判据</span>
            <span v-if="!e.dod.stopCondition" class="as__bad">· 缺停止条件</span>
          </td>
          <td>{{ pct(e.auditSampling) }}<span v-if="!e.humanScan" class="as__bad"> · 无人工扫描</span></td>
          <td>
            <span class="as__verdict" :class="`is-${e.assessment?.verdict ?? 'warn'}`">
              {{ e.assessment?.verdict === 'ok' ? '通过' : e.assessment?.verdict === 'warn' ? '告警' : '不成立' }}
            </span>
          </td>
          <td class="as__ops">
            <button type="button" class="as__op" @click="editEntry(e)">编辑</button>
            <button type="button" class="as__op as__op--danger" @click="remove(e.target)">移除</button>
          </td>
        </tr>
        <tr v-if="entries.length === 0 && !loading">
          <td colspan="7" class="ui-empty-state ui-empty-state--compact">
            暂无配置——未登记自治刻度时，「已治理」的结论不成立
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="violations.length || fakeAi.length" class="as__gaps" data-testid="as-gaps">
      <div v-if="violations.length" class="as__gap-title">不成立（写入时即被拒，不应出现在此）：{{ violations.map((v) => v.target).join('、') }}</div>
      <div v-if="fakeAi.length" class="as__gap-title">缺停止条件（按辨伪底线判假 AI 化）：{{ fakeAi.join('、') }}</div>
      <div v-if="warnings.length" class="as__gap-note">告警：{{ warnings.map((v) => v.target).join('、') }}</div>
    </div>

    <div class="as__roster" data-testid="as-roster">
      <div class="as__roster-title">Agent 户口缺口：<strong>{{ rosterBlocked }}</strong> 个身份五要素不齐</div>
      <div v-for="r in roster" :key="r.id" class="as__roster-row">
        <span class="as__target">{{ r.name }}</span>
        <span class="as__roster-gaps">{{ r.gaps.map((g) => g.detail).join('；') }}</span>
      </div>
      <div v-if="rosterBlocked === 0" class="as__gap-note">全部身份五要素齐备</div>
    </div>

    <form class="as__form" data-testid="as-form" @submit.prevent="submit">
      <div class="as__form-title">{{ editing ? `编辑 ${form.target}` : '登记自治配置' }}</div>
      <div class="as__row">
        <input v-model="form.target" class="as__input as__input--target" placeholder="对象：profile 名或 workflow:节点" data-testid="as-target" required />
        <select v-model.number="form.al" class="as__input as__input--narrow" data-testid="as-al">
          <option v-for="n in 6" :key="n" :value="n - 1">AL{{ n - 1 }}</option>
        </select>
        <label class="as__chk"><input v-model="form.humanScan" type="checkbox" /> 人工策略扫描</label>
        <label class="as__chk">抽样 <input v-model.number="form.auditSampling" type="number" min="0" max="1" step="0.05" class="as__input as__input--tiny" /></label>
      </div>
      <div class="as__row">
        <input v-model="form.criteria" class="as__input" placeholder="验收判据（分号分隔）：什么叫这个产出可以直接用" data-testid="as-criteria" required />
      </div>
      <div class="as__row">
        <input v-model="form.sample" class="as__input" placeholder="真实样例：一个历史交付即为此形态" data-testid="as-sample" required />
      </div>
      <div class="as__row">
        <input v-model="form.stopCondition" class="as__input" placeholder="停止条件：什么条件下该停掉（缺失即判假 AI 化）" data-testid="as-stop" required />
      </div>
      <div class="as__row">
        <button type="submit" class="as__save" data-testid="as-save">{{ editing ? '更新' : '保存' }}</button>
        <button v-if="editing" type="button" class="as__cancel" @click="editing = false; form.target = ''">取消编辑</button>
      </div>
    </form>

    <div class="as__dual" data-testid="as-dual">
      <div class="as__form-title">双签判定（高风险变更：生产发布/权限提升/数据外发/模型替换/删除类）</div>
      <div class="as__row">
        <input v-model="dual.changeId" class="as__input" placeholder="变更标识（如 CR 号或分支名）" />
        <select v-model="dual.klass" class="as__input as__input--narrow">
          <option value="production-release">生产发布</option>
          <option value="privilege-escalation">权限提升</option>
          <option value="data-egress">数据外发</option>
          <option value="model-replacement">模型替换</option>
          <option value="destructive-delete">删除类</option>
        </select>
        <input v-model="dual.signers" class="as__input" placeholder="签署人（分号分隔，须两个不同人）" />
        <button type="button" class="as__save" @click="runDualSign">判定</button>
      </div>
      <div v-if="dual.result" class="as__dual-result" :class="dual.result.satisfied ? 'is-ok' : 'is-bad'">
        {{ dual.result.reason }}
      </div>
      <div class="as__gap-note">判定不阻断审批，只落缺口记录并在本页告警（真拦需改审批裁决路径，单独轮次）</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.as { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); display: flex; flex-direction: column; gap: 8px; }
.as__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.as__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.as__hint { font-size: 10px; color: var(--warning); }
.as__err { font-size: 11px; color: var(--error); }
.as__msg { font-size: 11px; color: var(--success); }
.as__dist { display: flex; flex-direction: column; gap: 4px; }
.as__bar-track { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-secondary); }
.as__seg { display: block; height: 100%; }
.as__seg.is-auto { background: var(--success); }
.as__seg.is-collab { background: var(--warning); }
.as__seg.is-human { background: var(--accent-info); }
.as__legend { display: flex; gap: 12px; font-size: 10px; color: var(--text-muted); flex-wrap: wrap; }
.as__ref { color: var(--warning); }
.as__check { font-size: 10.5px; color: var(--warning); }
.as__check.is-warn { color: var(--warning); }
.as__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); vertical-align: top; } }
.as__target { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 600; }
.as__dod { max-width: 200px; }
.as__bad { color: var(--error); font-weight: 600; }
.as__verdict { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-ok { color: var(--success); background: rgba(var(--success-rgb), 0.1); }
  &.is-warn { color: var(--warning); background: rgba(var(--warning-rgb), 0.12); }
  &.is-blocked { color: var(--error); background: rgba(var(--error-rgb), 0.1); } }
.as__ops { white-space: nowrap; }
.as__op { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--accent-primary); padding: 0 4px; }
.as__op--danger { color: var(--error); }
.as__gaps { border-top: 1px dashed var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 3px; }
.as__gap-title { font-size: 10.5px; color: var(--error); }
.as__gap-note { font-size: 10px; color: var(--text-muted); }
.as__roster { border-top: 1px dashed var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 3px; }
.as__roster-title { font-size: 11px; font-weight: 600; }
.as__roster-row { display: flex; gap: 8px; font-size: 10px; }
.as__roster-gaps { color: var(--text-muted); }
.as__form { border-top: 1px dashed var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.as__form-title { font-size: 11px; font-weight: 600; }
.as__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.as__input { border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); flex: 1; min-width: 150px; }
.as__input--target { max-width: 300px; }
.as__input--narrow { flex: 0; max-width: 130px; }
.as__input--tiny { max-width: 62px; flex: 0; }
.as__chk { font-size: 10.5px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 3px; }
.as__save { border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 11px; cursor: pointer; }
.as__cancel { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--text-muted); }
.as__dual { border-top: 1px dashed var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.as__dual-result { font-size: 11px; font-weight: 600; }
.as__dual-result.is-ok { color: var(--success); }
.as__dual-result.is-bad { color: var(--error); }
</style>
