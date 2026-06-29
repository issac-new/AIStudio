<script setup lang="ts">
/**
 * CockpitTerminalPane — 基于 @xterm/xterm + WebSocket 的真实 PTY 终端。
 *
 * 连接 upstream swarm-studio 的 /api/hermes/terminal WebSocket 端点，
 * 在 session 创建后自动 cd 到当前任务 workspace 目录并启动 Claude Code agent。
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
  if (ws) return
  initialCdSent = false

  try {
    ws = new WebSocket(buildWsUrl())
  } catch (err) {
    console.error('[CockpitTerminal] WebSocket creation failed:', err)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    // 连接成功，server 会自动创建首个 session 并发送 created 消息
  }

  ws.onmessage = (event) => {
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

  ws.onclose = () => {
    ws = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose 会触发重连
  }
}

function scheduleReconnect() {
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
      // session 已创建，自动 cd 到任务 workspace 并启动 Claude Code agent
      if (!initialCdSent) {
        initialCdSent = true
        const wsPath = workspacePath.value || '~'
        const isWin = /powershell|pwsh/i.test(msg.shell ?? '')
        const escapedPath = wsPath.replace(/"/g, '\\"')
        const claudeArgs = `agents --dangerously-skip-permissions --effort max`

        let initCmd: string
        if (isWin) {
          // Windows / PowerShell
          initCmd = [
            `Set-Location "${escapedPath}"`,
            `$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`,
            `claude ${claudeArgs}`,
          ].join('; ')
        } else {
          // Unix / bash / zsh
          initCmd = `(cd "${escapedPath}" && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude ${claudeArgs})`
        }

        sendRaw(`${initCmd}\r`)
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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  ws?.close()
  ws = null
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

onMounted(() => {
  nextTick(initTerminal)
})

onUnmounted(disposeTerminal)
</script>

<template>
  <div class="cockpit-terminal-pane" :style="chromeStyle">
    <div class="cockpit-terminal-pane__head" :style="chromeStyle">
      <span class="cockpit-terminal-pane__title">⌘ {{ t('cockpit.modeTerm') }}</span>
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
