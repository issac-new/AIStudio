/**
 * Skill 三段安全治理 · 第一段「注册扫描」（skillgov，2026-10-13 挂账清偿轮）。
 *
 * 范式来源：《腾讯 Agent 评测体系技术拆解》§09——Skill 治理三段式：
 *   注册阶段异步安全扫描（Skill 描述、Prompt、脚本、依赖、工具声明）→
 *   执行阶段实时检测并高危拦截 → 输出阶段实时审核。
 * 本文件承载第一段与共享数据面（扫描结果账本），第二/三段见 skill-guard-hook.ts
 * （执行拦截按本段 verdict 执法；输出审核 S0 内联 shell 标记）。
 *
 * 纪律：S0 纯静态规则零判定费（toolresultguard 同款分层——机械判据优先）；
 * 有界扫描（≤128 文件/技能、≤256KB/文件、≤64 profile）；fail-soft（单文件坏跳过）；
 * 与 hermes-agent 侧 skills_guard.py 同向但独立（那是安装树执法，这是产品治理面）。
 */
import { readdirSync, readFileSync, statSync, readlinkSync, existsSync, mkdirSync, appendFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { homedir } from 'node:os'

export type SkillScanVerdict = 'safe' | 'caution' | 'dangerous'
export type SkillFindingSeverity = 'high' | 'medium' | 'low'

export interface SkillFinding {
  rule: string
  severity: SkillFindingSeverity
  /** 技能内相对路径（如 SKILL.md、scripts/run.sh）。 */
  file: string
  line?: number
  message: string
}

export interface SkillScanResult {
  name: string
  dir: string
  verdict: SkillScanVerdict
  findings: SkillFinding[]
  files: { total: number; scripts: number; binaries: number; symlinks: number }
  frontmatter: { hasName: boolean; nameMatchesDir: boolean; hasDescription: boolean; hasVersion: boolean }
  scannedAt: number
}

// ---------- S0 静态规则库（high=命中即 dangerous；medium=caution；low=仅记录） ----------

type RuleScope = 'md' | 'script' | 'all'

interface StaticRule {
  rule: string
  severity: SkillFindingSeverity
  scope: RuleScope
  pattern: RegExp
  message: string
}

const SCRIPT_EXTS = new Set(['.sh', '.bash', '.zsh', '.py', '.js', '.ts', '.mjs', '.cjs'])
const TEXT_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.cfg', '.ini', ...SCRIPT_EXTS])
const BINARY_EXTS = new Set(['.exe', '.bin', '.dylib', '.so', '.node', '.wasm', '.class', '.o', '.a', '.pyc'])
/** 内联 shell 执行段（hermes-agent skill_preprocessing 的 `` !`cmd` `` 形态）。 */
export const INLINE_SHELL_RE = /!\x60[^\x60]{1,200}\x60/

const S0_RULES: StaticRule[] = [
  { rule: 'inline-shell', severity: 'high', scope: 'md', pattern: /!\x60[^\x60]{1,200}\x60/, message: 'SKILL.md 含内联 shell 执行段（装载期会被展开执行）' },
  { rule: 'pipe-exec', severity: 'high', scope: 'all', pattern: /(curl|wget)[^\n]{0,200}\|\s*(ba)?sh(\s|$|\n)/, message: '下载即执行（curl/wget 管道进 shell）' },
  { rule: 'rm-rf-root', severity: 'high', scope: 'all', pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*r?|--force)[^\n]{0,40}[\/~](\s|$|\n)/, message: '递归强删根/家目录路径' },
  { rule: 'base64-exec', severity: 'high', scope: 'all', pattern: /base64\s+(-d|-D|--decode)[^\n]{0,120}\|\s*(ba)?sh/, message: 'base64 解码后直接进 shell（混淆执行）' },
  { rule: 'netcat-exec', severity: 'high', scope: 'all', pattern: /\bnc\s+[^|\n]{0,80}-e\s+\S+/, message: 'netcat -e 反弹执行' },
  { rule: 'secret-aws-key', severity: 'high', scope: 'all', pattern: /AKIA[0-9A-Z]{16}/, message: '疑似 AWS AccessKey 明文' },
  { rule: 'secret-openai-key', severity: 'high', scope: 'all', pattern: /sk-[A-Za-z0-9_-]{20,}/, message: '疑似 API sk- 密钥明文' },
  { rule: 'secret-github-token', severity: 'high', scope: 'all', pattern: /ghp_[A-Za-z0-9]{20,}/, message: '疑似 GitHub token 明文' },
  { rule: 'secret-private-key', severity: 'high', scope: 'all', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: '私钥文件内容' },
  { rule: 'sudo-script', severity: 'medium', scope: 'script', pattern: /(^|\n|\s|&|;|\|)sudo\s+/, message: '脚本使用 sudo（越权面）' },
  { rule: 'shell-true', severity: 'medium', scope: 'script', pattern: /shell\s*=\s*True/, message: 'subprocess shell=True（注入面）' },
  { rule: 'os-system', severity: 'medium', scope: 'script', pattern: /os\.system\(/, message: 'os.system 调 shell' },
  { rule: 'eval-exec', severity: 'medium', scope: 'script', pattern: /(^|[^a-zA-Z_.])eval\s*\(/, message: '脚本 eval 动态执行' },
  { rule: 'chmod-777', severity: 'medium', scope: 'all', pattern: /chmod\s+(?:-R\s+)?777\b/, message: 'chmod 777 世界可写' },
  { rule: 'pip-url-install', severity: 'medium', scope: 'script', pattern: /pip\d?\s+install\s+https?:\/\//, message: 'pip 从 URL 直装（供应链面）' },
  { rule: 'etc-sensitive-write', severity: 'medium', scope: 'all', pattern: /\/etc\/(passwd|shadow|sudoers)/, message: '触及系统敏感账户文件' },
]

// ---------- 有界常量 ----------

const MAX_FILES_PER_SKILL = 128
const MAX_FILE_BYTES = 262_144
const MAX_FINDINGS_PER_SKILL = 32
const MAX_PROFILES = 64
const MAX_SKILLS_PER_ROOT = 256

// ---------- 单技能扫描 ----------

function isScript(rel: string): boolean {
  return SCRIPT_EXTS.has(rel.slice(rel.lastIndexOf('.')))
}

function frontmatterOf(md: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]{0,8192}?)\r?\n---/.exec(md)
  const out: Record<string, string> = {}
  if (!m) return out
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line.trim())
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function scanText(rel: string, text: string): SkillFinding[] {
  const findings: SkillFinding[] = []
  const scope: RuleScope = isScript(rel) ? 'script' : rel === 'SKILL.md' ? 'md' : 'all'
  const lines = text.split('\n')
  for (const rule of S0_RULES) {
    if (rule.scope !== 'all' && rule.scope !== scope) continue
    rule.pattern.lastIndex = 0
    const m = rule.pattern.exec(text)
    if (!m) continue
    const line = m.index === 0 ? 1 : text.slice(0, m.index).split('\n').length
    findings.push({ rule: rule.rule, severity: rule.severity, file: rel, line, message: rule.message })
  }
  return findings
}

/** 扫描一个技能目录（须含 SKILL.md）。fail-soft：单文件坏跳过，目录坏返回 caution+finding。 */
export function scanSkillDir(dir: string, now: () => number = Date.now): SkillScanResult {
  const name = dir.slice(dir.lastIndexOf('/') + 1)
  const findings: SkillFinding[] = []
  const files = { total: 0, scripts: 0, binaries: 0, symlinks: 0 }
  const frontmatter = { hasName: false, nameMatchesDir: false, hasDescription: false, hasVersion: false }
  const skillMdPath = join(dir, 'SKILL.md')
  let fm: Record<string, string> = {}
  try {
    const st = statSync(skillMdPath)
    if (st.isFile() && st.size <= MAX_FILE_BYTES) fm = frontmatterOf(readFileSync(skillMdPath, 'utf8'))
  } catch { /* SKILL.md 缺席/超大：frontmatter 全 false，walk 仍继续 */
  }
  frontmatter.hasName = typeof fm.name === 'string' && fm.name.length > 0
  frontmatter.nameMatchesDir = frontmatter.hasName && fm.name === name
  frontmatter.hasDescription = typeof fm.description === 'string' && fm.description.length >= 8
  frontmatter.hasVersion = typeof fm.version === 'string' && fm.version.length > 0
  if (!frontmatter.hasName) findings.push({ rule: 'fm-no-name', severity: 'medium', file: 'SKILL.md', message: 'frontmatter 缺 name' })
  else if (!frontmatter.nameMatchesDir) findings.push({ rule: 'fm-name-mismatch', severity: 'medium', file: 'SKILL.md', message: `frontmatter name（${fm.name}）与目录名（${name}）不一致` })
  if (!frontmatter.hasDescription) findings.push({ rule: 'fm-no-description', severity: 'medium', file: 'SKILL.md', message: 'frontmatter 缺 description（≥8 字符）——技能索引可见性缺陷' })
  if (!frontmatter.hasVersion) findings.push({ rule: 'fm-no-version', severity: 'low', file: 'SKILL.md', message: 'frontmatter 缺 version' })

  // 有界递归遍历（宽度优先、目录数上限同文件上限）
  const queue: string[] = [dir]
  while (queue.length > 0 && files.total < MAX_FILES_PER_SKILL) {
    const cur = queue.shift()!
    let entries
    try {
      entries = readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (files.total >= MAX_FILES_PER_SKILL) {
        findings.push({ rule: 'scan-bound-hit', severity: 'low', file: relative(dir, cur) || '.', message: `文件数超 ${MAX_FILES_PER_SKILL} 上限，其余未扫描（如实记界）` })
        break
      }
      const full = join(cur, e.name)
      const rel = relative(dir, full)
      if (e.name.startsWith('.hermes-') || e.name === '.DS_Store') continue
      if (e.isSymbolicLink()) {
        files.symlinks += 1
        files.total += 1
        try {
          const target = resolve(dirname(full), readlinkSync(full))
          // 前缀判定必须带路径分隔符：skills/foo 的链接指向兄弟目录 skills/foo-bar
          // 时裸 startsWith 也命中，high 级「逃逸」被消掉（sibling 前缀绕过）。
          const rootDir = resolve(dir)
          if (target !== rootDir && !target.startsWith(rootDir + sep)) {
            findings.push({ rule: 'symlink-escape', severity: 'high', file: rel, message: `符号链接逃逸出技能目录：${target}` })
          }
        } catch { /* 坏链接跳过 */ }
        continue
      }
      let st
      try {
        st = statSync(full)
      } catch { continue }
      if (st.isDirectory()) {
        // 归档/备份目录不进扫描面（上游 .archive/ 同款语义）
        if (e.name === '.archive' || e.name === 'node_modules') continue
        queue.push(full)
        continue
      }
      if (!st.isFile()) continue
      files.total += 1
      const ext = e.name.slice(e.name.lastIndexOf('.'))
      if (BINARY_EXTS.has(ext)) {
        files.binaries += 1
        if (rel.startsWith('scripts')) findings.push({ rule: 'binary-in-scripts', severity: 'medium', file: rel, message: 'scripts/ 含二进制文件（不可审内容）' })
        continue
      }
      if (!TEXT_EXTS.has(ext) || st.size > MAX_FILE_BYTES) continue
      if (isScript(rel)) files.scripts += 1
      try {
        findings.push(...scanText(rel, readFileSync(full, 'utf8')))
      } catch { /* 单文件读失败跳过 */ }
    }
  }

  const capped = findings.slice(0, MAX_FINDINGS_PER_SKILL)
  const verdict: SkillScanVerdict = capped.some((f) => f.severity === 'high')
    ? 'dangerous'
    : capped.some((f) => f.severity === 'medium')
      ? 'caution'
      : 'safe'
  return { name, dir: resolve(dir), verdict, findings: capped, files, frontmatter, scannedAt: now() }
}

// ---------- 技能根扫描（默认根=hermes 侧全部装载面） ----------

export function defaultScanRoots(): string[] {
  const env = process.env.SKILLGOV_SCAN_ROOTS?.trim()
  if (env) return env.split(':').map((s) => resolve(s.replace(/^~/, homedir()))).filter(Boolean)
  const roots = [join(homedir(), '.hermes', 'skills'), join(homedir(), '.agents', 'skills')]
  const profilesRoot = process.env.HERMES_PROFILES_ROOT?.trim()
    ? resolve(process.env.HERMES_PROFILES_ROOT.replace(/^~/, homedir()))
    : join(homedir(), '.hermes', 'profiles')
  try {
    for (const p of readdirSync(profilesRoot).filter((d) => !d.startsWith('.')).slice(0, MAX_PROFILES)) {
      roots.push(join(profilesRoot, p, 'skills'))
    }
  } catch { /* profiles 根缺席跳过 */ }
  return roots
}

function* skillDirsOfRoot(root: string): Generator<string> {
  if (!existsSync(root)) return
  let top
  try {
    top = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  } catch { return }
  let count = 0
  for (const e of top) {
    if (count >= MAX_SKILLS_PER_ROOT) return
    const child = join(root, e.name)
    if (existsSync(join(child, 'SKILL.md'))) {
      count += 1
      yield child
      continue
    }
    // 二级分类目录（skills/<category>/<skill>）
    let subs
    try {
      subs = readdirSync(child, { withFileTypes: true }).filter((s) => s.isDirectory() && !s.name.startsWith('.'))
    } catch { continue }
    for (const s of subs) {
      if (count >= MAX_SKILLS_PER_ROOT) return
      const sub = join(child, s.name)
      if (existsSync(join(sub, 'SKILL.md'))) {
        count += 1
        yield sub
      }
    }
  }
}

export interface SkillScanSummary {
  scannedAt: number
  roots: string[]
  scanned: number
  byVerdict: { safe: number; caution: number; dangerous: number }
  results: SkillScanResult[]
}

// ---------- 扫描账本（JSONL：一次扫描一行；末行为 latest） ----------

function ledgerFile(): string {
  return process.env.SKILLGOV_SCAN_LEDGER?.trim()
    ? resolve(process.env.SKILLGOV_SCAN_LEDGER.replace(/^~/, homedir()))
    : join(homedir(), '.hermes-web-ui', 'skillgov', 'skill-scan.jsonl')
}

const LEDGER_CAP = 500

/** 内存 latest（进程内快查；跨进程以账本末行为准）。 */
let latestInMemory: SkillScanSummary | null = null

export function runSkillScan(roots?: string[]): SkillScanSummary {
  const useRoots = roots?.length ? roots.map((r) => resolve(r)) : defaultScanRoots()
  const results: SkillScanResult[] = []
  const seen = new Set<string>()
  for (const root of useRoots) {
    for (const dir of skillDirsOfRoot(root)) {
      const key = resolve(dir)
      if (seen.has(key)) continue
      seen.add(key)
      results.push(scanSkillDir(dir))
    }
  }
  const byVerdict = { safe: 0, caution: 0, dangerous: 0 }
  for (const r of results) byVerdict[r.verdict] += 1
  const summary: SkillScanSummary = { scannedAt: Date.now(), roots: useRoots, scanned: results.length, byVerdict, results }
  latestInMemory = summary
  appendScanLedger(summary)
  return summary
}

function appendScanLedger(summary: SkillScanSummary): void {
  try {
    const file = ledgerFile()
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, JSON.stringify(summary) + '\n', 'utf8')
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length > LEDGER_CAP * 2) {
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
      writeFileSync(tmp, lines.slice(-LEDGER_CAP).join('\n') + '\n', 'utf8')
      renameSync(tmp, file)
    }
  } catch { /* 账本失败不阻断扫描 */ }
}

