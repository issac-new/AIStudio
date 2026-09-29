<!-- overlay/custom/client/kanban/components/ManagementAccountsPanel.vue -->
<!-- 管理三账（调研落地轮 2026-09-29，《研发项目管理看板怎么搭》产品化）：
     进度偏差账（绿灯率+最劣偏差）· 风险分布账（Pareto 集中度+高风险清单）·
     资源结构账（过载/闲置/结构性错配），一屏联动三类决策点：
     偏差→定位任务 / 风险→定位任务 / 资源→按人过滤看板 + 去审批。
     数据面=useWorkspaceStore().rawTasks（/api/hermes/kanban/overview 聚合 + WS 自动更新
     ——即"口径统一、数据源打通+自动更新"的现有底座）；纯函数=utils/accounts.ts。
     词条=i18n-accounts.ts 模块内小事实源（不动 473）。设计文档
     docs/2026-09-29-change-gov-three-accounts-research.md §4.2。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '@/custom/ia2/store/workspace'
import { computeAccounts, UNASSIGNED_BUCKET, type AccountsTask, type AssigneeLoad } from '../utils/accounts'
import { accountsMessages } from '../i18n-accounts'

const emit = defineEmits<{
  (e: 'open-task', taskId: string): void
  (e: 'filter-assignee', assignee: string): void
  (e: 'go-inbox'): void
}>()

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? accountsMessages.zh.accounts : accountsMessages.en.accounts
})

const workspace = useWorkspaceStore()
const loadError = ref('')
const loading = ref(false)

// 分钟级时钟：停滞推算随时间前进（页面停留不陈化）
const nowSec = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => { nowSec.value = Math.floor(Date.now() / 1000) }, 60_000)
  void refresh()
})
onUnmounted(() => { if (timer) clearInterval(timer) })

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const ok = await workspace.refreshAllBoards(true)
    if (!ok) loadError.value = L.value.errorLoad
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const tasks = computed<AccountsTask[]>(() =>
  (workspace.rawTasks ?? []).map(({ board, task }) => ({
    id: String(task.id ?? ''),
    title: String(task.title ?? ''),
    status: String(task.status ?? ''),
    assignee: task.assignee ?? null,
    board: board ?? '',
    created_at: Number(task.created_at ?? 0),
    started_at: task.started_at ?? null,
  })),
)

