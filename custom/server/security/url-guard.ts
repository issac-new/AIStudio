/**
 * SSRF 防护工具。
 *
 * 用于校验服务端发起的出站 HTTP/HTTPS 请求目标，阻止将服务端用作代理
 * 访问内网/回环/链路本地地址（OWASP A10:2021 Server-Side Request Forgery）。
 *
 * 设计要点：
 * - 协议白名单（默认仅 https；agent-health 等本机回环服务可放开 http）。
 * - 拒绝 userinfo / fragment。
 * - DNS 解析后逐 IP 校验是否落入私有/保留网段；任一 IP 命中即拒绝。
 * - 返回规范化后的 origin（scheme://host[:port]），调用方应使用该 origin 拼接
 *   path/query 发起请求，避免原始字符串与解析结果不一致（缓解 DNS rebinding）。
 *
 * 注意：本工具做的是「解析时」校验。严格的 TOCTOU 防护需在 socket 层 pin IP，
 * 此处满足 OWASP ASVS v4.0 12.6.1 的基本要求。
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** 校验失败抛出的错误，调用方捕获后应返回 4xx。 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

export interface AssertSafeUrlOptions {
  /** 是否允许 http: 协议（默认 false，仅允许 https）。 */
  allowHttp?: boolean
  /** 允许的端口白名单；缺省表示允许任意非特权端口外的端口。默认拒绝 0-1023。 */
  allowedPorts?: number[]
}

/**
 * 判断一个 IP 字符串是否属于私有/保留/回环/链路本地等不应被 SSRF 访问的网段。
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 0) return true // 非法 IP 视为不安全

  if (family === 4) {
    // IPv4
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true
    const [a, b] = parts
    // 0.0.0.0/8          当前网络
    if (a === 0) return true
    // 10.0.0.0/8         RFC1918 私有
    if (a === 10) return true
    // 127.0.0.0/8        回环
    if (a === 127) return true
    // 169.254.0.0/16     链路本地（含云元数据 169.254.169.254）
    if (a === 169 && b === 254) return true
    // 172.16.0.0/12      RFC1918 私有
    if (a === 172 && b >= 16 && b <= 31) return true
    // 192.0.0.0/24       IETF 协议分配
    if (a === 192 && b === 0) return true
    // 192.0.2.0/24       TEST-NET-1（文档）
    if (a === 192 && b === 0 && parts[2] === 2) return true
    // 192.168.0.0/16     RFC1918 私有
    if (a === 192 && b === 168) return true
    // 198.18.0.0/15      基准测试
    if (a === 198 && (b === 18 || b === 19)) return true
    // 198.51.100.0/24    TEST-NET-2
    if (a === 198 && b === 51 && parts[2] === 100) return true
    // 203.0.113.0/24     TEST-NET-3
    if (a === 203 && b === 0 && parts[2] === 113) return true
    // 224.0.0.0/4        多播
    if (a >= 224 && a <= 239) return true
    // 240.0.0.0/4        保留（含 255.255.255.255 广播）
    if (a >= 240) return true
    return false
  }

  // IPv6
  const lower = ip.toLowerCase()
  // ::1 回环
  if (lower === '::1') return true
  // :: 未指定
  if (lower === '::') return true
  // fe80::/10 链路本地
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true
  // fc00::/7 唯一本地地址（含 fd00::/8）
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true
  // ff00::/8 多播
  if (lower.startsWith('ff')) return true
  // ::ffff:0:0/96 IPv4-mapped — 递归检查内嵌 IPv4
  const v4mapped = lower.match(/^::ffff:([0-9.]+)$/)
  if (v4mapped) return isPrivateOrReservedIp(v4mapped[1])
  // 64:ff9b::/96 NAT64 well-known prefix — 内嵌 IPv4 同样检查
  const nat64 = lower.match(/^64:ff9b::([0-9.]+)$/)
  if (nat64) return isPrivateOrReservedIp(nat64[1])
  return false
}

/**
 * 校验出站 URL 安全性，返回规范化 origin（scheme://host[:port]）。
 * 调用方应使用返回的 origin 拼接路径发请求。
 *
 * @throws UnsafeUrlError 当 URL 不安全时
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  options: AssertSafeUrlOptions = {},
): Promise<string> {
  const { allowHttp = false, allowedPorts } = options
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new UnsafeUrlError('URL is required')
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('Invalid URL')
  }

  // 协议白名单
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new UnsafeUrlError(`Disallowed protocol: ${parsed.protocol}`)
  }

  // 拒绝 userinfo（http://user:pass@host）
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('Userinfo is not allowed in outbound URL')
  }

  // 拒绝 fragment
  if (parsed.hash) {
    throw new UnsafeUrlError('Fragment is not allowed in outbound URL')
  }

  // 端口校验
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new UnsafeUrlError('Invalid port')
  }
  if (!allowedPorts && port <= 1023) {
    // 默认拒绝特权端口，避免访问本机管理服务（如 22/80）。
    // 注意：http 默认 80、https 默认 443 属特权端口但通常合法 —— 放行默认端口。
    const isDefaultPort = (parsed.protocol === 'http:' && port === 80) || (parsed.protocol === 'https:' && port === 443)
    if (!isDefaultPort) {
      throw new UnsafeUrlError('Privileged port is not allowed')
    }
  }
  if (allowedPorts && !allowedPorts.includes(port)) {
    throw new UnsafeUrlError(`Port ${port} is not allowed`)
  }

  const host = parsed.hostname
  if (!host) {
    throw new UnsafeUrlError('Missing host')
  }

  // 直接给 IP 字面量
  if (isIP(host) !== 0) {
    if (isPrivateOrReservedIp(host)) {
      throw new UnsafeUrlError('Target resolves to a private/reserved address')
    }
  } else {
    // 主机名 → DNS 解析，所有解析结果均不得落入私有网段
    let addresses: string[]
    try {
      const records = await lookup(host, { all: true })
      addresses = records.map(r => r.address)
    } catch {
      throw new UnsafeUrlError('Failed to resolve hostname')
    }
    if (addresses.length === 0) {
      throw new UnsafeUrlError('Hostname did not resolve to any address')
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr)) {
        throw new UnsafeUrlError('Target resolves to a private/reserved address')
      }
    }
  }

  // 返回规范化 origin，调用方用此拼接 path/query
  const portSuffix = parsed.port ? `:${parsed.port}` : ''
  return `${parsed.protocol}//${parsed.hostname}${portSuffix}`
}
