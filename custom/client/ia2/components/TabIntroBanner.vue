<!-- overlay/custom/client/ia2/components/TabIntroBanner.vue -->
<!-- 页签说人话导语条（2026-10-04）：三段式——这是什么 / 数据来自 / 你能做什么。
     挂 TasksView 页签栏下方，按当前页签取 i18n-tab-intros 词条；看板页不挂（用户明示可懂）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { pickTabIntros, type TabIntro } from '@/custom/ia2/i18n-tab-intros'

const props = defineProps<{ tab: string }>()

const i18nCtx = useI18n()
const intro = computed<TabIntro | null>(() => pickTabIntros((i18nCtx as { locale?: { value?: string } })?.locale?.value)[props.tab] ?? null)
const L = computed(() => {
  const zh = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh')
  return zh ? { what: '这是什么', source: '数据来自', act: '你能做什么' } : { what: 'What it is', source: 'Data source', act: 'What you can do' }
})
</script>

<template>
  <div v-if="intro" class="tabintro" :data-testid="`tab-intro-${tab}`">
    <span class="tabintro__seg"><b class="tabintro__k">{{ L.what }}</b>{{ intro.what }}</span>
    <span class="tabintro__seg"><b class="tabintro__k">{{ L.source }}</b>{{ intro.source }}</span>
    <span class="tabintro__seg"><b class="tabintro__k">{{ L.act }}</b>{{ intro.act }}</span>
  </div>
</template>

<style scoped lang="scss">
.tabintro {
  display: flex; flex-wrap: wrap; gap: 4px 18px;
  padding: 6px 14px; font-size: 11.5px; line-height: 1.6;
  color: var(--text-muted, #878c99);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-secondary, #fafafa);
}
.tabintro__seg { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }
.tabintro__k {
  flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
  color: var(--text-primary, inherit); opacity: 0.75;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 4px; padding: 0 5px;
}
</style>
