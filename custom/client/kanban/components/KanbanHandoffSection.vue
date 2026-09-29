<script setup lang="ts">
// KanbanHandoffSection — 交接单区（B10：routa lane 间 handoff 4 类请求×5 态状态机，
// 载体=任务评论结构化标记；协议/折叠/状态机=../handoff.ts 单一事实源）。
// 发起=写结构化评论（走 store.addComment 既有真链，@mention 总线副作用不变）；
// 推进=写状态评论（append-only 折叠为当前态）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'
import {
  HANDOFF_TYPES, HANDOFF_TYPE_LABEL, HANDOFF_STATE_LABEL,
  buildHandoffCards, canAdvanceTo, isTerminalHandoff,
  serializeHandoffCreate, serializeHandoffAdvance,
  type HandoffState, type HandoffType,
} from '../handoff'

const props = defineProps<{
  taskId: string
  comments: Array<{ id: number | string; body?: string | null; created_at?: string }>
}>()
const emit = defineEmits<{ (e: 'submitted'): void }>()

const { t } = useI18n()
const store = useKanbanStore()

const cards = computed(() => buildHandoffCards(props.comments))

const createOpen = ref(false)
const newType = ref<HandoffType>('clarification')
const newBody = ref('')
const busy = ref(false)
const error = ref('')

async function submitCreate(): Promise<void> {
  if (!newBody.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const id = `hf-${Date.now().toString(36)}`
    await store.addComment(props.taskId, serializeHandoffCreate(newType.value, newBody.value, id))
    newBody.value = ''
    createOpen.value = false
    emit('submitted')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

const ADVANCE_LABEL: Record<string, string> = {
  delivered: '交付', completed: '完成', blocked: '受阻', failed: '失败',
}

async function advance(cardId: string, state: HandoffState): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.addComment(props.taskId, serializeHandoffAdvance(cardId, state))
    emit('submitted')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

/** 卡片当前允许的推进项（状态机单源 canAdvanceTo） */
function advanceOptions(state: HandoffState): HandoffState[] {
  return (['delivered', 'completed', 'blocked', 'failed'] as HandoffState[]).filter((s) => canAdvanceTo(state, s))
}
</script>

<template>
  <div class="kanban-handoff" data-testid="kanban-handoff">
    <div class="kanban-handoff__head">
      <span class="kanban-handoff__title">交接单 · {{ cards.length }}</span>
      <button type="button" data-testid="handoff-create-open" @click="createOpen = !createOpen">＋ 发起交接</button>
    </div>

    <div v-if="createOpen" class="kanban-handoff__form" data-testid="handoff-form">
      <select v-model="newType" data-testid="handoff-type">
        <option v-for="tp in HANDOFF_TYPES" :key="tp" :value="tp">{{ HANDOFF_TYPE_LABEL[tp] }}</option>
      </select>
      <textarea v-model="newBody" rows="2" placeholder="交接内容（要对方做什么/给什么）" data-testid="handoff-body" />
      <button type="button" :disabled="busy || !newBody.trim()" data-testid="handoff-submit" @click="submitCreate">
        {{ busy ? '提交中…' : '发起' }}
      </button>
    </div>

    <div v-if="!cards.length && !createOpen" class="kanban-handoff__empty">暂无交接单</div>

    <div v-for="c in cards" :key="c.id" class="kanban-handoff__card" :class="`is-${c.state}`" :data-testid="`handoff-card-${c.id}`">
      <div class="kanban-handoff__cardhead">
        <span class="kanban-handoff__type">{{ HANDOFF_TYPE_LABEL[c.type] }}</span>
        <span class="kanban-handoff__state" :class="`is-${c.state}`">{{ HANDOFF_STATE_LABEL[c.state] }}</span>
      </div>
      <div class="kanban-handoff__body">{{ c.body }}</div>
      <div v-if="c.lastNote" class="kanban-handoff__note">↳ {{ c.lastNote }}</div>
      <div v-if="!isTerminalHandoff(c.state)" class="kanban-handoff__actions">
        <button
          v-for="s in advanceOptions(c.state)" :key="s" type="button"
          :data-testid="`handoff-adv-${c.id}-${s}`" :disabled="busy"
          @click="advance(c.id, s)"
        >{{ ADVANCE_LABEL[s] }}</button>
      </div>
    </div>

    <p v-if="error" class="kanban-handoff__error" data-testid="handoff-error">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.kanban-handoff { margin: 8px 0; font-size: 12px; }
.kanban-handoff__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.kanban-handoff__title { font-weight: 600; color: var(--text-color-2, #555); }
.kanban-handoff__head button { border: 1px dashed var(--border-color, #ccc); background: none; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; }
.kanban-handoff__form { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border-color, #e0e0e0); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.kanban-handoff__form select, .kanban-handoff__form textarea { border: 1px solid var(--border-color, #ddd); border-radius: 4px; padding: 4px 6px; font-size: 12px; }
.kanban-handoff__form button { align-self: flex-end; border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: none; border-radius: 4px; padding: 2px 12px; cursor: pointer; }
.kanban-handoff__empty { color: var(--text-color-3, #999); font-size: 11px; }
.kanban-handoff__card { border: 1px solid var(--border-color, #e0e0e0); border-radius: 6px; padding: 6px 8px; margin: 6px 0; }
.kanban-handoff__card.is-blocked { border-color: var(--warning-color, #f0a020); }
.kanban-handoff__card.is-failed { border-color: var(--error-color, #d03050); }
.kanban-handoff__card.is-completed { opacity: 0.75; }
.kanban-handoff__cardhead { display: flex; gap: 8px; align-items: center; }
.kanban-handoff__type { font-weight: 600; font-size: 11px; }
.kanban-handoff__state { font-size: 10px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; padding: 0 6px; }
.kanban-handoff__state.is-blocked { color: var(--warning-color, #f0a020); border-color: var(--warning-color, #f0a020); }
.kanban-handoff__state.is-failed { color: var(--error-color, #d03050); border-color: var(--error-color, #d03050); }
.kanban-handoff__state.is-delivered { color: var(--primary-color, #18a058); border-color: var(--primary-color, #18a058); }
.kanban-handoff__body { padding: 4px 0; white-space: pre-wrap; }
.kanban-handoff__note { font-size: 11px; color: var(--text-color-3, #999); }
.kanban-handoff__actions { display: flex; gap: 6px; margin-top: 4px; }
.kanban-handoff__actions button { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; }
.kanban-handoff__error { color: var(--error-color, #d03050); font-size: 11px; }
</style>
