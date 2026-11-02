<!-- overlay/custom/client/eval/components/SkillGradePanel.vue
     技能产出评估面（2026-11-02 方法论吸收批 E 的 UI 接线，挂账清偿批）：
     spec §19 测试设计段 → S0 机械四判＋S1 反偏置四维＋可选基线对比。
     数据源 POST /api/hermes/eval/skill-grade（服务端 skill-grader.ts）。
     呈现纪律：CONDITIONAL=黄（S1 不可用的 fail-open 合法态），红只留给 FAIL；
     unknown 是合法判定不是错误，错误面只承接 API 异常。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type SkillGradeResultDto, type SkillBaselineDeltaDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const specText = ref('')
const baselineRunId = ref('')
const snapshot = ref(false)
const loading = ref(false)
const error = ref('')
const result = ref<SkillGradeResultDto | null>(null)
const baseline = ref<SkillBaselineDeltaDto | null>(null)
const baselineRequested = ref(false)

async function grade(): Promise<void> {
  if (!specText.value.trim()) return // 空输入不发请求（服务端 400 前置）
  loading.value = true
  error.value = ''
  result.value = null
  baseline.value = null
  baselineRequested.value = false
  try {
    const res = await evalApi.skillGrade({
      specText: specText.value,
      ...(baselineRunId.value.trim() ? { baselineRunId: baselineRunId.value.trim(), ...(snapshot.value ? { snapshot: true } : {}) } : {}),
    })
    result.value = res.grades
    if (baselineRunId.value.trim()) {
      baselineRequested.value = true
      baseline.value = res.baseline ?? null
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function verdictClass(overall: string): string {
  if (overall === 'PASS') return 'skill-grade__verdict--pass'
  if (overall === 'FAIL') return 'skill-grade__verdict--fail'
  return 'skill-grade__verdict--conditional'
}

function dimClass(value: string): string {
  if (value === 'yes') return 'skill-grade__dim--yes'
  if (value === 'no') return 'skill-grade__dim--no'
  return 'skill-grade__dim--unknown'
}

function fmtDelta(delta: number): string {
  return delta > 0 ? `+${delta.toFixed(4)}` : delta.toFixed(4)
}

const metaLine = computed(() => {
  const m = result.value?.meta
  if (!m) return ''
  return L.value.skillGrade.metaLine
    .replace('{model}', m.model)
    .replace('{online}', String(m.online))
    .replace('{cached}', String(m.cached))
    .replace('{latency}', m.latencyMs === null ? '—' : `${m.latencyMs}ms`)
})
</script>

<template>
  <section class="skill-grade" data-testid="skill-grade-panel">
    <h3>{{ L.skillGrade.title }}</h3>
    <p class="skill-grade__hint">{{ L.skillGrade.hint }}</p>

    <textarea
      v-model="specText"
      class="skill-grade__input"
      rows="12"
      :placeholder="L.skillGrade.placeholder"
      data-testid="skill-grade-spec-input"
    />

    <div class="skill-grade__controls">
      <input
        v-model="baselineRunId"
        class="skill-grade__runid"
        :placeholder="L.skillGrade.baselineRunId"
        data-testid="skill-grade-baseline-runid"
      />
      <label class="skill-grade__snapshot">
        <input v-model="snapshot" type="checkbox" data-testid="skill-grade-snapshot" />
        {{ L.skillGrade.snapshot }}
      </label>
      <button
        type="button"
        class="skill-grade__action"
        :disabled="loading || !specText.trim()"
        data-testid="skill-grade-submit"
        @click="grade"
      >{{ loading ? '…' : L.skillGrade.action }}</button>
    </div>

    <p v-if="error" class="skill-grade__error" data-testid="skill-grade-error">{{ error }}</p>

    <div v-if="result" class="skill-grade__result" data-testid="skill-grade-result">
      <div class="skill-grade__head">
        <span :class="['skill-grade__verdict', verdictClass(result.overall)]" data-testid="skill-grade-verdict">{{ result.overall }}</span>
        <span v-if="!result.sectionFound" class="skill-grade__missing">{{ L.skillGrade.sectionMissing }}</span>
        <span class="skill-grade__meta">{{ metaLine }}</span>
      </div>

      <h4>{{ L.skillGrade.s0Title }}</h4>
      <table class="skill-grade__table" data-testid="skill-grade-s0-table">
        <thead><tr><th>check</th><th>结果</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="c in result.s0" :key="c.id">
            <td>{{ c.label }}</td>
            <td :class="c.pass ? 'skill-grade__dim--yes' : 'skill-grade__dim--no'">{{ c.pass ? 'PASS' : 'FAIL' }}</td>
            <td>{{ c.detail }}</td>
          </tr>
        </tbody>
      </table>

      <h4>{{ L.skillGrade.s1Title }}</h4>
      <table class="skill-grade__table" data-testid="skill-grade-s1-table">
        <thead><tr><th>维度</th><th>判定</th><th>来源</th><th>依据</th></tr></thead>
        <tbody>
          <tr v-for="d in result.dimensions" :key="d.dimension">
            <td>{{ d.dimension }}</td>
            <td :class="dimClass(d.value)">{{ d.value }}</td>
            <td>{{ d.source }}</td>
            <td>{{ d.reason }}</td>
          </tr>
        </tbody>
      </table>

      <template v-if="baselineRequested">
        <h4>{{ L.skillGrade.baselineTitle }}</h4>
        <p v-if="baseline" class="skill-grade__baseline" data-testid="skill-grade-baseline">
          {{ baseline.baselinePassRate }} → {{ baseline.currentPassRate }}（{{ fmtDelta(baseline.delta) }}）
        </p>
        <p v-else class="skill-grade__baseline--none" data-testid="skill-grade-baseline-none">{{ L.skillGrade.noBaseline }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* 色一律语义 token（raw-hex 预算闸 eval 域=0；verdict 底色用 rgba 同 FlywheelPanel 惯例） */
.skill-grade__input { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 12px; }
.skill-grade__controls { display: flex; gap: 12px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
.skill-grade__runid { flex: 1; min-width: 220px; }
.skill-grade__error { color: var(--danger); }
.skill-grade__verdict { font-weight: 600; padding: 2px 10px; border-radius: 4px; }
.skill-grade__verdict--pass { background: rgba(46, 160, 67, 0.12); color: var(--success); }
.skill-grade__verdict--fail { background: rgba(248, 81, 73, 0.12); color: var(--danger); }
.skill-grade__verdict--conditional { background: rgba(204, 162, 22, 0.14); color: var(--warning); }
.skill-grade__dim--yes { color: var(--success); }
.skill-grade__dim--no { color: var(--danger); }
.skill-grade__dim--unknown { color: var(--warning); }
.skill-grade__table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.skill-grade__table th, .skill-grade__table td { border: 1px solid var(--border-color); padding: 4px 8px; text-align: left; font-size: 13px; }
.skill-grade__head { display: flex; gap: 12px; align-items: center; margin: 10px 0; }
.skill-grade__meta { color: var(--text-muted); font-size: 12px; }
.skill-grade__missing { color: var(--danger); font-size: 13px; }
</style>
