<!-- overlay/custom/client/ia2/components/BackgroundWorkStrip.vue -->
<!-- 后台任务执行感知条（2026-10-04 三件套②+③）：「N 路执行中」chip（点击跳看板）
     + 推演运行态（harness run-progress.json 契约，缺文件=无推演=整条隐藏）。
     挂 IaGlobalTop 页头下（与 delivery-strip 同层）。静默执行期驾驶舱由此有活体信号，
     兑现全链路追踪设计在「执行」环的可见性。
     2026-10-10 根治轮（用户裁定「根治」）：单行纪律——agent 活跃多时不再 wrap
     成多行撑高顶区（run13 14 agent 实测 26px→49px+），改为隐藏测量行自适应
     限量显示 + 尾部「+N」chip（悬浮=全量名单，点击跳看板）；运行态长 chip
     加 max-width+ellipsis（整文在悬浮提示）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { pickBgworkMessages } from '@/custom/ia2/i18n-bgwork'
import { useAgentActivity } from '@/custom/ia2/composables/useAgentActivity'
import { useFitSlice } from '@/custom/ia2/composables/useFitSlice'
import { authFetch } from '@/custom/ide/utils/auth-fetch'

const i18nCtx = useI18n()
const router = useRouter()
const L = computed(() => pickBgworkMessages((i18nCtx as { locale?: { value?: string } })?.locale?.value))

const { activity, activeProfiles, releaseAgentActivity } = useAgentActivity()
const activeCount = computed(() => activeProfiles.value.length)

// ── 推演运行态（③）：/api/sim/run-progress 30s 轮询 ──
interface RunProgress { runId: string; done: number; total: number; doneSteps: string[]; updatedTs: number; scope?: 'lite'; fixturesFrom?: string }
const run = ref<RunProgress | null>(null)
const now = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | null = null
let runTimer: ReturnType<typeof setInterval> | null = null

async function refreshRun(): Promise<void> {
  try {
    const res = await authFetch('/api/sim/run-progress')
    if (!res.ok) { run.value = null; return }
    const data = (await res.json()) as { ok?: boolean; run?: { runId: string; done: number; total: number; doneSteps?: string[]; updatedTs: number; scope?: 'lite'; fixturesFrom?: string } | null }
    run.value = data.ok && data.run ? { ...data.run, doneSteps: data.run.doneSteps ?? [] } : null
  } catch { run.value = null }
}

onMounted(() => {
  void refreshRun()
  timer = setInterval(() => { now.value = Math.floor(Date.now() / 1000) }, 5_000)
  // 2026-10-04 24h 审查：run 只在挂载时取一次，进度/陈旧判定从此冻结——挂载 5 分钟后
  // 必然误报「无进展」，推演明明在走也看不到。按本段注释声明 30s 轮询补上独立表
  // （now 的 5s 表只管相对时钟，不打端点）。
  runTimer = setInterval(() => { void refreshRun() }, 30_000)
})
onUnmounted(() => { if (timer) clearInterval(timer); if (runTimer) clearInterval(runTimer); releaseAgentActivity() })

const latestStep = computed(() => run.value?.doneSteps?.[run.value.doneSteps.length - 1] ?? '')
const runStaleMin = computed(() => run.value ? Math.floor((now.value - run.value.updatedTs) / 60) : 0)
const lastActiveSecOf = (p: string) => {
  const a = activity.value[p]
  return a && a.lastActiveAt > 0 ? Math.max(0, Math.floor(Date.now() / 1000 - a.lastActiveAt / 1000)) : null
}
const fmt = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))

const showStrip = computed(() => activeCount.value > 0 || !!run.value)
function gotoBoard(): void { void router.push({ name: 'ia2.board' }) }

// ── 2026-10-10 根治轮：agent chip 自适应限量 ──
// 容器=整条 strip；reserved=live chip + run chip 的实测占位（run chip 会被 ellipsis
// 压缩，取其 clamp 后宽度即当前真实宽度）。秒数滴答会改 chip 文本宽度——
// deps 盯 activeProfiles，宽度每轮重测（隐藏测量行很小，代价可忽略）。
const stripEl = ref<HTMLElement | null>(null)
const measureEl = ref<HTMLElement | null>(null)
const liveEl = ref<HTMLElement | null>(null)
const runEl = ref<HTMLElement | null>(null)
const { visibleCount } = useFitSlice({
  container: stripEl,
  measurer: measureEl,
  selector: '.bchip--agent',
  gap: 6,
  moreWidth: 48,
  reserved: () => (liveEl.value?.offsetWidth ?? 0) + (runEl.value?.offsetWidth ?? 0) + 6,
  deps: [activeProfiles, () => lastActiveSecOf(activeProfiles.value[0] ?? '')],
})
const visibleAgents = computed(() => activeProfiles.value.slice(0, Math.min(visibleCount.value, activeProfiles.value.length)))
const hiddenAgents = computed(() => activeProfiles.value.slice(visibleAgents.value.length))
</script>

