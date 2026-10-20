<!-- ②需求·日常总览：需求任务是否收口、文档评审和质量门去哪核对；
     启动推演是显式跨区动作，不把推演运行状态混入日常进度。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../store/workspace'

const emit = defineEmits<{ (e: 'open-tab', key: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const router = useRouter()
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()

const counts = computed(() => {
  const tasks = workspace.tasks ?? []
  return {
    triage: tasks.filter(t => t.status === 'triage').length,
    todo: tasks.filter(t => t.status === 'todo').length,
    ready: tasks.filter(t => t.status === 'ready').length,
  }
})

function openSimulation(): void {
  void router.push({ name: 'ia2.simOrchestration' })
}
</script>

<template>
  <section class="sro" data-testid="stg-req-overview">
    <div class="sro__cards">
      <article class="sro__card">
        <span class="sro__label">{{ zh ? '待分类需求' : 'Needs triage' }}</span>
        <strong class="sro__value" data-testid="stg-req-triage">{{ counts.triage }}</strong>
        <span class="sro__hint">{{ zh ? '先确认是不是有效需求，再拆任务' : 'Confirm validity before breakdown' }}</span>
      </article>
      <article class="sro__card">
        <span class="sro__label">{{ zh ? '待办需求' : 'To do' }}</span>
        <strong class="sro__value" data-testid="stg-req-todo">{{ counts.todo }}</strong>
        <span class="sro__hint">{{ zh ? '已确认，尚未进入分析排期' : 'Confirmed, not scheduled yet' }}</span>
      </article>
      <article class="sro__card">
        <span class="sro__label">{{ zh ? '可进入分析' : 'Ready' }}</span>
        <strong class="sro__value" data-testid="stg-req-ready">{{ counts.ready }}</strong>
        <span class="sro__hint">{{ zh ? '需求卡已具备拆解条件' : 'Ready for analysis breakdown' }}</span>
      </article>
    </div>

    <div class="sro__next">
      <h2 class="sro__h">{{ zh ? '下一步' : 'Next step' }}</h2>
      <ol class="sro__steps">
        <li class="sro__step">
          <div><strong>{{ zh ? '核对需求文档' : 'Review requirement docs' }}</strong><span>{{ zh ? '验收标准至少 3 条、每条可判定；范围写清' : 'At least 3 judgeable ACs; scope explicit' }}</span></div>
          <button type="button" class="sro__btn" data-testid="stg-req-docs" @click="emit('open-tab', 'docs')">{{ zh ? '打开文档评审' : 'Open doc review' }}</button>
        </li>
        <li class="sro__step">
          <div><strong>{{ zh ? '查看 G1 守门记录' : 'Check G1 records' }}</strong><span>{{ zh ? '质量门 FAIL 的唯一出口是修复单跟踪到复审通过' : 'Gate FAIL can only be cleared through a repair ticket' }}</span></div>
          <button type="button" class="sro__btn" data-testid="stg-req-g1-tab" @click="emit('open-tab', 'g1')">{{ zh ? '打开 G1 记录' : 'Open G1 records' }}</button>
        </li>
        <li class="sro__step">
          <div><strong>{{ zh ? '用推演串联全流程' : 'Run the full flow' }}</strong><span>{{ zh ? '跨区动作：由导演台选择典型场景，不改变日常任务数据' : 'Cross-domain action driven by the simulation director' }}</span></div>
          <button type="button" class="sro__btn sro__btn--cross" data-testid="stg-req-launch" @click="openSimulation">{{ zh ? '查看全流程推演' : 'Open full-flow simulation' }}</button>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.sro { display: flex; flex-direction: column; gap: 14px; }
.sro__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.sro__card { border: 1px solid var(--border-color); border-radius: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.sro__label { font-size: 11px; color: var(--text-muted); }
.sro__value { font-size: 22px; font-weight: 700; color: var(--accent-primary); font-variant-numeric: tabular-nums; }
.sro__hint { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; }
.sro__h { margin: 0 0 6px; font-size: 13px; }
.sro__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sro__step { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.sro__step div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sro__step strong { font-size: 12.5px; font-weight: 600; }
.sro__step span { font-size: 11.5px; color: var(--text-muted); }
.sro__btn { border: 1px solid var(--accent-primary); border-radius: 6px; background: transparent; color: var(--accent-primary); font-family: inherit; font-size: 12px; padding: 4px 12px; cursor: pointer; white-space: nowrap; }
.sro__btn--cross { border-color: var(--border-color); color: var(--accent-info); }
.sro__btn:hover { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
.sro__btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
</style>
