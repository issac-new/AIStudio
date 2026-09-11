// overlay/custom/server/matrix/session-store.ts
// R1 每日 Brief 投递身份（2026-09-10 用户拍板：使用本机配置的登录身份）——
// matrix-js-sdk 客户端侧登录后经 POST /api/auth/matrix-login 校验（patch 012），
// 服务器此前不落盘 token；本模块把校验通过的会话写入本机配置目录
// `~/.hermes-web-ui/matrix-session.json`（与既有 DB/设备私钥同目录，信任域一致），
// 供 loop 图引擎的 Brief Matrix 投递（brief-matrix-delivery.ts）作为发送身份。
//
// 配置目录解析：复用上游 `getWebUiHome`（packages/server/src/modules/studio/public/config.ts:58）
// 的语义——HERMES_WEB_UI_HOME → HERMES_WEBUI_STATE_DIR → homedir()/.hermes-web-ui。
// 不直接 import 上游模块：custom/server 约定零上游依赖（见 graph-assembly.ts 头注），
// 且相对路径仅在 inject 后的符号链接视角可解析，overlay vitest 物理树下不可达——
// 故本地复制该几行 join(homedir(), ...) 逻辑并在此注明来源，两处需同步维护。
//
// 安全：文件内容含 accessToken，权限文件 0600 / 目录 0700（已存在文件也归一）；
// 写入走临时文件 + rename 原子替换，进程中途被杀不留半份 JSON。

import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** matrix-session.json 单条会话记录（矩阵客户端登录态最小集） */
export interface MatrixSessionRecord {
  homeserverUrl: string
  userId: string
  accessToken: string
  deviceId?: string
  /** ISO 8601 写入时间（诊断用，不参与逻辑） */
  updatedAt: string
}

/** 写入入参（updatedAt 由本模块生成，调用方不给） */
export type MatrixSessionInput = Omit<MatrixSessionRecord, 'updatedAt'>

/**
 * 应用配置目录，语义与上游 getWebUiHome 一致（来源见文件头注释）：
 * HERMES_WEB_UI_HOME → HERMES_WEBUI_STATE_DIR → homedir()/.hermes-web-ui
 */
export function resolveAppHome(env: Record<string, string | undefined> = process.env): string {
  const appHome = env.HERMES_WEB_UI_HOME?.trim() || env.HERMES_WEBUI_STATE_DIR?.trim()
  return appHome ? join(appHome) : join(homedir(), '.hermes-web-ui')
}

/** 会话文件绝对路径：`<appHome>/matrix-session.json` */
export function matrixSessionFilePath(env: Record<string, string | undefined> = process.env): string {
  return join(resolveAppHome(env), 'matrix-session.json')
}

/**
 * 读取会话；任何不合法形态（文件缺失 / JSON 畸形 / 非对象 / 必填字段缺失或类型错误）
 * 一律返回 null——调用方（投递层）据此走 env 凭据回退。
 */
export function loadMatrixSession(env: Record<string, string | undefined> = process.env): MatrixSessionRecord | null {
  const file = matrixSessionFilePath(env)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const rec = parsed as Record<string, unknown>
  if (typeof rec.homeserverUrl !== 'string' || rec.homeserverUrl === '') return null
  if (typeof rec.userId !== 'string' || rec.userId === '') return null
  if (typeof rec.accessToken !== 'string' || rec.accessToken === '') return null
  if (rec.deviceId !== undefined && typeof rec.deviceId !== 'string') return null
  return {
    homeserverUrl: rec.homeserverUrl,
    userId: rec.userId,
    accessToken: rec.accessToken,
    ...(typeof rec.deviceId === 'string' && rec.deviceId !== '' ? { deviceId: rec.deviceId } : {}),
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : '',
  }
}

/**
 * 原子写会话：临时文件（同目录，rename 保同文件系统）0600 预先设权后 rename 替换；
 * 目录 0700，已存在的目录/文件权限归一（mkdir 的 mode 只在新建时生效，需显式 chmod）。
 * 写失败向上抛错（matrixLogin 调用方自行 try/catch 降级为 warn，不阻断登录）。
 */
export function saveMatrixSession(input: MatrixSessionInput, env: Record<string, string | undefined> = process.env): void {
  const file = matrixSessionFilePath(env)
  const dir = join(file, '..')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { chmodSync(dir, 0o700) } catch { /* 目录权限归一尽力而为 */ }

  const record: MatrixSessionRecord = {
    homeserverUrl: input.homeserverUrl,
    userId: input.userId,
    accessToken: input.accessToken,
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    updatedAt: new Date().toISOString(),
  }
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  // open 时即 0600，杜绝宽松权限窗口；write/rename 任一失败都清理临时文件不留残渣
  //（rename 成功后 tmp 已不存在，catch 内 unlink 为无害兜底）
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, JSON.stringify(record, null, 2) + '\n')
    closeSync(fd)
    renameSync(tmp, file)
  } catch (err) {
    try { closeSync(fd) } catch { /* 已关 */ }
    try { unlinkSync(tmp) } catch { /* 尽力清理 */ }
    throw err
  }
  // rename 后目标归一 0600（open 时已设，此处兜底归一外部遗留的宽松态）
  try { if (existsSync(file)) chmodSync(file, 0o600) } catch { /* 尽力而为 */ }
}
