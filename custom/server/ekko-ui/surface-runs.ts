/**
 * 一块挂起 Surface 的宿主生命周期。
 *
 * 与 ClarificationRuns 同构：MCP 工具请求进来后阻塞等待用户回填，超时/取消/运行结束
 * 都会 resolve 成终态，绝不把超时当同意。区别是回填携带声明式界面的 action 与 payload，
 * 并在 present/closed 时向会话发布 ui.surface.* 事件。
 */
import {
  SURFACE_REVISION,
  SurfaceError,
  parseSurfaceRequest,
  parseSurfaceSubmission,
  surfaceIdFor,
  type SurfaceRequestInput,
  type SurfaceSubmission,
} from './contract'

type RunState = { isWorking: boolean; isAborting?: boolean; activeRunMarker?: string; responseRun?: { runMarker?: string } }
type Binding = { sessionId: string; profile: string; resolve: () => RunState | undefined; runId?: string }
type Pending = {
  contextId: string
  sessionId: string
  surfaceId: string
  specSurfaceId: string
  revision: number
  finish: (status: SurfaceSubmission['status'], actionId?: string, payload?: unknown, reason?: string) => void
}

export class SurfaceRuns {
  private readonly bindings = new Map<string, Binding>()
  private readonly pending = new Map<string, Pending>()

  constructor(private readonly publish: (sessionId: string, event: string, payload: Record<string, unknown>) => void) {}

  begin(contextId: string, sessionId: string, profile: string, resolve: Binding['resolve']): void {
    this.finishSession(sessionId)
    this.bindings.set(contextId, { sessionId, profile, resolve })
  }

  private active(contextId: string, profile: string): { binding: Binding; runId: string } {
    const binding = this.bindings.get(contextId)
    if (!binding || binding.profile !== profile) throw new SurfaceError('Surface context is unavailable or has expired', 409)
    const state = binding.resolve()
    const runId = state?.activeRunMarker || state?.responseRun?.runMarker
    if (!state?.isWorking || state.isAborting || !runId || (binding.runId && binding.runId !== runId)) {
      throw new SurfaceError('Surface context has no active turn', 409)
    }
    binding.runId = runId
    return { binding, runId }
  }

  request(
    contextId: string,
    profile: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<SurfaceSubmission> {
    const { binding, runId } = this.active(contextId, profile)
    const request: SurfaceRequestInput = parseSurfaceRequest(input)
    if (signal?.aborted) throw new SurfaceError('Surface request was cancelled', 409)
    if ([...this.pending.values()].some(item => item.sessionId === binding.sessionId)) {
      throw new SurfaceError('Another surface is already pending for this session', 409)
    }
    const surfaceId = surfaceIdFor(binding.sessionId, request.spec.surfaceId)
    if (this.pending.has(surfaceId)) throw new SurfaceError('This surface id is already pending', 409)

    return new Promise<SurfaceSubmission>((resolve, reject) => {
      const requestedAt = Date.now()
      const finish = (status: SurfaceSubmission['status'], actionId?: string, payload?: unknown, reason?: string) => {
        if (!this.pending.delete(surfaceId)) return
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        const submission: SurfaceSubmission = {
          status,
          surface_id: surfaceId,
          revision: SURFACE_REVISION,
          ...(actionId ? { action_id: actionId } : {}),
          ...(payload !== undefined ? { payload } : {}),
          ...(reason ? { reason } : {}),
        }
        try {
          this.publish(binding.sessionId, 'ui.surface.closed', {
            event: 'ui.surface.closed',
            run_id: runId,
            session_id: binding.sessionId,
            surface_id: surfaceId,
            revision: SURFACE_REVISION,
            status,
            ...(actionId ? { action_id: actionId } : {}),
            ...(payload !== undefined ? { payload } : {}),
            ...(reason ? { reason } : {}),
          })
        } catch (error) {
          reject(error)
          return
        }
        resolve(submission)
      }
      const onAbort = () => finish('cancelled', undefined, undefined, 'transport-closed')
      const timer = setTimeout(() => finish('expired', undefined, undefined, 'timed_out'), request.timeoutMs)
      timer.unref?.()

      this.pending.set(surfaceId, {
        contextId,
        sessionId: binding.sessionId,
        surfaceId,
        specSurfaceId: request.spec.surfaceId,
        revision: SURFACE_REVISION,
        finish,
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        this.publish(binding.sessionId, 'ui.surface.presented', {
          event: 'ui.surface.presented',
          run_id: runId,
          session_id: binding.sessionId,
          surface_id: surfaceId,
          revision: SURFACE_REVISION,
          title: request.title || request.spec.title || '',
          spec: request.spec,
          fallback_text: request.fallbackText,
          timeout_ms: request.timeoutMs,
          remaining_timeout_ms: request.timeoutMs,
          requested_at: requestedAt,
        })
      } catch (error) {
        this.pending.delete(surfaceId)
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      }
    })
  }

  respond(
    sessionId: string,
    surfaceId: string,
    revision: number,
    actionId: unknown,
    payload: unknown,
  ): { handled: boolean; resolved: boolean } {
    const pending = this.pending.get(surfaceId)
    if (!pending) return { handled: false, resolved: false }
    if (pending.sessionId !== sessionId) return { handled: true, resolved: false }
    const binding = this.bindings.get(pending.contextId)
    try {
      this.active(pending.contextId, binding?.profile || '')
    } catch {
      pending.finish('cancelled', undefined, undefined, 'context-expired')
      return { handled: true, resolved: false }
    }
    if (revision !== pending.revision) throw new SurfaceError('Surface revision is stale', 409)
    const action = parseSurfaceSubmission(actionId, payload)
    if (action.actionId === 'cancel') {
      pending.finish('cancelled', action.actionId)
      return { handled: true, resolved: true }
    }
    if (action.payload === undefined) throw new SurfaceError('payload is required for a submit action')
    pending.finish('submitted', action.actionId, action.payload)
    return { handled: true, resolved: true }
  }

  hasPending(sessionId: string): boolean {
    return [...this.pending.values()].some(item => item.sessionId === sessionId)
  }

  finishSession(sessionId: string, contextId?: string): void {
    for (const [id, binding] of this.bindings) {
      if (binding.sessionId === sessionId && (!contextId || id === contextId)) this.bindings.delete(id)
    }
    for (const pending of [...this.pending.values()]) {
      if (pending.sessionId === sessionId && (!contextId || pending.contextId === contextId)) {
        pending.finish('cancelled', undefined, undefined, 'run-ended')
      }
    }
  }
}
