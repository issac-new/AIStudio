<!-- overlay/custom/client/governance/components/SixQuestionsSection.vue -->
<!-- 六问完成判据（2026-11-06 第一增量）：只回答「记录够不够」；unknown 必须带缺口文案，
     无缺口说明=口径缺口未说明（标红）。数据面 /api/autonomygov/six-questions。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  title: '六问完成判据', sub: '阶段完成看记录不看日历：六问都能回答，才有资格讨论扩大范围；unknown 不是通过',
  refresh: '刷新', ansYes: '能', ansNo: '不能', ansUnknown: '未知', gapLabel: '缺口', evidLabel: '证据',
  gapMissing: '口径缺口未说明', fail: '读取失败',
} : {
  title: 'Six Completion Questions', sub: 'Completion is judged by records, not calendar; unknown is not a pass',
  refresh: 'Refresh', ansYes: 'yes', ansNo: 'no', ansUnknown: 'unknown', gapLabel: 'Gap', evidLabel: 'Evidence',
  gapMissing: 'gap not stated', fail: 'Failed to load',
})

interface Answer { id: string; question: string; answer: 'yes' | 'no' | 'unknown'; evidence: { source: string; ref: string; value: string | number }[]; gap?: string }

const answers = ref<Answer[]>([])
const error = ref('')
const busy = ref(false)

function auth(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

async function refresh(): Promise<void> {
  busy.value = true; error.value = ''
  try {
    const res = await fetch('/api/autonomygov/six-questions', { headers: auth() })
    const body = await res.json()
    answers.value = body.answers ?? []
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

const ansLabel = (a: string): string => a === 'yes' ? T.value.ansYes : a === 'no' ? T.value.ansNo : T.value.ansUnknown

onMounted(() => void refresh())
</script>

<template>
  <div class="sq" data-testid="gov-six-questions">
    <div class="sq__bar">
      <h3 class="sq__title">{{ T.title }}</h3>
      <button type="button" :disabled="busy" @click="refresh()">{{ T.refresh }}</button>
    </div>
    <p class="sq__sub">{{ T.sub }}</p>
    <p v-if="error" class="sq__err">{{ T.fail }}：{{ error }}</p>

    <div v-for="a in answers" :key="a.id" class="sq__card" :data-testid="`gov-sixq-${a.id}`">
      <div class="sq__head">
        <span class="sq__badge" :class="`sq__badge--${a.answer}`">{{ ansLabel(a.answer) }}</span>
        <span class="sq__q">{{ a.question }}</span>
      </div>
      <div v-if="a.answer === 'unknown'" class="sq__gap" :class="{ 'sq__gap--missing': !a.gap }">
        {{ T.gapLabel }}：{{ a.gap || T.gapMissing }}
      </div>
      <div v-else-if="a.gap" class="sq__gap">{{ T.gapLabel }}：{{ a.gap }}</div>
      <ul v-if="a.evidence.length" class="sq__evid">
        <li v-for="(e, i) in a.evidence" :key="i">{{ e.source }} · {{ e.ref }} = {{ e.value }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sq { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color, #333); border-radius: 8px; }
.sq__bar { display: flex; align-items: center; justify-content: space-between; }
.sq__title { margin: 0; font-size: 13.5px; }
.sq__sub { margin: 0; font-size: 11.5px; color: var(--text-muted, #888); }
.sq__err { color: #e06c75; margin: 0; font-size: 12px; }
.sq__card { border: 1px solid var(--border-color, #333); border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
.sq__head { display: flex; align-items: center; gap: 8px; }
.sq__badge { border-radius: 8px; padding: 0 10px; font-size: 11px; color: #fff; background: #616161; flex-shrink: 0; }
.sq__badge--yes { background: #2e7d32; }
.sq__badge--no { background: #8e2424; }
.sq__badge--unknown { background: #616161; }
.sq__q { font-size: 12.5px; }
.sq__gap { font-size: 11.5px; color: #e6a23c; }
.sq__gap--missing { color: #e06c75; }
.sq__evid { margin: 0; padding-left: 16px; font-size: 11px; color: var(--text-muted, #888); list-style: disc; }
</style>
