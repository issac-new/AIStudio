// contract executor（v0.3 R1，上游 alignment/api-surface/consumer-matrix 本地方言）。
// 观察文件模式：同门先行的 command executor 把观察产物写成 JSON 文件，本 executor 只做内核判定——
// runner 无权自判（上游 ADR-0007），证据形态为差异清单/兼容矩阵。
//   mode=diff     —— 期望契约 vs 观察契约的 JSON Pointer 深比较（ignorePaths 只豁免声明路径）
//   mode=breaking —— 观察文件为外部 diff 工具报告 {checked, breaking[]}；checked!==true → error
//   mode=surface  —— openapi.json 面枚举（端点 method+path）+ 可选 contentSha256 绑定
//   mode=matrix   —— 逐消费者期望（consumersDir/*.json）vs 观察到的 provider 面，产出兼容矩阵与归因
// 纪律：文件缺失/JSON 畸形/结构不符 → error 证据（INCONCLUSIVE）；差异/破坏 → FAIL 点名。

import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { jsonPointerDiff } from '../core/diff.js'

export interface ContractExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
}

function readJson(file: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** requireLive 来源约束（v0.3.1，上游 v1.30 F02 liveModeBlock 本地方言）：
    开启后观察文件顶层须显式 mode:'live'|'static'——缺失同样 fail（无法区分实时观察
    与不回报来源的旧 producer，缺失不比诚实的 static 更易放行）；static 即 fail；
    畸形值 error（fail-closed）。未开启时缺失＝未声明，保持兼容。
    diff/breaking/matrix 三消费路径共用同一判定（上游 alignment 同构）。 */
function liveModeBlock(observedDoc: unknown): { block: 'fail' | 'error'; reason: string } | null {
  const v = observedDoc as Record<string, unknown> | null
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { block: 'error', reason: 'observation not an object — cannot read mode declaration' }
  if (v.mode === undefined) return { block: 'fail', reason: 'missingObservationMode: observation lacks mode:"live"|"static" — undeclared source is no better than honest static' }
  if (v.mode === 'live') return null
  if (v.mode === 'static') return { block: 'fail', reason: 'static observation: requireLive demands live observation, static is not acceptable evidence' }
  return { block: 'error', reason: `invalid observation mode: ${JSON.stringify(v.mode)} (expected "live"|"static")` }
}

interface Endpoint { method: string; path: string }

function endpointsOfOpenApi(doc: unknown): Endpoint[] | { error: string } {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return { error: 'openapi doc must be an object' }
  const paths = (doc as Record<string, unknown>).paths
  if (typeof paths !== 'object' || paths === null || Array.isArray(paths)) return { error: 'openapi doc lacks paths object' }
  const out: Endpoint[] = []
  const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch']
  for (const [p, item] of Object.entries(paths as Record<string, unknown>)) {
    if (typeof item !== 'object' || item === null) continue
    for (const m of Object.keys(item as Record<string, unknown>)) {
      if (METHODS.includes(m)) out.push({ method: m.toUpperCase(), path: p })
    }
  }
  return out
}

export function runContractExecutor(executor: ExecutorSpec, input: ContractExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-contract`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'spec-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const done = (result: Evidence['result'], summary: string, paths?: string[]): Evidence => {
    ev.result = result
    ev.execution = result === 'error' ? 'wired' : 'exercised'
    ev.summary = summary.slice(0, 400)
    if (paths) ev.provenance.affectedPaths = paths.slice(0, 100)
    ev.provenance.endedAt = Date.now()
    return ev
  }
  const rel = (p: string | undefined): string | undefined => (p ? join(input.workspace, p) : undefined)

  if (executor.mode === 'diff') {
    const expected = rel(executor.expectedFile)
    const observed = rel(executor.observedFile)
    if (!expected || !observed) return done('error', 'contract diff requires expectedFile and observedFile')
    if (!existsSync(expected)) return done('error', `expected contract missing: ${executor.expectedFile}`)
    if (!existsSync(observed)) return done('error', `observed contract missing: ${executor.observedFile} — declare a producing command executor in the same gate`)
    const e = readJson(expected)
    const o = readJson(observed)
    if ('error' in e) return done('error', `expected contract malformed: ${e.error}`)
    if ('error' in o) return done('error', `observed contract malformed: ${o.error}`)
    if (executor.requireLive) {
      const live = liveModeBlock(o.value)
      if (live) return done(live.block, live.reason)
      // mode 是来源声明（协议元字段），不是契约内容——diff 前剥除，否则 live 观察必然漂移
      const stripped = { ...(o.value as Record<string, unknown>) }
      delete stripped.mode
      const diffs = jsonPointerDiff(e.value, stripped, executor.ignorePaths ?? [])
      if (diffs.length === 0) return done('pass', `observed contract matches expected (${executor.expectedFile}, live mode)`)
      return done('fail', `contract drift (${diffs.length}): ${diffs.slice(0, 6).map((d) => `${d.pointer} ${d.kind} (${d.detail})`).join(' | ')}${diffs.length > 6 ? ` …+${diffs.length - 6}` : ''}`, diffs.map((d) => d.pointer))
    }
    const diffs = jsonPointerDiff(e.value, o.value, executor.ignorePaths ?? [])
    if (diffs.length === 0) return done('pass', `observed contract matches expected (${executor.expectedFile}), ${executor.ignorePaths?.length ?? 0} ignore paths`)
    return done('fail', `contract drift (${diffs.length}): ${diffs.slice(0, 6).map((d) => `${d.pointer} ${d.kind} (${d.detail})`).join(' | ')}${diffs.length > 6 ? ` …+${diffs.length - 6}` : ''}`, diffs.map((d) => d.pointer))
  }

  if (executor.mode === 'breaking') {
    const observed = rel(executor.observedFile)
    if (!observed) return done('error', 'contract breaking requires observedFile (external diff tool report)')
    if (!existsSync(observed)) return done('error', `diff report missing: ${executor.observedFile}`)
    const o = readJson(observed)
    if ('error' in o) return done('error', `diff report malformed: ${o.error}`)
    const v = o.value as Record<string, unknown>
    if (v.checked !== true) return done('error', `diff report not checked (checked=${JSON.stringify(v.checked)}) — tool must declare checked:true`)
    if (executor.requireLive) {
      const live = liveModeBlock(o.value)
      if (live) return done(live.block, live.reason)
    }
    const breaking = Array.isArray(v.breaking) ? (v.breaking as unknown[]).filter((x): x is string => typeof x === 'string') : undefined
    if (breaking === undefined) return done('error', 'diff report lacks breaking[] array')
    if (breaking.length === 0) return done('pass', `no breaking changes (checked, ${breaking.length} breaking)`)
    return done('fail', `breaking changes (${breaking.length}): ${breaking.slice(0, 6).join(' | ')}`, breaking)
  }

  if (executor.mode === 'surface') {
    const surface = rel(executor.surfaceFile)
    if (!surface) return done('error', 'api-surface requires surfaceFile (openapi.json)')
    if (!existsSync(surface)) return done('error', `api surface file missing: ${executor.surfaceFile}`)
    const doc = readJson(surface)
    if ('error' in doc) return done('error', `api surface malformed: ${doc.error}`)
    const endpoints = endpointsOfOpenApi(doc.value)
    if ('error' in endpoints) return done('error', `api surface invalid: ${endpoints.error}`)
    // contentSha256 绑定：登记文件（observedFile 可选携带 {surfaceFile, contentSha256}）
    const regFile = rel(executor.observedFile)
    if (regFile && existsSync(regFile)) {
      const reg = readJson(regFile)
      if ('error' in reg) return done('error', `api-surface register malformed: ${reg.error}`)
      const r = reg.value as Record<string, unknown>
      const want = typeof r.contentSha256 === 'string' ? r.contentSha256 : undefined
      if (want) {
        // 目录/不可读降级 error 证据而非抛 EISDIR 炸整 run
        let surfaceBuf: Buffer
        try {
          surfaceBuf = readFileSync(surface)
        } catch (e) {
          return done('error', `api surface file unreadable (${(e as Error).message})`)
        }
        const actual = createHash('sha256').update(surfaceBuf).digest('hex')
        if (actual !== want) return done('fail', `api surface content sha256 drifted: declared ${want.slice(0, 12)}…, actual ${actual.slice(0, 12)}…`)
      }
    }
    if (endpoints.length === 0) return done('fail', 'api surface declares no endpoints')
    return done('pass', `api surface enumerated: ${endpoints.length} endpoints (${[...new Set(endpoints.map((e) => e.method))].join('/')})`, endpoints.map((e) => `${e.method} ${e.path}`))
  }

  if (executor.mode === 'matrix') {
    const dir = rel(executor.consumersDir)
    const observed = rel(executor.observedFile)
    if (!dir || !observed) return done('error', 'consumer-matrix requires consumersDir and observedFile (provider surface)')
    if (!existsSync(dir)) return done('error', `consumers dir missing: ${executor.consumersDir}`)
    if (!existsSync(observed)) return done('error', `provider surface observation missing: ${executor.observedFile}`)
    const prov = readJson(observed)
    if ('error' in prov) return done('error', `provider surface malformed: ${prov.error}`)
    const pv = prov.value as Record<string, unknown>
    if (executor.requireLive) {
      const live = liveModeBlock(prov.value)
      if (live) return done(live.block, live.reason)
    }
    const provEndpoints = Array.isArray(pv.endpoints)
      ? pv.endpoints.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      : undefined
    if (!provEndpoints) return done('error', 'provider surface lacks endpoints[]')
    const provKeys = new Set(provEndpoints.map((e) => `${String(e.method).toUpperCase()} ${String(e.path)}`))
    const fieldsBy = new Map<string, Set<string>>()
    for (const e of provEndpoints) {
      const key = `${String(e.method).toUpperCase()} ${String(e.path)}`
      const fields = new Set<string>()
      const body = e.requestBodyFields
      if (Array.isArray(body)) for (const f of body) if (typeof f === 'string') fields.add(f)
      fieldsBy.set(key, fields)
    }
    const broken: string[] = []
    const matrix: string[] = []
    // existsSync 对"文件"也为真——consumersDir 配成文件时 readdirSync 抛 ENOTDIR
    // 会炸穿整轮 run（runGate 对 executor 无 try/catch），故读目录自身 fail-soft
    let files: string[]
    try {
      files = readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
    } catch (e) {
      return done('error', `consumers dir unreadable: ${executor.consumersDir} (${e instanceof Error ? e.message : String(e)})`)
    }
    if (files.length === 0) return done('error', `consumers dir empty: ${executor.consumersDir}`)
    for (const name of files) {
      const c = readJson(join(dir, name))
      if ('error' in c) return done('error', `consumer file malformed (${name}): ${c.error}`)
      const cv = c.value as Record<string, unknown>
      const consumer = typeof cv.consumer === 'string' ? cv.consumer : name.replace(/\.json$/, '')
      const expectedList = Array.isArray(cv.expected) ? cv.expected.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : undefined
      if (!expectedList) return done('error', `consumer ${consumer} lacks expected[]`)
      for (const need of expectedList) {
        const key = `${String(need.method).toUpperCase()} ${String(need.path)}`
        if (!provKeys.has(key)) {
          broken.push(`${consumer}: ${key} missing from provider`)
          matrix.push(`${consumer} ${key} BROKEN`)
          continue
        }
        const needFields = Array.isArray(need.fields) ? (need.fields as unknown[]).filter((f): f is string => typeof f === 'string') : []
        const offered = fieldsBy.get(key) ?? new Set<string>()
        const missingFields = needFields.filter((f) => !offered.has(f))
        if (missingFields.length > 0) {
          broken.push(`${consumer}: ${key} lacks request fields ${missingFields.join(',')}`)
          matrix.push(`${consumer} ${key} BROKEN(${missingFields.length} fields)`)
        } else {
          matrix.push(`${consumer} ${key} ok`)
        }
      }
    }
    if (broken.length > 0) return done('fail', `consumer matrix has ${broken.length} broken expectation(s): ${broken.slice(0, 6).join(' | ')}`, broken)
    return done('pass', `consumer matrix clean: ${matrix.length} expectations across ${files.length} consumers`, matrix)
  }

  return done('error', `unknown contract mode: ${String(executor.mode)}`)
}
