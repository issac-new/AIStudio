<script setup lang="ts">
/**
 * CockpitTerminalPane — 基于 @xterm/xterm + WebSocket 的真实 PTY 终端。
 *
 * 连接 upstream swarm-studio 的 /api/hermes/terminal WebSocket 端点，
 * 在 session 创建后自动 cd 到当前任务 workspace 目录并启动所选编码工具。
 *
 * 支持三类工具（优先顺序）：Claude Code > Codex > DeepSeek Harness(dsh)。
 * 默认按优先级自动选择本机已安装的工具（GET /api/hermes/terminal-tools 探测），
 * 用户手动选择持久化到 localStorage；切换工具会重启终端会话。
 *
 * 根据服务端返回的 shell 类型自动选择命令语法：
 *   - Unix (bash/zsh) → subshell + env
 *   - Windows (PowerShell) → Set-Location + $env:
 *
 * 复用了 upstream Chat 面板中 "Workspace / Terminal" 的终端栈
 * （xterm.js → WebSocket → node-pty），但 workspace 由任务动态决定。
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { getApiKey, getBaseUrlValue } from '@/api/client'
import { useTheme } from '@/composables/useTheme'
import {
  TERMINAL_TOOLS,
  TERMINAL_TOOL_STORAGE_KEY,
  buildToolInitCommand,
  isTerminalToolId,
  pickDefaultTool,
  type TerminalToolId,
} from '@/custom/cockpit/terminal/terminal-tools'
import { fetchTerminalTools, type TerminalToolStatus } from '@/custom/cockpit/api/terminal-tools'

const store = useCockpitStore()
const { isDark } = useTheme()
const { t } = useI18n()

const terminalRef = ref<HTMLDivElement | null>(null)

// ── 终端主题：自动跟随 App 暗色/亮色模式 ──

interface XtermTheme {
  background: string; foreground: string; cursor: string; cursorAccent: string
  selectionBackground: string
  black: string; red: string; green: string; yellow: string; blue: string; magenta: string; cyan: string; white: string
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string; brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string
}

function getTheme(dark: boolean): XtermTheme {
  const style = getComputedStyle(document.documentElement)
  if (dark) {
    const bg = style.getPropertyValue('--bg-primary').trim() || '#1a1a1a'
    const fg = style.getPropertyValue('--text-primary').trim() || '#e0e0e0'
    const accent = style.getPropertyValue('--accent-primary').trim() || '#4cc9f0'
    const border = style.getPropertyValue('--border-color').trim() || '#333'
    return { background: bg, foreground: fg, cursor: accent, cursorAccent: bg, selectionBackground: `${accent}4d`, black: '#000000', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: accent, magenta: '#c678dd', cyan: '#56b6c2', white: fg, brightBlack: border, brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff' }
  }
  const bg = style.getPropertyValue('--bg-primary').trim() || '#fafafa'
  const fg = style.getPropertyValue('--text-primary').trim() || '#383a42'
  const accent = style.getPropertyValue('--accent-primary').trim() || '#526fff'
  const border = style.getPropertyValue('--border-color').trim() || '#e0e0e0'
  return { background: bg, foreground: fg, cursor: accent, cursorAccent: bg, selectionBackground: `${accent}33`, black: border, red: '#e45649', green: '#50a14f', yellow: '#c18401', blue: accent, magenta: '#a626a4', cyan: '#0184bc', white: fg, brightBlack: border, brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff' }
}

// 当前任务的 workspace 目录，回退 ~
const workspacePath = computed(() => store.selectedTask?.workspace ?? '~')

// 终端外壳配色：从 CSS 变量读取，与 App 主题一致
const chromeStyle = computed(() => {
  const style = getComputedStyle(document.documentElement)
  return {
    '--term-bg': style.getPropertyValue('--bg-primary').trim(),
    '--term-head-bg': style.getPropertyValue('--bg-secondary').trim(),
    '--term-border': style.getPropertyValue('--border-color').trim(),
    '--term-fg': style.getPropertyValue('--text-primary').trim(),
    '--term-muted': style.getPropertyValue('--text-muted').trim(),
  }
})

// ── 内部状态 ──

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let initialCdSent = false
// PTY 泄漏防护（2026-08-28 事故）：ws.close() 是异步的，close 事件在
// disposeTerminal/onUnmounted 返回之后才触发；旧实现里 onclose 无条件
// 置空共享 ws 变量并重连，导致 (a) 组件卸载 3 秒后产生无人认领的僵尸
// 连接，服务端为其自动创建的 PTY 永不释放；(b) 重启路径（主题/工具切换）
// 中旧 socket 的迟到事件误杀新连接变量，造成双活连接孤儿。
// 修复：disposed 标志 + socket 身份守卫 + dispose 时摘除事件处理器。
let disposed = false

// ── 编码工具选择（Claude Code > Codex > DeepSeek Harness）──

const selectedTool = ref<TerminalToolId>(
  isTerminalToolId(localStorage.getItem(TERMINAL_TOOL_STORAGE_KEY))
    ? (localStorage.getItem(TERMINAL_TOOL_STORAGE_KEY) as TerminalToolId)
    : 'claude-code',
)
const toolStatuses = ref<TerminalToolStatus[]>([])

const installedToolIds = computed(() =>
  toolStatuses.value.filter((s) => s.installed).map((s) => s.id),
)

// 下拉选项：探测数据可用时禁用未安装项并标注；探测失败则全部可选（回退旧行为）
const toolOptions = computed(() => {
  const probed = new Map(toolStatuses.value.map((s) => [s.id as string, s]))
  return TERMINAL_TOOLS.map((tool) => {
    const status = probed.get(tool.id)
    const knownMissing = !!status && !status.installed
    return {
      id: tool.id,
      label: tool.label,
      title: status?.path ?? tool.bin,
      disabled: knownMissing,
      suffix: knownMissing ? `（${t('cockpit.termToolNotInstalled')}）` : '',
    }
  })
})

function onToolChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!isTerminalToolId(value) || value === selectedTool.value) return
  selectedTool.value = value
  localStorage.setItem(TERMINAL_TOOL_STORAGE_KEY, value)
  // 切换工具 = 重启终端会话：旧会话中前一个工具可能正在前台运行，
  // 直接注入新命令会排队到工具退出后，不可预期。
  disposeTerminal()
  nextTick(initTerminal)
}

// ── WebSocket URL ──

function buildWsUrl(): string {
  const token = getApiKey()
  const base = getBaseUrlValue()
  const wsProtocol = base
    ? base.startsWith('https') ? 'wss:' : 'ws:'
    : location.protocol === 'https:' ? 'wss:' : 'ws:'

  if (base) {
    return `${wsProtocol}//${new URL(base).host}/api/hermes/terminal${token ? `?token=${encodeURIComponent(token)}` : ''}`
  }

  const directDevPort = import.meta.env.VITE_HERMES_DIRECT_WS_PORT as string | undefined
  const host = import.meta.env.DEV && directDevPort
    ? `${location.hostname}:${directDevPort}`
    : location.host
  return `${wsProtocol}//${host}/api/hermes/terminal${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

// ── WebSocket 连接管理 ──

function connect() {
  if (ws || disposed) return
  initialCdSent = false

  let sock: WebSocket
  try {
    sock = new WebSocket(buildWsUrl())
  } catch (err) {
    console.error('[CockpitTerminal] WebSocket creation failed:', err)
    scheduleReconnect()
    return
  }
  ws = sock

  sock.onopen = () => {
    // 连接成功，server 会自动创建首个 session 并发送 created 消息
  }

  sock.onmessage = (event) => {
    if (ws !== sock) return // 已被 dispose 接管的迟到事件
    const data = typeof event.data === 'string' ? event.data : ''
    // JSON 控制消息以 { 开头 (0x7b)
    if (data.charCodeAt(0) === 0x7b) {
      try {
        const msg = JSON.parse(data)
        handleControl(msg)
      } catch { /* 忽略解析错误 */ }
    } else {
      // PTY 原始输出 → 写入终端
      term?.write(data)
    }
  }

  sock.onclose = () => {
    if (ws !== sock) return // 旧 socket 的迟到 close：不得动新连接、不得重连
    ws = null
    if (!disposed) scheduleReconnect()
  }

  sock.onerror = () => {
    // onclose 会触发重连
  }
}

