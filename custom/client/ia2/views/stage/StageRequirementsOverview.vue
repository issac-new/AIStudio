<!-- overlay/custom/client/ia2/views/stage/StageRequirementsOverview.vue
     ②需求·需求与冻结页签（2026-10-18 阶段页页签批）：
     一屏回答三件事——这轮需求冻结了没有、文档在哪核对、下一步做什么。
     不提供假「新建需求单」表单（后端无需求实体端点）；启动运行只给专区入口，
     不在阶段页里直接开跑，保持日常与整轮推演分离。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStageProgress } from '../../composables/useStageProgress'

const emit = defineEmits<{ (e: 'open-tab', key: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const progress = useStageProgress()

const runName = computed(() => progress.run.value.trim())
const frozen = computed(() => 'g1_frozen' in progress.merged.value)
const posture = computed(() => String(progress.state.value?.posture ?? '').trim())

function openRun(): void {
  emit('open-tab', 'launch')
}
</script>

<template>
  <section class="sro" data-testid="stg-req-overview">
    <div class="sro__cards">
      <article class="sro__card">
        <span class="sro__label">{{ zh ? '本轮运行' : 'Current run' }}</span>
        <strong class="sro__value" data-testid="stg-req-run">{{ runName || (zh ? '未选择运行' : 'No run selected') }}</strong>
        <span class="sro__hint">{{ posture || (zh ? '运行模式在启动时选择' : 'Run mode is chosen at launch') }}</span>
      </article>
      <article class="sro__card" :class="{ 'sro__card--ok': frozen }">
        <span class="sro__label">{{ zh ? 'G1 需求冻结' : 'G1 requirement freeze' }}</span>
        <strong class="sro__value" :class="{ 'sro__value--ok': frozen }" data-testid="stg-req-g1">
          {{ frozen ? (zh ? '已冻结' : 'Frozen') : (zh ? '未冻结' : 'Not frozen') }}
        </strong>
        <span class="sro__hint">{{ frozen
          ? (zh ? '验收标准已上锁；要改须重走锁定流程' : 'ACs are locked; changes need a re-freeze')
          : (zh ? '先在文档评审里核对验收标准与范围' : 'Review ACs and scope in Doc review first') }}</span>
      </article>
    </div>

    <div class="sro__next">
      <h2 class="sro__h">{{ zh ? '下一步' : 'Next step' }}</h2>
      <ol class="sro__steps">
        <li class="sro__step">
          <div><strong>{{ zh ? '核对冻结单' : 'Check the freeze doc' }}</strong><span>{{ zh ? '验收标准至少 3 条、每条可判定；范围写清' : 'At least 3 judgeable ACs; scope explicit' }}</span></div>
          <button type="button" class="sro__btn" data-testid="stg-req-docs" @click="emit('open-tab', 'docs')">{{ zh ? '打开文档评审' : 'Open doc review' }}</button>
        </li>
        <li class="sro__step">
          <div><strong>{{ zh ? '查看 G1 守门记录' : 'Check G1 records' }}</strong><span>{{ zh ? '质量门 FAIL 的唯一出口是修复单跟踪到复审通过' : 'Gate FAIL can only be cleared through a repair ticket' }}</span></div>
          <button type="button" class="sro__btn" data-testid="stg-req-g1-tab" @click="emit('open-tab', 'g1')">{{ zh ? '打开 G1 记录' : 'Open G1 records' }}</button>
        </li>
        <li class="sro__step">
          <div><strong>{{ zh ? '启动本轮运行' : 'Launch this run' }}</strong><span>{{ zh ? '启动属于整轮运行，在「全流程推演」里做启动前检查' : 'Launching is a full-run action; preflight lives in Full-run Simulation' }}</span></div>
          <button type="button" class="sro__btn" data-testid="stg-req-launch" @click="openRun">{{ zh ? '进入启动运行' : 'Open orchestration' }}</button>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.sro { display: flex; flex-direction: column; gap: 14px; }
.sro__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.sro__card { border: 1px solid var(--border-color); border-radius: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.sro__card--ok { border-color: color-mix(in srgb, var(--ia-fresh) 45%, var(--border-color)); }
.sro__label { font-size: 11px; color: var(--text-muted); }
.sro__value { font-size: 15px; font-weight: 600; }
.sro__value--ok { color: var(--ia-fresh); }
.sro__hint { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; }
.sro__h { margin: 0 0 6px; font-size: 13px; }
.sro__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sro__step { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.sro__step div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sro__step strong { font-size: 12.5px; font-weight: 600; }
.sro__step span { font-size: 11.5px; color: var(--text-muted); }
.sro__btn { border: 1px solid var(--accent-primary); border-radius: 6px; background: transparent; color: var(--accent-primary); font-family: inherit; font-size: 12px; padding: 4px 12px; cursor: pointer; white-space: nowrap; }
.sro__btn:hover { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
.sro__btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
