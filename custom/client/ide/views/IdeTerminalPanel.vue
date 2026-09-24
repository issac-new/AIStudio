<script setup lang="ts">
// IdeTerminalPanel — IDE 底部集成终端（xterm → WS /api/hermes/terminal → node-pty）。
// 复用 CockpitTerminalPane 的连接栈与 PTY 泄漏防护（disposed 标志 + socket
// 身份守卫，2026-08-28 事故教训），差异：
//   - 打开时不自动启动工具，保持纯 shell；「启动工具」按钮按需注入
//     buildToolInitCommand（codex/claude/dsh TUI，命令映射复用 cockpit
//     terminal-tools 单一事实源）。
//   - 上游 canOpenTerminal 仅 super_admin：非 superadmin 显示禁用态不连接。
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useI18n } from 'vue-i18n'
import { getApiKey, getBaseUrlValue, isStoredSuperAdmin } from '@/api/client'
import { useTheme } from '@/composables/useTheme'
import { useIdeStore } from '../store/ide'
import {
  TERMINAL_TOOLS,
  buildToolInitCommand,
  isTerminalToolId,
  pickDefaultTool,
  type TerminalToolId,
} from '@/custom/cockpit/terminal/terminal-tools'
import { fetchTerminalTools, type TerminalToolStatus } from '@/custom/cockpit/api/terminal-tools'

const ide = useIdeStore()
const { isDark } = useTheme()
const { t } = useI18n()

const terminalRef = ref<HTMLDivElement | null>(null)
const isSuperAdmin = isStoredSuperAdmin()

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

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let initialCdSent = false
let shellName = ''
// PTY 泄漏防护：与 CockpitTerminalPane 相同的 disposed 标志 + socket 身份守卫
let disposed = false

const connected = ref(false)

// ── 工具快捷启动（codex TUI 等；默认跟随 IDE agent 底座）──

const selectedTool = ref<TerminalToolId>(
  isTerminalToolId(ide.agentId) ? ide.agentId : 'codex',
)
const toolStatuses = ref<TerminalToolStatus[]>([])

const installedToolIds = computed(() =>
  toolStatuses.value.filter((s) => s.installed).map((s) => s.id),
)

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
      suffix: knownMissing ? `（${t('ide.agentNotInstalled')}）` : '',
    }
  })
})

function onToolChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!isTerminalToolId(value) || value === selectedTool.value) return
  selectedTool.value = value
}

function launchTool() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  const command = buildToolInitCommand(selectedTool.value, ide.terminalCwd, /powershell|pwsh/i.test(shellName))
  ws.send(`${command}\r`)
}

// ── WebSocket 连接管理（与 CockpitTerminalPane 同栈）──

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

function connect() {
  if (ws || disposed) return
  initialCdSent = false

  let sock: WebSocket
  try {
    sock = new WebSocket(buildWsUrl())
  } catch (err) {
    console.error('[IdeTerminal] WebSocket creation failed:', err)
    scheduleReconnect()
    return
  }
  ws = sock

  sock.onopen = () => {
    if (ws !== sock) return
    connected.value = true
    reconnectAttempts = 0
  }

  sock.onmessage = (event) => {
    if (ws !== sock) return
    const data = typeof event.data === 'string' ? event.data : ''
    if (data.charCodeAt(0) === 0x7b) {
      try {
        handleControl(JSON.parse(data))
      } catch { /* 忽略解析错误 */ }
    } else {
      term?.write(data)
    }
  }

  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    connected.value = false
    if (!disposed) scheduleReconnect()
  }

  sock.onerror = () => {
    // onclose 会触发重连
  }
}

function scheduleReconnect() {
  if (disposed) return
  if (reconnectTimer) return
  // C5 健壮性：鉴权失效/node-pty 不可用时 WS 反复握手失败 → 无限重连永远"连接中"。
  // 上限 5 次后明示后端不可用，不再无限转圈（演示可诊断）。
  if (reconnectAttempts >= 5) {
    term?.write('\r\n\x1b[31m[终端后端不可用——已停止重连（检查登录态/node-pty）]\x1b[0m\r\n')
    return
  }
  reconnectAttempts++
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

function send(data: string | object) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(typeof data === 'string' ? data : JSON.stringify(data))
}

