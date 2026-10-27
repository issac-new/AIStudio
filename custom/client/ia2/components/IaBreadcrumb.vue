<!-- overlay/custom/client/ia2/components/IaBreadcrumb.vue -->
<!-- 面包屑（2026-10-17 驾驶舱层级批；2026-10-27 产品一致性 Task 8 解析合一）：
     位置感知=根＞阶段＞页签/页面；层级解析与文案单一事实源=page-presentation.ts
     共享解析器（最近轨迹/浏览器标签页同源），本组件只做层级呈现——保留
     「流程总览＞阶段＞页签」层级不抹平；推演域（/app/sim* 六签+业务地图+导演
     详情）根=全流程推演；工具页归属段读 query.from 来路（从②进文档评审回②
     仍亮②）；旅程页自身与未知名不渲染；当前段 aria-current。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { resolvePagePresentation, attributionChipLabel } from '../page-presentation'

interface Crumb { label: string; to?: { name: string; query?: Record<string, string> }; title?: string }

// 无路由/无 i18n 上下文（嵌板测试态）兜底：两者都可能返回无 locale/route 的
// 对象（tab-intro 退役前同款守卫先例）；跳转用 button+router.push 而非
// router-link——最小测试路由器缺 ia2.journey 时 link 的 resolve 会直接抛。
const route = useRoute() as ReturnType<typeof useRoute> | undefined
const router = useRouter() as ReturnType<typeof useRouter> | undefined
const i18nCtx = useI18n() as { locale?: { value?: string } }
const lang = computed(() => (String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh') ? 'zh' : 'en') as 'zh' | 'en')

function go(c: Crumb): void {
  if (c.to) void router?.push(c.to)
}

const crumbs = computed<Crumb[]>(() => {
  // 层级解析全部委托共享解析器（page-presentation）：根/阶段/页签/推演子页/
  // 归属/页面段，来路 query.from 在解析器内优先于表内归属。
  const p = resolvePagePresentation({
    fullPath: String(route?.fullPath ?? ''),
    name: route?.name,
    query: route?.query as Record<string, unknown> | undefined,
    params: route?.params as Record<string, unknown> | undefined,
  }, lang.value)
  if (!p.root) return []
  const out: Crumb[] = [{ label: p.root.label, to: p.root.to }]
  // 阶段段/页签段（阶段页与旧 gov 深链）：非链接中段=归属 chip（aria 同旧）
  if (p.stage) out.push({ label: p.stage.label })
  if (p.tab) out.push({ label: p.tab.label })
  // 推演域子页段（监督面板/运行监控/证据库/编排/设置/业务地图/导演详情）
  if (p.simPage) out.push({ label: p.simPage.label })
  // 工具页归属段：单归属/多归属/全程，来路优先（见解析器）
  if (p.attribution) {
    const chip = attributionChipLabel(p.attribution, lang.value)
    out.push({ label: chip.label, title: chip.title })
  }
  if (p.page) out.push({ label: p.page.label })
  return out
})
</script>

<template>
  <nav v-if="crumbs.length > 1" class="ia-bc" aria-label="面包屑" data-testid="ia-breadcrumb">
    <ol class="ia-bc__list">
      <li v-for="(c, i) in crumbs" :key="i" class="ia-bc__item">
        <button v-if="c.to && i < crumbs.length - 1" type="button" class="ia-bc__link" @click="go(c)">{{ c.label }}</button>
        <span v-else-if="i === crumbs.length - 1" class="ia-bc__current" aria-current="page" data-testid="ia-breadcrumb-current" :title="c.title">{{ c.label }}</span>
        <span v-else class="ia-bc__chip" data-testid="ia-breadcrumb-attribution" :title="c.title">{{ c.label }}</span>
        <span v-if="i < crumbs.length - 1" class="ia-bc__sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.ia-bc { font-size: 12px; line-height: 1.4; color: var(--text-muted); }
.ia-bc__list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; list-style: none; margin: 0; padding: 0; }
.ia-bc__item { display: inline-flex; align-items: center; gap: 4px; }
.ia-bc__link { border: none; background: transparent; padding: 0; font: inherit; color: var(--accent-primary); text-decoration: none; cursor: pointer; }
.ia-bc__link:hover { text-decoration: underline; text-underline-offset: 3px; }
.ia-bc__current { color: var(--text-primary); font-weight: 600; }
.ia-bc__chip {
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 0 6px;
  font-weight: 600;
  cursor: help;
}
.ia-bc__sep { opacity: 0.5; }
</style>
