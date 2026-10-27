<!-- overlay/custom/client/ia2/views/LegacyLoopView.vue -->
<!-- Legacy Loop 薄详情（2026-10-27 产品一致性 Task 3）：/app/l/:loopId 承载
     /api/loop/loops 域对象（cron 调度/自治级别/预算）的设置与最新运行。
     分域契约：Workflow Run（/api/ia2/workflow/runs）走 ?wf=<runId>，两类对象
     互不跨 API 复用裸 ID。复用 loopStore（fetchLoop）与运行中心 store
     （sortedRuns，graphId=`loop-<loopId>` 约定），运行详情跳既有 ia2.runDetail，
     不新建运行器；本页只读（写操作归既有运行详情/看板）。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'

const route = useRoute()
const router = useRouter()
const loopStore = useLoopStore()
const runsStore = useRunCenterStore()

const loopId = computed(() => (typeof route.params.loopId === 'string' ? route.params.loopId : ''))

const loading = ref(false)
const loadError = ref('')

async function load(): Promise<void> {
  if (!loopId.value) return
  loading.value = true
  loadError.value = ''
  await loopStore.fetchLoop(loopId.value)
  loading.value = false
  // store 是全局单例：currentLoop 未落到本 loopId = 本轮取数失败（含 404）
  if (!loopStore.currentLoop || loopStore.currentLoop.id !== loopId.value) {
    loadError.value = loopStore.error || '载入循环失败'
  }
}
watch(loopId, () => { void load() }, { immediate: true })

/** 详情只认命中的 currentLoop（store 全局态，防跨 loop 串台） */
const loop = computed(() => (loopStore.currentLoop?.id === loopId.value ? loopStore.currentLoop : null))

/** 该 loop 的运行（graph-compiler 约定 graphId = `loop-<loopId>`；sortedRuns 已按最近排序） */
const loopRuns = computed(() =>
  (runsStore.sortedRuns ?? []).filter(r => r.graphId === `loop-${loopId.value}`))

const LOOP_STATUS_LABEL: Record<string, string> = {
  idle: '空闲', running: '运行中', paused: '已暂停', blocked: '受阻',
  'awaiting-review': '待复核', completed: '已完成', failed: '失败',
}
const RUN_STATUS_LABEL: Record<string, string> = {
  running: '运行中', completed: '已完成', failed: '失败',
  'awaiting-input': '待确认', paused: '已暂停', unknown: '未知',
}

function openRun(runId: string): void {
  void router.push({ name: 'ia2.runDetail', params: { runId } })
}
function backToWorkbench(): void {
  void router.push({ name: 'ia2.collab' })
}
</script>

