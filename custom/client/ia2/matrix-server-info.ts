// overlay/custom/client/ia2/matrix-server-info.ts
// Matrix 部署地址客户端单一事实源（spec 2026-10-20-matrix-server-info-single-source）：
// 与服务端 GET /api/matrix/server-info 同口径。建号/邀请表单默认值、登录页预填、
// 深链拼接一律经此模块，禁止再写死 localhost:8008 / 127.0.0.1:8008。
// 模块级缓存：地址口径在会话期内不变，重复调用不发请求。

export interface MatrixServerInfo {
  homeserverUrl: string
  serverName: string
  elementWebUrl: string
}

/** 端点不可达时的兜底（与服务端 FALLBACK_MATRIX_SERVER_INFO 同值） */
export const MATRIX_SERVER_INFO_FALLBACK: MatrixServerInfo = {
  homeserverUrl: 'http://127.0.0.1:8008',
  serverName: 'matrix.test',
  elementWebUrl: '/element-web/',
}

let cached: Promise<MatrixServerInfo> | null = null

export function fetchMatrixServerInfo(): Promise<MatrixServerInfo> {
  if (!cached) {
    cached = fetch('/api/matrix/server-info')
      .then((r) => (r.ok ? r.json() : {}))
      .then((body) => ({ ...MATRIX_SERVER_INFO_FALLBACK, ...(body as Partial<MatrixServerInfo>) }))
      .catch(() => MATRIX_SERVER_INFO_FALLBACK)
  }
  return cached
}

/** 测试专用：清缓存（生产代码勿调） */
export function __resetMatrixServerInfoCache(): void {
  cached = null
}
