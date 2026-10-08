<!-- overlay/custom/client/governance/components/IncidentReportSection.vue -->
<!-- 事故报告面板（六文调研轮 A+B UI 化，arXiv 2609.24515 三类 17 要素）：
     选会话（最近会话下拉或手填）→ 一键汇编 → 分类分组渲染 + 自治度对账黄条 +
     Markdown 导出。缺席要素如实灰态（不造数）；框架依据页头注明。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchSessions } from '@/api/studio/sessions'
import {
  fetchIncidentReport, incidentReportMdUrl,
  type IncidentCategoryKey, type IncidentReportDto,
} from '@/custom/governance/api/incident-suite'

interface SessionOption { id: string; title?: string }

const CATEGORY_TITLES: Record<IncidentCategoryKey, string> = {
  trajectory: '一、执行轨迹（Agent 经历了什么）',
  capability: '二、能力与权限（Agent 能做什么）',
  orchestration: '三、子组件与编排（跨 Agent 面）',
}
const CATEGORY_ORDER: IncidentCategoryKey[] = ['trajectory', 'capability', 'orchestration']

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  collected: { label: '已采集', cls: 'is-collected' },
  partial: { label: '部分', cls: 'is-partial' },
  absent: { label: '未采集', cls: 'is-absent' },
}

const sessions = ref<SessionOption[]>([])
const sessionId = ref('')
const report = ref<IncidentReportDto | null>(null)
const loading = ref(false)
const error = ref('')

async function loadSessions(): Promise<void> {
  try {
    const list = await fetchSessions(undefined, 50)
    sessions.value = list.map((s) => ({ id: s.id, title: s.title }))
  } catch { sessions.value = [] }  // 会话列表缺席不阻断手填路径
}

