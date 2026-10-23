<!-- overlay/custom/client/ia2/views/effectiveness/DeliveryEffectivenessView.vue -->
<!-- 交付效能页签（2026-10-23 天猫数字员工两文吸收轮）：看板域第 4 键，三区布局——
     ① 交付日报（状态盘点/趋势/卡点负责人+停留时长/评审老化/停滞候选/建议，条目可展开）
     ② C×L 效能画像矩阵（CSS 格阵，同 eval 金字塔不引 echarts 先例）
     ③ 介入归因账本（run 下钻/六类分布/两层分账/风险信号）
     全部只读消费 /api/hermes/delivery/*；fail-soft：源缺席如实呈现原因。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchDigest, fetchInterventions, fetchMatrix, fetchMaturity,
  type DailyDigest, type DeliveryMatrix, type DigestItem, type InterventionsResponse, type MaturityResponse,
} from '../../api/effectiveness'
import { useEffectivenessText } from './i18n'

const text = useEffectivenessText()

const digest = ref<DailyDigest | null>(null)
const digestError = ref<string | null>(null)
const digestLoading = ref(false)
const matrix = ref<DeliveryMatrix | null>(null)
const matrixError = ref<string | null>(null)
const interventions = ref<InterventionsResponse | null>(null)
const interventionsError = ref<string | null>(null)
const maturity = ref<MaturityResponse | null>(null)
const runScope = ref('') // '' = 全部 run
const expanded = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function loadAll(): Promise<void> {
  digestLoading.value = true
  digestError.value = null
  matrixError.value = null
  interventionsError.value = null
  const [d, m, i, mat] = await Promise.allSettled([fetchDigest(), fetchMatrix(), fetchInterventions(runScope.value || undefined), fetchMaturity(runScope.value || undefined)])
  if (d.status === 'fulfilled') {
    digest.value = d.value.digest ?? null
    if (!d.value.available) digestError.value = d.value.reason ?? 'unavailable'
  } else digestError.value = String(d.reason)
  if (m.status === 'fulfilled') {
    matrix.value = m.value.matrix ?? null
    if (!m.value.available) matrixError.value = m.value.reason ?? 'unavailable'
  } else matrixError.value = String(m.reason)
  if (i.status === 'fulfilled') {
    interventions.value = i.value
    if (!i.value.available) interventionsError.value = i.value.reason ?? 'unavailable'
  } else interventionsError.value = String(i.reason)
  maturity.value = mat.status === 'fulfilled' ? mat.value : null
  digestLoading.value = false
}

async function switchRun(run: string): Promise<void> {
  runScope.value = run
  interventionsError.value = null
  try {
    interventions.value = await fetchInterventions(run || undefined)
  } catch (e) {
    interventions.value = null
    interventionsError.value = String(e)
  }
}

onMounted(() => { void loadAll() })

const runOptions = computed(() => {
  const perRun = interventions.value?.meta?.perRun ?? []
  return [{ run: '', label: text.value.scopeAll }, ...perRun.map(r => ({ run: r.run, label: `${r.run}（${r.count}）` }))]
})

const typeKeys = ['raise', 'context', 'nudge', 'unblock', 'confirm', 'rework'] as const
const typeLabel = computed(() => ({
  raise: text.value.typeRaise,
  context: text.value.typeContext,
  nudge: text.value.typeNudge,
  unblock: text.value.typeUnblock,
  confirm: text.value.typeConfirm,
  rework: text.value.typeRework,
}))
const typeMax = computed(() => {
  const byType = interventions.value?.stats?.byType ?? {}
  return Math.max(1, ...typeKeys.map(k => byType[k] ?? 0))
})

/** 看板状态键 → 人话（D20；键本身保留在 title 里供对账） */
const STATUS_ZH: Record<string, string> = {
  done: '完成', archived: '已归档', blocked: '卡住', review: '评审中',
  ready: '待开工', todo: '待办', scheduled: '已排期', triage: '待分诊', running: '正在干',
}

