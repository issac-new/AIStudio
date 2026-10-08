#!/usr/bin/env node
// qgate CLI（基础接口，v0.1 §38）：plan / run / status / explain / evidence / risk / validate-config。
// 用法：node dist/cli.js <command> [options]（cwd = 项目根）。
// 退出码：0=全部 PASS/无阻断；1=存在 FAIL/INCONCLUSIVE 阻断；2=配置或环境错误。

import { resolve, join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { loadProject } from './core/loader.js'
import { runGate, gitContext } from './core/run.js'
import { storePaths, latestRuns, loadRun, loadRunEvidence, isFresh, listRisks, saveWaiver, listWaivers } from './core/store.js'
import { resolveProfile, findProfile, effectivePolicy, isBlockingVerdict } from './core/profile.js'
import { selectGates, appliesToChanged } from './core/impact.js'
import { tierOfProfile, VERDICT_TO_DELIVERY } from './core/align.js'
import { buildReleaseReport, renderReleaseReportMd, FIX_FIRST_DISCIPLINE } from './core/report.js'
import { SOURCE_LABEL_ZH, renderSourceDistribution, type SourceBucket } from './core/sources.js'
import { declaredBudgetMs, recordBudgetExhausted } from './core/run.js'
import { inputGlobsOf, listWorkspaceFiles, snapshotForGlobs } from './core/snapshot.js'
import { TASK_INTENT_DEFAULT_FILE, loadTaskIntent, writeTaskIntent } from './core/task-intent.js'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { cacheGc } from './core/cache.js'
import type { GateSpec, Trigger } from './core/types.js'

const HELP = `qgate — universal delivery gate CLI
commands:
  validate-config                     解析 .qgate/ 配置并报告诊断
  plan [--changed p1,p2]              列出适用门（影响分析）
  run <gateId|--all> [--trigger t]    执行门并落证据
  status [--fresh] [--json]           每门最新判定（--fresh 附新鲜度）
  explain <gateId>                    解释非 PASS 的原因
  evidence <gateId|runId>             列出证据
  risk                                列出登记的 Risk
  waive <gateId> --reason --approver  登记豁免（WAIVED；必填 reason/approver，默认 24h 过期）
    [--scope s] [--mitigation m] [--hours N] [--revalidation r]
  exceptions                          列出豁免及有效性
  intent --task-id --statement --scope --acceptance --confirmed-by
                                      登记任务意图（唯一写入通道；--revise --reason 修订留痕并自动重绑哈希）
  templates                           档位模板一览（profile × 门面，选档参考）
  inspect                             只读体检：诊断/登记在档/判定新鲜度
  leftovers                           只读扫描 .qgate/ 未引用残留
  update --profile <id>               受控切档（改后即校验）
  release-report [--out <file>]       生成发布证据包（md + json）
  init                                在当前项目创建 .qgate/ 骨架`

function fail(msg: string): never {
  process.stderr.write(`qgate: ${msg}\n`)
  process.exit(2)
}

function args(): { cmd: string; rest: string[] } {
  const [cmd, ...rest] = process.argv.slice(2)
  return { cmd: cmd ?? '', rest }
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name)
  return i >= 0 ? rest[i + 1] : undefined
}

function hasFlag(rest: string[], name: string): boolean {
  return rest.includes(name)
}

const TRIGGERS: Trigger[] = ['task_start', 'before_change', 'after_edit', 'task_close', 'pre_commit', 'release']