function scheduleReconnect() {
  if (disposed) return
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

function send(data: string | object) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(typeof data === 'string' ? data : JSON.stringify(data))
}

function sendRaw(data: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(data)
  }
}

// ── 控制消息处理 ──

function handleControl(msg: any) {
  switch (msg.type) {
    case 'created':
      // session 已创建，自动 cd 到任务 workspace 并启动所选编码工具
      if (!initialCdSent) {
        initialCdSent = true
        const isWin = /powershell|pwsh/i.test(msg.shell ?? '')
        sendRaw(`${buildToolInitCommand(selectedTool.value, workspacePath.value || '~', isWin)}\r`)
      }
      break
    case 'exited': {
      if (term) {
        term.write(`\r\n\x1b[90m[process exited (code: ${msg.exitCode})]\x1b[0m\r\n`)
      }
      break
    }
    case 'switched':
      // 多 session 切换（当前未使用多 session）
      break
  }
}

// ── 终端初始化 ──

function initTerminal() {
  if (!terminalRef.value) return
  disposed = false // 重启路径（主题/工具切换）：重新允许连接

  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: getTheme(isDark.value),
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  // 键盘输入 → WebSocket
  term.onData((data) => {
    sendRaw(data)
  })

  term.open(terminalRef.value)

  // 首次 fit 并同步 PTY 尺寸；延迟重试以保证布局稳定
  function doFit() {
    if (!fitAddon || !term) return
    try {
      fitAddon.fit()
      send({ type: 'resize', cols: term.cols, rows: term.rows })
    } catch { /* fit 可能暂时不可用 */ }
  }
  requestAnimationFrame(() => doFit())
  setTimeout(() => doFit(), 300)

  // 容器 resize 时自动 fit + 同步 PTY 尺寸
  resizeObserver = new ResizeObserver(() => doFit())
  resizeObserver.observe(terminalRef.value)

  // 连接后端 PTY
  connect()
}