async function generate(): Promise<void> {
  const id = sessionId.value.trim()
  if (!id) { error.value = '请选择或填入会话 ID'; return }
  loading.value = true
  error.value = ''
  report.value = null
  try {
    report.value = await fetchIncidentReport(id)
  } catch (e) {
    error.value = `生成失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function elementsOf(cat: IncidentCategoryKey) {
  return (report.value?.elements ?? []).filter((e) => e.category === cat)
}

const warnCount = computed(() =>
  report.value?.autonomy.divergences.filter((d) => d.severity === 'warn').length ?? 0)

function fmtTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

onMounted(() => void loadSessions())
</script>

<template>
  <div class="ir" data-testid="gov-incident-report">
    <div class="ir__bar">
      <h3 class="ir__title">事故报告（17 要素汇编）</h3>
      <select v-model="sessionId" class="ir__select" data-testid="ir-session-select">
        <option value="" disabled>选择最近会话…</option>
        <option v-for="s in sessions" :key="s.id" :value="s.id">{{ s.title ? `${s.title}（${s.id.slice(0, 12)}…）` : s.id }}</option>
      </select>
      <input v-model="sessionId" class="ir__input" placeholder="或手填会话 ID" data-testid="ir-session-input" />
      <button type="button" class="ir__go" :disabled="loading" data-testid="ir-generate" @click="generate">
        {{ loading ? '汇编中…' : '生成报告' }}
      </button>
      <a
        v-if="report" class="ir__md" :href="incidentReportMdUrl(report.sessionId)"
        download data-testid="ir-download-md"
      >⤓ Markdown</a>
    </div>

    <div v-if="error" class="ir__error" data-testid="ir-error">{{ error }}</div>

    <div v-if="report" class="ir__body">
      <div class="ir__meta" data-testid="ir-coverage">
        会话 <code>{{ report.sessionId }}</code>
        <template v-if="report.subject.title"> · {{ report.subject.title }}</template>
        · {{ report.coverage.collected }} 已采集 / {{ report.coverage.partial }} 部分 / {{ report.coverage.absent }} 未采集（共 {{ report.coverage.total }} 要素）
        · 生成于 {{ fmtTime(report.generatedAt) }}
        <span v-if="warnCount > 0" class="ir__warn-count">· ⚠️ {{ warnCount }} 条自治度黄条</span>
      </div>

      <div v-for="cat in CATEGORY_ORDER" :key="cat" class="ir__cat">
        <h4 class="ir__cat-title">{{ CATEGORY_TITLES[cat] }}</h4>
        <div v-for="e in elementsOf(cat)" :key="e.key" class="ir__el">
          <div class="ir__el-head">
            <span class="ir__el-title">{{ e.title }}</span>
            <code class="ir__el-key">{{ e.key }}</code>
            <span class="ir__badge" :class="STATUS_BADGE[e.status]?.cls">{{ STATUS_BADGE[e.status]?.label ?? e.status }}</span>
          </div>
          <div class="ir__el-summary">{{ e.summary }}。</div>
          <div v-if="e.note" class="ir__el-note">注：{{ e.note }}</div>
        </div>
      </div>

      <div class="ir__cat">
        <h4 class="ir__cat-title">四、自治度对账（设计态 ≠ 运行态）</h4>
        <div class="ir__faces">
          <div class="ir__face">
            <div class="ir__face-title">理论自治度（设计允许）</div>
            <ul><li v-for="(f, i) in report.autonomy.theoretical.facts" :key="i">{{ f }}</li></ul>
          </div>
          <div class="ir__face">
            <div class="ir__face-title">实际自治度（轨迹实际）</div>
            <ul><li v-for="(f, i) in report.autonomy.effective.facts" :key="i">{{ f }}</li></ul>
          </div>
        </div>
        <div
          v-for="(d, i) in report.autonomy.divergences" :key="i"
          class="ir__div" :class="{ 'is-warn': d.severity === 'warn' }"
          :data-testid="`ir-divergence-${d.severity}`"
        >{{ d.severity === 'warn' ? '⚠️ 黄条' : 'ℹ️' }} {{ d.finding }}</div>
      </div>
    </div>

    <div v-else-if="!loading && !error" class="ir__empty">
      选一次运行，把它散在七个存储里的执行数据一键汇编成三类 17 要素事故报告（框架：arXiv 2609.24515）
    </div>
  </div>
</template>

<style scoped lang="scss">
.ir {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  display: flex; flex-direction: column; gap: 8px;
}
.ir__bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ir__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 4px; }
.ir__select, .ir__input {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px;
  padding: 3px 8px; font-size: 11px; background: var(--bg-primary, #fff); color: var(--text-primary, inherit);
}
.ir__select { max-width: 260px; }
.ir__input { min-width: 160px; flex: 1; max-width: 260px; }
.ir__go {
  border: 1px solid var(--accent-primary, #3b82f6); color: var(--accent-primary, #3b82f6);
  background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 11px; cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
}
.ir__md { font-size: 12px; color: var(--accent-primary, #3b82f6); text-decoration: none; }
.ir__error { font-size: 11px; color: #b91c1c; }
.ir__meta { font-size: 11px; color: var(--text-muted, #878c99); }
.ir__warn-count { color: #b45309; font-weight: 600; }
.ir__body { display: flex; flex-direction: column; gap: 10px; max-height: 480px; overflow: auto; }
.ir__cat { display: flex; flex-direction: column; gap: 4px; }
.ir__cat-title { margin: 6px 0 2px; font-size: 12px; font-weight: 600; }
.ir__el { border-left: 2px solid var(--border-color, #e5e7eb); padding: 2px 0 2px 8px; }
.ir__el-head { display: flex; align-items: center; gap: 6px; }
.ir__el-title { font-size: 11.5px; font-weight: 600; }
.ir__el-key { font-size: 9px; color: var(--text-muted, #878c99); }
.ir__badge { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-collected { color: #15803d; background: #dcfce7; }
  &.is-partial { color: #b45309; background: #fef3c7; }
  &.is-absent { color: var(--text-muted, #878c99); background: var(--bg-secondary, #f1f2f4); } }
.ir__el-summary { font-size: 11px; margin-top: 1px; }
.ir__el-note { font-size: 10px; color: var(--text-muted, #878c99); margin-top: 1px; }
.ir__faces { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ir__face { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 8px;
  ul { margin: 2px 0 0; padding-left: 16px; } li { font-size: 10.5px; margin: 2px 0; } }
.ir__face-title { font-size: 11px; font-weight: 600; }
.ir__div { font-size: 11px; border-radius: 6px; padding: 4px 8px; margin-top: 3px; background: var(--bg-secondary, #f1f2f4);
  &.is-warn { background: #fef3c7; color: #92400e; } }
.ir__empty { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 14px; text-align: center; font-size: 11px; color: var(--text-muted, #878c99); }
</style>
