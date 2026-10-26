// overlay[specs] 设计规格只读索引（JoyAI 闭环吸收轮 P2，2026-10-26）。
//
// 范式来源：京东 JoyAI ZERO「术语→关联全量文档」——企业知识不是独立词条，而是
// 术语与全量文档的关联网。本仓的「全量文档」= docs/superpowers/specs/*.md
// （358+ 份决策事实源，git 管理的单一事实源）。
//
// 纯读侧投影：不落盘、不建 store（specs 本身就是事实源，索引落盘=第二事实源
// 违反仓规）。内存缓存按目录 mtime 失效；检索=关键词子串扫描（规则式，无 LLM）。
// fail-soft：目录缺席/读失败返回空结果，不阻断调用方。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface SpecDoc {
  /** 文件名（含 .md）。 */
  file: string
  /** 首个 `# ` 标题行（缺席回落文件名去扩展）。 */
  title: string
  /** 文件名前缀日期（YYYY-MM-DD；非日期命名缺席）。 */
  date: string | null
}

export interface SpecHit extends SpecDoc {
  /** 命中行（去首尾空白，截 160 字符）。 */
  matchedLine: string
}

/** 仓根解析：SPECS_DIR 直接指 specs 目录（测试隔离）；否则上溯找 custom/server
 * 的仓根（nine-layers findOverlayRoot 同款）。 */
export function specsDir(): string {
  const direct = process.env.SPECS_DIR?.trim()
  if (direct) return direct
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'custom', 'server'))) return join(dir, 'docs', 'superpowers', 'specs')
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return join(process.cwd(), 'docs', 'superpowers', 'specs')
}

let cache: { dir: string; mtimeMs: number; docs: SpecDoc[] } | null = null

/** 全量文档清单（目录 mtime 缓存——新增/删除文件改变目录 mtime，内容变更由
 * 检索时现读承担）。任何异常返回空清单（fail-soft）。 */
export function listSpecDocs(): SpecDoc[] {
  const dir = specsDir()
  try {
    const mtimeMs = statSync(dir).mtimeMs
    if (cache && cache.dir === dir && cache.mtimeMs === mtimeMs) return cache.docs
    const docs: SpecDoc[] = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue
      const file = join(dir, name)
      try {
        const stat = statSync(file)
        if (!stat.isFile()) continue
      } catch { continue }
      const m = name.match(/^(\d{4}-\d{2}-\d{2})/)
      let title = name.replace(/\.md$/, '')
      try {
        const text = readFileSync(file, 'utf8')
        const h = text.split('\n').find((l) => l.startsWith('# '))
        if (h) title = h.slice(2).trim()
      } catch { /* 单文件读失败用文件名当标题（fail-soft） */ }
      docs.push({ file: name, title, date: m ? m[1] : null })
    }
    docs.sort((a, b) => b.file.localeCompare(a.file))
    cache = { dir, mtimeMs, docs }
    return docs
  } catch {
    cache = null
    return []
  }
}

/** 换出缓存（测试用）。 */
export function resetSpecsIndexForTests(): void {
  cache = null
}

/** 关键词检索：任一关键词在正文命中即入选，按命中文件名倒序（新者优先）。
 * 大小写不敏感；正文与标题都参与。空关键词返回空。 */
export function searchSpecs(keywords: string[], limit = 10): SpecHit[] {
  const kws = keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2)
  if (!kws.length) return []
  const dir = specsDir()
  const hits: SpecHit[] = []
  for (const doc of listSpecDocs()) {
    let text: string
    try {
      text = readFileSync(join(dir, doc.file), 'utf8')
    } catch { continue }
    const lower = text.toLowerCase()
    if (!kws.some((k) => lower.includes(k))) continue
    const line = text.split('\n').find((l) => kws.some((k) => l.toLowerCase().includes(k))) ?? ''
    hits.push({ ...doc, matchedLine: line.trim().slice(0, 160) })
    if (hits.length >= limit) break
  }
  return hits
}

/** 全文提及扫描（P3 术语→关联文档消费）：term 在该文档正文出现即计一次命中。
 * 大小写不敏感；term 长度 <2 不参与（单字符误报率高）。 */
export function specMentionsTerm(term: string): SpecHit[] {
  const t = term.trim().toLowerCase()
  if (t.length < 2) return []
  const dir = specsDir()
  const hits: SpecHit[] = []
  for (const doc of listSpecDocs()) {
    let text: string
    try {
      text = readFileSync(join(dir, doc.file), 'utf8')
    } catch { continue }
    const lower = text.toLowerCase()
    if (!lower.includes(t)) continue
    const line = text.split('\n').find((l) => l.toLowerCase().includes(t)) ?? ''
    hits.push({ ...doc, matchedLine: line.trim().slice(0, 160) })
  }
  return hits
}

/** 多术语一次扫描（P3 消费）：每份正文只读一遍，任一术语命中即记（命中行取
 * 第一个命中的术语）。返回按「文件名倒序 + 命中术语字母序」排序的清单。
 * 纯 ASCII 术语要求 ≥3 字符（pay/to 等短英文词误报率高），其余 ≥2。 */
export function scanTermsInSpecs(terms: string[]): Array<SpecHit & { term: string }> {
  const norm = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => {
    if (!t) return false
    return /^[\x20-\x7e]+$/.test(t) ? t.length >= 3 : t.length >= 2
  }))]
  if (!norm.length) return []
  const dir = specsDir()
  const hits: Array<SpecHit & { term: string }> = []
  for (const doc of listSpecDocs()) {
    let text: string
    try {
      text = readFileSync(join(dir, doc.file), 'utf8')
    } catch { continue }
    const lower = text.toLowerCase()
    for (const t of norm) {
      if (!lower.includes(t)) continue
      const line = text.split('\n').find((l) => l.toLowerCase().includes(t)) ?? ''
      hits.push({ ...doc, matchedLine: line.trim().slice(0, 160), term: t })
      break
    }
  }
  return hits
}