<template>
  <div v-if="showStrip" ref="stripEl" class="bgwork-strip" data-testid="bgwork-strip">
    <button ref="liveEl" type="button" class="bchip bchip--live" data-testid="bgwork-active" :title="activeProfiles.join(', ') || L.noActivity" @click="gotoBoard">
      <span class="bchip__dot" />{{ fmt(L.executingRoutes, { n: activeCount }) }}
    </button>
    <span v-for="p in visibleAgents" :key="p" class="bchip bchip--agent" :title="fmt(L.lastActive, { sec: lastActiveSecOf(p) ?? '—' })">
      @{{ p }}<template v-if="lastActiveSecOf(p) !== null"> · {{ lastActiveSecOf(p) }}s</template>
    </span>
    <button
      v-if="hiddenAgents.length > 0"
      type="button" class="bchip bchip--more" data-testid="bgwork-more"
      :title="hiddenAgents.join(', ')" @click="gotoBoard"
    >+{{ hiddenAgents.length }}</button>
    <span v-if="run" ref="runEl" class="bchip bchip--run" data-testid="bgwork-run" :title="fmt(L.updatedAgo, { sec: Math.max(0, now - run.updatedTs) })">
      {{ L.runTitle }} {{ run.runId }}<template v-if="run.scope === 'lite'"> · {{ fmt(L.runMetaLite, { done: run.done, total: run.total, step: latestStep || '—', from: run.fixturesFrom || '—' }) }}</template><template v-else> · {{ fmt(L.runMeta, { done: run.done, total: run.total, step: latestStep || '—' }) }}</template>
      <template v-if="runStaleMin >= 5"> · {{ fmt(L.stale, { min: runStaleMin }) }}</template>
    </span>
    <!-- 隐藏测量行：全量 agent chip 取真实宽度（秒数变化每轮重测） -->
    <div ref="measureEl" class="bgwork__measure" aria-hidden="true">
      <span v-for="p in activeProfiles" :key="`m-${p}`" class="bchip bchip--agent">
        @{{ p }}<template v-if="lastActiveSecOf(p) !== null"> · {{ lastActiveSecOf(p) }}s</template>
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bgwork-strip {
  // 2026-10-10 根治轮：单行纪律（nowrap）——多 agent 满载靠自适应限量+「+N」
  // 消化，不再 wrap 撑高顶区；overflow hidden 为测量滞后兜底。
  display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow: hidden;
  padding: 2px 14px; font-size: 11px;
  position: relative;
}
.bchip {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 999px;
  background: var(--bg-primary, #fff); padding: 1px 9px;
  color: var(--text-muted, #878c99); font-size: 11px; font-family: inherit;
  flex-shrink: 0;
}
.bchip--live { cursor: pointer; color: #15803d; border-color: #bbf7d0; &:hover { background: #f0fdf4; } }
.bchip__dot {
  width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
  animation: bgwork-pulse 1.6s ease-in-out infinite;
}
.bchip--agent { color: var(--text-primary, inherit); }
.bchip--more {
  cursor: pointer; color: var(--text-secondary, inherit); font-weight: 600;
  min-width: 36px; justify-content: center;
}
.bchip--run {
  color: #1d4ed8; border-color: #bfdbfe;
  // 根治轮：长 run 文本（runId+回归轮元数据+陈旧提示可达 600px+）单行省略，
  // 不再把窄容器里的其它 chip 挤没；完整内容在悬浮提示。
  flex-shrink: 1; min-width: 0; max-width: 46%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bgwork__measure {
  position: absolute; visibility: hidden; pointer-events: none;
  display: flex; gap: 6px; width: max-content; height: 0; overflow: hidden; top: 0; left: 0;
}
@keyframes bgwork-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
</style>
