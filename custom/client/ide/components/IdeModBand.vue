<!-- overlay/custom/client/ide/components/IdeModBand.vue -->
<!-- P4 输入区上方模组横幅带（2026-10-04 九源轮）：注册式插槽宿主。
     mods 由宿主页面静态注册（id/priority/visible）；渲染按 priority 排序，
     单条 ✕ 隐藏（settings-layers user 层持久化），有隐藏时给一键恢复 chip。
     槽位名=mod id；无内容（visible=false）不渲染不占隐藏位。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useModBand, type ModBandSpec } from '../composables/useModBand'

const props = defineProps<{ mods: ModBandSpec[] }>()
const { locale } = useI18n()
const T = (k: 'hide' | 'restore') => (((locale as { value?: string } | undefined)?.value ?? 'zh').startsWith('zh')
  ? (k === 'hide' ? '隐藏此条' : '显示已隐藏的条')
  : (k === 'hide' ? 'Hide this strip' : 'Show hidden strips'))

const band = useModBand()
const visibleMods = band.ordered
</script>

<template>
  <div class="ide-modband" data-testid="ide-modband">
    <div v-for="mod in visibleMods(mods)" :key="mod.id" class="ide-modband__mod" :data-testid="`ide-modband-mod-${mod.id}`">
      <slot :name="mod.id" />
      <button
        v-if="mod.hideable !== false"
        type="button"
        class="ide-modband__hide"
        :aria-label="T('hide')"
        :title="T('hide')"
        :data-testid="`ide-modband-hide-${mod.id}`"
        @click="band.hideMod(mod.id)"
      >✕</button>
    </div>
    <button
      v-if="band.hiddenCount.value > 0"
      type="button"
      class="ide-modband__restore"
      data-testid="ide-modband-restore"
      @click="band.hidden.value.forEach(band.showMod)"
    >↺ {{ T('restore') }}（{{ band.hiddenCount.value }}）</button>
  </div>
</template>

<style scoped lang="scss">
.ide-modband { display: flex; flex-direction: column; gap: 0; }
.ide-modband__mod { position: relative; display: flex; }
.ide-modband__mod > :deep(:first-child) { flex: 1; min-width: 0; }
.ide-modband__hide {
  position: absolute; top: 2px; right: 2px; border: none; background: none;
  color: var(--text-color-3, #999); cursor: pointer; font-size: 10px; opacity: 0;
  padding: 1px 4px;
}
.ide-modband__mod:hover .ide-modband__hide { opacity: 1; }
.ide-modband__restore {
  align-self: flex-start; border: 1px dashed var(--border-color, #ccc); background: none;
  border-radius: 8px; font-size: 10.5px; color: var(--text-color-3, #999); cursor: pointer; padding: 0 8px;
}
</style>
