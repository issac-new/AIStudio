<!-- overlay/custom/client/eval/components/HeldOutPanel.vue
     留出题库（百度评测范式轮 §6）：把后端已有的密封题库产品化。
     契约不变：内容永不出库、评分只回聚合、每调用方每集 3 次防探测。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type HeldOutMetaDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const sets = ref<HeldOutMetaDto[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')

const showCreate = ref(false)
const createName = ref('')
const createItems = ref('[\n  {"prompt": "…", "expected": "…"}\n]')

const selectedId = ref('')
const answersJson = ref('[{"index": 0, "answer": "…"}]')
const scoreResult = ref<{ n: number; passRate: number; attemptsLeft: number } | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await evalApi.heldoutSets()
    sets.value = res.sets
    if (!selectedId.value && sets.value.length) selectedId.value = sets.value[0]!.id
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function create(): Promise<void> {
  error.value = ''
  notice.value = ''
  let items: Array<{ prompt: string; expected: string }>
  try {
    items = JSON.parse(createItems.value)
  } catch {
    error.value = 'items JSON 解析失败'
    return
  }
  try {
    await evalApi.createHeldoutSet({ name: createName.value.trim(), items })
    showCreate.value = false
    createName.value = ''
    notice.value = '已建密卷'
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function score(): Promise<void> {
  error.value = ''
  scoreResult.value = null
  let answers: Array<{ index: number; answer: string }>
  try {
    answers = JSON.parse(answersJson.value)
  } catch {
    error.value = 'answers JSON 解析失败'
    return
  }
  try {
    const res = await evalApi.scoreHeldout(selectedId.value, answers)
    scoreResult.value = res.result
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
</script>

<template>
  <section class="ho card" data-testid="eval-heldout">
    <div class="ho__bar">
      <div>
        <h3>{{ L.heldout.title }}</h3>
        <p class="muted">{{ L.heldout.sub }}</p>
      </div>
      <button type="button" data-testid="eval-heldout-toggle" @click="showCreate = !showCreate">{{ L.heldout.create }}</button>
    </div>

    <p v-if="error" class="ho__error">{{ error }}</p>
    <p v-if="notice" class="ho__ok">{{ notice }}</p>

    <form v-if="showCreate" class="ho__form" data-testid="eval-heldout-create-form" @submit.prevent="create">
      <label>{{ L.heldout.name }}<input v-model="createName" required maxlength="64" data-testid="eval-heldout-name" /></label>
      <label class="wide">{{ L.heldout.items }}<textarea v-model="createItems" rows="5" data-testid="eval-heldout-items" /></label>
      <button type="submit" class="primary" data-testid="eval-heldout-create">{{ L.heldout.create }}</button>
    </form>

    <p v-if="!loading && sets.length === 0" class="muted">{{ L.heldout.empty }}</p>
    <table v-if="sets.length" class="ho-table" data-testid="eval-heldout-sets">
      <thead>
        <tr>
          <th>{{ L.heldout.name }}</th>
          <th>{{ L.sets.taskCount }}</th>
          <th>{{ L.heldout.attempts }}</th>
          <th>{{ L.heldout.sealed }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in sets" :key="s.id" :class="{ selected: s.id === selectedId }" @click="selectedId = s.id">
          <td>{{ s.name }} <span class="mono muted">{{ s.id }}</span></td>
          <td>{{ s.itemCount }}</td>
          <td>{{ s.attemptCount }}</td>
          <td class="muted">{{ s.sealedBy }}</td>
        </tr>
      </tbody>
    </table>

    <form v-if="selectedId" class="ho__form" data-testid="eval-heldout-score-form" @submit.prevent="score">
      <label class="wide">{{ L.heldout.answers }}<textarea v-model="answersJson" rows="4" data-testid="eval-heldout-answers" /></label>
      <button type="submit" class="primary" data-testid="eval-heldout-score">{{ L.heldout.score }}</button>
    </form>

    <div v-if="scoreResult" class="ho__result" data-testid="eval-heldout-result">
      <span>{{ L.heldout.scoreOf }}：{{ L.heldout.passRate }} <strong>{{ pct(scoreResult.passRate) }}</strong>（n={{ scoreResult.n }}）</span>
      <span class="muted">· {{ L.heldout.attempts }} {{ scoreResult.attemptsLeft }}</span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.ho { display: flex; flex-direction: column; gap: 10px; padding: 12px; margin-top: 14px; }
.ho__bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  h3 { margin: 0; font-size: 14px; } p { margin: 2px 0 0; font-size: 11px; }
  button { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
}
.ho__error { color: var(--danger); font-size: 12px; margin: 0; }
.ho__ok { color: var(--success); font-size: 12px; margin: 0; }
.ho__form { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
  label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
  .wide { flex: 1 1 100%; }
  input, textarea { border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 7px; background: transparent; color: inherit; font-family: inherit; }
}
.ho-table { width: 100%; border-collapse: collapse; font-size: 12px;
  th, td { text-align: left; padding: 5px 7px; border-top: 1px solid var(--border-color); }
  tr { cursor: pointer; &.selected { background: color-mix(in srgb, var(--border-color) 30%, transparent); } }
}
.ho__result { font-size: 13px; strong { color: var(--success); } }
.mono { font-family: var(--font-mono, monospace); font-size: 10px; }
</style>
