#!/usr/bin/env node
// overlay/trust 域命令行入口：供推演脚本或 Agent 运行时在本地直接调用，
// 不依赖 Web 服务。与 REST 共用同一套判断与存储。
//
//   npx tsx custom/server/trust/cli.ts open --title ... --root ... --actor ... \
//     --claim "完成登录页|file:src/login.ts,git:abc1234"
//   npx tsx custom/server/trust/cli.ts begin-audit --case <id> --actor auditor
//   npx tsx custom/server/trust/cli.ts audit --case <id> --claim <id> \
//     --verdict verified --auditor reviewer --observation "cat 输出与 sha256 一致"
//   npx tsx custom/server/trust/cli.ts admit --case <id> --actor manager
//   npx tsx custom/server/trust/cli.ts checkpoint --case <id> --actor manager --round 3
//   npx tsx custom/server/trust/cli.ts verify --case <id> [--checkpoint latest]
//
// 退出码：0=成功/admitted，2=untrusted（提议被降级），3=参数或执行错误。
import {
  ServiceError, addClaims, admit, beginAudit, getCase, openCase, overview,
  recordAudits, verifyCheckpoint, writeCheckpoint,
} from './service'
import { IntegrityError } from './integrity'

function argsOf(argv: string[]): { cmd: string; rest: string[] } {
  return { cmd: argv[0] ?? '', rest: argv.slice(1) }
}

function value(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 && i + 1 < rest.length ? rest[i + 1] : undefined
}

function all(rest: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === `--${name}` && i + 1 < rest.length) out.push(rest[i + 1])
  }
  return out
}

function required(rest: string[], name: string): string {
  const v = value(rest, name)
  if (!v) throw new Error(`缺少参数 --${name}`)
  return v
}

function emit(obj: unknown, code = 0): never {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
  process.exit(code)
}

function parseClaim(spec: string): { statement: string; evidenceRefs: string[] } {
  const i = spec.indexOf('|')
  const statement = (i >= 0 ? spec.slice(0, i) : spec).trim()
  const refs = i >= 0 ? spec.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean) : []
  return { statement, evidenceRefs: refs }
}

function main(): void {
  const { cmd, rest } = argsOf(process.argv.slice(2))
  try {
    switch (cmd) {
      case 'open': {
        const c = openCase({
          caseId: value(rest, 'case'),
          title: required(rest, 'title'),
          runId: value(rest, 'run'),
          workspaceRoot: required(rest, 'root'),
          actor: value(rest, 'actor') ?? 'operator',
          claims: all(rest, 'claim').map(parseClaim),
        })
        emit({ ok: true, case: c })
      }
      case 'claim': {
        const added = addClaims(required(rest, 'case'), all(rest, 'claim').map(parseClaim), value(rest, 'actor') ?? 'operator')
        emit({ ok: true, added })
      }
      case 'begin-audit': {
        emit({ ok: true, ...beginAudit(required(rest, 'case'), value(rest, 'actor') ?? 'operator') })
      }
      case 'audit': {
        const verdict = required(rest, 'verdict')
        const audits = recordAudits(required(rest, 'case'), [{
          claimId: required(rest, 'claim'),
          verdict,
          auditor: value(rest, 'auditor'),
          observations: all(rest, 'observation'),
          counterEvidence: value(rest, 'counter'),
        }], value(rest, 'actor') ?? 'operator')
        emit({ ok: true, audits })
      }
      case 'admit': {
        const self = rest.includes('--self-clean') ? 'clean' : rest.includes('--self-violated') ? 'violated' : undefined
        const res = admit(required(rest, 'case'), value(rest, 'actor') ?? 'operator', {
          ...(self ? { auditorReportedIntegrity: self } : {}),
        })
        emit({ ok: true, ...res }, res.decision.result === 'admitted' ? 0 : 2)
      }
      case 'checkpoint': {
        emit({ ok: true, checkpoint: writeCheckpoint(required(rest, 'case'), value(rest, 'actor') ?? 'operator', { round: value(rest, 'round') }) })
      }
      case 'verify': {
        const caseId = required(rest, 'case')
        const id = value(rest, 'checkpoint')
        emit({ ok: true, ...verifyCheckpoint(caseId, id === 'latest' ? undefined : id) })
      }
      case 'show': {
        emit({ ok: true, case: getCase(required(rest, 'case')) })
      }
      case 'overview': {
        emit({ ok: true, ...overview() })
      }
      default:
        throw new Error(`未知命令：${cmd || '(空)'}`)
    }
  } catch (e) {
    if (e instanceof ServiceError) emit({ ok: false, error: e.message, detail: e.detail }, 3)
    if (e instanceof IntegrityError) emit({ ok: false, error: e.message, code: e.code }, 3)
    emit({ ok: false, error: e instanceof Error ? e.message : String(e) }, 3)
  }
}

main()
