<!-- overlay/custom/client/ia2/components/MindViz.vue -->
<!-- 思维大脑渲染（2026-09-15 用户裁决：循环驾驶舱是动态增长的活动思维大脑，
     不需要人工编排）。渲染 buildMindScene 纯函数场景：
     核心神经元（外壳膜波纹+核呼吸）、思想核、突触可塑性（边宽随强度渐变）、
     running 沿边粒子流、待介入/涌现的记忆脉冲浮现、脑区微漂。
     prefers-reduced-motion 全量降级为静态。 -->
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

const coreNode = computed(() => props.scene.nodes.find(n => n.kind === 'core') ?? null)
const thoughtNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'loop' || n.kind === 'seed'))
const runNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'run'))

function tooltip(node: MindNode): string {
  const label = node.kind === 'core' ? t('loopMind.core') : node.label
  return node.sub ? `${label} · ${node.sub}` : label
}

function onNodeClick(node: MindNode): void {
  if (node.to) emit('node-click', node)
}

/** 边宽：突触可塑性（0.6..2.8px）+ 分支束内的次级衰减 */
function edgeWidth(edge: { strength: number; branchNo: number }): number {
  return 0.6 + edge.strength * 2.2 - edge.branchNo * 0.15
}

/** 边不透明度：强度驱动（新突触淡如雾） */
function edgeOpacity(edge: { strength: number }): number {
  return 0.12 + edge.strength * 0.62
}

/** 漂移：相位（秒）→ transform 内嵌的 CSS 变量，动画循环呼吸 */
function driftStyle(node: MindNode): Record<string, string> {
  return {
    '--drift-hz': String(node.driftHz),
    transform: `translate(${node.x}px, ${node.y}px)`,
  }
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
    <defs>
      <radialGradient id="lmvBg" cx="50%" cy="44%" r="78%">
        <stop offset="0%" stop-color="#101c2a" />
        <stop offset="52%" stop-color="#0a141f" />
        <stop offset="100%" stop-color="#060b12" />
      </radialGradient>
      <radialGradient id="lmvCore" cx="42%" cy="38%" r="80%">
        <stop offset="0%" stop-color="#4b2a6b" />
        <stop offset="45%" stop-color="#2a1842" />
        <stop offset="100%" stop-color="#130b1f" />
      </radialGradient>
      <radialGradient id="lmvCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.9" />
        <stop offset="65%" stop-color="#67e8f9" stop-opacity="0.24" />
        <stop offset="100%" stop-color="#67e8f9" stop-opacity="0" />
      </radialGradient>
      <filter id="lmvSoftGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="7" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="lmvFaintGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <rect class="lmv__bg" x="0" y="0" :width="scene.width" :height="scene.height" rx="16" fill="url(#lmvBg)" />

    <!-- 皮层涟漪：状态带的不透明度呼吸（不旋转，避免机械感） -->
    <g class="lmv__field" aria-hidden="true">
      <ellipse
        v-for="(band, i) in [
          { rx: 380, ry: 210, o: 0.10 },
          { rx: 300, ry: 160, o: 0.07 },
          { rx: 220, ry: 112, o: 0.05 },
        ]"
        :key="i"
        class="lmv__ripple"
        :cx="scene.width / 2"
        :cy="scene.height / 2"
        :rx="band.rx"
        :ry="band.ry"
        :style="{ '--ripple-opacity': band.o, animationDelay: `${i * 1.8}s` }"
      />
    </g>

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
          :r="1.9 + edge.strength * 1.6"
        >
          <animateMotion
            :dur="edge.branchNo === 0 ? '3.8s' : '2.7s'"
            repeatCount="indefinite"
            :path="edge.d"
          />
        </circle>
      </g>
    </g>

    <!-- 记忆脉冲（浮现→褪色）：pending/涌现/尖峰 -->
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
      <circle class="lmv__core-membrane" :r="coreNode.r + 18" />
      <circle class="lmv__core-halo" :r="coreNode.r + 9" />
      <circle class="lmv__core-body" :r="coreNode.r" fill="url(#lmvCore)" filter="url(#lmvSoftGlow)" />
      <circle class="lmv__core-glow" :r="coreNode.r - 6" fill="url(#lmvCoreGlow)" />
      <circle class="lmv__core-nucleus" :r="9" />
      <text class="lmv__core-label" :y="coreNode.r + 24">{{ t('loopMind.core') }}</text>
    </g>

    <!-- 思想核（循环/自建图） -->
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
      <circle class="lmv__thought-aura" :r="node.r + 11" />
      <circle class="lmv__thought-body" :r="node.r" filter="url(#lmvFaintGlow)" />
      <circle class="lmv__thought-core" :r="node.r * 0.44" />
      <text class="lmv__thought-label" :y="node.r + 19">{{ node.label }}</text>
    </g>

    <!-- 末梢运行（突触末梢） -->
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
      <circle v-if="node.pulse || node.highlight" class="lmv__run-aura" :r="node.r + 6" />
      <circle class="lmv__run-body" :r="node.r" />
      <circle class="lmv__run-dot" :r="node.r * 0.36" />
    </g>
  </svg>
