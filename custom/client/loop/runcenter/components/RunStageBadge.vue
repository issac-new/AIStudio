<!-- overlay/custom/client/loop/runcenter/components/RunStageBadge.vue -->
<!-- RunStageBadge — 运行状态徽标（Pure Ink：语义色只取 CSS 变量）。
     running 呼吸绿点 / awaiting-input warning / completed 灰 / failed error。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { statusTone } from '../adapters'
import type { RunStatus } from '../types'

const props = defineProps<{
  status: RunStatus
}>()

const { t } = useI18n()

/** 状态 → i18n key（'awaiting-input' 等连字符值收敛为驼峰 key） */
const STATUS_I18N_KEY: Record<RunStatus, string> = {
  'idle': 'idle',
  'running': 'running',
  'paused': 'paused',
  'awaiting-input': 'awaitingInput',
  'completed': 'completed',
  'failed': 'failed',
  'unknown': 'unknown',
}

const tone = computed(() => statusTone(props.status))
const label = computed(() => t(`runcenter.status.${STATUS_I18N_KEY[props.status] ?? 'unknown'}`))
</script>

<template>
  <span class="rc-badge" :class="`rc-badge--${tone}`">
    <span class="rc-badge__dot" aria-hidden="true" />
    <span class="rc-badge__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.rc-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.rc-badge__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill, 999px);
  flex-shrink: 0;
  background: var(--text-muted, #999);
}
/* 语义色：只映射 CSS 变量，不写死色值（dark/comic 主题自动适配） */
.rc-badge--ok .rc-badge__dot { background: var(--color-success, #28bf5c); }
.rc-badge--ok .rc-badge__label { color: var(--color-success, #28bf5c); }
.rc-badge--warning .rc-badge__dot { background: var(--color-warning, #f59e0b); }
.rc-badge--warning .rc-badge__label { color: var(--color-warning, #f59e0b); }
.rc-badge--error .rc-badge__dot { background: var(--color-danger, #e11d48); }
.rc-badge--error .rc-badge__label { color: var(--color-danger, #e11d48); }
.rc-badge--muted .rc-badge__label { color: var(--text-muted, var(--color-text-secondary, #878c99)); }

/* running 呼吸绿点：透明度呼吸 + 光晕扩散，2s 循环 */
.rc-badge--ok .rc-badge__dot {
  animation: rc-pulse 2s ease-in-out infinite;
}
@keyframes rc-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 transparent; }
  50% { opacity: 0.55; box-shadow: 0 0 0 3px rgba(var(--color-success-rgb, 40, 191, 92), 0.18); }
}
</style>
