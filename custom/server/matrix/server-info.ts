// custom/server/matrix/server-info.ts
// Matrix 部署地址单一事实源（2026-10-20 驾驶舱整治 matrix 链接修复轮，spec=
// docs/superpowers/specs/2026-10-20-matrix-server-info-single-source.md）。
// 产品内所有需要 homeserver / 域名 / element-web 入口的位置（element-web config.json、
// 账户管理建号与改资料、登录页预填、分享与深链）一律从这里取，禁止再写死
// localhost:8008 / 127.0.0.1:8008 / matrix.org。
//
// 解析顺序（显式配置 > gateway 凭据 > 本部署兜底）：
//   homeserverUrl: MATRIX_HOMESERVER_URL env → gateway dotenv MATRIX_HOMESERVER
//                  → http://127.0.0.1:8008
//   serverName:    MATRIX_SERVER_NAME env → gateway dotenv MATRIX_USER_ID 的域段
//                  → matrix.test
//   elementWebUrl: ELEMENT_WEB_URL env → /element-web/（同源相对路径，跟随产品部署）
//
// 安全边界：只暴露非敏感部署地址（homeserver 本就显示在登录表单里），不读不返回
// access_token；与 gateway-env 的凭据读取共用同一 dotenv 解析，但不导出凭据字段。

import { readGatewayMatrixFile } from './gateway-env'

export interface MatrixServerInfo {
  homeserverUrl: string
  serverName: string
  elementWebUrl: string
}

/** 本部署兜底值（验收记录 docs/superpowers/specs/2026-10-18-v841-acceptance-record.md:94） */
export const FALLBACK_MATRIX_SERVER_INFO: MatrixServerInfo = {
  homeserverUrl: 'http://127.0.0.1:8008',
  serverName: 'matrix.test',
  elementWebUrl: '/element-web/',
}

/** mxid（@user:domain）→ domain；非法/空 → '' */
export function domainOfMxid(mxid: string): string {
  const m = /^@[^:]+:(.+)$/.exec(mxid.trim())
  return m?.[1]?.trim() ?? ''
}

/**
 * 解析部署地址。env 参数仅供测试注入（生产走 process.env）；
 * gateway dotenv 缺失/键为空时安静落到兜底值，不抛错。
 */
export function getMatrixServerInfo(env: Record<string, string | undefined> = process.env): MatrixServerInfo {
  const dotenv = readGatewayMatrixFile(env) ?? {}
  const homeserverUrl = (
    env.MATRIX_HOMESERVER_URL?.trim()
    || dotenv.MATRIX_HOMESERVER?.trim()
    || FALLBACK_MATRIX_SERVER_INFO.homeserverUrl
  ).replace(/\/+$/, '')
  const serverName = env.MATRIX_SERVER_NAME?.trim()
    || domainOfMxid(dotenv.MATRIX_USER_ID ?? '')
    || FALLBACK_MATRIX_SERVER_INFO.serverName
  const elementWebUrl = env.ELEMENT_WEB_URL?.trim() || FALLBACK_MATRIX_SERVER_INFO.elementWebUrl
  return { homeserverUrl, serverName, elementWebUrl }
}
