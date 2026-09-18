// overlay/custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
// 交付协议守门：事件类型常量 + content schema 解析（容错返回 null）+ 幂等投影 + HumanGate 校验。
import { describe, it, expect } from 'vitest'
import {
  DELIVERY_SCHEMA_VERSION, DELIVERY_EVENT_TYPES, DELIVERY_INDEX_ACCOUNT_DATA_TYPE,
  CASE_ROOM_POWER_LEVELS, isDeliveryEventType,
  DELIVERY_STAGES, DELIVERY_GATES, HUMAN_GATES,
  parseCaseContent, parseIndexContent,
} from '../delivery-protocol'

describe('事件类型常量与 PL 矩阵', () => {
  it('三事件 + index account data 类型符合 spec §5', () => {
    expect(DELIVERY_EVENT_TYPES.case).toBe('com.swarmstudio.delivery.case')
    expect(DELIVERY_EVENT_TYPES.stage).toBe('com.swarmstudio.delivery.stage')
    expect(DELIVERY_EVENT_TYPES.gate).toBe('com.swarmstudio.delivery.gate')
    expect(DELIVERY_INDEX_ACCOUNT_DATA_TYPE).toBe('com.swarmstudio.delivery.index')
    expect(DELIVERY_SCHEMA_VERSION).toBe(1)
  })
  it('PL：case=50（state），stage/gate=0（普通消息）', () => {
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.case]).toBe(50)
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.stage]).toBe(0)
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.gate]).toBe(0)
    expect(CASE_ROOM_POWER_LEVELS.state_default).toBe(50)
    expect(CASE_ROOM_POWER_LEVELS.events_default).toBe(0)
  })
  it('阶段/门禁枚举：P1-P6、G1-G6、人工门=G1/G5', () => {
    expect([...DELIVERY_STAGES]).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
    expect([...DELIVERY_GATES]).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
    expect([...HUMAN_GATES]).toEqual(['G1', 'G5'])
  })
  it('isDeliveryEventType 按前缀识别，team.* 不误判', () => {
    expect(isDeliveryEventType('com.swarmstudio.delivery.case')).toBe(true)
    expect(isDeliveryEventType('com.swarmstudio.team.duty')).toBe(false)
    expect(isDeliveryEventType('m.room.message')).toBe(false)
  })
})

describe('parseCaseContent', () => {
  const ok = {
    schemaVersion: 1, caseId: 'c-001', title: 'stringops v0.2', repoUrl: 'git@example:ops.git',
    tier: 'standard', stage: 'P3', ownerAccount: '@alice:matrix.test',
    frozenAcceptance: 'AC1: pytest 全绿', createdAt: 1, updatedAt: 2, updatedBy: '@alice:matrix.test',
  }
  it('合法 content 原样解析（含可选 frozenAcceptance）', () => {
    expect(parseCaseContent(ok)).toEqual(ok)
  })
  it('可选字段缺省容忍', () => {
    const { frozenAcceptance, ...rest } = ok
    expect(parseCaseContent(rest)).toEqual({ ...rest, frozenAcceptance: undefined })
  })
  it('schemaVersion 缺失或非 1 → null（未知版本降级只读）', () => {
    const { schemaVersion, ...rest } = ok
    expect(parseCaseContent(rest)).toBeNull()
    expect(parseCaseContent({ ...ok, schemaVersion: 2 })).toBeNull()
    expect(parseCaseContent({ ...ok, schemaVersion: '1' })).toBeNull()
  })
  it('tier / stage 非枚举值 → null', () => {
    expect(parseCaseContent({ ...ok, tier: 'heavy' })).toBeNull()
    expect(parseCaseContent({ ...ok, stage: 'P7' })).toBeNull()
  })
  it('必填字段缺失或类型错 → null', () => {
    expect(parseCaseContent(null)).toBeNull()
    expect(parseCaseContent('str')).toBeNull()
    expect(parseCaseContent({ ...ok, ownerAccount: 5 })).toBeNull()
    expect(parseCaseContent({ ...ok, updatedAt: 't' })).toBeNull()
  })
  it('超限幅（title>200 / frozenAcceptance>4000）→ null', () => {
    expect(parseCaseContent({ ...ok, title: 'x'.repeat(201) })).toBeNull()
    expect(parseCaseContent({ ...ok, frozenAcceptance: 'x'.repeat(4001) })).toBeNull()
  })
})

describe('parseIndexContent', () => {
  const ok = { schemaVersion: 1, roomIds: ['!r1:x', '!r2:x'], updatedBy: '@alice:matrix.test', updatedAt: 3 }
  it('合法解析；roomIds 混入非字符串 → null', () => {
    expect(parseIndexContent(ok)).toEqual(ok)
    expect(parseIndexContent({ ...ok, roomIds: ['!r1:x', 1] })).toBeNull()
  })
  it('roomIds 超 50 → null', () => {
    expect(parseIndexContent({ ...ok, roomIds: Array.from({ length: 51 }, (_, i) => `!r${i}:x`) })).toBeNull()
  })
  it('schemaVersion/updatedBy 缺失 → null', () => {
    const { schemaVersion, ...rest } = ok
    expect(parseIndexContent(rest)).toBeNull()
    expect(parseIndexContent({ ...ok, updatedBy: undefined })).toBeNull()
  })
})
