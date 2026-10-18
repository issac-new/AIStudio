<script setup lang="ts">
// IdePermissionSwitcher — 权限模式七档循环切换器（复刻 claude-code Shift+Tab 七档
// +minimax Alt+M 六档形态；UI 复刻 R2）。数据面=permmodes（七档语义+toEngineTaskMode
// 引擎任务档映射）；当前会话档存 localStorage。
// A2 诚实化（2026-09-29）：面板底部常显生效面说明——档位当前随任务派发/自动化消费，
// 会话内即时切换需引擎通道。通道锚点已查实：zcode v4 sendText payload 支持
// mode: submissionModeSchema（build/edit/plan/yolo，command.ts:99），接线列独立轮
// （需 /ide 发送链从 hermes 通道切/并到 engine sendText）。
// 2026-10-18 ZCode 对齐批：控件迁输入区 composer 工具条（面板改向上开）；
// 选档除 localStorage 外穿线服务端会话档 REST（/api/hermes/permmodes/session-mode，
// session-mode-controller.ts——落盘后随任务派发 createSession.config.mode 生效）。
// 同批 bee7c5e4：与 composer 设置菜单（IdeChatPane）同 localStorage 键+事件双向同步。
import { computed, onUnmounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { authFetch } from '../utils/auth-fetch'

const chatStore = useChatStore()
const ide = useIdeStore()
const open = ref(false)

const MODES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'readonly', label: '只读', hint: 'read only — 仅查看（plan 档同义）' },
  { key: 'plan', label: '计划', hint: 'plan — 只规划不执行' },
  { key: 'default', label: '标准', hint: 'default — 写免审、执行需批（engine: edit）' },
  { key: 'acceptEdits', label: '自动编辑', hint: 'acceptEdits — 编辑免审（engine: autoEdit）' },
  { key: 'dontAsk', label: '少问', hint: 'dontAsk — 执行免审（engine: auto）' },
  { key: 'auto', label: '全自动', hint: 'auto — 全免审' },
  { key: 'bypassPermissions', label: '绕过', hint: 'bypassPermissions — 最高信任（engine: yolo）' },
]

const KEY = 'ide-permission-mode:'
function storageKey(): string { return KEY + (chatStore.activeSessionId ?? 'default') }

function current(): string {
  return localStorage.getItem(storageKey()) || 'default'
}

const selected = ref(current())
// 会话切换跟随本会话档（localStorage 为 UI 即时态；服务端档经 REST 同步）。
watch(() => chatStore.activeSessionId, (sid, prev) => {
  if (sid !== prev) selected.value = current()
})
const selectedLabel = computed(() => MODES.find((m) => m.key === selected.value)?.label ?? selected.value)

// 服务端会话档穿线（2026-10-18）：profile=ide.agentId；失败 fail-soft（本地档仍
// 随派发面消费，面板注如实说明双面）。agentId 缺席（测试桩/未就绪）跳过不发。
async function pushServerMode(key: string): Promise<void> {
  const agentId = (ide as { agentId?: string }).agentId
  if (!agentId) return
  try {
    await authFetch(`/api/hermes/permmodes/session-mode/${encodeURIComponent(agentId)}`, {
      method: 'PUT',
      body: JSON.stringify({ mode: key }),
    })
  } catch { /* fail-soft：服务端不可达时保留本地档（派发面退本地） */ }
}

function pick(key: string): void {
  selected.value = key
  localStorage.setItem(storageKey(), key)
  void pushServerMode(key)
  open.value = false
}

// composer 设置菜单（IdeChatPane）写同一 localStorage 键后广播；本触发器与菜单
// 互为同一事实源的两个入口，监听刷新保持显示一致。会话切换同理重读。
const PERM_MODE_EVENT = 'ide-perm-mode-changed'
function resync(): void { selected.value = current() }
if (typeof window !== 'undefined') {
  window.addEventListener(PERM_MODE_EVENT, resync)
  window.addEventListener('storage', resync)
  onUnmounted(() => {
    window.removeEventListener(PERM_MODE_EVENT, resync)
    window.removeEventListener('storage', resync)
  })
}
watch(() => chatStore.activeSessionId, resync)

/** 循环切换（Shift+Tab 语义）。 */
function cycle(): void {
  const idx = MODES.findIndex((m) => m.key === selected.value)
  pick(MODES[(idx + 1) % MODES.length].key)
}
defineExpose({ cycle })
</script>

<template>
  <span class="ide-perm">
    <button
      type="button"
      class="ide-perm__trigger"
      data-testid="ide-perm-trigger"
      :title="MODES.find((m) => m.key === selected)?.hint"
      @click="open = !open"
      @dblclick="cycle"
    >⛨ {{ selectedLabel }}</button>
    <div v-if="open" class="ide-perm__panel" data-testid="ide-perm-panel">
      <button
        v-for="m in MODES"
        :key="m.key"
        type="button"
        class="ide-perm__mode"
        :class="{ 'is-active': m.key === selected }"
        :data-testid="`ide-perm-${m.key}`"
        :title="m.hint"
        @click="pick(m.key)"
      >{{ m.label }}<small>{{ m.hint }}</small></button>
      <div class="ide-perm__note" data-testid="ide-perm-note">生效面：任务派发/自动化（选档已穿线服务端会话档，随下次派发生效）。会话内即时切换待引擎接线（v4 sendText mode 已查实，见组件头注）。</div>
    </div>
  </span>
</template>

<style scoped lang="scss">
.ide-perm { position: relative; display: inline-flex; }
.ide-perm__trigger:hover { border-color: var(--primary-color); color: var(--primary-color); }
.ide-perm__trigger:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
.ide-perm__trigger {
  border: 1px solid var(--border-color); background: transparent; border-radius: 4px;
  padding: 2px 8px; cursor: pointer; font-size: 11px; color: var(--text-muted);
}
.ide-perm__panel {
  // 2026-10-18 迁 composer 工具条：控件贴屏底，面板改向上开（ZCode 同位
  // SelectContent side:"top" 语义）。
  position: absolute; bottom: calc(100% + 4px); top: auto; left: 0; z-index: 40; min-width: 220px;
  background: var(--card-color); border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); padding: 4px;
}
.ide-perm__mode {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px;
}
.ide-perm__mode:hover { background: var(--hover-color, rgba(0, 0, 0, 0.06)); }
.ide-perm__mode.is-active { background: var(--hover-color, rgba(0, 0, 0, 0.1)); color: var(--primary-color); }
.ide-perm__mode small { display: block; color: var(--text-muted); font-size: 10px; }
.ide-perm__note {
  padding: 6px 8px 4px; font-size: 10px; color: var(--text-muted);
  border-top: 1px dashed var(--border-color); margin-top: 4px; line-height: 1.5;
}
</style>
