<!-- overlay/custom/client/governance/components/ProactivitySection.vue -->
<!-- 主动性两轴面板（Qoder 吸收轮+挂账清偿批）：两轴矩阵（服务端 /model caps 渲染，
     不在客户端复算裁决）、两轴执法策略编辑（enforce-gate 第四级策略源）、长期目标
     对齐台账（漂移防线——确认即复位）。执法门状态如实提示：HERMES_PROACTIVITY_ENFORCE
     未开=策略仅呈现不拦截。
     只读边界（2026-10-27 产品一致性 Task 8）：readonly=true 时本面板退化为只读
     投影——只呈现矩阵 cap/策略解析态/漂移台账，编辑面（策略表单/演算器/移除/
     确认）全部隐藏，编辑深链回①搭建·环境与资产（可写挂载点=StageAssetsPanel
     →GovRegistryRulesView 内的本组件）。⑥治理「主动性两轴」签用只读投影。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  assessProactivity,
  confirmProactivityAlignment,
  deleteProactivityPolicy,
  fetchProactivityAlignments,
  fetchProactivityModel,
  fetchProactivityPolicies,
  putProactivityPolicy,
  type ActionTierDto,
  type AlignmentEntryDto,
  type AssessResultDto,
  type PolicyEntryDto,
  type ProblemDefinerLevelDto,
  type ProactivityModelDto,
} from '@/custom/governance/api/incident-suite'

const props = defineProps<{ readonly?: boolean }>()
// 只读态也可能在无路由的嵌板测试态挂载：useRouter 可为 undefined，点按时兜底不发跳转
const router = useRouter() as ReturnType<typeof useRouter> | undefined
const editTarget = { name: 'ia2.stage1', query: { tab: 'assets' } }
function goEdit(): void {
  void router?.push(editTarget)
}

const LEVELS: { key: ProblemDefinerLevelDto; short: string }[] = [
  { key: 'L1', short: 'L1 指令' },
  { key: 'L2', short: 'L2 时间规则' },
  { key: 'L3', short: 'L3 事件触发' },
  { key: 'L4', short: 'L4 目标差距' },
  { key: 'L5', short: 'L5 推断目标' },
]
const TIER_ORDER: ActionTierDto[] = ['inform', 'suggest', 'draft', 'reversible_exec', 'irreversible_exec']

const model = ref<ProactivityModelDto | null>(null)
const policies = ref<PolicyEntryDto[]>([])
const alignments = ref<AlignmentEntryDto[]>([])
const loading = ref(false)
const errorMsg = ref('')
const msg = ref('')

const policyForm = reactive({
  profile: '',
  level: 'L4' as ProblemDefinerLevelDto,
  goalExplicit: false,
  acceptanceCriteria: false,
  goalId: '',
})
const assessForm = reactive({
  level: 'L4' as ProblemDefinerLevelDto,
  action: 'reversible_exec' as ActionTierDto,
  goalExplicit: false,
  acceptanceCriteria: false,
  goalStatus: '' as '' | 'fresh' | 'stale' | 'never-confirmed',
  reversible: true,
  impactScope: 'self' as 'self' | 'team' | 'external',
  verifiable: true,
})
const assessResult = ref<AssessResultDto | null>(null)

/** 矩阵单元：该横轴档位（按契约态取上限）允许的最大纵轴档；与选中 action 比较出允许/受限。 */
function capOf(level: ProblemDefinerLevelDto, withContract: boolean): ActionTierDto {
  const row = model.value?.caps.find((c) => c.level === level)
  if (!row) return 'inform'
  return withContract ? row.withContract : row.noContract
}

function cellState(level: ProblemDefinerLevelDto, tier: ActionTierDto): 'allowed' | 'capped' {
  const cap = capOf(level, false)
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(cap) ? 'allowed' : 'capped'
}

const matrix = computed(() =>
  LEVELS.map((l) => ({
    level: l,
    noContractCap: capOf(l.key, false),
    withContractCap: capOf(l.key, true),
    cells: TIER_ORDER.map((t) => ({ tier: t, state: cellState(l.key, t) })),
  })),
)

