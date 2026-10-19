<!-- overlay/custom/client/ide/components/IdeDevTools.vue -->
<!-- 编程工具启动器（2026-10-19 用户需求批）：IDE 工作区状态栏常驻「工具」入口，
     弹出白名单工具（zcode/VS Code/iTerm/Warp/终端/IDEA；Windows 增 PowerShell/
     cmd）——可用性来自服务端探测，未安装置灰；「在工作区打开终端并运行 zcode」
     带当前工作区根目录。点击即启动本机应用（服务端 open -a 白名单，无任意命令）。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { fetchDevtools, launchDevtool, type DevToolInfo } from '../api/devtools'
import { showToast } from '../utils/toast'

const { root } = useIdeWorkspace()
const open = ref(false)
const tools = ref<DevToolInfo[]>([])
const loadError = ref('')
const busy = ref('')

async function load(): Promise<void> {
  if (tools.value.length || loadError.value) return
  try { tools.value = await fetchDevtools() }
  catch (e) { loadError.value = (e as Error).message }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void load()
}

async function launch(tool: string, cwd?: string): Promise<void> {
  busy.value = tool
  try {
    await launchDevtool(tool, cwd)
    showToast(`已启动：${labelOf(tool)}`, 'info')
    open.value = false
  } catch (e) {
    showToast((e as Error).message, 'error')
  } finally {
    busy.value = ''
  }
}

function labelOf(key: string): string {
  return tools.value.find(t => t.key === key)?.labelZh ?? key
}

/** 工作区短名（末两层），完整路径进 title。 */
const rootShort = computed(() => {
  const parts = (root.value || '').split('/').filter(Boolean)
  return parts.slice(-2).join('/') || '（未选工作区）'
})

function onDocPointerDown(e: MouseEvent): void {
  if (!open.value) return
  const el = document.querySelector('.ide-devtools')
  if (el && !el.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<template>
  <span class="ide-devtools" data-testid="ide-devtools">
    <button
      type="button"
      class="ide-devtools__btn"
      :class="{ 'is-open': open }"
      data-testid="ide-devtools-toggle"
      title="打开本机编程工具（zcode / VS Code / 终端等）"
      @click="toggle"
    >🖥 工具 ▾</button>

    <div v-if="open" class="ide-devtools__panel" data-testid="ide-devtools-panel">
      <div class="ide-devtools__head">
        <span>本机编程工具</span>
        <button type="button" class="ide-devtools__close" aria-label="关闭" @click="open = false">✕</button>
      </div>
      <p v-if="loadError" class="ide-devtools__err">{{ loadError }}</p>
      <template v-else>
        <button
          class="ide-devtools__launch ide-devtools__launch--primary"
          type="button"
          data-testid="ide-devtools-terminal-zcode"
          :disabled="busy === 'terminal-zcode'"
          :title="root ? `在终端打开 ${root} 并运行 zcode` : '未选择工作区时打开主目录'"
          @click="launch('terminal-zcode', root || undefined)"
        >▶ 在工作区终端运行 zcode<span v-if="root" class="ide-devtools__cwd">（{{ rootShort }}）</span></button>
        <div class="ide-devtools__grid">
          <button
            v-for="t in tools"
            :key="t.key"
            type="button"
            class="ide-devtools__tool"
            :class="{ 'is-off': !t.available }"
            :data-testid="`ide-devtools-${t.key}`"
            :disabled="!t.available || busy === t.key"
            :title="t.available ? `打开 ${t.labelZh}` : `${t.labelZh} 未安装`"
            @click="launch(t.key, t.key === 'vscode' ? (root || undefined) : undefined)"
          >{{ t.labelZh }}</button>
        </div>
        <p class="ide-devtools__hint">工具列表由服务端按本机安装情况探测；VS Code 会直接打开当前工作区。</p>
      </template>
    </div>
  </span>
</template>

<style scoped lang="scss">
.ide-devtools { position: relative; display: inline-flex; }
.ide-devtools__btn {
  border: none; background: none; color: var(--text-secondary);
  font-size: 11px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  &:hover, &.is-open { color: var(--text-primary); background: var(--hover-bg); }
}
.ide-devtools__panel {
  position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 60;
  width: 300px; padding: 8px 10px 10px;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.ide-devtools__head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;
}
.ide-devtools__close { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 11px; }
.ide-devtools__err { margin: 4px 0; font-size: 11px; color: var(--error, #d33); }
.ide-devtools__launch {
  width: 100%; display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: transparent; color: var(--text-primary);
  font-size: 12px; padding: 6px 8px; cursor: pointer; margin-bottom: 8px;
  &:hover:not(:disabled) { border-color: var(--accent-info); }
  &:disabled { opacity: .5; }
}
.ide-devtools__launch--primary { border-color: var(--accent-info); color: var(--accent-info); }
.ide-devtools__cwd { font-size: 10px; color: var(--text-muted); }
.ide-devtools__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.ide-devtools__tool {
  border: 1px solid var(--border-color); border-radius: 6px;
  background: transparent; color: var(--text-primary);
  font-size: 11.5px; padding: 5px 4px; cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--accent-info); }
  &.is-off, &:disabled { opacity: .38; cursor: not-allowed; }
}
.ide-devtools__hint { margin: 8px 0 0; font-size: 10px; color: var(--text-muted); }
</style>
