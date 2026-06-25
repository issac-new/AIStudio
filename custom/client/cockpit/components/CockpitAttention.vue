<script setup lang="ts">
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

function handleClick(item: { taskId: string; title: string }) {
  store.focusOnTaskFromAttention(item.taskId, item.title)
}
</script>

<template>
  <div class="cockpit-attention">
    <div class="cockpit-attention__label">
      <span class="cockpit-attention__count">{{ store.attentionCount }}</span>
      <span class="cockpit-attention__label-text">{{ t('cockpit.attention') }}</span>
    </div>
    <div class="cockpit-attention__items">
      <span v-if="store.attention.length === 0" class="cockpit-attention__empty">无待处理事项</span>
      <button
        v-for="item in store.attention"
        :key="item.id"
        type="button"
        class="cockpit-attention__item"
        :class="['is-' + item.severity, 'is-' + item.status]"
        @click="handleClick(item)"
      >
        <span class="cockpit-attention__sev-bar" />
        <span class="cockpit-attention__text">{{ item.title }}</span>
        <span class="cockpit-attention__arrow">→</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-attention {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  min-height: 40px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}
.cockpit-attention__label {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-right: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.cockpit-attention__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--accent-primary);
  color: var(--text-on-accent);
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
}
.cockpit-attention__items {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.cockpit-attention__item {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: background 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-card-hover); border-color: var(--text-muted); }
  &.is-high { font-weight: 600; }
}
.cockpit-attention__sev-bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--text-muted);
  flex-shrink: 0;
}
.is-high .cockpit-attention__sev-bar { background: var(--error); }
.is-medium .cockpit-attention__sev-bar { background: var(--warning); }
/* 按状态区分色条颜色 */
.is-blocked .cockpit-attention__sev-bar { background: var(--error); }
.is-triage .cockpit-attention__sev-bar { background: var(--success, #52c41a); }
.is-review .cockpit-attention__sev-bar { background: var(--warning); }
.cockpit-attention__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.cockpit-attention__arrow { font-size: 10px; color: var(--text-muted); }
.cockpit-attention__empty { font-size: 11px; color: var(--text-muted); padding: 0 4px; }
</style>