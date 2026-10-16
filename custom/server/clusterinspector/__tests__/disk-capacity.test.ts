/**
 * disk.capacity 检测器单测（C4 增件·Q3 双通道之主动面，2026-10-16）：
 * 阈值默认 90、≥95 升 critical、未接线=合法空态、opts 阈值可调。
 */
import { describe, expect, it } from 'vitest'
import { detectDiskCapacity } from '../detectors'

const snap = (usage?: Array<{ mount: string; usedPct: number }>) =>
  ({ diskUsage: usage } as Parameters<typeof detectDiskCapacity>[0])

describe('detectDiskCapacity — 磁盘水位（run20 96% 事故根治面）', () => {
  it('越阈值即报 high；≥95 升 critical；多卷各自成行', () => {
    const anomalies = detectDiskCapacity(snap([
      { mount: '/', usedPct: 96 },
      { mount: '/Volumes/nvme2230', usedPct: 91 },
      { mount: '/Volumes/ok', usedPct: 50 },
    ]))
    expect(anomalies).toHaveLength(2)
    expect(anomalies[0]).toMatchObject({ detector: 'disk.capacity', subject: 'disk:/', severity: 'high' })
    expect(anomalies[0].summary).toContain('96%')
    expect(anomalies[0].summary).toContain('≥95 加急')
    expect(anomalies[1]).toMatchObject({ subject: 'disk:/Volumes/nvme2230', severity: 'high' })
  })
  it('阈值可调（opts.diskCapacityPct）；默认 90 边界值含本身', () => {
    expect(detectDiskCapacity(snap([{ mount: '/a', usedPct: 90 }]))).toHaveLength(1)
    expect(detectDiskCapacity(snap([{ mount: '/a', usedPct: 89 }]))).toHaveLength(0)
    expect(detectDiskCapacity(snap([{ mount: '/a', usedPct: 80 }]), { diskCapacityPct: 75 })).toHaveLength(1)
  })
  it('未接线/空数组=合法空态静默（同 spawnHealth 语义）', () => {
    expect(detectDiskCapacity(snap(undefined))).toEqual([])
    expect(detectDiskCapacity(snap([]))).toEqual([])
  })
})
