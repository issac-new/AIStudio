<script setup lang="ts">
// IdeStatusBar — 底部状态栏：终端状态 | agent 底座 | workspace | 会话运行态
// + 会话遥测簇（M2，dsh-TUI 语义移植）：上下文水位条 / TPS 仪表 / 缓存命中。
// 只读投影（ide store + chat store + useSessionMetrics），不含动作。
// R1 扩展：遥测簇可点击展开 IdeMetricsPopover（G4 构成/G8 轮表/G7 热力图/
// 成本估算）；低上下文余量主动 toast（dsh channel.ts 语义，带迟滞）。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useIdeStore } from '../store/ide'
import { useChatStore } from '@/stores/hermes/chat'
import { useSessionMetrics } from '../composables/useSessionMetrics'
import { TPS_FLOOR, formatTokens, lowContextThreshold, LOW_CONTEXT_RECOVER_PCT } from '../utils/metrics'
import { useZcodeProjection } from '../../zcode/store/zcode-projection'
import { connectZcode, subscribeZcodeWorkspace } from '../../zcode/api/zcode-socket'
import { handleZcodeEvent } from '../../zcode/store/zcode-projection'
import IdeMetricsPopover from './IdeMetricsPopover.vue'

const ide = useIdeStore()
const chatStore = useChatStore()
const { t } = useI18n()
const message = useMessage()
const metrics = useSessionMetrics()
// zcode 会话投影（R4-P2）：/zcode 事件面的状态条 chip（会话数 + 最新 reason）。
// 槽位定制（UI-8，kimi/minimax/codex/dsh 四源合并的数据面消费——轻量版：
// 显隐+顺序存 localStorage；custom 探针槽列层 2）。
interface StatusSlotConf { kind: 'workspace' | 'zcode' | 'metrics'; on: boolean }
const SLOT_KEYS: Array<StatusSlotConf['kind']> = ['workspace', 'zcode', 'metrics']
const slotsConf = ref<StatusSlotConf[]>(readSlots())
const slotsPanelOpen = ref(false)

function readSlots(): StatusSlotConf[] {
  try {
    const raw = JSON.parse(localStorage.getItem('ide_status_slots') ?? '[]') as StatusSlotConf[]
    const valid = SLOT_KEYS.map((k) => raw.find((r) => r && r.kind === k) ?? { kind: k, on: true })
    return valid
  } catch {
    return SLOT_KEYS.map((k) => ({ kind: k, on: true }))
  }
}

function persistSlots(): void {
  localStorage.setItem('ide_status_slots', JSON.stringify(slotsConf.value))
}

function slotOn(kind: StatusSlotConf['kind']): boolean {
  return slotsConf.value.find((s) => s.kind === kind)?.on ?? true
}

function slotOrder(kind: StatusSlotConf['kind']): number {
  return slotsConf.value.findIndex((s) => s.kind === kind)
}

function toggleSlot(kind: StatusSlotConf['kind']): void {
  const slot = slotsConf.value.find((s) => s.kind === kind)
  if (slot) slot.on = !slot.on
  persistSlots()
}

function moveSlot(kind: StatusSlotConf['kind'], delta: number): void {
  const idx = slotsConf.value.findIndex((s) => s.kind === kind)
  const target = idx + delta
  if (idx < 0 || target < 0 || target >= slotsConf.value.length) return
  const next = [...slotsConf.value]
  const [item] = next.splice(idx, 1)
  next.splice(target, 0, item)
  slotsConf.value = next
  persistSlots()
}

const zcodeProjection = useZcodeProjection()

// /zcode 事件面活水：挂接即连即订阅当前 workspace（断线重连由 socket 层 connect
// 幂等重订）。订阅返回清理函数（off 监听 + 退订「订阅时的」workspace），换 workspace
// 先退旧再订新、卸载精确清理——不看卸载时刻的 ide.workspace（可能已与订阅值不同）。
// 空 workspace 不订阅：服务端 subscribe 对空串忽略（projection-socket.ts）。
let zcodeSocket: ReturnType<typeof connectZcode> | null = null
let unsubscribeZcode: (() => void) | null = null