</template>

<style scoped>
.lmv { display: block; width: 100%; height: 100%; }

/* 皮层涟漪：不透明度呼吸，不位移不旋转 */
.lmv__ripple {
  fill: none;
  stroke: rgba(103, 232, 249, var(--ripple-opacity, 0.07));
  stroke-width: 1.2;
  stroke-dasharray: 2 10;
  animation: lmv-breathe 7.5s ease-in-out infinite;
}
@keyframes lmv-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

/* ── 突触边 ── */
.lmv__edge {
  fill: none;
  stroke-linecap: round;
  stroke-dasharray: none;
  transition: stroke-width 0.7s ease, stroke-opacity 0.7s ease;
}
.lmv__edge.is-running { stroke: rgba(103, 232, 249, 0.9); }
.lmv__edge.is-awaiting { stroke: rgba(251, 191, 36, 0.75); }
.lmv__edge.is-failed { stroke: rgba(248, 113, 113, 0.65); }
.lmv__edge.is-done { stroke: rgba(52, 211, 153, 0.45); }
.lmv__edge.is-paused { stroke: rgba(167, 139, 250, 0.5); }
.lmv__edge.is-idle { stroke: rgba(100, 116, 139, 0.4); }

.lmv__flow { fill: #a5f3fc; opacity: 0.92; }

/* ── 记忆脉冲：浮现→褪色（生长的时间感）── */
.lmv__pulse {
  fill: #67e8f9;
  opacity: 0;
  animation: lmv-pulse 4.8s ease-in-out infinite;
}
.lmv__pulse--interrupt { fill: #fbbf24; }
.lmv__pulse--emerge { fill: #34d399; }
@keyframes lmv-pulse {
  0% { opacity: 0; transform: scale(0.4); }
  18% { opacity: 0.95; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.9); }
}

/* ── 核心神经元 ── */
.lmv__core { transform-box: fill-box; transform-origin: center; }
.lmv__core-membrane {
  fill: rgba(167, 139, 250, 0.08);
  animation: lmv-core-wave 5.5s ease-in-out infinite;
}
.lmv__core-halo {
  fill: rgba(103, 232, 249, 0.10);
  animation: lmv-breathe 3.8s ease-in-out infinite;
}
.lmv__core-body { stroke: rgba(167, 139, 250, 0.9); stroke-width: 1.6; }
.lmv__core-glow { animation: lmv-breathe 2.6s ease-in-out infinite; }
.lmv__core-nucleus { fill: #e9d5ff; animation: lmv-breathe 2.2s ease-in-out infinite; }
.lmv__core-label {
  fill: rgba(233, 213, 255, 0.9);
  font-size: 12px;
  text-anchor: middle;
  letter-spacing: 2.5px;
}
@keyframes lmv-core-wave {
  0%, 100% { transform: scale(0.96); opacity: 0.5; }
  50% { transform: scale(1.05); opacity: 1; }
}

/* ── 思想核 ── */
.lmv__thought {
  cursor: default;
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  animation: lmv-drift calc(1s / max(var(--drift-hz, 0.4), 0.001)) ease-in-out infinite alternate;
}
.lmv__thought--click { cursor: pointer; }
.lmv__thought-body { fill: #140d1f; stroke-width: 1.5; }
.lmv__thought.is-running .lmv__thought-body { stroke: #67e8f9; }
.lmv__thought.is-awaiting .lmv__thought-body { stroke: #fbbf24; }
.lmv__thought.is-failed .lmv__thought-body { stroke: #f87171; }
.lmv__thought.is-done .lmv__thought-body { stroke: #34d399; }
.lmv__thought.is-paused .lmv__thought-body { stroke: #a78bfa; }
.lmv__thought.is-idle .lmv__thought-body { stroke: #64748b; }
.lmv__thought-core { fill: rgba(167, 139, 250, 0.32); }
.lmv__thought.is-running .lmv__thought-core { fill: rgba(103, 232, 249, 0.55); }
.lmv__thought.is-awaiting .lmv__thought-core { fill: rgba(251, 191, 36, 0.55); }
.lmv__thought.is-done .lmv__thought-core { fill: rgba(52, 211, 153, 0.4); }
.lmv__thought-aura { fill: transparent; }
.lmv__thought--hot .lmv__thought-aura { fill: rgba(103, 232, 249, 0.12); animation: lmv-breathe 2.4s ease-in-out infinite; }
.lmv__thought--alert .lmv__thought-aura { fill: rgba(251, 191, 36, 0.13); animation: lmv-pulse 3.6s ease-in-out infinite; }
.lmv__thought:hover .lmv__thought-body { filter: drop-shadow(0 0 8px rgba(103, 232, 249, 0.7)); }
.lmv__thought-label {
  fill: rgba(233, 213, 255, 0.88);
  font-size: 11.5px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(6, 11, 18, 0.85);
  stroke-width: 3px;
}
@keyframes lmv-drift {
  from { transform: translate(-2.5px, 1.8px); }
  to { transform: translate(2.2px, -2px); }
}

/* ── 末梢运行 ── */
.lmv__run {
  cursor: pointer;
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  animation: lmv-drift calc(1s / max(var(--drift-hz, 0.5), 0.001)) ease-in-out infinite alternate;
}
.lmv__run-body { stroke-width: 1.2; }
.lmv__run.is-running .lmv__run-body { fill: #67e8f9; stroke: #a5f3fc; }
.lmv__run.is-awaiting .lmv__run-body { fill: #fbbf24; stroke: #fde68a; }
.lmv__run.is-failed .lmv__run-body { fill: #f87171; stroke: #fecaca; }
.lmv__run.is-done .lmv__run-body { fill: #12322a; stroke: #34d399; }
.lmv__run.is-paused .lmv__run-body { fill: #a78bfa; stroke: #ddd6fe; }
.lmv__run.is-idle .lmv__run-body { fill: #1e293b; stroke: #64748b; }
.lmv__run-dot { fill: rgba(255, 255, 255, 0.85); }
.lmv__run.is-done .lmv__run-dot { fill: rgba(52, 211, 153, 0.5); }
.lmv__run.is-idle .lmv__run-dot { fill: rgba(100, 116, 139, 0.5); }
.lmv__run-aura { fill: transparent; }
.lmv__run--hot .lmv__run-aura { fill: rgba(103, 232, 249, 0.16); animation: lmv-breathe 1.9s ease-in-out infinite; }
.lmv__run--alert .lmv__run-aura { fill: rgba(251, 191, 36, 0.18); animation: lmv-pulse 3s ease-in-out infinite; }
.lmv__run:hover .lmv__run-body { filter: drop-shadow(0 0 5px currentColor); }

/* 动效降级 */
@media (prefers-reduced-motion: reduce) {
  .lmv__ripple, .lmv__core-membrane, .lmv__core-halo, .lmv__core-glow, .lmv__core-nucleus,
  .lmv__thought--hot .lmv__thought-aura, .lmv__thought--alert .lmv__thought-aura,
  .lmv__run--hot .lmv__run-aura, .lmv__run--alert .lmv__run-aura,
  .lmv__thought, .lmv__run {
    animation: none;
  }
  .lmv__edge { transition: none; }
}
</style>