async function refresh(): Promise<void> {
  loading.value = true
  errorMsg.value = ''
  try {
    const [m, p, a] = await Promise.all([
      fetchProactivityModel(),
      fetchProactivityPolicies(),
      fetchProactivityAlignments(),
    ])
    model.value = m
    policies.value = p.entries
    alignments.value = a.entries
  } catch (e) {
    errorMsg.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

async function savePolicy(): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  try {
    await putProactivityPolicy(policyForm.profile.trim(), {
      level: policyForm.level,
      contract: { goalExplicit: policyForm.goalExplicit, acceptanceCriteria: policyForm.acceptanceCriteria },
      ...(policyForm.goalId.trim() ? { goalId: policyForm.goalId.trim() } : {}),
    })
    msg.value = `已保存两轴策略：${policyForm.profile} → ${policyForm.level}`
    policyForm.profile = ''
    policyForm.goalId = ''
    await refresh()
  } catch (e) {
    errorMsg.value = `保存失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function removePolicy(profile: string): Promise<void> {
  try {
    await deleteProactivityPolicy(profile)
    msg.value = `已移除策略：${profile}`
    await refresh()
  } catch (e) {
    errorMsg.value = `移除失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function confirmGoal(goalId: string): Promise<void> {
  msg.value = ''
  try {
    await confirmProactivityAlignment(goalId, '治理页人工确认（目标未漂移）')
    msg.value = `目标已重新确认：${goalId}`
    await refresh()
  } catch (e) {
    errorMsg.value = `确认失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function runAssess(): Promise<void> {
  errorMsg.value = ''
  assessResult.value = null
  try {
    assessResult.value = await assessProactivity({
      level: assessForm.level,
      action: assessForm.action,
      contract: { goalExplicit: assessForm.goalExplicit, acceptanceCriteria: assessForm.acceptanceCriteria },
      failureCost: { reversible: assessForm.reversible, impactScope: assessForm.impactScope, verifiable: assessForm.verifiable },
      ...(assessForm.goalStatus ? { goalStatus: assessForm.goalStatus } : {}),
    })
  } catch (e) {
    errorMsg.value = `演算失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function statusClass(s: string): string {
  return s === 'fresh' ? 'is-fresh' : 'is-stale'
}

function statusLabel(s: string): string {
  return s === 'fresh' ? '新鲜' : s === 'stale' ? '已过期待确认' : '从未确认'
}

function tierShort(t: ActionTierDto): string {
  const map: Record<ActionTierDto, string> = {
    inform: '告知', suggest: '建议', draft: '起草', reversible_exec: '可逆执行', irreversible_exec: '不可逆执行',
  }
  return map[t]
}

onMounted(() => void refresh())
</script>

<template>
  <div class="pa" data-testid="gov-proactivity">
    <div class="pa__bar">
      <h3 class="pa__title">主动性两轴（谁定义问题 × 做到哪一步）</h3>
      <span class="pa__hint">执法门默认关（HERMES_PROACTIVITY_ENFORCE=1 才拦截）；L5 恒只告知、L4 无契约上限起草、目标过期压回起草</span>
    </div>

    <div v-if="errorMsg" class="pa__err" data-testid="pa-error">{{ errorMsg }}</div>
    <div v-else-if="msg" class="pa__msg" data-testid="pa-msg">{{ msg }}</div>

    <!-- 只读投影提示：治理页只看执行结果/漂移状态，编辑回①搭建 -->
    <div v-if="props.readonly" class="pa__ro" data-testid="pa-readonly-note">
      <span>只读投影：此处只看执行结果与目标漂移状态；编辑两轴策略、确认目标请回①搭建。</span>
      <button type="button" data-testid="pa-readonly-edit-link" @click="goEdit">去①搭建·环境与资产编辑 →</button>
    </div>

    <!-- 两轴矩阵（cap 由服务端 /model 下发，客户端只渲染） -->
    <table class="pa__matrix" data-testid="pa-matrix" v-if="model">
      <thead>
        <tr><th>横轴＼纵轴</th><th v-for="t in model.axes.actionTier" :key="t.tier">{{ tierShort(t.tier) }}</th><th>无契约上限</th><th>有契约上限</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in matrix" :key="row.level.key">
          <td class="pa__lvl">{{ row.level.short }}</td>
          <td v-for="c in row.cells" :key="c.tier" :class="`pa__cell is-${c.state}`" :data-testid="`pa-cell-${row.level.key}-${c.tier}`">{{ c.state === 'allowed' ? '可' : '限' }}</td>
          <td class="pa__cap">{{ tierShort(row.noContractCap) }}</td>
          <td class="pa__cap">{{ tierShort(row.withContractCap) }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 两轴策略（enforce-gate 第四级策略源）；只读态保留解析态投影、去操作列 -->
    <table class="pa__table" data-testid="pa-policy-table">
      <thead><tr><th>profile</th><th>横轴档</th><th>契约</th><th>关联目标</th><th>解析态</th><th v-if="!props.readonly"></th></tr></thead>
      <tbody>
        <tr v-for="p in policies" :key="p.profile">
          <td class="pa__mono">{{ p.profile }}</td>
          <td>{{ p.level }}</td>
          <td>{{ p.contract ? (p.contract.goalExplicit && p.contract.acceptanceCriteria ? '目标+验收齐备' : '不完整') : '—' }}</td>
          <td class="pa__mono">{{ p.goalId ?? '—' }}</td>
          <td><span class="pa__status" :class="p.resolved?.goalStatus ? statusClass(p.resolved.goalStatus) : ''">{{ p.resolved?.goalStatus ? statusLabel(p.resolved.goalStatus) : '不参与漂移判定' }}</span></td>
          <td v-if="!props.readonly"><button type="button" class="pa__op pa__op--danger" :data-testid="`pa-policy-del-${p.profile}`" @click="removePolicy(p.profile)">移除</button></td>
        </tr>
        <tr v-if="policies.length === 0 && !loading"><td :colspan="props.readonly ? 5 : 6" class="ui-empty-state ui-empty-state--compact">暂无两轴策略——配置后（且总闸开启时）enforce-gate 按「谁定义问题」限制该 profile 的执行档</td></tr>
      </tbody>
    </table>

    <form v-if="!props.readonly" class="pa__form" data-testid="pa-policy-form" @submit.prevent="savePolicy">
      <div class="pa__form-title">新增/更新策略</div>
      <div class="pa__row">
        <input v-model="policyForm.profile" class="pa__input pa__input--target" placeholder="profile 名（如 coding-agent）" data-testid="pa-policy-profile" required />
        <select v-model="policyForm.level" class="pa__input" data-testid="pa-policy-level">
          <option v-for="l in LEVELS" :key="l.key" :value="l.key">{{ l.short }}</option>
        </select>
        <input v-model="policyForm.goalId" class="pa__input" placeholder="关联长期目标 goalId（L4 漂移判定用，可空）" data-testid="pa-policy-goal" />
      </div>
      <div class="pa__row">
        <label class="pa__check"><input type="checkbox" v-model="policyForm.goalExplicit" data-testid="pa-policy-goal-explicit" /> 目标已说清</label>
        <label class="pa__check"><input type="checkbox" v-model="policyForm.acceptanceCriteria" data-testid="pa-policy-criteria" /> 有验收规则</label>
        <button type="submit" class="pa__save" data-testid="pa-policy-save">保存</button>
      </div>
    </form>

    <!-- 目标对齐台账（漂移防线）；只读态保留漂移状态投影、去确认操作 -->
    <table class="pa__table" data-testid="pa-alignment-table">
      <thead><tr><th>goalId</th><th>目标</th><th>契约</th><th>状态</th><th>距上次确认</th><th v-if="!props.readonly"></th></tr></thead>
      <tbody>
        <tr v-for="a in alignments" :key="a.goalId">
          <td class="pa__mono">{{ a.goalId }}</td>
          <td class="pa__summary">{{ a.goalSummary }}</td>
          <td class="pa__ts">{{ a.contract ? (a.contract.acceptanceCriteria ? '目标+验收齐备' : '目标未含验收') : '—' }}</td>
          <td><span class="pa__status" :class="statusClass(a.status.status)" :data-testid="`pa-status-${a.goalId}`">{{ statusLabel(a.status.status) }}</span></td>
          <td class="pa__ts">{{ a.status.daysSinceConfirm !== null ? `${a.status.daysSinceConfirm.toFixed(1)} 天` : (a.status.lastConfirmedAt ? '—' : '从未') }}</td>
          <td v-if="!props.readonly"><button type="button" class="pa__op" :data-testid="`pa-confirm-${a.goalId}`" @click="confirmGoal(a.goalId)">重新确认</button></td>
        </tr>
        <tr v-if="alignments.length === 0 && !loading"><td :colspan="props.readonly ? 5 : 6" class="ui-empty-state ui-empty-state--compact">暂无长期目标——hermes /goal 创建的目标自动登记于此（补丁 696）</td></tr>
      </tbody>
    </table>

    <!-- 演算器（只读态隐藏——演算属编辑/试算面） -->
    <form v-if="!props.readonly" class="pa__form" data-testid="pa-assess-form" @submit.prevent="runAssess">
      <div class="pa__form-title">两轴演算器（POST /assess）</div>
      <div class="pa__row">
        <select v-model="assessForm.level" class="pa__input" data-testid="pa-assess-level">
          <option v-for="l in LEVELS" :key="l.key" :value="l.key">{{ l.short }}</option>
        </select>
        <select v-model="assessForm.action" class="pa__input" data-testid="pa-assess-action">
          <option v-for="t in TIER_ORDER" :key="t" :value="t">{{ tierShort(t) }}</option>
        </select>
        <select v-model="assessForm.goalStatus" class="pa__input" data-testid="pa-assess-goalstatus">
          <option value="">目标对齐：不参与</option>
          <option value="fresh">目标新鲜</option>
          <option value="stale">目标已过期</option>
          <option value="never-confirmed">从未确认</option>
        </select>
      </div>
      <div class="pa__row">
        <label class="pa__check"><input type="checkbox" v-model="assessForm.goalExplicit" /> 目标已说清</label>
        <label class="pa__check"><input type="checkbox" v-model="assessForm.acceptanceCriteria" /> 有验收规则</label>
        <label class="pa__check"><input type="checkbox" v-model="assessForm.reversible" /> 可撤回</label>
        <label class="pa__check"><input type="checkbox" v-model="assessForm.verifiable" /> 可验证</label>
        <select v-model="assessForm.impactScope" class="pa__input pa__input--scope">
          <option value="self">仅本人</option><option value="team">团队</option><option value="external">对外</option>
        </select>
        <button type="submit" class="pa__save" data-testid="pa-assess-run">演算</button>
      </div>
      <div v-if="assessResult" class="pa__verdict" :class="assessResult.assessment.allowed ? 'is-ok' : 'is-no'" data-testid="pa-assess-result">
        {{ assessResult.assessment.allowed ? '放行' : '受限' }} · 上限={{ tierShort(assessResult.assessment.cappedAt) }} · {{ assessResult.assessment.reasons.join('；') }}
        <div class="pa__upgrade">{{ assessResult.upgrade.note }}</div>
      </div>
    </form>
  </div>
</template>

<style scoped lang="scss">
.pa {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  display: flex; flex-direction: column; gap: 8px;
}
.pa__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.pa__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.pa__hint { font-size: 10px; color: var(--ia-stale); }
.pa__err { font-size: 11px; color: var(--error); }
.pa__msg { font-size: 11px; color: var(--success); }
/* 只读投影横幅：治理页只看结果，编辑回①搭建 */
.pa__ro {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  font-size: 11px; color: var(--text-secondary);
  border: 1px dashed var(--border-color); border-radius: 6px; padding: 5px 10px;
}
.pa__ro button { border: none; background: transparent; color: var(--accent-primary); font-size: 11px; cursor: pointer; padding: 0; white-space: nowrap; }
.pa__matrix, .pa__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 8px 3px 0; border-bottom: 1px solid var(--border-color); }
  td { padding: 3px 8px 3px 0; border-bottom: 1px solid var(--border-color); } }
.pa__cell { text-align: center; font-size: 9.5px; font-weight: 700;
  &.is-allowed { color: var(--success); }
  &.is-capped { color: var(--text-muted); background: rgba(var(--warning-rgb), 0.08); } }
.pa__lvl, .pa__mono { font-family: ui-monospace, monospace; font-size: 10px; }
.pa__cap { font-size: 9.5px; color: var(--accent-info); white-space: nowrap; }
.pa__summary { max-width: 260px; }
.pa__ts { font-size: 9.5px; color: var(--text-muted); white-space: nowrap; }
.pa__status { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-fresh { color: var(--success); background: rgba(var(--success-rgb), 0.08); }
  &.is-stale { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); } }
.pa__op { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--accent-primary); padding: 0 4px; }
.pa__op--danger { color: var(--error); }
.pa__form { border-top: 1px dashed var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.pa__form-title { font-size: 11px; font-weight: 600; }
.pa__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pa__input { border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); flex: 1; min-width: 120px; }
.pa__input--target { max-width: 240px; }
.pa__input--scope { max-width: 100px; flex: 0; }
.pa__check { font-size: 10.5px; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.pa__save { border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 11px; cursor: pointer; }
.pa__verdict { font-size: 11px; border-radius: 6px; padding: 4px 8px;
  &.is-ok { color: var(--success); background: rgba(var(--success-rgb), 0.08); }
  &.is-no { color: var(--error); background: rgba(var(--warning-rgb), 0.10); } }
.pa__upgrade { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
</style>
