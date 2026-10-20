// overlay/custom/client/matrix-chat/utils/server-url.ts
// homeserver 地址等价判定（matrix-server-info 单源对账用）：
// 本地部署常见「localhost ↔ 127.0.0.1」混写与尾斜杠差异不构成"地址已变更"，
// 只有真正换了主机/端口才判不等，避免每次进页面误报横幅。
export function normalizeHomeserverUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed.replace(/^http:\/\/localhost(?=:|\/|$)/i, 'http://127.0.0.1')
}

export function homeserverUrlEquals(a: string, b: string): boolean {
  return normalizeHomeserverUrl(a) === normalizeHomeserverUrl(b)
}
