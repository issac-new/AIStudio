<!-- overlay/custom/client/governance/components/AutonomyLadderSection.vue -->
<!-- 自治阶梯配置面板（六文调研轮 H2 UI 化）：洞察/辅助/自动执行三档 + 人工确认点。
     auto 档与确认点语义矛盾由服务端拒收（表单侧同步置灰）；执法门状态如实提示
     （HERMES_TOOL_ENFORCE 未开=配置仅呈现不拦截——H3 v1 纪律）。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { deleteLadder, fetchLadder, putLadder, type LadderEntryDto, type LadderLevelDto } from '@/custom/governance/api/incident-suite'

const LEVELS: { key: LadderLevelDto; label: string; desc: string }[] = [
  { key: 'insight', label: '洞察', desc: '只出分析和建议，人决策人执行（仅只读工具放行）' },
  { key: 'assist', label: '辅助', desc: 'Agent 执行，命中确认点或超风险档时拦下等人工确认' },
  { key: 'auto', label: '自动执行', desc: '流程内端到端，仅风险上限约束（不可配确认点）' },
]
const RISK_TIERS = ['low', 'medium', 'high'] as const

const entries = ref<LadderEntryDto[]>([])
const loading = ref(false)
const msg = ref('')
const errorMsg = ref('')

const form = reactive({
  target: '',
  level: 'assist' as LadderLevelDto,
  approvalPoints: '',
  maxRiskTier: 'low' as (typeof RISK_TIERS)[number],
})
const editing = ref(false)

