<!-- overlay/custom/client/loop/components/LoopCreateWizard.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import { PATTERN_TEMPLATES, type LoopPattern } from '@/custom/loop/types'

const store = useLoopStore()
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
  writeBoundary: 'packages/**',
})

onMounted(() => { /* patterns available via PATTERN_TEMPLATES */ })

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
  })
  emit('close')
}
</script>

<template>
  <div class="loop-wizard">
    <div class="loop-wizard__overlay" @click="emit('close')"></div>
    <div class="loop-wizard__dialog">
      <template v-if="step === 0">
        <h3>选择 Loop 模式</h3>
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
        <h3>配置 Loop</h3>
        <label>名称 <input v-model="form.name" /></label>
        <label>目标 <textarea v-model="form.goal"></textarea></label>
        <label>停止条件 <input v-model="form.stopCondition" /></label>
        <label>Cron <input v-model="form.cron" /></label>
        <label>自治级
          <select v-model="form.autonomyLevel">
            <option value="L1">L1 报告</option>
            <option value="L2">L2 辅助</option>
            <option value="L3">L3 无人</option>
          </select>
        </label>
        <label>预算 $<input type="number" v-model="form.budget" />/tick</label>
        <label>写边界 <input v-model="form.writeBoundary" /></label>
        <button @click="create">创建</button>
        <button @click="emit('close')">取消</button>
      </template>
    </div>
  </div>
</template>
