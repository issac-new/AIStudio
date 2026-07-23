<!-- overlay/custom/client/loop/components/LoopCreateWizard.vue -->
<!-- LoopCreateWizard — 场景化创建向导（中文场景卡片 + 高级选项折叠） -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import { PATTERN_TEMPLATES, type LoopPattern } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'close'): void; (e: 'created'): void }>()

const step = ref<'scenario' | 'config'>('scenario')
const selectedPattern = ref<LoopPattern | null>(null)
const showAdvanced = ref(false)

const form = ref({
  name: '',
  goal: '',
  stopCondition: '',
  cron: '0 9 * * *',
  autonomyLevel: 'L1' as 'L1' | 'L2' | 'L3',
  budget: 50,
})

// 场景卡片（中文场景描述，不是英文术语）
interface Scenario {
  pattern: LoopPattern
  icon: string
  cost: string
}

const scenarios: Scenario[] = [
  { pattern: 'daily-triage', icon: '📋', cost: t('loop.wizard.costLow') },
  { pattern: 'ci-sweeper', icon: '🔧', cost: t('loop.wizard.costHigh') },
  { pattern: 'dep-sweeper', icon: '📦', cost: t('loop.wizard.costMedium') },
  { pattern: 'issue-triage', icon: '🏷️', cost: t('loop.wizard.costLow') },
  { pattern: 'pr-babysitter', icon: '👶', cost: t('loop.wizard.costHigh') },
  { pattern: 'changelog-drafter', icon: '📝', cost: t('loop.wizard.costLow') },
  { pattern: 'post-merge-cleanup', icon: '🧹', cost: t('loop.wizard.costLow') },
]

function selectScenario(s: Scenario) {
  selectedPattern.value = s.pattern
  const tmpl = PATTERN_TEMPLATES[s.pattern]
  form.value.cron = tmpl.defaultCron
  form.value.autonomyLevel = tmpl.defaultLevel
  form.value.goal = tmpl.goalTemplate
  form.value.stopCondition = tmpl.stopConditionTemplate
  // 自动生成名称
  form.value.name = t(`loop.wizard.scenarios.${s.pattern}.name`)
  step.value = 'config'
}

const canCreate = computed(() => form.value.name.trim().length > 0)

async function create() {
  if (!selectedPattern.value) return
  await store.createLoop({
    id: `loop-${form.value.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}-${Date.now()}`,
    name: form.value.name,
    goal: form.value.goal,
    stopCondition: form.value.stopCondition,
    pattern: selectedPattern.value,
    schedule: { mode: 'cron', cron: form.value.cron, timezone: 'Asia/Shanghai' },
    autonomyLevel: form.value.autonomyLevel,
    budget: {
      maxCostPerTick: form.value.budget,
      maxCostTotal: form.value.budget * 4,
      killMode: 'throw',
      warningThreshold: 0.8,
    },
  } as any)
  emit('created')
}

function back() {
  step.value = 'scenario'
}
</script>

