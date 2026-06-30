<script setup lang="ts">
import { computed } from 'vue'
import type { TraceNode } from '../adapters/run-trace-adapter'

const props = defineProps<{
  nodes: TraceNode[]
  taskId: string | null
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'show-detail', node: TraceNode): void }>()

// 仅显示当前选中任务（taskId）的执行节点，不含任务树内其他任务。
// 按 startedAt 时间分组（按天分组，组内按时间升序）
interface Group { key: string; label: string; items: TraceNode[] }
const groups = computed<Group[]>(() => {
  const ns = [...props.nodes]
    .filter(n => n.startedAt && n.cluster === props.taskId)
    .sort((a, b) => a.startedAt - b.startedAt)
  const map = new Map<string, TraceNode[]>()
  for (const n of ns) {
    const d = new Date(n.startedAt < 1e12 ? n.startedAt * 1000 : n.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(n)
  }
  const week = ['日', '一', '二', '三', '四', '五', '六']
  return [...map.entries()].map(([key, items]) => {
    const d = new Date(key)
    const label = `${d.getMonth() + 1}/${d.getDate()} 周${week[d.getDay()]}`
    return { key, label, items }
  })
})

function fmtTime(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function fmtDuration(ms?: number): string {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}
const KIND_LABEL: Record<string, string> = {
  ingress: '入口', workflow: 'Run', agent: 'Agent', skill: 'Skill', tool: 'Tool',
  memory: 'Memory', service: 'Service', peer: 'Peer', approval: 'Approval',
}
</script>

<template>
  <aside class="trace-timeline-panel" data-trace-timeline-panel>
    <header class="trace-timeline-panel__head">
      <b>执行时间轴</b>
      <small v-if="taskId">{{ taskId }}</small>
      <button type="button" class="trace-timeline-panel__close" @click="emit('close')" title="关闭">×</button>
    </header>
    <div v-if="groups.length === 0" class="trace-timeline-panel__empty">暂无执行数据</div>
    <div v-else class="trace-timeline-panel__body">
      <div v-for="g in groups" :key="g.key" class="trace-timeline-panel__group">
        <div class="trace-timeline-panel__group-head">
          <span class="trace-timeline-panel__group-dot"></span>
          <span>{{ g.label }}</span>
          <small>{{ g.items.length }} 项</small>
        </div>
        <div class="trace-timeline-panel__items">
          <button
            v-for="n in g.items"
            :key="n.id"
            type="button"
            class="trace-timeline-panel__item"
            :class="`is-${n.kind}`"
            @click="emit('show-detail', n)"
          >
            <span class="trace-timeline-panel__time">{{ fmtTime(n.startedAt) }}</span>
            <span class="trace-timeline-panel__kind" :class="`is-${n.kind}`">{{ KIND_LABEL[n.kind] ?? n.kind }}</span>
            <span class="trace-timeline-panel__label">
              <b>{{ n.label }}</b>
              <small v-if="n.detail">{{ n.detail }}</small>
            </span>
            <span v-if="n.durationMs" class="trace-timeline-panel__dur">{{ fmtDuration(n.durationMs) }}</span>
            <span v-if="n.profile" class="trace-timeline-panel__profile">{{ n.profile }}</span>
            <span class="trace-timeline-panel__status" :class="`is-${n.status}`">{{ n.status }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.trace-timeline-panel { display: flex; flex-direction: column; width: 340px; flex-shrink: 0; background: var(--bg-card); border-left: 1px solid var(--border-color); min-height: 0; }
.trace-timeline-panel__head { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.trace-timeline-panel__head b { font-size: 12px; }
.trace-timeline-panel__head small { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-timeline-panel__close { width: 22px; height: 22px; border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.trace-timeline-panel__empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 12px; }
.trace-timeline-panel__body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
.trace-timeline-panel__group { margin-bottom: 12px; }
.trace-timeline-panel__group-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; font-size: 11px; font-weight: 700; color: var(--text-secondary); position: sticky; top: 0; background: var(--bg-card); z-index: 1; }
.trace-timeline-panel__group-head small { font-size: 9px; color: var(--text-muted); font-weight: 400; margin-left: auto; }
.trace-timeline-panel__group-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); }
.trace-timeline-panel__items { display: flex; flex-direction: column; gap: 4px; padding-left: 6px; border-left: 2px solid var(--border-color); margin-left: 3px; }
.trace-timeline-panel__item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-primary); cursor: pointer; text-align: left; font-family: inherit; transition: background 0.12s;
  &:hover { background: var(--bg-secondary); border-color: var(--text-muted); }
}
.trace-timeline-panel__time { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; flex-shrink: 0; width: 56px; }
.trace-timeline-panel__kind { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; min-width: 40px; text-align: center; }
.trace-timeline-panel__kind.is-ingress { background: var(--bg-secondary); color: var(--text-muted); }
.trace-timeline-panel__kind.is-workflow { background: rgba(64,120,192,0.15); color: var(--accent-primary); }
.trace-timeline-panel__kind.is-agent { background: rgba(76,175,80,0.15); color: var(--success); }
.trace-timeline-panel__kind.is-skill { background: rgba(64,120,192,0.15); color: var(--accent-info); }
.trace-timeline-panel__kind.is-tool { background: rgba(214,155,90,0.15); color: var(--warning); }
.trace-timeline-panel__label { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.trace-timeline-panel__label b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-timeline-panel__label small { font-size: 9px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-timeline-panel__dur { font-size: 9px; color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.trace-timeline-panel__profile { font-size: 8px; color: var(--text-muted); padding: 0 3px; border-radius: 2px; background: var(--bg-secondary); flex-shrink: 0; text-transform: uppercase; }
.trace-timeline-panel__status { font-size: 8px; padding: 0 4px; border-radius: 2px; flex-shrink: 0; }
.trace-timeline-panel__status.is-running { background: rgba(76,175,80,0.15); color: var(--success); }
.trace-timeline-panel__status.is-ok { background: rgba(76,175,80,0.1); color: var(--success); }
.trace-timeline-panel__status.is-error { background: rgba(214,90,107,0.15); color: var(--error); }
.trace-timeline-panel__status.is-cancelled { background: var(--bg-secondary); color: var(--text-muted); }
</style>