const accounts = computed(() => computeAccounts(tasks.value, nowSec.value))

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 1000) / 10}%`)
const days = (d: number) => L.value.days.replace('{d}', String(d))

/** 决策点清单（三类决策对应：偏差→纠偏 / 风险→倾斜 / 请求→审批） */
const decisionItems = computed(() => accounts.value.risk.items.slice(0, 5))
const overloadedLoads = computed<AssigneeLoad[]>(() => accounts.value.resource.loads.filter((l) => l.overloaded))

function locate(taskId: string): void { emit('open-task', taskId) }
function filterBy(assignee: string): void { emit('filter-assignee', assignee) }
function goInbox(): void { emit('go-inbox') }
</script>

<template>
  <section class="ma" data-testid="ma-panel">
    <div class="ma__hd">
      <div>
        <h3>{{ L.title }}</h3>
        <p class="ma__sub">{{ L.sub }} · {{ tasks.length }}</p>
      </div>
      <button type="button" class="ma__btn" data-testid="ma-refresh" :disabled="loading" @click="refresh()">{{ L.refresh }}</button>
    </div>
    <p v-if="loadError" class="ma__error" data-testid="ma-error">{{ loadError }}</p>
    <p class="ma__note">{{ L.note }}</p>

    <div v-if="tasks.length" class="ma__grid">
      <!-- ① 进度偏差账 -->
      <div class="ma-card" data-testid="ma-progress">
        <div class="ma-card__hd">{{ L.progressTitle }}</div>
        <div class="ma-card__big" :class="accounts.progress.greenRate !== null && accounts.progress.greenRate >= 0.8 ? 'ma-ok' : accounts.progress.greenRate !== null && accounts.progress.greenRate < 0.6 ? 'ma-bad' : 'ma-mid'">
          {{ pct(accounts.progress.greenRate) }}
          <span class="ma-card__big-label">{{ L.greenRate }}</span>
        </div>
        <div class="ma-card__row">
          <span class="ma-amber">{{ L.amberCount }} {{ accounts.progress.amber }}</span>
          <span class="ma-red">{{ L.redCount }} {{ accounts.progress.red }}</span>
          <span>{{ L.worstDelay }} {{ days(accounts.progress.worstDelayDays) }}</span>
        </div>
      </div>

      <!-- ② 风险分布账 -->
      <div class="ma-card" data-testid="ma-risk">
        <div class="ma-card__hd">{{ L.riskTitle }}</div>
        <div class="ma-card__big" :class="accounts.risk.paretoTopShare !== null && accounts.risk.paretoTopShare >= 0.6 ? 'ma-bad' : 'ma-mid'">
          {{ pct(accounts.risk.paretoTopShare) }}
          <span class="ma-card__big-label">{{ L.pareto }}</span>
        </div>
        <p class="ma-card__hint">{{ L.paretoHint }}</p>
        <div class="ma-card__row">
          <span>{{ L.totalDelay }} {{ days(accounts.risk.totalDelayDays) }}</span>
        </div>
      </div>

      <!-- ③ 资源结构账 -->
      <div class="ma-card" data-testid="ma-resource">
        <div class="ma-card__hd">{{ L.resourceTitle }}</div>
        <div class="ma-card__big" :class="accounts.resource.structuralMismatch ? 'ma-bad' : 'ma-ok'">
          {{ accounts.resource.structuralMismatch ? L.mismatchYes : L.mismatchNo }}
        </div>
        <div class="ma-card__row">
          <span>{{ L.overloadThreshold }} {{ accounts.resource.overloadThreshold }}</span>
          <span class="ma-red">{{ L.overloaded }} {{ overloadedLoads.length }}</span>
          <span class="ma-muted">{{ L.idle }} {{ accounts.resource.idle.length }}</span>
        </div>
      </div>
    </div>
    <p v-else class="ma__empty" data-testid="ma-empty">{{ L.empty }}</p>

    <!-- 一屏联动：三类决策点（偏差/风险→定位任务；资源→过滤看板；请求→审批） -->
    <div v-if="tasks.length" class="ma__decisions">
      <div class="ma__decisions-hd">{{ L.decisions }}</div>
      <table class="ma__table" data-testid="ma-decisions">
        <tbody>
          <tr v-for="r in decisionItems" :key="r.id" :data-testid="`ma-risk-${r.id}`">
            <td><span class="ma-tier" :class="`ma-tier--${r.tier}`">{{ r.tier }}</span></td>
            <td class="ma__title">{{ r.title }}<span class="ma-muted"> · {{ r.board }} · {{ r.status }}</span></td>
            <td class="ma-num">{{ days(r.delayDays) }}</td>
            <td><button type="button" class="ma__btn ma__btn--sm" @click="locate(r.id)">{{ L.openTask }}</button></td>
          </tr>
          <tr v-if="!decisionItems.length">
            <td class="ma-muted">{{ L.noRisk }}</td>
          </tr>
          <tr v-for="l in overloadedLoads" :key="`o-${l.assignee}`" :data-testid="`ma-overload-${l.assignee}`">
            <td><span class="ma-tier ma-tier--red">{{ L.overloaded }}</span></td>
            <td class="ma__title">{{ l.assignee }}<span class="ma-muted"> · {{ L.openTasks }} {{ l.open }}（{{ L.running }} {{ l.running }} / {{ L.blocked }} {{ l.blocked }}）</span></td>
            <td class="ma-num">{{ l.open }}</td>
            <td>
              <button
                v-if="l.assignee !== UNASSIGNED_BUCKET"
                type="button" class="ma__btn ma__btn--sm" @click="filterBy(l.assignee)"
              >{{ L.filterBoard }}</button>
              <button type="button" class="ma__btn ma__btn--sm" @click="goInbox()">{{ L.goInbox }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped lang="scss">
.ma {
  display: flex; flex-direction: column; gap: 10px; height: 100%;
  min-height: 0; overflow: auto; padding: 12px 16px;
}
.ma__hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;
  h3 { margin: 0; font-size: 15px; } }
.ma__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted, #878c99); }
.ma__note { margin: 0; font-size: 11px; color: var(--text-muted, #878c99); }
.ma__error { color: #d03050; font-size: 12px; margin: 0; }
.ma__empty { color: var(--text-muted, #878c99); font-size: 13px; }
.ma__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.ma-card {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.ma-card__hd { font-size: 13px; font-weight: 600; }
.ma-card__big { font-size: 22px; font-weight: 700; display: flex; align-items: baseline; gap: 6px; }
.ma-card__big-label { font-size: 11px; font-weight: 400; color: var(--text-muted, #878c99); }
.ma-card__hint { margin: 0; font-size: 11px; color: var(--text-muted, #878c99); }
.ma-card__row { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; }
.ma-ok { color: #18a058; } .ma-mid { color: inherit; } .ma-bad { color: #d03050; }
.ma-amber { color: #f0a020; } .ma-red { color: #d03050; }
.ma-muted { color: var(--text-muted, #878c99); font-size: 11px; }
.ma__decisions { display: flex; flex-direction: column; gap: 6px; }
.ma__decisions-hd { font-size: 13px; font-weight: 600; }
.ma__table { width: 100%; border-collapse: collapse; font-size: 12px;
  td { padding: 5px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); vertical-align: middle; } }
.ma__title { max-width: 480px; }
.ma-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ma-tier {
  display: inline-block; border-radius: 5px; padding: 1px 7px; font-size: 10px; font-weight: 700; color: #fff;
  &--green { background: #18a058; } &--amber { background: #f0a020; }
  &--red { background: #d03050; }
}
.ma__btn {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; background: var(--bg-secondary, #f1f2f4);
  color: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer; font-family: inherit;
  &:hover:not(:disabled) { border-color: var(--accent-primary, #3b82f6); }
  &:disabled { opacity: 0.5; cursor: default; }
  &--sm { padding: 2px 8px; font-size: 11px; }
}
</style>
