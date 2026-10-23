<!-- overlay/custom/client/ia2/components/IaColumnControls.vue -->
<!-- 栏控簇（2026-09-20 用户裁定迁三栏各自顶部控制条；2026-10-23 统一轮：
     三栏一致的窗口语义；同日四轮用户裁定：最大化/最小化合并为**单一切换钮**
     ——同一图标（CSS 方框）按状态换样式：常态=完整方框（点击本栏独占），
     独占态=外扩双框（点击还原全部栏）。独立窗口 ⧉ 属方框家族保留。
     纯展示组件：动作全 emit，由宿主栏分派 store（/app flow / /ide ide.layout）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
  /** 当前列独占态（切换钮换双框样式与还原文案） */
  maximized?: boolean
  /** 是否渲染独立窗口钮（仅中栏/会话栏有可弹路由） */
  showPopout?: boolean
  /** testid 前缀（ia-col-left / ia-col-center / ia-col-right / ide-col-*） */
  testid: string
}>(), { maximized: false, showPopout: false })

const emit = defineEmits<{
  (e: 'max'): void
  (e: 'popout'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="colctl" :data-testid="testid">
    <button
      type="button" class="colctl__btn"
      :data-testid="`${testid}-max`"
      :title="maximized ? t('ia2.wm.restorePane') : t('ia2.wm.maxPane')"
      @click="emit('max')"
    ><span class="colctl__glyph" :class="maximized ? 'colctl__glyph--restore' : 'colctl__glyph--max'" aria-hidden="true" /></button>
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

/* 同一图标（方框）按状态换样式：max=完整方框（独占）、restore=外扩双框（还原）。 */
.colctl__glyph {
  width: 9px; height: 9px; display: inline-block; flex-shrink: 0;
  border: 1.5px solid currentColor; border-radius: 1px;
}
.colctl__glyph--restore { outline: 1.5px solid currentColor; outline-offset: 1.5px; }
</style>
