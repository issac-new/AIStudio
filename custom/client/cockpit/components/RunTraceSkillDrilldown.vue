<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TraceNode } from '../adapters/run-trace-adapter'
defineProps<{ skill: TraceNode }>()
defineEmits<{ (e: 'back'): void }>()
const { t } = useI18n()
</script>
<template>
  <div class="run-trace-skill" data-run-trace-skill-drilldown>
    <header><button type="button" @click="$emit('back')">← 返回全局图</button><b>{{ skill.label }}</b><span>{{ skill.detail }}</span></header>
    <div class="run-trace-skill__line">
      <article v-for="item in skill.children || []" :key="item.id" class="run-trace-skill__item" :class="[`is-${item.kind}`]">
        <span class="run-trace-skill__kind">{{ item.kind }}</span>
        <span class="run-trace-skill__body">{{ item.text || item.toolName }}</span>
        <span class="run-trace-skill__attr">{{ item.attribution === 'inferred' ? t('cockpit.inference') : t('cockpit.accurate') }}</span>
      </article>
    </div>
  </div>
</template>
<style scoped lang="scss">
.run-trace-skill { padding: 16px; overflow: auto; }
.run-trace-skill header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.run-trace-skill button { border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); border-radius: 6px; padding: 4px 8px; cursor: pointer; }
.run-trace-skill__line { position: relative; padding-left: 22px; }
.run-trace-skill__line::before { content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 1px; background: var(--border-color); }
.run-trace-skill__item { position: relative; display: grid; grid-template-columns: 70px 1fr auto; gap: 8px; padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); font-size: 11px; color: var(--text-secondary); }
.run-trace-skill__item::before { content: ''; position: absolute; left: -21px; top: 10px; width: 9px; height: 9px; border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--text-muted); }
.run-trace-skill__item.is-thinking::before { border-color: var(--accent-info); }
.run-trace-skill__item.is-tool::before { background: var(--text-muted); }
.run-trace-skill__attr { color: var(--warning); }
</style>
