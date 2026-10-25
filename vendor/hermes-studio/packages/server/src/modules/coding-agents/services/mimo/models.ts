// overlay[mimo-agent]: MiMo Code 模型发现适配器——opencode 家族 fork,
// `mimo models` 输出与 opencode 同构（provider/model 行），解析逻辑对齐
// services/opencode/models.ts。0.7.34 上游新增 models/index.ts 全运行时
// Record 强制注册（#3354），mimo 缺项即 server tsc TS2741。
import { lines, modelId, requireModelOutput } from '../models/text'
import type { ModelDiscoveryAdapter } from '../models/types'

export const mimoModels: ModelDiscoveryAdapter = {
  source: 'cli', scope: 'configured',
  async discover(context) {
    const { stdout } = await context.run(['models'])
    const models = lines(stdout).flatMap(line => {
      const id = modelId(line), separator = id?.indexOf('/') ?? -1
      return id && separator > 0 ? [{ id, name: id.slice(separator + 1), provider: id.slice(0, separator) }] : []
    })
    if (stdout.trim()) requireModelOutput(models, stdout)
    return { models }
  },
}
