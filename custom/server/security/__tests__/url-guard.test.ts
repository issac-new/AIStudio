import { describe, it, expect } from 'vitest'
import { isPrivateOrReservedIp, assertSafeOutboundUrl, UnsafeUrlError } from '../url-guard'

describe('isPrivateOrReservedIp', () => {
  it('回环地址视为私有', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('127.1.2.3')).toBe(true)
    expect(isPrivateOrReservedIp('::1')).toBe(true)
  })
  it('RFC1918 私有网段视为私有', () => {
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
  })
  it('链路本地（含云元数据）视为私有', () => {
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
  })
  it('公网地址不视为私有', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false)
  })
  it('多播/保留/广播视为私有', () => {
    expect(isPrivateOrReservedIp('224.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('240.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('255.255.255.255')).toBe(true)
  })
  it('IPv4-mapped IPv6 递归检查', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false)
  })
  it('唯一本地地址 fc00::/7 视为私有', () => {
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
  })
  it('非法 IP 视为私有（拒绝）', () => {
    expect(isPrivateOrReservedIp('not-an-ip')).toBe(true)
    expect(isPrivateOrReservedIp('')).toBe(true)
  })
})

describe('assertSafeOutboundUrl', () => {
  it('拒绝非 https 协议（默认）', async () => {
    await expect(assertSafeOutboundUrl('http://8.8.8.8/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('allowHttp 时放行 http', async () => {
    await expect(assertSafeOutboundUrl('http://8.8.8.8/', { allowHttp: true })).resolves.toBe('http://8.8.8.8')
  })
  it('拒绝 javascript: / file: 协议', async () => {
    await expect(assertSafeOutboundUrl('javascript:alert(1)')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('拒绝 userinfo', async () => {
    await expect(assertSafeOutboundUrl('https://user:pass@8.8.8.8/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('拒绝 fragment', async () => {
    await expect(assertSafeOutboundUrl('https://8.8.8.8/#x')).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('拒绝 IP 字面量落入私有网段', async () => {
    await expect(assertSafeOutboundUrl('https://127.0.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeOutboundUrl('https://169.254.169.254/latest/meta-data/', { allowHttp: true })).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeOutboundUrl('http://10.0.0.1/', { allowHttp: true })).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('拒绝非默认特权端口', async () => {
    await expect(assertSafeOutboundUrl('https://8.8.8.8:22/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeOutboundUrl('https://8.8.8.8:8080/')).resolves.toBe('https://8.8.8.8:8080')
  })
  it('放行公网 IP https 并返回规范化 origin（含路径被剥离）', async () => {
    await expect(assertSafeOutboundUrl('https://8.8.8.8/_matrix/client/v3/account/whoami')).resolves.toBe('https://8.8.8.8')
  })
  it('放行默认端口 https（IP 字面量，不依赖 DNS）', async () => {
    await expect(assertSafeOutboundUrl('https://8.8.8.8:443/')).resolves.toBe('https://8.8.8.8')
  })
  it('hostname 解析失败时拒绝', async () => {
    await expect(assertSafeOutboundUrl('https://nonexistent-host-that-should-not-resolve.invalid/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })
  it('拒绝非法 URL', async () => {
    await expect(assertSafeOutboundUrl('not-a-url')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeOutboundUrl('')).rejects.toBeInstanceOf(UnsafeUrlError)
  })
})