<template>
  <div class="loop-wizard">
    <div class="loop-wizard__overlay" @click="emit('close')"></div>
    <div class="loop-wizard__dialog">

      <!-- Step 1: 场景选择 -->
      <template v-if="step === 'scenario'">
        <h3 class="loop-wizard__title">{{ t('loop.wizard.selectScenario') }}</h3>
        <p class="loop-wizard__hint">{{ t('loop.wizard.scenarioHint') }}</p>
        <div class="loop-wizard__scenarios">
          <div v-for="s in scenarios" :key="s.pattern"
            class="loop-wizard__scenario" @click="selectScenario(s)">
            <span class="loop-wizard__scenario-icon">{{ s.icon }}</span>
            <div class="loop-wizard__scenario-info">
              <strong>{{ t(`loop.wizard.scenarios.${s.pattern}.name`) }}</strong>
              <p>{{ t(`loop.wizard.scenarios.${s.pattern}.desc`) }}</p>
              <span class="loop-wizard__scenario-meta">
                {{ t(`loop.wizard.scenarios.${s.pattern}.schedule`) }} · {{ s.cost }}
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- Step 2: 配置 -->
      <template v-if="step === 'config'">
        <h3 class="loop-wizard__title">{{ t('loop.wizard.configure') }}</h3>

        <label class="loop-wizard__field">
          {{ t('loop.wizard.name') }}
          <input v-model="form.name" :placeholder="t('loop.wizard.namePlaceholder')" />
        </label>

        <label class="loop-wizard__field">
          {{ t('loop.wizard.goal') }}
          <textarea v-model="form.goal" rows="3" />
        </label>

        <label class="loop-wizard__field">
          {{ t('loop.wizard.schedule') }}
          <div class="loop-wizard__schedule-preview">{{ t(`loop.wizard.scenarios.${selectedPattern}.schedule`) }}</div>
        </label>

        <!-- 高级选项折叠 -->
        <div class="loop-wizard__advanced">
          <button class="loop-wizard__advanced-toggle" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '▾' : '▸' }} {{ t('loop.wizard.advanced') }}
          </button>
          <template v-if="showAdvanced">
            <label class="loop-wizard__field">
              {{ t('loop.wizard.stopCondition') }}
              <input v-model="form.stopCondition" />
            </label>
            <label class="loop-wizard__field">
              {{ t('loop.wizard.cron') }}
              <input v-model="form.cron" />
            </label>
            <label class="loop-wizard__field">
              {{ t('loop.wizard.autonomyLevel') }}
              <select v-model="form.autonomyLevel">
                <option value="L1">{{ t('loop.wizard.l1') }}</option>
                <option value="L2">{{ t('loop.wizard.l2') }}</option>
                <option value="L3">{{ t('loop.wizard.l3') }}</option>
              </select>
            </label>
            <label class="loop-wizard__field">
              {{ t('loop.wizard.budget') }} $<input type="number" v-model="form.budget" />{{ t('loop.wizard.perTick') }}
            </label>
          </template>
        </div>

        <div class="loop-wizard__actions">
          <button class="loop-wizard__btn loop-wizard__btn--back" @click="back">← {{ t('loop.wizard.back') }}</button>
          <button class="loop-wizard__btn loop-wizard__btn--cancel" @click="emit('close')">{{ t('loop.wizard.cancel') }}</button>
          <button class="loop-wizard__btn loop-wizard__btn--primary" :disabled="!canCreate" @click="create">
            {{ t('loop.wizard.create') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.loop-wizard { position: fixed; inset: 0; z-index: 1010; }
.loop-wizard__overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.loop-wizard__dialog {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: var(--bg-card, var(--color-bg-primary));
  border-radius: 12px; padding: 1.5rem;
  max-width: 640px; width: 90%; max-height: 85vh; overflow: auto;
}
.loop-wizard__title { margin: 0 0 0.5rem; }
.loop-wizard__hint { opacity: 0.7; font-size: 0.9rem; margin-bottom: 1rem; }

.loop-wizard__scenarios { display: flex; flex-direction: column; gap: 0.5rem; }
.loop-wizard__scenario {
  display: flex; gap: 1rem; padding: 0.75rem;
  border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer;
}
.loop-wizard__scenario:hover { border-color: var(--color-primary, #3b82f6); background: var(--hover-bg); }
.loop-wizard__scenario-icon { font-size: 1.5rem; }
.loop-wizard__scenario-info strong { display: block; margin-bottom: 0.25rem; }
.loop-wizard__scenario-info p { margin: 0 0 0.25rem; font-size: 0.85rem; opacity: 0.7; }
.loop-wizard__scenario-meta { font-size: 0.8rem; opacity: 0.6; }

.loop-wizard__field { display: block; margin-bottom: 0.75rem; font-size: 0.9rem; }
.loop-wizard__field input, .loop-wizard__field textarea, .loop-wizard__field select {
  width: 100%; padding: 0.5rem; margin-top: 0.25rem;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--color-bg-input, transparent); color: inherit;
  font-size: 0.9rem;
}
.loop-wizard__schedule-preview { padding: 0.5rem; background: var(--bg-secondary, rgba(0,0,0,0.05)); border-radius: 4px; font-size: 0.85rem; opacity: 0.8; }

.loop-wizard__advanced { margin: 1rem 0; }
.loop-wizard__advanced-toggle { border: none; background: transparent; cursor: pointer; font-size: 0.85rem; color: var(--color-primary, #3b82f6); padding: 0.25rem 0; }

.loop-wizard__actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
.loop-wizard__btn { padding: 0.5rem 1.25rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-color); background: transparent; }
.loop-wizard__btn--primary { background: var(--color-primary, #3b82f6); color: white; border: none; }
.loop-wizard__btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
