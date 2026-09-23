#!/usr/bin/env node
// QGate MCP server（P8，v0.1 §37）：stdio JSON-RPC 2.0（MCP 基础协议子集）。
// 工具面：gate.plan / gate.run / gate.status / gate.get_evidence / gate.get_failures /
//         gate.get_risks / gate.explain —— Code Agent 可主动询问门禁（先证内核再加工具面的裁决落地）。
// 零依赖手写：initialize / tools/list / tools/call / notifications、JSON-LD 无关、Content 文本返回。
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { loadProject } from './core/loader.js'
import { runGate, gitContext } from './core/run.js'
import { storePaths, latestRuns, loadRun, loadRunEvidence, listRisks, listWaivers } from './core/store.js'
import { resolveProfile, findProfile } from './core/profile.js'
import { selectGates } from './core/impact.js'

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'qgate', version: '0.1.0' }

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: Record<string, unknown>
}

function toolDef(name: string, description: string, props: Record<string, { type: string; description?: string; required?: boolean }>) {
  const required = Object.entries(props).filter(([, p]) => p.required).map(([k]) => k)
  return {
    name,
    description,
    inputSchema: { type: 'object' as const, properties: props, ...(required.length ? { required } : {}) },
  }
}

const TOOLS = [
  toolDef('gate.plan', 'List applicable quality gates for the given changed paths (impact analysis).', {
    cwd: { type: 'string', description: 'project root (default: server cwd)', required: true },
    changed: { type: 'string', description: 'comma-separated changed paths (default: git status)' },
  }),
  toolDef('gate.run', 'Run gate(s) and persist evidence. Returns per-gate verdicts.', {
    cwd: { type: 'string', required: true },
    gate: { type: 'string', description: 'gate id or "all"' },
    trigger: { type: 'string', description: 'task_close|pre_commit|release|…' },
  }),
  toolDef('gate.status', 'Latest verdict per gate, with freshness when requested.', {
    cwd: { type: 'string', required: true },
    fresh: { type: 'boolean', description: 'compute freshness (default true)' },
  }),
  toolDef('gate.get_evidence', 'Evidence records of a gate\'s latest run (or a specific run id).', {
    cwd: { type: 'string', required: true },
    gateId: { type: 'string' },
    runId: { type: 'string' },
  }),
  toolDef('gate.get_failures', 'Non-PASS gates with failure summaries and remediation hints.', {
    cwd: { type: 'string', required: true },
  }),
  toolDef('gate.get_risks', 'Registered risks and waivers (exceptions).', {
    cwd: { type: 'string', required: true },
  }),
  toolDef('gate.explain', 'Explain why a gate is non-PASS: missing/failing evidence per required type.', {
    cwd: { type: 'string', required: true },
    gateId: { type: 'string', required: true },
  }),
]

function text(content: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: content }] }
}