function fmtDwell(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`
  return `${(sec / 86400).toFixed(1)}d`
}

function fmtTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ListSection { key: string; title: string; items: DigestItem[] }
const digestLists = computed<ListSection[]>(() => {
  const d = digest.value
  if (!d) return []
  return [
    { key: 'completed', title: text.value.listCompleted, items: d.completed },
    { key: 'blockers', title: text.value.listBlockers, items: d.blockers },
    { key: 'review', title: text.value.listReview, items: d.reviewQueue },
    { key: 'stalled', title: text.value.listStalled, items: d.stalled },
  ]
})

const matrixGrid = computed(() => {
  const m = matrix.value
  if (!m) return null
  return {
    colHeads: ['', ...m.cols.map(c => c.label)],
    rows: m.rows.map(r => ({
      label: r.label,
      cells: m.cols.map(col => m.cells.find(c => c.c === r.tier && c.l === col.tier) ?? { c: r.tier, l: col.tier, count: 0, avgInterventions: null }),
    })),
  }
})

function cellClass(count: number): string {
  if (!count) return 'eff-matrix__cell--empty'
  if (count <= 1) return 'eff-matrix__cell--low'
  if (count <= 3) return 'eff-matrix__cell--mid'
  return 'eff-matrix__cell--high'
}
</script>

<template>
  <div class="eff-view" data-testid="ia-tasks-panel-effectiveness">
    <header class="eff-view__bar">
      <div>
        <h2 class="eff-view__title">{{ text.title }}</h2>
        <p class="eff-view__sub">{{ text.subtitle }}</p>
      </div>
      <div class="eff-view__actions">
        <select
          class="eff-view__run-select"
          data-testid="eff-run-select"
          :value="runScope"
          @change="switchRun(String(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="opt in runOptions" :key="opt.run || 'all'" :value="opt.run">{{ opt.label }}</option>
        </select>
        <button type="button" class="eff-view__refresh" data-testid="eff-refresh" :disabled="digestLoading" @click="loadAll">
          {{ text.refresh }}
        </button>
      </div>
    </header>

    <div class="eff-view__body">
      <!-- ① 交付日报 -->
      <section class="eff-card" data-testid="eff-digest-card">
        <h3 class="eff-card__title">{{ text.digestTitle }}
          <span v-if="digest" class="eff-card__meta">{{ text.generatedAt }} {{ fmtTime(digest.generatedAt) }} · {{ digest.boardsAvailable }}/{{ digest.boards }} {{ text.boardsAvailable }}</span>
        </h3>
        <p v-if="digestError" class="eff-card__error" data-testid="eff-digest-error">{{ text.unavailable }}：{{ digestError }}</p>
        <template v-else-if="digest">
          <div class="eff-digest__trend">
            <span>{{ text.trendCompleted }} {{ digest.trend.completed24h }}（{{ text.prevWindow }} {{ digest.trend.completedPrev24h }}）</span>
            <span>{{ text.trendCreated }} {{ digest.trend.created24h }}（{{ text.prevWindow }} {{ digest.trend.createdPrev24h }}）</span>
            <span v-for="s in digest.statuses" :key="s.status" class="eff-digest__chip" :title="s.status">{{ STATUS_ZH[s.status] ?? s.status }} {{ s.count }}</span>
          </div>
          <div v-for="sec in digestLists" :key="sec.key" class="eff-digest__list">
            <h4 class="eff-digest__list-title">{{ sec.title }}（{{ sec.items.length }}）</h4>
            <p v-if="!sec.items.length" class="eff-digest__empty">{{ text.empty }}</p>
            <ul v-else class="eff-digest__items">
              <li v-for="item in sec.items" :key="item.id" class="eff-digest__item">
                <button type="button" class="eff-digest__item-head" :data-testid="`eff-digest-item-${sec.key}`" @click="toggleExpand(item.id)">
                  <span class="eff-digest__item-title">{{ item.board }} · {{ item.title }}</span>
                  <span class="eff-digest__item-meta">{{ item.owner }} · {{ text.dwell }} {{ fmtDwell(item.dwellSec) }}</span>
                  <span class="eff-digest__toggle">{{ expanded.has(item.id) ? text.collapse : text.expand }}</span>
                </button>
                <ul v-if="expanded.has(item.id)" class="eff-digest__details">
                  <li v-for="(d, di) in item.details" :key="di">{{ d }}</li>
                </ul>
              </li>
            </ul>
          </div>
          <div class="eff-digest__suggestions">
            <h4 class="eff-digest__list-title">{{ text.suggestions }}（{{ digest.suggestions.length }}）</h4>
            <ul class="eff-digest__items">
              <li v-for="s in digest.suggestions" :key="s.target + s.kind" class="eff-digest__suggestion">{{ s.note }}</li>
            </ul>
          </div>
        </template>
      </section>

      <!-- ② C×L 矩阵 -->
      <section class="eff-card" data-testid="eff-matrix-card">
        <h3 class="eff-card__title">{{ text.matrixTitle }}</h3>
        <p v-if="matrixError" class="eff-card__error">{{ text.unavailable }}：{{ matrixError }}</p>
        <template v-else-if="matrixGrid && matrix">
          <div class="eff-matrix" role="table" data-testid="eff-matrix-grid">
            <div v-for="(head, hi) in matrixGrid.colHeads" :key="`h${hi}`" class="eff-matrix__head" role="columnheader">{{ head }}</div>
            <template v-for="row in matrixGrid.rows" :key="row.label">
              <div class="eff-matrix__head" role="rowheader">{{ row.label }}</div>
              <div
                v-for="cell in row.cells"
                :key="`${cell.c}-${cell.l}`"
                class="eff-matrix__cell"
                :class="cellClass(cell.count)"
                role="cell"
                :title="`${text.matrixCount} ${cell.count}${cell.avgInterventions != null ? ` · ${text.matrixAvgInterventions} ${cell.avgInterventions}` : ''}`"
              >
                <span class="eff-matrix__count">{{ cell.count || '' }}</span>
                <span v-if="cell.count && cell.avgInterventions != null" class="eff-matrix__avg">{{ cell.avgInterventions }}</span>
              </div>
            </template>
          </div>
          <div class="eff-matrix__totals">
            {{ text.matrixTotals }}：{{ text.matrixCount }} {{ matrix.totals.tasks }} · {{ text.matrixEvaluatedC }} {{ matrix.totals.evaluatedC }} · {{ text.matrixAvgInterventions }} {{ matrix.totals.avgInterventions ?? '—' }}
          </div>
          <p class="eff-card__note">{{ matrix.note }}</p>
        </template>
      </section>

      <!-- ③ 介入归因账本 -->
      <section class="eff-card" data-testid="eff-interventions-card">
        <h3 class="eff-card__title">{{ text.interventionsTitle }}
          <span v-if="interventions" class="eff-card__meta">{{ text.runsScanned }} {{ interventions.runsScanned }} · {{ text.autoApprove }} {{ interventions.meta?.autoApprove ?? 0 }}</span>
        </h3>
        <p v-if="interventionsError" class="eff-card__error" data-testid="eff-interventions-error">{{ text.unavailable }}：{{ interventionsError }}</p>
        <template v-else-if="interventions?.stats">
          <div class="eff-int__layers">
            <span class="eff-int__layer">{{ text.layerCollab }} {{ interventions.stats.byLayer.collab }}</span>
            <span class="eff-int__layer">{{ text.layerDelivery }} {{ interventions.stats.byLayer.delivery }}</span>
            <span class="eff-int__total">{{ interventions.stats.total }}</span>
          </div>
          <div class="eff-int__types">
            <div v-for="k in typeKeys" :key="k" class="eff-int__type" :data-testid="`eff-int-type-${k}`">
              <span class="eff-int__type-label">{{ typeLabel[k] }}</span>
              <span class="eff-int__type-bar">
                <span class="eff-int__type-fill" :style="{ width: `${Math.round(((interventions.stats.byType[k] ?? 0) / typeMax) * 100)}%` }" />
              </span>
              <span class="eff-int__type-count">{{ interventions.stats.byType[k] ?? 0 }}</span>
            </div>
          </div>
          <div class="eff-int__risk">
            <span class="eff-int__risk-title">{{ text.riskSignals }}</span>
            <span
              v-for="r in interventions.riskSignals ?? []"
              :key="r.id"
              class="eff-int__risk-chip"
              :class="{ 'eff-int__risk-chip--hit': r.hit }"
              :data-testid="`eff-risk-${r.id}`"
            >{{ r.label }} {{ r.hit ? text.riskHit : text.riskMiss }}（{{ r.note }}）</span>
          </div>
          <p class="eff-int__actors">{{ text.topActors }}：{{ (interventions.stats.topActors ?? []).map(a => `${a.actor} ${a.count}`).join(' · ') || text.empty }}</p>
          <div class="eff-int__entries">
            <table class="eff-int__table">
              <thead>
                <tr><th>时间</th><th>{{ text.layerCollab }}/{{ text.layerDelivery }}</th><th>怎么插的手</th><th>哪轮推演</th><th>{{ text.anchor }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(e, ei) in (interventions.entries ?? []).slice(0, 50)" :key="`${e.anchor}-${ei}`">
                  <td>{{ fmtTime(e.ts) }}</td>
                  <td>{{ e.layer === 'collab' ? text.layerCollab : text.layerDelivery }}</td>
                  <td><span class="eff-int__type-tag" :data-testid="`eff-entry-${e.type}`">{{ typeLabel[e.type] }}</span>{{ e.actor }} · {{ e.snippet }}</td>
                  <td>{{ e.run }}</td>
                  <td class="eff-int__anchor">{{ e.anchor }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
      <!-- ④ 协作成熟度（挂账批 D17：文章三级演进的实数据读数） -->
      <section v-if="maturity?.available && maturity.assessment" class="eff-card" data-testid="eff-maturity-card">
        <h3 class="eff-card__title">协作成熟度
          <span class="eff-card__meta">{{ maturity.assessment.level.name }} · {{ text.runsScanned }} {{ maturity.scope === 'all' ? text.scopeAll : maturity.scope }}</span>
        </h3>
        <div class="eff-mat__levels">
          <div
            v-for="lv in maturity.levels ?? []"
            :key="lv.key"
            class="eff-mat__level"
            :class="{ 'eff-mat__level--active': lv.key === maturity.assessment.level.key }"
          >
            <span class="eff-mat__lv-name">{{ lv.name }}</span>
            <span class="eff-mat__lv-thesis">{{ lv.thesis }}</span>
            <span v-if="lv.key === maturity.assessment.level.key" class="eff-mat__lv-now">当前读数</span>
          </div>
        </div>
        <div class="eff-mat__readings">
          <span>插手有 {{ maturity.assessment.reading.collabSharePct }}% 在排活沟通</span>
          <span>该人拍板的节点 {{ maturity.assessment.reading.autoApproveSharePct ?? '—' }}% 机器自动过</span>
          <span>催进度 {{ maturity.assessment.reading.nudges }} 次</span>
          <span>干错重来 {{ maturity.assessment.reading.reworks }} 次</span>
          <span>插手共 {{ maturity.assessment.reading.total }} 次</span>
        </div>
        <p class="eff-mat__gap">眼下最该修的：{{ maturity.assessment.gapNote }}</p>
        <p class="eff-card__note">{{ maturity.assessment.note }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.eff-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  overflow: auto;
  min-height: 0;
}
.eff-view__bar { display: flex; align-items: flex-start; gap: 10px; flex-shrink: 0; }
.eff-view__title { margin: 0; font-size: 15px; font-weight: 600; }
.eff-view__sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted); }
.eff-view__actions { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.eff-view__run-select {
  font-size: 12px; padding: 3px 6px; border: 1px solid var(--border-color);
  border-radius: 5px; background: var(--bg-secondary, transparent); color: inherit; max-width: 220px;
}
.eff-view__refresh {
  font-size: 12px; padding: 4px 10px; border: 1px solid var(--border-color);
  border-radius: 5px; background: transparent; color: inherit; cursor: pointer;
  &:hover:not(:disabled) { background: var(--bg-secondary, rgba(128, 128, 128, 0.12)); }
  &:disabled { opacity: 0.5; cursor: default; }
}
.eff-view__body {
  /* D21 布局批：单列→两列网格（矮卡顶对齐；矩阵卡 min-content 宽可降级） */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
  gap: 12px;
  align-items: start;
  grid-auto-flow: row dense;
}
.eff-card {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.eff-card__title { margin: 0; font-size: 13.5px; font-weight: 600; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.eff-card__meta { font-size: 11px; font-weight: 400; color: var(--text-muted); }
.eff-card__note { margin: 0; font-size: 11px; color: var(--text-muted); }
.eff-card__error { margin: 0; font-size: 12px; color: var(--text-muted); }
.eff-digest__trend { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; align-items: center; }
.eff-digest__chip {
  font-size: 11px; padding: 1px 7px; border-radius: 9px;
  border: 1px solid var(--border-color); color: var(--text-muted);
}
.eff-digest__list-title { margin: 6px 0 4px; font-size: 12px; font-weight: 600; color: var(--text-muted); }
.eff-digest__empty { margin: 0; font-size: 12px; color: var(--text-muted); }
.eff-digest__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.eff-digest__item-head {
  display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: left;
  background: transparent; border: none; padding: 3px 4px; font-size: 12px; cursor: pointer;
  color: inherit; border-radius: 4px;
  &:hover { background: var(--bg-secondary, rgba(128, 128, 128, 0.1)); }
}
.eff-digest__item-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eff-digest__item-meta { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
.eff-digest__toggle { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
.eff-digest__details {
  list-style: none; margin: 0 0 2px; padding: 2px 12px; font-size: 11px; color: var(--text-muted);
  border-left: 2px solid var(--border-color);
}
.eff-digest__suggestion { font-size: 12px; padding: 2px 4px; }
.eff-matrix {
  display: grid; grid-template-columns: 110px repeat(5, minmax(72px, 1fr)); gap: 2px;
  font-size: 11.5px; overflow-x: auto;
}
.eff-matrix__head {
  font-weight: 600; color: var(--text-muted); font-size: 10.5px;
  display: flex; align-items: center; justify-content: center; text-align: center; padding: 3px 2px;
}
.eff-matrix__cell {
  border: 1px solid var(--border-color); border-radius: 5px; min-height: 40px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  &--empty { opacity: 0.45; }
  &--low { background: rgba(46, 160, 67, 0.12); }
  &--mid { background: rgba(46, 160, 67, 0.25); }
  &--high { background: rgba(46, 160, 67, 0.4); }
}
.eff-matrix__count { font-size: 14px; font-weight: 600; }
.eff-matrix__avg { font-size: 10px; color: var(--text-muted); }
.eff-matrix__totals { font-size: 11.5px; color: var(--text-muted); }
.eff-int__layers { display: flex; gap: 10px; align-items: baseline; font-size: 12px; }
.eff-int__total { margin-left: auto; color: var(--text-muted); }
.eff-int__types { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 4px 14px; }
.eff-int__type { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
.eff-int__type-label { width: 64px; flex-shrink: 0; color: var(--text-muted); }
.eff-int__type-bar { flex: 1; height: 8px; border-radius: 4px; background: var(--bg-secondary, rgba(128,128,128,0.15)); overflow: hidden; }
.eff-int__type-fill { display: block; height: 100%; background: var(--accent-primary, var(--color-primary)); }
.eff-int__type-count { width: 26px; text-align: right; flex-shrink: 0; }
.eff-int__risk { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 11.5px; }
.eff-int__risk-title { color: var(--text-muted); }
.eff-int__risk-chip {
  padding: 1px 8px; border-radius: 9px; border: 1px solid var(--border-color); color: var(--text-muted);
  &--hit { border-color: var(--warning-color); color: var(--warning-color); font-weight: 600; }
}
.eff-int__actors { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.eff-int__entries { overflow-x: auto; }
.eff-int__table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.eff-int__table th {
  text-align: left; font-weight: 600; color: var(--text-muted); font-size: 11px;
  border-bottom: 1px solid var(--border-color); padding: 3px 6px; white-space: nowrap;
}
.eff-int__table td { border-bottom: 1px solid var(--border-color); padding: 3px 6px; vertical-align: top; }
.eff-int__anchor { font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--text-muted); }
.eff-int__type-tag {
  display: inline-block; margin-right: 5px; padding: 0 6px; border-radius: 8px;
  border: 1px solid var(--border-color); font-size: 10.5px; color: var(--text-muted);
}
.eff-mat__levels { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px; }
.eff-mat__level {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px;
  display: flex; flex-direction: column; gap: 3px; position: relative;
  &--active { border-color: var(--accent-primary, var(--color-primary)); background: rgba(46, 160, 67, 0.06); }
}
.eff-mat__lv-name { font-size: 12px; font-weight: 600; }
.eff-mat__lv-thesis { font-size: 10.5px; color: var(--text-muted); }
.eff-mat__lv-now {
  position: absolute; top: 5px; right: 6px; font-size: 9.5px; padding: 0 5px;
  border-radius: 7px; border: 1px solid var(--accent-primary, var(--color-primary));
  color: var(--accent-primary, var(--color-primary));
}
.eff-mat__readings { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.eff-mat__gap { margin: 0; font-size: 12px; }
</style>
