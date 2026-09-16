<!-- overlay/custom/client/ia2/views/LoopCockpitView.vue -->
<!-- 循环驾驶舱壳（2026-09-16 多视图重构）：页头 + 场景切换条 + router-view。
     四场景（总览/管理/Code/运维）由 buildSceneChildren 双挂载（/app 与
     /hermes/loop）。壳武装四场景共享数据流（workspace 聚合/runs/loops），
     场景专属武装在场景内（总览 = mind 投影订阅）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useWorkspaceStore } from '../store/workspace'
import { IA_SCENES, IA2_SCENE_NAMES, LOOP_SCENE_NAMES, sceneForRouteName } from '../routes'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const workspace = useWorkspaceStore()

/** 订阅域上限（awaiting + running 实时生长订阅；超出裁 running 尾部） */
const SUBSCRIBE_CAP = 30

// ── 页头时钟（60s 步进，卸载即停） ──
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
/** 卸载标记：bootShared 的 await 间隙用户可能已离开 */
let shellDisposed = false

const clockLabel = computed(() => {
  const d = new Date(nowTick.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})

// ── 场景切换（当前挂载点家族内跳转，不跨挂载点） ──
const sceneNames = computed(() =>
  String(route.name ?? '').startsWith('hermes.loop') ? LOOP_SCENE_NAMES : IA2_SCENE_NAMES)
const activeScene = computed(() => sceneForRouteName(route.name as string))

onMounted(() => {
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 60_000)
  // 四场景共享武装（与重构前同一序列，幂等）
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void bootShared()
})
onUnmounted(() => {
  shellDisposed = true
  if (tickTimer) clearInterval(tickTimer)
  workspace.unwatchKanbanTasks()
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
})

async function bootShared(): Promise<void> {
  await runsStore.fetchRuns()
  if (shellDisposed) return
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
}

// ── 页头动作区（跨挂载点行为与重构前一致：固定跳 ia2.* 家族路由） ──
const moreOpen = ref(false)
const goRuns = () => void router.push({ name: 'ia2.runs' })
const MORE_ITEMS = [
  { key: 'inbox', label: 'ia2.nav.inbox', go: () => void router.push({ name: 'ia2.inbox' }) },
  { key: 'tasks', label: 'ia2.nav.tasks', go: () => void router.push({ path: '/app/tasks' }) },
  { key: 'comms', label: 'ia2.nav.comms', go: () => void router.push({ name: 'ia2.comms' }) },
  { key: 'settings', label: 'ia2.nav.settings', go: () => void router.push('/hermes/settings') },
]
</script>

<template>
  <div class="lcp" data-testid="loop-cockpit">
    <!-- ═══ 页头：品牌 + 状态 + 动作（驾驶舱指令区） ═══ -->
    <header class="lcp-top">
      <div class="lcp-top__brand">
        <span class="lcp-top__mark" aria-hidden="true" />
        <div class="lcp-top__titles">
          <h2 class="lcp-top__title">{{ t('loopMind.title') }}</h2>
          <span class="lcp-top__tagline">{{ t('loopMind.tagline') }}</span>
        </div>
      </div>

      <div class="lcp-top__status">
        <span class="lcp-pill" :class="runsStore.connection === 'connected' ? 'lcp-pill--on' : 'lcp-pill--off'">
          <i />{{ runsStore.connection === 'connected' ? t('loopCockpit.status.connected') : t('loopCockpit.status.disconnected') }}
        </span>
        <span class="lcp-pill lcp-pill--time">{{ clockLabel }}</span>
      </div>

      <div class="lcp-top__actions">
        <button type="button" class="lcp-btn" data-testid="lcp-all-runs" @click="goRuns">
          {{ t('loopMind.viewRuns') }}
        </button>
        <div class="lcp-more">
          <button
            type="button"
            class="lcp-btn lcp-btn--ghost"
            data-testid="lcp-more"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >⋯</button>
          <div v-if="moreOpen" class="lcp-more__menu" data-testid="lcp-more-menu">
            <button
              v-for="item in MORE_ITEMS"
              :key="item.key"
              type="button"
              class="lcp-more__item"
              :data-testid="`lcp-more-${item.key}`"
              @click="moreOpen = false; item.go()"
            >{{ t(item.label) }}</button>
          </div>
        </div>
      </div>
    </header>

    <!-- ═══ 场景切换条（当前挂载点家族内 router-link） ═══ -->
    <nav class="lcp-scenes" data-testid="lcp-scenes">
      <router-link
        v-for="scene in IA_SCENES"
        :key="scene.key"
        :to="{ name: sceneNames[scene.key] }"
        class="lcp-scenes__btn"
        :class="{ 'lcp-scenes__btn--on': activeScene === scene.key }"
        :data-testid="`lcp-scene-${scene.key}`"
      >{{ t(scene.labelKey) }}</router-link>
    </nav>

    <!-- ═══ 场景主体（四场景子路由出口） ═══ -->
    <router-view />
  </div>