async function main(): Promise<void> {
  const { cmd, rest } = args()
  const workspace = resolve(process.cwd())

  if (cmd === 'help' || cmd === '--help' || cmd === '') {
    process.stdout.write(HELP + '\n')
    return
  }

  if (cmd === 'init') {
    const fs = await import('node:fs')
    fs.mkdirSync(resolve(workspace, '.qgate', 'gates'), { recursive: true })
    fs.mkdirSync(resolve(workspace, '.qgate', 'registers'), { recursive: true })
    fs.mkdirSync(resolve(workspace, '.qgate', 'observations'), { recursive: true })
    const cfg = resolve(workspace, '.qgate', 'qgate.yaml')
    if (!fs.existsSync(cfg)) {
      fs.writeFileSync(cfg, 'profile: feature-close\nclaims: []\n', 'utf8')
    }
    process.stdout.write(`initialized ${resolve(workspace, '.qgate')} (gates/ registers/ observations/)\n`)
    return
  }

  const loaded = loadProject(workspace)
  if (!loaded) fail(`no .qgate/ directory in ${workspace} — run 'qgate init' first`)
  const paths = storePaths(loaded.qgateDir)
  const profile = findProfile(loaded.profiles, loaded.config.profile)
  const resolved = resolveProfile(loaded.gates, profile, loaded.config.profile)
  const enabledGates = loaded.gates.filter((g) => resolved.enabled.get(g.metadata.id) === true)

  // ── R5 配置生命周期（templates/inspect/leftovers/update；上游本地方言：
  //    本地配置是声明式 .qgate/，无单文件装配——templates 是选档参考，update 只做受控切档） ──

  if (cmd === 'templates') {
    const byDomain = new Map<string, number>()
    for (const g of loaded.gates) byDomain.set(g.spec.domain, (byDomain.get(g.spec.domain) ?? 0) + 1)
    process.stdout.write(`available profiles: ${loaded.profiles.map((p) => `${p.metadata.id}${p.metadata.tier ? `(${p.metadata.tier})` : ''}`).join(', ') || '(none)'}\n`)
    process.stdout.write(`builtin gates by domain: ${[...byDomain.entries()].map(([d, n]) => `${d}=${n}`).join(' ')} (total ${loaded.gates.length})\n`)
    for (const p of loaded.profiles) {
      const r = resolveProfile(loaded.gates, p, p.metadata.id)
      const enabled = loaded.gates.filter((g) => r.enabled.get(g.metadata.id))
      process.stdout.write(`  ${p.metadata.id}${p.metadata.tier ? ` [tier=${p.metadata.tier}]` : ''} → ${enabled.length} gates: ${enabled.map((g) => g.metadata.id).join(' ')}\n`)
    }
    process.stdout.write(`switch via: qgate update --profile <id>（或手改 .qgate/qgate.yaml）\n`)
    return
  }

  if (cmd === 'inspect') {
    const state = latestRuns(paths)
    const git = gitContext(workspace)
    const sharedFiles = listWorkspaceFiles(workspace)
    const registers = ['requirements.json', 'task-intent.json', 'assumptions.json', 'decisions.json', 'debt.json', 'budget.json', 'rerun.json', 'topology.json', 'catalog.json']
    process.stdout.write(`project: ${workspace}\n`)
    process.stdout.write(`profile: ${resolved.profileId}${resolved.tier ? ` (tier=${resolved.tier})` : ''} · gates ${loaded.gates.length} (enabled ${enabledGates.length})\n`)
    process.stdout.write(`diagnostics: ${loaded.diagnostics.length === 0 ? 'clean' : `${loaded.diagnostics.length} issue(s)`}\n`)
    for (const d of loaded.diagnostics) process.stdout.write(`  ✗ ${d.path}: ${d.message}\n`)
    process.stdout.write(`registers (in .qgate/registers/):\n`)
    for (const r of registers) {
      process.stdout.write(`  ${existsSync(join(loaded.qgateDir, 'registers', r)) ? '✓' : '–'} ${r}\n`)
    }
    process.stdout.write(`latest verdicts:\n`)
    for (const g of enabledGates) {
      const entry = state[g.metadata.id]
      if (!entry) { process.stdout.write(`  ? ${g.metadata.id}: never run\n`); continue }
      const run = loadRun(paths, entry.runId)
      const globs = inputGlobsOf(g)
      const currentSnapshot = run && globs.length > 0 ? snapshotForGlobs(workspace, globs, sharedFiles) : undefined
      const fresh = run ? isFresh(run, Date.now(), { commit: git.commit, treeHash: git.treeHash, changedPaths: git.changedPaths, appliesWhen: g.spec.appliesWhen, inputSnapshot: currentSnapshot }, effectivePolicy(g, resolved).maxAgeHours ?? 24) : false
      process.stdout.write(`  ${fresh ? '✓' : '✗'} ${g.metadata.id}: ${entry.verdict} (${fresh ? 'fresh' : 'stale'})\n`)
    }
    return
  }

  if (cmd === 'leftovers') {
    const known = new Set(['qgate.yaml', 'state.json', 'hooks.log', 'stop-state.json', 'release-report.md', 'release-report.json', 'junit-report.xml', 'baseline.json', '.gitignore'])
    const reservedDirs = new Set(['runs', 'evidence', 'risks', 'exceptions', 'cache', 'registers', 'observations', 'gates', 'profiles'])
    const leftovers: string[] = []
    try {
      for (const name of readdirSync(loaded.qgateDir)) {
        if (reservedDirs.has(name) || known.has(name)) continue
        leftovers.push(name)
      }
    } catch {
      fail('.qgate/ unreadable')
    }
    if (leftovers.length === 0) process.stdout.write('✓ no leftovers in .qgate/\n')
    else {
      process.stdout.write('leftover candidates (unreferenced, review before removing):\n')
      for (const l of leftovers) process.stdout.write(`  ? ${l}\n`)
    }
    return
  }

  if (cmd === 'update') {
    const profileArg = flag(rest, '--profile')
    if (!profileArg) fail('usage: update --profile <id>（当前仅支持 profile 切档；门与登记的演进直接改对应 YAML/JSON——声明式配置无破坏性迁移）')
    if (!loaded.profiles.some((p) => p.metadata.id === profileArg)) {
      fail(`unknown profile: ${profileArg}（qgate templates 查看可用档）`)
    }
    const cfgFile = join(loaded.qgateDir, 'qgate.yaml')
    const raw = readFileSync(cfgFile, 'utf8')
    const next = /^profile:\s*.+$/m.test(raw)
      ? raw.replace(/^profile:\s*.+$/m, `profile: ${profileArg}`)
      : `profile: ${profileArg}\n${raw}`
    writeFileSync(cfgFile, next, 'utf8')
    const reloaded = loadProject(workspace)
    if (!reloaded) fail('update left project unloadable (refusing to keep)')
    process.stdout.write(`profile switched to ${profileArg} (${reloaded.gates.length} gates loaded, ${reloaded.diagnostics.length} diagnostics)\n`)
    return
  }

  if (loaded.diagnostics.length > 0 && cmd === 'validate-config') {
    for (const d of loaded.diagnostics) process.stdout.write(`DIAG ${d.path}: ${d.message}\n`)
  }

  switch (cmd) {
    case 'validate-config': {
      let ok = true
      for (const d of loaded.diagnostics) { ok = false; process.stdout.write(`✗ ${d.path}: ${d.message}\n`) }
      if (!loaded.diagnostics.length) process.stdout.write('✓ no diagnostics\n')
      process.stdout.write(`gates: ${loaded.gates.length} (enabled: ${enabledGates.length}, profile: ${resolved.profileId}${resolved.tier ? ` tier=${resolved.tier}` : ''})\n`)
      process.stdout.write(`claims: ${loaded.config.claims.length}\n`)
      process.exit(ok ? 0 : 2)
      return
    }

    case 'plan': {
      const changedArg = flag(rest, '--changed')
      const changed = changedArg ? changedArg.split(',').filter(Boolean) : gitContext(workspace).changedPaths
      const applicable = selectGates(enabledGates, changed)
      process.stdout.write(`profile: ${resolved.profileId}${resolved.tier ? ` (tier=${resolved.tier})` : ''}\n`)
      process.stdout.write(`changed: ${changed.length === 0 ? '(none)' : changed.slice(0, 20).join(', ')}${changed.length > 20 ? ` …+${changed.length - 20}` : ''}\n`)
      for (const g of applicable) {
        process.stdout.write(`  ${g.metadata.id} [${g.spec.domain}] triggers=${g.spec.triggers.join('|')} claims=${g.spec.claims.join(',')}\n`)
      }
      if (applicable.length === 0) process.stdout.write('  (no applicable gates)\n')
      return
    }

    case 'run': {
      const target = rest[0]
      const triggerArg = flag(rest, '--trigger') ?? 'task_close'
      const trigger = (TRIGGERS as string[]).includes(triggerArg) ? (triggerArg as Trigger) : 'task_close'
      const changedArg = flag(rest, '--changed')
      const budgetArg = flag(rest, '--budget-ms')
      const budgetMs = budgetArg !== undefined ? Number(budgetArg) : undefined
      if (budgetMs !== undefined && (!Number.isFinite(budgetMs) || budgetMs <= 0)) fail('--budget-ms must be a positive number')
      const deadline = budgetMs !== undefined ? Date.now() + budgetMs : undefined
      const git = gitContext(workspace)
      const changed = changedArg ? changedArg.split(',').filter(Boolean) : git.changedPaths
      const toRun: GateSpec[] =
        target === '--all'
          ? (changed.length > 0 ? selectGates(enabledGates, changed) : enabledGates)
          : enabledGates.filter((g) => g.metadata.id === target)
      if (toRun.length === 0) fail(target ? `gate not found or disabled: ${target}` : 'missing gateId or --all')
      // 元门二轮通道（v0.3 §3.3）：meta 门排在普通门之后——它们的输入是其他门的本轮判定。
      const ordered = [...toRun.filter((g) => g.spec.meta !== true), ...toRun.filter((g) => g.spec.meta === true)]
      let blocking = 0
      const runIds: string[] = []
      const buckets: Array<SourceBucket | undefined> = []
      const advisoryLines: string[] = []
      for (const spec of ordered) {
        // 预算执法（上游 v1.30 F01 本地方言）：宿主给出预算时，启动前比较剩余期限与
        // 门声明预算——不足即不启动，落 error 证据（fail-closed，不是 SKIP）。
        if (deadline !== undefined) {
          const remaining = deadline - Date.now()
          const declared = declaredBudgetMs(spec)
          if (remaining < declared) {
            const result = recordBudgetExhausted({ spec, trigger, workspace, qgateDir: loaded.qgateDir, changedPaths: changed, effectivePolicy: effectivePolicy(spec, resolved) }, declared, remaining)
            runIds.push(result.run.runId)
            const policy = effectivePolicy(spec, resolved)
            if ((result.run.verdict === 'FAIL' && policy.failure === 'block') || (result.run.verdict === 'INCONCLUSIVE' && policy.inconclusive === 'block')) blocking++
            buckets.push(undefined)
            process.stdout.write(`△ ${spec.metadata.id}: ${result.run.verdict} — ${result.run.failureSummary}\n`)
            continue
          }
        }
        const result = await runGate({ spec, trigger, workspace, qgateDir: loaded.qgateDir, changedPaths: changed, effectivePolicy: effectivePolicy(spec, resolved) })
        runIds.push(result.run.runId)
        const policy = effectivePolicy(spec, resolved)
        const isBlocking =
          (result.run.verdict === 'FAIL' && policy.failure === 'block') ||
          (result.run.verdict === 'INCONCLUSIVE' && policy.inconclusive === 'block')
        if (isBlocking) blocking++
        buckets.push(result.run.sourceSignal?.bucket)
        if (result.run.verdict === 'CONDITIONAL') advisoryLines.push(`${spec.metadata.id}: ${(result.run.conditions ?? []).join('; ')}`)
        const src = result.run.sourceSignal ? ` [来源 ${SOURCE_LABEL_ZH[result.run.sourceSignal.bucket]}]` : ''
        process.stdout.write(
          `${isBlocking ? '✗' : result.run.verdict === 'PASS' ? '✓' : '△'} ${spec.metadata.id}: ${result.run.verdict}${src}` +
          `${result.run.conditions ? ` — ${result.run.conditions.join('; ')}` : ''}` +
          `${result.run.failureSummary ? ` — ${result.run.failureSummary}` : ''}\n`,
        )
      }
      // 来源分布聚合行（上游 v1.26）：混合来源不可能被读成全部已核验
      const dist = { verified: 0, declared: 0, degraded: 0, none: 0 }
      for (const b of buckets) if (b) dist[b] += 1
      process.stdout.write(`来源分布: ${renderSourceDistribution(dist)}（非 PASS 门禁不计入）\n`)
      // advisory 可见性（上游 v1.26）：不阻断判定，但不得静默
      if (advisoryLines.length > 0) process.stdout.write(`advisory（不阻断）: ${advisoryLines.join(' | ')}\n`)
      // §49 缓存生命周期：随 run 触发过期清理（此前 cacheGc 定义后无任何调用点，
      // .qgate/cache/evidence/ 按 key 无限累积）
      try { cacheGc(loaded.qgateDir) } catch { /* GC 失败不影响判定 */ }
      // §51 evidenceCommit：把本次运行证据归档进可提交区（对齐交付标准"证据落卡"）
      if (loaded.config.evidenceCommit) {
        const { cpSync, mkdirSync: mk } = await import('node:fs')
        for (const id of runIds) {
          const src = join(paths.evidenceDir, id)
          if (!existsSync(src)) continue
          const dst = resolve(workspace, 'docs', 'delivery-evidence', id)
          mk(resolve(dst, '..'), { recursive: true })
          cpSync(src, dst, { recursive: true })
        }
        process.stdout.write(`evidence archived to docs/delivery-evidence/ (${runIds.length} runs)\n`)
      }
      if (blocking > 0) process.stdout.write(`fix-first: ${FIX_FIRST_DISCIPLINE}\n`)
      process.exit(blocking > 0 ? 1 : 0)
      return
    }

    case 'intent': {
      // 任务意图登记（v0.3 §4.2）：唯一写入通道——登记/修订只经本命令，修订必须带 reason 留痕。
      const revise = hasFlag(rest, '--revise')
      const fileRel = flag(rest, '--file') ?? TASK_INTENT_DEFAULT_FILE
      const file = resolve(workspace, fileRel)
      const prev = revise ? loadTaskIntent(file) : null
      if (revise && !prev) fail(`cannot revise: no valid task-intent register at ${fileRel}`)
      const scopeArg = flag(rest, '--scope')
      const acceptanceArg = flag(rest, '--acceptance')
      const input = {
        taskId: flag(rest, '--task-id') ?? prev?.taskId,
        statement: flag(rest, '--statement') ?? prev?.statement,
        scope: scopeArg ? scopeArg.split(',').map((s) => s.trim()).filter(Boolean) : prev?.scope,
        acceptance: acceptanceArg ? acceptanceArg.split(';').map((s) => s.trim()).filter(Boolean) : prev?.acceptance,
        constraints: flag(rest, '--constraints')?.split(',').map((s) => s.trim()).filter(Boolean) ?? prev?.constraints,
        confirmedBy: flag(rest, '--confirmed-by') ?? prev?.confirmedBy,
      }
      if (!input.taskId || !input.statement || !input.scope?.length || !input.acceptance?.length || !input.confirmedBy) {
        fail('usage: intent --task-id T --statement "..." --scope "src/**,db/**" --acceptance "When..Then..;When..Then.." --confirmed-by <name> [--constraints a,b] [--file path]\n       intent --revise --reason "..." [同上字段可覆盖]')
      }
      let written
      try {
        written = writeTaskIntent(file, input as Parameters<typeof writeTaskIntent>[1], { revise, reason: flag(rest, '--reason') })
      } catch (e) {
        fail((e as Error).message)
      }
      process.stdout.write(`${revise ? 'revised' : 'registered'} task-intent ${written.intent.taskId} → ${fileRel}\n`)
      process.stdout.write(`sha256: ${written.sha256}\n`)

      // 哈希重绑：项目门声明里引用本登记文件的 taskIntent.acknowledgedSha256 同步更新。
      const gatesDir = join(loaded.qgateDir, 'gates')
      const rebound: string[] = []
      if (existsSync(gatesDir)) {
        const { readdirSync } = await import('node:fs')
        for (const name of readdirSync(gatesDir).sort()) {
          if (!/\.(ya?ml|json)$/i.test(name)) continue
          const gateFile = join(gatesDir, name)
          const text = readFileSync(gateFile, 'utf8')
          if (!text.includes('taskIntent') || !text.includes(fileRel)) continue
          let next = text
          // 重绑须锚定本登记文件的 taskIntent 块（2026-10-02 审查批）：全局替换首个
          // acknowledgedSha256 会把多绑定门文件中 A 块的 pin 覆写成 B 登记文件的哈希，
          // A 从此恒 FAIL intent-file-modified（错误数据持久化进门配置）。
          const escaped = fileRel.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')
          const fileLine = new RegExp(`^(\\s*)(file:\\s*["']?${escaped}["']?\\s*)$`, 'm').exec(text)
          if (fileLine) {
            const head = text.slice(0, fileLine.index + fileLine[0].length)
            const tail = text.slice(fileLine.index + fileLine[0].length)
            // 只在本 file: 行与下一个 file: 行之间找 pin（同一 taskIntent 块边界）
            const nextFile = /^\s*file:\s/m.exec(tail)
            const seg = nextFile ? tail.slice(0, nextFile.index) : tail
            const rest = nextFile ? tail.slice(nextFile.index) : ''
            if (/^(\s*)acknowledgedSha256:.*$/m.test(seg)) {
              next = head + seg.replace(/^(\s*)acknowledgedSha256:.*$/m, `$1acknowledgedSha256: "${written.sha256}"`) + rest
            } else {
              // 块内无 pin：在 file: 行后同列插入（fileRel 逐字符转义防正则注入；
              // 同列=与 file 同级映射项，多缩进会破坏 YAML 列对齐）
              next = head + `\n${fileLine[1]}acknowledgedSha256: "${written.sha256}"` + tail
            }
          } else if (/^(\s*)acknowledgedSha256:.*$/m.test(text)) {
            // 无可锚定 file: 行的旧形态门文件：退回全局首处替换（单块语义下等价）
            next = text.replace(/^(\s*)acknowledgedSha256:.*$/m, `$1acknowledgedSha256: "${written.sha256}"`)
          }
          if (next !== text) {
            writeFileSync(gateFile, next, 'utf8')
            rebound.push(name)
          }
        }
      }
      if (rebound.length > 0) process.stdout.write(`re-bound acknowledgedSha256 in: ${rebound.join(', ')}\n`)
      else process.stdout.write(`note: no project gate references this register — bind it via taskIntent in a gate's scope executor to activate drift reconciliation\n`)
      return
    }

    case 'status': {
      const fresh = hasFlag(rest, '--fresh')
      const json = hasFlag(rest, '--json')
      const state = latestRuns(paths)
      const git = fresh ? gitContext(workspace) : undefined
      // 输入快照重算（v0.3 §3.2）：全门共享一次走树，逐门按 glob 面过滤比对。
      const sharedFiles = fresh ? listWorkspaceFiles(workspace) : undefined
      // 变更面适用集（上游 v1.28 SKIP 成因显式化）：--fresh 时区分"不在变更面"与"从未执行"
      const applicable = fresh && git ? new Set(selectGates(enabledGates, git.changedPaths).map((g) => g.metadata.id)) : null
      const report: Record<string, unknown>[] = []
      const dist = { verified: 0, declared: 0, degraded: 0, none: 0 }
      for (const g of enabledGates) {
        const entry = state[g.metadata.id]
        const run = entry ? loadRun(paths, entry.runId) : undefined
        const policy = effectivePolicy(g, resolved)
        let freshness: 'fresh' | 'stale' | 'never' = 'never'
        if (entry) {
          if (run && fresh && git) {
            const globs = inputGlobsOf(g)
            const currentSnapshot = globs.length > 0 ? snapshotForGlobs(workspace, globs, sharedFiles) : undefined
            freshness = isFresh(run, Date.now(), {
              commit: git.commit, treeHash: git.treeHash, changedPaths: git.changedPaths, appliesWhen: g.spec.appliesWhen,
              inputSnapshot: currentSnapshot,
            }, policy.maxAgeHours ?? 24) ? 'fresh' : 'stale'
          } else if (run) freshness = 'fresh'
        }
        const sourceBucket = run?.sourceSignal?.bucket
        if (sourceBucket) dist[sourceBucket] += 1
        const skipCause: string | undefined =
          applicable && !applicable.has(g.metadata.id) ? 'out-of-change-scope'
            : !entry ? 'never-run'
              : undefined
        const row = {
          gateId: g.metadata.id,
          domain: g.spec.domain,
          verdict: entry?.verdict ?? 'INCONCLUSIVE',
          delivery: VERDICT_TO_DELIVERY[entry?.verdict ?? 'INCONCLUSIVE'],
          freshness: fresh ? freshness : undefined,
          blocking: isBlockingVerdict(entry?.verdict ?? 'INCONCLUSIVE', effectivePolicy(g, resolved)),
          source: sourceBucket ?? null,
          skipCause,
        }
        report.push(row)
        if (!json) {
          process.stdout.write(
            `${row.blocking ? '✗' : '✓'} ${row.gateId} [${row.domain}]: ${row.verdict}` +
            (sourceBucket ? ` [来源 ${SOURCE_LABEL_ZH[sourceBucket]}]` : '') +
            (fresh ? ` (${row.freshness})` : '') +
            (skipCause ? ` — ${skipCause === 'out-of-change-scope' ? '不在变更面（appliesWhen 未命中）' : '从未执行'}` : '') + '\n',
          )
        }
      }
      // advisory 可见面 + 有效豁免可见面（上游 v1.26：不隐藏，但不阻断判定）
      const advisory = report
        .filter((r) => r.verdict === 'CONDITIONAL')
        .map((r) => ({ gateId: r.gateId as string, conditions: (loadRun(paths, state[r.gateId as string].runId)?.conditions) ?? [] }))
      const now = Date.now()
      const waivers = listWaivers(paths)
        .filter((w) => w.expiresAt > now && enabledGates.some((g) => g.metadata.id === w.gateId))
        .map((w) => ({ gateId: w.gateId, by: w.approver, expiresAt: w.expiresAt }))
      if (!json) {
        process.stdout.write(`来源分布: ${renderSourceDistribution(dist)}（非 PASS 门禁不计入）\n`)
        if (advisory.length > 0) process.stdout.write(`advisory（不阻断）: ${advisory.map((a) => `${a.gateId}: ${a.conditions.join('; ')}`).join(' | ')}\n`)
        if (waivers.length > 0) process.stdout.write(`active waivers: ${waivers.map((w) => `${w.gateId} by ${w.by}（不改变门禁判定，仅免于登记阻断，到期 ${new Date(w.expiresAt).toISOString()}）`).join(' | ')}\n`)
      }
      if (json) process.stdout.write(JSON.stringify({
        profile: resolved.profileId,
        tier: resolved.tier ?? tierOfProfile(resolved.profileId),
        gates: report,
        sourceDistribution: dist,
        advisory,
        waivers,
      }, null, 2) + '\n')
      const anyBlocking = report.some((r) => r.blocking)
      process.exit(anyBlocking ? 1 : 0)
      return
    }

    case 'explain': {
      const gateId = rest[0]
      const spec = enabledGates.find((g) => g.metadata.id === gateId)
      if (!spec) fail(`gate not found or disabled: ${gateId}`)
      const entry = latestRuns(paths)[gateId]
      if (!entry) { process.stdout.write(`${gateId}: no run recorded yet — run 'qgate run ${gateId}'\n`); return }
      const run = loadRun(paths, entry.runId)
      if (!run) fail(`state index broken: run ${entry.runId} unreadable`)
      process.stdout.write(`${gateId} → ${run.verdict} (run ${run.runId}, trigger=${run.trigger}, at=${new Date(run.startedAt).toISOString()})\n`)
      if (run.conditions) for (const c of run.conditions) process.stdout.write(`  condition: ${c}\n`)
      if (run.failureSummary) process.stdout.write(`  summary: ${run.failureSummary}\n`)
      const evidence = loadRunEvidence(paths, run.runId)
      for (const type of spec.spec.evidence.required) {
        const ev = evidence.filter((e) => e.type === type)
        const latest = ev.length ? ev.reduce((a, b) => (b.provenance.startedAt >= a.provenance.startedAt ? b : a)) : undefined
        process.stdout.write(
          `  evidence ${type}: ${latest ? `${latest.result}/${latest.execution} by ${latest.producer}` : 'MISSING'}` +
          (latest?.summary ? ` — ${latest.summary}` : '') + '\n',
        )
      }
      if (run.verdict !== 'PASS') process.stdout.write(`  fix-first: ${FIX_FIRST_DISCIPLINE}\n`)
      return
    }

    case 'evidence': {
      const key = rest[0]
      const state = latestRuns(paths)
      const runId = key?.startsWith('run-') ? key : state[key ?? '']?.runId
      if (!runId) fail(`no run found for '${key ?? ''}'`)
      const run = loadRun(paths, runId)
      const evidence = loadRunEvidence(paths, runId)
      process.stdout.write(`run ${runId} gate=${run?.gateId} verdict=${run?.verdict}\n`)
      for (const e of evidence) {
        process.stdout.write(`  ${e.type} ${e.result}/${e.execution} producer=${e.producer}\n`)
        for (const a of e.artifacts ?? []) process.stdout.write(`    artifact: .qgate/evidence/${runId}/${a}\n`)
      }
      return
    }

    case 'risk': {
      const risks = listRisks(paths)
      if (risks.length === 0) { process.stdout.write('(no risks registered)\n'); return }
      for (const r of risks) process.stdout.write(`${r.severity.toUpperCase()} ${r.id} [${r.status}] ${r.description}\n`)
      return
    }

    case 'waive': {
      const gateId = rest[0]
      const reason = flag(rest, '--reason')
      const approver = flag(rest, '--approver')
      if (!gateId || !reason || !approver) fail('usage: waive <gateId> --reason <text> --approver <name> [--scope s] [--mitigation m] [--hours N] [--revalidation r]')
      const spec = loaded.gates.find((g) => g.metadata.id === gateId)
      if (!spec) fail(`gate not found: ${gateId}`)
      if (spec.spec.policy.allowWaiver === false) fail(`gate ${gateId} forbids waiver (policy.allowWaiver=false)`)
      const hours = Number(flag(rest, '--hours') ?? 24)
      if (!Number.isFinite(hours) || hours <= 0) fail('--hours must be a positive number')
      const waiver = {
        id: `waiver-${randomUUID().slice(0, 8)}`,
        gateId,
        reason,
        approver,
        scope: flag(rest, '--scope'),
        mitigation: flag(rest, '--mitigation'),
        expiresAt: Date.now() + hours * 3_600_000,
        revalidation: flag(rest, '--revalidation'),
        createdAt: Date.now(),
      }
      saveWaiver(paths, waiver)
      process.stdout.write(`waived ${gateId} until ${new Date(waiver.expiresAt).toISOString()} (${waiver.id})\n`)
      process.stdout.write(`next 'qgate run ${gateId}' will record WAIVED (original verdict preserved in conditions)\n`)
      return
    }

    case 'exceptions': {
      const waivers = listWaivers(paths)
      if (waivers.length === 0) { process.stdout.write('(no exceptions registered)\n'); return }
      const now = Date.now()
      for (const w of waivers) {
        const active = w.expiresAt > now
        process.stdout.write(
          `${active ? 'ACTIVE' : 'EXPIRED'} ${w.id} ${w.gateId} by ${w.approver} — ${w.reason}` +
          ` (expires ${new Date(w.expiresAt).toISOString()})\n`,
        )
      }
      return
    }

    case 'release-report': {
      const data = buildReleaseReport(loaded)
      const md = renderReleaseReportMd(data)
      const outFile = flag(rest, '--out') ?? resolve(loaded.qgateDir, 'release-report.md')
      mkdirSync(resolve(outFile, '..'), { recursive: true })
      writeFileSync(outFile, md, 'utf8')
      writeFileSync(outFile.replace(/\.md$/, '.json'), JSON.stringify(data, null, 2) + '\n', 'utf8')
      process.stdout.write(`release evidence package written: ${outFile} (+ .json)\n`)
      const blocking = data.unresolved.length
      for (const u of data.unresolved) process.stdout.write(`  unresolved: ${u}\n`)
      process.exit(blocking > 0 ? 1 : 0)
      return
    }

    default:
      fail(`unknown command: ${cmd}\n\n${HELP}`)
  }
}

main().catch((e: Error) => fail(e.message))
