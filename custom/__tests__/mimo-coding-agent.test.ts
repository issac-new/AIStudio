// overlay/custom/__tests__/mimo-coding-agent.test.ts
// MiMo-Code 接入（patch 393/394）守门：登记顺序、家族单一事实源、
// CLI 参数门控（mimo 无 --auto）、客户端联合与映射。依据 2026-09-24
// MiMo 补充调研 P1（docs/superpowers/specs/2026-09-24-mimo-code-coding-tools-research.md）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(OVERLAY_ROOT, rel), 'utf-8')
const series = read('patches/series')
const patch393 = read('patches/393-server-mimo-coding-agent.patch')
const patch394 = read('patches/394-client-mimo-agent-ui.patch')

describe('MiMo-Code 编码 Agent 接入（patch 393/394）', () => {
  it('series 尾部依序登记 393/394（原 381/382，撞号重编）', () => {
    const idx392 = series.indexOf('392-studio-matrix-login-scoped-grant.patch')
    const idx393 = series.indexOf('393-server-mimo-coding-agent.patch')
    const idx394 = series.indexOf('394-client-mimo-agent-ui.patch')
    expect(idx392).toBeGreaterThan(-1)
    expect(idx393).toBeGreaterThan(idx392)
    expect(idx394).toBeGreaterThan(idx393)
  })

  it('393 建立家族单一事实源 opencode-family.ts（品牌文件/环境变量/schema）', () => {
    expect(patch393).toContain('diff --git a/packages/server/src/modules/coding-agents/services/opencode-family.ts b/packages/server/src/modules/coding-agents/services/opencode-family.ts')
    for (const token of [
      "configFileName: 'mimocode.json'",
      "databaseFile: 'mimocode.db'",
      "configDirEnv: 'MIMOCODE_CONFIG_DIR'",
      "databaseEnv: 'MIMOCODE_DB'",
      "runtimeConfigEnv: 'MIMOCODE_CONFIG_CONTENT'",
      "apiKeyEnv: 'HERMES_MIMO_API_KEY'",
      "schemaUrl: 'https://mimo.xiaomi.com/mimocode/config.json'",
      "runSupportsAutoFlag: false",
      'export function isOpenCodeFamily',
    ]) {
      expect(patch393).toContain(token)
    }
  })

  it('381 定义条目 + 配置文件映射（~/.config/mimocode/）', () => {
    expect(patch393).toContain("id: 'mimo',")
    expect(patch393).toContain("command: 'mimo',")
    expect(patch393).toContain("packageName: '@mimo-ai/cli',")
    expect(patch393).toContain("'~/.config/mimocode/AGENTS.md'")
  })

  it('381 不为 mimo 无条件传 --auto（fork 已移除该旗标）', () => {
    expect(patch393).toContain('...(familyVars.runSupportsAutoFlag ? [\'--auto\'] : [])')
    // 反向锚：旧的固定参数行必须已被替换
    expect(patch393).not.toMatch(/\+\s*'--auto',\n/)
  })

  it('381 扩持久化/用量/webhook 联合类型', () => {
    expect(patch393).toContain("'opencode' | 'mimo' | 'dsh'")
    expect(patch393).toContain("webhookAgent?: 'bridge' | 'ekko' | 'claude-code' | 'codex' | 'pi' | 'grok' | 'opencode' | 'mimo' | 'dsh'")
  })

  it('382 客户端联合 + 新建会话选项 + 头像资源', () => {
    expect(patch394).toContain("export type CodingAgentId = 'claude-code' | 'codex' | 'pi' | 'grok' | 'opencode' | 'mimo' | 'dsh' | 'zcode'")
    expect(patch394).toContain('{ label: "MiMo Code", value: "mimo" }')
    expect(patch394).toContain('mimo: { label: \'MiMo Code\', src: \'/coding-agents/mimo.svg\' }')
    expect(patch394).toContain('diff --git a/packages/client/public/coding-agents/mimo.svg b/packages/client/public/coding-agents/mimo.svg')
  })

  it('overlay ide.ts 将 mimo 映射进 IDE 工作台 agent 选择（P1 落点）', () => {
    const ideStore = read('custom/client/ide/store/ide.ts')
    expect(ideStore).toContain("case 'mimo':\n      return 'mimo'")
  })
})
