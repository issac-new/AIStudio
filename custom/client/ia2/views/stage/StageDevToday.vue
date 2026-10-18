<!-- overlay/custom/client/ia2/views/stage/StageDevToday.vue
     ④开发·今日工作页签（2026-10-18 阶段页页签批）：
     只回答「我现在该动哪张卡、哪件审批在等我」。任务行就地开看板抽屉
     （StageShell 统一挂 KanbanTaskDrawer），审批行去收件箱处理。
     数据全部来自既有 workspace/decision 聚合，零新端点。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../store/workspace'
import { useDecisionRows } from '../../composables/useDecisionRows'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const emit = defineEmits<{
  (e: 'open-task', taskId: string): void
  (e: 'open-inbox'): void
  (e: 'open-tab', key: string): void
}>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()
const cockpit = useCockpitStore()
const { decisionRows } = useDecisionRows()

const STATUS_LABEL: Record<string, { zh: string; en: string; tone: string }> = {
  triage: { zh: '分诊', en: 'Triage', tone: 'muted' },
  todo: { zh: '待开始', en: 'To do', tone: 'muted' },
  scheduled: { zh: '已排期', en: 'Scheduled', tone: 'info' },
  ready: { zh: '就绪', en: 'Ready', tone: 'info' },
  running: { zh: '进行中', en: 'In progress', tone: 'info' },
  blocked: { zh: '阻塞', en: 'Blocked', tone: 'danger' },
  review: { zh: '待评审', en: 'In review', tone: 'warn' },
  done: { zh: '完成', en: 'Done', tone: 'ok' },
  archived: { zh: '归档', en: 'Archived', tone: 'muted' },
}

const openTasks = computed(() => workspace.tasks.filter(t => t.status !== 'done' && t.status !== 'archived'))
const me = computed(() => String(cockpit.currentUserName ?? '').trim())
const mine = computed(() => me.value ? openTasks.value.filter(t => t.assignee === me.value) : [])
const blocked = computed(() => openTasks.value.filter(t => t.status === 'blocked'))
const review = computed(() => openTasks.value.filter(t => t.status === 'review'))
const rows = computed(() => {
  const seen = new Set<string>()
  const out = [] as typeof openTasks.value
  for (const t of [...mine.value, ...blocked.value, ...review.value]) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    out.push(t)
    if (out.length >= 6) break
  }
  return out
})
const scopeLabel = computed(() => mine.value.length
  ? (zh.value ? '我的任务' : 'My tasks')
  : (zh.value ? '需要先处理' : 'Needs attention'))
const waits = computed(() => decisionRows.value.slice(0, 4))

/** 工作区路径只显示末两层（产品里不出现绝对路径）；完整路径进 title 供排查。 */
function workspaceShort(path: string): string {
  const parts = String(path || '').split(/[\\/]+/).filter(Boolean)
  return parts.slice(-2).join('/')
}

function statusOf(status: string) {
  return STATUS_LABEL[status] ?? { zh: status, en: status, tone: 'muted' }
}
</script>

