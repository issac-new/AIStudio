/**
 * 合并治理分级+熔断（A3，2026-10-02 动态本体三部曲调研落地）。
 *
 * 摄取批次写入前先分级，防"逐批放大成本"与"本体震荡"：
 *   - auto：普通新增实体 + 已知谓词关系（performed 是本同步器原生产出的标准关系，
 *     视为已知——否则空图首次同步会全转人工，图谱永远建不起来）；
 *   - manual：结构性变更——引入图里尚不存在的**新关系谓词**，或单实体新增关系数超阈
 *     （>3，关系密集突变=疑似本体异常）；
 *   - breaker：单批新增实体 / 既有节点数 > 20%（env KG_MERGE_BREAKER_RATIO 可调）
 *     = 熔断，全批转人工并附原因。**口径：比值严格大于阈值才熔断，恰好等于 0.20
 *     不熔断**（与"超过现有 20%"的文章原意一致，边界归 auto）。
 *
 * 如实边界（冷启动豁免）：既有节点数为 0（空图/文件缺席）时不评估熔断——没有
 * 本体可被冲垮；这同时也是既有集成测试（首次同步即摄取）保持绿的语义前提。
 *
 * 纯函数：env 读取在调用侧（board-graph 接线处），便于守门测试直接驱动边界。
 */
export interface GovEntity {
  id: string
  type: string
  props: Record<string, unknown>
}

export interface GovRelation {
  src: string
  dst: string
  type: string
}

export interface ClassifyOptions {
  /** 熔断比值阈（严格大于才熔断）；默认 0.20，env KG_MERGE_BREAKER_RATIO 覆盖。 */
  breakerRatio?: number
  /** 单实体新增关系数超过该值转 manual（默认 3）。 */
  maxRelPerEntity?: number
  /** 摄取原生视为已知的谓词（默认 ['performed']）。 */
  autoPredicates?: string[]
}

export interface ClassifyResult {
  auto: { entities: GovEntity[]; relations: GovRelation[] }
  manual: { entities: GovEntity[]; relations: GovRelation[] }
  breaker: boolean
  reason?: string
}

export const DEFAULT_BREAKER_RATIO = 0.20
export const DEFAULT_MAX_REL_PER_ENTITY = 3

/**
 * 批次分级。manual 实体的判定：参与新谓词关系，或本批新增关系数（作为 src 或 dst
 * 均计入）超过 maxRelPerEntity。manual 实体牵连其关系一并转 manual（不写悬空边）；
 * 批次之外的实体（调用侧已存在的 id 等）不在判定面内。熔断时全批（实体+关系）转
 * manual。
 */
export function classifyBatch(input: {
  newEntities: GovEntity[]
  newRelations: GovRelation[]
  existingNodeCount: number
  existingRelationTypes: ReadonlySet<string> | readonly string[]
  opts?: ClassifyOptions
}): ClassifyResult {
  const { newEntities, newRelations, existingNodeCount } = input
  const known = input.existingRelationTypes instanceof Set
    ? (input.existingRelationTypes as Set<string>)
    : new Set(input.existingRelationTypes)
  const breakerRatio = input.opts?.breakerRatio ?? DEFAULT_BREAKER_RATIO
  const maxRel = input.opts?.maxRelPerEntity ?? DEFAULT_MAX_REL_PER_ENTITY
  const autoPredicates = new Set(input.opts?.autoPredicates ?? ['performed'])

  // 熔断：仅空图冷启动豁免（existingNodeCount=0 不评估，见文件头注释）
  let breaker = false
  let reason: string | undefined
  if (existingNodeCount > 0 && newEntities.length / existingNodeCount > breakerRatio) {
    breaker = true
    reason = `单批新增 ${newEntities.length} / 既有 ${existingNodeCount} 超过熔断比值 ${breakerRatio}`
  }

  // 谓词已知性：existingRelationTypes ∪ 摄取原生谓词
  const isKnownPredicate = (t: string) => known.has(t) || autoPredicates.has(t)
  const newPredicateRels = new Set<GovRelation>()
  for (const r of newRelations) {
    if (!isKnownPredicate(r.type)) newPredicateRels.add(r)
  }

  // 单实体新增关系计数（src/dst 均算）
  const relCount = new Map<string, number>()
  for (const r of newRelations) {
    relCount.set(r.src, (relCount.get(r.src) ?? 0) + 1)
    relCount.set(r.dst, (relCount.get(r.dst) ?? 0) + 1)
  }
  // 新谓词关系的端点实体集合
  const touchesNewPredicate = new Set<string>()
  for (const r of newPredicateRels) {
    touchesNewPredicate.add(r.src)
    touchesNewPredicate.add(r.dst)
  }

  const autoEntities: GovEntity[] = []
  const manualEntities: GovEntity[] = []
  const manualIds = new Set<string>()
  for (const e of newEntities) {
    if (breaker || touchesNewPredicate.has(e.id) || (relCount.get(e.id) ?? 0) > maxRel) {
      manualEntities.push(e)
      manualIds.add(e.id)
    } else {
      autoEntities.push(e)
    }
  }

  const autoRelations: GovRelation[] = []
  const manualRelations: GovRelation[] = []
  for (const r of newRelations) {
    // 熔断全转 manual；否则：新谓词=结构变更；端点实体被扣=牵连扣（不写悬空边）
    if (breaker || newPredicateRels.has(r) || manualIds.has(r.src) || manualIds.has(r.dst)) {
      manualRelations.push(r)
    } else {
      autoRelations.push(r)
    }
  }

  return { auto: { entities: autoEntities, relations: autoRelations }, manual: { entities: manualEntities, relations: manualRelations }, breaker, reason }
}

/** 读 env 熔断比值（守门：非法值回落默认，不抛）。 */
export function breakerRatioFromEnv(): number {
  const raw = Number(process.env.KG_MERGE_BREAKER_RATIO)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_BREAKER_RATIO
}