</template>

<style scoped>
/* ── 驾驶舱容器：全局 Pure Ink 变量（浅色体系，与 app 整体一致；2026-09-15 用户
     反馈修正——去除自带的深色科技底） ── */
.lcp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  padding: 12px 16px;
  gap: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

/* ═══ 页头 ═══ */
.lcp-top { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
.lcp-top__brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.lcp-top__mark {
  width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto;
  background: var(--color-primary, #3b82f6);
  animation: lcp-throb 2.6s ease-in-out infinite;
}
@keyframes lcp-throb { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.lcp-top__titles { display: flex; flex-direction: column; min-width: 0; }
.lcp-top__title {
  margin: 0; font-size: 16px; font-weight: 600;
  color: var(--text-primary); white-space: nowrap;
}
.lcp-top__tagline { font-size: 11px; color: var(--text-secondary); }

.lcp-top__status { display: flex; gap: 6px; margin-left: auto; align-items: center; }
.lcp-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 9px; border-radius: 999px; font-size: 11px;
  border: 1px solid var(--border-color); color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.lcp-pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.lcp-pill--on { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }
.lcp-pill--on i { animation: lcp-throb 1.8s ease-in-out infinite; }
.lcp-pill--off { color: var(--color-text-secondary, #878c99); }

.lcp-top__actions { display: flex; align-items: center; gap: 6px; }
.lcp-btn {
  padding: 5px 12px; border-radius: var(--radius-standard); cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary)); color: var(--text-primary);
  font-size: 12.5px; font-family: inherit; white-space: nowrap;
}
.lcp-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.lcp-btn--ghost { padding: 5px 9px; }
.lcp-more { position: relative; }
.lcp-more__menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 30;
  min-width: 132px; padding: 4px;
  border-radius: var(--radius-standard); border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary)); box-shadow: var(--shadow-card, 0 4px 16px rgba(0,0,0,0.12));
  display: flex; flex-direction: column;
}
.lcp-more__item {
  padding: 6px 10px; border: none; border-radius: var(--radius-standard); background: transparent;
  color: var(--text-primary); font-size: 12.5px; text-align: left; cursor: pointer; font-family: inherit;
}
.lcp-more__item:hover { background: var(--bg-hover, var(--bg-card)); }

/* ═══ 场景切换条 ═══ */
.lcp-scenes {
  display: flex; gap: 2px; flex: 0 0 auto;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 2px;
  align-self: flex-start;
}
.lcp-scenes__btn {
  padding: 4px 14px; border-radius: calc(var(--radius-standard) - 2px);
  color: var(--text-secondary); font-size: 12px; text-decoration: none;
  white-space: nowrap;
}
.lcp-scenes__btn:hover { color: var(--color-primary, #3b82f6); }
.lcp-scenes__btn--on {
  background: var(--color-primary, #3b82f6); color: var(--bg-primary); font-weight: 600;
}

/* 壳内场景出口占满剩余高度 */
.lcp > :last-child { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }

@media (prefers-reduced-motion: reduce) {
  .lcp-top__mark, .lcp-pill--on i { animation: none; }
}
</style>
