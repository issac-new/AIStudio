<!-- overlay/custom/client/eval/components/EvaluatorTriangle.vue
     评估器三角互证（百度评测范式轮 §3）：规则/裁判/人工覆盖 + 严格 vs 保守口径 +
     人工覆盖方向（误杀/假通过）。数据源 GET /runs/:id/evaluators。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type EvaluatorAuditDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const props = defineProps<{ runId: string }>()
const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const audit = ref<EvaluatorAuditDto | null>(null)
const error = ref('')
const loading = ref(false)

async function load(): Promise<void> {
  if (!props.runId) return
  loading.value = true
  error.value = ''
  try {
    const res = await evalApi.evaluatorAudit(props.runId)
    audit.value = res.audit
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.runId, load)

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`
}

const riskLabel = computed(() => {
  const level = audit.value?.riskLevel ?? 'ok'
  return level === 'high' ? L.value.evaluator.riskHigh : level === 'watch' ? L.value.evaluator.riskWatch : L.value.evaluator.riskOk
})
</script>

<template>
  <section class="tri card" data-testid="eval-evaluator-triangle">
    <header class="tri__head">
      <div>
        <h4>{{ L.evaluator.title }}</h4>
        <p class="muted">{{ L.evaluator.sub }}</p>
      </div>
      <span
        v-if="audit"
        class="chip"
        :class="{ 'chip-warn': audit.riskLevel === 'watch', 'chip-danger': audit.riskLevel === 'high' }"
        :data-testid="`eval-evaluator-risk-${audit.riskLevel}`"
      >{{ L.evaluator.risk }}：{{ riskLabel }}</span>
    </header>
    <p v-if="error" class="tri__error">{{ error }}</p>
    <p v-else-if="loading" class="muted">{{ L.loading }}</p>
    <template v-else-if="audit">
      <div class="tri__sources">
        <div class="src">
          <span class="src__name">{{ L.evaluator.rule }}</span>
          <span class="src__value">{{ audit.bySource.s0 ?? 0 }}</span>
          <span class="src__hint">{{ L.evaluator.unknown }} {{ audit.unknown.bySource.s0 ?? 0 }}</span>
        </div>
        <div class="src">
          <span class="src__name">{{ L.evaluator.judge }}</span>
          <span class="src__value">{{ (audit.bySource.s1 ?? 0) + (audit.bySource['s0+s1'] ?? 0) }}</span>
          <span class="src__hint">
            {{ audit.judge.online ? L.evaluator.judgeOnline : L.evaluator.judgeOffline }} ·
            {{ L.evaluator.unknown }} {{ pct(audit.unknown.s1Ratio) }}
          </span>
        </div>
        <div class="src">
          <span class="src__name">{{ L.evaluator.human }}</span>
          <span class="src__value">{{ audit.bySource.human ?? 0 }}</span>
          <span class="src__hint">{{ L.evaluator.falseKill }} {{ audit.human.falseKillCandidates }} · {{ L.evaluator.falsePass }} {{ audit.human.falsePassCandidates }}</span>
        </div>
      </div>

      <div class="tri__policy" data-testid="eval-evaluator-policy">
        <div>
          <span class="muted">{{ L.evaluator.strict }}</span>
          <strong>{{ pct(audit.policy.strict.passAtK) }}</strong>
        </div>
        <div>
          <span class="muted">{{ L.evaluator.conservative }}</span>
          <strong>{{ pct(audit.policy.conservative.passAtK) }}</strong>
          <em v-if="audit.policy.delta.passAtK" class="muted"> Δ {{ (audit.policy.delta.passAtK * 100).toFixed(1) }}pp</em>
        </div>
        <div>
          <span class="muted">{{ L.evaluator.conflicts }}</span>
          <strong>{{ audit.conflicts }}</strong>
        </div>
        <div>
          <span class="muted">{{ L.evaluator.audit }}</span>
          <strong>{{ pct(audit.audit.ratio) }}</strong>
          <span class="muted">（{{ audit.audit.withReason }}/{{ audit.audit.total }}）</span>
        </div>
      </div>

      <details v-if="audit.notes.length" class="tri__notes">
        <summary>{{ L.evaluator.notes }}（{{ audit.notes.length }}）</summary>
        <ul>
          <li v-for="(note, i) in audit.notes" :key="i">{{ note }}</li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped lang="scss">
.tri { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; }
.tri__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  h4 { margin: 0; font-size: 13px; }
  p { margin: 2px 0 0; font-size: 11px; }
}
.tri__error { color: var(--danger); font-size: 12px; margin: 0; }
.tri__sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.src { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.src__name { font-size: 11px; opacity: 0.7; }
.src__value { font-size: 18px; font-weight: 600; }
.src__hint { font-size: 11px; opacity: 0.8; }
.tri__policy { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; font-size: 12px;
  div { display: flex; flex-direction: column; gap: 2px; }
  strong { font-size: 15px; }
}
.tri__notes { font-size: 12px; summary { cursor: pointer; opacity: 0.8; } ul { margin: 6px 0 0; padding-left: 18px; } }
.chip-danger { border-color: var(--danger); color: var(--danger); }
</style>
