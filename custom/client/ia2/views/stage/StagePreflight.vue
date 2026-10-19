<!-- overlay/custom/client/ia2/views/stage/StagePreflight.vue
     ②需求·启动准备页签（2026-10-18 阶段页页签批）：
     启动前只做「看条件是否齐」+「去运行编排」两件事；不在阶段页里放启动按钮，
     避免把整轮运行的写动作混进日常需求页。条件全部来自 run-state 实读。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useStageProgress } from '../../composables/useStageProgress'

const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const progress = useStageProgress()

const runName = computed(() => progress.run.value.trim())
const checks = computed(() => [
  {
    key: 'run',
    label: zh.value ? '已选择本轮运行' : 'A run is selected',
    ok: !!runName.value,
    hint: runName.value || (zh.value ? '先在运行编排里选运行' : 'Select a run in orchestration'),
  },
  {
    key: 'g1',
    label: zh.value ? 'G1 需求冻结已通过' : 'G1 requirement freeze passed',
    ok: 'g1_frozen' in progress.merged.value,
    hint: zh.value ? '冻结未通过时启动会质量门拦下' : 'Launch is blocked until G1 passes',
  },
  {
    key: 'docs',
    label: zh.value ? '冻结单与文档已入库' : 'Freeze doc and documents are in the repo',
    ok: progress.state.value ? true : false,
    hint: progress.state.value
      ? (zh.value ? '运行状态可读；文档详情在文档评审页核对' : 'Run state readable; verify docs in Doc review')
      : (zh.value ? '运行状态尚未读到，先确认运行名' : 'Run state not readable yet; verify the run name'),
  },
])

const readyCount = computed(() => checks.value.filter(c => c.ok).length)

function openRun(): void {
  // 启动与续跑由 harness 执行；这里只把用户送到运行中心核对真实状态。
  void router.push({ name: 'ia2.sim' })
}
</script>

<template>
  <section class="spf" data-testid="stg-preflight">
    <header class="spf__head">
      <div>
        <h2 class="spf__title">{{ zh ? '启动前检查' : 'Launch preflight' }}</h2>
        <p class="spf__sub">{{ zh
          ? '这里只核对条件；启动与续跑由 harness 执行。运行编排页的启动前自动检查尚未接入，起跑前需在 harness 侧确认。'
          : 'This tab only checks readiness; harness performs launch and resume. Automated preflight is not wired in Orchestration yet; confirm on the harness side.' }}</p>
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
      <span class="spf__note">{{ zh ? '运行编排页显示当前运行与任务链；启动前自动检查尚未接入，需在 harness 侧确认。' : 'Orchestration shows the current run and task chain; automated preflight is not wired in yet — confirm on the harness side.' }}</span>
      <button type="button" class="spf__btn" data-testid="stg-preflight-run" @click="openRun">{{ zh ? '打开运行中心 →' : 'Open run center →' }}</button>
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
.spf__row--ok { border-left: 3px solid var(--ia-fresh); }
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
