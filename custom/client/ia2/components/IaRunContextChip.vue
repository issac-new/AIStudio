<!-- overlay/custom/client/ia2/components/IaRunContextChip.vue
     顶栏运行上下文（2026-10-18 左侧栏批）：全流程推演是独立专区，顶栏保留
     一个紧凑入口——显示当前运行名，点击带 run 进运行总览。无运行时显示
     「选择运行」，不假装有数据。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunContext } from '../composables/useRunContext'
import { runDisplayName } from '../run-display'

const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const { run } = useRunContext()
const raw = computed(() => run.value.trim())
// 产品面只呈现可读日期；运行目录名留在 title 供排查反查（2026-10-19 走查批）
const name = computed(() => (raw.value ? runDisplayName(raw.value) : ''))

function open(): void {
  void router.push(raw.value ? { name: 'ia2.sim', query: { run: raw.value } } : { name: 'ia2.sim' })
}
</script>

<template>
  <button
    type="button"
    class="ircc"
    :class="{ 'ircc--empty': !name }"
    data-testid="ia-run-context"
    :title="raw ? `当前运行：${name}（目录 ${raw}，点开运行总览）` : '还没有选择运行（点开运行总览选择）'"
    @click="open"
  >
    <span class="ircc__dot" aria-hidden="true" />
    <span class="ircc__name">{{ name || (zh ? '选择运行' : 'Select run') }}</span>
  </button>
</template>

<style scoped>
.ircc {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  max-width: 150px;
}
.ircc:hover { background: var(--bg-secondary); color: var(--text-primary); }
.ircc:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.ircc__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}
.ircc--empty .ircc__dot { background: var(--text-muted); }
.ircc__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ircc--empty { color: var(--text-muted); }
</style>
