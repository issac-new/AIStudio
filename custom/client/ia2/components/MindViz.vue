<!-- overlay/custom/client/ia2/components/MindViz.vue -->
<!-- 思维图谱渲染（2026-09-15 本体论重设计 v3）。
     用户反馈修正：①修渲染锚点 bug——旧版 keyframes 里的 transform 覆盖了
     定位 transform，导致节点全堆到左上角；②按本体论重新设计——实体（任务/
     运行）→ 关系（孕育/产生）→ 状态（分区）→ 时间（区内时序）四层显式语义，
     分区弧 + 语义标签让「什么在跑/什么卡了/什么完了」一眼可读。
     色彩走全局 Pure Ink CSS 变量（与 app 整体一致）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MindNode, MindScene } from '../adapters/mind'

const props = defineProps<{ scene: MindScene }>()
const emit = defineEmits<{ (e: 'node-click', node: MindNode): void }>()
const { t } = useI18n()

function statusClass(status: string): string {
  switch (status) {
    case 'running': return 'is-running'
    case 'awaiting-input': case 'awaiting-review': return 'is-awaiting'
    case 'blocked': case 'failed': return 'is-failed'
    case 'completed': return 'is-done'
    case 'paused': return 'is-paused'
    default: return 'is-idle'
  }
}

function statusLabel(status: string): string {
  return t(`loopMind.status.${status}`)
}

const coreNode = computed(() => props.scene.nodes.find(n => n.kind === 'core') ?? null)
const thoughtNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'thought'))
const runNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'run'))
const zones = computed(() => props.scene.zones)

function tooltip(node: MindNode): string {
  const label = node.kind === 'core' ? t('loopMind.core') : node.label
  const st = statusLabel(node.status)
  return node.sub ? `${label} · ${st} · ${node.sub}` : `${label} · ${st}`
}

function onNodeClick(node: MindNode): void {
  if (node.to) emit('node-click', node)
}

function edgeWidth(edge: { strength: number; branchNo: number }): number {
  return 0.8 + edge.strength * 2.0 - edge.branchNo * 0.15
}

function edgeOpacity(edge: { strength: number }): number {
  return 0.18 + edge.strength * 0.5
}

