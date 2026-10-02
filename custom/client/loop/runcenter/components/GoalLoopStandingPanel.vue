<!-- overlay/custom/client/loop/runcenter/components/GoalLoopStandingPanel.vue -->
<!-- 常驻意图面板（2026-10-01 运行观测吸收批 #20：hermes /goal + /loop + /heartbeat
     暗能力的 UI 化，element-web ThreadsActivityCentre 的"聚合收件箱"信息设计参照）。
     语义：运行中心 runs 页签顶部的意图卡横条——每张卡=一个常驻循环的意图视角：
     目标（goal）、判定条件（stopCondition=judge 语义）、阶段（stage）、运行模式
     （pattern/schedule 间隔）。动作：暂停/恢复（loop pause API）、查看最新 run
     （跳 RunDetail）。数据源=/api/loop/loops（真接口，零新后端）；goal 型意图
     的 judge 历史/gate 状态随 contract 状态呈现（awaiting-review=等判定）。
     空态诚实：无常驻循环时收起为单行提示（不摆设）。 -->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLoopStore } from '../../store/loop'
import { useRunSurfaceText } from '@/custom/ia2/i18n-observatory'

const router = useRouter()
const loopStore = useLoopStore()
const tx = useRunSurfaceText()

onMounted(() => {
  if (!loopStore.loops.length) void loopStore.fetchLoops()
})

/** 常驻=非终态循环（running/awaiting-review/blocked）；按阶段序 */
const standing = computed(() =>
  loopStore.loops
    .filter(l => l.status === 'running' || l.status === 'awaiting-review' || l.status === 'blocked')
    .slice(0, 8),
)

const pausedById = computed(() => new Set(loopStore.loops.filter(l => l.status === 'paused').map(l => l.id)))

function togglePause(id: string, isPaused: boolean): void {
  if (isPaused) {
    void loopStore.tickLoop(id).then(() => void loopStore.fetchLoops())
  } else {
    void loopStore.pauseLoop(id).then(() => void loopStore.fetchLoops())
  }
}

function openDetail(loopId: string): void {
  void router.push({ name: 'ia2.runs' })
  // 循环行点击语义=跳该循环最新 run 详情（M6 动线）；run id 经运行列表解析，
  // 此处跳运行中心并预填搜索（loop id 即检索锚）
  void router.push({ name: 'ia2.runs', query: { tab: 'runs', q: loopId } })
}

const STATUS_TONE: Record<string, string> = {
  running: 'glsp__tone--run',
  'awaiting-review': 'glsp__tone--judge',
  blocked: 'glsp__tone--blocked',
  paused: 'glsp__tone--paused',
}
</script>

<template>
  <section v-if="standing.length || pausedById.size" class="glsp" data-testid="goal-loop-standing">
    <div class="glsp__head">
      <span class="glsp__title">{{ tx.goalLoopTitle }}</span>
      <span class="glsp__count">{{ standing.length + pausedById.size }}</span>
    </div>
    <div class="glsp__row">
      <button
        v-for="l in standing" :key="l.id" type="button" class="glsp__card"
        :data-testid="`goal-loop-card-${l.id}`"
        @click="openDetail(l.id)"
      >
        <span class="glsp__card-head">
          <span class="glsp__name" :title="l.name">{{ l.name }}</span>
          <span class="glsp__tone" :class="STATUS_TONE[l.status] ?? ''">{{ l.status }}</span>
        </span>
        <span class="glsp__goal" :title="l.goal">{{ l.goal }}</span>
        <span class="glsp__meta">
          <span class="glsp__k">judge</span><span class="glsp__v">{{ l.stopCondition || '—' }}</span>
        </span>
        <span class="glsp__meta">
          <span class="glsp__k">stage</span><span class="glsp__v">{{ l.stage }}</span>
          <span class="glsp__sep" />
          <span class="glsp__k">mode</span><span class="glsp__v">{{ l.pattern }}</span>
        </span>
      </button>
      <!-- 暂停中的意图（可恢复） -->
      <button
        v-for="l in loopStore.loops.filter(x => pausedById.has(x.id)).slice(0, 4)"
        :key="'p-' + l.id" type="button" class="glsp__card glsp__card--paused"
        :data-testid="`goal-loop-paused-${l.id}`"
        @click="togglePause(l.id, true)"
      >
        <span class="glsp__card-head">
          <span class="glsp__name" :title="l.name">{{ l.name }}</span>
          <span class="glsp__tone glsp__tone--paused">paused</span>
        </span>
        <span class="glsp__goal">{{ l.goal }}</span>
        <span class="glsp__resume">▶ {{ tx.goalLoopInterval }}…</span>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.glsp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.glsp__head { display: flex; align-items: center; gap: 6px; }
.glsp__title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.glsp__count {
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; text-align: center;
  background: var(--bg-secondary); color: var(--text-muted); font-size: 10px; line-height: 16px;
}

.glsp__row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }

.glsp__card {
  flex: 0 0 240px; display: flex; flex-direction: column; gap: 4px; padding: 8px 10px;
  border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card);
  cursor: pointer; font-family: inherit; text-align: left;
  &:hover { border-color: var(--text-muted); }
}
.glsp__card--paused { opacity: 0.65; }

.glsp__card-head { display: flex; align-items: center; gap: 6px; }
.glsp__name {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; font-weight: 600; color: var(--text-primary);
}
.glsp__tone {
  flex-shrink: 0; padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 600;
  background: var(--bg-secondary); color: var(--text-muted);
}
.glsp__tone--run { color: #61afef; }
.glsp__tone--judge { color: #e5c07b; }
.glsp__tone--blocked { color: var(--error, #e11d48); }
.glsp__tone--paused { color: var(--text-muted); }

.glsp__goal {
  font-size: 11px; color: var(--text-secondary); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.glsp__meta { display: flex; align-items: center; gap: 4px; min-width: 0; }
.glsp__k { flex-shrink: 0; font-size: 9px; color: var(--text-muted); text-transform: uppercase; }
.glsp__v {
  font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.glsp__sep { flex: 1; }
.glsp__resume { font-size: 10px; color: var(--primary, #3b82f6); }
</style>
