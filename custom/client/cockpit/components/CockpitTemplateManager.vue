<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const newName = ref('')

const templates = computed(() => store.templates)

function onSave() {
  if (!newName.value.trim()) return
  store.saveTemplateFromCurrentWorkItem(newName.value.trim())
  newName.value = ''
}
</script>

<template>
  <div class="cockpit-template-manager">
    <div class="cockpit-template-manager__head">
      <span class="cockpit-template-manager__title">📋 {{ t('cockpit.templateManager') }}</span>
      <button type="button" data-action="close" class="cockpit-template-manager__close" @click="store.closeTemplateManager()">✕</button>
    </div>
    <div class="cockpit-template-manager__save">
      <input v-model="newName" class="cockpit-template-manager__input" :placeholder="t('cockpit.templateName')">
      <button type="button" class="cockpit-template-manager__save-btn" :disabled="!newName.trim()" @click="onSave">{{ t('cockpit.saveAsTemplate') }}</button>
    </div>
    <div class="cockpit-template-manager__list">
      <div v-for="tpl in templates" :key="tpl.id" :data-template-id="tpl.id" class="cockpit-template-manager__item">
        <div class="cockpit-template-manager__item-name">{{ tpl.name }}</div>
        <div class="cockpit-template-manager__item-meta">{{ tpl.decision }} · {{ tpl.riskTags.length }} tags</div>
        <div class="cockpit-template-manager__item-actions">
          <button type="button" data-action="apply" class="cockpit-template-manager__act" @click="store.applyTemplateToCurrentWorkItem(tpl.id)">{{ t('cockpit.applyTemplate') }}</button>
          <button type="button" data-action="delete" class="cockpit-template-manager__act is-danger" @click="store.deleteTemplate(tpl.id)">{{ t('cockpit.deleteTemplate') }}</button>
        </div>
      </div>
      <div v-if="templates.length === 0" class="cockpit-template-manager__empty">{{ t('cockpit.noTemplates') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-template-manager { display: flex; flex-direction: column; width: 420px; max-width: 92vw; max-height: 70vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.cockpit-template-manager__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-template-manager__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-template-manager__close { cursor: pointer; color: var(--text-muted); font-size: 16px; width: 24px; height: 24px; border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px; font: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-template-manager__save { display: flex; gap: 8px; padding: 12px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-template-manager__input { flex: 1; font: inherit; font-size: 12px; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; color: var(--text-primary); }
.cockpit-template-manager__save-btn { font: inherit; font-size: 12px; border-radius: 6px; padding: 6px 12px; border: 1px solid var(--accent-primary); background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-weight: 600;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.cockpit-template-manager__list { flex: 1; overflow-y: auto; padding: 8px 0; }
.cockpit-template-manager__item { padding: 10px 18px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-template-manager__item-name { font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; }
.cockpit-template-manager__item-meta { font-size: 10px; color: var(--text-muted); }
.cockpit-template-manager__item-actions { display: flex; gap: 6px; }
.cockpit-template-manager__act { font: inherit; font-size: 10px; border-radius: 4px; padding: 3px 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-danger { color: var(--error); border-color: rgba(var(--error-rgb), 0.4); }
}
.cockpit-template-manager__empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
