import { describe, it, expect } from 'vitest'
import { deriveRunResult } from '../run-result'

describe('Run Result 四维（handbook 吸收）', () => {
  it('四维各自独立：执行成功不等于证据完整、也不等于质量通过', () => {
    const result = deriveRunResult({
      execution: { outcome: 'success', recordId: 'run-1' },
      simulation: { validity: 'valid', source: 'simcenter', evidenceRefs: ['sim:1'] },
      evidence: { completeness: 'partial', missing: ['frame:5'], source: 'evidence-store' },
      quality: { verdict: 'gap', source: 'eval' },
    })
    expect(result.execution).toMatchObject({ status: 'completed', source: 'execution-records' })
    expect(result.simulation.status).toBe('valid')
    expect(result.evidence.status).toBe('partial')
    expect(result.evidence.limitations[0]).toContain('frame:5')
    expect(result.quality.status).toBe('gap')
  })

  it('缺席标 unknown 并写明缺什么，不把未知当成功', () => {
    const result = deriveRunResult({})
    expect(result.execution).toMatchObject({ status: 'unknown', source: 'none' })
    expect(result.simulation.status).toBe('unknown')
    expect(result.simulation.limitations.join('')).toContain('未提供')
    expect(result.evidence.status).toBe('unknown')
    expect(result.quality.status).toBe('unknown')
  })

  it('执行事实映射：success/failed/timeout/blocked/exitCode', () => {
    expect(deriveRunResult({ execution: { outcome: 'success' } }).execution.status).toBe('completed')
    expect(deriveRunResult({ execution: { outcome: 'failed' } }).execution.status).toBe('failed')
    expect(deriveRunResult({ execution: { outcome: 'timeout' } }).execution.status).toBe('cancelled')
    expect(deriveRunResult({ execution: { outcome: 'blocked' } }).execution.status).toBe('failed')
    expect(deriveRunResult({ execution: { exitCode: 0 } }).execution.status).toBe('completed')
    expect(deriveRunResult({ execution: { exitCode: 2 } }).execution.status).toBe('failed')
  })

  it('质量判词别名归一：passed/failed/no_data/未知', () => {
    expect(deriveRunResult({ quality: { verdict: 'passed' } }).quality.status).toBe('pass')
    expect(deriveRunResult({ quality: { verdict: 'failed' } }).quality.status).toBe('fail')
    expect(deriveRunResult({ quality: { verdict: 'no_data' } }).quality.status).toBe('gap')
    expect(deriveRunResult({ quality: { verdict: 'weird' } }).quality.status).toBe('unknown')
  })

  it('证据完整性：给出 completeness 优先；只给 missing 时按有无缺失推导', () => {
    expect(deriveRunResult({ evidence: { completeness: 'complete', missing: ['x'] } }).evidence.status).toBe('complete')
    expect(deriveRunResult({ evidence: { missing: [] } }).evidence.status).toBe('complete')
    expect(deriveRunResult({ evidence: { missing: ['trace'] } }).evidence.status).toBe('partial')
  })
})
