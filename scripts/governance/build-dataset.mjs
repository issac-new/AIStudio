#!/usr/bin/env node
/**
 * 治理数据集生成器（4A 治理层第五期 ④）——注册表族 → agent-handbook.jsonl。
 *
 * 定位：文章六件套之四"面向模型/RAG/Agent 的高质量数据集"的最小可信形态：
 * 单一生成器从受守门的四份注册表蒸馏，产物入 git；守门断言"重新生成零 diff"
 * （产物与源注册表零漂移——生成器保证，不需人工维护第二份）。
 *
 * 用法：
 *   node scripts/governance/build-dataset.mjs            # 生成（写 runtime/governance/dataset/agent-handbook.jsonl）
 *   node scripts/governance/build-dataset.mjs --check    # 校验：重新生成与在库产物逐字节一致，漂移 exit 1
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parse } = require('yaml')

const here = dirname(fileURLToPath(import.meta.url))
const overlayRoot = resolve(here, '../..')
const govDir = resolve(overlayRoot, 'runtime/governance')
const outPath = resolve(govDir, 'dataset/agent-handbook.jsonl')

function loadYaml(name) {
  const p = resolve(govDir, name)
  if (!existsSync(p)) throw new Error(`注册表缺席：${p}`)
  return parse(readFileSync(p, 'utf8'))
}

function genLines() {
  const ledger = loadYaml('capability-ledger.yaml')
  const metrics = loadYaml('metrics.yaml')
  const contracts = loadYaml('action-contracts.yaml')
  const state = loadYaml('state-model.yaml')
  const domainName = new Map((ledger.domains ?? []).map((d) => [d.id, d.name]))
  const capById = new Map((ledger.capabilities ?? []).map((c) => [c.id, c]))
  const sloTargets = metrics.sloTargets ?? {}
  const lines = []

  // 1) 单元条目（agent 认识自己）：unit → capability → SLO → 判定词表 → 契约入口
  for (const u of ledger.units ?? []) {
    const cap = capById.get(u.capability)
    const tgt = sloTargets[u.sloTier]
    lines.push(JSON.stringify({
      kind: 'unit',
      id: u.id,
      capability: u.capability,
      capabilityName: cap?.name ?? u.capability,
      domain: cap ? (domainName.get(cap.domain) ?? cap.domain) : undefined,
      object_action: cap ? `${cap.object}·${cap.action}` : undefined,
      kind_class: u.kind,
      primary: !!u.primary,
      owner: u.owner,
      lifecycle: u.lifecycle,
      slo_tier: u.sloTier,
      slo_target: tgt ? `成功率≥${(tgt.successRate * 100).toFixed(0)}%（${tgt.windowDays}d 窗口，样本<${tgt.minSamples} 挂起）` : undefined,
      skills: u.skills,
      verdict_vocabulary: 'metrics.yaml#verdicts（六态；词面相似不构成判定依据）',
      contract_entry: u.kind === 'lane-specialist' ? 'column.dispatch（列派单负载附契约块）' : 'action-contracts.yaml',
      reviewedAt: u.reviewedAt,
    }))
  }

  // 2) 判定词条目（每态一行）
  for (const v of metrics.verdicts ?? []) {
    lines.push(JSON.stringify({ kind: 'verdict', id: v.id, label: v.label, semantics: v.semantics }))
  }

  // 3) 指标条目
  for (const m of metrics.metrics ?? []) {
    lines.push(JSON.stringify({
      kind: 'metric', id: m.id, name: m.name, formula: m.formula,
      dimensions: m.dimensions, authority: m.authority, status: m.status,
    }))
  }

  // 4) 动作契约条目（六件事压缩）
  for (const c of contracts.contracts ?? []) {
    lines.push(JSON.stringify({
      kind: 'contract', id: c.id, version: c.version, purpose: c.purpose,
      input: c.input, output: c.output, errors: c.errors, owner: c.owner,
      verdict_carrier: c.verdictCarrier ?? null,
    }))
  }

  // 5) 状态与转移条目
  for (const s of state.states ?? []) {
    lines.push(JSON.stringify({ kind: 'state', id: s.id, object: state.object, semantics: s.semantics }))
  }
  for (const t of state.transitions ?? []) {
    lines.push(JSON.stringify({
      kind: 'transition', id: t.id, from: t.from, to: t.to, trigger: t.trigger,
      rules: t.rules, actions: t.actions, evidence: t.evidence,
    }))
  }

  // 6) 准入五问条目（引用清单，答案在签署时人工提供）
  lines.push(JSON.stringify({
    kind: 'admission',
    id: 'five-questions',
    questions: ['真实场景', '口径一致', '用途边界', '越界可证', '责任落地'],
    rule: '一票否决，缺一问不签（写入闸：首宣或答卷缺失须随写五答）',
    ref: 'runtime/governance/admission-checklist.md',
  }))

  return lines.join('\n') + '\n'
}

const generated = genLines()
if (process.argv.includes('--check')) {
  if (!existsSync(outPath)) {
    console.error(`[dataset] 产物缺席：${outPath}（先跑 node scripts/governance/build-dataset.mjs 生成并提交）`)
    process.exit(1)
  }
  const inRepo = readFileSync(outPath, 'utf8')
  if (inRepo !== generated) {
    console.error('[dataset] 漂移：注册表已变更但数据集未再生（跑 node scripts/governance/build-dataset.mjs 并提交）')
    process.exit(1)
  }
  console.log(`[dataset] 零漂移（${inRepo.split('\n').filter(Boolean).length} 条）`)
  process.exit(0)
}
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, generated)
console.log(`[dataset] 生成 ${generated.split('\n').filter(Boolean).length} 条 → ${outPath}`)
