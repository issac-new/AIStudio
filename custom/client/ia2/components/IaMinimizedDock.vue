<!-- overlay/custom/client/ia2/components/IaMinimizedDock.vue -->
<!-- 最小化任务栏（窗口管理）：壳底部固定条，chip 点击恢复导航、× 直接丢弃。 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWmStore } from '../wm/store'
import { IA_AREAS } from '../routes'

const router = useRouter()
const { t } = useI18n()
const wm = useWmStore()

function labelFor(area: string): string {
  const meta = IA_AREAS.find(a => a.key === area)
  return meta ? t(meta.labelKey) : area
}

function restore(path: string): void {
  wm.restore(path)
  void router.push(path)
}
</script>

<template>
  <div v-if="wm.minimized.length" class="ia-dock" data-testid="ia-wm-dock">
    <span class="ia-dock__label">{{ t('ia2.wm.minimized') }}</span>
    <button v-for="panel in wm.minimized" :key="panel.path" type="button"
      class="ia-dock__chip" :data-testid="`ia-wm-dock-chip`" :title="panel.path"
      @click="restore(panel.path)"
    >
      <span class="ia-dock__chip-label">{{ labelFor(panel.area) }}</span>
      <span class="ia-dock__chip-x" role="button" :title="t('ia2.wm.dismiss')"
        @click.stop="wm.dismiss(panel.path)"
      >×</span>
    </button>
    <button type="button" class="ia-dock__clear" data-testid="ia-wm-dock-clear"
      @click="wm.clear()"
    >{{ t('ia2.wm.dockClear') }}</button>
  </div>
</template>

<style scoped lang="scss">
.ia-dock {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  padding: 4px 12px; background: var(--bg-card);
  border-top: 1px solid var(--border-color); overflow-x: auto;
}
.ia-dock__label { font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.ia-dock__chip {
  display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 4px 0 8px;
  border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-secondary);
  color: var(--text-secondary); cursor: pointer; font-size: 11px; font-family: inherit;
  white-space: nowrap; flex-shrink: 0;
  &:hover { color: var(--text-primary); border-color: var(--accent-primary); }
}
.ia-dock__chip-x {
  width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; font-size: 12px; color: var(--text-muted);
  &:hover { background: var(--bg-card); color: var(--text-primary); }
}
.ia-dock__clear {
  margin-left: auto; border: none; background: none; color: var(--text-muted);
  font-size: 10px; cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary); }
}
</style>
