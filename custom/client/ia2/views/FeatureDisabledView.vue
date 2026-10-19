<!-- overlay/custom/client/ia2/views/FeatureDisabledView.vue
     专题未启用说明页（2026-10-19 P1-5）：专题路由无条件注册，构建开关关闭时
     由本页说明原因与开启方式，替代此前被路由兜底静默送回 /app 的行为。
     P1-5 实测对象=评测工作台（2026-10-19 起默认开，VITE_CUSTOM_EVAL=false 可关）；
     其余专题同为 features.* 构建开关，本页对四个专题通用。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const props = defineProps<{ feature: 'bpa' | 'ontology' | 'eval' | 'skillgov' }>()
const router = useRouter()
const { locale } = useI18n()

const LABELS: Record<string, { zh: string; en: string; flag: string }> = {
  bpa: { zh: '流程架构工作台', en: 'Process architecture', flag: 'VITE_CUSTOM_BPA' },
  ontology: { zh: '本体工作台', en: 'Ontology workbench', flag: 'VITE_CUSTOM_ONTOLOGY' },
  eval: { zh: '评测工作台', en: 'Eval studio', flag: 'VITE_CUSTOM_EVAL' },
  skillgov: { zh: '技能治理工作台', en: 'Skill governance', flag: 'VITE_CUSTOM_SKILLGOV' },
}
const meta = computed(() => LABELS[props.feature] ?? LABELS.eval)
const isZh = computed(() => String(locale.value ?? 'zh').startsWith('zh'))
const copy = computed(() => (isZh.value
  ? {
      title: `${meta.value.zh}当前未开启`,
      body: `这是一个构建时开关：设置环境变量 ${meta.value.flag}=true 后重新构建即可启用。已有数据不会因为开关关闭而丢失。`,
      back: '返回工作台',
    }
  : {
      title: `${meta.value.en} is not enabled in this build`,
      body: `This is a build-time flag: set ${meta.value.flag}=true and rebuild to enable it. Existing data is kept while the feature is off.`,
      back: 'Back to workbench',
    }))
</script>

<template>
  <div class="fdv" data-testid="feature-disabled">
    <div class="fdv__card">
      <h2 class="fdv__title" data-testid="feature-disabled-title">{{ copy.title }}</h2>
      <p class="fdv__body" data-testid="feature-disabled-body">{{ copy.body }}</p>
      <button type="button" class="fdv__back" data-testid="feature-disabled-back" @click="router.push('/app')">
        {{ copy.back }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fdv {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}
.fdv__card {
  width: min(460px, 100%);
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
}
.fdv__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.fdv__body {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.fdv__back {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}
</style>
