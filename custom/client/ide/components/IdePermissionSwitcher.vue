<script setup lang="ts">
// IdePermissionSwitcher — ZCode 模式控件（2026-10-18 锚定校正轮重写）。
// 上游锚=upstream/zcode v3.15.1 v4/composer/V4ComposerModeControls.tsx：
// Plan 独立勾选项（planEnabled 与权限档正交，开启时触发器旁显示计划标记可 ✕ 撤）
// + 权限三档单选（build 改动前询问 / guarded 自主模式 / yolo 完全访问，yolo 警示
// 色、guarded 蓝）。数据面=utils/zcodeModes（zcode 形态存储 + 派生七档写旧键，
// 服务端 session-mode REST 与既有消费者零改动）。
// A2 诚实化保留：档位随任务派发/自动化消费（穿线服务端会话档，随
// createSession.config.mode 生效）；会话内即时切换需引擎通道（v4 sendText mode
// 已查实，接线列独立轮）。
import { computed, onUnmounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { authFetch } from '../utils/auth-fetch'
import {
  readZcodeMode, writeZcodeMode, toLegacyMode, zcodeModeLabel,
  ZCODE_PERMISSION_MODES, ZCODE_PLAN, type ZcodeModeState,
} from '../utils/zcodeModes'

const chatStore = useChatStore()
const ide = useIdeStore()
const open = ref(false)

const state = ref<ZcodeModeState>(readZcodeMode(chatStore.activeSessionId))
const selectedLabel = computed(() => zcodeModeLabel(state.value))

function resync(): void {
  state.value = readZcodeMode(chatStore.activeSessionId)
}
watch(() => chatStore.activeSessionId, resync)

// 双入口同步：composer 设置菜单（IdeChatPane）写同一存储后广播；本触发器监听刷新。
const PERM_MODE_EVENT = 'ide-perm-mode-changed'
if (typeof window !== 'undefined') {
  window.addEventListener(PERM_MODE_EVENT, resync)
  window.addEventListener('storage', resync)
  onUnmounted(() => {
    window.removeEventListener(PERM_MODE_EVENT, resync)
    window.removeEventListener('storage', resync)
  })
}

// 服务端会话档穿线（七档词表）；失败 fail-soft（本地档仍随派发面消费）。
async function pushServerMode(legacy: string): Promise<void> {
  const agentId = (ide as { agentId?: string }).agentId
  if (!agentId) return
  try {
    await authFetch(`/api/hermes/permmodes/session-mode/${encodeURIComponent(agentId)}`, {
      method: 'PUT',
      body: JSON.stringify({ mode: legacy }),
    })
  } catch { /* fail-soft：服务端不可达时保留本地档（派发面退本地） */ }
}

function commit(next: ZcodeModeState): void {
  state.value = next
  writeZcodeMode(chatStore.activeSessionId, next)
  void pushServerMode(toLegacyMode(next))
  window.dispatchEvent(new CustomEvent(PERM_MODE_EVENT))
}

function pick(mode: ZcodeModeState['mode']): void {
  commit({ ...state.value, mode })
  open.value = false
}
function togglePlan(): void {
  commit({ ...state.value, planEnabled: !state.value.planEnabled })
}
function removePlan(): void {
  commit({ ...state.value, planEnabled: false })
}

/** 循环切换（Shift+Tab 语义）：权限三档轮转，plan 不参与（zcode cycleSessionMode 同义）。 */
function cycle(): void {
  const order: ZcodeModeState['mode'][] = ['build', 'guarded', 'yolo']
  const idx = order.indexOf(state.value.mode)
  pick(order[(idx + 1) % order.length])
}
defineExpose({ cycle })
</script>

<template>
  <span class="ide-perm">
    <button
      type="button"
      class="ide-perm__trigger"
      :class="`is-${state.mode}`"
      data-testid="ide-perm-trigger"
      :title="ZCODE_PERMISSION_MODES.find(m => m.key === state.mode)?.description"
      @click="open = !open"
      @dblclick="cycle"
    >⛨ {{ selectedLabel }}</button>
    <!-- plan 标记（zcode plan marker：开启时显示、✕ 可撤） -->
    <span v-if="state.planEnabled" class="ide-perm__plan-marker" data-testid="ide-perm-plan-marker">
      <span class="ide-perm__plan-divider" />
      <button
        type="button"
        class="ide-perm__plan-remove"
        data-testid="ide-perm-plan-remove"
        title="退出计划模式"
        @click="removePlan"
      >💡 ✕</button>
    </span>
    <div v-if="open" class="ide-perm__panel" data-testid="ide-perm-panel">
      <!-- Plan 独立勾选（zcode DropdownMenuCheckboxItem 同构） -->
      <button
        type="button"
        class="ide-perm__check"
        :class="{ 'is-on': state.planEnabled }"
        data-testid="ide-perm-plan"
        role="menuitemcheckbox"
        :aria-checked="state.planEnabled"
        @click="togglePlan"
      >
        <span class="ide-perm__checkbox">{{ state.planEnabled ? '✓' : '' }}</span>
        <span class="ide-perm__mode-text">
          <strong>💡 {{ ZCODE_PLAN.label }}</strong>
          <small>{{ ZCODE_PLAN.description }}</small>
        </span>
      </button>
      <div class="ide-perm__sep" />
      <!-- 权限三档单选（zcode DropdownMenuRadioGroup 同构） -->
      <button
        v-for="m in ZCODE_PERMISSION_MODES"
        :key="m.key"
        type="button"
        class="ide-perm__mode"
        :class="[`is-${m.key}`, { 'is-active': m.key === state.mode }]"
        :data-testid="`ide-perm-${m.key}`"
        role="menuitemradio"
        :aria-checked="m.key === state.mode"
        @click="pick(m.key)"
      >
        <span class="ide-perm__radio">{{ m.key === state.mode ? '●' : '' }}</span>
        <span class="ide-perm__mode-text">
          <strong>{{ m.label }}</strong>
          <small>{{ m.description }}</small>
        </span>
      </button>
      <div class="ide-perm__note" data-testid="ide-perm-note">生效面：任务派发/自动化（选档已穿线服务端会话档，随下次派发生效）。会话内即时切换待引擎接线。</div>
    </div>
  </span>
</template>

<style scoped lang="scss">
.ide-perm { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.ide-perm__trigger:hover { border-color: var(--primary-color); color: var(--primary-color); }
.ide-perm__trigger:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
.ide-perm__trigger {
  border: 1px solid var(--border-color); background: transparent; border-radius: 4px;
  padding: 2px 8px; cursor: pointer; font-size: 11px; color: var(--text-muted);
  // zcode 色语义：yolo=警示、guarded=蓝
  &.is-yolo { color: var(--error); border-color: color-mix(in srgb, var(--error) 35%, transparent); }
  &.is-guarded { color: var(--info); border-color: color-mix(in srgb, var(--info) 35%, transparent); }
}
.ide-perm__plan-marker { display: inline-flex; align-items: center; gap: 4px; }
.ide-perm__plan-divider { width: 1px; height: 12px; background: var(--border-color); }
.ide-perm__plan-remove {
  border: none; background: transparent; cursor: pointer; font-size: 11px;
  color: var(--text-muted); padding: 2px 4px; border-radius: 4px;
  &:hover { color: var(--primary-color); background: var(--hover-color, rgba(0,0,0,0.06)); }
}
.ide-perm__panel {
  // 面板向上开（ZCode SelectContent side:"top" 语义）。
  position: absolute; bottom: calc(100% + 4px); top: auto; left: 0; z-index: 40; min-width: 240px;
  background: var(--card-color); border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); padding: 4px;
}
.ide-perm__check, .ide-perm__mode {
  display: flex; width: 100%; text-align: left; border: none; background: transparent;
  border-radius: 4px; padding: 6px 8px; cursor: pointer; font-size: 12px; gap: 8px;
  align-items: flex-start;
}
.ide-perm__check:hover, .ide-perm__mode:hover { background: var(--hover-color, rgba(0,0,0,0.06)); }
.ide-perm__checkbox {
  width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px;
  border: 1px solid var(--border-color); border-radius: 3px;
  display: inline-flex; align-items: center; justify-content: center; font-size: 10px;
  color: var(--primary-color);
}
.ide-perm__check.is-on .ide-perm__checkbox { border-color: var(--primary-color); }
.ide-perm__radio {
  width: 14px; flex-shrink: 0; margin-top: 1px; font-size: 9px; color: var(--primary-color);
  display: inline-flex; justify-content: center;
}
.ide-perm__mode-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ide-perm__mode-text small { color: var(--text-muted); font-size: 10px; line-height: 1.4; }
.ide-perm__mode.is-active { color: var(--primary-color); }
.ide-perm__mode.is-active.is-yolo strong { color: var(--error); }
.ide-perm__mode.is-active.is-guarded strong { color: var(--info); }
.ide-perm__sep { height: 1px; background: var(--border-color); margin: 4px 6px; }
.ide-perm__note {
  padding: 6px 8px 4px; font-size: 10px; color: var(--text-muted);
  border-top: 1px dashed var(--border-color); margin-top: 4px; line-height: 1.5;
}
</style>
