/**
 * 工作流引擎 REST（/api/ia2/workflow/runs）——2026-10-23 五轮 H 用户裁定：
 * 「循环」调整为 zcode 的 workflow 功能（参考 zcode dynamic-workflow 引擎的
 * agent().ask() 子代理调度模型），且步骤目标可调度 AIStudio 的分布式
 * hermes agent 与 matrix 集群。
 *
 * 模型（zcode facade 的 AIStudio 形态）：
 * - step.target kind='identity' → 本机网关分布式 hermes agent（49 profile），
 *   经 peer dm 协议（identity-chat.ts 的 ensureBotChat+chat；agent().ask() 的
 *   服务器对等物：同步等回，超时=turn 已入队标 queued 不重发）。
 * - step.target kind='matrix'   → matrix 集群（远程网关=矩阵成员）：以网关
 *   matrix 凭据（resolveMatrixDispatchEnv）向目标房间直发指令消息
 *   （chat-bridge.matrixSend），由成员网关原生处理、回复落房。
 * - mode: parallel=Promise.all（zcode fan-out）；serial=顺序等待前步。
 *
 * 存储：runtime/workflow-runs.json（≤50 条，原子写；进程内首载）。执行异步
 * 推进：POST 立即返回 running 快照，runner 完成后落终态。
 * 挂载：原生 koa 中间件（koa-router 新路由 404 缺陷先例）——patch 685。
 */
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { ensureBotChat, gatewayJson, profileBase } from './identity-chat'
import { resolveMatrixDispatchEnv } from '../../matrix/raci-matrix'
import { matrixSend } from '../../matrix/chat-bridge'

type Ctx = { method?: string; path?: string; params?: Record<string, string>; request?: { body?: unknown }; status?: number; body?: unknown; set(k: string, v: string): void }
type Next = () => Promise<void>

export interface WorkflowStepInput {
  targetKind: 'identity' | 'matrix'
  /** identity=网关 profile 名；matrix=房间 roomId（远程网关成员所在房） */
  ref: string
  instructions: string
}

export interface WorkflowStep extends WorkflowStepInput {
  status: 'pending' | 'running' | 'ok' | 'queued' | 'error'
  reply?: string
  eventId?: string
  error?: string
}

export interface WorkflowRun {
  id: string
  name: string
  mode: 'parallel' | 'serial'
  status: 'running' | 'done' | 'partial' | 'failed'
  steps: WorkflowStep[]
  createdAt: number
  finishedAt?: number
}

const STORE_PATH = process.env.WORKFLOW_STORE?.trim()
  ? process.env.WORKFLOW_STORE
  : join(__dirname, '../../../../runtime/workflow-runs.json')
const MAX_RUNS = 50
const STEP_TIMEOUT_MS = 120_000

// ── 存储（同步 JSON，原子写；读失败按空起步） ──
function loadRuns(): WorkflowRun[] {
  try {
    if (!existsSync(STORE_PATH)) return []
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as unknown
    return Array.isArray(raw) ? (raw as WorkflowRun[]) : []
  } catch {
    return []
  }
}
function saveRuns(runs: WorkflowRun[]): void {
  try {
    mkdirSync(join(STORE_PATH, '..'), { recursive: true })
    const tmp = `${STORE_PATH}.tmp`
    writeFileSync(tmp, JSON.stringify(runs.slice(0, MAX_RUNS), null, 2), 'utf-8')
    renameSync(tmp, STORE_PATH)
  } catch { /* 落盘失败不阻断运行态 */ }
}
let runs: WorkflowRun[] = loadRuns()