async function callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  const cwd = typeof params.cwd === 'string' ? resolve(String(params.cwd)) : process.cwd()
  const loaded = loadProject(cwd)
  if (!loaded) throw new Error(`no .qgate/ in ${cwd}`)
  const paths = storePaths(loaded.qgateDir)
  const profile = findProfile(loaded.profiles, loaded.config.profile)
  const resolved = resolveProfile(loaded.gates, profile, loaded.config.profile)
  const enabled = loaded.gates.filter((g) => resolved.enabled.get(g.metadata.id) === true)

  switch (name) {
    case 'gate.plan': {
      const changedArg = typeof params.changed === 'string' ? params.changed : undefined
      const changed = changedArg ? changedArg.split(',').filter(Boolean) : gitContext(cwd).changedPaths
      const applicable = selectGates(enabled, changed)
      return text(JSON.stringify({
        profile: resolved.profileId, tier: resolved.tier,
        changed,
        gates: applicable.map((g) => ({ id: g.metadata.id, domain: g.spec.domain, triggers: g.spec.triggers, claims: g.spec.claims })),
      }, null, 2))
    }
    case 'gate.run': {
      const target = typeof params.gate === 'string' ? params.gate : 'all'
      const trigger = ['task_start', 'before_change', 'after_edit', 'task_close', 'pre_commit', 'release'].includes(String(params.trigger))
        ? (String(params.trigger) as 'task_close')
        : 'task_close'
      const git = gitContext(cwd)
      const toRun = target === 'all'
        ? (git.changedPaths.length > 0 ? selectGates(enabled, git.changedPaths) : enabled)
        : enabled.filter((g) => g.metadata.id === target)
      if (toRun.length === 0) throw new Error(`gate not found or disabled: ${target}`)
      const results = []
      for (const spec of toRun) {
        const r = await runGate({ spec, trigger, workspace: cwd, qgateDir: loaded.qgateDir, changedPaths: git.changedPaths })
        results.push({ gateId: spec.metadata.id, verdict: r.run.verdict, conditions: r.run.conditions, failureSummary: r.run.failureSummary, runId: r.run.runId })
      }
      return text(JSON.stringify(results, null, 2))
    }
    case 'gate.status': {
      const state = latestRuns(paths)
      return text(JSON.stringify({
        profile: resolved.profileId, tier: resolved.tier,
        gates: enabled.map((g) => {
          const entry = state[g.metadata.id]
          return { gateId: g.metadata.id, domain: g.spec.domain, verdict: entry?.verdict ?? 'INCONCLUSIVE', blocking: entry ? entry.verdict === 'FAIL' || entry.verdict === 'INCONCLUSIVE' : true }
        }),
      }, null, 2))
    }
    case 'gate.get_evidence': {
      const runId = typeof params.runId === 'string' && params.runId.startsWith('run-')
        ? params.runId
        : latestRuns(paths)[String(params.gateId ?? '')]?.runId
      if (!runId) throw new Error('no run found (pass gateId or runId)')
      const run = loadRun(paths, runId)
      const evidence = loadRunEvidence(paths, runId)
      return text(JSON.stringify({ run, evidence: evidence.map((e) => ({ type: e.type, result: e.result, execution: e.execution, producer: e.producer, summary: e.summary, artifacts: e.artifacts })) }, null, 2))
    }
    case 'gate.get_failures': {
      const state = latestRuns(paths)
      const failures = enabled
        .map((g) => ({ gateId: g.metadata.id, verdict: state[g.metadata.id]?.verdict ?? 'INCONCLUSIVE' }))
        .filter((x) => x.verdict !== 'PASS' && x.verdict !== 'WAIVED' && x.verdict !== 'NOT_APPLICABLE')
      return text(JSON.stringify(failures.length ? failures : { ok: true, note: 'no failing gates' }, null, 2))
    }
    case 'gate.get_risks': {
      const now = Date.now()
      return text(JSON.stringify({
        risks: listRisks(paths),
        waivers: listWaivers(paths).map((w) => ({ ...w, active: w.expiresAt > now })),
      }, null, 2))
    }
    case 'gate.explain': {
      const gateId = String(params.gateId ?? '')
      const spec = enabled.find((g) => g.metadata.id === gateId)
      if (!spec) throw new Error(`gate not found or disabled: ${gateId}`)
      const entry = latestRuns(paths)[gateId]
      const run = entry ? loadRun(paths, entry.runId) : undefined
      const evidence = run ? loadRunEvidence(paths, run.runId) : []
      const missing = spec.spec.evidence.required.filter((t) => !evidence.some((e) => e.type === t && e.execution === 'exercised'))
      return text(JSON.stringify({
        gateId, verdict: run?.verdict ?? 'INCONCLUSIVE', failureSummary: run?.failureSummary,
        conditions: run?.conditions,
        evidenceStatus: spec.spec.evidence.required.map((t) => {
          const ev = evidence.filter((e) => e.type === t).sort((a, b) => b.provenance.startedAt - a.provenance.startedAt)[0]
          return { type: t, result: ev?.result ?? 'MISSING', execution: ev?.execution ?? '-', summary: ev?.summary }
        }),
        remediationHint: missing.length
          ? `missing exercised evidence for: ${missing.join(', ')} — run the gate (gate.run) and fix reported failures`
          : 'all required evidence exercised — check failing assertions in evidence summaries',
      }, null, 2))
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handleMessage(req: JsonRpcRequest): Promise<void> {
  if (req.id === undefined || req.id === null) return // notification — ack by silence
  try {
    if (req.method === 'initialize') {
      send({
        jsonrpc: '2.0', id: req.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      })
      return
    }
    if (req.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } })
      return
    }
    if (req.method === 'tools/call') {
      const name = String(req.params?.name ?? '')
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>
      try {
        const result = await callTool(name, args)
        send({ jsonrpc: '2.0', id: req.id, result })
      } catch (e) {
        send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: `error: ${(e as Error).message}` }], isError: true } })
      }
      return
    }
    if (req.method === 'ping') {
      send({ jsonrpc: '2.0', id: req.id, result: {} })
      return
    }
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } })
  } catch (e) {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: (e as Error).message } })
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let req: JsonRpcRequest
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest
  } catch {
    return
  }
  void handleMessage(req)
})
rl.on('close', () => process.exit(0))