function subscribeZcode(workspace: string | null | undefined): void {
  unsubscribeZcode?.()
  unsubscribeZcode = null
  if (!zcodeSocket || !workspace) return
  unsubscribeZcode = subscribeZcodeWorkspace(zcodeSocket, workspace, handleZcodeEvent)
}

onMounted(() => {
  try {
    zcodeSocket = connectZcode()
    subscribeZcode(ide.workspace)
  } catch { /* /zcode 面缺席不影响状态条其余能力 */ }
})
watch(() => ide.workspace, (workspace) => {
  try { subscribeZcode(workspace) } catch { /* 同上 */ }
})
onUnmounted(() => {
  try { unsubscribeZcode?.() } catch { /* 已断 */ }
  unsubscribeZcode = null
})

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
    <span v-if="slotOn('workspace')" class="ide-statusbar__item" :style="{ order: slotOrder('workspace') }" :title="ide.workspace ?? ''">
      {{ ide.workspace ?? t('ide.workspaceDefault') }}
    </span>

    <!-- zcode 会话投影 chip（R4-P2）：会话数 + 最新 reason（词表字面值本地化） -->
    <span
      v-if="slotOn('zcode') && (zcodeProjection.sessionCount.value > 0 || zcodeProjection.lastReasonText.value)"
      class="ide-statusbar__item"
      :style="{ order: slotOrder('zcode') }"
      data-testid="ide-zcode-projection"
      :title="`zcode: ${zcodeProjection.sessionCount.value} 会话 · Δ${zcodeProjection.state.conversationDeltaTotal}`"
    >
      zcode {{ zcodeProjection.sessionCount.value }}
      <span
        v-if="zcodeProjection.lastReasonText.value"
        class="ide-statusbar__zcode-reason"
        :data-trouble="zcodeProjection.lastReasonIsTrouble.value"
      >
        {{ zcodeProjection.lastReasonText.value }}
      </span>
    </span>

    <!-- 会话遥测簇（dsh-TUI 移植：水位条 / TPS / 缓存；R1：点击展开遥测面板） -->
    <span
      v-if="slotOn('metrics')"
      :style="{ order: slotOrder('metrics') }"
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
      <span class="ide-statusbar__item ide-statusbar__slots-btn" :style="{ order: 99 }">
      <button
        type="button"
        class="ide-statusbar__config"
        data-testid="ide-status-slots-btn"
        title="statusline slots"
        @click="slotsPanelOpen = !slotsPanelOpen"
      >⚙</button>
      <div v-if="slotsPanelOpen" class="ide-statusbar__slots-panel" data-testid="ide-status-slots-panel">
        <div v-for="slot in slotsConf" :key="slot.kind" class="ide-statusbar__slot-row">
          <label>
            <input type="checkbox" :checked="slot.on" :data-testid="`ide-slot-${slot.kind}`" @change="toggleSlot(slot.kind)">
            {{ slot.kind }}
          </label>
          <span class="ide-statusbar__slot-move">
            <button type="button" :data-testid="`ide-slot-${slot.kind}-up`" @click="moveSlot(slot.kind, -1)">↑</button>
            <button type="button" :data-testid="`ide-slot-${slot.kind}-down`" @click="moveSlot(slot.kind, 1)">↓</button>
          </span>
        </div>
      </div>
    </span>
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

/* ── zcode 投影 chip ── */
.ide-statusbar__zcode-reason {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
  &[data-trouble='true'] {
    background: rgba(212, 76, 71, 0.18);
    color: #d44c47;
  }
  &[data-trouble='false'] {
    background: rgba(62, 172, 118, 0.14);
    color: #3eac76;
  }
}

.ide-statusbar__config {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-color-3, #999);
}

.ide-statusbar__slots-btn {
  position: relative;
  display: inline-flex;
}

.ide-statusbar__slots-panel {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  background: var(--card-color, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px 10px;
  z-index: 60;
  font-size: 12px;
  min-width: 150px;
}

.ide-statusbar__slot-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.ide-statusbar__slot-move button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-color-3, #999);
}
</style>
