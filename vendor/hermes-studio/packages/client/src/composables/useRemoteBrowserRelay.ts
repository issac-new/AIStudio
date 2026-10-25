import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { getActiveProfileName, getApiKey, getBaseUrlValue } from '@/api/client'
import { onAuthInvalidated } from '@/api/auth-invalidation'
import { socketEndpoint } from '@/utils/deployment-url'
import { desktopBridge } from '@/utils/desktop-bridge'

// One desktop capability per main renderer; survives panel collapse, not logout.
export const remoteBrowserEnabled = ref(false)
export const remoteBrowserOwnerState = ref<'active' | 'standby' | 'busy' | 'connecting'>('connecting')
let stopActivity: (() => void) | null = null
let generation = 0
let socket: Socket | null = null
let stopAuth: (() => void) | null = null
let cancelConnection: (() => void) | null = null

export async function stopRemoteBrowserRelay(): Promise<void> {
  generation++
  remoteBrowserEnabled.value = false
  remoteBrowserOwnerState.value = 'connecting'
  stopActivity?.(); stopActivity = null
  cancelConnection?.(); cancelConnection = null
  const previous = socket
  socket = null
  previous?.removeAllListeners()
  previous?.disconnect()
  stopAuth?.(); stopAuth = null
  await desktopBridge()?.browser?.setRemoteControl?.(false)
}

export async function startRemoteBrowserRelay(): Promise<void> {
  await stopRemoteBrowserRelay()
  const startedGeneration = generation
  const bridge = desktopBridge()
  if (!bridge?.remoteMode || !bridge.browser?.remoteRequest || !getApiKey()) throw new Error('Remote Desktop browser requires a Studio login and updated Desktop client')
  if (!await bridge.browser.setRemoteControl?.(true)) return
  if (generation !== startedGeneration) { await bridge.browser.setRemoteControl?.(false); return }
  const endpoint = socketEndpoint(getBaseUrlValue(), '/desktop-browser')
  const connection = io(endpoint.url, {
    path: endpoint.path, auth: { token: getApiKey(), profile: getActiveProfileName() || 'default' },
    transports: ['websocket'], reconnection: false, timeout: 300_000,
  })
  socket = connection
  let lastActivity = -Infinity
  const reportActivity = (event: Event) => {
    if (!event.isTrusted || document.visibilityState !== 'visible' || !connection.connected) return
    const now = performance.now()
    if (now - lastActivity < 1000) return
    lastActivity = now
    connection.emit('browser.user-activity')
  }
  // Capture real input, not focus/visibility, timers or synthetic Agent events.
  const activityEvents = ['pointerdown', 'keydown', 'wheel'] as const
  for (const event of activityEvents) window.addEventListener(event, reportActivity, { capture: true, passive: true })
  stopActivity = () => { for (const event of activityEvents) window.removeEventListener(event, reportActivity, true) }
  connection.on('browser.owner-state', state => {
    if (socket === connection && ['active', 'standby', 'busy'].includes(state)) remoteBrowserOwnerState.value = state
  })
  stopAuth = onAuthInvalidated(() => { void stopRemoteBrowserRelay() })
  connection.on('browser.request', async (body, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    try {
      if (socket !== connection || !remoteBrowserEnabled.value) throw new Error('Desktop browser relay revoked')
      const envelope = await bridge.browser!.remoteRequest!(body)
      acknowledge({ envelope })
    } catch (error) { acknowledge({ error: error instanceof Error ? error.message : 'Desktop browser request failed' }) }
  })
  const stop = () => { if (socket === connection) void stopRemoteBrowserRelay() }
  connection.on('disconnect', stop)
  connection.on('browser.revoked', stop)
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: (() => void) | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      cancel = () => reject(new Error('Desktop browser connection was cancelled'))
      cancelConnection = cancel
      connection.on('connect', () => resolve())
      connection.on('connect_error', error => {
        reject(error)
        stop()
      })
      timer = setTimeout(() => {
        reject(new Error('Desktop browser connection timed out'))
        stop()
      }, 300_000)
      if (connection.connected) resolve()
    })
    if (socket !== connection || generation !== startedGeneration) throw new Error('Desktop browser connection was cancelled')
    remoteBrowserEnabled.value = true
  } catch (error) {
    if (socket === connection) await stopRemoteBrowserRelay()
    throw error
  } finally {
    clearTimeout(timer)
    if (cancelConnection === cancel) cancelConnection = null
  }
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => { void stopRemoteBrowserRelay() })
