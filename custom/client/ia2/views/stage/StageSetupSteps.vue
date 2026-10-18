<!-- overlay/custom/client/ia2/views/stage/StageSetupSteps.vue
     ①搭建·五步进度页签（2026-10-18 阶段页页签批）：
     只做一件事——把「建立组织→账号→团队→环境资产→智能体」五步的状态与下一步
     摆在一屏内；按钮切换本页页签，不再跳到别的整页。
     状态读 useStageProgress 共享缓存；无运行/无键的步骤如实显示「轮次内不跟踪」。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SETUP_STEPS } from '../../stage-meta'
import { useStageProgress } from '../../composables/useStageProgress'

const emit = defineEmits<{ (e: 'open-tab', key: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const progress = useStageProgress()

const STEP_TAB: Record<string, string> = {
  org: 'org', accounts: 'accounts', teams: 'teams', env: 'assets', agents: 'agents',
}

const doneCount = computed(() => SETUP_STEPS.filter(st => progress.stepState(st) === 'done').length)

function stateText(st: (typeof SETUP_STEPS)[number]): string {
  const s = progress.stepState(st)
  if (s === 'done') return zh.value ? '✓ 完成' : '✓ Done'
  if (s === 'current') return zh.value ? '● 待完成' : '● To do'
  if (s === 'untracked') return zh.value ? '轮次内不跟踪' : 'Not tracked'
  return zh.value ? '未开始' : 'Not started'
}

function actionText(st: (typeof SETUP_STEPS)[number]): string {
  const s = progress.stepState(st)
  if (s === 'done') return zh.value ? '查看' : 'View'
  if (s === 'current') return zh.value ? '继续' : 'Continue'
  return zh.value ? '开始' : 'Start'
}
</script>

<template>
  <section class="sst" data-testid="stg-setup-steps">
    <header class="sst__head">
      <div>
        <h2 class="sst__title">{{ zh ? '五步把组织搭起来' : 'Set up the organization in five steps' }}</h2>
        <p class="sst__sub">{{ zh
          ? '每一步都在本页签内完成；「轮次内不跟踪」表示这一步没有运行状态键，不是已完成。'
          : 'Each step is completed in this tab. “Not tracked” means no run-state key exists; it is not done.' }}</p>
      </div>
      <span class="sst__count" data-testid="stg-setup-count">{{ doneCount }}/{{ SETUP_STEPS.length }}</span>
    </header>

    <ol class="sst__list">
      <li
        v-for="st in SETUP_STEPS"
        :key="st.key"
        class="sst__row"
        :class="`sst__row--${progress.stepState(st)}`"
        :data-testid="`stg-step-${st.key}`"
      >
        <span class="sst__no">{{ st.no }}</span>
        <div class="sst__main">
          <div class="sst__name">{{ st.name }}</div>
          <div class="sst__purpose">{{ st.purpose }}</div>
        </div>
        <span class="sst__state" :data-testid="`stg-step-state-${st.key}`">{{ stateText(st) }}</span>
        <button
          type="button"
          class="sst__go"
          :data-testid="`stg-step-go-${st.key}`"
          @click="emit('open-tab', STEP_TAB[st.key])"
        >{{ actionText(st) }}</button>
      </li>
    </ol>

    <footer class="sst__foot">
      <span class="sst__hint">{{ zh ? '账号、智能体、模型等组织级配置都在对应页签内完成。' : 'Accounts, agents and models are configured in their tabs.' }}</span>
    </footer>
  </section>
</template>

<style scoped>
.sst { display: flex; flex-direction: column; gap: 12px; }
.sst__head { display: flex; align-items: flex-start; gap: 12px; }
.sst__title { margin: 0; font-size: 15px; }
.sst__sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.sst__count { margin-left: auto; font-size: 18px; font-weight: 600; color: var(--accent-primary); font-variant-numeric: tabular-nums; }
.sst__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sst__row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) auto auto; gap: 10px; align-items: center;
  padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px;
}
.sst__row--done { border-left: 3px solid var(--ia-fresh); }
.sst__row--current { border-left: 3px solid var(--ia-stale); background: color-mix(in srgb, var(--ia-stale) 5%, transparent); }
.sst__row--pending, .sst__row--untracked { border-left: 3px solid var(--border-color); }
.sst__no { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border-color); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--text-muted); }
.sst__row--done .sst__no { color: var(--ia-fresh); border-color: color-mix(in srgb, var(--ia-fresh) 45%, var(--border-color)); }
.sst__row--current .sst__no { color: var(--ia-stale); border-color: color-mix(in srgb, var(--ia-stale) 45%, var(--border-color)); }
.sst__name { font-size: 13px; font-weight: 600; }
.sst__purpose { margin-top: 2px; font-size: 11.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sst__state { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.sst__row--done .sst__state { color: var(--ia-fresh); }
.sst__row--current .sst__state { color: var(--ia-stale); font-weight: 600; }
.sst__go { border: 1px solid var(--accent-primary); border-radius: 6px; background: transparent; color: var(--accent-primary); font-family: inherit; font-size: 12px; padding: 4px 12px; cursor: pointer; white-space: nowrap; }
.sst__go:hover { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
.sst__go:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.sst__foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sst__hint { font-size: 11.5px; color: var(--text-muted); }
</style>
