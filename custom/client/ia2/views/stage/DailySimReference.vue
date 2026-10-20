<!-- ⑤验收日常面板的「推演参照」行（D1 互验通道）：日常四签只读日常数据，
     推演侧对应台账/证据在全流程推演区核对——只读链接，不携带运行上下文。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{ to?: string; what: string }>(), { to: 'ia2.simEvidence' })
const router = useRouter()
const { locale } = useI18n()
const zh = computed(() => String(locale.value).startsWith('zh'))
</script>

<template>
  <p class="dsr" data-testid="daily-sim-reference">
    <span class="dsr__hint">{{ zh ? `推演参照：${props.what}可回全流程推演区核对。` : `Sim cross-check: ${props.what} can be verified in the simulation area.` }}</span>
    <button type="button" class="dsr__link" data-testid="daily-sim-reference-link" @click="router.push({ name: props.to })">{{ zh ? '去推演区核对 →' : 'Open simulation →' }}</button>
  </p>
</template>

<style scoped>
.dsr { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding-top: 8px; border-top: 1px dashed var(--border-color); font-size: 11.5px; color: var(--text-muted); }
.dsr__link { border: none; background: transparent; padding: 0; color: var(--accent-primary); font-size: 11.5px; cursor: pointer; }
.dsr__link:hover { text-decoration: underline; }
</style>
