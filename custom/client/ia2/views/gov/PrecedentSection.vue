<!-- overlay/custom/client/ia2/views/gov/PrecedentSection.vue -->
<!-- 判例库检索（2026-10-23 挂账批 D18）：run 即判例单元——「类似需求怎么做的」。
     源=活跃 runs + 归档 tar 按需抽；命中卡=run/派发词数/问题/处置/命中片段（带锚点）。
     挂协作与知识页签（文章语义：上下文层四维资产之「过程」维度）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listPrecedents, searchPrecedent, type PrecedentHit, type PrecedentResponse } from '../../api/expertise'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

const index = ref<PrecedentResponse | null>(null)
const query = ref('')
const searching = ref(false)
const result = ref<PrecedentResponse | null>(null)
const error = ref<string | null>(null)
const expanded = ref<Set<string>>(new Set())

async function loadIndex(): Promise<void> {
  error.value = null
  try {
    index.value = await listPrecedents()
    if (!index.value.available) error.value = index.value.reason ?? 'unavailable'
  } catch (e) {
    error.value = String(e)
  }
}

async function runSearch(): Promise<void> {
  const q = query.value.trim()
  if (!q) {
    result.value = null
    return
  }
  searching.value = true
  error.value = null
  try {
    result.value = await searchPrecedent(q)
  } catch (e) {
    error.value = String(e)
  }
  searching.value = false
}

function toggle(run: string): void {
  const next = new Set(expanded.value)
  if (next.has(run)) next.delete(run)
  else next.add(run)
  expanded.value = next
}

onMounted(() => { void loadIndex() })

const shown = computed<PrecedentHit[]>(() => result.value?.hits ?? index.value?.hits ?? [])
</script>

<template>
  <section class="prec" data-testid="precedent-section">
    <div class="prec__bar">
      <div>
        <h3 class="prec__title">{{ zh ? '过往案例 · 类似的活以前怎么干的' : 'Past cases · how similar work was done' }}</h3>
        <p class="prec__sub">{{ zh ? '每轮推演算一个案例：派过什么活、出过什么问题、怎么收场的；老案例存在压缩包里，查到哪个读哪个' : 'Each sim round is one case: what was dispatched, what went wrong, how it ended' }}</p>
      </div>
      <form class="prec__search" @submit.prevent="runSearch">
        <input v-model="query" class="prec__input" type="search" :placeholder="zh ? '查过往案例：如 回调/审计/测试' : 'Search past cases'" data-testid="precedent-search-input">
        <button type="submit" class="prec__submit" data-testid="precedent-search-submit" :disabled="searching">{{ zh ? '查案例' : 'Search' }}</button>
      </form>
    </div>

    <p v-if="error" class="prec__error" data-testid="precedent-error">{{ zh ? '数据源缺席' : 'Source unavailable' }}：{{ error }}</p>

    <div v-if="shown.length" class="prec__list" data-testid="precedent-list">
      <p class="prec__meta">{{ result ? `「${query}」查到 ${shown.length} 轮` : `${zh ? '判例索引' : 'Index'}：${shown.length} run` }}</p>
      <div v-for="h in shown" :key="h.run + h.origin" class="prec__card" :data-testid="`precedent-${h.run}`">
        <button type="button" class="prec__card-head" @click="toggle(h.run)">
          <span class="prec__run">{{ h.run }}</span>
          <span class="prec__origin">{{ h.origin }}</span>
          <span class="prec__counts">派活 {{ h.dispatches }} · 问题 {{ h.issues }} · 处理 {{ h.disposals }}</span>
          <span v-if="h.matches.length" class="prec__hits">{{ h.matches.length }} {{ zh ? '命中' : 'hits' }}</span>
          <span class="prec__toggle">{{ expanded.has(h.run) ? '▾' : '▸' }}</span>
        </button>
        <ul v-if="expanded.has(h.run) && h.matches.length" class="prec__matches">
          <li v-for="(m, mi) in h.matches" :key="mi">{{ m.text }} <span class="prec__anchor">{{ m.anchor }}</span></li>
        </ul>
      </div>
    </div>
    <p v-else-if="!error" class="prec__empty">{{ zh ? '（没查到案例）' : '(no cases found)' }}</p>
  </section>
</template>

<style scoped lang="scss">
.prec {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.prec__bar { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.prec__title { margin: 0; font-size: 13.5px; font-weight: 600; }
.prec__sub { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); max-width: 520px; }
.prec__search { margin-left: auto; display: flex; gap: 6px; }
.prec__input {
  font-size: 12px; padding: 4px 8px; min-width: 200px;
  border: 1px solid var(--border-color); border-radius: 5px; background: transparent; color: inherit;
}
.prec__submit {
  font-size: 12px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: inherit; cursor: pointer; white-space: nowrap;
  &:hover:not(:disabled) { background: var(--bg-secondary, rgba(128,128,128,0.12)); }
  &:disabled { opacity: 0.5; }
}
.prec__error, .prec__empty { margin: 0; font-size: 12px; color: var(--text-muted); }
.prec__meta { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.prec__card { border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 6px; overflow: hidden; }
.prec__card-head {
  display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: left;
  background: transparent; border: none; padding: 6px 8px; font-size: 12px; cursor: pointer; color: inherit;
  &:hover { background: var(--bg-secondary, rgba(128,128,128,0.1)); }
}
.prec__run { font-weight: 600; font-family: var(--font-mono, monospace); font-size: 11.5px; }
.prec__origin { font-size: 10.5px; color: var(--text-muted); }
.prec__counts { font-size: 11px; color: var(--text-muted); }
.prec__hits { font-size: 11px; color: var(--accent-primary, var(--color-primary)); }
.prec__toggle { margin-left: auto; color: var(--text-muted); }
.prec__matches { list-style: none; margin: 0; padding: 4px 12px; border-top: 1px solid var(--border-color); }
.prec__matches li { font-size: 11.5px; color: var(--text-muted); padding: 2px 0; }
.prec__anchor { font-family: var(--font-mono, monospace); font-size: 10px; margin-left: 5px; }
</style>
