<script setup lang="ts">
// IdeGoalBudgetFloat — goal 预算浮层（R5/G5，zcode ZCodeTaskGoalStats 语义）。
// 数据契约：zcode 的 goal stats = tokensUsed/tokenBudget/contextUsed/contextWindow/
// toolCallCount/iterationCount/timeUsedSeconds。我方无 goal 配置通道（R5 引擎域），
// 本组件把「当前会话已达成的 goal 消耗面」显性化：上下文用量/工具调用数/迭代数
// （消息流推导）/已用时长，为后续预算上限引擎落地后的展示锚点。
// 渲染：chat 头部小徽标（点击展开明细行）；无会话不渲染。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { formatTokens } from '../utils/metrics'

const { t } = useI18n()
const chatStore = useChatStore()

const open = ref(false)

interface GoalStats {
  toolCallCount: number
  iterationCount: number
  assistantTurns: number
  contextUsed: number
}

const stats = computed<GoalStats | null>(() => {
  const session = chatStore.activeSession
  if (!session?.messages?.length) return null
  let toolCallCount = 0
  let assistantTurns = 0
  for (const m of session.messages) {
    if (m.role === 'tool') toolCallCount += 1
    else if (m.role === 'assistant') assistantTurns += 1
  }
  const contextUsed = typeof session.contextTokens === 'number' && session.contextTokens > 0
    ? session.contextTokens
    : (session.inputTokens ?? 0) + (session.outputTokens ?? 0)
  return {
    toolCallCount,
    iterationCount: assistantTurns,
    assistantTurns,
    contextUsed,
  }
})

const running = computed(() => Boolean(chatStore.isRunActive || chatStore.abortState))
const visible = computed(() => Boolean(stats.value))
</script>

<template>
  <button
    v-if="visible"
    type="button"
    class="ide-goal"
    data-testid="ide-goal-budget"
    :title="t('ide.goal.title')"
    @click="open = !open"
  >
    ◎ {{ stats!.toolCallCount }}·{{ stats!.iterationCount }}
    <div v-if="open" class="ide-goal__panel" data-testid="ide-goal-panel" @click.stop>
      <div class="ide-goal__row">
        <span>{{ t('ide.goal.toolCalls') }}</span>
        <span class="ide-goal__num">{{ stats!.toolCallCount }}</span>
      </div>
      <div class="ide-goal__row">
        <span>{{ t('ide.goal.iterations') }}</span>
        <span class="ide-goal__num">{{ stats!.iterationCount }}</span>
      </div>
      <div class="ide-goal__row">
        <span>{{ t('ide.goal.contextUsed') }}</span>
        <span class="ide-goal__num">{{ formatTokens(stats!.contextUsed) }}</span>
      </div>
      <div v-if="running" class="ide-goal__row">
        <span>{{ t('ide.goal.state') }}</span>
        <span class="ide-goal__num is-running">{{ t('ide.goal.running') }}</span>
      </div>
      <p class="ide-goal__hint">{{ t('ide.goal.hint') }}</p>
    </div>
  </button>
</template>

<style scoped lang="scss">
.ide-goal {
  position: relative;
  flex-shrink: 0;
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { border-color: #61afef; color: #61afef; }
}

.ide-goal__panel {
  position: absolute;
  right: 0;
  top: 22px;
  width: 200px;
  padding: 8px 10px;
  font-size: 11px;
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 340;
  cursor: default;
}

.ide-goal__row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  color: var(--text-secondary, #b0b5be);
}

.ide-goal__num {
  font-variant-numeric: tabular-nums;

  &.is-running { color: #4cc9f0; }
}

.ide-goal__hint {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color, #3a3f4b);
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}
</style>
