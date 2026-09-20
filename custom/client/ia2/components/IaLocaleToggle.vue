<!-- overlay/custom/client/ia2/components/IaLocaleToggle.vue -->
<!-- v12.3 语言快速切换（2026-09-20 用户裁定）：驾驶舱页头仅保留
     简体中文/English 两按钮直切（ZH/EN），不用下拉。切换走 upstream
     switchLocale（localStorage 持久化 + 懒加载词条）；active 按 locale
     前缀匹配（zh-TW 环境算 ZH 侧点亮，点击即切到简体）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { switchLocale } from '@/i18n'

const { locale } = useI18n()

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))

function pick(lang: 'zh' | 'en'): void {
  if (lang === 'zh' ? isZh.value : !isZh.value) return
  void switchLocale(lang)
}
</script>

<template>
  <div class="ia-lt" data-testid="ia-locale-toggle">
    <button
      type="button" class="ia-lt__btn" :class="{ 'ia-lt__btn--on': isZh }"
      data-testid="ia-locale-zh" title="简体中文" @click="pick('zh')"
    >ZH</button>
    <button
      type="button" class="ia-lt__btn" :class="{ 'ia-lt__btn--on': !isZh }"
      data-testid="ia-locale-en" title="English" @click="pick('en')"
    >EN</button>
  </div>
</template>

<style scoped lang="scss">
.ia-lt {
  display: inline-flex; align-items: center; flex-shrink: 0;
  border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden;
}
.ia-lt__btn {
  height: 20px; padding: 0 7px; border: none; background: transparent;
  color: var(--text-muted); font-size: 10px; font-weight: 600; cursor: pointer;
  font-family: inherit; line-height: 1;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}
.ia-lt__btn--on { background: var(--accent-primary, #3b82f6); color: var(--text-on-accent, #fff); }
.ia-lt__btn + .ia-lt__btn { border-left: 1px solid var(--border-color); }
</style>
