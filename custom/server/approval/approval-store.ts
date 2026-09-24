// overlay/approval 存储：rules.json 三列表 + defaultMode（minimax permission.json schema 移植）。
// 路径解析沿用 loop/paths.ts 模式：HERMES_APPROVAL_RULES_FILE 显式 > cwd 可写 > ~/.hermes-web-ui 降级。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type { ApprovalDecision, ApprovalRule, DefaultMode } from './approval-domain'

export interface ApprovalRulesFile {
  defaultMode: DefaultMode
  rules: ApprovalRule[]
}

const DEFAULT_FILE: ApprovalRulesFile = { defaultMode: 'ask', rules: [] }

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.approval-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function resolveApprovalRulesPath(): string {
  const env = process.env.HERMES_APPROVAL_RULES_FILE?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.approval', 'rules.json')
  const home = join(homedir(), '.hermes-web-ui', 'approval')
  return join(home, 'rules.json')
}

export class ApprovalRuleStore {
  private file: ApprovalRulesFile | null = null

  constructor(private readonly path: string = resolveApprovalRulesPath()) {}

  load(): ApprovalRulesFile {
    if (this.file) return this.file
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8'))
      this.file = {
        defaultMode: raw.defaultMode === 'allow' || raw.defaultMode === 'deny' ? raw.defaultMode : 'ask',
        rules: Array.isArray(raw.rules) ? raw.rules.filter((r: ApprovalRule) => r && typeof r.tool === 'string') : [],
      }
    } catch {
      this.file = { ...DEFAULT_FILE, rules: [] }
    }
    return this.file
  }

  save(next: ApprovalRulesFile): void {
    mkdirSync(this.path.slice(0, this.path.lastIndexOf('/')), { recursive: true })
    writeFileSync(this.path, JSON.stringify(next, null, 2))
    this.file = next
  }

  list(): ApprovalRule[] {
    return this.load().rules
  }

  defaultMode(): DefaultMode {
    return this.load().defaultMode
  }

  /** 追加学习规则（同 list+scope+tool+argvPrefix 幂等去重）。 */
  addRule(rule: ApprovalRule): ApprovalRule[] {
    const cur = this.load()
    const dup = cur.rules.some((r) =>
      r.list === rule.list && r.scope === rule.scope && r.tool === rule.tool &&
      (r.argvPrefix ?? '') === (rule.argvPrefix ?? ''))
    if (!dup) {
      cur.rules.push(rule)
      this.save(cur)
    }
    return cur.rules
  }

  /** 策略级学习：改默认模式（execpolicy_amendment）。 */
  setDefaultMode(mode: DefaultMode, learnedFrom: ApprovalDecision): void {
    const cur = this.load()
    cur.defaultMode = mode
    this.save(cur)
  }

  reset(): void {
    this.file = null
  }
}

/** 进程级单例。 */
let storeSingleton: ApprovalRuleStore | null = null
export function getApprovalRuleStore(): ApprovalRuleStore {
  if (!storeSingleton) storeSingleton = new ApprovalRuleStore()
  return storeSingleton
}

export function __resetApprovalStoreForTests(): void {
  storeSingleton = null
}

export function storeExists(path: string): boolean {
  return existsSync(path)
}
