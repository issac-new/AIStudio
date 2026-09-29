<script setup lang="ts">
// IdeKeymapCard — 快捷键管理卡（吸收第一批 C2，codex keymap 12 上下文可重映射）。
// v1 诚实分版：session 上下文三键（submit/newline/interrupt）真实生效——挂载后
// ChatInput 键行为经 keyBindingFor 查询（经 localStorage 覆盖+冲突检测）；
// 其余上下文先展示+冲突检测（生效面记档 v2 逐上下文接）。
// 映射=server/keymap/keymap.ts（applyKeymap/defaultKeymap，纯函数跨引）。
import { computed, ref } from 'vue'
import { defaultKeymap, applyKeymap, type KeyBinding, type KeymapConflict } from '../../../server/keymap/keymap'

const open = ref(false)
const recording = ref<string | null>(null)

const OVERRIDES_KEY = 'ide_keymap_overrides_v1'
function loadOverrides(): KeyBinding[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}
const overrides = ref<KeyBinding[]>(loadOverrides())

const applied = computed(() => applyKeymap(defaultKeymap(), overrides.value))
const conflicts = computed<KeymapConflict[]>(() => applied.value.conflicts)

const CONTEXT_LABELS: Record<string, string> = { session: '会话', editor: '编辑器' }
const ACTION_LABELS: Record<string, string> = {
  submit: '发送', newline: '换行', interrupt: '中断', save: '保存', format: '格式化',
}

function bindingOf(context: string, action: string): KeyBinding | undefined {
  return applied.value.bindings.find((b) => b.context === context && b.action === action)
}

/** 录制改键：下一次按键写入覆盖。 */
function startRecord(context: string, action: string): void {
  recording.value = `${context}::${action}`
}
function onRecordKey(ev: KeyboardEvent): void {
  if (!recording.value) return
  ev.preventDefault()
  const [context, action] = recording.value.split('::')
  const parts: string[] = []
  if (ev.metaKey) parts.push('Cmd')
  if (ev.ctrlKey) parts.push('Ctrl')
  if (ev.shiftKey) parts.push('Shift')
  if (ev.altKey) parts.push('Alt')
  const key = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key
  parts.push(key)
  const combo = parts.join('+')
  if (['Shift', 'Control', 'Alt', 'Meta', 'Cmd'].includes(key)) return  // 仅修饰键不落
  const rest = overrides.value.filter((o) => !(o.context === context && o.action === action))
  const next = [...rest, { context, action, key: combo }]
  overrides.value = next
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next))
  recording.value = null
}

function resetAll(): void {
  overrides.value = []
  localStorage.removeItem(OVERRIDES_KEY)
}
</script>

<script lang="ts">
// 生效查询面导出（模块级，供输入处理复用——SFC 双 script 保持 export）。
export function useKeyBinding(context: string, action: string): () => string {
  return () => {
    try {
      const raw = JSON.parse(localStorage.getItem('ide_keymap_overrides_v1') ?? '[]') as KeyBinding[]
      const applied = applyKeymap(defaultKeymap(), Array.isArray(raw) ? raw : [])
      return applied.bindings.find((b) => b.context === context && b.action === action)?.key ?? ''
    } catch { return '' }
  }
}
</script>

<template>
  <span class="ide-keymap">
    <button type="button" class="ide-keymap__btn" title="快捷键管理" data-testid="ide-keymap-open" @click="open = !open">⌘</button>
    <div v-if="open" class="ide-keymap__card" data-testid="ide-keymap-card" @keydown="onRecordKey">
      <div class="ide-keymap__head">
        快捷键
        <button type="button" class="ide-keymap__reset" data-testid="ide-keymap-reset" @click="resetAll">重置</button>
      </div>
      <div v-if="conflicts.length" class="ide-keymap__conflicts" data-testid="ide-keymap-conflicts">
        <div v-for="c in conflicts" :key="`${c.context}-${c.key}`">⚠ {{ CONTEXT_LABELS[c.context] ?? c.context }} {{ c.key }}：{{ c.actions.map((a) => ACTION_LABELS[a] ?? a).join(' / ') }}</div>
      </div>
      <div v-for="b in applied.bindings" :key="`${b.context}-${b.action}`" class="ide-keymap__row" :data-testid="`ide-keymap-${b.context}-${b.action}`">
        <span class="ide-keymap__label">{{ CONTEXT_LABELS[b.context] ?? b.context }} · {{ ACTION_LABELS[b.action] ?? b.action }}</span>
        <button
          type="button" class="ide-keymap__key"
          :class="{ 'is-recording': recording === `${b.context}::${b.action}` }"
          :title="recording === `${b.context}::${b.action}` ? '按下新键' : '点击改键'"
          @click="startRecord(b.context, b.action)"
        >{{ recording === `${b.context}::${b.action}` ? '录制中…' : b.key }}</button>
      </div>
      <p class="ide-keymap__note">v1 生效面：会话三键（发送/换行/中断）；其余上下文展示+冲突检测（v2 逐上下文接）。</p>
    </div>
  </span>
</template>

<style scoped lang="scss">
.ide-keymap { position: relative; }
.ide-keymap__btn {
  border: none; background: transparent; cursor: pointer; font-size: 12px;
  color: var(--text-color-3, #999); padding: 0 4px; &:hover { color: var(--text-color-1, #333); }
}
.ide-keymap__card {
  position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 80;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px; padding: 8px 10px; min-width: 240px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}
.ide-keymap__head { font-weight: 600; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.ide-keymap__reset { border: none; background: transparent; color: var(--primary-color, #18a058); cursor: pointer; font-size: 11px; }
.ide-keymap__conflicts { color: var(--warning-color, #f0a020); font-size: 11px; margin-bottom: 4px; }
.ide-keymap__row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
.ide-keymap__label { color: var(--text-color-2, #555); }
.ide-keymap__key {
  border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px; background: transparent;
  font-family: ui-monospace, monospace; font-size: 11px; padding: 1px 8px; cursor: pointer; min-width: 60px;
  color: var(--text-color-1, #333);
  &.is-recording { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
}
.ide-keymap__note { color: var(--text-color-3, #999); font-size: 10px; margin: 6px 0 0; line-height: 1.5; }
</style>
