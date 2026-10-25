import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopUpdateState } from '../main/updater-types'
import type { DesktopRemoteDevicesState } from '../main/remote-devices'
import type { ComputerUsePermission, ComputerUsePermissions } from '../main/computer-use-permissions'
import type { MessageSelectionContextMenuRequest } from '../main/selection-context-menu'
import type { ScreenshotShortcutConfig, ScreenshotShortcutState } from '../main/screenshot-shortcut'
import type { BrowserBounds, BrowserProfileCreateInput, BrowserProfileSwitchImpact, BrowserProfileUpdateInput, BrowserSelection, DesktopBrowserProfile, DesktopBrowserState, DesktopBrowserTab } from '../main/browser/browser-types'

type DesktopWindowKind = 'main' | 'pet' | 'chat'

function desktopWindowKind(): DesktopWindowKind {
  const arg = process.argv.find(item => item.startsWith('--hermes-window-kind='))
  const kind = arg?.slice('--hermes-window-kind='.length)
  return kind === 'pet' || kind === 'chat' ? kind : 'main'
}

// Set by the main process when the desktop points at a remote Web UI
// deployment instead of the bundled local server.
const REMOTE_SERVER_MODE = process.argv.includes('--hermes-remote-mode')

contextBridge.exposeInMainWorld('hermesDesktop', {
  ...(desktopWindowKind() === 'main' ? { remoteDevices: {
    list: (): Promise<DesktopRemoteDevicesState> => ipcRenderer.invoke('hermes-desktop:remote-devices-list'),
    add: (input: { name: string; serverUrl: string }): Promise<DesktopRemoteDevicesState> => ipcRenderer.invoke('hermes-desktop:remote-devices-add', input),
    remove: (id: string): Promise<DesktopRemoteDevicesState> => ipcRenderer.invoke('hermes-desktop:remote-devices-remove', id),
    switchTo: (id: string | null): Promise<void> => ipcRenderer.invoke('hermes-desktop:remote-devices-switch', id),
    returnLocal: (): Promise<void> => ipcRenderer.invoke('hermes-desktop:remote-devices-return-local'),
  } } : {}),
  ...(!REMOTE_SERVER_MODE && process.platform === 'darwin' ? { computerUsePermissions: {
    claimReminder: (): Promise<ComputerUsePermissions | null> => ipcRenderer.invoke('hermes-desktop:computer-use-claim-reminder'),
    getStatus: (): Promise<ComputerUsePermissions> => ipcRenderer.invoke('hermes-desktop:computer-use-permissions'),
    request: (permission: ComputerUsePermission): Promise<void> => ipcRenderer.invoke('hermes-desktop:computer-use-request-permission', permission),
  } } : {}),
  messageContextMenu: {
    show: (request: MessageSelectionContextMenuRequest): Promise<'select-messages' | null> => ipcRenderer.invoke('hermes-desktop:message-context-menu-show', request),
    close: (): Promise<void> => ipcRenderer.invoke('hermes-desktop:message-context-menu-close'),
  },
  screenshot: {
    shortcut: {
      getState: (): Promise<ScreenshotShortcutState> => ipcRenderer.invoke('hermes-desktop:screenshot-shortcut-get'),
      save: (config: ScreenshotShortcutConfig): Promise<ScreenshotShortcutState> => ipcRenderer.invoke('hermes-desktop:screenshot-shortcut-save', config),
      setTarget: (targetId: string, active: boolean | null): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:screenshot-shortcut-target', targetId, active),
      setEditing: (targetId: string, editing: boolean): Promise<ScreenshotShortcutState> => ipcRenderer.invoke('hermes-desktop:screenshot-shortcut-editing', targetId, editing),
      onTrigger: (callback: (request: { targetId: string; hideWindows: boolean }) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, request: { targetId: string; hideWindows: boolean }) => callback(request)
        ipcRenderer.on('hermes-desktop:screenshot-shortcut-trigger', listener)
        return () => ipcRenderer.removeListener('hermes-desktop:screenshot-shortcut-trigger', listener)
      },
      onStateChange: (callback: (state: ScreenshotShortcutState) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: ScreenshotShortcutState) => callback(state)
        ipcRenderer.on('hermes-desktop:screenshot-shortcut-state', listener)
        return () => ipcRenderer.removeListener('hermes-desktop:screenshot-shortcut-state', listener)
      },
    },
    getCapabilities: () => ipcRenderer.invoke('hermes-desktop:screenshot-capabilities'),
    captureRegion: (request: { requestId: string; hideWindows?: boolean; labels: { hint: string; confirm: string; cancel: string; reset: string; tools?: Record<string, string> } }) => ipcRenderer.invoke('hermes-desktop:screenshot-capture-region', request),
    cancel: (requestId: string) => ipcRenderer.invoke('hermes-desktop:screenshot-cancel', requestId),
  },
  updater: {
    getState: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('hermes-desktop:update-get-state'),
    cancel: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('hermes-desktop:update-cancel'),
    download: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('hermes-desktop:update-download'),
    install: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('hermes-desktop:update-install'),
    onStateChange: (callback: (state: DesktopUpdateState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => callback(state)
      ipcRenderer.on('hermes-desktop:update-state-change', listener)
      return () => ipcRenderer.removeListener('hermes-desktop:update-state-change', listener)
    },
  },
  getToken: (): Promise<string> => ipcRenderer.invoke('hermes-desktop:get-token'),
  // HERMES_CUSTOM[SecNoDefaultCred]: 主进程代理登录（口令不出主进程；空库首启自动随机建号）
  desktopLogin: (): Promise<string> => ipcRenderer.invoke('hermes-desktop:login'),
  retryBootstrap: (source?: 'cf' | 'github'): Promise<void> => ipcRenderer.invoke('hermes-desktop:retry-bootstrap', source),
  ...(!REMOTE_SERVER_MODE ? {
    restartApp: (): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:restart-app'),
    selectRuntimeDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('hermes-desktop:select-runtime-directory', defaultPath),
  } : {}),
  notifyCompletion: (payload: { title: string; body?: string; icon?: string; tag?: string; clickUrl?: string }): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:notify-completion', payload),
  openExternalUrl: (url: string): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:open-external-url', url),
  openChatWindow: (sessionId: string, profile?: string): Promise<void> => ipcRenderer.invoke('hermes-desktop:open-chat-window', sessionId, profile),
  // overlay[wm]: 驾驶舱操作页弹出独立窗口（routePath 含 standalone=1 query）
  openPanelWindow: (routePath: string, size?: { width?: number; height?: number }): Promise<void> => ipcRenderer.invoke('hermes-desktop:open-panel-window', routePath, size),
  ensureAuth: async (): Promise<boolean> => {
    if (!REMOTE_SERVER_MODE) {
      const token = await ipcRenderer.invoke('hermes-desktop:get-token')
      if (token) {
        try { localStorage.setItem('AUTH_TOKEN', token) } catch { /* */ }
      }
    }
    return !!localStorage.getItem(API_KEY_LS)
  },
  getWindowState: (): Promise<{ isMaximized: boolean }> => ipcRenderer.invoke('hermes-desktop:get-window-state'),
  windowControl: (action: 'minimize' | 'toggle-maximize' | 'close'): Promise<{ isMaximized: boolean }> => ipcRenderer.invoke('hermes-desktop:window-control', action),
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) => callback(state)
    ipcRenderer.on('hermes-desktop:window-state-change', listener)
    return () => ipcRenderer.removeListener('hermes-desktop:window-state-change', listener)
  },
  getPetWindowState: () => ipcRenderer.invoke('hermes-desktop:get-pet-window-state'),
  setPetWindowBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('hermes-desktop:set-pet-window-bounds', bounds),
  setPetWindowVisible: (visible: boolean) => ipcRenderer.invoke('hermes-desktop:set-pet-window-visible', visible),
  onPetWindowRefresh: (callback: () => void): (() => void) => {
    const listener = () => callback()
    ipcRenderer.on('hermes-desktop:pet-window-refresh', listener)
    return () => ipcRenderer.removeListener('hermes-desktop:pet-window-refresh', listener)
  },
  ...(desktopWindowKind() === 'main' ? { browser: {
    setRemoteControl: (enable: boolean): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:browser-remote-control', enable),
    remoteRequest: (body: Record<string, unknown>): Promise<unknown> => ipcRenderer.invoke('hermes-desktop:browser-remote-request', body),
    getState: (): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-get-state'),
    setViewport: (bounds: BrowserBounds, visible: boolean): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-set-viewport', bounds, visible),
    createTab: (url?: string, activate?: boolean): Promise<DesktopBrowserTab> => ipcRenderer.invoke('hermes-desktop:browser-create-tab', url, activate),
    createHtmlPreviewTab: (html: string, title: string, activate?: boolean): Promise<DesktopBrowserTab> => ipcRenderer.invoke('hermes-desktop:browser-create-html-preview-tab', html, title, activate),
    closeTab: (tabId: string): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-close-tab', tabId),
    activateTab: (tabId: string): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-activate-tab', tabId),
    navigate: (tabId: string, url: string): Promise<DesktopBrowserTab> => ipcRenderer.invoke('hermes-desktop:browser-navigate', tabId, url),
    navigationAction: (tabId: string, action: 'back' | 'forward' | 'reload' | 'stop'): Promise<DesktopBrowserTab> => ipcRenderer.invoke('hermes-desktop:browser-navigation-action', tabId, action),
    createProfile: (input: BrowserProfileCreateInput): Promise<DesktopBrowserProfile> => ipcRenderer.invoke('hermes-desktop:browser-create-profile', input),
    chooseProfileRootDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('hermes-desktop:browser-choose-profile-root-directory', defaultPath),
    renameProfile: (profileId: string, name: string): Promise<DesktopBrowserProfile> => ipcRenderer.invoke('hermes-desktop:browser-rename-profile', profileId, name),
    profileSwitchImpact: (): Promise<BrowserProfileSwitchImpact> => ipcRenderer.invoke('hermes-desktop:browser-profile-switch-impact'),
    switchProfile: (profileId: string, force?: boolean): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-switch-profile', profileId, force),
    updateProfile: (profileId: string, input: BrowserProfileUpdateInput): Promise<DesktopBrowserProfile> => ipcRenderer.invoke('hermes-desktop:browser-update-profile', profileId, input),
    deleteProfile: (profileId: string): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-delete-profile', profileId),
    clearProfileData: (profileId: string, kind: 'cache' | 'site-data' | 'permission-audit'): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-clear-profile-data', profileId, kind),
    cancelDownload: (downloadId: string): Promise<DesktopBrowserState> => ipcRenderer.invoke('hermes-desktop:browser-cancel-download', downloadId),
    takeOver: (tabId: string): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:browser-take-over', tabId),
    annotate: (tabId: string, mode: 'element' | 'region'): Promise<BrowserSelection> => ipcRenderer.invoke('hermes-desktop:browser-annotate', tabId, mode),
    cancelAnnotation: (tabId: string): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:browser-cancel-annotation', tabId),
    updateAnnotationNote: (tabId: string, marker: number, note: string): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:browser-update-annotation-note', tabId, marker, note),
    captureAnnotations: (tabId: string): Promise<BrowserSelection['screenshot']> => ipcRenderer.invoke('hermes-desktop:browser-capture-annotations', tabId),
    clearAnnotations: (tabId: string): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:browser-clear-annotations', tabId),
    removeAnnotation: (tabId: string, marker: number): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:browser-remove-annotation', tabId, marker),
    onAnnotationRequest: (callback: (request: { tabId: string; mode: 'element' | 'region' }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: { tabId: string; mode: 'element' | 'region' }) => callback(request)
      ipcRenderer.on('hermes-desktop:browser-annotation-request', listener)
      return () => ipcRenderer.removeListener('hermes-desktop:browser-annotation-request', listener)
    },
    onStateChange: (callback: (state: DesktopBrowserState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: DesktopBrowserState) => callback(state)
      ipcRenderer.on('hermes-desktop:browser-state-change', listener)
      return () => ipcRenderer.removeListener('hermes-desktop:browser-state-change', listener)
    },
  } } : {}),
  platform: process.platform,
  isDesktop: true,
  remoteMode: REMOTE_SERVER_MODE,
  windowKind: desktopWindowKind(),
})

const API_KEY_LS = 'hermes_api_key'

// HERMES_CUSTOM[SecPreloadNoStrip] BEGIN: 不再篡改 /api/auth/me 的 requiresCredentialChange
// 此前桌面端拦截响应并强制置 false，屏蔽了「必须修改默认密码」告警（VULN-04），
// 使弱默认密码 admin/123456 长期存续。现移除该 fetch/XHR monkey-patch，让真值透传到 UI 引导改密。
// autoLogin（本机单用户体验）保留不变。
// HERMES_CUSTOM[SecPreloadNoStrip] END

window.addEventListener('DOMContentLoaded', async () => {
  if (REMOTE_SERVER_MODE) return
  try {
    const token = await ipcRenderer.invoke('hermes-desktop:get-token')
    if (token) {
      try { localStorage.setItem('AUTH_TOKEN', token) } catch { /* */ }
    }
  } catch {
    /* ignore */
  }
})
