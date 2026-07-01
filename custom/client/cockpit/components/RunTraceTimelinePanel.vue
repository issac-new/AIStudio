<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { TraceNode, TraceEdge } from '../adapters/run-trace-adapter'
import { fetchProfileDetail, type HermesProfileDetail } from '@/api/hermes/profiles'

const props = defineProps<{
  /** 选中的节点（高亮并跳转至该节点在时间轴的位置） */
  node: TraceNode | null
  /** 全树节点（显示完整时间轴） */
  allNodes: TraceNode[]
  /** 全树边 */
  allEdges: TraceEdge[]
  taskId: string | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const KIND_LABEL: Record<string, string> = {
  ingress: '入口', workflow: 'Run', agent: 'Agent', skill: 'Skill', tool: 'Tool',
  memory: 'Memory', service: 'Service', peer: 'Peer', approval: 'Approval',
}

// 全树节点按时间排序、按天分组（始终显示完整时间轴）
const sortedNodes = computed<TraceNode[]>(() =>
  [...props.allNodes].filter(n => n.startedAt).sort((a, b) => a.startedAt - b.startedAt),
)
interface Group { key: string; label: string; items: TraceNode[] }
const groups = computed<Group[]>(() => {
  const map = new Map<string, TraceNode[]>()
  for (const n of sortedNodes.value) {
    const ms = n.startedAt < 1e12 ? n.startedAt * 1000 : n.startedAt
    const d = new Date(ms)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(n)
  }
  const week = ['日', '一', '二', '三', '四', '五', '六']
  return [...map.entries()].map(([key, items]) => {
    const d = new Date(key)
    return { key, label: `${d.getMonth() + 1}/${d.getDate()} 周${week[d.getDay()]}`, items }
  })
})

// 选中节点详情 + agent 配置
const agentDetail = ref<HermesProfileDetail | null>(null)
const agentLoading = ref(false)
watch(() => props.node, async (n) => {
  agentDetail.value = null
  if (!n || n.kind !== 'agent' || !n.profile) return
  agentLoading.value = true
  try { agentDetail.value = await fetchProfileDetail(n.profile) } catch { /* 不可用 */ } finally { agentLoading.value = false }
}, { immediate: true })

// 展开的二级详情节点 id（点击时间轴项在下方插入可折叠详情，不弹窗）
const expandedDetail = ref<string | null>(null)
// 自动跟随选中节点展开其详情
watch(() => props.node, (n) => {
  if (n) expandedDetail.value = n.id
}, { immediate: true })

// 点击时间轴项：切换该节点二级详情折叠
function toggleDetail(id: string) {
  expandedDetail.value = expandedDetail.value === id ? null : id
}

// 选中节点自动滚动到视野
const bodyRef = ref<HTMLElement | null>(null)
watch(() => props.node, async (n) => {
  if (!n) return
  await nextTick()
  const el = bodyRef.value?.querySelector(`[data-item-id="${n.id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

function fmtTime(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function fmtDateTime(ts?: number): string {
  if (!ts) return '—'
  const ms = ts < 1e12 ? ts * 1000 : ts
  return new Date(ms).toLocaleString('zh-CN')
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
</script>

<template>
  <aside class="trace-timeline-panel" data-trace-timeline-panel>
    <header class="trace-timeline-panel__head">
      <b>任务执行时间轴</b>
      <small v-if="taskId">{{ taskId }}</small>
      <button type="button" class="trace-timeline-panel__close" @click="emit('close')" title="关闭">×</button>
    </header>
    <div ref="bodyRef" class="trace-timeline-panel__body">
      <!-- 选中节点摘要（固定顶部） -->
      <section v-if="node" class="trace-timeline-panel__selected">
        <span class="trace-timeline-panel__kind" :class="`is-${node.kind}`">{{ KIND_LABEL[node.kind] ?? node.kind }}</span>
        <b>{{ node.label }}</b>
        <span class="trace-timeline-panel__selected-time">{{ fmtDateTime(node.startedAt) }}</span>
      </section>

      <!-- agent 配置（仅 agent 节点） -->
      <section v-if="node && node.kind === 'agent'" class="trace-timeline-panel__agent">
        <div class="trace-timeline-panel__sub-title">Agent 配置</div>
        <div v-if="agentLoading" class="trace-timeline-panel__empty-mini">加载配置…</div>
        <div v-else-if="agentDetail">
          <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">模型</span><span class="trace-timeline-panel__value">{{ agentDetail.model }}</span></div>
          <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">Provider</span><span class="trace-timeline-panel__value">{{ agentDetail.provider }}</span></div>
          <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">技能数</span><span class="trace-timeline-panel__value">{{ agentDetail.skills }}</span></div>
          <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">路径</span><span class="trace-timeline-panel__value trace-timeline-panel__value--mono">{{ agentDetail.path }}</span></div>
          <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">环境</span><span class="trace-timeline-panel__value">{{ agentDetail.hasEnv ? '已配置' : '无' }}</span></div>
          <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">Soul</span><span class="trace-timeline-panel__value">{{ agentDetail.hasSoulMd ? '有' : '无' }}</span></div>
        </div>
        <div v-else class="trace-timeline-panel__empty-mini">配置不可用</div>
      </section>

      <!-- 全时间轴 -->
      <section class="trace-timeline-panel__timeline">
        <div class="trace-timeline-panel__sub-title">全部执行节点（{{ sortedNodes.length }}）</div>
        <div v-if="sortedNodes.length === 0" class="trace-timeline-panel__empty-mini">暂无执行数据</div>
        <div v-for="g in groups" :key="g.key" class="trace-timeline-panel__group">
          <div class="trace-timeline-panel__group-head">
            <span class="trace-timeline-panel__group-dot"></span>
            <span>{{ g.label }}</span>
            <small>{{ g.items.length }} 项</small>
          </div>
          <div class="trace-timeline-panel__items">
            <template v-for="n in g.items" :key="n.id">
              <button
                type="button"
                :data-item-id="n.id"
                class="trace-timeline-panel__item"
                :class="[`is-${n.kind}`, node && n.id === node.id ? 'is-active' : '']"
                @click="toggleDetail(n.id)"
              >
                <span class="trace-timeline-panel__time">{{ fmtTime(n.startedAt) }}</span>
                <span class="trace-timeline-panel__kind-tag" :class="`is-${n.kind}`">{{ KIND_LABEL[n.kind] ?? n.kind }}</span>
                <span class="trace-timeline-panel__label-text">
                  <b>{{ n.label }}</b>
                  <small v-if="n.detail">{{ n.detail }}</small>
                </span>
                <span v-if="n.durationMs" class="trace-timeline-panel__dur">{{ fmtDuration(n.durationMs) }}</span>
                <span v-if="n.profile" class="trace-timeline-panel__profile">{{ n.profile }}</span>
                <span class="trace-timeline-panel__status" :class="`is-${n.status}`">{{ n.status }}</span>
                <span class="trace-timeline-panel__expand">{{ expandedDetail === n.id ? '▾' : '▸' }}</span>
              </button>
              <!-- 二级详情（可折叠，不弹窗） -->
              <div v-if="expandedDetail === n.id" class="trace-timeline-panel__sub-detail">
                <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">详情</span><span class="trace-timeline-panel__value trace-timeline-panel__value--pre">{{ n.detail || '—' }}</span></div>
                <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">状态</span><span class="trace-timeline-panel__value">{{ n.status }}</span></div>
                <div v-if="n.profile" class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">Profile</span><span class="trace-timeline-panel__value">{{ n.profile }}</span></div>
                <div v-if="n.cluster" class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">任务</span><span class="trace-timeline-panel__value trace-timeline-panel__value--mono">{{ n.cluster }}</span></div>
                <div v-if="n.taskStatus" class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">任务状态</span><span class="trace-timeline-panel__value">{{ n.taskStatus }}</span></div>
                <div class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">开始</span><span class="trace-timeline-panel__value">{{ fmtDateTime(n.startedAt) }}</span></div>
                <div v-if="n.endedAt" class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">结束</span><span class="trace-timeline-panel__value">{{ fmtDateTime(n.endedAt) }}</span></div>
                <div v-if="n.durationMs" class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">耗时</span><span class="trace-timeline-panel__value">{{ fmtDuration(n.durationMs) }}</span></div>
                <div v-if="n.ref?.sessionId" class="trace-timeline-panel__row"><span class="trace-timeline-panel__label">会话</span><span class="trace-timeline-panel__value trace-timeline-panel__value--mono">{{ n.ref.sessionId }}</span></div>
              </div>
            </template>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.trace-timeline-panel { display: flex; flex-direction: column; flex-shrink: 0; background: var(--bg-card); border-left: 1px solid var(--border-color); min-height: 0; min-width: 280px; max-width: 50vw; width: max-content; max-width: 50vw; }
.trace-timeline-panel__head { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.trace-timeline-panel__head b { font-size: 12px; }
.trace-timeline-panel__head small { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-timeline-panel__close { width: 22px; height: 22px; border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.trace-timeline-panel__body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
.trace-timeline-panel__empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 12px; }
.trace-timeline-panel__empty-mini { padding: 10px; text-align: center; color: var(--text-muted); font-size: 11px; }
.trace-timeline-panel__selected { display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px; background: rgba(var(--accent-primary-rgb, 64,120,192), 0.08); border: 1px solid var(--accent-primary); border-radius: 6px; flex-wrap: wrap; }
.trace-timeline-panel__selected b { font-size: 12px; word-break: break-word; flex: 1; min-width: 0; }
.trace-timeline-panel__selected-time { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.trace-timeline-panel__kind { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
.trace-timeline-panel__kind.is-ingress { background: var(--bg-secondary); color: var(--text-muted); }
.trace-timeline-panel__kind.is-workflow { background: rgba(64,120,192,0.15); color: var(--accent-primary); }
.trace-timeline-panel__kind.is-agent { background: rgba(76,175,80,0.15); color: var(--success); }
.trace-timeline-panel__kind.is-skill { background: rgba(64,120,192,0.15); color: var(--accent-info); }
.trace-timeline-panel__kind.is-tool { background: rgba(214,155,90,0.15); color: var(--warning); }
.trace-timeline-panel__agent { padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border-color); border-radius: 6px; }
.trace-timeline-panel__sub-title { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
.trace-timeline-panel__timeline { padding: 0 2px; }
.trace-timeline-panel__group { margin-bottom: 10px; }
.trace-timeline-panel__group-head { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 10px; font-weight: 700; color: var(--text-secondary); position: sticky; top: 0; background: var(--bg-card); z-index: 1; }
.trace-timeline-panel__group-head small { font-size: 9px; color: var(--text-muted); font-weight: 400; margin-left: auto; }
.trace-timeline-panel__group-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent-primary); }
.trace-timeline-panel__items { display: flex; flex-direction: column; gap: 3px; padding-left: 5px; border-left: 2px solid var(--border-color); margin-left: 2px; }
.trace-timeline-panel__item { display: flex; align-items: center; gap: 5px; padding: 5px 7px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); cursor: pointer; text-align: left; font-family: inherit; transition: background 0.12s; flex-wrap: wrap;
  &:hover { background: var(--bg-secondary); border-color: var(--text-muted); }
  &.is-active { border-color: var(--accent-primary); background: rgba(var(--accent-primary-rgb, 64,120,192), 0.1); box-shadow: 0 0 0 2px var(--accent-primary); }
}
.trace-timeline-panel__time { font-size: 9px; color: var(--text-muted); font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; flex-shrink: 0; width: 52px; }
.trace-timeline-panel__kind-tag { font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px; flex-shrink: 0; min-width: 36px; text-align: center; }
.trace-timeline-panel__kind-tag.is-ingress { background: var(--bg-secondary); color: var(--text-muted); }
.trace-timeline-panel__kind-tag.is-workflow { background: rgba(64,120,192,0.15); color: var(--accent-primary); }
.trace-timeline-panel__kind-tag.is-agent { background: rgba(76,175,80,0.15); color: var(--success); }
.trace-timeline-panel__kind-tag.is-skill { background: rgba(64,120,192,0.15); color: var(--accent-info); }
.trace-timeline-panel__kind-tag.is-tool { background: rgba(214,155,90,0.15); color: var(--warning); }
.trace-timeline-panel__label-text { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.trace-timeline-panel__label-text b { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-timeline-panel__label-text small { font-size: 9px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-timeline-panel__dur { font-size: 9px; color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.trace-timeline-panel__profile { font-size: 8px; color: var(--text-muted); padding: 0 3px; border-radius: 2px; background: var(--bg-secondary); flex-shrink: 0; text-transform: uppercase; }
.trace-timeline-panel__status { font-size: 8px; padding: 0 3px; border-radius: 2px; flex-shrink: 0; }
.trace-timeline-panel__status.is-running { background: rgba(76,175,80,0.15); color: var(--success); }
.trace-timeline-panel__status.is-ok { background: rgba(76,175,80,0.1); color: var(--success); }
.trace-timeline-panel__status.is-error { background: rgba(214,90,107,0.15); color: var(--error); }
.trace-timeline-panel__status.is-cancelled { background: var(--bg-secondary); color: var(--text-muted); }
.trace-timeline-panel__expand { font-size: 10px; color: var(--text-muted); flex-shrink: 0; margin-left: 2px; }
.trace-timeline-panel__sub-detail { margin: 2px 0 4px 8px; padding: 6px 8px; border: 1px dashed var(--border-color); border-radius: 4px; background: var(--bg-secondary); }
.trace-timeline-panel__row { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font-size: 11px; border-bottom: 1px dashed var(--border-color);
  &:last-child { border-bottom: none; }
}
.trace-timeline-panel__label { font-size: 9px; font-weight: 700; color: var(--text-muted); width: 56px; flex-shrink: 0; text-transform: uppercase; }
.trace-timeline-panel__value { color: var(--text-primary); word-break: break-word; }
.trace-timeline-panel__value--pre { white-space: pre-wrap; max-height: 120px; overflow-y: auto; font-size: 10px; }
.trace-timeline-panel__value--mono { font-family: ui-monospace, monospace; font-size: 10px; }
</style>
