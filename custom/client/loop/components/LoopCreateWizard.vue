<!-- overlay/custom/client/loop/components/LoopCreateWizard.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import { PATTERN_TEMPLATES, type LoopPattern } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'close'): void }>()

const step = ref(0)
const selectedPattern = ref<LoopPattern | null>(null)
const form = ref({
  name: '',
  goal: '',
  stopCondition: '',
  cron: '0 9 * * *',
  autonomyLevel: 'L1' as const,
  budget: 50,
  // C6: writeBoundary 是 string[](glob 列表),而非单个 string。
  writeBoundary: ['packages/**'],
})

// M2: 移除空的 onMounted(patterns 直接用 PATTERN_TEMPLATES,无需 fetch)。

function selectPattern(p: LoopPattern) {
  selectedPattern.value = p
  const tmpl = PATTERN_TEMPLATES[p]
  form.value.cron = tmpl.defaultCron
  form.value.autonomyLevel = tmpl.defaultLevel
  form.value.goal = tmpl.goalTemplate
  form.value.stopCondition = tmpl.stopConditionTemplate
  step.value = 1
}

async function create() {
  await store.createLoop({
    id: `loop/${form.value.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name: form.value.name,
    goal: form.value.goal,
    stopCondition: form.value.stopCondition,
    pattern: selectedPattern.value!,
    schedule: { mode: 'cron', cron: form.value.cron, timezone: 'Asia/Shanghai' },
    autonomyLevel: form.value.autonomyLevel,
    budget: { maxCostPerTick: form.value.budget, maxCostTotal: form.value.budget * 4, killMode: 'throw', warningThreshold: 0.8 },
    // C6: 发送 writeBoundary 字段(此前遗漏)。
    writeBoundary: form.value.writeBoundary,
  } as any)
  emit('close')
}
</script>

<template>
  <div class="loop-wizard">
    <div class="loop-wizard__overlay" @click="emit('close')"></div>
    <div class="loop-wizard__dialog">
      <template v-if="step === 0">
        <h3>{{ t('loop.wizard.selectPattern') }}</h3>
        <div class="loop-wizard__patterns">
          <div v-for="tmpl in Object.values(PATTERN_TEMPLATES)" :key="tmpl.pattern"
            class="loop-wizard__pattern" @click="selectPattern(tmpl.pattern)">
            <h4>{{ tmpl.pattern }}</h4>
            <p>{{ tmpl.goalTemplate }}</p>
            <span>{{ tmpl.defaultCron }} · {{ tmpl.defaultLevel }} · {{ tmpl.costEstimate }}</span>
          </div>
        </div>
      </template>
      <template v-if="step === 1">
        <h3>{{ t('loop.wizard.configure') }}</h3>
        <label>{{ t('loop.wizard.name') }} <input v-model="form.name" /></label>
        <label>{{ t('loop.wizard.goal') }} <textarea v-model="form.goal"></textarea></label>
        <label>{{ t('loop.wizard.stopCondition') }} <input v-model="form.stopCondition" /></label>
        <label>{{ t('loop.wizard.cron') }} <input v-model="form.cron" /></label>
        <label>{{ t('loop.wizard.autonomyLevel') }}
          <select v-model="form.autonomyLevel">
            <option value="L1">{{ t('loop.wizard.l1') }}</option>
            <option value="L2">{{ t('loop.wizard.l2') }}</option>
            <option value="L3">{{ t('loop.wizard.l3') }}</option>
          </select>
        </label>
        <label>{{ t('loop.wizard.budget') }} $<input type="number" v-model="form.budget" />{{ t('loop.wizard.perTick') }}</label>
        <label>{{ t('loop.wizard.writeBoundary') }} <input v-model="form.writeBoundary" /></label>
        <button @click="create">{{ t('loop.wizard.create') }}</button>
        <button @click="emit('close')">{{ t('loop.wizard.cancel') }}</button>
      </template>
    </div>
  </div>
</template>