const approvalPointsDisabled = computed(() => form.level === 'auto')

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchLadder()
    entries.value = res.entries
  } catch (e) {
    errorMsg.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  const points = form.approvalPoints
    .split(/[;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    await putLadder(form.target.trim(), {
      level: form.level,
      approvalPoints: form.level === 'auto' ? [] : points,
      maxRiskTier: form.maxRiskTier,
    })
    msg.value = `已保存：${form.target} → ${form.level}`
    form.target = ''
    form.approvalPoints = ''
    editing.value = false
    await refresh()
  } catch (e) {
    errorMsg.value = `保存失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function editEntry(e: LadderEntryDto): void {
  editing.value = true
  form.target = e.target
  form.level = e.level
  form.approvalPoints = e.approvalPoints.join('；')
  form.maxRiskTier = e.maxRiskTier
}

async function remove(target: string): Promise<void> {
  try {
    await deleteLadder(target)
    msg.value = `已移除：${target}`
    await refresh()
  } catch (e) {
    errorMsg.value = `移除失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function levelLabel(l: string): string {
  return LEVELS.find((x) => x.key === l)?.label ?? l
}

onMounted(() => void refresh())
</script>

<template>
  <div class="al" data-testid="gov-autonomy-ladder">
    <div class="al__bar">
      <h3 class="al__title">自治阶梯（洞察 → 辅助 → 自动执行）</h3>
      <span class="al__hint">执法门默认关（HERMES_TOOL_ENFORCE=1 才拦截）——未开启时本配置仅用于事故报告理论面对账</span>
    </div>

    <div v-if="errorMsg" class="al__err" data-testid="al-error">{{ errorMsg }}</div>
    <div v-else-if="msg" class="al__msg" data-testid="al-msg">{{ msg }}</div>

    <table class="al__table" data-testid="al-table">
      <thead><tr><th>对象（profile / workflow:节点）</th><th>档位</th><th>人工确认点</th><th>风险上限</th><th>更新</th><th></th></tr></thead>
      <tbody>
        <tr v-for="e in entries" :key="e.target">
          <td class="al__target">{{ e.target }}</td>
          <td><span class="al__level" :class="`is-${e.level}`">{{ levelLabel(e.level) }}</span></td>
          <td class="al__points">{{ e.approvalPoints.length > 0 ? e.approvalPoints.join('；') : '—' }}</td>
          <td>{{ e.maxRiskTier }}</td>
          <td class="al__ts">{{ e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '—' }}<template v-if="e.updatedBy"> · {{ e.updatedBy }}</template></td>
          <td class="al__ops">
            <button type="button" class="al__op" data-testid="al-edit" @click="editEntry(e)">编辑</button>
            <button type="button" class="al__op al__op--danger" :data-testid="`al-delete-${e.target}`" @click="remove(e.target)">移除</button>
          </td>
        </tr>
        <tr v-if="entries.length === 0 && !loading"><td colspan="6" class="al__empty">暂无配置——为 agent 配置自治档位后，事故报告的理论自治度对账将引用此处配置</td></tr>
      </tbody>
    </table>

    <form class="al__form" data-testid="al-form" @submit.prevent="submit">
      <div class="al__form-title">{{ editing ? `编辑 ${form.target}` : '新增配置' }}</div>
      <div class="al__row">
        <input v-model="form.target" class="al__input al__input--target" placeholder="对象：profile 名（如 coding-agent）或 workflow:节点" data-testid="al-target" required />
        <select v-model="form.level" class="al__input" data-testid="al-level">
          <option v-for="l in LEVELS" :key="l.key" :value="l.key">{{ l.label }}——{{ l.desc }}</option>
        </select>
      </div>
      <div v-if="!approvalPointsDisabled" class="al__row">
        <input v-model="form.approvalPoints" class="al__input" placeholder="人工确认点（分号分隔，如：生产部署；删除类文件操作）" data-testid="al-points" />
        <select v-model="form.maxRiskTier" class="al__input al__input--risk" data-testid="al-risk">
          <option v-for="r in RISK_TIERS" :key="r" :value="r">风险上限 {{ r }}</option>
        </select>
      </div>
      <div v-else class="al__row al__row--note">auto 档为端到端执行，不可配人工确认点（需确认点请选辅助档）</div>
      <div class="al__row">
        <button type="submit" class="al__save" data-testid="al-save">{{ editing ? '更新' : '保存' }}</button>
        <button v-if="editing" type="button" class="al__cancel" data-testid="al-cancel" @click="editing = false; form.target = ''; form.approvalPoints = ''">取消编辑</button>
      </div>
    </form>
  </div>
</template>

<style scoped lang="scss">
.al {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  display: flex; flex-direction: column; gap: 8px;
}
.al__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.al__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; }
.al__hint { font-size: 10px; color: #b45309; }
.al__err { font-size: 11px; color: #b91c1c; }
.al__msg { font-size: 11px; color: #15803d; }
.al__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted, #878c99); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); } }
.al__target { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 600; }
.al__points { max-width: 260px; }
.al__ts { font-size: 9.5px; color: var(--text-muted, #878c99); white-space: nowrap; }
.al__level { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-insight { color: #1d4ed8; background: #dbeafe; }
  &.is-assist { color: #b45309; background: #fef3c7; }
  &.is-auto { color: #15803d; background: #dcfce7; } }
.al__op { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--accent-primary, #3b82f6); padding: 0 4px; }
.al__op--danger { color: #b91c1c; }
.al__empty { text-align: center; color: var(--text-muted, #878c99); padding: 12px; }
.al__form { border-top: 1px dashed var(--border-color, #e5e7eb); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.al__form-title { font-size: 11px; font-weight: 600; }
.al__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.al__row--note { font-size: 10px; color: var(--text-muted, #878c99); }
.al__input { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 3px 8px; font-size: 11px; background: var(--bg-primary, #fff); color: var(--text-primary, inherit); flex: 1; min-width: 140px; }
.al__input--target { max-width: 340px; }
.al__input--risk { max-width: 140px; flex: 0; }
.al__save { border: 1px solid var(--accent-primary, #3b82f6); color: var(--accent-primary, #3b82f6); background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 11px; cursor: pointer; }
.al__cancel { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--text-muted, #878c99); }
</style>
