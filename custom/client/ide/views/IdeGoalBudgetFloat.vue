<script setup lang="ts">
// IdeGoalBudgetFloat — goal 预算引擎面板（R5/G5，hermes GoalManager 引擎的
// 工作台暴露面）。
// 引擎在 hermes（GoalState turns_used/max_turns + judge + auto-pause）；本面板：
//   ① 命令驱动：设 goal（带 max_turns）/ status / pause / resume / clear，
//      经 chatStore.sendMessage 注入 `/goal <args>` 文本命令（session-command →
//      bridge → GoalManager，与 CLI 同一引擎）；
//   ② 状态投影：从消息流最近 /goal status 回执解析 turn 进度（utils/goalEngine）；
//   ③ 预算警示：turn 用量 ≥80% 黄、≥100% 红（minimax budget_limited 语义）。
// 同时保留 R5 初版的消耗面（工具/迭代/上下文）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { formatTokens } from '../utils/metrics'
import { extractGoalProgress, goalBudgetLevel } from '../utils/goalEngine'

const { t } = useI18n()
const chatStore = useChatStore()
const ide = useIdeStore()

const open = ref(false)

// ── goal 引擎状态（消息流投影）──
const goalProgress = computed(() =>
  extractGoalProgress((chatStore.activeSession?.messages ?? []) as Array<{ role: string; content?: string }>),
)
const budgetLevel = computed(() => (goalProgress.value ? goalBudgetLevel(goalProgress.value) : 'ok'))

// 命令驱动（引擎在 hermes，此处只发文本命令）
const goalDraft = ref('')
const goalTurnsDraft = ref('')
function goalCommand(args: string): void {
  const cmd = `/goal ${args}`.trim()
  void chatStore.sendMessage(cmd)
  ide.setChatFocus()
}
function setGoal(): void {
  const text = goalDraft.value.trim()
  if (!text) return
  const turns = goalTurnsDraft.value.trim()
  const args = turns && /^\d+$/.test(turns) ? `${text} --max-turns ${turns}` : text
  goalCommand(args)
  goalDraft.value = ''
  goalTurnsDraft.value = ''
}

// ── 消耗面（R5 初版保留：工具/迭代/上下文）──
interface GoalStats {
  toolCallCount: number
  iterationCount: number
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
  return { toolCallCount, iterationCount: assistantTurns, contextUsed }
})

const running = computed(() => Boolean(chatStore.isRunActive || chatStore.abortState))
const visible = computed(() => Boolean(stats.value))

// 有 goal 进度时刷新提示（消息流新增 /goal status 回执后自动反映）
watch(
  () => chatStore.activeSession?.messages?.length,
  () => { /* goalProgress 由 computed 自动重算 */ },
)
</script>

