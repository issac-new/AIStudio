// overlay/configlayers 域：配置层叠加+来源追踪（codex §二轮 C 表 P2 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（config 8 层叠加 + per-key origins + /debug-config）：配置从多层叠加
// （低→高覆盖），调试时**每个 key 来自哪层**一目了然（origin 表）。Ycode 形状：
// 8 层（defaults < built-in < system < global < project < local < env < cli flag），
// 高层覆盖低层；per-key origin 表随叠加产出（/debug-config 语义的数据面）。
export const CONFIG_LAYERS = ['defaults', 'built-in', 'system', 'global', 'project', 'local', 'env', 'cli-flag'] as const
export type ConfigLayer = (typeof CONFIG_LAYERS)[number]

export interface LayeredConfig {
  /** 叠加后有效值。 */
  values: Record<string, unknown>
  /** per-key 来源（codex per-key origins：该 key 最终来自哪层）。 */
  origins: Record<string, ConfigLayer>
}

/** 8 层叠加（数组序=低→高覆盖；per-key origin 记最后赋值层）。 */
export function overlayConfig(layers: Partial<Record<ConfigLayer, Record<string, unknown>>>): LayeredConfig {
  const values: Record<string, unknown> = {}
  const origins: Record<string, ConfigLayer> = {}
  for (const layer of CONFIG_LAYERS) {
    const src = layers[layer]
    if (!src) continue
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined) continue
      values[k] = v
      origins[k] = layer
    }
  }
  return { values, origins }
}

/** /debug-config 视图（key→值+来源行；codex 调试语义）。 */
export function debugConfigView(cfg: LayeredConfig): Array<{ key: string; value: unknown; origin: ConfigLayer }> {
  return Object.keys(cfg.values).sort().map((key) => ({
    key,
    value: cfg.values[key],
    origin: cfg.origins[key],
  }))
}
