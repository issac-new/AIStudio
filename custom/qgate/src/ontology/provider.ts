// Ontology Provider（P6，v0.1 §39-§44）：语义按 Provider 注入，内核不认识 FIBO 具体类。
// 可配置（.qgate/qgate.yaml ontology.provider）、可关闭（off/缺省）、不可用不 crash（→ null → 门降级 INCONCLUSIVE）。

export interface OntologyConcept {
  id: string
  label: string
  aliases?: string[]
  definition?: string
  /** 语义近邻但不同义的概念（歧义检测用）：与这些词混用 = finding。 */
  distinctFrom?: string[]
  source?: string
}

export interface OntologyConstraint {
  id: string
  expression: string
  severity: 'error' | 'warning'
  description?: string
}

export interface OntologyIndex {
  schemaVersion: 1
  provider: string
  concepts: OntologyConcept[]
  constraints: OntologyConstraint[]
}

export type SemanticFindingType =
  | 'terminology-ambiguity'   // 同一制品混用近义不同义术语（Captured vs Settled）
  | 'concept-mismatch'        // 代码/文档字段映射到非声明概念
  | 'unmapped-term'           // 映射缺失（提示级）

export interface SemanticFinding {
  type: SemanticFindingType
  subject: string
  evidence: string
  severity: 'error' | 'warning'
}

export interface OntologyProvider {
  readonly name: string
  load(): Promise<OntologyIndex | null>
}

/** 项目映射（v0.1 §43）：领域概念 ↔ 代码符号/表/字段。 */
export interface OntologyMapping {
  conceptId: string
  code?: string[]
  tables?: string[]
  fields?: string[]
}

export interface OntologyConfig {
  provider: 'off' | string
  mappings: OntologyMapping[]
}

/** 从 qgate.yaml 的 ontology 段解析（容错：非法 → null 段忽略）。 */
export function parseOntologyConfig(raw: unknown): OntologyConfig | null {
  if (raw === undefined || raw === null) return { provider: 'off', mappings: [] }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const provider = rec.provider === undefined ? 'off' : String(rec.provider)
  const mappings: OntologyMapping[] = []
  if (rec.mappings !== undefined) {
    if (!Array.isArray(rec.mappings)) return null
    for (const m of rec.mappings) {
      if (typeof m !== 'object' || m === null || Array.isArray(m)) return null
      const conceptId = (m as Record<string, unknown>).conceptId
      if (typeof conceptId !== 'string' || conceptId.length === 0) return null
      const strArr = (v: unknown): string[] | undefined =>
        Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined
      mappings.push({
        conceptId,
        code: strArr((m as Record<string, unknown>).code),
        tables: strArr((m as Record<string, unknown>).tables),
        fields: strArr((m as Record<string, unknown>).fields),
      })
    }
  }
  return { provider, mappings }
}

// ── Provider 实现 ──

/** Mock：测试与演示用，固定三概念。 */
export class MockOntologyProvider implements OntologyProvider {
  readonly name = 'mock'
  async load(): Promise<OntologyIndex> {
    return {
      schemaVersion: 1,
      provider: 'mock',
      concepts: [
        { id: 'fibo-payment', label: 'Payment', aliases: ['支付'], distinctFrom: ['fibo-settlement'], source: 'mock' },
        { id: 'fibo-amount', label: 'MonetaryAmount', aliases: ['金额'], source: 'mock' },
        { id: 'fibo-settlement', label: 'Settlement', aliases: ['结算'], distinctFrom: ['fibo-payment'], source: 'mock' },
      ],
      constraints: [],
    }
  }
}

/** 从预处理 JSON 索引文件加载（OD-004：不做运行时 RDF/OWL 推理）。 */
export class IndexFileProvider implements OntologyProvider {
  constructor(readonly name: string, private readonly file: string) {}
  async load(): Promise<OntologyIndex | null> {
    try {
      const { readFileSync } = await import('node:fs')
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>
      if (raw.schemaVersion !== 1 || !Array.isArray(raw.concepts)) return null
      return raw as unknown as OntologyIndex
    } catch {
      return null // 不可用 → 调用方降级 INCONCLUSIVE，绝不 crash（v0.1 §62 验收）
    }
  }
}

const PROVIDER_FACTORIES: Record<string, (packsRoot: string) => OntologyProvider> = {
  fibo: (packsRoot) => new IndexFileProvider('fibo', `${packsRoot}/ontology/data/fibo-mini.json`),
  mock: () => new MockOntologyProvider(),
}

export function createProvider(config: OntologyConfig, builtinPacksRoot: string): OntologyProvider | null {
  if (config.provider === 'off') return null
  const factory = PROVIDER_FACTORIES[config.provider]
  return factory ? factory(builtinPacksRoot) : null
}
