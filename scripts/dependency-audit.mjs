#!/usr/bin/env node
// overlay/scripts/dependency-audit.mjs
// 依赖漏洞审计面（2026-11-25，挂账 N35-11）：在 studio 与 Ycode 两处执行生产依赖审计，
// 与一份“已接受的通告”清单比对——清单内的高危/中危不拦，清单外的高危或严重才失败。
// 设计理由（规格 2026-11-24-full-retro-pending-closeout N35-11）：审计要联网、结果随新通告
// 变化，放进推送前会让无关提交变红；只在全量档跑，且只拦“清单之外的严重/高危”。
// 退出码遵循 config/cli-contract.json：0 通过，1 有清单外的高危或严重，2 工具链缺席。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ACCEPTED_PATH = resolve(ROOT, 'config/accepted-vulnerabilities.json')

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')

// npm audit / pnpm audit 的 --json 输出形态不同：npm 顶层有 vulnerabilities（按包聚合，
// 每项含 via 通告数组），pnpm 顶层是 advisories（按通告聚合，每项含 findings）。统一成
// [{id, name, severity}]：id 取 GitHub advisory 号（GHSA-…）或 CVE，匹配不到时回退到
// “包@影响版本”作键——清单里的条目也按同一口径写。
function normalize(raw, tool) {
  let j
  try {
    j = JSON.parse(raw.slice(raw.indexOf('{')))
  } catch {
    return null
  }
  const out = []
  const push = (id, name, severity) => out.push({ id: String(id), name, severity })
  if (tool === 'npm') {
    for (const [name, v] of Object.entries(j.vulnerabilities ?? {})) {
      for (const via of v.via ?? []) {
        if (via && typeof via === 'object') {
          const id = /^GHSA-/i.test(via.source ?? '') ? via.source : `${name}@${v.range}`
          push(id, name, via.severity)
        }
      }
    }
  } else {
    for (const a of Object.values(j.advisories ?? {})) {
      for (const f of a.findings ?? []) push(a.github_advisory_id ?? `${a.module_name}@${f.version}`, a.module_name, a.severity)
    }
  }
  return out
}

function audit(cwd, tool, registry) {
  const cmd = tool === 'npm'
    ? [tool, ['audit', '--omit=dev', '--json', `--registry=${registry}`]]
    : [tool, ['audit', '--prod', '--json', `--registry=${registry}`]]
  try {
    const raw = execFileSync(cmd[0], cmd[1], { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, findings: normalize(raw, tool) ?? [] }
  } catch (e) {
    // npm/pnpm 有漏洞时以非零退出，stdout 里仍是完整 JSON——照常解析
    const raw = e.stdout?.toString?.() ?? ''
    const parsed = normalize(raw, tool)
    if (parsed) return { ok: true, findings: parsed }
    return { ok: false, reason: String(e.message).slice(0, 200) }
  }
}

function main() {
  if (!existsSync(ACCEPTED_PATH)) {
    console.error(`[dependency-audit] 缺已接受通告清单 ${ACCEPTED_PATH}`)
    process.exit(2)
  }
  const accepted = new Set(JSON.parse(readFileSync(ACCEPTED_PATH, 'utf8')).accepted ?? [])
  const registry = 'https://registry.npmjs.org/'
  const surfaces = [
    { id: 'studio', cwd: resolve(ROOT, 'vendor/hermes-studio'), tool: 'npm' },
    { id: 'ycode', cwd: resolve(ROOT, 'vendor/zcode'), tool: 'pnpm' },
  ]
  const report = []
  let blocking = 0
  const unavailable = []
  for (const s of surfaces) {
    if (!existsSync(s.cwd)) {
      unavailable.push(`${s.id}: 目录缺席`)
      continue
    }
    const r = audit(s.cwd, s.tool, registry)
    if (!r.ok) {
      unavailable.push(`${s.id}: ${r.reason}`)
      continue
    }
    const acceptedHits = r.findings.filter((f) => accepted.has(f.id))
    const novel = r.findings.filter((f) => !accepted.has(f.id))
    const novelSerious = novel.filter((f) => f.severity === 'high' || f.severity === 'critical')
    report.push({
      surface: s.id,
      total: r.findings.length,
      accepted: acceptedHits.length,
      novel: novel.length,
      novelSerious: novelSerious.length,
      novelSeriousIds: novelSerious.map((f) => `${f.severity} ${f.id} (${f.name})`),
    })
    blocking += novelSerious.length
  }
  if (jsonMode) console.log(JSON.stringify({ status: blocking > 0 ? 'fail' : 'pass', blocking, unavailable, report }, null, 2))
  else {
    for (const r of report) console.log(`[dependency-audit] ${r.surface}: 共 ${r.total}（清单内 ${r.accepted}，新出现 ${r.novel}，其中高危/严重 ${r.novelSerious}）`)
    for (const u of unavailable) console.warn(`[dependency-audit] 未执行: ${u}`)
  }
  if (unavailable.length === surfaces.length) process.exit(2) // 两个面都跑不了才算工具链缺席
  process.exit(blocking > 0 ? 1 : 0)
}

main()
