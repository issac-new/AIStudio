// 会话权限档 REST（v4 通道轮，2026-10-08）：per-profile 会话档的查/切/清。
// 切档三件事：①存储落盘（下个会话 createSession.config.mode 生效——mention-dispatch
// 穿线）；②带 sessionId+workspacePath 时向引擎发 switchCollaborationMode 立即切
// （引擎面仅 build/edit/plan/yolo 可切，auto 族如实返回 not_switchable——不装已切）；
// ③govbus autonomy 事件留痕（auto/bypassPermissions=warn）。
import Router from '@koa/router'
import { SESSION_PERMISSION_MODES, clearSessionMode, isSessionPermissionMode, sessionModeOf, setSessionMode } from './session-mode-store'
import { ENGINE_MODE_MAP, toEngineSwitchMode, type PermissionMode } from './permission-modes'
import { requireProfileParameterAccess } from '../platform/authz/middleware'
import { requirePlatformSuperAdmin } from '../platform/authz/policy'

export const sessionModeRoutes = new Router({ prefix: '/api/hermes/permmodes/session-mode' })

function emitModeEvent(profileId: string, mode: PermissionMode | null): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'autonomy',
        severity: mode === 'auto' || mode === 'bypassPermissions' ? 'warn' : 'info',
        type: mode ? 'permmode.session_set' : 'permmode.session_clear',
        source: 'permmodes/session-mode-controller',
        summary: `会话权限档：profile ${profileId} → ${mode ?? '（清除，退全局档）'}（引擎建会话档位=${mode ? ENGINE_MODE_MAP[mode] : '—'}）`,
        refs: { profileId },
        payload: { profileId, mode },
      })
    })
    .catch(() => { /* fail-soft */ })
}

sessionModeRoutes.get('/:profileId', requireProfileParameterAccess('profileId'), (ctx) => {
  const pid = ctx.params.profileId
  const mode = sessionModeOf(pid)
  ctx.body = {
    ok: true,
    profileId: pid,
    sessionMode: mode,
    engineCreateMode: mode ? ENGINE_MODE_MAP[mode] : null,
    engineSwitchable: mode ? toEngineSwitchMode(mode) : null,
    modes: SESSION_PERMISSION_MODES,
  }
})

sessionModeRoutes.put('/:profileId', requirePlatformSuperAdmin, async (ctx) => {
  const pid = ctx.params.profileId
  const b = ctx.request.body as { mode?: unknown; sessionId?: unknown; workspacePath?: unknown } | undefined
  if (!isSessionPermissionMode(b?.mode)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: `mode 须为七档之一：${SESSION_PERMISSION_MODES.join('/')}` }
    return
  }
  const mode = b.mode
  setSessionMode(pid, mode)
  emitModeEvent(pid, mode)

  // 立即切（可选）：活跃 sessionId 在场才发；引擎 switchCollaborationMode 只收
  // build/edit/plan/yolo（protocol-v4 command.ts:216），auto 族返回 not_switchable。
  let liveSwitch: 'applied' | 'not_switchable' | 'skipped' | { error: string } = 'skipped'
  const sessionId = typeof b.sessionId === 'string' ? b.sessionId : null
  const workspacePath = typeof b.workspacePath === 'string' ? b.workspacePath : null
  const engineMode = toEngineSwitchMode(mode)
  if (sessionId && workspacePath) {
    if (!engineMode) {
      liveSwitch = 'not_switchable'
    } else {
      try {
        const [{ connectZCodeEngine }, { uuidV7Like }, { ControlBaseUnavailableError, sendCasCommand }] = await Promise.all([
          import('../zcode/engine-bridge'), import('../zcode/mention-dispatch'), import('../zcode/cas-command'),
        ])
        const bridge = await connectZCodeEngine(process.env.ZCODE_HOME ?? process.env.HOME ?? '~')
        try {
          // switchCollaborationMode 是引擎的比对基线命令（N34-1）：baseRevision 取自引擎只读查询，
          // 时间戳须是毫秒数；取不到修订号时不发命令（发出去必被引擎拒）。
          let res: { status: string; reasonCode?: string }
          try {
            res = await sendCasCommand(bridge.agent, {
              workspacePath, sessionId,
              build: (base) => ({
                commandId: uuidV7Like(),
                clientId: bridge.clientId,
                sessionId,
                type: 'switchCollaborationMode',
                payload: { mode: engineMode },
                issuedAt: Date.now(),
                baseRevision: base.revision,
              }),
            })
          } catch (e) {
            // 取不到会话修订号：命令没有发出，如实回报原因码（不装已切）
            if (!(e instanceof ControlBaseUnavailableError)) throw e
            res = { status: 'rejected', reasonCode: e.reason }
          }
          liveSwitch = res.status === 'accepted' || res.status === 'ok'
            ? 'applied'
            : { error: `status=${res.status}${res.reasonCode ? ` reasonCode=${res.reasonCode}` : ''}` }
        } finally {
          bridge.close()
        }
      } catch (e) {
        liveSwitch = { error: e instanceof Error ? e.message : String(e) }
      }
    }
  }
  ctx.body = {
    ok: true,
    profileId: pid,
    mode,
    engineCreateMode: ENGINE_MODE_MAP[mode],
    liveSwitch,
    note: '落盘即对下个会话生效（createSession.config.mode）；会话内立即切需 sessionId+workspacePath 且档位在 build/edit/plan/yolo 内',
  }
})

sessionModeRoutes.del('/:profileId', requirePlatformSuperAdmin, (ctx) => {
  const pid = ctx.params.profileId
  const removed = clearSessionMode(pid)
  if (removed) emitModeEvent(pid, null)
  ctx.body = { ok: true, removed }
})
