<!-- overlay/custom/client/ide/components/IdeTaskContextBar.vue -->
<!-- M-E IDE 任务上下文条：activeTask 激活时显示当前任务 + 文档指针 + 聊天锚点 +
     diff 确认（R3 门）与提交回执操作。挂 IdeShell（DimsBar 之下），零打扰既有面板。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdeStore } from '../store/ide'
import { useIdeLinkageStore } from '@/custom/matrix-teams/stores/ide-linkage'
import { cardStatus } from '@/custom/matrix-teams/task-card'

const { t } = useI18n()
const ide = useIdeStore()
const linkage = useIdeLinkageStore()

const card = computed(() => linkage.cardOf(ide.activeTaskId))
const binding = computed(() => linkage.bindingOf(ide.activeTaskId))
const status = computed(() => card.value ? cardStatus(card.value.assign, card.value.receipt) : null)

const diffRef = ref('')
const confirming = ref(false)
const lastR3 = ref<'ok' | 'fail' | null>(null)

const hasTask = computed(() => Boolean(ide.activeTaskId))

async function onConfirmDiff(): Promise<void> {
  if (!ide.activeTaskId || !diffRef.value.trim()) return
  confirming.value = true
  const res = await linkage.confirmDiff(ide.activeTaskId, diffRef.value.trim())
  lastR3.value = res.ok ? 'ok' : 'fail'
  confirming.value = false
}

async function onSubmit(): Promise<void> {
  if (!ide.activeTaskId) return
  await linkage.markSubmitted(ide.activeTaskId, card.value?.receipt?.localTaskId)
}
</script>

<template>
  <div v-if="hasTask" class="itc" data-testid="ide-task-context-bar">
    <template v-if="card">
      <span class="itc__label">{{ t('ide.taskCtx.current') }}</span>
      <span class="itc__title" data-testid="ide-task-context-title">{{ card.assign.title }}</span>
      <span class="itc__status" data-testid="ide-task-context-status">{{ t(`ia2.taskCard.status.${status}`) }}</span>
    </template>
    <span v-else class="itc__title itc__title--muted" data-testid="ide-task-context-title">{{ t('ide.taskCtx.noCard') }}</span>

    <span v-if="binding?.docRefs?.length" class="itc__docs" data-testid="ide-task-context-docs">
      📄 {{ binding.docRefs.length }} <span v-for="(d, i) in binding.docRefs.slice(0, 3)" :key="d" class="itc__doc" :title="d">{{ d.split('/').pop() }}{{ i < Math.min(binding.docRefs.length, 3) - 1 ? ' ·' : '' }}</span>
    </span>
    <span v-if="binding?.chatAnchor" class="itc__anchor" data-testid="ide-task-context-anchor" :title="binding.chatAnchor">💬 {{ t('ide.taskCtx.chatAnchor') }}</span>
    <span v-if="binding?.acpSessionId" class="itc__acp" data-testid="ide-task-context-acp">⇄ ACP</span>

    <div class="itc__ops">
      <input
        v-model="diffRef" class="itc__diff-input" :disabled="confirming"
        :placeholder="t('ide.taskCtx.diffPlaceholder')" data-testid="ide-task-diff-input"
      >
      <button
        type="button" class="itc__btn itc__btn--r3" :disabled="confirming || !diffRef.trim() || !card"
        data-testid="ide-task-diff-confirm" @click="onConfirmDiff"
      >{{ t('ide.taskCtx.confirmR3') }}</button>
      <span v-if="lastR3 === 'ok'" class="itc__r3-ok" data-testid="ide-task-r3-ok">R3 ✓</span>
      <span v-else-if="lastR3 === 'fail'" class="itc__r3-fail" data-testid="ide-task-r3-fail">R3 ✗</span>
      <button
        type="button" class="itc__btn" :disabled="!card || status === 'done'"
        data-testid="ide-task-submit" @click="onSubmit"
      >{{ t('ide.taskCtx.submit') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.itc {
  flex: none; display: flex; align-items: center; gap: 10px; padding: 4px 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0); background: var(--bg-secondary, #f4f5f6);
  font-size: 11px; color: var(--text-secondary); overflow-x: auto;
}
.itc__label { color: var(--text-muted); flex: none; }
.itc__title { font-weight: 600; color: var(--text-primary); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.itc__title--muted { font-weight: 400; color: var(--text-muted); }
.itc__status { padding: 0 8px; border-radius: 8px; background: var(--bg-tertiary, #ebebeb); color: var(--text-secondary); flex: none; }
.itc__docs { color: var(--text-muted); white-space: nowrap; }
.itc__doc { color: var(--text-secondary); }
.itc__anchor, .itc__acp { color: var(--text-muted); flex: none; white-space: nowrap; }
.itc__ops { margin-left: auto; display: flex; align-items: center; gap: 6px; flex: none; }
.itc__diff-input {
  width: 180px; border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 8px;
  font-size: 11px; background: var(--bg-primary); color: var(--text-primary);
}
.itc__btn {
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary);
  color: var(--text-primary); font-size: 11px; padding: 2px 10px; cursor: pointer; font-family: inherit;
  &:disabled { opacity: .4; cursor: default; }
}
.itc__btn--r3 { border-color: var(--success, #34c77b); color: var(--success, #34c77b); }
.itc__r3-ok { color: var(--success, #34c77b); font-weight: 700; }
.itc__r3-fail { color: var(--error, #e05656); font-weight: 700; }
</style>
