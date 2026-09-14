<!-- overlay/custom/client/ia2/components/LoopGrowthViz.vue -->
<!-- 循环生长图（驾驶舱中央态势）：渲染 buildGrowthScene 纯函数产出的场景。
     动画语言：根/分支 draw-in（pathLength=1 + dashoffset）、运行节点呼吸、
     running 分支沿边粒子流（SMIL animateMotion）、雷达扫描线。
     prefers-reduced-motion 全量降级为静态图（无动画仍有完整信息）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GrowthNode, GrowthScene } from '../adapters/growth'

const props = defineProps<{ scene: GrowthScene }>()
const emit = defineEmits<{ (e: 'node-click', node: GrowthNode): void }>()
const { t } = useI18n()

/** 节点状态 → 色板 class（驾驶舱霓虹体系，scoped 内定义） */
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
const sectorNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'loop' || n.kind === 'seed'))
const runNodes = computed(() => props.scene.nodes.filter(n => n.kind === 'run'))

function tooltip(node: GrowthNode): string {
  const kindLabel = node.kind === 'core'
    ? t('loopCockpit.viz.core')
    : node.kind === 'run' ? node.label : node.label
  return node.sub ? `${kindLabel} · ${node.sub}` : kindLabel
}

function onNodeClick(node: GrowthNode): void {
  if (node.to) emit('node-click', node)
}
</script>

<template>
  <svg
    class="lgv"
    :viewBox="`0 0 ${scene.width} ${scene.height}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="t('loopCockpit.title')"
  >
    <defs>
      <radialGradient id="lgvBg" cx="50%" cy="46%" r="72%">
        <stop offset="0%" stop-color="#0e2233" />
        <stop offset="55%" stop-color="#0a1622" />
        <stop offset="100%" stop-color="#070d15" />
      </radialGradient>
      <linearGradient id="lgvSweep" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
      </linearGradient>
    </defs>

    <rect class="lgv__bg" x="0" y="0" :width="scene.width" :height="scene.height" rx="14" fill="url(#lgvBg)" />

    <!-- 雷达环 + 刻度环 -->
    <g class="lgv__rings" aria-hidden="true">
      <circle
        v-for="r in [150, 230, 310, 390]"
        :key="r"
        class="lgv__ring"
        :cx="scene.width / 2"
        :cy="scene.height / 2"
        :r="r"
      />
      <g class="lgv__sweep" :style="{ transformOrigin: `${scene.width / 2}px ${scene.height / 2}px` }">
        <rect
          :x="scene.width / 2 - 1.5"
          :y="scene.height / 2 - 390"
          width="3"
          height="390"
          fill="url(#lgvSweep)"
        />
      </g>
    </g>

    <!-- 边（根边 + 生长分支）与粒子流 -->
    <g class="lgv__edges">
      <path
        v-for="edge in scene.edges"
        :key="edge.id"
        class="lgv__edge"
        :class="statusClass(edge.status)"
        :d="edge.d"
        pathLength="1"
      />
      <g class="lgv__flows" aria-hidden="true">
        <circle v-for="edge in scene.edges.filter(e => e.flow)" :key="`f-${edge.id}`" class="lgv__flow" r="2.4">
          <animateMotion :dur="edge.from === 'core' ? '3.4s' : '2.6s'" repeatCount="indefinite" :path="edge.d" />
        </circle>
      </g>
    </g>

    <!-- 节点 -->
    <g v-if="coreNode" class="lgv__core" :style="{ transform: `translate(${coreNode.x}px, ${coreNode.y}px)` }">
      <circle class="lgv__core-halo" :r="coreNode.r + 10" />
      <circle class="lgv__core-body" :r="coreNode.r" />
      <circle class="lgv__core-seed" :r="9" />
      <text class="lgv__core-label" :y="coreNode.r + 22">{{ t('loopCockpit.viz.core') }}</text>
    </g>

    <g
      v-for="node in sectorNodes"
      :key="node.id"
      class="lgv__sector"
      :class="[statusClass(node.status), { 'lgv__sector--click': !!node.to }]"
      :style="{ transform: `translate(${node.x}px, ${node.y}px)` }"
      :role="node.to ? 'button' : undefined"
      tabindex="-1"
      @click="onNodeClick(node)"
    >
      <title>{{ tooltip(node) }}</title>
      <circle class="lgv__sector-halo" :r="node.r + 7" />
      <circle class="lgv__sector-body" :r="node.r" />
      <text class="lgv__sector-label" :y="node.r + 17">{{ node.label }}</text>
    </g>

    <g
      v-for="node in runNodes"
      :key="node.id"
      class="lgv__run"
      :class="statusClass(node.status)"
      :style="{ transform: `translate(${node.x}px, ${node.y}px)` }"
      role="button"
      tabindex="-1"
      @click="onNodeClick(node)"
    >
      <title>{{ tooltip(node) }}</title>
      <!-- 完成态绽放：四片花瓣 -->
      <g v-if="node.status === 'completed'" class="lgv__bloom" aria-hidden="true">
        <circle v-for="k in 4" :key="k" cx="0" :cy="-(node.r + 4)" :r="2.2" />
      </g>
      <circle v-if="node.pulse" class="lgv__run-halo" :r="node.r + 5" />
      <circle class="lgv__run-body" :r="node.r" />
    </g>
  </svg>
