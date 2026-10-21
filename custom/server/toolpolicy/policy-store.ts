// overlay/toolpolicy 域：策略文件存储（2026-10-21）。
//
// 与 agentidentity/autonomy-ladder 同款纪律：env 显式目录 > ~/.hermes-web-ui/；
// 原子写（tmp → rename）；读侧 mtime 缓存 1s（工具调用高频，策略变更最多延迟
// 一秒生效）；损坏文件 fail-closed（fatal=true，由执行面拒绝），不静默当空策略。
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  lintPolicyDoc,
  TOOL_POLICY_VERSION,
  type PolicySnapshot,
  type ToolPolicyDoc,
} from './tool-policy'

const CACHE_TTL_MS = 1_000

let cache: { file: string; at: number; mtimeMs: number; size: number; snap: PolicySnapshot } | null = null

export function toolPolicyDir(): string {
  const env = process.env.HERMES_TOOL_POLICY_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'tool-policies')
}

export function toolPolicyFile(): string {
  const env = process.env.HERMES_TOOL_POLICY_FILE?.trim()
  if (env) return resolve(env)
  return join(toolPolicyDir(), 'policies.json')
}

function emptySnapshot(file: string | null): PolicySnapshot {
  return { exists: false, file, doc: null, problems: [], warnings: [], fatal: false }
}

function broken(file: string, problem: string): PolicySnapshot {
  return { exists: true, file, doc: null, problems: [problem], warnings: [], fatal: true }
}

/** 读快照（同步、带缓存）。未配置=inactive；文件存在但坏= fatal。 */
export function loadPolicySnapshot(now = Date.now()): PolicySnapshot {
  const file = toolPolicyFile()
  // 测试环境未显式指目录时不读真实 home（与 policy-decisions 同款隔离纪律）
  if (process.env.NODE_ENV === 'test' && !process.env.HERMES_TOOL_POLICY_DIR && !process.env.HERMES_TOOL_POLICY_FILE) {
    return emptySnapshot(null)
  }
  if (cache && cache.file === file && now - cache.at < CACHE_TTL_MS) return cache.snap

  let stat
  try {
    stat = statSync(file)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      const snap = emptySnapshot(file)
      cache = { file, at: now, mtimeMs: 0, size: 0, snap }
      return snap
    }
    return broken(file, `策略文件不可读：${(e as Error).message}`)
  }

  if (cache && cache.file === file && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    cache.at = now
    return cache.snap
  }

  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    return broken(file, `策略文件读取失败：${(e as Error).message}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return broken(file, `策略文件 JSON 解析失败：${(e as Error).message}`)
  }
  const lint = lintPolicyDoc(parsed)
  const snap: PolicySnapshot = {
    exists: true,
    file,
    doc: lint.doc,
    problems: lint.problems,
    warnings: lint.warnings,
    fatal: lint.problems.length > 0,
  }
  cache = { file, at: now, mtimeMs: stat.mtimeMs, size: stat.size, snap }
  return snap
}

export type PolicySaveResult =
  | { ok: true; doc: ToolPolicyDoc; warnings: string[] }
  | { ok: false; problems: string[]; warnings: string[] }

/**
 * 保存策略（写前必过 lint；未知字段/坏正则拒绝写入）。actor 落 updatedBy；
 * 变更发 govbus security 域事件（fail-soft）。
 */
export function savePolicyDoc(raw: unknown, actor?: string): PolicySaveResult {
  const withVersion = raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).version === undefined
    ? { version: TOOL_POLICY_VERSION, ...(raw as Record<string, unknown>) }
    : raw
  const lint = lintPolicyDoc(withVersion)
  if (lint.problems.length > 0 || !lint.doc) {
    return { ok: false, problems: lint.problems, warnings: lint.warnings }
  }
  const doc: ToolPolicyDoc = {
    ...lint.doc,
    updatedAt: Date.now(),
    ...(actor ? { updatedBy: actor } : {}),
  }
  const file = toolPolicyFile()
  mkdirSync(resolve(file, '..'), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 })
  renameSync(tmp, file)
  cache = null

  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'security',
        severity: 'info',
        type: 'policy.updated',
        source: 'toolpolicy/policy-store',
        summary: `工具策略已更新：${doc.mode === 'strict' ? '严格模式（未命中即拒）' : '宽松模式（仅规则拦截）'}，启用 ${doc.rules.filter((r) => r.enabled).length}/${doc.rules.length} 条`,
        payload: { mode: doc.mode, rules: doc.rules.length, enabled: doc.rules.filter((r) => r.enabled).length },
        refs: actor ? { actor } : {},
      })
    })
    .catch(() => { /* 事件总线不可用不阻断配置写入 */ })

  return { ok: true, doc, warnings: lint.warnings }
}

/** 测试隔离。 */
export function _usePolicyDirForTests(dir: string): void {
  process.env.HERMES_TOOL_POLICY_DIR = dir
  cache = null
}

export function _resetPolicyCacheForTests(): void {
  cache = null
}

export function policyFileExists(): boolean {
  return existsSync(toolPolicyFile())
}
