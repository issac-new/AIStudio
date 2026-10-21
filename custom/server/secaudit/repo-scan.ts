// overlay/secaudit 代码仓审计面采集器（2026-10-21 挂账清偿批次 D）。
// 审计对象=任意代码仓（repoRoot）；三采集器只读、fail-soft（挂了 count=0+失败摘要）。
// 纪律：不造静态分析引擎——密钥/危险 API 用保守确定性规则族；依赖面只记声明，
// 漏洞判定指向在线门 qgate security.sast-audit（npm audit 需网络，不在此造假数）。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface RepoEvidence {
  count: number
  summary: string
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.claude', '.superpowers', 'coverage'])
const TEXT_EXT = /\.(ts|tsx|js|jsx|vue|py|json|ya?ml|toml|env|sh|md|txt|cfg|ini|conf)$/i
const MAX_FILES = 2000
const MAX_FILE_BYTES = 512 * 1024

interface WalkedFile {
  rel: string
  text: string
}

function walk(repoRoot: string): WalkedFile[] {
  const out: WalkedFile[] = []
  const stack: string[] = [repoRoot]
  while (stack.length > 0 && out.length < MAX_FILES) {
    const dir = stack.pop()!
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const full = join(dir, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          if (!SKIP_DIRS.has(name)) stack.push(full)
        } else if (st.isFile() && st.size <= MAX_FILE_BYTES && TEXT_EXT.test(name)) {
          out.push({ rel: full.slice(repoRoot.length + 1), text: readFileSync(full, 'utf8') })
          if (out.length >= MAX_FILES) break
        }
      } catch {
        // 不可读文件跳过
      }
    }
  }
  return out
}

interface SecretRule {
  rule: string
  pattern: RegExp
}

const SECRET_RULES: SecretRule[] = [
  { rule: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { rule: 'openai-style-key', pattern: /sk-(proj-)?[A-Za-z0-9_-]{20,}/ },
  { rule: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { rule: 'private-key-pem', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { rule: 'slack-token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { rule: 'jwt-literal', pattern: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { rule: 'assigned-password', pattern: /(password|passwd|secret)\s*[:=]\s*["'][^"'\s]{8,}["']/i },
]

/** 密钥形态扫描（保守确定性规则族；命中≠已泄露——人工复核后入三态裁决）。 */
export function scanRepoSecrets(repoRoot: string): RepoEvidence {
  try {
    const files = walk(repoRoot)
    const hits = new Map<string, number>()
    for (const f of files) {
      for (const r of SECRET_RULES) {
        const m = f.text.match(r.pattern)
        if (m) hits.set(r.rule, (hits.get(r.rule) ?? 0) + 1)
      }
    }
    const total = [...hits.values()].reduce((a, b) => a + b, 0)
    const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(' ')
    return {
      count: total,
      summary: total === 0
        ? `扫描 ${files.length} 个文本文件：未命中密钥形态`
        : `扫描 ${files.length} 个文本文件：命中密钥形态 ${total} 处（${top}）——需人工复核，命中≠已泄露`,
    }
  } catch (e) {
    return { count: 0, summary: `密钥扫描失败：${(e as Error).message.slice(0, 120)}` }
  }
}

/** 依赖声明面（只记事实；漏洞判定走在线门 security.sast-audit，本采集器不造数）。 */
export function scanRepoDeps(repoRoot: string): RepoEvidence {
  try {
    const pkgPath = join(repoRoot, 'package.json')
    if (!existsSync(pkgPath)) {
      return { count: 0, summary: '无 package.json（非 Node 仓或未初始化）' }
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const deps = Object.keys(pkg.dependencies ?? {}).length
    const devDeps = Object.keys(pkg.devDependencies ?? {}).length
    const lock = existsSync(join(repoRoot, 'package-lock.json'))
    return {
      count: deps,
      summary: `直接依赖 ${deps} 个（dev ${devDeps}），lockfile ${lock ? '在' : '缺席'}——漏洞判定走在线门 security.sast-audit（npm audit），本面不造数`,
    }
  } catch (e) {
    return { count: 0, summary: `依赖面读取失败：${(e as Error).message.slice(0, 120)}` }
  }
}

const DANGEROUS_RULES: SecretRule[] = [
  { rule: 'eval', pattern: /\beval\s*\(/ },
  { rule: 'new-function', pattern: /new\s+Function\s*\(/ },
  { rule: 'exec-template', pattern: /(exec|execSync|spawnSync)\s*\(\s*[`"'][^`"']*\$\{/ },
  { rule: 'innerhtml', pattern: /\.innerHTML\s*=/ },
]

/** 危险 API 形态（eval/new Function/exec 模板拼接/innerHTML 赋值——保守命中，人工复核）。 */
export function scanRepoDangerousApi(repoRoot: string): RepoEvidence {
  try {
    const files = walk(repoRoot)
    const hits = new Map<string, number>()
    let hitFiles = 0
    for (const f of files) {
      const inFile = new Set<string>()
      for (const r of DANGEROUS_RULES) {
        if (r.pattern.test(f.text)) inFile.add(r.rule)
      }
      if (inFile.size > 0) {
        hitFiles += 1
        for (const rule of inFile) hits.set(rule, (hits.get(rule) ?? 0) + 1)
      }
    }
    const total = [...hits.values()].reduce((a, b) => a + b, 0)
    const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ')
    return {
      count: total,
      summary: total === 0
        ? `扫描 ${files.length} 个源码文件：未命中危险 API 形态`
        : `扫描 ${files.length} 个源码文件：危险 API 形态 ${hitFiles} 个文件（${top}）——需人工复核`,
    }
  } catch (e) {
    return { count: 0, summary: `危险 API 扫描失败：${(e as Error).message.slice(0, 120)}` }
  }
}
