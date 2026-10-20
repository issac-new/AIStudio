<!-- overlay/custom/client/ia2/views/sim/DirectorPanel.vue
     导演台（2026-10-20 日常/推演拆分 P2）：推演专区默认签。
     目的：从「接收需求 → 导演模拟所有人类员工协作 → 走完整个交付流程」。
     首屏只回答四件事：这次演到哪、谁在演、卡在谁、下一步做什么。
     26 步执行表/交付物链等机读面收进「技术详情」，不再压满首屏。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchRunState, type RunStateResponse } from '../../api/overview'
import { ACTS_7, countStepsDone, resolveGateRows, resolveStepRows } from './steps-registry'
import { useRunContext } from '../../composables/useRunContext'
import { useWorkspaceStore } from '../../store/workspace'
import { useDecisionRows } from '../../composables/useDecisionRows'
import OverviewPanel from './OverviewPanel.vue'

const router = useRouter()
const { run, remember } = useRunContext()
const workspace = useWorkspaceStore()
const { decisionRows } = useDecisionRows()

const loading = ref(false)
const loadError = ref('')
const state = ref<RunStateResponse | null>(null)
const showTechnical = ref(false)

async function load(): Promise<void> {
  const name = run.value.trim()
  if (!name) { state.value = null; return }
  loading.value = true
  loadError.value = ''
  try {
    state.value = await fetchRunState(name)
    remember()
  } catch {
    state.value = null
    loadError.value = '本轮运行数据暂不可用（可能尚未启动或已被清理）。'
  } finally {
    loading.value = false
  }
}
watch(run, () => { void load() })
onMounted(() => { void load() })

const stepRows = computed(() => state.value ? resolveStepRows(state.value.steps, state.value.gates) : [])
const gateRows = computed(() => state.value ? resolveGateRows(state.value.gates, state.value.steps, null) : [])
const stepsDone = computed(() => countStepsDone(stepRows.value))
const gatesPassed = computed(() => gateRows.value.filter(g => g.passed).length)

/** 阶段推进：第一个未完成阶段=当前，之前=完成，之后=未开始 */
const acts = computed(() => {
  const current = ACTS_7.find(a => stepRows.value.filter(r => r.no >= a.from && r.no <= a.to && r.state !== 'done').length > 0)?.act ?? ACTS_7.length
  return ACTS_7.map(a => {
    const rows = stepRows.value.filter(r => r.no >= a.from && r.no <= a.to)
    const done = rows.filter(r => r.state === 'done').length
    return {
      ...a,
      done,
      total: rows.length,
      status: rows.length > 0 && done === rows.length ? 'done' : a.act === current ? 'current' : done > 0 ? 'current' : 'pending',
    }
  })
})

