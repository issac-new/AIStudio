<!-- overlay/custom/client/ia2/components/IaColumnControls.vue -->
<!-- 栏控簇（2026-09-20 用户裁定迁三栏各自顶部控制条；2026-10-23 统一轮：
     三栏一致的窗口语义按钮——最小化（– 折叠本栏）/最大化（⤢ 本栏独占）/
     还原（⤡）/独立窗口（⧉，仅可弹路由的栏）。纯展示组件：动作全 emit，
     由宿主栏分派 store（/app flow.layout / /ide ide.layout）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
  /** 是否渲染最小化钮（折叠本栏；折叠态导轨由宿主渲染展开钮） */
  showMin?: boolean
  /** 是否渲染最大化/还原钮 */
  showMax?: boolean
  /** 当前列独占态（还原图标 ⤡ 与还原文案） */
  maximized?: boolean
  /** 是否渲染独立窗口钮（仅中栏/会话栏有可弹路由） */
  showPopout?: boolean
  /** testid 前缀（ia-col-left / ia-col-center / ia-col-right / ide-col-*） */
  testid: string
}>(), { showMin: true, showMax: false, maximized: false, showPopout: false })

const emit = defineEmits<{
  (e: 'min'): void
  (e: 'max'): void
  (e: 'popout'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="colctl" :data-testid="testid">
    <button
      v-if="showMin" type="button" class="colctl__btn"
      :data-testid="`${testid}-min`"
      :title="t('ia2.wm.minPane')"
      @click="emit('min')"
    >–</button>
    <button
      v-if="showMax" type="button" class="colctl__btn"
      :data-testid="`${testid}-max`"
      :title="maximized ? t('ia2.wm.restorePane') : t('ia2.wm.maxPane')"
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
  color: var(--text-muted); cursor: pointer; font-size: 11px; line-height: 1;
  &:hover { background: var(--bg-secondary, rgba(128,128,128,0.12)); color: var(--text-primary); }
}
</style>
