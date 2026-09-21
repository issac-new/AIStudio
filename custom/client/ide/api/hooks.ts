// overlay/custom/client/ide/api/hooks.ts
// Hooks 配置只读客户端（R4 hooks 管理入口 MVP，零 server patch）。
// hermes-agent 的 shell hooks 配置在 ~/.hermes/config.yaml 的 hooks: 段，
// upstream 既有 GET /api/hermes/config?section=hooks 直接回传该段
// （controllers/config.ts getConfig 的 section 分支），无需新端点。
// 面板层按 ShellHookSpec（agent/shell_hooks.py:127：event/command/matcher/
// timeout/fail_closed）渲染；写入/批准管理落 R5+（allowlist 走 hermes hooks CLI）。
import { request } from '@/api/client'

export interface HookSpec {
  event: string
  command: string
  matcher?: string | null
  timeout?: number
  fail_closed?: boolean
}

/** hooks 段原始形态：数组或 { event: [...] } 分组；统一摊平成 HookSpec[] */
export function normalizeHooks(raw: unknown): HookSpec[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((e): e is HookSpec => Boolean(e) && typeof e === 'object' && typeof (e as HookSpec).event === 'string')
  }
  if (typeof raw === 'object') {
    const out: HookSpec[] = []
    for (const [event, entries] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        if (entry && typeof entry === 'object') {
          const e = entry as Partial<HookSpec>
          out.push({ event, command: e.command ?? '', matcher: e.matcher ?? null, timeout: e.timeout, fail_closed: e.fail_closed })
        }
      }
    }
    return out
  }
  return []
}

export const ideHooksApi = {
  async list(): Promise<HookSpec[]> {
    const res = await request<Record<string, unknown>>('/api/hermes/config?section=hooks')
    return normalizeHooks(res?.hooks ?? res)
  },
}
