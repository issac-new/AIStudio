<!-- overlay/custom/client/ia2/components/IaLocaleToggle.vue -->
<!-- v12.4 语言单按钮切换（2026-09-20 用户裁定）：ZH/EN 两按钮合并为一个
     切换钮——显示目标语言（zh 态显示 EN，en 态显示 ZH），点击直切。
     切换走 upstream switchLocale（localStorage 持久化 + 懒加载词条）；
     active 按 locale 前缀匹配（zh-TW 环境算 ZH 侧，点击切到简体）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { switchLocale } from '@/i18n'

const { locale } = useI18n()

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))

function toggle(): void {
  void switchLocale(isZh.value ? 'en' : 'zh')
}
</script>

<template>
  <button
    type="button" class="ia-lt" data-testid="ia-locale-toggle"
    :title="isZh ? 'English' : '简体中文'" @click="toggle"
  >{{ isZh ? 'EN' : 'ZH' }}</button>
</template>

<style scoped lang="scss">
.ia-lt {
  height: 20px; padding: 0 8px; flex-shrink: 0;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: transparent; color: var(--text-muted);
  font-size: 10px; font-weight: 600; cursor: pointer;
  font-family: inherit; line-height: 1;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}
</style>
