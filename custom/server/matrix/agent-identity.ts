// custom/server/matrix/agent-identity.ts
// v14 统一聊天 P2A（2026-09-29）：agent matrix 身份供给闭环——provision 建号后
// 「初始密码换 access token → 写 hermes profile dotenv」，替代此前全靠手工的断层。
// 消费侧（gateway-env / hermes 运行时 matrix 适配器）只读 `profiles/<profile>/.env`
// 的 MATRIX_HOMESERVER/ACCESS_TOKEN/USER_ID，本模块是唯一写入口（merge 不覆盖他键）。
// 安全边界：token 不落日志、文件 0600 原子写（tmp+rename），对齐 session-store 惯例。
import { readFile, writeFile, rename, mkdir, chmod } from 'node:fs/promises'
import path from 'node:path'
import { hermesHomePath, parseDotenv } from './gateway-env'

export interface MatrixLoginCredentials {
  accessToken: string
  deviceId: string
  userId: string
}

/** 密码登录换 token（/_matrix/client/v3/login，m.login.password）。
 *  非 2xx 抛错（含 synapse 错误体前 120 字，便于排障但不泄 token）。 */
export async function loginMatrixUser(
  homeserverUrl: string, userId: string, password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MatrixLoginCredentials> {
  const url = new URL('/_matrix/client/v3/login', homeserverUrl).toString()
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: userId },
      password,
      initial_device_display_name: 'swarmstudio-agent-identity',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`matrix login failed: HTTP ${res.status} ${body.slice(0, 120)}`)
  }
  const data = await res.json() as { access_token?: string; device_id?: string; user_id?: string }
  if (!data.access_token || !data.device_id || !data.user_id) {
    throw new Error('matrix login response missing access_token/device_id/user_id')
  }
  return { accessToken: data.access_token, deviceId: data.device_id, userId: data.user_id }
}

export interface AgentEnvWrite {
  profile: string
  /** 写入后的 dotenv 绝对路径 */
  envPath: string
  /** 本次是否新建了文件（false=合并进既有 .env） */
  created: boolean
}

/** 把凭据三件套 merge 进 `<hermesHome>/profiles/<profile>/.env`：
 *  保留既有其他键；已存在的三个键原地覆盖；0600 原子写。 */
export async function writeAgentMatrixEnv(
  opts: {
    profile: string
    homeserverUrl: string
    accessToken: string
    userId: string
    hermesHome?: string
  },
): Promise<AgentEnvWrite> {
  const home = opts.hermesHome ?? hermesHomePath()
  const dir = path.join(home, 'profiles', opts.profile)
  const envPath = path.join(dir, '.env')
  let existing: Record<string, string> = {}
  let created = false
  try {
    existing = parseDotenv(await readFile(envPath, 'utf-8'))
  } catch {
    created = true
  }
  const merged: Record<string, string> = {
    ...existing,
    MATRIX_HOMESERVER: opts.homeserverUrl,
    MATRIX_ACCESS_TOKEN: opts.accessToken,
    MATRIX_USER_ID: opts.userId,
  }
  const text = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n'
  await mkdir(dir, { recursive: true })
  const tmp = `${envPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, text, { encoding: 'utf-8', mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, envPath)
  return { profile: opts.profile, envPath, created }
}

/** P2A 一步闭环：登录换 token + 写 profile dotenv。登录失败抛错（调用方决定
 *  是否 best-effort）；写失败抛错（半状态=号已建但无凭据，须显式暴露不吞）。 */
export async function provisionAgentIdentity(opts: {
  homeserverUrl: string
  agentUserId: string
  password: string
  profile: string
  hermesHome?: string
  fetchImpl?: typeof fetch
}): Promise<MatrixLoginCredentials & AgentEnvWrite> {
  const creds = await loginMatrixUser(opts.homeserverUrl, opts.agentUserId, opts.password, opts.fetchImpl ?? fetch)
  const written = await writeAgentMatrixEnv({
    profile: opts.profile,
    homeserverUrl: opts.homeserverUrl,
    accessToken: creds.accessToken,
    userId: creds.userId,
    hermesHome: opts.hermesHome,
  })
  return { ...creds, ...written }
}
