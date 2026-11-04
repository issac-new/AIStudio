// overlay/projectworkflow: 运行时配置 PUT section 白名单守门（spec 2026-11-04
// agentteams-project-workflow.md D6，对标 AgentTeams l2RuntimeConfigWhitelist fail-closed）。
// 三层断言：
//   ① 硬编码预期清单（每项带调用方锚点）vs 导出数组——新增合法 section 必须两处同步；
//   ② 机械抽取 vendor settings store 两个 switch（updateLocal/saveSection）的全部
//      case 分支，逐一必须在白名单内——上游升级新增 section 时此处红，倒逼登记；
//   ③ fail-closed 语义：未知/恶意 section 一律 false。
// 另含 patches/733 文本标记断言（见文件尾说明）。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ALLOWED_CONFIG_SECTIONS, isAllowedConfigSection } from '../config-whitelist'

const overlayRoot = resolve(__dirname, '..', '..', '..', '..')
const settingsStorePath = join(
  overlayRoot, 'vendor', 'hermes-studio', 'packages', 'client', 'src', 'stores', 'hermes', 'settings.ts',
)
const patch733Path = join(overlayRoot, 'patches', '733-server-config-section-whitelist.patch')

// 硬编码预期清单＝清点终版（锚点详注见 config-whitelist.ts 各行）。
// 来源四路：settings store switch、server 特例分支（proxy/gatewayAutoStart）、
// vendor switch 外调用面（tts/stt 语音卡片、server :534 model）、overlay custom 面（hooks）。
const EXPECTED_SECTIONS = [
  // settings.ts:108-135 / :145-174 两 switch 全部 case
  'display', 'agent', 'memory', 'skills', 'compression', 'session_reset',
  'privacy', 'approvals', 'gatewayAutoStart', 'proxy',
  'telegram', 'discord', 'slack', 'whatsapp', 'matrix',
  'wecom', 'feishu', 'dingtalk', 'qqbot', 'weixin',
  'platforms',            // settings.ts:128/:165 整段合并分支（当前无字面调用方，宁多勿漏）
  'wechat',               // settings.ts:160 上游别名 case（section 原样透传服务端）
  // server controllers/config.ts:534 引用 + custom/client/ia2/views/agents/AgentsView.vue:58
  'model',
  // vendor HermesVoiceConfigSummary.vue:101（kind∈types/voice-api.ts:4 'tts'|'stt'）
  'tts', 'stt',
  // custom/client/ide/api/hooks.ts:51（B3 写档面）
  'hooks',
]

describe('ALLOWED_CONFIG_SECTIONS — PUT section 白名单（清点对账）', () => {
  it('硬编码预期清单全量在册（arrayContaining 双向对账）', () => {
    expect(ALLOWED_CONFIG_SECTIONS).toEqual(expect.arrayContaining(EXPECTED_SECTIONS))
    // 双向：导出数组不得有预期清单之外的“来历不明”条目——防白名单被顺手放宽
    expect([...ALLOWED_CONFIG_SECTIONS].sort()).toEqual([...EXPECTED_SECTIONS].sort())
  })

  it('无重复条目（重复=清点口径混乱）', () => {
    expect(new Set(ALLOWED_CONFIG_SECTIONS).size).toBe(ALLOWED_CONFIG_SECTIONS.length)
  })

  it('overlay 两个直接调用面 hooks/model 在册（custom/client 清点锚点）', () => {
    expect(isAllowedConfigSection('hooks')).toBe(true)   // custom/client/ide/api/hooks.ts:51
    expect(isAllowedConfigSection('model')).toBe(true)   // custom/client/ia2/views/agents/AgentsView.vue:58
  })

  it('vendor settings store switch 全部 case 机械抽取逐一在册（升级防漏）', () => {
    const text = readFileSync(settingsStorePath, 'utf8')
    const cases = [...text.matchAll(/case '([a-zA-Z_]+)'/g)].map((m) => m[1])
    const unique = [...new Set(cases)]
    expect(unique.length, 'settings.ts 两个 switch 的 case 面（抽取为空=文件位移，须核对路径）').toBeGreaterThan(0)
    const missing = unique.filter((s) => !isAllowedConfigSection(s))
    expect(missing, `settings store 新增 section 未登记白名单：${missing.join(', ')}（先改 config-whitelist.ts 再升级）`).toEqual([])
  })
})

describe('isAllowedConfigSection — fail-closed 语义', () => {
  it('白名单内全量放行', () => {
    for (const s of ALLOWED_CONFIG_SECTIONS) expect(isAllowedConfigSection(s)).toBe(true)
  })

  it('未知 section 一律拒绝', () => {
    for (const s of ['auxiliary', 'delegation', 'providers', '', 'foo', 'Hooks', 'MODEL']) {
      expect(isAllowedConfigSection(s), `section=${JSON.stringify(s)} 应拒绝`).toBe(false)
    }
  })

  it('原型链/路径穿越形态拒绝（fail-closed 不吃大小写与属性名特判）', () => {
    for (const s of ['__proto__', 'constructor', 'toString', 'value', 'hasOwnProperty', '../custom', 'a/b']) {
      expect(isAllowedConfigSection(s)).toBe(false)
    }
  })
})

describe('patches/733 接线标记断言', () => {
  // 本组是“标记断言”：只证明补丁文件仍携带接线痕迹，防补丁被静默洗掉/漂移；
  // 白名单真正生效的真值在补丁的 import 行——它把 vendor updateConfig 接到本模块
  // （单一事实源）。补丁语义级验证（正/反向 apply）属注入链自验，不在此重复。
  const patchText = readFileSync(patch733Path, 'utf8')

  it('补丁含 isAllowedConfigSection 调用与 custom 相对 import 行', () => {
    expect(patchText).toContain('isAllowedConfigSection(section)')
    expect(patchText).toContain("from '../../../custom/projectworkflow/config-whitelist'")
  })

  it('补丁含 400 拒绝返回（controller 既有错误风格）', () => {
    expect(patchText).toContain("ctx.status = 400; ctx.body = { error: 'Unsupported config section' }")
  })
})