<template>
  <section class="sdt" data-testid="stg-dev-today">
    <div class="sdt__grid">
      <section class="sdt__panel">
        <header class="sdt__head">
          <h2 class="sdt__title">{{ scopeLabel }}</h2>
          <span class="sdt__n">{{ rows.length }}</span>
          <span v-if="!mine.length" class="sdt__hint">{{ zh ? '（没有指派给你的任务，先看阻塞与待评审）' : '(No tasks assigned to you; showing blocked and in-review)' }}</span>
        </header>

        <div v-if="rows.length" class="sdt__rows">
          <button
            v-for="t in rows"
            :key="t.id"
            type="button"
            class="sdt__row"
            :data-testid="`stg-dev-task-${t.id}`"
            @click="emit('open-task', t.id)"
          >
            <span class="sdt__status" :class="`sdt__status--${statusOf(t.status).tone}`">{{ zh ? statusOf(t.status).zh : statusOf(t.status).en }}</span>
            <span class="sdt__body">
              <strong class="sdt__name">{{ t.title }}</strong>
              <span class="sdt__meta">{{ t.id }}<template v-if="t.workspace"> · <span :title="t.workspace">{{ workspaceShort(t.workspace) }}</span></template><template v-if="t.assignee"> · {{ t.assignee }}</template></span>
            </span>
            <span class="sdt__go">{{ zh ? '打开' : 'Open' }}</span>
          </button>
        </div>

        <div v-else class="sdt__empty" data-testid="stg-dev-empty">
          <p class="sdt__empty-title">{{ zh ? '当前没有需要你处理的开发任务' : 'No development task needs you right now' }}</p>
          <p class="sdt__empty-sub">{{ zh ? '可以打开看板接一张卡，或到审批待办处理等你决定的事。' : 'Pick a card from the board, or handle approvals waiting on you.' }}</p>
          <div class="sdt__empty-acts">
            <button type="button" class="sdt__btn" @click="emit('open-tab', 'board')">{{ zh ? '打开看板' : 'Open board' }}</button>
            <button type="button" class="sdt__btn" @click="emit('open-inbox')">{{ zh ? '处理审批' : 'Handle approvals' }}</button>
          </div>
        </div>
      </section>

      <aside class="sdt__panel sdt__panel--rail">
        <header class="sdt__head">
          <h2 class="sdt__title">{{ zh ? '待你决定' : 'Waiting on you' }}</h2>
          <span class="sdt__n">{{ decisionRows.length }}</span>
        </header>
        <div v-if="waits.length" class="sdt__waits">
          <button
            v-for="w in waits"
            :key="w.id"
            type="button"
            class="sdt__wait"
            :data-testid="`stg-dev-wait-${w.id}`"
            @click="emit('open-inbox')"
          >
            <span class="sdt__wait-title">{{ w.title }}</span>
            <span class="sdt__wait-go">{{ zh ? '去处理 →' : 'Handle →' }}</span>
          </button>
        </div>
        <p v-else class="sdt__none">{{ zh ? '没有待你决定的审批或裁决。' : 'No approval or decision is waiting.' }}</p>
        <button type="button" class="sdt__btn sdt__btn--wide" data-testid="stg-dev-inbox" @click="emit('open-inbox')">
          {{ zh ? '打开审批收件箱 →' : 'Open approvals inbox →' }}
        </button>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.sdt__grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, .9fr); gap: 12px; }
@media (max-width: 980px) { .sdt__grid { grid-template-columns: 1fr; } }
.sdt__panel { border: 1px solid var(--border-color); border-radius: 9px; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.sdt__panel--rail { gap: 0; }
.sdt__head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; }
.sdt__title { margin: 0; font-size: 13px; font-weight: 600; }
.sdt__n { font-size: 11px; color: var(--text-muted); }
.sdt__hint { font-size: 11px; color: var(--text-muted); }
.sdt__rows { display: flex; flex-direction: column; }
.sdt__row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--border-color); background: transparent; text-align: left; font-family: inherit; color: inherit; cursor: pointer; }
.sdt__row:last-child { border-bottom: 0; }
.sdt__row:hover { background: var(--bg-secondary); }
.sdt__row:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.sdt__status { font-size: 10.5px; border-radius: 999px; padding: 1px 7px; white-space: nowrap; border: 1px solid var(--border-color); color: var(--text-muted); }
.sdt__status--danger { color: var(--error); border-color: color-mix(in srgb, var(--error) 45%, var(--border-color)); }
.sdt__status--warn { color: var(--ia-stale); border-color: color-mix(in srgb, var(--ia-stale) 45%, var(--border-color)); }
.sdt__status--info { color: var(--accent-info); border-color: color-mix(in srgb, var(--accent-info) 45%, var(--border-color)); }
.sdt__status--ok { color: var(--success); border-color: color-mix(in srgb, var(--success) 45%, var(--border-color)); }
.sdt__body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sdt__name { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sdt__meta { font-size: 10.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sdt__go { font-size: 11px; color: var(--accent-primary); white-space: nowrap; }
.sdt__empty { padding: 22px 16px; text-align: center; }
.sdt__empty-title { margin: 0; font-size: 13px; font-weight: 600; }
.sdt__empty-sub { margin: 4px 0 12px; font-size: 11.5px; color: var(--text-muted); }
.sdt__empty-acts { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.sdt__waits { display: flex; flex-direction: column; }
.sdt__wait { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--border-color); background: transparent; text-align: left; font-family: inherit; color: inherit; cursor: pointer; }
.sdt__wait:hover { background: var(--bg-secondary); }
.sdt__wait-title { flex: 1; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sdt__wait-go { font-size: 11px; color: var(--accent-primary); white-space: nowrap; }
.sdt__none { margin: 0; padding: 14px 12px; font-size: 11.5px; color: var(--text-muted); }
.sdt__btn { border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 5px 12px; cursor: pointer; }
.sdt__btn:hover { background: var(--bg-secondary); }
.sdt__btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.sdt__btn--wide { margin: 10px 12px 12px; }
</style>
