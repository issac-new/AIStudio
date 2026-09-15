<!-- overlay/custom/client/ia2/components/MindViz.vue -->
<!-- 思维大脑渲染（2026-09-15 重设计 v2：语义优先 + 全局色彩一致）。
     用户反馈修正：①色彩走全局 CSS 变量（浅色 Pure Ink 体系，与 app 一致）；
     ②核心思维图必须有有效信息——每个思想核带可读任务名 + 状态词 + 运行计数，
     末梢带状态色点 + 时长标签；图例升级为语义说明（什么颜色=什么状态）。
     prefers-reduced-motion 降级为静态。 -->
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

/** 状态 → 可读语义词（i18n） */
function statusLabel(status: string): string {
  return t(`loopMind.status.${status}`)
}

const coreNode = computed(() => props.scene.nodes.find(n => n.kind === 'core') ?? null)
const thoughtNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'thought'))
const runNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'run'))

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

function driftStyle(node: MindNode): Record<string, string> {
  return {
    '--drift-hz': String(node.driftHz),
    transform: `translate(${node.x}px, ${node.y}px)`,
  }
}

/** 末梢副标：运行时长（时长即生长体量，语义可读） */
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
    <!-- 突触（有机曲线 + 可塑性宽度）与沿边粒子 -->
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

    <!-- 核心神经元 -->
    <g v-if="coreNode" class="lmv__core" :style="{ transform: `translate(${coreNode.x}px, ${coreNode.y}px)` }">
      <circle class="lmv__core-halo" :r="coreNode.r + 10" />
      <circle class="lmv__core-body" :r="coreNode.r" />
      <circle class="lmv__core-nucleus" :r="9" />
      <text class="lmv__core-label" :y="coreNode.r + 22">{{ t('loopMind.core') }}</text>
    </g>

    <!-- 思想核（任务）：带可读语义标签——任务名 + 状态词 + 运行计数 -->
    <g
      v-for="node in thoughtNodes"
      :key="node.id"
      class="lmv__thought"
      :class="[statusClass(node.status), { 'lmv__thought--click': !!node.to, 'lmv__thought--hot': node.pulse, 'lmv__thought--alert': node.highlight }]"
      :style="driftStyle(node)"
      :role="node.to ? 'button' : undefined"
      tabindex="-1"
      @click="onNodeClick(node)"
    >
      <title>{{ tooltip(node) }}</title>
      <circle class="lmv__thought-aura" :r="node.r + 8" />
      <circle class="lmv__thought-body" :r="node.r" />
      <circle class="lmv__thought-dot" :r="4" />
      <!-- 语义标签组：任务名（截断）+ 状态词 + 运行计数 -->
      <g class="lmv__thought-tag" :transform="`translate(0, ${node.r + 8})`">
        <text class="lmv__thought-name" y="0">{{ node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label }}</text>
        <text class="lmv__thought-status" y="13">{{ statusLabel(node.status) }}<tspan v-if="node.sub" class="lmv__thought-count"> · {{ node.sub }}</tspan></text>
      </g>
    </g>

    <!-- 末梢运行（突触末梢）：状态色点 + 时长副标 -->
    <g
      v-for="node in runNodes"
      :key="node.id"
      class="lmv__run"
      :class="[statusClass(node.status), { 'lmv__run--hot': node.pulse, 'lmv__run--alert': node.highlight }]"
      :style="driftStyle(node)"
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
/* ── 全局色彩一致（Pure Ink CSS 变量，浅色体系；不自定义色值） ── */
.lmv { display: block; width: 100%; height: 100%; background: transparent; }

/* ── 突触边（语义着色：用全局状态变量） ── */
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

.lmv__flow { fill: var(--color-primary, #3b82f6); opacity: 0.9; }

/* ── 记忆脉冲：浮现→褪色 ── */
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

/* ── 核心神经元 ── */
.lmv__core { transform-box: fill-box; transform-origin: center; }
.lmv__core-halo {
  fill: var(--color-primary, #3b82f6);
  opacity: 0.08;
  animation: lmv-breathe 3.8s ease-in-out infinite;
}
.lmv__core-body {
  fill: var(--bg-card, var(--bg-primary));
  stroke: var(--color-primary, #3b82f6);
  stroke-width: 1.6;
}
.lmv__core-nucleus { fill: var(--color-primary, #3b82f6); animation: lmv-breathe 2.2s ease-in-out infinite; }
.lmv__core-label {
  fill: var(--text-secondary);
  font-size: 12px;
  text-anchor: middle;
  letter-spacing: 2px;
}
@keyframes lmv-breathe {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* ── 思想核（任务）：语义标签可读 ── */
.lmv__thought {
  cursor: default;
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  animation: lmv-drift calc(1s / max(var(--drift-hz, 0.4), 0.001)) ease-in-out infinite alternate;
}
.lmv__thought--click { cursor: pointer; }
.lmv__thought-body {
  fill: var(--bg-card, var(--bg-primary));
  stroke-width: 1.5;
}
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

/* 语义标签（任务名 + 状态词 + 计数） */
.lmv__thought-name {
  fill: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  text-anchor: middle;
}
.lmv__thought-status {
  fill: var(--text-secondary);
  font-size: 10.5px;
  text-anchor: middle;
}
.lmv__thought-count { fill: var(--color-text-secondary, #878c99); }
@keyframes lmv-drift {
  from { transform: translate(-2px, 1.5px); }
  to { transform: translate(2px, -1.5px); }
}

/* ── 末梢运行：状态色点 + 时长副标 ── */
.lmv__run {
  cursor: pointer;
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  animation: lmv-drift calc(1s / max(var(--drift-hz, 0.5), 0.001)) ease-in-out infinite alternate;
}
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
.lmv__run-sub {
  fill: var(--color-text-secondary, #878c99);
  font-size: 9px;
  text-anchor: middle;
}

/* 动效降级 */
@media (prefers-reduced-motion: reduce) {
  .lmv__core-halo, .lmv__core-nucleus,
  .lmv__thought--hot .lmv__thought-aura, .lmv__thought--alert .lmv__thought-aura,
  .lmv__run--hot .lmv__run-aura, .lmv__run--alert .lmv__run-aura,
  .lmv__thought, .lmv__run {
    animation: none;
  }
  .lmv__edge { transition: none; }
}
</style>
