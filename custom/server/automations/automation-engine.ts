// overlay/automations 域（A2）：状态引擎——规则存取（原子 JSON）+ 去抖窗口 +
// 事件源挂载（file watcher / git poller；kanban 与 webhook 走 REST 摄入）+
// 派发（@mention 总线端口）+ 触发历史（有界）。
//
// 派发语义（吸收 opencode v2 会话契约「输入先落库再执行」的保守面 + multica
// 单 pending 槽）：简报经 MentionDispatchService.dispatch 派发——引擎运行中时
// 并入 pending 槽（事件风暴天然合并），这一行为来自总线自身，不在本层复造。
//
// 测试注入面：now/timer 工厂、dispatch 端口、watch 工厂全部可换（fake timers
// 下全链可测，不落真定时器）。
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync, type FSWatcher } from 'fs'
import { dirname } from 'path'
import { spawn } from 'child_process'
import {
  matchEvent, renderBriefing, validateRuleInput,
  type AutomationEvent, type AutomationRule, type RuleValidationErrors,
} from './automation-rules'

export interface AutomationDispatchPort {
  /** 返回 outcome 数组（mention 总线语义；空数组=无 mention 可派发=配置错）。 */
  dispatch(params: { workspacePath: string; text: string }): Promise<Array<{ reason: string; sessionId?: string; commandId?: string }>>
}

export interface TriggerHistoryEntry {
  at: number
  ruleId: string
  ruleName: string
  eventCount: number
  truncated: boolean
  reason: string
  sessionId?: string
  commandId?: string
}

const HISTORY_MAX = 200
const GIT_POLL_DEFAULT_MS = 30_000

export interface EngineOptions {
  storePath: string
  historyPath: string
  port: AutomationDispatchPort
  now?: () => number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  /** file watcher 工厂（默认 fs.watch recursive；测试注入假 watcher）。 */
  watchFn?: (root: string, onEvent: (relPath: string) => void) => { close: () => void } | null
  /** git poll 启停面（默认不启动——由控制器按运行环境显式开启；测试注入假 poller）。 */
  enableGitPoll?: boolean
  gitPollIntervalMs?: number
}

interface DebounceBucket {
  events: AutomationEvent[]
  timer: unknown
  armedAt: number
}

export class AutomationEngine {
  private rules: AutomationRule[] = []
  private history: TriggerHistoryEntry[] = []
  private buckets = new Map<string, DebounceBucket>()
  private watchers = new Map<string, { close: () => void }>()
  private gitPollers = new Map<string, { stop: () => void }>()
  private lastSeenHead = new Map<string, string>()
  private readonly opts: Required<Pick<EngineOptions, 'storePath' | 'historyPath' | 'port'>> & EngineOptions

  constructor(opts: EngineOptions) {
    this.opts = opts
    this.rules = this.loadJsonSafe(opts.storePath, []) as AutomationRule[]
    this.history = this.loadJsonSafe(opts.historyPath, []) as TriggerHistoryEntry[]
    // 历史恢复时序保证：按 at 升序规整（坏档防御）。
    this.history.sort((a, b) => a.at - b.at)
  }

  private loadJsonSafe<T>(path: string, fallback: T): T {
    try {
      if (!existsSync(path)) return fallback
      return JSON.parse(readFileSync(path, 'utf8')) as T
    } catch {
      return fallback
    }
  }

