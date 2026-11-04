// custom/server/execution-records/coding-detail.ts
// coding-run 通道详情面（AgentTeams 吸收批二，只读 fail-soft）。
//
// 数据源：webui 库 ~/.hermes-web-ui/hermes-web-ui.db 三表摘要（列名以
// vendor schemas.ts 实测为准，勿凭记忆猜——sessions 表没有 created_at/
// updated_at，时间列是 started_at/ended_at/last_active）：
//   sessions             会话身份（id/title/agent_session_id/agent_native_session_id/
//                        end_reason/workspace/model + started_at/ended_at/last_active）
//   run_usage            每次 run 的 token/成本/时长（cost_usd/run_duration_seconds…）
//   workspace_run_changes 每次 run 的落盘面（files_changed/additions/deletions…）
//
// 只读纪律：DatabaseSync readOnly 打开（同 cli-fast-gates / project-tasks），
// 本域绝不写库。库缺/表缺/坏 → { available:false, note }（fail-soft 契约，
// 调用方走 lib/http unavailable，不猜数不放大成 500）。
import { existsSync } from 'fs'
import { join } from 'path'
import { hermesWebUiHome } from '../lib/paths'

/** webui 库路径（run-manifest.ts 的 webuiHome env 习惯：HERMES_WEB_UI_HOME /
 *  HERMES_WEBUI_STATE_DIR 显式优先 → underWebUi 缺省根）。 */
export function webuiDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.HERMES_WEB_UI_HOME?.trim() || env.HERMES_WEBUI_STATE_DIR?.trim()
  return join(explicit || hermesWebUiHome(env), 'hermes-web-ui.db')
}

/** 会话行（sessions 表实际列——时间口径 ms epoch INTEGER）。 */
export interface CodingSessionRow {
  id: string
  title: string | null
  agent_session_id: string
  agent_native_session_id: string
  end_reason: string | null
  started_at: number
  ended_at: number | null
  last_active: number
  workspace: string | null
  model: string
}

export interface CodingUsageRow {
  run_id: string
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  cost_usd: number | null
  run_duration_seconds: number | null
  model_duration_seconds: number | null
  tool_duration_seconds: number | null
  is_estimated: number
  completed_at: number
}

export interface CodingChangeRow {
  change_id: string
  run_id: string
  workspace: string
  started_at: number
  finished_at: number
  files_changed: number
  additions: number
  deletions: number
  truncated: number
  created_at: number
}

export type CodingDetail =
  | { available: true; session: CodingSessionRow | null; usage: CodingUsageRow[]; changes: CodingChangeRow[] }
  | { available: false; note: string }

const USAGE_CAP = 200
const CHANGES_CAP = 200

/** 只读查询（fail-soft：任何一步失败 → { available:false, note }）。 */
export function readCodingDetail(
  sessionId: string,
  opts: { env?: NodeJS.ProcessEnv } = {},
): CodingDetail {
  const env = opts.env ?? process.env
  const dbPath = webuiDbPath(env)
  if (!existsSync(dbPath)) {
    return { available: false, note: `webui 库不存在：${dbPath}` }
  }
  let db: {
    prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }
    close(): void
  } | null = null
  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (p: string, o?: unknown) => NonNullable<typeof db>
    }
    db = new DatabaseSync(dbPath, { readOnly: true })
    // 列名锚点 vendor schemas.ts SESSIONS_SCHEMA/RUN_USAGE_SCHEMA/WORKSPACE_RUN_CHANGES_SCHEMA
    const session = db.prepare(
      'SELECT id, title, agent_session_id, agent_native_session_id, end_reason,'
        + ' started_at, ended_at, last_active, workspace, model FROM sessions WHERE id = ? LIMIT 1',
    ).get(sessionId) as CodingSessionRow | undefined
    const usage = db.prepare(
      'SELECT run_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,'
        + ' cost_usd, run_duration_seconds, model_duration_seconds, tool_duration_seconds,'
        + ' is_estimated, completed_at FROM run_usage WHERE session_id = ?'
        + ' ORDER BY completed_at DESC LIMIT ' + USAGE_CAP,
    ).all(sessionId) as CodingUsageRow[]
    const changes = db.prepare(
      'SELECT change_id, run_id, workspace, started_at, finished_at, files_changed,'
        + ' additions, deletions, truncated, created_at FROM workspace_run_changes'
        + ' WHERE session_id = ? ORDER BY created_at DESC LIMIT ' + CHANGES_CAP,
    ).all(sessionId) as CodingChangeRow[]
    return {
      available: true,
      session: session ?? null,
      usage,
      changes,
    }
  } catch (err) {
    // 表缺（prepare 抛 no such table）/库坏/并发锁：一律降级，note 带原因可诊断
    const msg = err instanceof Error ? err.message : String(err)
    return { available: false, note: `webui 库读失败：${msg}` }
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}
