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
  it('七个 S3 开关默认全关（VITE_CUSTOM_*=true 显式再开）', () => {
    expect(features.voice).toBe(false)
    expect(features.pet).toBe(false)
    expect(features.connectionsExtras).toBe(false)
    expect(features.imageAssist).toBe(false)
    expect(features.ekko).toBe(false)
    expect(features.agentManager).toBe(false)
    expect(features.externalLinks).toBe(false)
  })

  it('既有开关语义不变（matrixChat 等默认开、matrixAuth 默认关）', () => {
    expect(features.cockpit).toBe(true)
    expect(features.ide).toBe(true)
    expect(features.matrixChat).toBe(true)
    expect(features.matrixAuth).toBe(false)
  })
})

describe('S3 上游挂载点 patch 514 守门', () => {
  const patch = readOverlay('patches/514-client-s3-feature-gates.patch')

  it('series 已登记 514', () => {
    expect(readOverlay('patches/series')).toContain('514-client-s3-feature-gates.patch')
  })

  it('WebPet 浮层挂点（App.vue showWebPet）被 features.pet 套住', () => {
    expect(patch).toContain('features.pet &&')
    expect(patch).toMatch(/import \{ features \} from ["']@\/custom\/features["'];/)
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

describe('S3 路由族 bootstrap 摘除守门（ekko 四页 / studio agents / 外链页 / 桌宠路由）', () => {
  const src = readOverlay('registries/client/bootstrap.ts')

  it('ekko 四页随 features.ekko 摘除', () => {
    expect(src).toContain("for (const name of ['ekko.memory', 'ekko.skills', 'ekko.mcp', 'ekko.settings'])")
    expect(src).toMatch(/if \(!features\.ekko\)/)
  })

  it('/studio/agents 配置中心随 features.agentManager 摘除', () => {
    expect(src).toContain("router.removeRoute?.('hermes.agentManager')")
    expect(src).toContain("router.removeRoute?.('codingAgent.config')")
  })

  it('三个外链页随 features.externalLinks 摘除', () => {
    for (const n of ['share.groupChat', 'groupChat.link', 'desktop.chat']) {
      expect(src).toContain(`router.removeRoute?.('${n}')`)
    }
  })

  it('desktop.pet 路由随 features.pet 摘除', () => {
    expect(src).toContain("router.removeRoute?.('desktop.pet')")
  })
})
