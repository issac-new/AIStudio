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

/**
 * shell hook 合法事件名单一事实源（对齐 hermes-agent hermes_cli/plugins.py
 * VALID_HOOKS − SHELL_UNSUPPORTED_HOOKS）：服务端 _parse_hooks_block 对保留
 * 子段/未知事件 warn-and-skip，前端摊平不同口径会把 output_spill/outbound
 * 保留子段与拼错的事件名当 hook 渲染。上游增删事件时此表随 shell_hooks 守门
 * 测试同步。
 */
const SHELL_HOOK_EVENTS = new Set([
  'pre_tool_call', 'post_tool_call', 'transform_terminal_output', 'transform_tool_result',
  'transform_llm_output', 'pre_llm_call', 'post_llm_call',
  'on_stream_start', 'on_stream_delta', 'on_stream_end', 'on_interim_message',
  'pre_verify', 'pre_api_request', 'post_api_request', 'api_request_error',
  'on_session_start', 'on_session_end', 'on_session_finalize', 'on_session_reset',
  'on_skill_lifecycle', 'subagent_start', 'subagent_stop', 'pre_gateway_dispatch',
  'pre_command', 'pre_transcription', 'pre_approval_request', 'post_approval_response',
  'agent_loop_stopped', 'gateway_platform_event', 'on_room_member_activity',
  'on_kanban_dispatch_tick', 'on_kanban_task_updated', 'on_kanban_worker_spawned',
  'on_kanban_worker_exited', 'on_kanban_worker_stale_claim',
  'kanban_task_claimed', 'kanban_task_blocked', 'kanban_task_completed',
])

/** hooks: 段下的保留非事件子段（服务端同款跳过） */
const RESERVED_HOOK_SUBSECTIONS = new Set(['output_spill', 'outbound'])

/** hooks 段原始形态：数组或 { event: [...] } 分组；统一摊平成 HookSpec[]，
 *  与服务端 _parse_hooks_block 同口径过滤（保留子段/未知事件不展示） */
export function normalizeHooks(raw: unknown): HookSpec[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((e): e is HookSpec =>
      Boolean(e) && typeof e === 'object'
      && typeof (e as HookSpec).event === 'string'
      && SHELL_HOOK_EVENTS.has((e as HookSpec).event))
  }
  if (typeof raw === 'object') {
    const out: HookSpec[] = []
    for (const [event, entries] of Object.entries(raw as Record<string, unknown>)) {
      if (RESERVED_HOOK_SUBSECTIONS.has(event)) continue
      if (!SHELL_HOOK_EVENTS.has(event)) continue
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
