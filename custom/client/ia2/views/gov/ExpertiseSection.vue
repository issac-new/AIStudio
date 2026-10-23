<!-- overlay/custom/client/ia2/views/gov/ExpertiseSection.vue -->
<!-- 协作画像「谁懂什么」（2026-10-23 天猫数字员工两文吸收轮）：从真实痕迹
     （推演台账派发原话 from=人 + 看板归属域 + 任务标题概念）提炼 人×概念×证据
     画像墙；检索框问「X 找谁」，候选人按证据强度+新近度排序，每条挂可回查锚点。
     只读消费 /api/hermes/expertise/{wall,search}；fail-soft。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchExpertiseWall, searchExpertise, type PersonProfile, type SearchCandidate } from '../../api/expertise'

// 防御式 locale 读取（同 i18n-tasks-tabs 先例）：部分测试/挂载环境 i18n 为 legacy
// 形态，useI18n() 解构 locale 为 undefined——回退 zh，不炸渲染。
const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

const wall = ref<PersonProfile[]>([])
const wallError = ref<string | null>(null)
const evidenceCount = ref(0)
const noteZh = '证据=台账派发原话(from=人)+看板归属域+任务标题概念；聊天库无人类/AI 判别位不入源'
const noteEn = 'Evidence = ledger dispatch text + board domains + task titles; chat store excluded (no human/AI flag)'

const query = ref('')
const searching = ref(false)
const candidates = ref<SearchCandidate[] | null>(null)
const searchError = ref<string | null>(null)
const formula = ref('')

async function loadWall(): Promise<void> {
  wallError.value = null
  try {
    const res = await fetchExpertiseWall()
    if (!res.available) {
      wall.value = []
      wallError.value = res.reason ?? 'unavailable'
      return
    }
    wall.value = res.persons ?? []
    evidenceCount.value = res.evidenceCount ?? 0
  } catch (e) {
    wall.value = []
    wallError.value = String(e)
  }
}

async function runSearch(): Promise<void> {
  const q = query.value.trim()
  if (!q) {
    candidates.value = null
    searchError.value = null
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const res = await searchExpertise(q)
    if (!res.available) {
      candidates.value = []
      searchError.value = res.reason ?? 'unavailable'
    } else {
      candidates.value = res.candidates ?? []
      formula.value = res.formula ?? ''
    }
  } catch (e) {
    candidates.value = []
    searchError.value = String(e)
  }
  searching.value = false
}

onMounted(() => { void loadWall() })

function fmtTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <section class="expertise" data-testid="expertise-section">
    <div class="expertise__bar">
      <div>
        <h3 class="expertise__title">{{ zh ? '协作画像 · 谁懂什么' : 'Expertise · Who knows what' }}</h3>
        <p class="expertise__sub">{{ zh ? noteZh : noteEn }}</p>
      </div>
      <form class="expertise__search" @submit.prevent="runSearch">
        <input
          v-model="query"
          class="expertise__input"
          type="search"
          :placeholder="zh ? '问一句：X 口径找谁？' : 'Ask: who to ask about X?'"
          data-testid="expertise-search-input"
        >
        <button type="submit" class="expertise__submit" data-testid="expertise-search-submit" :disabled="searching">
          {{ zh ? '找谁' : 'Find' }}
        </button>
      </form>
    </div>

    <p v-if="wallError" class="expertise__error" data-testid="expertise-wall-error">
      {{ zh ? '数据源缺席' : 'Source unavailable' }}：{{ wallError }}
    </p>

    <!-- 检索结果：候选人按证据强度排序，每条挂可回查证据 -->
    <div v-if="candidates" class="expertise__results" data-testid="expertise-search-results">
      <h4 class="expertise__list-title">{{ zh ? `「${query}」候选人（按证据强度排序）` : `Candidates for "${query}"` }}</h4>
      <p v-if="!candidates.length" class="expertise__empty">{{ zh ? '（无匹配证据）' : '(no match)' }}</p>
      <div v-for="c in candidates" :key="c.person" class="expertise__candidate">
        <div class="expertise__candidate-head">
          <span class="expertise__person">{{ c.person }}</span>
          <span class="expertise__score">{{ c.score }}</span>
          <span class="expertise__terms">{{ c.matchedTerms.join(' / ') }}</span>
        </div>
        <ul class="expertise__evidence">
          <li v-for="(e, ei) in c.evidence" :key="ei">
            <span class="expertise__ev-source">{{ e.source }}</span>
            {{ e.snippet }}
            <span class="expertise__ev-anchor">{{ e.anchor }}</span>
          </li>
        </ul>
      </div>
      <p v-if="formula" class="expertise__formula">{{ formula }}</p>
    </div>

    <!-- 画像墙 -->
    <div v-if="wall.length" class="expertise__wall" data-testid="expertise-wall">
      <h4 class="expertise__list-title">{{ zh ? `画像墙（${wall.length} 人 · ${evidenceCount} 条证据）` : `Wall (${wall.length} people · ${evidenceCount} evidence)` }}</h4>
      <div class="expertise__cards">
        <div v-for="p in wall" :key="p.person" class="expertise__card" :data-testid="`expertise-person-${p.person}`">
          <div class="expertise__card-head">
            <span class="expertise__person">{{ p.person }}</span>
            <span class="expertise__card-meta">{{ p.evidenceTotal }} · {{ fmtTime(p.lastActiveMs) }}</span>
          </div>
          <div class="expertise__concepts">
            <span
              v-for="c in p.concepts.slice(0, 8)"
              :key="c.term"
              class="expertise__concept"
              :title="`${c.count} 条证据 · 最近 ${fmtTime(c.lastTsMs)}`"
            >{{ c.term }} <em>{{ c.count }}</em></span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.expertise {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.expertise__bar { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.expertise__title { margin: 0; font-size: 13.5px; font-weight: 600; }
.expertise__sub { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); max-width: 560px; }
.expertise__search { margin-left: auto; display: flex; gap: 6px; }
.expertise__input {
  font-size: 12px; padding: 4px 8px; min-width: 200px;
  border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: inherit;
}
.expertise__submit {
  font-size: 12px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: inherit; cursor: pointer; white-space: nowrap;
  &:hover:not(:disabled) { background: var(--bg-secondary, rgba(128,128,128,0.12)); }
  &:disabled { opacity: 0.5; }
}
.expertise__error { margin: 0; font-size: 12px; color: var(--text-muted); }
.expertise__list-title { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--text-muted); }
.expertise__empty { margin: 0; font-size: 12px; color: var(--text-muted); }
.expertise__candidate { border-left: 2px solid var(--border-color); padding: 2px 0 2px 10px; margin-bottom: 6px; }
.expertise__candidate-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.expertise__person { font-size: 13px; font-weight: 600; }
.expertise__score { font-size: 11px; color: var(--accent-primary, var(--color-primary)); }
.expertise__terms { font-size: 11px; color: var(--text-muted); }
.expertise__evidence { list-style: none; margin: 2px 0 0; padding: 0; }
.expertise__evidence li { font-size: 11.5px; color: var(--text-muted); }
.expertise__ev-source {
  display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 7px;
  border: 1px solid var(--border-color); font-size: 10px;
}
.expertise__ev-anchor { font-family: var(--font-mono, monospace); font-size: 10px; margin-left: 5px; }
.expertise__formula { margin: 2px 0 0; font-size: 10.5px; color: var(--text-muted); }
.expertise__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.expertise__card { border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; }
.expertise__card-head { display: flex; align-items: baseline; gap: 6px; }
.expertise__card-meta { margin-left: auto; font-size: 10.5px; color: var(--text-muted); }
.expertise__concepts { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
.expertise__concept {
  font-size: 11px; padding: 1px 7px; border-radius: 9px;
  border: 1px solid var(--border-color); color: inherit;
  em { font-style: normal; color: var(--text-muted); font-size: 10px; margin-left: 2px; }
}
</style>
