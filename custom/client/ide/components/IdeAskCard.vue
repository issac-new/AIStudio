<script setup lang="ts">
// IdeAskCard — ask_user 结构化问卷卡（复刻 minimax ask_user 1-4 步×2-4 选项问卷；
// UI 复刻 R3）。数据面=ask-contract（步骤/选项/recommended/答案必答一次定音）。
// 本卡从消息流最后一条 ask 消息解析问卷 JSON（display_metadata 或文本内嵌）渲染。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

interface AskStep {
  question: string
  options: Array<{ label: string; recommended?: boolean }>
  multi?: boolean
}
interface AskQuestionnaire {
  steps: AskStep[]
}

const chatStore = useChatStore()
const answers = ref<Record<number, number[]>>({})
const submitted = ref(false)

function parseAsk(messages: Array<{ role: string; content: unknown; display_metadata?: unknown }>): AskQuestionnaire | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!
    const meta = m.display_metadata as { ask?: AskQuestionnaire } | undefined
    if (meta?.ask?.steps?.length) return meta.ask
    const text = typeof m.content === 'string' ? m.content : ''
    const idx = text.indexOf('{"steps"')
    if (idx >= 0) {
      try {
        const q = JSON.parse(text.slice(idx)) as AskQuestionnaire
        if (q.steps?.length) return q
      } catch { /* 非问卷 JSON */ }
    }
  }
  return null
}

const questionnaire = computed(() => parseAsk((chatStore.activeSession?.messages ?? []) as never))

function select(stepIndex: number, optionIndex: number, multi: boolean): void {
  if (submitted.value) return
  const cur = answers.value[stepIndex] ?? []
  if (multi) {
    answers.value[stepIndex] = cur.includes(optionIndex) ? cur.filter((i) => i !== optionIndex) : [...cur, optionIndex]
  } else {
    answers.value[stepIndex] = [optionIndex]
  }
}

function isSelected(stepIndex: number, optionIndex: number): boolean {
  return (answers.value[stepIndex] ?? []).includes(optionIndex)
}

const canSubmit = computed(() => {
  const q = questionnaire.value
  if (!q) return false
  return q.steps.every((_, i) => (answers.value[i]?.length ?? 0) > 0)
})

function submit(): void {
  submitted.value = true
  const q = questionnaire.value
  if (!q) return
  const lines = q.steps.map((s, i) => {
    const picked = (answers.value[i] ?? []).map((oi) => s.options[oi]!.label).join(', ')
    return `Q${i + 1}: ${s.question} → ${picked}`
  })
  void chatStore.sendMessage?.(`问卷作答：\n${lines.join('\n')}`)
}
</script>

<template>
  <section v-if="questionnaire && !submitted" class="ide-ask" data-testid="ide-ask-card">
    <div v-for="(step, si) in questionnaire.steps" :key="si" class="ide-ask__step">
      <div class="ide-ask__q" :data-testid="`ide-ask-q-${si}`">{{ step.question }}</div>
      <button
        v-for="(opt, oi) in step.options"
        :key="oi"
        type="button"
        class="ide-ask__opt"
        :class="{ 'is-selected': isSelected(si, oi), 'is-recommended': opt.recommended }"
        :data-testid="`ide-ask-opt-${si}-${oi}`"
        @click="select(si, oi, !!step.multi)"
      >{{ opt.recommended ? '★ ' : '' }}{{ opt.label }}</button>
    </div>
    <button
      type="button"
      class="ide-ask__submit"
      data-testid="ide-ask-submit"
      :disabled="!canSubmit"
      @click="submit"
    >提交作答</button>
  </section>
</template>

<style scoped lang="scss">
.ide-ask {
  border: 1px solid var(--border-color, #e0e0e0); border-left: 3px solid var(--primary-color, #18a058);
  border-radius: 6px; padding: 10px 14px; margin: 6px 12px; font-size: 12px;
  background: var(--card-color, #fafafa);
}
.ide-ask__q { font-weight: 600; margin: 6px 0 4px; }
.ide-ask__opt {
  display: block; width: 100%; text-align: left; border: 1px solid var(--border-color, #e0e0e0);
  background: transparent; border-radius: 5px; padding: 5px 10px; margin: 3px 0; cursor: pointer;
}
.ide-ask__opt.is-selected { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-ask__opt.is-recommended { border-style: dashed; }
.ide-ask__submit {
  margin-top: 8px; border: none; background: var(--primary-color, #18a058); color: #fff;
  border-radius: 5px; padding: 6px 14px; cursor: pointer;
}
.ide-ask__submit:disabled { opacity: 0.45; cursor: default; }
</style>
