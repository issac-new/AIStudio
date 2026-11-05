<!-- overlay/custom/client/governance/components/AiNativeScorecardSection.vue -->
<!-- AI Native 评分卡（2026-11-05 吸收批 T9）：系列五篇「30 秒判断」12 问的可测判据面。
     判据在位性而非运行达标率；fail=缺口如实列出（D1 权限最小化按用户裁决挂账），
     unknown 不计分母不造数。自取数 /api/harness/ai-native-scorecard。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import { fetchAiNativeScorecard, type AiNativeScorecardDto } from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const data = ref<AiNativeScorecardDto | null>(null)
const error = ref('')
const busy = ref(false)

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchAiNativeScorecard()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
onMounted(() => { void refresh() })

const statusClass: Record<string, string> = { pass: 'ok', partial: 'warn', fail: 'bad', unknown: 'dim' }
</script>

<template>
  <section class="block">
    <header class="head">
      <h3>{{ L.aiNativeScorecardTitle }}</h3>
      <span v-if="data" class="score">{{ data.score === null ? '—' : `${Math.round(data.score * 100)}%` }}</span>
      <button class="ghost" :disabled="busy" @click="refresh()">{{ busy ? '…' : '↻' }}</button>
    </header>
    <p class="sub">{{ L.aiNativeScorecardSub }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <template v-if="data">
      <p class="tally">
        ✓ {{ data.passed }} · ⚠ {{ data.partial }} · ✗ {{ data.failed }} · ? {{ data.unknown }}
      </p>
      <ul class="criteria">
        <li v-for="c in data.criteria" :key="c.id" :class="statusClass[c.status] ?? 'dim'">
          <span class="badge">{{ c.stance === 'positive' ? '正' : '反' }}</span>
          <span class="title">{{ c.title }}</span>
          <span class="status">{{ c.status }}</span>
          <p class="evidence">{{ c.evidence }}</p>
        </li>
      </ul>
      <details v-if="data.gaps.length > 0" class="gaps">
        <summary>缺口 {{ data.gaps.length }} 项</summary>
        <p v-for="g in data.gaps" :key="g">{{ g }}</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.block { border-top: 1px solid var(--border, #ddd); padding: 12px 0; }
.head { display: flex; align-items: center; gap: 8px; }
.head h3 { margin: 0; font-size: 14px; }
.score { font-size: 18px; font-weight: 600; margin-left: auto; }
.sub { color: var(--dim, #888); font-size: 12px; margin: 4px 0 8px; }
.tally { font-size: 12px; margin: 4px 0; }
.criteria { list-style: none; padding: 0; margin: 0; }
.criteria li { padding: 4px 0 4px 0; font-size: 12px; }
.criteria li.ok .status { color: var(--ok, #2e7d32); }
.criteria li.warn .status { color: var(--warn, #b26a00); }
.criteria li.bad .status { color: var(--bad, #c62828); }
.criteria li.dim .status { color: var(--dim, #888); }
.badge { display: inline-block; min-width: 18px; text-align: center; border: 1px solid var(--border, #ccc); border-radius: 4px; margin-right: 6px; font-size: 11px; }
.title { margin-right: 6px; }
.status { font-weight: 600; }
.evidence { margin: 2px 0 0 24px; color: var(--dim, #777); font-size: 11px; }
.gaps { margin-top: 8px; font-size: 12px; }
.error { color: var(--bad, #c62828); font-size: 12px; }
.ghost { background: none; border: 1px solid var(--border, #ccc); border-radius: 4px; cursor: pointer; }
</style>
