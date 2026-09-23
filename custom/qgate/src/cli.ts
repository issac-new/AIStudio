#!/usr/bin/env node
// qgate CLI（基础接口，v0.1 §38）：plan / run / status / explain / evidence / risk / validate-config。
// 用法：node dist/cli.js <command> [options]（cwd = 项目根）。
// 退出码：0=全部 PASS/无阻断；1=存在 FAIL/INCONCLUSIVE 阻断；2=配置或环境错误。

import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadProject } from './core/loader.js'
import { runGate, gitContext } from './core/run.js'
import { storePaths, latestRuns, loadRun, loadRunEvidence, isFresh, listRisks, saveWaiver, listWaivers } from './core/store.js'
import { resolveProfile, findProfile, effectivePolicy } from './core/profile.js'
import { selectGates, appliesToChanged } from './core/impact.js'
import { tierOfProfile, VERDICT_TO_DELIVERY } from './core/align.js'
import { buildReleaseReport, renderReleaseReportMd } from './core/report.js'
import { writeFileSync, mkdirSync } from 'node:fs'
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
    const dir = resolve(workspace, '.qgate', 'gates')
    fs.mkdirSync(dir, { recursive: true })
    const cfg = resolve(workspace, '.qgate', 'qgate.yaml')
    if (!fs.existsSync(cfg)) {
      fs.writeFileSync(cfg, 'profile: feature-close\nclaims: []\n', 'utf8')
    }
    process.stdout.write(`initialized ${resolve(workspace, '.qgate')}\n`)
    return
  }

  const loaded = loadProject(workspace)
  if (!loaded) fail(`no .qgate/ directory in ${workspace} — run 'qgate init' first`)
  const paths = storePaths(loaded.qgateDir)
  const profile = findProfile(loaded.profiles, loaded.config.profile)
  const resolved = resolveProfile(loaded.gates, profile, loaded.config.profile)
  const enabledGates = loaded.gates.filter((g) => resolved.enabled.get(g.metadata.id) === true)

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
      const git = gitContext(workspace)
      const changed = changedArg ? changedArg.split(',').filter(Boolean) : git.changedPaths
      const toRun: GateSpec[] =
        target === '--all'
          ? (changed.length > 0 ? selectGates(enabledGates, changed) : enabledGates)
          : enabledGates.filter((g) => g.metadata.id === target)
      if (toRun.length === 0) fail(target ? `gate not found or disabled: ${target}` : 'missing gateId or --all')
      let blocking = 0
      for (const spec of toRun) {
        const result = await runGate({ spec, trigger, workspace, qgateDir: loaded.qgateDir, changedPaths: changed })
        const policy = effectivePolicy(spec, resolved)
        const isBlocking =
          (result.run.verdict === 'FAIL' && policy.failure === 'block') ||
          (result.run.verdict === 'INCONCLUSIVE' && policy.inconclusive === 'block')
        if (isBlocking) blocking++
        process.stdout.write(
          `${isBlocking ? '✗' : result.run.verdict === 'PASS' ? '✓' : '△'} ${spec.metadata.id}: ${result.run.verdict}` +
          `${result.run.conditions ? ` — ${result.run.conditions.join('; ')}` : ''}` +
          `${result.run.failureSummary ? ` — ${result.run.failureSummary}` : ''}\n`,
        )
      }
      process.exit(blocking > 0 ? 1 : 0)
      return
    }

    case 'status': {
      const fresh = hasFlag(rest, '--fresh')
      const json = hasFlag(rest, '--json')
      const state = latestRuns(paths)
      const git = fresh ? gitContext(workspace) : undefined
      const report: Record<string, unknown>[] = []
      for (const g of enabledGates) {
        const entry = state[g.metadata.id]
        const policy = effectivePolicy(g, resolved)
        let freshness: 'fresh' | 'stale' | 'never' = 'never'
        if (entry) {
          const run = loadRun(paths, entry.runId)
          if (run && fresh && git) {
            freshness = isFresh(run, Date.now(), {
              commit: git.commit, treeHash: git.treeHash, changedPaths: git.changedPaths, appliesWhen: g.spec.appliesWhen,
            }, policy.maxAgeHours ?? 24) ? 'fresh' : 'stale'
          } else if (run) freshness = 'fresh'
        }
        const row = {
          gateId: g.metadata.id,
          domain: g.spec.domain,
          verdict: entry?.verdict ?? 'INCONCLUSIVE',
          delivery: VERDICT_TO_DELIVERY[entry?.verdict ?? 'INCONCLUSIVE'],
          freshness: fresh ? freshness : undefined,
          blocking: entry ? entry.verdict === 'FAIL' || entry.verdict === 'INCONCLUSIVE' : true,
        }
        report.push(row)
        if (!json) {
          process.stdout.write(
            `${row.blocking ? '✗' : '✓'} ${row.gateId} [${row.domain}]: ${row.verdict}` +
            (fresh ? ` (${row.freshness})` : '') + '\n',
          )
        }
      }
      if (json) process.stdout.write(JSON.stringify({ profile: resolved.profileId, tier: resolved.tier ?? tierOfProfile(resolved.profileId), gates: report }, null, 2) + '\n')
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
