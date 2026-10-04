<!-- overlay/custom/client/ia2/components/BackgroundWorkStrip.vue -->
<!-- 后台任务执行感知条（2026-10-04 三件套②+③）：「N 路执行中」chip（点击跳看板）
     + 推演运行态（harness run-progress.json 契约，缺文件=无推演=整条隐藏）。
     挂 IaGlobalTop 页头下（与 delivery-strip 同层）。静默执行期驾驶舱由此有活体信号，
     兑现全链路追踪设计在「执行」环的可见性。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { pickBgworkMessages } from '@/custom/ia2/i18n-bgwork'
import { useAgentActivity } from '@/custom/ia2/composables/useAgentActivity'
import { authFetch } from '@/custom/ide/utils/auth-fetch'

const i18nCtx = useI18n()
const router = useRouter()
const L = computed(() => pickBgworkMessages((i18nCtx as { locale?: { value?: string } })?.locale?.value))

const { activity, activeProfiles, releaseAgentActivity } = useAgentActivity()
const activeCount = computed(() => activeProfiles.value.length)

// ── 推演运行态（③）：/api/sim/run-progress 30s 轮询 ──
interface RunProgress { runId: string; done: number; total: number; doneSteps: string[]; updatedTs: number }
const run = ref<RunProgress | null>(null)
const now = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | null = null

async function refreshRun(): Promise<void> {
  try {
    const res = await authFetch('/api/sim/run-progress')
    if (!res.ok) { run.value = null; return }
    const data = (await res.json()) as { ok?: boolean; run?: { runId: string; done: number; total: number; doneSteps?: string[]; updatedTs: number } | null }
    run.value = data.ok && data.run ? { ...data.run, doneSteps: data.run.doneSteps ?? [] } : null
  } catch { run.value = null }
}

onMounted(() => {
  void refreshRun()
  timer = setInterval(() => { now.value = Math.floor(Date.now() / 1000) }, 5_000)
})
onUnmounted(() => { if (timer) clearInterval(timer); releaseAgentActivity() })

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
</script>

<template>
  <div v-if="showStrip" class="bgwork-strip" data-testid="bgwork-strip">
    <button type="button" class="bchip bchip--live" data-testid="bgwork-active" :title="activeProfiles.join(', ') || L.noActivity" @click="gotoBoard">
      <span class="bchip__dot" />{{ fmt(L.executingRoutes, { n: activeCount }) }}
    </button>
    <span v-for="p in activeProfiles" :key="p" class="bchip bchip--agent" :title="fmt(L.lastActive, { sec: lastActiveSecOf(p) ?? '—' })">
      @{{ p }}<template v-if="lastActiveSecOf(p) !== null"> · {{ lastActiveSecOf(p) }}s</template>
    </span>
    <span v-if="run" class="bchip bchip--run" data-testid="bgwork-run" :title="fmt(L.updatedAgo, { sec: Math.max(0, now - run.updatedTs) })">
      {{ L.runTitle }} {{ run.runId }} · {{ fmt(L.runMeta, { done: run.done, total: run.total, step: latestStep || '—' }) }}
      <template v-if="runStaleMin >= 5"> · {{ fmt(L.stale, { min: runStaleMin }) }}</template>
    </span>
  </div>
</template>

<style scoped lang="scss">
.bgwork-strip {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 2px 14px; font-size: 11px;
}
.bchip {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 999px;
  background: var(--bg-primary, #fff); padding: 1px 9px;
  color: var(--text-muted, #878c99); font-size: 11px; font-family: inherit;
}
.bchip--live { cursor: pointer; color: #15803d; border-color: #bbf7d0; &:hover { background: #f0fdf4; } }
.bchip__dot {
  width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
  animation: bgwork-pulse 1.6s ease-in-out infinite;
}
.bchip--agent { color: var(--text-primary, inherit); }
.bchip--run { color: #1d4ed8; border-color: #bfdbfe; }
@keyframes bgwork-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
</style>
