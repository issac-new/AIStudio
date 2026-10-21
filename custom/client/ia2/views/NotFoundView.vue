<!-- overlay/custom/client/ia2/views/NotFoundView.vue -->
<!-- 诚实 404（2026-10-21 遗留清偿）：未知路径不再被上游 catch-all 静默送回 /app，
     由 not-found-guard 改道到此；已知旧链接的 redirect 不受影响。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))

const fromPath = computed(() => {
  const raw = Array.isArray(route.query.from) ? route.query.from[0] : route.query.from
  return typeof raw === 'string' && raw ? raw.slice(0, 200) : ''
})

const LINKS = [
  { key: 'overview', zh: '流程总览', en: 'Overview', name: 'ia2.journey' },
  { key: 'workbench', zh: '工作台', en: 'Workbench', name: 'ia2.collab' },
  { key: 'board', zh: '看板', en: 'Board', name: 'ia2.board' },
  { key: 'search', zh: '检索', en: 'Search', name: 'ia2.search' },
] as const
</script>

<template>
  <div class="nf" data-testid="ia-not-found">
    <h1 class="nf__title">{{ zh ? '页面不存在' : 'Page not found' }}</h1>
    <p class="nf__desc">
      {{ zh ? '这个地址没有对应的页面——可能输入有误，或链接已随导航调整退役。' : 'This address has no page — it may be a typo, or a retired link.' }}
    </p>
    <p v-if="fromPath" class="nf__from" :data-testid="'ia-not-found-from'">
      {{ zh ? '原地址' : 'From' }}：<code>{{ fromPath }}</code>
    </p>
    <div class="nf__links">
      <button
        v-for="l in LINKS"
        :key="l.key"
        type="button"
        class="nf__link"
        :data-testid="`ia-not-found-go-${l.key}`"
        @click="router.push({ name: l.name })"
      >{{ zh ? l.zh : l.en }}</button>
    </div>
  </div>
</template>

<style scoped>
.nf { display: flex; flex-direction: column; gap: 12px; padding: 48px 24px; max-width: 560px; margin: 0 auto; }
.nf__title { margin: 0; font-size: 20px; }
.nf__desc { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.6; }
.nf__from { margin: 0; font-size: 12px; color: var(--text-muted); word-break: break-all; }
.nf__from code { font-size: 11.5px; }
.nf__links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.nf__link {
  border: 1px solid var(--border-color); border-radius: var(--radius-micro);
  background: transparent; color: var(--text-primary);
  font-family: inherit; font-size: 12.5px; padding: 5px 14px; cursor: pointer;
}
.nf__link:hover { background: var(--bg-secondary); }
.nf__link:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
