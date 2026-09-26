// 引擎独立模型配置守门（结构校验/隔离断言/目录投影）。
import { describe, it, expect } from 'vitest'
import { validateEngineModelConfig, assertIsolated, engineModelGroups, type EngineModelConfig } from '../engine-model-config'

const cfg = (over: Partial<EngineModelConfig> = {}): EngineModelConfig => ({
  providers: [
    { providerId: 'bigmodel', baseURL: 'https://api.example.com/v1', apiKeyEnv: 'BIGMODEL_KEY', models: [{ modelId: 'glm-5.3', reasoningLevels: ['low', 'high'] }] },
    { providerId: 'local', baseURL: 'http://localhost:8080/v1', models: [{ modelId: 'qwen3-coder' }] },
  ],
  defaultModel: { providerId: 'bigmodel', modelId: 'glm-5.3' },
  ...over,
})

describe('validateEngineModelConfig', () => {
  it('合法通过', () => {
    expect(validateEngineModelConfig(cfg())).toEqual({ ok: true, problems: [] })
  })
  it('重复 provider/model、坏 baseURL、默认模型不可达全列出', () => {
    const bad = cfg({
      providers: [
        { providerId: 'a', baseURL: 'ftp://x', models: [{ modelId: 'm' }, { modelId: 'm' }] },
        { providerId: 'a', baseURL: 'https://y', models: [] },
      ],
      defaultModel: { providerId: 'ghost', modelId: 'm' },
    })
    const v = validateEngineModelConfig(bad)
    expect(v.ok).toBe(false)
    expect(v.problems.some((p) => p.includes('duplicate providerId'))).toBe(true)
    expect(v.problems.some((p) => p.includes('duplicate modelId'))).toBe(true)
    expect(v.problems.some((p) => p.includes('bad baseURL'))).toBe(true)
    expect(v.problems.some((p) => p.includes('provider 不存在'))).toBe(true)
  })
})

describe('隔离断言+目录投影', () => {
  it('引擎存储与 hermes 配置源零交集', () => {
    expect(assertIsolated('runtime/ide-engine-models.json', ['runtime/config.yaml', 'runtime/hermes-web-ui.db'])).toBe(true)
    expect(assertIsolated('runtime/config.yaml', ['runtime/config.yaml'])).toBe(false)
  })
  it('投影对齐 modelGroups 消费形态（含推理档）', () => {
    const groups = engineModelGroups(cfg())
    expect(groups).toEqual([
      { provider: 'bigmodel', models: [{ id: 'glm-5.3', reasoningLevels: ['low', 'high'] }] },
      { provider: 'local', models: [{ id: 'qwen3-coder' }] },
    ])
  })
})
