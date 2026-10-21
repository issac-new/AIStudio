<script setup lang="ts">
// UsageInsightsExtension — 上游 /hermes/usage 页增强（context-insights P4，patch 673 挂载）。
// 三块增量，全部 fail-soft：①活动热力图（usage store dailyUsage，CSS 网格五档）
// ②缓存命中率 KPI（store cacheHitRate）③近期会话卡（/api/ide/usage-insights/sessions，
// 12 张：token 迷你条+缓存率+成本+父子标记）。热力图口径=当前筛选周期的 daily_usage，
// 不跨周期外推；会话卡为全库最近 12（DB 全局视图，非周期过滤——标题明示）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsageStore } from '@/stores/hermes/usage'
import { request } from '@/api/client'

const { locale } = useI18n()
const usageStore = useUsageStore()

const TEXT = {
  zh: {
    heat: '活动热力图（本期）', heatEmpty: '本期无按日数据',
    kpiHit: '缓存命中率', kpiHitEmpty: '—',
    cards: '近期会话（全库最近 12）', cardsEmpty: '暂无会话', cardsError: '会话卡不可用',
    sub: '子', archived: '档', hit: '命中',
  },
  en: {
    heat: 'Activity heatmap (this period)', heatEmpty: 'No daily data for this period',
    kpiHit: 'Cache hit rate', kpiHitEmpty: '—',
    cards: 'Recent sessions (latest 12)', cardsEmpty: 'No sessions yet', cardsError: 'Session cards unavailable',
    sub: 'sub', archived: 'arch', hit: 'hit',
  },
} as const
const tx = computed(() => (locale.value.startsWith('zh') ? TEXT.zh : TEXT.en))

// ── 热力图：dailyUsage → 周对齐网格（列=周，行=周一到周日；五档按本期最大日 tokenize）──
interface HeatCell { date: string; level: 0 | 1 | 2 | 3 | 4; tokens: number }

const heatCells = computed<HeatCell[]>(() => {
  const days = usageStore.dailyUsage ?? []
  if (!days.length) return []
  const byDate = new Map(days.map(d => [d.date, d]))
  const max = Math.max(1, ...days.map(d => d.visualTokens || 0))
  const cells: HeatCell[] = []
  const today = new Date()
  for (let i = 83; i >= 0; i--) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const d = byDate.get(key)
    const tokens = d?.visualTokens ?? 0
    const level: HeatCell['level'] = tokens <= 0 ? 0 : tokens <= max * 0.25 ? 1 : tokens <= max * 0.5 ? 2 : tokens <= max * 0.75 ? 3 : 4
    cells.push({ date: key, level, tokens })
  }
  return cells
})

const heatMax = computed(() => Math.max(1, ...heatCells.value.map(c => c.tokens)))

