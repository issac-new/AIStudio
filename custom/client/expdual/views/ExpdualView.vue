<!-- overlay/custom/client/expdual/views/ExpdualView.vue -->
<!-- 双轨经验台账页：双库/退役池/矛盾候选/复核信号四区。只读为主，写动作三件
     （新增入库、手动退役、矛盾 commit/dismiss）全部走确定性校验端点——本页不发提示词、
     不自动退役（复核信号只给建议）。文案单一事实源=本模块 i18n.ts。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TopicPageLayout from '@/custom/ia2/components/TopicPageLayout.vue'
import { useTabQuery } from '@/custom/ia2/composables/useTabQuery'
import { expdualApi, type BanksDto, type SynthesisCandidateDto, type PremiseSignalDto, type ClassificationDto } from '@/custom/expdual/api'
import { expdualMessages } from '@/custom/expdual/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? expdualMessages.zh.expdual : expdualMessages.en.expdual
})

const TABS = ['banks', 'retired', 'synthesis', 'signals'] as const
const tab = useTabQuery('tab', TABS, 'banks')

// ── 双库 ─────────────────────────────────────────────
const banks = ref<BanksDto | null>(null)
const loadError = ref('')
const busy = ref(false)

async function load(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    banks.value = await expdualApi.banks()
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
onMounted(load)

const selectedRule = ref<string>('')

// ── 新增（classify 预览 → induce ADD）──────────────────
const draft = ref('')
const preview = ref<ClassificationDto | null>(null)
const previewError = ref('')
const addResult = ref('')
const addError = ref('')

async function runPreview(): Promise<void> {
  previewError.value = ''
  preview.value = null
  addResult.value = ''
  if (!draft.value.trim()) return
  try {
    preview.value = (await expdualApi.classify(draft.value.trim())).classification
  } catch (e) {
    previewError.value = (e as Error).message
  }
}

async function submitAdd(): Promise<void> {
  addError.value = ''
  addResult.value = ''
  if (!preview.value) return
  try {
    const p = preview.value
    const r = await expdualApi.induceAdd([{ op: 'ADD', channel: p.channel, text: p.text }])
    addResult.value = r.applied.join('；')
    draft.value = ''
    preview.value = null
    await load()
  } catch (e) {
    addError.value = (e as Error).message
  }
}

// ── 手动退役 / 归因 ────────────────────────────────────
const retireNote = ref('')
const retireError = ref('')
const blameForm = ref({ taskRef: '', step: '', note: '' })
const blameError = ref('')

async function submitRetire(): Promise<void> {
  retireError.value = ''
  if (!selectedRule.value || !retireNote.value.trim()) return
  try {
    await expdualApi.retire(selectedRule.value, retireNote.value.trim())
    selectedRule.value = ''
    retireNote.value = ''
    await load()
  } catch (e) {
    retireError.value = (e as Error).message
  }
}

async function submitBlame(): Promise<void> {
  blameError.value = ''
  const f = blameForm.value
  if (!selectedRule.value || !f.taskRef.trim() || !f.step.trim() || !f.note.trim()) return
  try {
    await expdualApi.blame({ ruleId: selectedRule.value, taskRef: f.taskRef.trim(), step: f.step.trim(), note: f.note.trim() })
    blameForm.value = { taskRef: '', step: '', note: '' }
    selectedRule.value = ''
    await load()
  } catch (e) {
    blameError.value = (e as Error).message
  }
}

// ── 矛盾候选 ──────────────────────────────────────────
const candidates = ref<SynthesisCandidateDto[]>([])
const synthError = ref('')
const synthForms = ref<Record<string, { condition: string; action: string; note: string }>>({})

function formOf(id: string) {
  if (!synthForms.value[id]) synthForms.value[id] = { condition: '', action: '', note: '' }
  return synthForms.value[id]
}

async function loadSynthesis(): Promise<void> {
  synthError.value = ''
  try {
    candidates.value = (await expdualApi.synthesis()).items
  } catch (e) {
    synthError.value = (e as Error).message
  }
}

async function detect(): Promise<void> {
  synthError.value = ''
  try {
    await expdualApi.detectSynthesis()
    await loadSynthesis()
  } catch (e) {
    synthError.value = (e as Error).message
  }
}

async function commit(id: string): Promise<void> {
  synthError.value = ''
  const f = formOf(id)
  if (!f.condition.trim() || !f.action.trim()) return
  try {
    await expdualApi.commitSynthesis({ candidateId: id, condition: f.condition.trim(), action: f.action.trim(), note: f.note.trim() || undefined })
    await loadSynthesis()
    await load()
  } catch (e) {
    synthError.value = (e as Error).message
  }
}

async function dismiss(id: string): Promise<void> {
  synthError.value = ''
  const f = formOf(id)
  if (!f.note.trim()) return
  try {
    await expdualApi.dismissSynthesis(id, f.note.trim())
    await loadSynthesis()
  } catch (e) {
    synthError.value = (e as Error).message
  }
}

// ── 复核信号 ──────────────────────────────────────────
const signals = ref<PremiseSignalDto[]>([])
const signalsAvailable = ref(true)
const signalsNote = ref('')
const signalsError = ref('')

async function loadSignals(): Promise<void> {
  signalsError.value = ''
  try {
    const r = await expdualApi.premiseSignals()
    signals.value = r.signals
    signalsAvailable.value = r.available
    signalsNote.value = r.note ?? ''
  } catch (e) {
    signalsError.value = (e as Error).message
  }
}

function onTab(name: (typeof TABS)[number]): void {
  tab.value = name
  if (name === 'synthesis' && candidates.value.length === 0) void loadSynthesis()
  if (name === 'signals' && signals.value.length === 0 && signalsAvailable.value) void loadSignals()
}
</script>

<template>
  <section class="expdual-view" data-testid="expdual-view">
    <header class="expdual-view__head">
      <div>
        <h1 class="expdual-view__title">{{ L.navTitle }}</h1>
        <p class="expdual-view__tag">{{ L.tagline }}</p>
      </div>
    </header>

    <div v-if="loadError" class="expdual-error" data-testid="expdual-load-error">
      {{ L.error }}：{{ loadError }}
      <button type="button" data-testid="expdual-retry" @click="load">{{ L.retry }}</button>
    </div>

    <TopicPageLayout>
      <template #tabs>
        <nav class="expdual-tabs" data-testid="expdual-tabs">
          <button v-for="t in TABS" :key="t" type="button" :class="{ active: tab === t }"
            :data-testid="`expdual-tab-${t}`" @click="onTab(t)">
            {{ t === 'banks' ? L.tabBanks : t === 'retired' ? L.tabRetired : t === 'synthesis' ? L.tabSynthesis : L.tabSignals }}
          </button>
        </nav>
      </template>

      <!-- 双库 -->
      <div v-if="tab === 'banks'" class="expdual-pane" data-testid="expdual-pane-banks">
        <dl class="expdual-counts" data-testid="expdual-counts" v-if="banks">
          <div><dt>{{ L.counts.facts }}</dt><dd data-testid="expdual-count-facts">{{ banks.counts.facts }}</dd></div>
          <div><dt>{{ L.counts.tips }}</dt><dd data-testid="expdual-count-tips">{{ banks.counts.tips }}</dd></div>
          <div><dt>{{ L.counts.retired }}</dt><dd>{{ banks.counts.retired }}</dd></div>
          <div><dt>{{ L.counts.chunk }}</dt><dd data-testid="expdual-count-chunk">{{ banks.chunk }}</dd></div>
        </dl>

        <p class="expdual-hint">{{ L.factHint }}</p>
        <table class="expdual-table" data-testid="expdual-table-facts">
          <thead><tr><th></th><th>{{ L.colRule }}</th><th>{{ L.colCount }}</th><th>{{ L.colBlame }}</th></tr></thead>
          <tbody>
            <tr v-for="r in banks?.facts ?? []" :key="r.id" :data-testid="`expdual-rule-${r.id}`"
              :class="{ selected: selectedRule === r.id }" @click="selectedRule = r.id">
              <td><input type="radio" name="expdual-rule" :value="r.id" v-model="selectedRule" /></td>
              <td class="expdual-rule-text">{{ r.text }}</td>
              <td>{{ r.count }}</td>
              <td>{{ r.blameCount }}</td>
            </tr>
          </tbody>
        </table>

        <p class="expdual-hint">{{ L.tipHint }}</p>
        <table class="expdual-table" data-testid="expdual-table-tips">
          <thead><tr><th></th><th>{{ L.colRule }}</th><th>{{ L.colCount }}</th><th>{{ L.colBlame }}</th></tr></thead>
          <tbody>
            <tr v-for="r in banks?.tips ?? []" :key="r.id" :data-testid="`expdual-rule-${r.id}`"
              :class="{ selected: selectedRule === r.id }" @click="selectedRule = r.id">
              <td><input type="radio" name="expdual-rule" :value="r.id" v-model="selectedRule" /></td>
              <td class="expdual-rule-text">{{ r.text }}</td>
              <td>{{ r.count }}</td>
              <td>{{ r.blameCount }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="banks && banks.counts.facts + banks.counts.tips === 0" class="expdual-hint" data-testid="expdual-banks-empty">{{ L.empty }}</p>

        <div class="expdual-forms">
          <form class="expdual-form" data-testid="expdual-add-form" @submit.prevent="submitAdd">
            <h3>{{ L.addTitle }}</h3>
            <input v-model="draft" type="text" :placeholder="L.addText" data-testid="expdual-add-text"
              @blur="runPreview" @change="runPreview" />
            <button type="button" data-testid="expdual-add-preview" @click="runPreview">{{ L.addPreview }}</button>
            <p v-if="preview" class="expdual-preview" :data-testid="`expdual-preview-${preview.channel}`">
              {{ L.classifyAs }}：{{ preview.channel.toUpperCase() }}（{{ preview.rationale }}）
            </p>
            <p v-if="previewError" class="expdual-error" data-testid="expdual-preview-error">{{ previewError }}</p>
            <button type="submit" :disabled="!preview" data-testid="expdual-add-submit">{{ L.addSubmit }}</button>
            <p v-if="addResult" class="expdual-ok" data-testid="expdual-add-result">{{ L.addResult }}：{{ addResult }}</p>
            <p v-if="addError" class="expdual-error" data-testid="expdual-add-error">{{ addError }}</p>
          </form>

          <form v-if="selectedRule" class="expdual-form" data-testid="expdual-retire-form" @submit.prevent="submitRetire">
            <h3>{{ L.retireTitle }}（{{ selectedRule }}）</h3>
            <input v-model="retireNote" type="text" :placeholder="L.retireNote" data-testid="expdual-retire-note" />
            <button type="submit" :disabled="!retireNote.trim()" data-testid="expdual-retire-submit">{{ L.retireSubmit }}</button>
            <p v-if="retireError" class="expdual-error" data-testid="expdual-retire-error">{{ retireError }}</p>
          </form>

          <form v-if="selectedRule" class="expdual-form" data-testid="expdual-blame-form" @submit.prevent="submitBlame">
            <h3>{{ L.blameTitle }}（{{ selectedRule }}）</h3>
            <input v-model="blameForm.taskRef" type="text" :placeholder="L.blameTask" data-testid="expdual-blame-task" />
            <input v-model="blameForm.step" type="text" :placeholder="L.blameStep" data-testid="expdual-blame-step" />
            <input v-model="blameForm.note" type="text" :placeholder="L.blameNote" data-testid="expdual-blame-note" />
            <button type="submit" :disabled="!blameForm.taskRef.trim() || !blameForm.step.trim() || !blameForm.note.trim()"
              data-testid="expdual-blame-submit">{{ L.blameSubmit }}</button>
            <p v-if="blameError" class="expdual-error" data-testid="expdual-blame-error">{{ blameError }}</p>
          </form>
        </div>
      </div>

      <!-- 退役池 -->
      <div v-else-if="tab === 'retired'" class="expdual-pane" data-testid="expdual-pane-retired">
        <table class="expdual-table" data-testid="expdual-table-retired">
          <thead><tr><th>{{ L.colRule }}</th><th>{{ L.colReason }}</th><th>{{ L.colChunk }}</th></tr></thead>
          <tbody>
            <tr v-for="r in banks?.retired ?? []" :key="r.id" :data-testid="`expdual-retired-${r.id}`">
              <td class="expdual-rule-text">{{ r.text }}</td>
              <td>{{ r.reason }}<template v-if="r.note">：{{ r.note }}</template></td>
              <td>{{ r.chunk }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="banks && banks.retired.length === 0" class="expdual-hint">{{ L.empty }}</p>
      </div>

      <!-- 矛盾候选 -->
      <div v-else-if="tab === 'synthesis'" class="expdual-pane" data-testid="expdual-pane-synthesis">
        <button type="button" data-testid="expdual-synth-detect" @click="detect">{{ L.synthDetect }}</button>
        <p v-if="synthError" class="expdual-error" data-testid="expdual-synth-error">{{ synthError }}</p>
        <p v-if="candidates.filter(c => c.status === 'open').length === 0" class="expdual-hint" data-testid="expdual-synth-empty">{{ L.empty }}</p>
        <div v-for="c in candidates.filter(x => x.status === 'open')" :key="c.id" class="expdual-cand" :data-testid="`expdual-cand-${c.id}`">
          <p class="expdual-cand-reason">{{ c.reason }}</p>
          <input v-model="formOf(c.id).condition" type="text" :placeholder="L.synthCond"
            :data-testid="`expdual-synth-cond-${c.id}`" />
          <input v-model="formOf(c.id).action" type="text" :placeholder="L.synthAction"
            :data-testid="`expdual-synth-action-${c.id}`" />
          <button type="button" :disabled="!formOf(c.id).condition.trim() || !formOf(c.id).action.trim()"
            :data-testid="`expdual-synth-commit-${c.id}`" @click="commit(c.id)">{{ L.synthCommit }}</button>
          <input v-model="formOf(c.id).note" type="text" :placeholder="L.synthDismissNote"
            :data-testid="`expdual-synth-dismiss-note-${c.id}`" />
          <button type="button" :disabled="!formOf(c.id).note.trim()"
            :data-testid="`expdual-synth-dismiss-${c.id}`" @click="dismiss(c.id)">{{ L.synthDismiss }}</button>
        </div>
      </div>

      <!-- 复核信号 -->
      <div v-else class="expdual-pane" data-testid="expdual-pane-signals">
        <p v-if="signalsError" class="expdual-error" data-testid="expdual-signals-error">{{ signalsError }}</p>
        <p v-else-if="!signalsAvailable" class="expdual-hint" data-testid="expdual-signals-unavailable">{{ L.signalUnavailable }}</p>
        <p v-else-if="signals.length === 0" class="expdual-hint" data-testid="expdual-signals-empty">{{ L.signalNone }}</p>
        <table v-else class="expdual-table" data-testid="expdual-table-signals">
          <thead><tr><th>{{ L.colRule }}</th><th>{{ L.counts.facts }}</th><th>{{ L.signalRef }}</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in signals" :key="`${s.premiseId}-${s.ruleId}-${i}`" :data-testid="`expdual-signal-${i}`">
              <td class="expdual-rule-text">{{ s.ruleText }}</td>
              <td>{{ s.premiseId }}（{{ s.score }}）</td>
              <td>{{ s.refutedBy ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TopicPageLayout>
  </section>
</template>

<style scoped lang="scss">
.expdual-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--text-primary, inherit);

  &__head { display: flex; align-items: baseline; gap: 12px; }
  &__title { font-size: 18px; margin: 0; }
  &__tag { font-size: 12px; color: var(--text-muted, #888); margin: 0; }
}
.expdual-tabs {
  display: flex; gap: 8px;
  button {
    padding: 4px 12px; border: 1px solid var(--border-color, #ccc); border-radius: 6px;
    background: transparent; color: inherit; cursor: pointer;
    &.active { border-color: var(--accent-primary, #06f); color: var(--accent-primary, #06f); }
  }
}
.expdual-counts {
  display: flex; gap: 20px; margin: 0 0 8px;
  div { display: flex; flex-direction: column; }
  dt { font-size: 11px; color: var(--text-muted, #888); }
  dd { margin: 0; font-size: 18px; font-weight: 600; }
}
.expdual-hint { font-size: 12px; color: var(--text-muted, #888); margin: 8px 0 4px; }
.expdual-table {
  width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px;
  th, td { border: 1px solid var(--border-color, #ddd); padding: 4px 8px; text-align: left; vertical-align: top; }
  th { color: var(--text-muted, #888); font-weight: 500; }
  tr.selected td { background: var(--accent-primary, #06f); opacity: 0.92; }
}
.expdual-rule-text { max-width: 520px; }
.expdual-forms { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
.expdual-form {
  display: flex; flex-direction: column; gap: 6px; min-width: 320px;
  h3 { margin: 0; font-size: 13px; }
  input { padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 4px; color: inherit; background: transparent; }
  button { align-self: flex-start; padding: 4px 12px; border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
}
.expdual-preview { font-size: 12px; color: var(--accent-primary, #06f); margin: 0; }
.expdual-ok { font-size: 12px; color: var(--text-muted, #888); margin: 0; }
.expdual-error {
  font-size: 12px; color: var(--color-error, #d33); margin: 4px 0;
  button { margin-left: 8px; }
}
.expdual-cand {
  display: flex; flex-direction: column; gap: 6px; padding: 8px;
  border: 1px solid var(--border-color, #ddd); border-radius: 6px; margin-bottom: 8px;
  input { padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 4px; color: inherit; background: transparent; }
  button { align-self: flex-start; padding: 4px 12px; border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
}
.expdual-cand-reason { font-size: 12px; margin: 0; color: var(--text-muted, #888); }
</style>
