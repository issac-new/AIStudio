<!-- overlay/custom/client/eval/components/TraceCaseComposer.vue
     生产轨迹转回归题（2026-10-21 生产失败回流轮）。
     职责：预览证据（session/span 采样端点）→ 人工确认 problem/expectedBehavior/
     至少一条断言 → 提交 expectedTraceHash（防预览后漂移）。不在此重新实现
     Eval 报告；成功后只回 setId/taskId，由挂载方决定跳转。
     边界：OTel/未完整 trace 只展示原因，不提供可提交动作（不产空证据任务）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type TraceSampleDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const props = defineProps<{
  sessionId: string
  spanRef?: string
  spanKind?: 'llm_span' | 'tool_span'
}>()
const emit = defineEmits<{
  (e: 'created', payload: { setId: string; taskId: string }): void
  (e: 'open-set', setId: string): void
  (e: 'close'): void
}>()

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const preview = ref<TraceSampleDto | null>(null)
const previewError = ref('')
const loading = ref(false)
const problem = ref('')
const expected = ref('')
const assertion = ref('')
const submitting = ref(false)
const submitError = ref('')
const done = ref<{ created: boolean; set: { id: string; name: string }; taskId: string } | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    preview.value = props.spanRef
      ? await evalApi.sampleSpanFromTrace(props.sessionId, props.spanRef)
      : await evalApi.sampleFromTrace(props.sessionId)
  } catch (e) {
    previewError.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

/** 可提交=可识别格式（legacy/otel）且完整；unknown/缺收尾不提供可提交动作。 */
const convertible = computed(() =>
  preview.value?.ok === true
  && preview.value.meta?.format !== undefined
  && preview.value.meta.format !== 'unknown'
  && preview.value.meta?.complete === true
  && Boolean(preview.value.meta.traceHash))

const canSubmit = computed(() =>
  convertible.value
  && problem.value.trim().length > 0
  && expected.value.trim().length > 0
  && assertion.value.trim().length > 0
  && !submitting.value
  && !done.value)

async function submit(): Promise<void> {
  if (!canSubmit.value || !preview.value?.meta) return
  submitting.value = true
  submitError.value = ''
  try {
    const result = await evalApi.reflowTrace({
      sessionId: props.sessionId,
      ...(props.spanRef ? { spanRef: props.spanRef } : {}),
      expectedTraceHash: preview.value.meta.traceHash,
      task: {
        problem: problem.value.trim(),
        expectedBehavior: expected.value.trim(),
        rubric: [{ id: 'a1', text: assertion.value.trim(), expect: 'yes', kind: 'trajectory' }],
      },
    })
    done.value = { created: result.created, set: { id: result.set.id, name: result.set.name }, taskId: result.taskId }
    emit('created', { setId: result.set.id, taskId: result.taskId })
  } catch (e) {
    submitError.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}

function openSet(): void {
  if (done.value) emit('open-set', done.value.set.id)
}
</script>

<template>
  <div class="tcc" data-testid="trace-case-composer">
    <header class="tcc__head">
      <h3>{{ L.composer.title }}</h3>
      <span class="mono tcc__ref">{{ sessionId }}{{ spanRef ? ` · ${spanRef}` : '' }}</span>
      <button type="button" class="tcc__close" data-testid="trace-case-close" @click="emit('close')">×</button>
    </header>

    <p v-if="loading" class="muted">{{ L.composer.loading }}</p>
    <p v-else-if="previewError" class="tcc__error" data-testid="trace-case-error">{{ previewError }}</p>
    <template v-else-if="preview">
      <p v-if="preview.ok === false" class="tcc__error" data-testid="trace-case-error">{{ preview.reason }}</p>
      <template v-else>
        <div class="tcc__meta">
          <span v-if="preview.meta?.format">format: <code>{{ preview.meta.format }}</code></span>
          <span v-if="preview.meta?.toolCalls !== undefined">{{ preview.meta.toolCalls }} tools</span>
          <span v-else-if="preview.meta?.childToolCalls !== undefined">{{ preview.meta.childToolCalls }} tools</span>
          <span v-if="preview.meta?.tokens">{{ preview.meta.tokens }} tokens</span>
        </div>
        <p v-if="!convertible" class="tcc__warn" data-testid="trace-case-unsupported">
          {{ preview.meta?.format === 'unknown' ? L.composer.unsupported : L.composer.incomplete }}
        </p>

        <details class="tcc__preview">
          <summary>{{ L.composer.previewTitle }}</summary>
          <pre class="tcc__transcript">{{ preview.sample?.transcript?.slice(0, 2000) || '—' }}</pre>
        </details>

        <form class="tcc__form" data-testid="trace-case-form" @submit.prevent="submit">
          <label>
            {{ L.composer.problem }}
            <input v-model="problem" data-testid="trace-case-problem" :placeholder="L.composer.problemPh" />
          </label>
          <label>
            {{ L.composer.expected }}
            <input v-model="expected" data-testid="trace-case-expected" :placeholder="L.composer.expectedPh" />
          </label>
          <label>
            {{ L.composer.assertion }}
            <input v-model="assertion" data-testid="trace-case-assertion" :placeholder="L.composer.assertionPh" />
          </label>
          <p class="tcc__privacy">{{ L.composer.privacy }}</p>
          <p v-if="submitError" class="tcc__error" data-testid="trace-case-error">{{ submitError }}</p>
          <div class="tcc__actions">
            <button
              type="submit"
              class="primary"
              data-testid="trace-case-submit"
              :disabled="!canSubmit"
            >{{ L.composer.submit }}</button>
          </div>
        </form>

        <p v-if="done" class="tcc__success" data-testid="trace-case-success">
          {{ done.created ? L.composer.created.replace('{set}', done.set.name) : L.composer.existed.replace('{set}', done.set.name) }}
          <button type="button" class="tcc__open" data-testid="trace-case-open" @click="openSet">{{ L.composer.openEval }}</button>
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.tcc {
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-secondary); padding: 12px 14px; font-size: 12px;
}
.tcc__head { display: flex; align-items: center; gap: 8px; h3 { margin: 0; font-size: 13px; } }
.tcc__ref { flex: 1; color: var(--text-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tcc__close { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
.tcc__meta { display: flex; gap: 10px; color: var(--text-muted); font-size: 10px; }
.tcc__warn { color: var(--warning); }
.tcc__error { color: var(--error); }
.tcc__success { color: var(--success); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tcc__preview {
  pre {
    margin: 6px 0 0; padding: 8px; border-radius: 6px; background: var(--bg-card);
    font-size: 10px; max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-all;
  }
}
.tcc__form { display: flex; flex-direction: column; gap: 6px;
  label { display: flex; flex-direction: column; gap: 3px; color: var(--text-secondary); font-size: 11px; }
  input {
    height: 26px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px;
    background: var(--bg-primary); color: var(--text-primary); font-size: 12px; outline: none;
    &:focus { border-color: var(--primary); }
  }
}
.tcc__privacy { color: var(--text-muted); font-size: 10px; }
.tcc__actions { display: flex; justify-content: flex-end; }
.tcc__open { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 2px 8px; cursor: pointer; font-size: 11px; }
</style>