function disposeTerminal() {
  disposed = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  // 先摘除事件处理器再 close()：close() 异步，事件在函数返回后才触发，
  // 留着 handler 会在卸载后触发僵尸重连（PTY 泄漏根因）。
  const sock = ws
  ws = null
  if (sock) {
    sock.onopen = null
    sock.onmessage = null
    sock.onclose = null
    sock.onerror = null
    try { sock.close() } catch { /* 已在关闭中 */ }
  }
  term?.dispose()
  term = null
  fitAddon = null
}

// App 主题切换时重建终端
watch(isDark, () => {
  if (!term) return
  disposeTerminal()
  nextTick(initTerminal)
})

onMounted(async () => {
  // 先探测本机可用工具再开终端，保证首个 session 就启动正确的工具；
  // 探测失败（旧服务端/网络错误）保持回退 claude-code，全部选项可选。
  try {
    toolStatuses.value = await fetchTerminalTools()
  } catch { /* 探测失败不阻塞终端 */ }
  selectedTool.value = pickDefaultTool(installedToolIds.value, localStorage.getItem(TERMINAL_TOOL_STORAGE_KEY))
  nextTick(initTerminal)
})

onUnmounted(disposeTerminal)
</script>

<template>
  <div class="cockpit-terminal-pane" :style="chromeStyle">
    <div class="cockpit-terminal-pane__head" :style="chromeStyle">
      <span class="cockpit-terminal-pane__title">⌘ {{ t('cockpit.modeTerm') }}</span>
      <select
        class="cockpit-terminal-pane__tool"
        data-action="tool-select"
        :value="selectedTool"
        :title="t('cockpit.termTool')"
        @change="onToolChange"
      >
        <option
          v-for="opt in toolOptions"
          :key="opt.id"
          :value="opt.id"
          :disabled="opt.disabled"
          :title="opt.title"
        >{{ opt.label }}{{ opt.suffix }}</option>
      </select>
      <code class="cockpit-terminal-pane__root">{{ workspacePath }}</code>
      <button
        type="button"
        data-action="exit"
        class="cockpit-terminal-pane__exit"
        @click="store.exitTerminal()"
      >✕ {{ t('cockpit.termExit') }}</button>
    </div>
    <div ref="terminalRef" class="cockpit-terminal-pane__body" />
  </div>
</template>

<style scoped lang="scss">
.cockpit-terminal-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--term-bg, #1a1a2e);
}
.cockpit-terminal-pane__head {
  flex-shrink: 0;
  padding: 8px 14px;
  background: var(--term-head-bg, #0d0d0d);
  border-bottom: 1px solid var(--term-border, #333);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--term-fg, #ccc);
  z-index: 1;
}
.cockpit-terminal-pane__title {
  color: var(--term-fg, #e0e0e0);
  font-weight: 600;
}
.cockpit-terminal-pane__tool {
  font: inherit;
  font-size: 11px;
  color: var(--term-fg, #e0e0e0);
  background: var(--term-head-bg, #1a1a1a);
  border: 1px solid var(--term-border, #333);
  border-radius: 3px;
  padding: 2px 4px;
  cursor: pointer;
  max-width: 170px;
  &:focus {
    outline: 1px solid var(--term-border, #555);
  }
}
.cockpit-terminal-pane__root {
  font-size: 11px;
  color: var(--term-muted, #888);
  background: var(--term-head-bg, #1a1a1a);
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid var(--term-border, #333);
}
.cockpit-terminal-pane__exit {
  margin-left: auto;
  cursor: pointer;
  color: var(--term-muted, #888);
  font-size: 11px;
  border: none;
  background: transparent;
  font: inherit;
  &:hover { color: var(--term-fg, #fff); }
}
.cockpit-terminal-pane__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 4px;
}
.cockpit-terminal-pane__body :deep(.xterm) {
  height: 100%;
  padding: 4px;
}
.cockpit-terminal-pane__body :deep(.xterm-viewport) {
  overflow-y: auto;
  scrollbar-width: thin;
}
</style>