<template>
  <div class="llv" data-testid="legacy-loop-root">
    <header class="llv__head">
      <button type="button" class="llv__back" data-testid="legacy-loop-back" @click="backToWorkbench">← 返回工作台</button>
      <h2 class="llv__title">{{ loop?.name ?? loopId }}</h2>
      <span v-if="loop" class="llv__status" :data-status="loop.status">{{ LOOP_STATUS_LABEL[loop.status] ?? loop.status }}</span>
    </header>

    <p v-if="loading" class="llv__hint" data-testid="legacy-loop-loading">载入循环详情…</p>
    <div v-else-if="loadError" class="llv__err" data-testid="legacy-loop-error">
      <p class="llv__err-msg">{{ loadError }}</p>
      <div class="llv__acts">
        <button type="button" class="llv__btn" data-testid="legacy-loop-retry" @click="load">重试</button>
        <button type="button" class="llv__btn llv__btn--ghost" @click="backToWorkbench">返回工作台</button>
      </div>
    </div>
    <template v-else-if="loop">
      <section class="llv__card" data-testid="legacy-loop-settings">
        <h3 class="llv__card-t">设置</h3>
        <dl class="llv__dl">
          <div class="llv__row"><dt>目标</dt><dd>{{ loop.goal || '—' }}</dd></div>
          <div class="llv__row">
            <dt>调度</dt>
            <dd data-testid="legacy-loop-setting-schedule">
              {{ loop.schedule.mode === 'cron'
                ? `cron ${loop.schedule.cron ?? ''}（${loop.schedule.timezone}）`
                : loop.schedule.mode === 'webhook' ? 'webhook 触发' : '手动' }}
            </dd>
          </div>
          <div class="llv__row"><dt>自治级别</dt><dd data-testid="legacy-loop-setting-autonomy">{{ loop.autonomyLevel }}</dd></div>
          <div class="llv__row">
            <dt>预算</dt>
            <dd data-testid="legacy-loop-setting-budget">单轮 {{ loop.budget.maxCostPerTick }} / 总额 {{ loop.budget.maxCostTotal }}（预警 {{ loop.budget.warningThreshold }}%）</dd>
          </div>
          <div class="llv__row"><dt>停止条件</dt><dd>{{ loop.stopCondition || '—' }}</dd></div>
          <div class="llv__row">
            <dt>迭代</dt>
            <dd>第 {{ loop.stats.currentIteration }} 轮 · 完成 {{ loop.stats.tasksCompleted }} / 发现 {{ loop.stats.tasksDiscovered }}</dd>
          </div>
        </dl>
      </section>

      <section class="llv__card" data-testid="legacy-loop-runs">
        <h3 class="llv__card-t">运行</h3>
        <p v-if="!loopRuns.length" class="llv__hint" data-testid="legacy-loop-runs-empty">该循环尚未产生运行——设置就绪后按调度或手动 tick 触发。</p>
        <button
          v-for="r in loopRuns" :key="r.runId" type="button" class="llv__run"
          :data-testid="`legacy-loop-run-${r.runId}`"
          @click="openRun(r.runId)"
        >
          <span class="llv__run-dot" :data-status="r.status" />
          <span class="llv__run-id">{{ r.runId }}</span>
          <span class="llv__run-status">{{ RUN_STATUS_LABEL[r.status] ?? r.status }}</span>
          <span v-if="r.iteration" class="llv__run-meta">第 {{ r.iteration }} 轮</span>
          <span v-if="r.cost" class="llv__run-meta">成本 {{ r.cost.toFixed(2) }}</span>
          <span class="llv__run-go">详情 ❭</span>
        </button>
      </section>
    </template>
    <div v-else class="llv__err" data-testid="legacy-loop-error">
      <p class="llv__err-msg">未找到该循环</p>
      <div class="llv__acts">
        <button type="button" class="llv__btn" data-testid="legacy-loop-retry" @click="load">重试</button>
        <button type="button" class="llv__btn llv__btn--ghost" @click="backToWorkbench">返回工作台</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.llv {
  height: 100%; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 16px;
}
.llv__head { display: flex; align-items: center; gap: 10px; }
.llv__back {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px;
  background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}
.llv__title { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); }
.llv__status {
  padding: 1px 8px; border-radius: 999px; font-size: 11px;
  border: 1px solid var(--border-color); color: var(--text-secondary);
  &[data-status='blocked'], &[data-status='failed'] { color: var(--color-danger, #d33); border-color: currentColor; }
  &[data-status='running'] { color: var(--accent-primary); border-color: currentColor; }
  &[data-status='awaiting-review'], &[data-status='paused'] { color: var(--warning); border-color: currentColor; }
}
.llv__card {
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-card); padding: 10px 12px;
}
.llv__card-t { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: var(--text-muted); letter-spacing: .06em; }
.llv__dl { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.llv__row { display: flex; gap: 10px; font-size: 13px; }
.llv__row dt { flex: 0 0 64px; color: var(--text-muted); }
.llv__row dd { margin: 0; color: var(--text-primary); min-width: 0; word-break: break-word; }
.llv__hint { margin: 4px 2px; font-size: 13px; color: var(--text-muted); }
.llv__err { border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; text-align: center; }
.llv__err-msg { margin: 0 0 8px; font-size: 13px; color: var(--color-danger, #d33); }
.llv__acts { display: flex; gap: 8px; justify-content: center; }
.llv__btn {
  padding: 5px 16px; font-size: 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent;
  &:hover { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
}
.llv__btn--ghost { border-color: var(--border-color); color: var(--text-secondary); }
.llv__run {
  display: flex; align-items: center; gap: 8px; width: 100%;
  margin: 4px 0; padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 8px;
  background: transparent; cursor: pointer; text-align: left; font-size: 12px;
  &:hover { border-color: var(--text-muted); background: var(--bg-secondary); }
}
.llv__run-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--text-muted);
  &[data-status='running'] { background: var(--accent-primary); }
  &[data-status='completed'] { background: var(--color-success, #2f9e44); }
  &[data-status='failed'] { background: var(--color-danger, #d33); }
  &[data-status='awaiting-input'] { background: var(--warning); }
}
.llv__run-id { font-family: ui-monospace, monospace; color: var(--text-primary); }
.llv__run-status { color: var(--text-secondary); }
.llv__run-meta { color: var(--text-muted); font-size: 11px; }
.llv__run-go { margin-left: auto; color: var(--text-muted); font-size: 11px; }
</style>
