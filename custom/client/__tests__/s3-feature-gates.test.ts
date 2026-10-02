// overlay/custom/client/__tests__/s3-feature-gates.test.ts
// S3（补遗⑤ §13.4 B 档）守门：未用大块功能面默认关——开关正本、上游挂载点
// patch、bootstrap 路由族摘除三段链路各自就位。开关值断言走真实 import
// （vitest 无 VITE_CUSTOM_* 环境变量 → 默认关）；挂载点/路由族为源码级断言
// （与 standalone-embed-patches 同模式，脱离共享注入树）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { features } from '../features'

const OVERLAY_ROOT = resolve(__dirname, '../../..')

function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('S3 功能开关默认关（B 档：构建可再开，组件与 API 全保留）', () => {
  it('六个 S3 开关默认全关 + ekko 默认开（2026-10-02 用户裁定开门：评估体系启用，VITE_CUSTOM_EKKO=false 可关）', () => {
    expect(features.voice).toBe(false)
    expect(features.pet).toBe(false)
    expect(features.connectionsExtras).toBe(false)
    expect(features.imageAssist).toBe(false)
    expect(features.agentManager).toBe(false)
    expect(features.externalLinks).toBe(false)
    expect(features.ekko).toBe(true)
  })

  it('既有开关语义不变（matrixChat 等默认开、matrixAuth 默认关）', () => {
    expect(features.cockpit).toBe(true)
    expect(features.ide).toBe(true)
    expect(features.matrixChat).toBe(true)
    expect(features.matrixAuth).toBe(false)
  })
})

describe('S3 上游挂载点 patch 524 守门（997faa70 收敛删 522 后复活为 524）', () => {
  const patch = readOverlay('patches/524-client-s3-stage-gates.patch')

  it('series 已登记 524', () => {
    expect(readOverlay('patches/series')).toContain('524-client-s3-stage-gates.patch')
  })

  it('WebPet 归 patch 520（import.meta.env 直读 VITE_CUSTOM_PETS）', () => {
    const p520 = readOverlay('patches/520-client-webpet-off.patch')
    expect(p520).toContain('VITE_CUSTOM_PETS')
  })

  it('语音对话（RealtimeVoiceStage）与设置语音区（stt/tts tab）被 features.voice 套住', () => {
    expect(patch).toContain('v-if="showRealtimeVoice && features.voice"')
    expect(patch.match(/v-if="features\.voice" name="stt"/g)).toHaveLength(1)
    expect(patch.match(/v-if="features\.voice" name="tts"/g)).toHaveLength(1)
  })

  it('图像生成辅助（ModelsView auxiliary tab）被 features.imageAssist 套住', () => {
    expect(patch).toContain('v-if="features.imageAssist" name="auxiliary"')
  })

  it('connections 社媒 app + ESP32 mcu tab 被 features.connectionsExtras 套住', () => {
    expect(patch.match(/v-if="features\.connectionsExtras" name="app"/g)).toHaveLength(1)
    expect(patch.match(/v-if="features\.connectionsExtras" name="mcu"/g)).toHaveLength(1)
  })
})

// 997faa70 收敛撤销了 bootstrap 路由摘除（ekko/agentManager/外链）——外链与 ekko 改由 523 路由守卫承载

describe('S3 入口补齐 patch 523 守门（cockpit-s3 轮：语音入口/ekko 卡片/路由守卫第二层）', () => {
  const patch = readOverlay('patches/523-client-s3-entries-gates.patch')

  it('series 已登记 523', () => {
    expect(readOverlay('patches/series')).toContain('523-client-s3-entries-gates.patch')
  })

  it('语音入口两处随 features.voice 摘除（设置菜单项过滤+作曲麦克风——关时无死按钮）', () => {
    expect(patch).toContain("...(features.voice ? [{")
    expect(patch).toContain('<VoiceDialogueControls')
    expect(patch).toMatch(/\+\s*v-if="features\.voice"\s*\n\s+:status=/)
  })

  it('ekko 卡片（AgentManagerView）+路由守卫第二层在位', () => {
    expect(patch).toContain('v-if="features.ekko" class="agent-card coding-agent-card"')
    expect(patch).toContain('to.meta.ekkoConfig && !features.ekko')
  })

  it('外链分享页守卫并轨 externalLinks 键（与 bootstrap 摘除同一开关正本）', () => {
    expect(patch).toContain('!features.externalLinks')
    expect(patch).not.toContain('externalShare')
  })

  it('开关键集收敛：agentManager/externalLinks 默认关，ekko 默认开（2026-10-02 用户裁定开门）', () => {
    expect(features.agentManager).toBe(false)
    expect(features.externalLinks).toBe(false)
    expect(features.ekko).toBe(true)
  })
})
