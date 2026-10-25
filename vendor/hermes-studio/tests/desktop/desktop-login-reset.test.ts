import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('desktop login reset', () => {
  it('exposes login reset from the tray and restarts only the local Web UI service', () => {
    const source = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(source).toContain("t('tray.resetLogin')")
    expect(source).toContain('async function handleResetDefaultLogin()')
    expect(source).toContain('await stopWebUiServer()')
    expect(source).toContain('await resetDesktopDefaultLogin()')
    expect(source).toContain('await startWebUiServer(PORT)')
  })

  it('refreshes the tray menu once the Web UI server is ready', () => {
    const source = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(source).toContain('serverUrl = url\n    updateTrayMenu()')
    expect(source).toContain('enabled: !isResettingLogin && !activeRemoteServerUrl && (!isBootstrapping || !!serverUrl)')
  })

  it('keeps login reset local-only by disabling it in remote-server mode', () => {
    const source = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(source).toContain('if (isResettingLogin || activeRemoteServerUrl || (isBootstrapping && !serverUrl)) return')
  })

  it('loads the authenticated desktop route instead of the login route on startup', () => {
    const source = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(source).toContain("return webUiHashUrl('/hermes/chat')")
    expect(source).toContain('mainWindow.loadURL(mainRouteUrl() || serverUrl)')
    expect(source).toContain('if (mainWindow) await mainWindow.loadURL(mainRouteUrl() || url)')
  })

  it('resets the login through the Web UI CLI and reads the generated random credentials', () => {
    const source = readFileSync(resolve('packages/desktop/src/main/desktop-login-reset.ts'), 'utf-8')

    expect(source).toContain("runWebUiCliCommand('reset-default-login')")
    expect(source).toContain("runWebUiCliCommand('clear-login-locks')")
    // SecNoDefaultCred（安全轮 M8b）：重置不再返回硬编码口令，改为读 CLI 落盘的
    // admin-login.json（随机密码）；源码不得再出现出厂默认口令字面量。
    expect(source).toContain('readAdminLoginFile()')
    expect(source).not.toContain("DEFAULT_PASSWORD = '123456'")
    expect(source).not.toContain("'123456'")
  })

  it('proxies renderer login through the main process (no credentials in the client bundle)', () => {
    const source = readFileSync(resolve('packages/desktop/src/main/desktop-login-reset.ts'), 'utf-8')
    const preload = readFileSync(resolve('packages/desktop/src/preload/index.ts'), 'utf-8')

    expect(source).toContain('export async function desktopAutoLogin')
    expect(preload).toContain("desktopLogin: (): Promise<string> => ipcRenderer.invoke('hermes-desktop:login')")
  })
})
