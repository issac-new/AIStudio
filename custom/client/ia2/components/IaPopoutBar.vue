<!-- overlay/custom/client/ia2/components/IaPopoutBar.vue -->
<!-- 独立窗口精简页头（standalone=1）：品牌 + 当前场景标签 + 合并回驾驶舱。
     窗口本体的最大化/最小化/关闭由 OS 原生窗控提供（Electron BrowserWindow）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { areaForPath, IA_AREAS } from '../routes'
import { requestMergeBack } from '../wm/popout'

const route = useRoute()
const { t } = useI18n()

const sceneLabel = computed(() => {
  const key = areaForPath(route.path)
  const meta = IA_AREAS.find(a => a.key === key)
  return meta ? t(meta.labelKey) : ''
})

function mergeBack(): void {
  requestMergeBack(route.fullPath)
}
</script>

<template>
  <div class="ia-popout" data-testid="ia-popout-bar">
    <span class="ia-popout__brand">{{ t('ia2.brand') }}</span>
    <span class="ia-popout__div" />
    <span class="ia-popout__scene">{{ sceneLabel }}</span>
    <span class="ia-popout__tag">{{ t('ia2.wm.standaloneTag') }}</span>
    <span class="ia-popout__spacer" />
    <button type="button" class="ia-popout__btn" data-testid="ia-wm-merge-back"
      @click="mergeBack"
    >⇤ {{ t('ia2.wm.mergeBack') }}</button>
  </div>
</template>

<style scoped lang="scss">
.ia-popout {
  flex-shrink: 0; height: 36px; display: flex; align-items: center; gap: 8px;
  padding: 0 12px; background: var(--bg-card); border-bottom: 1px solid var(--border-color);
}
.ia-popout__brand { font-weight: 700; font-size: 12px; color: var(--text-primary); white-space: nowrap; }
.ia-popout__div { width: 1px; height: 16px; background: var(--border-color); }
.ia-popout__scene { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.ia-popout__tag {
  font-size: 9px; padding: 1px 6px; border-radius: 8px; white-space: nowrap;
  background: var(--bg-secondary); color: var(--text-muted);
  border: 1px solid var(--border-color);
}
.ia-popout__spacer { flex: 1; }
.ia-popout__btn {
  height: 26px; padding: 0 10px; display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-secondary); cursor: pointer; font-size: 12px; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
</style>