const hitRate = computed(() => {
  const v = usageStore.cacheHitRate
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}%` : null
})

// ── 近期会话卡 ──
interface SessionCard {
  sessionId: string
  title: string
  agent: string
  model: string
  hasParent: boolean
  messageCount: number
  toolCallCount: number
  billedTokens: number
  cacheHitPercent: number | null
  costUsd: number
  lastActive: number
  isArchived: boolean
}
const cards = ref<SessionCard[]>([])
const cardsState = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

async function loadCards(): Promise<void> {
  cardsState.value = 'loading'
  try {
    const res = await request<{ ok: boolean; available: boolean; cards?: SessionCard[] }>('/api/ide/usage-insights/sessions')
    cards.value = res.cards ?? []
    cardsState.value = cards.value.length ? 'ok' : 'empty'
  } catch {
    cardsState.value = 'error'
  }
}
onMounted(() => { void loadCards() })

const cardMaxTokens = computed(() => Math.max(1, ...cards.value.map(c => c.billedTokens)))

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
</script>

<template>
  <section class="uie" data-testid="usage-insights-ext">
    <div class="uie__row">
      <!-- 热力图 -->
      <div class="uie__card uie__heat" data-testid="uie-heatmap">
        <h4>{{ tx.heat }}</h4>
        <div v-if="heatCells.length" class="uie__grid">
          <span
            v-for="c in heatCells"
            :key="c.date"
            class="uie__cell"
            :class="`is-l${c.level}`"
            :title="`${c.date}：${fmtTokens(c.tokens)} tokens（本期日峰值 ${fmtTokens(heatMax)}）`"
          />
        </div>
        <p v-else class="uie__hint">{{ tx.heatEmpty }}</p>
      </div>
      <!-- 缓存命中 KPI -->
      <div class="uie__card uie__kpi" data-testid="uie-cache-kpi">
        <h4>{{ tx.kpiHit }}</h4>
        <p class="uie__kpi-num">{{ hitRate ?? tx.kpiHitEmpty }}</p>
      </div>
    </div>
    <!-- 近期会话卡 -->
    <div class="uie__card" data-testid="uie-sessions">
      <h4>{{ tx.cards }}</h4>
      <p v-if="cardsState === 'loading' || cardsState === 'empty'" class="uie__hint" data-testid="uie-sessions-empty">{{ tx.cardsEmpty }}</p>
      <p v-else-if="cardsState === 'error'" class="uie__hint is-error" data-testid="uie-sessions-error">{{ tx.cardsError }}</p>
      <ul v-else class="uie__cards">
        <li
          v-for="c in cards"
          :key="c.sessionId"
          class="uie__scard"
          :data-testid="`uie-session-${c.sessionId}`"
          :title="`${c.title} · ${c.model || '—'} · ${c.messageCount} 条 · $${c.costUsd.toFixed(3)}`"
        >
          <span class="uie__stitle">
            {{ c.title }}
            <em v-if="c.hasParent" class="uie__tag">{{ tx.sub }}</em>
            <em v-if="c.isArchived" class="uie__tag is-arch">{{ tx.archived }}</em>
          </span>
          <span class="uie__sbar"><span class="uie__sbar-fill" :style="{ width: `${Math.max(3, (c.billedTokens / cardMaxTokens) * 100)}%` }" /></span>
          <span class="uie__snum">{{ fmtTokens(c.billedTokens) }}</span>
          <span class="uie__shit">{{ c.cacheHitPercent === null ? '—' : `${c.cacheHitPercent}% ${tx.hit}` }}</span>
          <span class="uie__scost">${{ c.costUsd.toFixed(3) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.uie { display: flex; flex-direction: column; gap: 12px; }
.uie__row { display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap; }
.uie__card {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;
  background: var(--card-color, inherit); flex: 1 1 320px;
  h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--text-muted, #888); }
}
.uie__grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; }
.uie__cell { aspect-ratio: 1; border-radius: 2px; background: var(--hover-color, rgba(0, 0, 0, 0.06)); }
.uie__cell.is-l1 { background: color-mix(in srgb, var(--primary-color, #4fd1c5) 30%, transparent); }
.uie__cell.is-l2 { background: color-mix(in srgb, var(--primary-color, #4fd1c5) 55%, transparent); }
.uie__cell.is-l3 { background: color-mix(in srgb, var(--primary-color, #4fd1c5) 80%, transparent); }
.uie__cell.is-l4 { background: var(--primary-color, #4fd1c5); }
.uie__kpi { flex: 0 0 160px; }
.uie__kpi-num { margin: 0; font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
.uie__hint { font-size: 11px; color: var(--text-muted, #888); margin: 0; }
.uie__hint.is-error { color: var(--warning-color, #e6a23c); }
.uie__cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
.uie__scard {
  display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 8px;
  border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 11px;
  grid-template-areas: 'title title title title' 'bar num hit cost';
}
.uie__stitle { grid-area: title; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.uie__tag { font-style: normal; font-size: 9px; border: 1px solid var(--border-color); border-radius: 3px; padding: 0 3px; margin-left: 4px; color: var(--text-muted, #888); }
.uie__tag.is-arch { color: var(--warning-color, #e6a23c); }
.uie__sbar { grid-area: bar; display: block; height: 6px; border-radius: 3px; background: var(--hover-color, rgba(0, 0, 0, 0.06)); overflow: hidden; }
.uie__sbar-fill { display: block; height: 100%; background: var(--primary-color, #4fd1c5); }
.uie__snum { grid-area: num; font-variant-numeric: tabular-nums; color: var(--text-muted, #888); }
.uie__shit { grid-area: hit; font-variant-numeric: tabular-nums; color: var(--text-muted, #888); }
.uie__scost { grid-area: cost; font-variant-numeric: tabular-nums; }
</style>