/** 模拟员工：从任务执行人聚合（人类账号与 agent 共用 assignee 字段），按在制量排序 */
const cast = computed(() => {
  const counts = new Map<string, number>()
  for (const e of workspace.rawTasks) {
    const who = String(e.task.assignee ?? '').trim()
    if (!who) continue
    counts.set(who, (counts.get(who) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
})

const interventions = computed(() => decisionRows.value.slice(0, 3))
const openLedger = computed(() => state.value?.ledger.open ?? 0)

function goOrchestration(): void {
  void router.push({ name: 'ia2.simOrchestration' })
}
function goInbox(): void {
  void router.push({ name: 'ia2.inbox' })
}
function goDaily(): void {
  void router.push({ name: 'ia2.collab' })
}
</script>

<template>
  <div class="dir" data-testid="director-panel">
    <p v-if="loadError" class="dir__error" data-testid="director-error">{{ loadError }}</p>
    <div v-else-if="!state" class="dir__empty" data-testid="director-empty">
      <p class="dir__empty-title">还没有进行中的推演</p>
      <p class="dir__empty-sub">推演由 harness 启动；这里展示当前运行、模拟员工与待人介入。启动/续跑请在 harness 侧完成。</p>
      <div class="dir__actions">
        <button type="button" class="dir__btn dir__btn--primary" data-testid="director-start" @click="goOrchestration">查看运行编排 →</button>
        <button type="button" class="dir__btn" data-testid="director-back-daily" @click="goDaily">返回日常工作台</button>
      </div>
    </div>

    <template v-else>
      <header class="dir__head" data-testid="director-head">
        <div>
          <h3 class="dir__title">导演台</h3>
          <p class="dir__sub">
            当前运行 <b>{{ state.run }}</b> · 模式 {{ state.posture }} · 启动/续跑由 harness 执行，这里看导演视图
          </p>
        </div>
        <div class="dir__actions">
          <button type="button" class="dir__btn dir__btn--primary" data-testid="director-orchestrate" @click="goOrchestration">查看运行编排 →</button>
          <button type="button" class="dir__btn" data-testid="director-back-daily-2" @click="goDaily">返回日常工作台</button>
        </div>
      </header>

      <div class="dir__kpis">
        <div class="dir__kpi" data-testid="director-kpi-steps">
          <span class="dir__kpi-n">{{ stepsDone }}<em>/26</em></span>
          <span class="dir__kpi-l">步骤完成</span>
        </div>
        <div class="dir__kpi" data-testid="director-kpi-gates">
          <span class="dir__kpi-n">{{ gatesPassed }}<em>/6</em></span>
          <span class="dir__kpi-l">质量门通过</span>
        </div>
        <div class="dir__kpi" :class="{ 'dir__kpi--warn': interventions.length }" data-testid="director-kpi-wait">
          <span class="dir__kpi-n">{{ interventions.length }}</span>
          <span class="dir__kpi-l">待人介入</span>
        </div>
        <div class="dir__kpi" :class="{ 'dir__kpi--warn': openLedger > 0 }" data-testid="director-kpi-ledger">
          <span class="dir__kpi-n">{{ openLedger }}</span>
          <span class="dir__kpi-l">未清遗留项</span>
        </div>
      </div>

      <section class="dir__card" data-testid="director-acts">
        <h4 class="dir__h">阶段推进</h4>
        <ol class="dir__acts">
          <li v-for="a in acts" :key="a.act" class="dir__act" :class="`dir__act--${a.status}`" :data-testid="`director-act-${a.act}`">
            <span class="dir__act-no">{{ a.act }}</span>
            <span class="dir__act-name">{{ a.displayName }}</span>
            <span class="dir__act-stat">{{ a.done }}/{{ a.total }}</span>
          </li>
        </ol>
      </section>

      <div class="dir__cols">
        <section class="dir__card" data-testid="director-cast">
          <h4 class="dir__h">模拟员工名册 <span class="dir__h-n">{{ cast.length }}</span></h4>
          <p v-if="!cast.length" class="dir__hint">本轮还没有任务执行人记录；派活后会在这里出现。</p>
          <template v-else>
            <p class="dir__hint">按当前看板任务执行人聚合（人类账号与 agent 同列）。</p>
            <ul class="dir__cast">
              <li v-for="p in cast" :key="p.name" class="dir__cast-row">
                <span class="dir__cast-dot" aria-hidden="true" />
                <span class="dir__cast-name">{{ p.name }}</span>
                <span class="dir__cast-n">{{ p.count }} 项</span>
              </li>
            </ul>
          </template>
        </section>

        <section class="dir__card" data-testid="director-interventions">
          <h4 class="dir__h">待人介入 <span class="dir__h-n">{{ interventions.length }}</span></h4>
          <p v-if="!interventions.length" class="dir__hint">没有等你拍板的事——推演按当前节奏继续。</p>
          <ul v-else class="dir__waits">
            <li v-for="w in interventions" :key="w.id" class="dir__wait">
              <span class="dir__wait-title">{{ w.title }}</span>
              <span class="dir__wait-tag">{{ w.kind === 'task-review' || w.kind === 'gate-review' ? '待审' : '待介入' }}</span>
            </li>
          </ul>
          <button v-if="interventions.length" type="button" class="dir__link" data-testid="director-open-inbox" @click="goInbox">去审批收件箱处理 →</button>
        </section>
      </div>

      <div class="dir__tech">
        <button type="button" class="dir__link" data-testid="director-toggle-tech" @click="showTechnical = !showTechnical">
          {{ showTechnical ? '收起技术详情' : '展开技术详情（26 步执行表 / 交付物 / 质量门明细）' }}
        </button>
        <OverviewPanel v-if="showTechnical" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.dir { display: flex; flex-direction: column; gap: 12px; }
.dir__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dir__title { margin: 0; font-size: 16px; }
.dir__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
.dir__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dir__btn {
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  border-radius: 6px; padding: 5px 14px; font-family: inherit; font-size: 12px; cursor: pointer;
}
.dir__btn--primary { border-color: var(--accent-primary); color: var(--accent-primary); }
.dir__btn:hover { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
.dir__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.dir__kpi {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.dir__kpi--warn { border-color: var(--ia-stale, #b8860b); }
.dir__kpi-n { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dir__kpi-n em { font-size: 12px; font-style: normal; color: var(--text-muted); font-weight: 500; }
.dir__kpi-l { font-size: 11px; color: var(--text-muted); }
.dir__card { border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; }
.dir__h { margin: 0 0 8px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.dir__h-n { font-size: 11px; color: var(--text-muted); font-weight: 500; }
.dir__acts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }
.dir__act {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px;
  display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-muted);
}
.dir__act--done { border-left: 3px solid var(--ia-fresh, #2e9e5b); color: var(--text-primary); }
.dir__act--current { border-left: 3px solid var(--ia-stale, #b8860b); color: var(--text-primary); background: color-mix(in srgb, var(--ia-stale, #b8860b) 6%, transparent); }
.dir__act-no { font-weight: 700; }
.dir__act-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir__act-stat { font-variant-numeric: tabular-nums; }
.dir__cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
.dir__cast, .dir__waits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dir__cast-row, .dir__wait { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dir__cast-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ia-fresh, #2e9e5b); }
.dir__cast-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir__cast-n { font-size: 11px; color: var(--text-muted); }
.dir__wait-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir__wait-tag { font-size: 10px; color: var(--ia-stale, #b8860b); border: 1px solid var(--ia-stale, #b8860b); border-radius: 4px; padding: 0 4px; }
.dir__hint { margin: 0; font-size: 12px; color: var(--text-muted); }
.dir__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.dir__empty { border: 1px dashed var(--border-color); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.dir__empty-title { margin: 0; font-size: 14px; font-weight: 600; }
.dir__empty-sub { margin: 0; font-size: 12px; color: var(--text-muted); }
.dir__tech { display: flex; flex-direction: column; gap: 8px; }
.dir__link { align-self: flex-start; border: none; background: transparent; color: var(--accent-info, var(--accent-primary)); font-size: 11.5px; cursor: pointer; padding: 0; }
.dir__link:hover { text-decoration: underline; text-underline-offset: 3px; }
</style>
