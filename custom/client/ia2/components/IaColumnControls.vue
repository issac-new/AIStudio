<!-- overlay/custom/client/ia2/components/IaColumnControls.vue -->
<!-- 栏控簇（2026-09-20 用户裁定迁三栏各自顶部控制条；2026-10-23 统一轮：
     三栏一致的窗口语义按钮；同日二轮用户裁定：最小化/最大化用同一个图标
     （CSS 方框）的不同样式切换——最小化=底边加重（窗口收成条）、最大化=
     完整方框、还原态=双框；独立窗口 ⧉ 属方框家族保留字符。纯展示组件：
     动作全 emit，由宿主栏分派 store（/app flow.layout / /ide ide.layout）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
  /** 是否渲染最小化钮（折叠本栏；折叠态导轨由宿主渲染展开钮） */
  showMin?: boolean
  /** 是否渲染最大化/还原钮 */
  showMax?: boolean
  /** 当前列独占态（还原图标换双框样式与还原文案） */
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
    ><span class="colctl__glyph colctl__glyph--min" aria-hidden="true" /></button>
    <button
      v-if="showMax" type="button" class="colctl__btn"
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

/* 同一图标（方框）的不同样式：min=底边加重（窗口收成条）、max=完整方框、
   restore=外扩双框（还原嵌套）。尺寸 9px 视觉与 11px 字符对齐。 */
.colctl__glyph {
  width: 9px; height: 9px; display: inline-block; flex-shrink: 0;
  border: 1.5px solid currentColor; border-radius: 1px;
}
.colctl__glyph--min { border-width: 1.5px 1.5px 3px; }
.colctl__glyph--restore { outline: 1.5px solid currentColor; outline-offset: 1.5px; }
</style>
