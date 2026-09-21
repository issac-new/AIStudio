<script setup lang="ts">
// IdeStatusBar — 底部状态栏：终端状态 | agent 底座 | workspace | 会话运行态
// + 会话遥测簇（M2，dsh-TUI 语义移植）：上下文水位条 / TPS 仪表 / 缓存命中。
// 只读投影（ide store + chat store + useSessionMetrics），不含动作。
// R1 扩展：遥测簇可点击展开 IdeMetricsPopover（G4 构成/G8 轮表/G7 热力图/
// 成本估算）；低上下文余量主动 toast（dsh channel.ts 语义，带迟滞）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useIdeStore } from '../store/ide'
import { useChatStore } from '@/stores/hermes/chat'
import { useSessionMetrics } from '../composables/useSessionMetrics'
import { TPS_FLOOR, formatTokens, lowContextThreshold, LOW_CONTEXT_RECOVER_PCT } from '../utils/metrics'
import IdeMetricsPopover from './IdeMetricsPopover.vue'

const ide = useIdeStore()
const chatStore = useChatStore()
const { t } = useI18n()
const message = useMessage()
const metrics = useSessionMetrics()

const running = computed(() => Boolean(chatStore.isRunActive || chatStore.abortState))

const sessionState = computed(() =>
  running.value ? t('ide.statusRunning') : t('ide.statusIdle'),
)

// ── 遥测簇展示口径（详见 utils/metrics.ts 头注）──

const contextTitle = computed(() =>
  `${t('ide.metrics.context')}: ${metrics.contextText.value}`)

// 仪表条按会话峰值缩放、地板 40 t/s（dsh-TUI renderTpsGauge 同款）
const tpsGaugePct = computed(() => {
  const value = metrics.tpsDisplay.value
  if (value == null || value <= 0) return 0
  const scale = Math.max(metrics.tpsPeak.value ?? 0, TPS_FLOOR)
  return Math.min((value / scale) * 100, 100)
})
const tpsText = computed(() => {
  const value = metrics.tpsDisplay.value
  if (value == null || value <= 0) return ''
  return `${Math.round(value)} t/s`
})
const tpsTitle = computed(() => {
  const value = metrics.tpsDisplay.value
  if (value == null || value <= 0) return t('ide.metrics.tpsEmpty')
  return `${t('ide.metrics.tps')}: ${Math.round(value)} tokens/s`
})

const cacheText = computed(() =>
  metrics.cacheHit.value == null ? '' : `${Math.round(metrics.cacheHit.value)}%`)
const cacheTitle = computed(() => {
  const hit = metrics.cacheHit.value
  const detail = metrics.cacheDetail.value
  if (hit == null || !detail) return t('ide.metrics.cacheEmpty')
  return [
    `${t('ide.metrics.cache')} ${hit.toFixed(1)}%`,
    `${t('ide.metrics.cacheRead')} ${formatTokens(detail.cacheReadTokens)}`,
    `${t('ide.metrics.cacheWrite')} ${formatTokens(detail.cacheWriteTokens)}`,
    `${t('ide.metrics.cacheInput')} ${formatTokens(detail.inputTokens)}`,
  ].join(' · ')
})

// ── R1：遥测弹层（点击遥测簇开合；弹层自身 Esc/× 关闭）──
const metricsOpen = ref(false)

// ── R1：低上下文余量主动提醒（进入低水位 toast 一次；恢复越过
// threshold×(1+5%) 迟滞线后重置可再告警；dsh 20k 绝对余量语义）──
let lowNotified = false
watch(
  () => [metrics.contextUsed.value, metrics.contextLength.value] as const,
  ([used, windowTokens]) => {
    if (windowTokens <= 0) return
    const remaining = Math.max(0, windowTokens - used)
    const threshold = lowContextThreshold(windowTokens)
    if (remaining <= threshold) {
      if (!lowNotified) {
        lowNotified = true
        message.warning(
          t('ide.metrics.lowContextToast', { remain: formatTokens(remaining) }),
          { duration: 6000 },
        )
      }
    } else if (lowNotified && remaining > threshold * (1 + LOW_CONTEXT_RECOVER_PCT / 100)) {
      lowNotified = false
    }
  },
)
</script>

