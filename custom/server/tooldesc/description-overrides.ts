// overlay/tooldesc 域：per-model 工具描述覆盖族（minimax 61c4c31 系 4 提交吸收，矩阵 §1.3 四候选）。
//
// minimax 语义（per-model 工具描述覆盖）：同一工具对不同模型用不同描述文案——
// 弱指令跟随模型给更强结构化提示，强模型给精简描述省 token。
// - **覆盖合并**：base 描述 → per-model 覆盖（整段替换 per tool；无覆盖回落 base）；
// - **覆盖校验**：覆盖键必须在工具词表内（防拼写错悄悄失效）；
// - **token 账**：最终描述集长度汇总（决策是否值得覆盖——覆盖省了多少字）。
export interface ToolDescriptionSet {
  /** 工具名 → 基础描述。 */
  base: Record<string, string>
  /** 模型名 → 该模型的描述覆盖（只含被覆盖的工具）。 */
  perModel: Record<string, Record<string, string>>
}

/** 覆盖校验：覆盖键必须在 base 词表内；返回非法键清单。 */
export function validateOverrides(
  set: ToolDescriptionSet,
  model: string,
): { ok: boolean; unknownTools: string[] } {
  const overrides = set.perModel[model] ?? {}
  const unknownTools = Object.keys(overrides).filter((k) => !(k in set.base))
  return { ok: unknownTools.length === 0, unknownTools }
}

/** 最终描述集：base + per-model 覆盖（整段替换，未覆盖回落 base）。 */
export function resolveDescriptions(
  set: ToolDescriptionSet,
  model: string,
): Record<string, string> {
  const overrides = set.perModel[model] ?? {}
  const out: Record<string, string> = {}
  for (const [tool, base] of Object.entries(set.base)) {
    out[tool] = overrides[tool] ?? base
  }
  return out
}

/** token 账：覆盖前后字符量对比（负值=省字）。 */
export function overrideDeltaChars(set: ToolDescriptionSet, model: string): number {
  const overrides = set.perModel[model] ?? {}
  let delta = 0
  for (const [tool, text] of Object.entries(overrides)) {
    delta += text.length - (set.base[tool]?.length ?? 0)
  }
  return delta
}