/** 分区弧路径（语义分区可视化：一段环形扇区带） */
function zoneArcPath(zone: { a0: number; a1: number; r0: number; r1: number }): string {
  const cx = props.scene.width / 2
  const cy = props.scene.height / 2
  const large = zone.a1 - zone.a0 > Math.PI ? 1 : 0
  const p = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`
  return `M ${p(zone.a0, zone.r1)} A ${zone.r1} ${zone.r1} 0 ${large} 1 ${p(zone.a1, zone.r1)} L ${p(zone.a1, zone.r0)} A ${zone.r0} ${zone.r0} 0 ${large} 0 ${p(zone.a0, zone.r0)} Z`
}

/** 分区标签锚点（扇区角平分线中点） */
function zoneLabelPos(zone: { a0: number; a1: number; r0: number; r1: number }): { x: number; y: number } {
  const cx = props.scene.width / 2
  const cy = props.scene.height / 2
  const a = (zone.a0 + zone.a1) / 2
  const r = (zone.r0 + zone.r1) / 2
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
}

function zoneLabel(key: string): string {
  return t(`loopMind.zone.${key}`)
}

function runDurationLabel(node: MindNode): string {
  return node.sub ?? ''
}
</script>

<template>
  <svg
    class="lmv"
    :viewBox="`0 0 ${scene.width} ${scene.height}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="t('loopMind.title')"
  >
    <!-- 本体论分区弧 + 语义标签（什么状态在什么区，一眼可读） -->
    <g class="lmv__zones" aria-hidden="false">
      <path
        v-for="zone in zones"
        :key="zone.key"
        class="lmv__zone"
        :class="`lmv__zone--${zone.key}`"
        :d="zoneArcPath(zone)"
      />
      <text
        v-for="zone in zones"
        :key="`label-${zone.key}`"
        class="lmv__zone-label"
        :x="zoneLabelPos(zone).x"
        :y="zoneLabelPos(zone).y"
      >{{ zoneLabel(zone.key) }} · {{ zone.count }}</text>
    </g>

    <!-- 关系边（孕育/产生）与沿边粒子 -->
    <g class="lmv__edges">
      <path
        v-for="edge in scene.edges"
        :key="edge.id"
        class="lmv__edge"
        :class="statusClass(edge.status)"
        :d="edge.d"
        :stroke-width="edgeWidth(edge)"
        :stroke-opacity="edgeOpacity(edge)"
      />
      <g class="lmv__flows" aria-hidden="true">
        <circle
          v-for="edge in scene.edges.filter(e => e.flow)"
          :key="`f-${edge.id}`"
          class="lmv__flow"
          :r="2.2 + edge.strength * 1.4"
        >
          <animateMotion
            :dur="edge.branchNo === 0 ? '3.8s' : '2.7s'"
            repeatCount="indefinite"
            :path="edge.d"
          />
        </circle>
      </g>
    </g>

    <!-- 记忆脉冲（浮现→褪色）：进行中/待介入 -->
    <g class="lmv__pulses" aria-hidden="true">
      <circle
        v-for="pulse in scene.pulses"
        :key="pulse.id"
        class="lmv__pulse"
        :class="`lmv__pulse--${pulse.kind}`"
        :cx="scene.nodes.find(n => n.id === pulse.nodeId)?.x ?? 0"
        :cy="scene.nodes.find(n => n.id === pulse.nodeId)?.y ?? 0"
        :r="pulse.kind === 'spark' ? 5 : 4"
        :style="{ animationDelay: `${pulse.delayS}s` }"
      />
    </g>

    <!-- 核心（思维主体） -->
    <g v-if="coreNode" class="lmv__core" :transform="`translate(${coreNode.x}, ${coreNode.y})`">
      <circle class="lmv__core-halo" :r="coreNode.r + 10" />
      <circle class="lmv__core-body" :r="coreNode.r" />
      <circle class="lmv__core-nucleus" :r="9" />
      <text class="lmv__core-label" :y="coreNode.r + 20">{{ t('loopMind.core') }}</text>
    </g>

    <!-- 思想核（任务实体）：语义标签组——任务名 + 状态词 + 运行计数 -->
    <g
      v-for="node in thoughtNodes"
      :key="node.id"
      class="lmv__thought"
      :class="[statusClass(node.status), { 'lmv__thought--click': !!node.to, 'lmv__thought--hot': node.pulse, 'lmv__thought--alert': node.highlight }]"
      :transform="`translate(${node.x}, ${node.y})`"
      :role="node.to ? 'button' : undefined"
      tabindex="-1"
      @click="onNodeClick(node)"
    >
      <title>{{ tooltip(node) }}</title>
      <circle class="lmv__thought-aura" :r="node.r + 8" />
      <circle class="lmv__thought-body" :r="node.r" />
      <circle class="lmv__thought-dot" :r="4" />
      <g class="lmv__thought-tag" :transform="`translate(0, ${node.r + 9})`">
        <text class="lmv__thought-name" y="0">{{ node.label.length > 16 ? node.label.slice(0, 16) + '…' : node.label }}</text>
        <text class="lmv__thought-status" y="13">{{ statusLabel(node.status) }}<tspan v-if="node.sub" class="lmv__thought-count"> · {{ node.sub }}</tspan></text>
      </g>
    </g>

    <!-- 末梢运行（运行尝试实体）：状态色点 + 时长副标 -->
    <g
      v-for="node in runNodes"
      :key="node.id"
      class="lmv__run"
      :class="[statusClass(node.status), { 'lmv__run--hot': node.pulse, 'lmv__run--alert': node.highlight }]"
      :transform="`translate(${node.x}, ${node.y})`"
      role="button"
      tabindex="-1"
      @click="onNodeClick(node)"
    >
      <title>{{ tooltip(node) }}</title>
      <circle v-if="node.pulse || node.highlight" class="lmv__run-aura" :r="node.r + 5" />
      <circle class="lmv__run-body" :r="node.r" />
      <text v-if="runDurationLabel(node)" class="lmv__run-sub" :y="node.r + 11">{{ runDurationLabel(node) }}</text>
    </g>
  </svg>
</template>

<style scoped>
/* ── 全局色彩一致（Pure Ink CSS 变量，浅色体系） ── */
.lmv { display: block; width: 100%; height: 100%; background: transparent; }

/* ── 本体论分区弧（语义分区可视化，淡色带） ── */
.lmv__zone { opacity: 0.35; }
.lmv__zone--running { fill: var(--color-primary, #3b82f6); opacity: 0.06; }
.lmv__zone--awaiting { fill: var(--color-warning, #f59e0b); opacity: 0.07; }
.lmv__zone--blocked { fill: var(--color-warning, #f59e0b); opacity: 0.05; }
.lmv__zone--failed { fill: var(--color-danger, #e11d48); opacity: 0.06; }
.lmv__zone--completed { fill: var(--color-success, #28bf5c); opacity: 0.06; }
.lmv__zone--idle { fill: var(--color-text-secondary, #878c99); opacity: 0.05; }
.lmv__zone--archived { fill: var(--color-text-secondary, #878c99); opacity: 0.03; }
.lmv__zone-label {
  fill: var(--text-secondary);
  font-size: 10.5px;
  text-anchor: middle;
  font-weight: 500;
  letter-spacing: 0.5px;
}

/* ── 关系边（孕育/产生）── */
.lmv__edge {
  fill: none;
  stroke-linecap: round;
  transition: stroke-width 0.7s ease, stroke-opacity 0.7s ease;
}
.lmv__edge.is-running { stroke: var(--color-primary, #3b82f6); }
.lmv__edge.is-awaiting { stroke: var(--color-warning, #f59e0b); }
.lmv__edge.is-failed { stroke: var(--color-danger, #e11d48); }
.lmv__edge.is-done { stroke: var(--color-success, #28bf5c); }
.lmv__edge.is-paused { stroke: var(--color-text-secondary, #878c99); }
.lmv__edge.is-idle { stroke: var(--border-color); }

.lmv__flow { fill: var(--color-primary, #3b82f6); opacity: 0.85; }

/* ── 记忆脉冲 ── */
.lmv__pulse {
  fill: var(--color-primary, #3b82f6);
  opacity: 0;
  animation: lmv-pulse 4.8s ease-in-out infinite;
}
.lmv__pulse--interrupt { fill: var(--color-warning, #f59e0b); }
.lmv__pulse--emerge { fill: var(--color-success, #28bf5c); }
@keyframes lmv-pulse {
  0% { opacity: 0; transform: scale(0.4); }
  18% { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.9); }
}

/* ── 核心 ── */
.lmv__core-halo { fill: var(--color-primary, #3b82f6); opacity: 0.08; animation: lmv-breathe 3.8s ease-in-out infinite; }
.lmv__core-body { fill: var(--bg-card, var(--bg-primary)); stroke: var(--color-primary, #3b82f6); stroke-width: 1.6; }
.lmv__core-nucleus { fill: var(--color-primary, #3b82f6); animation: lmv-breathe 2.2s ease-in-out infinite; }
.lmv__core-label { fill: var(--text-secondary); font-size: 12px; text-anchor: middle; letter-spacing: 2px; }
@keyframes lmv-breathe { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

/* ── 思想核（任务实体）：语义标签可读 ── */
.lmv__thought { cursor: default; transition: opacity 0.4s ease; }
.lmv__thought--click { cursor: pointer; }
.lmv__thought-body { fill: var(--bg-card, var(--bg-primary)); stroke-width: 1.5; }
.lmv__thought.is-running .lmv__thought-body { stroke: var(--color-primary, #3b82f6); }
.lmv__thought.is-awaiting .lmv__thought-body { stroke: var(--color-warning, #f59e0b); }
.lmv__thought.is-failed .lmv__thought-body { stroke: var(--color-danger, #e11d48); }
.lmv__thought.is-done .lmv__thought-body { stroke: var(--color-success, #28bf5c); }
.lmv__thought.is-paused .lmv__thought-body { stroke: var(--color-text-secondary, #878c99); }
.lmv__thought.is-idle .lmv__thought-body { stroke: var(--border-color); }
.lmv__thought-dot { fill: var(--color-text-secondary, #878c99); }
.lmv__thought.is-running .lmv__thought-dot { fill: var(--color-primary, #3b82f6); }
.lmv__thought.is-awaiting .lmv__thought-dot { fill: var(--color-warning, #f59e0b); }
.lmv__thought.is-done .lmv__thought-dot { fill: var(--color-success, #28bf5c); }
.lmv__thought.is-failed .lmv__thought-dot { fill: var(--color-danger, #e11d48); }
.lmv__thought-aura { fill: transparent; }
.lmv__thought--hot .lmv__thought-aura { fill: var(--color-primary, #3b82f6); opacity: 0.1; animation: lmv-breathe 2.4s ease-in-out infinite; }
.lmv__thought--alert .lmv__thought-aura { fill: var(--color-warning, #f59e0b); opacity: 0.12; animation: lmv-pulse 3.6s ease-in-out infinite; }
.lmv__thought:hover .lmv__thought-body { stroke-width: 2.5; }

.lmv__thought-name { fill: var(--text-primary); font-size: 12px; font-weight: 600; text-anchor: middle; }
.lmv__thought-status { fill: var(--text-secondary); font-size: 10.5px; text-anchor: middle; }
.lmv__thought-count { fill: var(--color-text-secondary, #878c99); }

/* ── 末梢运行（运行尝试实体）── */
.lmv__run { cursor: pointer; transition: opacity 0.4s ease; }
.lmv__run-body { stroke-width: 1.2; fill: var(--bg-card, var(--bg-primary)); }
.lmv__run.is-running .lmv__run-body { fill: var(--color-primary, #3b82f6); stroke: var(--color-primary, #3b82f6); }
.lmv__run.is-awaiting .lmv__run-body { fill: var(--color-warning, #f59e0b); stroke: var(--color-warning, #f59e0b); }
.lmv__run.is-failed .lmv__run-body { fill: var(--color-danger, #e11d48); stroke: var(--color-danger, #e11d48); }
.lmv__run.is-done .lmv__run-body { fill: var(--bg-card, var(--bg-primary)); stroke: var(--color-success, #28bf5c); }
.lmv__run.is-paused .lmv__run-body { fill: var(--color-text-secondary, #878c99); stroke: var(--color-text-secondary, #878c99); }
.lmv__run.is-idle .lmv__run-body { fill: var(--bg-card, var(--bg-primary)); stroke: var(--border-color); }
.lmv__run-aura { fill: transparent; }
.lmv__run--hot .lmv__run-aura { fill: var(--color-primary, #3b82f6); opacity: 0.14; animation: lmv-breathe 1.9s ease-in-out infinite; }
.lmv__run--alert .lmv__run-aura { fill: var(--color-warning, #f59e0b); opacity: 0.16; animation: lmv-pulse 3s ease-in-out infinite; }
.lmv__run:hover .lmv__run-body { stroke-width: 2.2; }
.lmv__run-sub { fill: var(--color-text-secondary, #878c99); font-size: 9px; text-anchor: middle; }

/* 动效降级 */
@media (prefers-reduced-motion: reduce) {
  .lmv__core-halo, .lmv__core-nucleus,
  .lmv__thought--hot .lmv__thought-aura, .lmv__thought--alert .lmv__thought-aura,
  .lmv__run--hot .lmv__run-aura, .lmv__run--alert .lmv__run-aura {
    animation: none;
  }
  .lmv__edge { transition: none; }
}
</style>
