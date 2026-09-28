<!-- overlay/custom/client/ia2/components/IaColumnControls.vue -->
<!-- v12.4 栏控簇（2026-09-20 用户裁定：栏控迁三栏各自右上角）：每栏顶部
     控制条右端的小按钮组——折叠（◀/▶）/最大化还原（⤢/⤡）/独立窗口（⧉）。
     纯展示组件：动作全 emit，由宿主栏分派 store（/app flow.layout / /ide
     ide.layout）。原页头 IaWindowControls 集中簇随之退役。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
  /** 折叠方向（箭头朝向）；none = 不渲染折叠钮 */
  fold?: 'left' | 'right' | 'none'
  /** 是否渲染最大化/还原钮 */
  showMax?: boolean
  /** 当前列最大化态（还原态换 ⤡ 图标与还原文案） */
  maximized?: boolean
  /** 是否渲染独立窗口钮（仅中栏/会话栏有可弹路由） */
  showPopout?: boolean
  /** testid 前缀（ia-col-left / ia-col-center / ia-col-right / ide-col-*） */
  testid: string
}>(), { fold: 'none', showMax: false, maximized: false, showPopout: false })

const emit = defineEmits<{
  (e: 'fold'): void
  (e: 'max'): void
  (e: 'popout'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="colctl" :data-testid="testid">
    <button
      v-if="fold !== 'none'" type="button" class="colctl__btn"
      :data-testid="`${testid}-fold`"
      :title="fold === 'left' ? t('ia2.wm.foldLeft') : t('ia2.wm.foldRight')"
      @click="emit('fold')"
    >{{ fold === 'left' ? '◀' : '▶' }}</button>
    <button
      v-if="showMax" type="button" class="colctl__btn"
      :data-testid="`${testid}-max`"
      :title="maximized ? t('ia2.wm.restoreCenter') : t('ia2.wm.maxCenter')"
      @click="emit('max')"
    >{{ maximized ? '⤡' : '⤢' }}</button>
    <button
      v-if="showPopout" type="button" class="colctl__btn"
      :data-testid="`${testid}-popout`"
      :title="t('ia2.wm.popOut')" @click="emit('popout')"
    >⧉</button>
  </div>
</template>

<style scoped lang="scss">
.colctl { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }
.colctl__btn {
  width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 5px; background: transparent;
  color: var(--text-muted, #9aa0aa); cursor: pointer; font-size: 11px; line-height: 1;
  &:hover { background: var(--bg-secondary, rgba(128,128,128,0.12)); color: var(--text-primary, #e6e6e6); }
}
</style>
