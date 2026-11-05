// simcenter 共享守卫（v0.4 单文件体量治理：第五批拆分，来自 simcenter-controller）。
import type { Context } from 'koa'
import { existsSync, readFileSync, statSync } from 'node:fs'

/** 错误摘要上限（红线：不整段外泄 stderr）。 */
export const ERR_CLIP = 200

export function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}


export function gateClosed(ctx: Context): void {
  ctx.status = 503
  ctx.body = { error: 'simcenter 未配置（OBS_SIM_ROOT 缺席=fail-closed）' }
}

/** 读交付物文件（≤1MB 截断，防超大文件整读）：缺席→null。 */
export function readCapped(file: string | null): string | null {
  if (!file || !existsSync(file)) return null
  const size = statSync(file).size
  const fd = readFileSync(file, { encoding: 'utf-8' })
  return size > 1_048_576 ? `${fd.slice(0, 1_048_576)}\n…(file truncated at 1MB)` : fd
}

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}