function latestFromLedger(): SkillScanSummary | null {
  const lines = readFileSync(ledgerFile(), 'utf8').split('\n').filter(Boolean)
  if (lines.length === 0) return null
  return JSON.parse(lines[lines.length - 1]) as SkillScanSummary
}

export function latestSkillScan(): SkillScanSummary | null {
  if (latestInMemory) return latestInMemory
  try {
    latestInMemory = latestFromLedger()
    return latestInMemory
  } catch {
    return null
  }
}

/**
 * 扫描单个技能目录并记账（导入/生成/注入通路的注册扫描入口——上游 import 补丁
 * 与生成器 run 都调这里）：结果并入 latest（执行拦截钩子随即可见）+ 追加账本。
 */
export function recordSkillScan(dir: string): SkillScanResult {
  const result = scanSkillDir(dir)
  const base = latestInMemory ?? (() => {
    try {
      return latestFromLedger()
    } catch {
      return null
    }
  })()
  const results = [...(base?.results.filter((r) => r.dir !== result.dir) ?? []), result].slice(-MAX_SKILLS_PER_ROOT)
  const byVerdict = { safe: 0, caution: 0, dangerous: 0 }
  for (const r of results) byVerdict[r.verdict] += 1
  latestInMemory = {
    scannedAt: Date.now(),
    roots: base?.roots ?? [dirname(result.dir)],
    scanned: results.length,
    byVerdict,
    results,
  }
  appendScanLedger(latestInMemory)
  return result
}

/** 执行拦截查询面：技能名 → 最近扫描判定（无扫描/未收录 → undefined=fail-open 放行）。 */
export function latestVerdictOf(skillName: string): SkillScanVerdict | undefined {
  const hit = latestSkillScan()?.results.find((r) => r.name === skillName)
  return hit?.verdict
}

/** 测试隔离。 */
export function _useScanLedgerForTests(path: string): void {
  process.env.SKILLGOV_SCAN_LEDGER = path
  latestInMemory = null
}

export function _setLatestForTests(summary: SkillScanSummary | null): void {
  latestInMemory = summary
}
