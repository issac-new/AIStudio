<!-- overlay/custom/client/ia2/components/TabIntroBanner.vue -->
<!-- 页签说人话导语条（2026-10-04 三段式；D19 2026-10-17 收敛：默认收起）——
     用户裁定「页面导览性质内容占太多篇幅」：三段导语改为 <details> 折叠，
     默认收起为一行「页面导览」，点开仍有什么是/数据来自/你能做什么。
     挂 TasksView/仿真中心/治理中心/六阶段页签栏下方，按当前页签取词条；
     看板页不挂（用户明示可懂）。内容词条与 testid 不变。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { pickTabIntros, type TabIntro } from '@/custom/ia2/i18n-tab-intros'

const props = defineProps<{ tab: string }>()

const i18nCtx = useI18n()
const intro = computed<TabIntro | null>(() => pickTabIntros((i18nCtx as { locale?: { value?: string } })?.locale?.value)[props.tab] ?? null)
const L = computed(() => {
  const zh = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh')
  return zh
    ? { sum: '页面导览', what: '这是什么', source: '数据来自', act: '你能做什么' }
    : { sum: 'Page guide', what: 'What it is', source: 'Data source', act: 'What you can do' }
})
</script>

<template>
  <details v-if="intro" class="tabintro" :data-testid="`tab-intro-${tab}`">
    <summary class="tabintro__sum" :data-testid="`tab-intro-toggle-${tab}`">{{ L.sum }}</summary>
    <div class="tabintro__body">
      <span class="tabintro__seg"><b class="tabintro__k">{{ L.what }}</b>{{ intro.what }}</span>
      <span class="tabintro__seg"><b class="tabintro__k">{{ L.source }}</b>{{ intro.source }}</span>
      <span class="tabintro__seg"><b class="tabintro__k">{{ L.act }}</b>{{ intro.act }}</span>
    </div>
  </details>
</template>

<style scoped lang="scss">
.tabintro {
  padding: 0 14px; font-size: 11.5px; line-height: 1.6;
  color: var(--text-muted, #878c99);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-secondary, #fafafa);
}
.tabintro__sum {
  list-style: none; cursor: pointer; user-select: none;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 0; font-size: 11px; color: var(--text-muted, #878c99);
  &::before { content: '▸'; font-size: 9px; transition: transform 0.12s; }
  &:hover { color: var(--text-primary, inherit); }
}
.tabintro[open] .tabintro__sum::before { transform: rotate(90deg); }
.tabintro__sum::-webkit-details-marker { display: none; }
.tabintro__body { display: flex; flex-wrap: wrap; gap: 4px 18px; padding: 0 0 6px; }
.tabintro__seg { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }
.tabintro__k {
  flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
  color: var(--text-primary, inherit); opacity: 0.75;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 4px; padding: 0 5px;
}
</style>
