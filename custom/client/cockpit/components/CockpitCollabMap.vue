<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const wrapEl = ref<HTMLElement | null>(null)
const svgHtml = ref('')
const renderError = ref('')
let mermaidInitialized = false

// 转义 mermaid 节点 label（特殊字符）
function esc(label: string): string {
  return label.replace(/"/g, "'").replace(/[<>]/g, '')
}

// 从 topology 构建 mermaid flowchart 文本（TB 自上而下，dagre 自动布局）
function buildMermaidSource(): string {
  const topo = store.topologyForSelectedTask
  if (!topo.nodes.length) return ''
  const lines: string[] = ['flowchart TB']
  // 节点定义（用 shape 区分类型）
  for (const n of topo.nodes) {
    const label = esc(n.label)
    const safeId = mermaidSafeId(n.id)
    if (n.kind === 'center') {
      lines.push(`  ${safeId}(["${label}"])`)
    } else if (n.kind === 'ancestor' || n.kind === 'descendant') {
      lines.push(`  ${safeId}["${label}"]`)
    } else if (n.kind === 'person') {
      lines.push(`  ${safeId}(("${label}"))`)
    } else if (n.kind === 'channel') {
      lines.push(`  ${safeId}{{"${label}"}}`)
    } else if (n.kind === 'folded') {
      lines.push(`  ${safeId}["${label}"]`)
    }
  }
  // 连线
  for (const r of topo.relations) {
    lines.push(`  ${mermaidSafeId(r.from)} --- ${mermaidSafeId(r.to)}`)
  }
  return lines.join('\n')
}

// mermaid 节点 id 只能含字母数字下划线，需转义
function mermaidSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

// 反向映射：mermaid node id → GraphNode
function findNodeBySafeId(safeId: string): GraphNode | undefined {
  return store.topologyForSelectedTask.nodes.find(n => mermaidSafeId(n.id) === safeId)
}

// 渲染 mermaid
async function render() {
  const source = buildMermaidSource()
  if (!source) { svgHtml.value = ''; return }
  renderError.value = ''
  try {
    const mermaidMod = await import('mermaid')
    const mermaid = mermaidMod.default
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'inherit',
          fontSize: '11px',
          primaryColor: 'rgba(255,255,255,0.9)',
          primaryTextColor: '#1a1a1a',
          primaryBorderColor: 'rgba(0,0,0,0.2)',
          lineColor: 'rgba(128,128,128,0.4)',
          secondaryColor: 'rgba(0,0,0,0.04)',
        },
        flowchart: { htmlLabels: true, curve: 'stepAfter', padding: 8 },
      })
      mermaidInitialized = true
    }
    const id = 'cockpit-collab-' + Date.now()
    const { svg } = await mermaid.render(id, source)
    svgHtml.value = svg
    // 渲染后绑定点击事件（下一帧）
    nextTick(bindClickEvents)
  } catch (e: any) {
    renderError.value = e?.message ?? 'render error'
  }
}

// 事件委托：SVG 节点点击 → store 联动
function bindClickEvents() {
  const wrap = wrapEl.value
  if (!wrap) return
  const nodes = wrap.querySelectorAll('.node')
  nodes.forEach((el) => {
    const idAttr = el.getAttribute('id')
    // mermaid 生成的 id 格式：flowchart-xxx-N，或 node 自身 id
    // 从 class 或 data 属性找节点 id（mermaid 把节点 id 作为 g.node 的 id 的一部分）
    // 实际：mermaid 给每个 node 的 <g> 加 class="node" + id="xxx"，xxx 含 original id
    const fullId = el.id || idAttr || ''
    // mermaid id 形如 "flowchart-Cockpit-1234-5"，需反向匹配
    // 更可靠：遍历所有已知节点 safeId，看哪个匹配
    const allNodes = store.topologyForSelectedTask.nodes
    for (const n of allNodes) {
      const sid = mermaidSafeId(n.id)
      if (fullId.includes(sid) || el.classList.contains(sid)) {
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => onNodeClick(n), { once: false })
        break
      }
    }
  })
}

function onNodeClick(node: GraphNode) {
  if (node.kind === 'center' || node.kind === 'folded') return
  if (node.target?.taskId) {
    store.selectTask(node.target.taskId)
  } else if (node.kind === 'channel' && node.target?.routeTarget) {
    const ch = store.channelsForSelectedTask.find(c => c.taskId === node.taskId)
    if (ch) store.selectChannel(ch.id)
  }
}

const hasTask = computed(() => !!store.selectedTask)

// 数据变化时重渲染
watch(() => store.topologyForSelectedTask, () => render(), { deep: true })
watch(() => store.selectedTaskId, () => nextTick(render))
watch(hasTask, (v) => { if (v) nextTick(render) })

onMounted(() => { if (hasTask.value) nextTick(render) })
onUnmounted(() => {})
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <div class="cockpit-map__tools">
        <button type="button" class="cockpit-map__tool" :title="'刷新'" @click="render()">↻</button>
      </div>
    </div>
    <div v-if="hasTask" ref="wrapEl" class="cockpit-map__canvas">
      <div v-if="renderError" class="cockpit-map__error">{{ renderError }}</div>
      <div v-else class="cockpit-map__svg" v-html="svgHtml"></div>
      <span class="cockpit-map__hint">点节点联动 · 自动布局</span>
    </div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.cockpit-map__head { display: flex; align-items: center; gap: 8px; padding: 8px 44px 4px 16px; }
.cockpit-map__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-map__tools { display: flex; gap: 3px; margin-left: auto; }
.cockpit-map__tool {
  width: 22px; height: 20px; font-size: 11px; padding: 0;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}
.cockpit-map__canvas {
  position: relative; flex: 1 1 0; min-height: 80px;
  overflow: auto; padding: 8px;
  background: var(--bg-secondary);
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 14px 14px;
  display: flex; justify-content: center; align-items: center;
}
.cockpit-map__svg { max-width: 100%; max-height: 100%; }
.cockpit-map__svg :deep(svg) { max-width: 100%; height: auto; }
.cockpit-map__svg :deep(.node) { cursor: pointer; }
.cockpit-map__svg :deep(.node:hover) { opacity: 0.7; }
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
.cockpit-map__error { padding: 12px; font-size: 11px; color: var(--error); text-align: center; }
</style>
