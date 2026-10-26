// 测试读取上游源码的唯一根目录：显式私有基线 > 当前检出的 vendor > 旧缓存。
// 不在生产客户端中引用；这里只服务 Vitest 的注入态断言。
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const OVERLAY_ROOT = resolve(__dirname, '../..')

function resolveUpstreamRoot(): string {
  const explicit = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  if (explicit) return resolve(explicit)
  const vendor = resolve(OVERLAY_ROOT, 'vendor')
  if (existsSync(resolve(vendor, 'hermes-studio'))) return vendor
  return resolve(OVERLAY_ROOT, '../upstream')
}

export const UPSTREAM_ROOT = resolveUpstreamRoot()

export function upstreamPath(...parts: string[]): string {
  return resolve(UPSTREAM_ROOT, ...parts)
}
