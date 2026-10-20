<!-- ②需求·启动前检查（日常源）：任务收口与 G1 修复单是可实测条件；
     推演启动/续跑由 harness 或导演台执行，本页只给显式跨区入口。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../store/workspace'
import { fetchGateRepairs } from '../../api/gov'

const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const router = useRouter()
const workspace = useWorkspaceStore()
const g1Open = ref<number | null>(null)
const gateError = ref('')

const counts = computed(() => {
  const tasks = workspace.tasks ?? []
  return {
    triage: tasks.filter(t => t.status === 'triage').length,
    ready: tasks.filter(t => ['scheduled', 'ready'].includes(t.status)).length,
  }
})

const checks = computed(() => [
  {
    key: 'triage',
    label: zh.value ? '需求已全部分类' : 'All requirements triaged',
    ok: counts.value.triage === 0,
    hint: counts.value.triage === 0
      ? (zh.value ? '没有待分类需求卡' : 'No untriaged cards')
      : `${counts.value.triage} ${zh.value ? '张需求卡还待分类' : 'cards still need triage'}`,
  },
  {
    key: 'ready',
    label: zh.value ? '至少一张卡可进入分析' : 'At least one card ready',
    ok: counts.value.ready > 0,
    hint: counts.value.ready > 0
      ? `${counts.value.ready} ${zh.value ? '张卡已排期或可开工' : 'cards scheduled or ready'}`
      : (zh.value ? '先在任务分解页完成拆解与排期' : 'Break down and schedule tasks first'),
  },
  {
    key: 'g1',
    label: zh.value ? 'G1 无未结修复单' : 'No open G1 repairs',
    ok: g1Open.value === 0,
    hint: gateError.value ? (zh.value ? 'G1 修复单暂不可读，请到 G1 页核对' : 'G1 repairs unreadable; check the G1 tab')
      : g1Open.value === 0 ? (zh.value ? 'G1 没有未结修复单' : 'No open G1 repair tickets')
      : `${g1Open.value} ${zh.value ? '张 G1 修复单未结' : 'open G1 repair tickets'}`,
  },
])
const readyCount = computed(() => checks.value.filter(c => c.ok).length)

function openRun(): void {
  void router.push({ name: 'ia2.simOrchestration' })
}

onMounted(() => {
  void workspace.refreshAllBoards()
  void fetchGateRepairs('open').then(res => {
    g1Open.value = res.records.filter(r => r.gate === 'G1').length
  }).catch(e => { gateError.value = (e as Error).message })
})
</script>

<template>
  <section class="spf" data-testid="stg-preflight">
    <header class="spf__head">
      <div>
        <h2 class="spf__title">{{ zh ? '推演启动前检查' : 'Simulation preflight' }}</h2>
        <p class="spf__sub">{{ zh ? '三项都来自日常任务与质量门台账；启动与续跑在推演区由 harness 或导演台执行。' : 'Three checks read daily tasks and gate records; launch stays in the simulation domain.' }}</p>
      </div>
      <span class="spf__count" data-testid="stg-preflight-count">{{ readyCount }}/{{ checks.length }}</span>
    </header>

    <ul class="spf__list">
      <li v-for="c in checks" :key="c.key" class="spf__row" :class="{ 'spf__row--ok': c.ok }" :data-testid="`stg-preflight-check-${c.key}`">
        <span class="spf__dot" :class="{ 'spf__dot--ok': c.ok }" aria-hidden="true">{{ c.ok ? '✓' : '○' }}</span>
        <div class="spf__body">
          <strong class="spf__label">{{ c.label }}</strong>
          <span class="spf__hint">{{ c.hint }}</span>
        </div>
      </li>
    </ul>

    <footer class="spf__foot">
      <span class="spf__note">{{ zh ? '跨区入口只做核对，不写日常任务数据。' : 'The cross-domain entry is read-only for daily data.' }}</span>
      <button type="button" class="spf__btn" data-testid="stg-preflight-run" @click="openRun">{{ zh ? '查看全流程推演编排 →' : 'Open simulation orchestration →' }}</button>
    </footer>
  </section>
</template>

<style scoped>
.spf { display: flex; flex-direction: column; gap: 12px; }
.spf__head { display: flex; align-items: flex-start; gap: 12px; }
.spf__title { margin: 0; font-size: 15px; }
.spf__sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.spf__count { margin-left: auto; font-size: 18px; font-weight: 600; color: var(--accent-primary); font-variant-numeric: tabular-nums; }
.spf__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.spf__row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.spf__row--ok { border-color: color-mix(in srgb, var(--ia-fresh) 40%, var(--border-color)); background: color-mix(in srgb, var(--ia-fresh) 5%, transparent); }
.spf__dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border-color); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.spf__dot--ok { color: var(--ia-fresh); border-color: color-mix(in srgb, var(--ia-fresh) 45%, var(--border-color)); }
.spf__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.spf__label { font-size: 12.5px; font-weight: 600; }
.spf__hint { font-size: 11.5px; color: var(--text-muted); }
.spf__foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.spf__note { font-size: 11.5px; color: var(--text-muted); }
.spf__btn { margin-left: auto; border: 1px solid var(--accent-primary); border-radius: 6px; background: transparent; color: var(--accent-primary); font-family: inherit; font-size: 12px; padding: 5px 14px; cursor: pointer; }
.spf__btn:hover { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
.spf__btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
