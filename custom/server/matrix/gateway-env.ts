// overlay/custom/server/matrix/gateway-env.ts
// R1 升级（2026-09-11）：gateway（hermes-agent）侧 Matrix 凭据作为 Brief 投递的
// 第三级回落源。凭据落在 hermes dotenv：`${HERMES_HOME:-~/.hermes}/profiles/<profile>/.env`
// （来源：hermes_cli/env_loader.py load_hermes_dotenv 的加载语义；plain KEY=VALUE，
// 容忍 export 前缀 / 单双引号 / 注释 / 空行）。
//
// profile 解析：LOOP_MATRIX_PROFILE env → ${hermesHome}/active_profile 文件内容 → 'orchestrator'。
// 五件套键名：MATRIX_HOMESERVER / MATRIX_ACCESS_TOKEN / MATRIX_USER_ID（凭据三必填）+
// MATRIX_HOME_ROOM（网关主房间，可作 Brief 默认投递房间）+ MATRIX_HOME_ROOM_THREAD_ID（透传备查）。
//
// 安全边界：本模块只读文件、不打印值；调用方（brief-matrix-delivery）不得将 token 落日志。

import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** gateway dotenv 解析出的 Matrix 相关键（可选键缺省 undefined） */
export interface GatewayMatrixEnv {
  homeserverUrl: string
  accessToken: string
  userId: string
  homeRoom?: string
  homeRoomThreadId?: string
}

/**
 * 最小 dotenv 解析（零依赖）：逐行 trim；跳过空行与 # 注释；剥离 export 前缀；
 * 按首个 = 分割键值；值去一层成对单/双引号；未加引号的值截掉行内 ` #` 注释
 * （对齐主流 dotenv 语义——token 后跟 `# rotated` 之类的注释不再混进值，
 * 2026-09-12 审查）。无 = 行与空键行跳过不抛错。
 */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const stripped = line.startsWith('export ') ? line.slice('export '.length).trim() : line
    const eq = stripped.indexOf('=')
    if (eq <= 0) continue
    const key = stripped.slice(0, eq).trim()
    if (key === '') continue
    let value = stripped.slice(eq + 1).trim()
    if (value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    } else {
      const commentAt = value.indexOf(' #')
      if (commentAt >= 0) value = value.slice(0, commentAt).trim()
    }
    out[key] = value
  }
  return out
}

/** hermes home：HERMES_HOME 覆盖，缺省 ~/.hermes（与 gateway 同源） */
export function hermesHomePath(env: Record<string, string | undefined> = process.env): string {
  const home = env.HERMES_HOME?.trim()
  return home ? join(home) : join(homedir(), '.hermes')
}

/** gateway profile：LOOP_MATRIX_PROFILE 显式覆盖 → active_profile 文件内容 → 'orchestrator' */
export function resolveGatewayProfile(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.LOOP_MATRIX_PROFILE?.trim()
  if (explicit) return explicit
  try {
    const active = readFileSync(join(hermesHomePath(env), 'active_profile'), 'utf8').trim()
    if (active !== '') return active
  } catch { /* 文件缺失/读失败 → 缺省 */ }
  return 'orchestrator'
}

/** gateway dotenv 绝对路径：`<hermesHome>/profiles/<profile>/.env` */
export function gatewayEnvFilePath(env: Record<string, string | undefined> = process.env): string {
  return join(hermesHomePath(env), 'profiles', resolveGatewayProfile(env), '.env')
}

/**
 * 读 gateway dotenv 原始键值（宽容版）：文件缺失 → null，不做任何必填校验。
 * 供房间解析等"键存在即有效"的场景（如 MATRIX_HOME_ROOM 与凭据三件套独立）。
 */
export function readGatewayMatrixFile(env: Record<string, string | undefined> = process.env): Record<string, string> | null {
  try {
    return parseDotenv(readFileSync(gatewayEnvFilePath(env), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 读 gateway Matrix 五件套；文件缺失或凭据三必填（HOMESERVER/ACCESS_TOKEN/USER_ID）
 * 任一缺失/为空 → null（调用方视为"该级无凭据"，继续走链路下一级/终止）。
 */
export function readGatewayMatrixEnv(env: Record<string, string | undefined> = process.env): GatewayMatrixEnv | null {
  const kv = readGatewayMatrixFile(env)
  if (!kv) return null
  const homeserverUrl = kv.MATRIX_HOMESERVER ?? ''
  const accessToken = kv.MATRIX_ACCESS_TOKEN ?? ''
  const userId = kv.MATRIX_USER_ID ?? ''
  if (homeserverUrl === '' || accessToken === '' || userId === '') return null
  return {
    homeserverUrl,
    accessToken,
    userId,
    ...(kv.MATRIX_HOME_ROOM ? { homeRoom: kv.MATRIX_HOME_ROOM } : {}),
    ...(kv.MATRIX_HOME_ROOM_THREAD_ID ? { homeRoomThreadId: kv.MATRIX_HOME_ROOM_THREAD_ID } : {}),
  }
}
