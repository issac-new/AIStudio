// overlay/approval 存储：rules.json 三列表 + defaultMode（minimax permission.json schema 移植）。
// 路径解析：HERMES_APPROVAL_RULES_FILE 显式 > ~/.hermes-web-ui/approval。
// 不落 cwd：serve-server.mjs 以 upstream 为 cwd 启动，cwd 档会把规则写进只读 upstream 树。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import type { ApprovalDecision, ApprovalRule, DefaultMode } from './approval-domain'

export interface ApprovalRulesFile {
  defaultMode: DefaultMode
  rules: ApprovalRule[]
}

const DEFAULT_FILE: ApprovalRulesFile = { defaultMode: 'ask', rules: [] }

/** 归属/绑定字段校验（X2）：字符串才保留，非法类型剥掉（缺省即旧档语义，见域层注释）。 */
function normalizeRuleIdentity(rule: ApprovalRule): ApprovalRule {
  const out = { ...rule }
  if (out.owner !== undefined && typeof out.owner !== 'string') delete out.owner
  if (out.sessionId !== undefined && typeof out.sessionId !== 'string') delete out.sessionId
  if (out.agentId !== undefined && typeof out.agentId !== 'string') delete out.agentId
  return out
}

export function resolveApprovalRulesPath(): string {
  const env = process.env.HERMES_APPROVAL_RULES_FILE?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'approval', 'rules.json')
}

export class ApprovalRuleStore {
  private file: ApprovalRulesFile | null = null

  constructor(private readonly path: string = resolveApprovalRulesPath()) {}

  load(): ApprovalRulesFile {
    if (this.file) return this.file
    let raw: string
    try {
      raw = readFileSync(this.path, 'utf8')
    } catch {
      this.file = { ...DEFAULT_FILE, rules: [] }
      return this.file
    }
    try {
      const parsed = JSON.parse(raw)
      this.file = {
        defaultMode: parsed.defaultMode === 'allow' || parsed.defaultMode === 'deny' ? parsed.defaultMode : 'ask',
        // 旧档兼容（X2）：缺 owner/sessionId/agentId 的旧规则原样保留（无主=全局可见，
        // 无绑定=升级前宽语义，见 approval-domain.ts 归属模型注释）；字段类型非法时剥掉。
        rules: Array.isArray(parsed.rules)
          ? parsed.rules.filter((r: ApprovalRule) => r && typeof r.tool === 'string').map(normalizeRuleIdentity)
          : [],
      }
    } catch (err) {
      // 坏文件改名留档（<path>.corrupt）再回默认：不静默清零丢规则，保留现场可人工修复回填。
      const archive = `${this.path}.corrupt`
      try { renameSync(this.path, archive) } catch { /* 留档失败不阻断（只读介质等） */ }
      console.warn(`[approval-store] 规则文件解析失败，已留档 ${archive}：${err instanceof Error ? err.message : String(err)}`)
      this.file = { ...DEFAULT_FILE, rules: [] }
    }
    return this.file
  }

  save(next: ApprovalRulesFile): void {
    mkdirSync(dirname(this.path), { recursive: true })
    // 写临时文件 + rename 原子替换：直接覆盖写在进程被杀/磁盘满时会留下半截 JSON，
    // 下次 load 解析失败即规则全丢。
    const tmp = `${this.path}.${process.pid}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(next, null, 2))
      renameSync(tmp, this.path)
    } catch (err) {
      try { unlinkSync(tmp) } catch { /* 无残留 */ }
      throw err
    }
    this.file = next
  }

  list(): ApprovalRule[] {
    return this.load().rules
  }

  defaultMode(): DefaultMode {
    return this.load().defaultMode
  }

  /** 追加学习规则（同 list+scope+tool+argvPrefix+归属/绑定 幂等去重；归属进键——否则
   *  用户 B 学同款规则会被用户 A 的旧规则去重吞掉，B 反而看不见自己的规则）。 */
  addRule(rule: ApprovalRule): ApprovalRule[] {
    const cur = this.load()
    const dup = cur.rules.some((r) =>
      r.list === rule.list && r.scope === rule.scope && r.tool === rule.tool &&
      (r.argvPrefix ?? '') === (rule.argvPrefix ?? '') &&
      (r.owner ?? '') === (rule.owner ?? '') &&
      (r.sessionId ?? '') === (rule.sessionId ?? '') &&
      (r.agentId ?? '') === (rule.agentId ?? ''))
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
