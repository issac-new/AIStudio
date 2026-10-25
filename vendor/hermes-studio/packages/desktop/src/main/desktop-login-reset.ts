import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundledNode, webUiHome, webuiDir } from './paths'

// HERMES_CUSTOM[SecNoDefaultCred] BEGIN: 出厂默认口令移除（安全轮 M8b，2026-10-16）。
// 旧实现返回硬编码 admin/123456（与 CLI 的出厂重置配套）。新链路：CLI
// reset-default-login 生成随机密码并写 <home>/admin-login.json（0600）；本模块读
// 该文件取真实凭据。desktopAutoLogin 供主进程 IPC 代理登录（渲染层不再持有口令）。
// HERMES_CUSTOM[SecNoDefaultCred] END
const EXEC_MAX_BUFFER = 1024 * 1024

function resolveNodeForWebUiCli(): string {
  try {
    const node = bundledNode()
    if (existsSync(node)) return node
  } catch {
    /* fall back to the current executable */
  }
  return process.execPath
}

function webUiCliScriptPath(): string {
  return join(webuiDir(), 'bin', 'hermes-web-ui.mjs')
}

function adminLoginFilePath(): string {
  return join(webUiHome(), 'admin-login.json')
}

interface AdminLoginFile {
  username: string
  password: string
  createdAt: number
}

function readAdminLoginFile(): AdminLoginFile | null {
  try {
    const raw = JSON.parse(readFileSync(adminLoginFilePath(), 'utf-8')) as Partial<AdminLoginFile>
    if (typeof raw.username === 'string' && typeof raw.password === 'string' && raw.username && raw.password) {
      return { username: raw.username, password: raw.password, createdAt: Number(raw.createdAt) || 0 }
    }
  } catch {
    /* missing or malformed file */
  }
  return null
}

async function runWebUiCliCommand(command: string): Promise<void> {
  const node = resolveNodeForWebUiCli()
  const script = webUiCliScriptPath()
  const home = webUiHome()

  await new Promise<void>((resolve, reject) => {
    execFile(node, [script, command], {
      cwd: webuiDir(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HERMES_WEB_UI_HOME: home,
        HERMES_WEBUI_STATE_DIR: home,
      },
      maxBuffer: EXEC_MAX_BUFFER,
      windowsHide: true,
    }, (error, _stdout, stderr) => {
      if (!error) {
        resolve()
        return
      }
      const detail = typeof stderr === 'string' && stderr.trim() ? stderr.trim() : error.message
      reject(new Error(detail))
    })
  })
}

export async function resetDesktopDefaultLogin(): Promise<{ username: string; password: string }> {
  await runWebUiCliCommand('reset-default-login')
  await runWebUiCliCommand('clear-login-locks')
  const credentials = readAdminLoginFile()
  if (!credentials) throw new Error('reset-default-login did not produce admin-login.json')
  return { username: credentials.username, password: credentials.password }
}

/** 主进程代理登录（IPC 'hermes-desktop:login'）：用 CLI 落盘的随机凭据向本地
 *  服务换 JWT。空库（首启）时先跑 CLI 随机建号再登录。凭据不出主进程——渲染层
 *  只拿 JWT（旧实现把 admin/123456 打进客户端 bundle，安全轮 M8b 根治项）。
 *  返回空串=无法自动登录（渲染层回落手动登录页）。 */
export async function desktopAutoLogin(serverUrl: string): Promise<string> {
  if (!serverUrl) return ''
  const login = async (username: string, password: string): Promise<{ jwt: string; noAccounts: boolean }> => {
    try {
      const res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        const body = await res.json().catch(() => null) as { token?: string } | null
        return { jwt: body?.token ?? '', noAccounts: false }
      }
      const body = await res.json().catch(() => null) as { code?: string } | null
      return { jwt: '', noAccounts: body?.code === 'NO_USER_ACCOUNTS' }
    } catch {
      return { jwt: '', noAccounts: false }
    }
  }
  const stored = readAdminLoginFile()
  if (stored) {
    const r = await login(stored.username, stored.password)
    if (r.jwt) return r.jwt
    // 口令已被用户修改（登录 401 但账号存在）→ 手动登录，不自动建号
    if (!r.noAccounts) return ''
  } else {
    // 从未初始化：探测账号面——错口令 401=已有账号（手动登录）；
    // NO_USER_ACCOUNTS=空库（首启，走下方随机建号）
    const probe = await login('admin', 'probe')
    if (!probe.noAccounts) return ''
  }
  // 空库（首启或库被清空）：CLI 随机建号后重试。绝不在已有账号的环境动用户表。
  try {
    await runWebUiCliCommand('reset-default-login')
  } catch {
    return ''
  }
  const fresh = readAdminLoginFile()
  if (!fresh) return ''
  return (await login(fresh.username, fresh.password)).jwt
}