<template>
  <!-- 面板移出 button：交互元素嵌套（button>button/input）违反 HTML 规范，
       键盘 Tab/Enter 语义与读屏行为不可预期，此前仅靠 @click.stop 掩盖 -->
  <div v-if="visible" class="ide-goal-wrap">
    <button
      type="button"
      class="ide-goal"
      :data-level="budgetLevel"
      data-testid="ide-goal-budget"
      :title="t('ide.goal.title')"
      @click="open = !open"
    >
      ◎ <template v-if="goalProgress">{{ goalProgress.used }}/{{ goalProgress.max }}</template><template v-else>{{ stats!.toolCallCount }}·{{ stats!.iterationCount }}</template>
    </button>
    <div v-if="open" class="ide-goal__panel" data-testid="ide-goal-panel" @click.stop>
      <!-- goal 引擎：turn 进度 + 预算警示 -->
      <div v-if="goalProgress" class="ide-goal__progress" data-testid="ide-goal-progress">
        <div class="ide-goal__progress-head">
          <span>{{ t('ide.goal.turns') }}</span>
          <span class="ide-goal__num" :data-level="budgetLevel">{{ goalProgress.used }}/{{ goalProgress.max }}</span>
        </div>
        <div class="ide-goal__bar">
          <span
            class="ide-goal__fill"
            :data-level="budgetLevel"
            :style="{ width: `${Math.min((goalProgress.used / goalProgress.max) * 100, 100)}%` }"
          />
        </div>
        <p v-if="budgetLevel !== 'ok'" class="ide-goal__warn" data-testid="ide-goal-warn">
          {{ budgetLevel === 'over' ? t('ide.goal.budgetOver') : t('ide.goal.budgetWarn') }}
        </p>
      </div>

      <!-- goal 命令驱动 -->
      <div class="ide-goal__cmd" data-testid="ide-goal-cmd">
        <input
          v-model="goalDraft"
          class="ide-goal__input"
          :placeholder="t('ide.goal.setPlaceholder')"
          data-testid="ide-goal-input"
          @keydown.enter.prevent="setGoal"
        >
        <div class="ide-goal__cmd-row">
          <input
            v-model="goalTurnsDraft"
            class="ide-goal__input ide-goal__input--turns"
            :placeholder="t('ide.goal.turnsPlaceholder')"
            data-testid="ide-goal-turns"
            @keydown.enter.prevent="setGoal"
          >
          <button type="button" class="ide-goal__btn is-primary" :disabled="!goalDraft.trim()" data-testid="ide-goal-set" @click="setGoal">
            {{ t('ide.goal.set') }}
          </button>
        </div>
        <div class="ide-goal__cmd-row">
          <button type="button" class="ide-goal__btn" data-testid="ide-goal-status" @click="goalCommand('status')">{{ t('ide.goal.status') }}</button>
          <button type="button" class="ide-goal__btn" data-testid="ide-goal-pause" @click="goalCommand('pause')">{{ t('ide.goal.pause') }}</button>
          <button type="button" class="ide-goal__btn" data-testid="ide-goal-resume" @click="goalCommand('resume')">{{ t('ide.goal.resume') }}</button>
          <button type="button" class="ide-goal__btn" data-testid="ide-goal-clear" @click="goalCommand('clear')">{{ t('ide.goal.clear') }}</button>
        </div>
      </div>

      <!-- 消耗面（R5 初版保留） -->
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
      <p class="ide-goal__hint">{{ t('ide.goal.engineHint') }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-goal-wrap {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
}

.ide-goal {
  position: relative;
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { border-color: #61afef; color: #61afef; }

  &[data-level='warn'] { border-color: #f0a44c66; color: #f0a44c; }
  &[data-level='over'] { border-color: #e06c7566; color: #e06c75; }
}

.ide-goal__panel {
  position: absolute;
  right: 0;
  top: 22px;
  width: 240px;
  padding: 8px 10px;
  font-size: 11px;
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 340;
  cursor: default;
}

.ide-goal__progress {
  margin-bottom: 8px;
}

.ide-goal__progress-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-weight: 600;
}

.ide-goal__num {
  font-variant-numeric: tabular-nums;

  &.is-running { color: #4cc9f0; }
  &[data-level='warn'] { color: #f0a44c; }
  &[data-level='over'] { color: #e06c75; }
}

.ide-goal__bar {
  height: 5px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-muted, #9aa0aa) 22%, transparent);
}

.ide-goal__fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--success-color, #98c379);
  transition: width 0.3s ease;

  &[data-level='warn'] { background: #f0a44c; }
  &[data-level='over'] { background: #e06c75; }
}

.ide-goal__warn {
  margin-top: 4px;
  font-size: 10px;
  color: #f0a44c;
}

.ide-goal__cmd {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #3a3f4b);
}

.ide-goal__input {
  width: 100%;
  border: 1px solid var(--border-color, #3a3f4b);
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #d7dae0);
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 4px;
  margin-bottom: 4px;

  &::placeholder { color: var(--text-muted, #9aa0aa); }
}

.ide-goal__input--turns {
  width: 90px;
  flex-shrink: 0;
}

.ide-goal__cmd-row {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.ide-goal__btn {
  flex: 1;
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 10px;
  padding: 3px 4px;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: #61afef; color: #61afef; }
  &:disabled { opacity: 0.4; cursor: default; }

  &.is-primary {
    background: #61afef22;
    border-color: #61afef66;
    color: #61afef;
  }
}

.ide-goal__row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  color: var(--text-secondary, #b0b5be);
}

.ide-goal__hint {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color, #3a3f4b);
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}
</style>