  private writeJsonAtomic(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tmp, path)
  }

  private persistRules(): void { this.writeJsonAtomic(this.opts.storePath, this.rules) }
  private persistHistory(): void {
    if (this.history.length > HISTORY_MAX) this.history = this.history.slice(-HISTORY_MAX)
    this.writeJsonAtomic(this.opts.historyPath, this.history)
  }

  listRules(): AutomationRule[] { return [...this.rules] }
  listHistory(): TriggerHistoryEntry[] { return [...this.history].reverse() }

  addRule(input: unknown): { rule: AutomationRule } | { errors: RuleValidationErrors } {
    const res = validateRuleInput(input)
    if ('errors' in res) return res
    this.rules = [...this.rules, res.rule]
    this.persistRules()
    this.syncSources()
    return { rule: res.rule }
  }

  updateRule(id: string, patch: Partial<Pick<AutomationRule, 'name' | 'enabled' | 'promptTemplate' | 'debounceMs'>>): AutomationRule | null {
    const idx = this.rules.findIndex((r) => r.id === id)
    if (idx < 0) return null
    const merged: AutomationRule = { ...this.rules[idx] }
    if (typeof patch.name === 'string' && patch.name.trim() && patch.name.trim().length <= 200) merged.name = patch.name.trim()
    if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled
    if (typeof patch.promptTemplate === 'string' && patch.promptTemplate.trim()) merged.promptTemplate = patch.promptTemplate.trim().slice(0, 2000)
    if (typeof patch.debounceMs === 'number' && patch.debounceMs >= 200 && patch.debounceMs <= 60_000) merged.debounceMs = Math.round(patch.debounceMs)
    this.rules[idx] = merged
    this.persistRules()
    this.syncSources()
    return merged
  }

  removeRule(id: string): boolean {
    const before = this.rules.length
    this.rules = this.rules.filter((r) => r.id !== id)
    if (this.rules.length === before) return false
    this.dropBucket(id)
    this.persistRules()
    this.syncSources()
    return true
  }

  /** 事件摄入（REST / watcher / poller 统一入口）。返回命中与去抖挂载的规则数。 */
  ingestEvent(event: AutomationEvent): { matched: number; scheduled: number } {
    let matched = 0
    let scheduled = 0
    for (const rule of this.rules) {
      if (!matchEvent(rule, event)) continue
      matched++
      this.pushBucket(rule, event)
      scheduled++
    }
    return { matched, scheduled }
  }

  private pushBucket(rule: AutomationRule, event: AutomationEvent): void {
    const existing = this.buckets.get(rule.id)
    if (existing) {
      existing.events.push(event)
      return // 计时器不重置：首事件起算的固定窗口（尾部合并，不无限延展）
    }
    const timerFn = this.opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
    const timer = timerFn(() => { void this.flush(rule.id) }, rule.debounceMs)
    this.buckets.set(rule.id, { events: [event], timer, armedAt: (this.opts.now ?? Date.now)() })
  }

  private dropBucket(ruleId: string): void {
    const bucket = this.buckets.get(ruleId)
    if (!bucket) return
    const clearFn = this.opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as Parameters<typeof clearTimeout>[0]))
    clearFn(bucket.timer)
    this.buckets.delete(ruleId)
  }

  /** 去抖窗口到期：合并事件 → 简报 → 总线派发 → 历史落档。 */
  private async flush(ruleId: string): Promise<void> {
    const bucket = this.buckets.get(ruleId)
    if (!bucket) return
    this.buckets.delete(ruleId)
    const rule = this.rules.find((r) => r.id === ruleId)
    if (!rule || !rule.enabled) return // 桶期间被删/停用：丢弃（不派发陈意图）
    const { text, truncated } = renderBriefing(rule, bucket.events)
    const entry: TriggerHistoryEntry = {
      at: (this.opts.now ?? Date.now)(),
      ruleId,
      ruleName: rule.name,
      eventCount: bucket.events.length,
      truncated,
      reason: 'error',
    }
    try {
      const outcomes = await this.opts.port.dispatch({ workspacePath: rule.workspacePath, text })
      if (outcomes.length === 0) {
        entry.reason = 'no_mention_target'
      } else {
        const first = outcomes[0]
        entry.reason = first.reason
        entry.sessionId = first.sessionId
        entry.commandId = first.commandId
      }
    } catch (err) {
      entry.reason = 'dispatch_error'
      entry.commandId = err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120)
    }
    this.history.push(entry)
    this.persistHistory()
  }

  /** 测试/停机面：立即冲刷全部在途桶（不等待计时器）。 */
  async flushAllForTests(): Promise<void> {
    for (const ruleId of [...this.buckets.keys()]) {
      this.dropBucket(ruleId)
      await this.flush(ruleId)
    }
  }

  // ── 事件源挂载（file watcher + git poller；按 enabled 规则集合 diff）──

  /** 重挂事件源：file 规则的 workspace 根 watch；git 规则的 workspace 根 poll。 */
  syncSources(): void {
    const fileRoots = new Set(this.rules.filter((r) => r.enabled && r.source.type === 'file').map((r) => r.workspacePath))
    const gitRoots = new Set(this.rules.filter((r) => r.enabled && r.source.type === 'git').map((r) => r.workspacePath))

    for (const [root, w] of this.watchers) {
      if (!fileRoots.has(root)) { try { w.close() } catch { /* 已关 */ } this.watchers.delete(root) }
    }
    for (const root of fileRoots) {
      if (this.watchers.has(root)) continue
      const watcher = this.attachWatcher(root)
      if (watcher) this.watchers.set(root, watcher)
    }

    for (const [root, p] of this.gitPollers) {
      if (!gitRoots.has(root)) { p.stop(); this.gitPollers.delete(root) }
    }
    if (this.opts.enableGitPoll) {
      for (const root of gitRoots) {
        if (this.gitPollers.has(root)) continue
        this.gitPollers.set(root, this.attachGitPoller(root))
      }
    }
  }

  /** fs.watch recursive（Node 24 三平台支持；失败返回 null 不炸引擎）。 */
  private attachWatcher(root: string): { close: () => void } | null {
    const watchFn = this.opts.watchFn ?? ((r: string, onEvent: (rel: string) => void) => {
      try {
        const w = watch(r, { recursive: true }, (_kind, filename) => {
          if (typeof filename === 'string') onEvent(filename)
        })
        return { close: () => w.close() }
      } catch {
        return null
      }
    })
    return watchFn(root, (relPath) => {
      // .git 噪声与 node_modules 不进事件面（规则 pattern 再过滤一道）
      if (!relPath || relPath.startsWith('.git/') || relPath.includes('/.git/') || relPath.startsWith('node_modules/') || relPath.includes('/node_modules/')) return
      this.ingestEvent({ type: 'file', workspacePath: root, path: relPath })
    })
  }

  /** 本地 git 轮询：HEAD 变化 → log 增量 → git 事件。首轮只记基线不触发。 */
  private attachGitPoller(root: string): { stop: () => void } {
    const interval = this.opts.gitPollIntervalMs ?? GIT_POLL_DEFAULT_MS
    const timer = setInterval(() => { void this.pollGit(root) }, interval)
    void this.pollGit(root)
    return { stop: () => clearInterval(timer as unknown as Parameters<typeof clearInterval>[0]) }
  }

  private async pollGit(root: string): Promise<void> {
    const head = await this.gitQuery(root, ['rev-parse', 'HEAD'])
    if (!head) return
    const prev = this.lastSeenHead.get(root)
    this.lastSeenHead.set(root, head)
    if (!prev || prev === head) return
    const logRaw = await this.gitQuery(root, ['log', '--pretty=%H%x1f%s', `${prev}..${head}`, '-n', '20'])
    if (logRaw === null) return
    const commits = logRaw.split('\n').filter(Boolean).map((line) => {
      const [sha, ...rest] = line.split('\x1f')
      return { sha: sha ?? '', subject: rest.join('\x1f') ?? '' }
    })
    this.ingestEvent({ type: 'git', workspacePath: root, ref: 'HEAD', commits })
  }

  private gitQuery(root: string, args: string[]): Promise<string | null> {
    return new Promise((resolveP) => {
      const child = spawn('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
      let out = ''
      child.stdout.on('data', (d) => { out += String(d) })
      child.on('error', () => resolveP(null))
      child.on('close', (code) => resolveP(code === 0 ? out.trim() : null))
      setTimeout(() => { try { child.kill() } catch { /* 已退 */ } }, 10_000).unref()
    })
  }

  /** 停机清理（测试用；生产进程退出由 OS 回收）。 */
  dispose(): void {
    for (const w of this.watchers.values()) { try { w.close() } catch { /* 已关 */ } }
    for (const p of this.gitPollers.values()) p.stop()
    this.watchers.clear()
    this.gitPollers.clear()
    for (const ruleId of [...this.buckets.keys()]) this.dropBucket(ruleId)
  }
}

/** git log 输出解析（纯函数，poller 内核；守门测试直测）。 */
export function parseGitLog(raw: string): Array<{ sha: string; subject: string }> {
  return raw.split('\n').filter(Boolean).map((line) => {
    const [sha, ...rest] = line.split('\x1f')
    return { sha: sha ?? '', subject: rest.join('\x1f') ?? '' }
  })
}
