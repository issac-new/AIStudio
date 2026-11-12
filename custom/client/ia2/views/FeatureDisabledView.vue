<!-- overlay/custom/client/ia2/views/FeatureDisabledView.vue
     专题未启用说明页（2026-10-19 P1-5）：专题路由无条件注册，构建开关关闭时
     由本页说明原因与开启方式，替代此前被路由兜底静默送回 /app 的行为。
     P1-5 实测对象=评测工作台（2026-10-19 起默认开，VITE_CUSTOM_EVAL=false 可关）；
     其余专题同为 features.* 构建开关，本页对四个专题通用。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const props = defineProps<{ feature: 'bpa' | 'ontology' | 'eval' | 'skillgov' | 'expdual' }>()
const router = useRouter()
const { locale } = useI18n()

const LABELS: Record<string, { zh: string; en: string; flag: string }> = {
  bpa: { zh: '流程架构工作台', en: 'Process architecture', flag: 'VITE_CUSTOM_BPA' },
  ontology: { zh: '本体工作台', en: 'Ontology workbench', flag: 'VITE_CUSTOM_ONTOLOGY' },
  eval: { zh: '评测工作台', en: 'Eval studio', flag: 'VITE_CUSTOM_EVAL' },
  skillgov: { zh: '技能治理工作台', en: 'Skill governance', flag: 'VITE_CUSTOM_SKILLGOV' },
  expdual: { zh: '双轨经验台账', en: 'Experience ledger', flag: 'VITE_CUSTOM_EXPDUAL' },
}
const meta = computed(() => LABELS[props.feature] ?? LABELS.eval)
const isZh = computed(() => String(locale.value ?? 'zh').startsWith('zh'))
// 开关只门控导航与页面注册，不卸载路由与端点（config/features.ts:8-12）。
// 此处如实告知，避免用户把「入口隐藏」误当成「能力停用」。
const copy = computed(() => (isZh.value
  ? {
      title: `${meta.value.zh}当前未开启`,
      body: `这是一个构建时开关：设置环境变量 ${meta.value.flag}=true 后重新构建即可启用。已有数据不会因为开关关闭而丢失。`,
      notice: '注意：该开关只隐藏导航入口，不关闭服务端能力。直接访问此专题的网址或调用对应接口仍然可用；如需真正停用，须撤下相关补丁或调整服务端配置。',
      back: '返回工作台',
    }
  : {
      title: `${meta.value.en} is not enabled in this build`,
      body: `This is a build-time flag: set ${meta.value.flag}=true and rebuild to enable it. Existing data is kept while the feature is off.`,
      notice: 'Note: this flag only hides navigation entries; server endpoints stay online. Direct links and API calls still work. To fully disable the capability, remove the related patches or change the server configuration.',
      back: 'Back to workbench',
    }))
</script>

<template>
  <div class="fdv" data-testid="feature-disabled">
    <div class="fdv__card">
      <h2 class="fdv__title" data-testid="feature-disabled-title">{{ copy.title }}</h2>
      <p class="fdv__body" data-testid="feature-disabled-body">{{ copy.body }}</p>
      <p class="fdv__notice" data-testid="feature-disabled-notice">{{ copy.notice }}</p>
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
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.fdv__notice {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-left: 2px solid var(--warning-color, var(--text-secondary));
  background: var(--bg-tertiary);
  font-size: 12px;
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