function handleControl(msg: { type?: string; shell?: string; exitCode?: number | string; message?: string }) {
  switch (msg.type) {
    case 'created':
      shellName = String(msg.shell ?? '')
      if (!initialCdSent) {
        initialCdSent = true
        // IDE 终端保持纯 shell：只 cd 到 workspace，不自动启动工具
        if (ide.workspace) {
          const path = ide.workspace.replace(/"/g, '\\"')
          send(/powershell|pwsh/i.test(shellName)
            ? `Set-Location "${path}"\r`
            : `cd "${path}"\r`)
        }
      }
      break
    case 'exited':
      term?.write(`\r\n\x1b[90m[process exited (code: ${msg.exitCode})]\x1b[0m\r\n`)
      break
    case 'switched':
      break
    case 'error':
      // 服务端 spawn 失败/会话上限等错误帧，此前被静默吞掉致终端空白
      term?.write(`\r\n\x1b[31m[终端错误: ${msg.message || 'unknown'}]\x1b[0m\r\n`)
      break
  }
}

function initTerminal() {
  if (!terminalRef.value) return
  disposed = false

  term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: getTheme(isDark.value),
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  term.onData((data) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(data)
  })

  term.open(terminalRef.value)

  function doFit() {
    if (!fitAddon || !term) return
    try {
      fitAddon.fit()
      send({ type: 'resize', cols: term.cols, rows: term.rows })
    } catch { /* fit 可能暂时不可用 */ }
  }
  requestAnimationFrame(() => doFit())
  setTimeout(() => doFit(), 300)

  resizeObserver = new ResizeObserver(() => doFit())
  resizeObserver.observe(terminalRef.value)

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
  // 先摘除事件处理器再 close()：close() 异步，防卸载后僵尸重连（PTY 泄漏根因）
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
  connected.value = false
}

function restartTerminal() {
  disposeTerminal()
  nextTick(initTerminal)
}

watch(isDark, () => {
  if (!term) return
  restartTerminal()
})

onMounted(async () => {
  if (!isSuperAdmin) return
  try {
    toolStatuses.value = await fetchTerminalTools()
  } catch { /* 探测失败不阻塞终端 */ }
  if (!isTerminalToolId(selectedTool.value) || !installedToolIds.value.includes(selectedTool.value)) {
    selectedTool.value = pickDefaultTool(installedToolIds.value, selectedTool.value)
  }
  nextTick(initTerminal)
})

onUnmounted(disposeTerminal)

// R4 终端 actions 执行入口（codex-product 项目级一键命令）：
// dock 监听 overlay:terminal-action 后调用本方法写入活动终端。
// ws 未就绪时静默丢弃（事件为 best-effort，用户可再点一次）。
function writeCommand(command: string): void {
  if (!command) return
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(`${command}\r`)
  }
}

defineExpose({ writeCommand })
</script>

<template>
  <div class="ide-terminal">
    <div v-if="!isSuperAdmin" class="ide-terminal__disabled">
      {{ t('ide.terminalSuperadminRequired') }}
    </div>
    <template v-else>
      <div class="ide-terminal__head">
        <span class="ide-terminal__title">{{ t('ide.terminalTitle') }}</span>
        <span class="ide-terminal__state" :class="{ 'is-on': connected }">
          {{ connected ? t('ide.terminalConnected') : t('ide.terminalConnecting') }}
        </span>
        <code class="ide-terminal__cwd">{{ ide.terminalCwd }}</code>
        <button
          type="button"
          class="ide-terminal__action ide-terminal__action--end"
          @click="restartTerminal"
        >{{ t('ide.terminalRestart') }}</button>
        <button
          type="button"
          class="ide-terminal__action"
          :title="t('ide.terminalCloseTab')"
          data-testid="ide-terminal-close"
          @click="ide.toggleSidePane()"
        >✕</button>
      </div>
      <div ref="terminalRef" class="ide-terminal__body" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.ide-terminal {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-primary, #1a1a1a);
}

.ide-terminal__disabled {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  padding: 16px;
}

.ide-terminal__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  font-size: 11px;
  background: var(--bg-secondary, #1b1e24);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  color: var(--text-primary, #e6e6e6);
}

.ide-terminal__title {
  font-weight: 600;
}

.ide-terminal__state {
  color: var(--text-muted, #9aa0aa);

  &.is-on {
    color: var(--success-color, #98c379);
  }
}

.ide-terminal__tool {
  font: inherit;
  font-size: 11px;
  color: var(--text-primary, #e6e6e6);
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 3px;
  padding: 2px 4px;
  cursor: pointer;
  max-width: 170px;
}

.ide-terminal__action {
  font: inherit;
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--text-primary, #e6e6e6);
    border-color: var(--accent-primary, #4cc9f0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ide-terminal__action--end {
  margin-left: auto;
}

.ide-terminal__cwd {
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.ide-terminal__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 2px 4px;

  :deep(.xterm) {
    height: 100%;
    padding: 2px;
  }

  :deep(.xterm-viewport) {
    overflow-y: auto;
    scrollbar-width: thin;
  }
}
</style>
