#!/usr/bin/env node
/**
 * FIBO 导出 CLI（P3-3 / P4 运营化）。
 *
 * 调用本体工作台的导出端点，把当前 spec（导入 FIBO 包后）写成 JSON-LD / SHACL /
 * Turtle，供 pyshacl、rdflib、Jena 等外部工具消费。只读，不改本体。
 *
 * 用法：
 *   node scripts/fibo/export.mjs --format jsonld --out fibo.jsonld
 *   node scripts/fibo/export.mjs --format shacl --out fibo-shapes.jsonld
 *   node scripts/fibo/export.mjs --format turtle --out fibo.ttl
 * 选项：--base http://127.0.0.1:8647  --token <Bearer token>
 * 环境：ONTOLOGY_BASE_URL / ONTOLOGY_API_TOKEN 可代替同名选项。
 */
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
if (args.includes('--help') || args.includes('-h')) {
  console.log('用法：node scripts/fibo/export.mjs --format jsonld|shacl|turtle [--out 文件] [--base URL] [--token TOKEN]')
  process.exit(0)
}

const format = arg('--format') ?? 'jsonld'
if (!['jsonld', 'shacl', 'turtle'].includes(format)) {
  console.error('✗ --format 须为 jsonld | shacl | turtle')
  process.exit(1)
}
const ext = format === 'turtle' ? 'ttl' : 'jsonld'
const out = arg('--out') ?? `fibo-export.${ext}`
const base = (arg('--base') ?? process.env.ONTOLOGY_BASE_URL ?? 'http://127.0.0.1:8647').replace(/\/$/, '')
const token = arg('--token') ?? process.env.ONTOLOGY_API_TOKEN

async function main() {
  const res = await fetch(`${base}/api/hermes/ontology/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(out, text, 'utf8')
  console.log(`✓ 已导出 ${format} → ${out}（${text.length} 字节）`)
}

main().catch((e) => {
  console.error(`✗ ${e.message}`)
  process.exit(1)
})