<template>
  <footer class="ide-statusbar">
    <span class="ide-statusbar__item" :title="ide.workspace ?? ''">
      {{ ide.workspace ?? t('ide.workspaceDefault') }}
    </span>

    <!-- 会话遥测簇（dsh-TUI 移植：水位条 / TPS / 缓存；R1：点击展开遥测面板） -->
    <span
      class="ide-statusbar__cluster"
      data-testid="ide-metrics-cluster"
      role="button"
      tabindex="0"
      @click="metricsOpen = !metricsOpen"
      @keydown.enter.prevent="metricsOpen = !metricsOpen"
    >
      <span
        v-if="metrics.showContext.value"
        class="ide-statusbar__metric"
        data-testid="ide-metrics-context"
        :title="contextTitle"
      >
        <span class="ide-statusbar__ctxbar">
          <span
            class="ide-statusbar__ctxfill"
            :data-level="metrics.contextLevel.value"
            :style="{ width: `${metrics.contextPct.value}%` }"
          />
        </span>
        {{ metrics.contextText.value }}
      </span>
      <span
        v-if="tpsText"
        class="ide-statusbar__metric"
        data-testid="ide-metrics-tps"
        :data-speed="metrics.tpsSpeed.value"
        :title="tpsTitle"
      >
        <span class="ide-statusbar__tpsbar">
          <span
            class="ide-statusbar__tpsfill"
            :data-speed="metrics.tpsSpeed.value"
            :style="{ width: `${tpsGaugePct}%` }"
          />
        </span>
        <span v-if="!running && metrics.tpsSpark.value" class="ide-statusbar__spark">{{ metrics.tpsSpark.value }}</span>
        {{ tpsText }}
      </span>
      <span
        v-if="cacheText"
        class="ide-statusbar__metric"
        data-testid="ide-metrics-cache"
        :title="cacheTitle"
      >
        {{ t('ide.metrics.cache') }} {{ cacheText }}
      </span>
    </span>

    <span class="ide-statusbar__spacer" />
    <span class="ide-statusbar__item" :class="{ 'is-running': running }">{{ sessionState }}</span>

    <!-- R1 遥测面板（G4 构成 / G8 轮表 / G7 热力图 / 成本估算） -->
    <Teleport to="body">
      <IdeMetricsPopover v-if="metricsOpen" :metrics="metrics" @close="metricsOpen = false" />
    </Teleport>
  </footer>
</template>

<style scoped lang="scss">
.ide-statusbar {
  flex-shrink: 0;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  background: var(--bg-secondary, #1b1e24);
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.ide-statusbar__item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-running {
    color: var(--success-color, #98c379);
  }
}

.ide-statusbar__spacer {
  flex: 1;
}

/* ── 会话遥测簇 ── */

.ide-statusbar__cluster {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  border-radius: 4px;

  &:focus-visible {
    outline: 1px solid var(--border-color, #4a90d9);
  }
}

.ide-statusbar__metric {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: default;
}

.ide-statusbar__ctxbar {
  width: 72px;
  height: 5px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-muted, #9aa0aa) 22%, transparent);
}

.ide-statusbar__ctxfill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--success-color, #98c379);
  transition: width 0.3s ease;

  /* 压力分级与 ChatInput 上下文条同阈值（60/80） */
  &[data-level='warn'] {
    background: #f0a44c;
  }

  &[data-level='danger'] {
    background: #e06c75;
  }
}

.ide-statusbar__tpsbar {
  width: 40px;
  height: 5px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-muted, #9aa0aa) 22%, transparent);
}

.ide-statusbar__tpsfill {
  display: block;
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;

  /* 速度色阶（dsh-TUI：≥50 绿 / ≥20 黄 / <20 红） */
  &[data-speed='fast'] {
    background: var(--success-color, #98c379);
  }

  &[data-speed='med'] {
    background: #f0a44c;
  }

  &[data-speed='slow'] {
    background: #e06c75;
  }
}

.ide-statusbar__spark {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  line-height: 1;
  letter-spacing: -0.5px;
  opacity: 0.85;
}
</style>
