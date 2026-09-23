// ontology executor（P7，v0.1 §63）：确定性语义检查 v0——
//   1) terminology-ambiguity：同一文件混用 distinctFrom 概念术语（Captured/Settled 混写），或
//      映射到概念 X 的字段名内嵌概念 Y（Y∈X.distinctFrom）的标签/别名
//   2) concept-mismatch：映射指向索引中不存在的概念
// 全部 warning 级 → evidence result=conditional → 门 verdict CONDITIONAL（finding 非强阻断，v0.1 §63）。
// Provider 关闭/不可用 → skipped/error 证据（→ INCONCLUSIVE，绝不 crash，v0.1 §62 验收）。

import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { loadProject, builtinPacksRoot } from '../core/loader.js'
import {
  createProvider, type OntologyIndex, type OntologyConcept, type SemanticFinding,
} from '../ontology/provider.js'
import { globMatch } from '../core/impact.js'

export interface OntologyExecutorInput {
  runId: string
  gateId: string
  workspace: string
  qgateDir: string
  commit?: string
}

const DEFAULT_SCAN = ['docs/**/*.md', '*.md', 'src/**/*.ts', 'src/**/*.js']

export async function runOntologyExecutor(
  executor: ExecutorSpec,
  input: OntologyExecutorInput,
): Promise<Evidence> {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-onto`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'ontology-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const finish = (result: Evidence['result'], execution: Evidence['execution'], summary: string, findings?: SemanticFinding[]): Evidence => {
    ev.result = result
    ev.execution = execution
    ev.summary = summary
    if (findings && findings.length > 0) {
      ev.summary = `${summary}; findings=${findings.length}: ` + findings
        .slice(0, 5)
        .map((f) => `${f.type}[${f.subject}]`)
        .join(', ')
    }
    ev.provenance.endedAt = Date.now()
    return ev
  }

  const loaded = loadProject(input.workspace)
  const ontologyConfig = loaded?.config.ontology
  if (!ontologyConfig || ontologyConfig.provider === 'off') {
    return finish('skipped', 'present', 'ontology provider off — enable via .qgate/qgate.yaml ontology.provider')
  }
  const provider = createProvider(ontologyConfig, builtinPacksRoot())
  if (!provider) {
    return finish('skipped', 'present', `ontology provider '${ontologyConfig.provider}' not registered`)
  }
  const index: OntologyIndex | null = await provider.load()
  if (!index) {
    return finish('error', 'wired', `ontology provider '${provider.name}' unavailable (index load failed) → INCONCLUSIVE`)
  }

  const conceptById = new Map<string, OntologyConcept>(index.concepts.map((c) => [c.id, c]))
  const findings: SemanticFinding[] = []

  // ── 概念错配：映射指向不存在的概念 ──
  for (const m of ontologyConfig.mappings) {
    if (!conceptById.has(m.conceptId)) {
      findings.push({
        type: 'concept-mismatch',
        subject: m.conceptId,
        evidence: `project mapping references unknown concept in provider '${provider.name}'`,
        severity: 'warning',
      })
    }
  }

  // ── 字段级歧义：映射到 X 的目标名内嵌 Y 的术语（Y∈X.distinctFrom） ──
  const termsOf = (c: OntologyConcept): string[] =>
    [c.label, ...(c.aliases ?? [])].map((s) => s.toLowerCase())
  for (const m of ontologyConfig.mappings) {
    const concept = conceptById.get(m.conceptId)
    if (!concept?.distinctFrom) continue
    for (const otherId of concept.distinctFrom) {
      const other = conceptById.get(otherId)
      if (!other) continue
      const targets = [...(m.code ?? []), ...(m.tables ?? []), ...(m.fields ?? [])]
      for (const target of targets) {
        const hit = termsOf(other).find((term) => term.length >= 4 && target.toLowerCase().includes(term))
        if (hit) {
          findings.push({
            type: 'terminology-ambiguity',
            subject: target,
            evidence: `mapped to '${concept.label}' but name contains '${hit}' (${other.label}) — ${concept.label} ≠ ${other.label}`,
            severity: 'warning',
          })
        }
      }
    }
  }

  // ── 内容级歧义：同一文件混用 distinctFrom 概念术语 ──
  const scanGlobs = executor.scan && executor.scan.length > 0 ? executor.scan : DEFAULT_SCAN
  const mappedConcepts = ontologyConfig.mappings
    .map((m) => conceptById.get(m.conceptId))
    .filter((c): c is OntologyConcept => c !== undefined)
  const watchPairs: Array<[OntologyConcept, OntologyConcept]> = []
  for (const c of mappedConcepts) {
    for (const otherId of c.distinctFrom ?? []) {
      const other = conceptById.get(otherId)
      if (other && !watchPairs.some(([a, b]) => (a === c && b === other) || (a === other && b === c))) {
        watchPairs.push([c, other])
      }
    }
  }
  if (watchPairs.length > 0) {
    for (const file of scanFiles(input.workspace, scanGlobs)) {
      let content: string
      try {
        content = readFileSync(file, 'utf8').toLowerCase()
      } catch {
        continue
      }
      if (content.length > 512_000) continue
      for (const [a, b] of watchPairs) {
        const hitA = termsOf(a).find((t) => t.length >= 4 && content.includes(t))
        const hitB = termsOf(b).find((t) => t.length >= 4 && content.includes(t))
        if (hitA && hitB) {
          findings.push({
            type: 'terminology-ambiguity',
            subject: relative(input.workspace, file),
            evidence: `file mixes '${hitA}' (${a.label}) and '${hitB}' (${b.label}) — distinct concepts`,
            severity: 'warning',
          })
        }
      }
    }
  }

  if (findings.length === 0) {
    return finish('pass', 'exercised', `no semantic findings (provider=${provider.name}, mappings=${ontologyConfig.mappings.length})`)
  }
  return finish('conditional', 'exercised', `semantic findings present (provider=${provider.name})`, findings)
}

/** 受限目录遍历：glob 命中的文件（深度 ≤8，单目录 ≤2000 项）。 */
function scanFiles(root: string, globs: readonly string[]): string[] {
  const out: string[] = []
  const visit = (dir: string, depth: number): void => {
    if (depth > 8 || out.length > 2000) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git' || name === '.qgate') continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        visit(full, depth + 1)
      } else if (st.isFile() && st.size <= 512_000) {
        const rel = relative(root, full)
        if (globs.some((g) => globMatch(g, rel)) && existsSync(full)) out.push(full)
      }
    }
  }
  visit(root, 0)
  return out
}
