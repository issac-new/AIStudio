// overlay/secaudit 部署面密钥扫描（京东评测体系吸收轮 2026-10-23 补缺）。
//
// 背景：catalog 的 secrets 面自始声明 collector:'secrets'（环境变量/配置文件
// 内嵌密钥、令牌落盘、日志泄漏），但 collectAutoEvidence 从未产出 out.secrets
// ——声明与实物不符，该面自动兜底缺位。本采集器补齐：扫描部署根（缺省
// ~/.hermes）下配置类文件与小尺寸日志，复用 repo-scan 的保守密钥形态规则族。
// 纪律：只读、fail-soft；命中≠已泄露——count 是"需人工复核的形态命中数"，
// 三态裁决（confirmed/needs_validation/rejected）仍归 engine/verify。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SECRET_RULES, type RepoEvidence } from './repo-scan'

/** 数据目录不扫：traces/db/sessions 是运行时产物，尺寸大且命中多为业务数据误报。 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'traces', 'db', 'sessions', 'dist', 'coverage', 'cache'])
/** 配置与日志面（.log 纳入：令牌落盘/日志泄漏是 secrets 面 focus 的显式一半）。 */
const DEPLOY_EXT = /\.(json|ya?ml|toml|env|ini|cfg|conf|log|txt)$/i
const MAX_FILES = 300
const MAX_FILE_BYTES = 512 * 1024
const MAX_DEPTH = 3

function deployRoot(): string | undefined {
  const env = process.env.SECAUDIT_DEPLOY_ROOT?.trim()
  if (env) return env
  return join(homedir(), '.hermes')
}

/**
 * 部署面密钥形态扫描（保守确定性规则；与 repo_secrets 的分工——那个扫代码仓
 * repoRoot，本采集器扫部署根的运行时配置与日志）。
 */
export function scanDeploySecrets(): RepoEvidence {
  try {
    const root = deployRoot()
    const files: { rel: string; text: string }[] = []
    const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
    while (stack.length > 0 && files.length < MAX_FILES) {
      const { dir, depth } = stack.pop()!
      if (depth > MAX_DEPTH) continue
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
            if (!SKIP_DIRS.has(name)) stack.push({ dir: full, depth: depth + 1 })
          } else if (st.isFile() && st.size <= MAX_FILE_BYTES && DEPLOY_EXT.test(name)) {
            files.push({ rel: full.slice(root.length + 1), text: readFileSync(full, 'utf8') })
            if (files.length >= MAX_FILES) break
          }
        } catch {
          // 不可读文件跳过（权限/竞态）
        }
      }
    }
    const hits = new Map<string, number>()
    for (const f of files) {
      for (const r of SECRET_RULES) {
        if (r.pattern.test(f.text)) hits.set(r.rule, (hits.get(r.rule) ?? 0) + 1)
      }
    }
    const total = [...hits.values()].reduce((a, b) => a + b, 0)
    const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(' ')
    return {
      count: total,
      summary: total === 0
        ? `扫描部署根 ${root}：${files.length} 个配置/日志文件，未命中密钥形态`
        : `扫描部署根 ${root}：${files.length} 个配置/日志文件，命中密钥形态 ${total} 处（${top}）——命中≠已泄露，需人工复核`,
    }
  } catch (e) {
    return { count: 0, summary: `部署面密钥扫描失败：${(e as Error).message.slice(0, 120)}` }
  }
}