</template>

<style scoped>
.lgv { display: block; width: 100%; height: 100%; }

.lgv__ring {
  fill: none;
  stroke: rgba(56, 189, 248, 0.07);
  stroke-width: 1;
  stroke-dasharray: 3 7;
}

/* 雷达扫描：12s 一圈 */
.lgv__sweep { animation: lgv-sweep 12s linear infinite; }
@keyframes lgv-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ── 边 ── */
.lgv__edge {
  fill: none;
  stroke-width: 1.4;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: lgv-draw 0.9s ease-out both;
}
@keyframes lgv-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }

.lgv__edge.is-running { stroke: rgba(34, 211, 238, 0.75); }
.lgv__edge.is-awaiting { stroke: rgba(251, 191, 36, 0.6); }
.lgv__edge.is-failed { stroke: rgba(248, 113, 113, 0.55); }
.lgv__edge.is-done { stroke: rgba(52, 211, 153, 0.4); }
.lgv__edge.is-paused { stroke: rgba(167, 139, 250, 0.45); }
.lgv__edge.is-idle { stroke: rgba(100, 116, 139, 0.35); }

.lgv__flow { fill: #67e8f9; opacity: 0.9; }

/* ── 核心 ── */
.lgv__core-halo { fill: rgba(34, 211, 238, 0.10); animation: lgv-breathe 3.2s ease-in-out infinite; }
.lgv__core-body { fill: #0b2a3a; stroke: #22d3ee; stroke-width: 1.6; }
.lgv__core-seed { fill: #22d3ee; animation: lgv-breathe 2.2s ease-in-out infinite; }
.lgv__core-label { fill: rgba(103, 232, 249, 0.85); font-size: 11px; text-anchor: middle; letter-spacing: 2px; }
@keyframes lgv-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

/* ── 扇区（loop/seed） ── */
.lgv__sector { transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1); cursor: default; }
.lgv__sector--click { cursor: pointer; }
.lgv__sector-body { fill: #0d1b28; stroke-width: 1.5; }
.lgv__sector.is-running .lgv__sector-body { stroke: #22d3ee; }
.lgv__sector.is-awaiting .lgv__sector-body { stroke: #fbbf24; }
.lgv__sector.is-failed .lgv__sector-body { stroke: #f87171; }
.lgv__sector.is-done .lgv__sector-body { stroke: #34d399; }
.lgv__sector.is-paused .lgv__sector-body { stroke: #a78bfa; }
.lgv__sector.is-idle .lgv__sector-body { stroke: #64748b; }
.lgv__sector.is-running .lgv__sector-halo { fill: rgba(34, 211, 238, 0.14); animation: lgv-breathe 2.6s ease-in-out infinite; }
.lgv__sector.is-awaiting .lgv__sector-halo { fill: rgba(251, 191, 36, 0.10); }
.lgv__sector.is-failed .lgv__sector-halo { fill: rgba(248, 113, 113, 0.10); }
.lgv__sector-halo { fill: transparent; }
.lgv__sector-label {
  fill: rgba(148, 197, 226, 0.9);
  font-size: 11.5px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(7, 13, 21, 0.85);
  stroke-width: 3px;
}
.lgv__sector:hover .lgv__sector-body { filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.8)); }

/* ── run 端点 ── */
.lgv__run { transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1); cursor: pointer; }
.lgv__run-body { stroke-width: 1.2; }
.lgv__run.is-running .lgv__run-body { fill: #22d3ee; stroke: #a5f3fc; }
.lgv__run.is-awaiting .lgv__run-body { fill: #fbbf24; stroke: #fde68a; }
.lgv__run.is-failed .lgv__run-body { fill: #f87171; stroke: #fecaca; }
.lgv__run.is-done .lgv__run-body { fill: #0d2b22; stroke: #34d399; }
.lgv__run.is-paused .lgv__run-body { fill: #a78bfa; stroke: #ddd6fe; }
.lgv__run.is-idle .lgv__run-body { fill: #1e293b; stroke: #64748b; }
.lgv__run.is-running .lgv__run-halo { fill: rgba(34, 211, 238, 0.25); animation: lgv-pulse 1.8s ease-out infinite; }
.lgv__run.is-awaiting .lgv__run-halo { fill: rgba(251, 191, 36, 0.2); animation: lgv-pulse 2.4s ease-out infinite; }
.lgv__run-halo { fill: transparent; }
.lgv__run:hover .lgv__run-body { filter: drop-shadow(0 0 5px currentColor); }
@keyframes lgv-pulse { 0% { opacity: 0.9; } 100% { opacity: 0; } }

.lgv__bloom circle { fill: rgba(52, 211, 153, 0.55); }
.lgv__bloom circle:nth-child(2) { transform: rotate(90deg); }
.lgv__bloom circle:nth-child(3) { transform: rotate(180deg); }
.lgv__bloom circle:nth-child(4) { transform: rotate(270deg); }

/* 动效降级：尊重系统减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .lgv__sweep, .lgv__core-halo, .lgv__core-seed,
  .lgv__sector.is-running .lgv__sector-halo,
  .lgv__run.is-running .lgv__run-halo, .lgv__run.is-awaiting .lgv__run-halo {
    animation: none;
  }
  .lgv__edge { animation: none; }
  .lgv__sector, .lgv__run { transition: none; }
}
</style>