// ── 执行器 ──
async function execIdentityStep(step: WorkflowStep): Promise<void> {
  const sid = await ensureBotChat(step.ref)
  try {
    const r = (await gatewayJson(`${profileBase(step.ref)}/api/sessions/${encodeURIComponent(sid)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: step.instructions }),
      timeoutMs: STEP_TIMEOUT_MS,
    })) as { object?: string; message?: { content?: string } } | null
    const queued = r?.object === 'hermes.session.chat.queued'
    step.status = queued ? 'queued' : 'ok'
    step.reply = queued ? '' : (r?.message?.content ?? '')
  } catch (err) {
    // 超时=turn 已入队（peer dm 协议语义，不重发）
    if ((err as Error).name === 'AbortError') {
      step.status = 'queued'
      step.reply = ''
      return
    }
    throw err
  }
}

async function execMatrixStep(step: WorkflowStep): Promise<void> {
  const env = resolveMatrixDispatchEnv()
  if (!env) throw new Error('网关 matrix 凭据未配置（gateway env 五件套缺省）——matrix 集群步骤不可用')
  const eventId = await matrixSend(
    { homeserverUrl: env.homeserverUrl, accessToken: env.accessToken } as Parameters<typeof matrixSend>[0],
    step.ref, 'm.room.message',
    { msgtype: 'm.text', body: step.instructions },
    fetch, `wf-${Date.now()}`,
  )
  step.status = 'ok'
  step.eventId = eventId
  step.reply = `已投递 matrix 房间 ${step.ref}（事件 ${eventId.slice(0, 12)}…）——成员网关将原生处理，回复落该房`
}

async function runWorkflow(run: WorkflowRun): Promise<void> {
  const execOne = async (step: WorkflowStep): Promise<void> => {
    step.status = 'running'
    saveRuns(runs)
    try {
      if (step.targetKind === 'identity') await execIdentityStep(step)
      else await execMatrixStep(step)
    } catch (err) {
      step.status = 'error'
      step.error = (err as Error).message.slice(0, 300)
    }
    saveRuns(runs)
  }
  if (run.mode === 'parallel') await Promise.all(run.steps.map(execOne))
  else for (const step of run.steps) await execOne(step)
  const bad = run.steps.filter(s => s.status === 'error').length
  run.status = bad === 0 ? 'done' : bad === run.steps.length ? 'failed' : 'partial'
  run.finishedAt = Date.now()
  saveRuns(runs)
}

// ── 端点 ──
export function workflowNativeRoutes(): (ctx: Ctx, next: Next) => Promise<void> {
  return async (ctx: Ctx, next: Next): Promise<void> => {
    const path = String(ctx.path ?? '')
    const method = String(ctx.method ?? '').toUpperCase()
    if (method === 'GET' && path === '/api/ia2/workflow/runs') {
      ctx.set('Cache-Control', 'no-store')
      ctx.body = { ok: true, runs }
      return
    }
    const mOne = path.match(/^\/api\/ia2\/workflow\/runs\/([^/]+)$/)
    if (method === 'DELETE' && mOne) {
      // 批 2：删除运行记录（失败/历史清理；running 态拒删防孤儿执行）
      const id = decodeURIComponent(mOne[1])
      const run = runs.find(r => r.id === id)
      if (!run) { ctx.status = 404; ctx.body = { ok: false, error: 'run 不存在' }; return }
      if (run.status === 'running') { ctx.status = 409; ctx.body = { ok: false, error: '运行中不可删除（等终态后再清）' }; return }
      runs = runs.filter(r => r.id !== id)
      saveRuns(runs)
      ctx.body = { ok: true }
      return
    }
    if (method === 'GET' && mOne) {
      ctx.set('Cache-Control', 'no-store')
      const run = runs.find(r => r.id === decodeURIComponent(mOne[1]))
      if (!run) { ctx.status = 404; ctx.body = { ok: false, error: 'run 不存在' }; return }
      ctx.body = { ok: true, run }
      return
    }
    if (method === 'POST' && path === '/api/ia2/workflow/runs') {
      const body = (ctx.request?.body ?? {}) as { name?: unknown; mode?: unknown; steps?: unknown }
      const name = String(body.name ?? '').trim() || '未命名工作流'
      const mode = body.mode === 'serial' ? 'serial' as const : 'parallel' as const
      const stepsIn = Array.isArray(body.steps) ? body.steps : []
      const steps: WorkflowStep[] = []
      for (const raw of stepsIn) {
        const s = raw as Partial<WorkflowStepInput>
        const targetKind = s.targetKind === 'matrix' ? 'matrix' as const : 'identity' as const
        const ref = String(s.ref ?? '').trim()
        const instructions = String(s.instructions ?? '').trim()
        if (!ref || !instructions) { ctx.status = 400; ctx.body = { ok: false, error: '每步需 targetKind/ref/instructions' }; return }
        steps.push({ targetKind, ref, instructions, status: 'pending' })
      }
      if (steps.length === 0) { ctx.status = 400; ctx.body = { ok: false, error: '至少一步' }; return }
      const run: WorkflowRun = {
        id: `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name, mode, status: 'running', steps, createdAt: Date.now(),
      }
      runs = [run, ...runs].slice(0, MAX_RUNS)
      saveRuns(runs)
      // 异步推进；HTTP 立即返回 running 快照（客户端轮询刷新）
      void runWorkflow(run).catch(() => { run.status = 'failed'; saveRuns(runs) })
      ctx.status = 201
      ctx.body = { ok: true, run }
      return
    }
    await next()
  }
}

export default workflowNativeRoutes
export { loadRuns as __loadRunsForTest, saveRuns as __saveRunsForTest }
