<script setup lang="ts">
// IdePermissionSwitcher — 权限模式七档循环切换器（复刻 claude-code Shift+Tab 七档
// +minimax Alt+M 六档形态；UI 复刻 R2）。数据面=permmodes（七档语义+toEngineTaskMode
// 引擎任务档映射）；当前会话档存 localStorage（会话级 v4 通道引擎未开，档位随
// 任务派发/自动化消费生效——UI 语义与未来通道就位即真控）。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

const chatStore = useChatStore()
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
const selectedLabel = computed(() => MODES.find((m) => m.key === selected.value)?.label ?? selected.value)

function pick(key: string): void {
  selected.value = key
  localStorage.setItem(storageKey(), key)
  open.value = false
}

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
    </div>
  </span>
</template>

<style scoped lang="scss">
.ide-perm { position: relative; display: inline-flex; }
.ide-perm__trigger {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  padding: 1px 8px; cursor: pointer; font-size: 11px; color: var(--text-color-3, #999);
}
.ide-perm__panel {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; min-width: 220px;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); padding: 4px;
}
.ide-perm__mode {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  border-radius: 5px; padding: 5px 8px; cursor: pointer; font-size: 12px;
}
.ide-perm__mode:hover { background: var(--hover-color, rgba(0, 0, 0, 0.06)); }
.ide-perm__mode.is-active { background: var(--hover-color, rgba(0, 0, 0, 0.1)); color: var(--primary-color, #18a058); }
.ide-perm__mode small { display: block; color: var(--text-color-3, #999); font-size: 10px; }
</style>
