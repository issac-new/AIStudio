import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// SIM config schema 对齐守门（2026-11-07 specs/2026-11-07-sim-config-schema-align.md）。
// 三生成器仍产 legacy custom_providers，宿主 v0.23.0 已迁 providers map＋_config_version。
// 4d 步用产品自身 migrate_config 幂等盖章——本测试锁源契约（CI 无宿主 ~/.hermes 依赖，
// 活体行为由 2026-11-07 存量 42 份迁移实证背书）：缺 4d 即下次 mx-setup 把已对齐的
// root+profiles config 再生回旧 schema（本轮根治点）。
const HARNESS = resolve(__dirname, '..')
const SETUP = join(HARNESS, 'mux', 'mx-setup.sh')

const setup = readFileSync(SETUP, 'utf8')

// 提取 4d 段：从段标记到第 5 段标记之间（防把 4c/5 段内容误当 4d 断言通过）。
const start = setup.indexOf('# ── 4d. config schema 对齐')
const end = setup.indexOf('# ── 5.', start)
const block = start >= 0 && end > start ? setup.slice(start, end) : ''

describe('mx-setup 4d config schema 对齐（v52 盖牌）', () => {
  it('4d 段存在且位于 4c 之后、第 5 段（kanban）之前', () => {
    expect(start).toBeGreaterThan(0)
    expect(setup.indexOf('# ── 4c.')).toBeLessThan(start)
    expect(end).toBeGreaterThan(start)
  })

  it('覆盖根 config 与全部 profile config（生成器三面全收）', () => {
    expect(block).toContain('"$HERMES_ROOT/config.yaml"')
    expect(block).toContain('"$HERMES_ROOT"/profiles/*/config.yaml')
  })

  it('逐份以该 config 所在目录为 HERMES_HOME 调用产品 migrate_config', () => {
    expect(block).toContain('HERMES_HOME="$(dirname "$_cfg")"')
    expect(block).toContain('from hermes_cli.config import migrate_config')
    expect(block).toContain('migrate_config(interactive=False, quiet=True)')
    // 代码路径取 AGENT_SRC 快照：与网关实际执行码同源（mx-lib AGENT_SRC）
    expect(block).toContain('MX_AGENT_SRC="$AGENT_SRC"')
  })

  it('语义护栏：变更键 ⊆ 三键白名单且版本戳落地，违例回滚该份', () => {
    const allowed = block.match(/allowed = \(([^)]+)\)/)?.[1] ?? ''
    for (const key of ['_config_version', 'providers', 'custom_providers']) {
      expect(allowed).toContain(key)
    }
    expect(block).toContain("after.get('_config_version') is None")
    expect(block).toContain('.schema-align.bak')
    expect(block).toContain('shutil.copy2(cfg_path + \'.schema-align.bak\', cfg_path)')
  })

  it('解释器走 _mx_yaml_py（宿主 venv 首选），缺位 fail-soft 跳过不阻断 setup', () => {
    expect(block).toContain('_mx_yaml_py')
    expect(block).toContain('_schema_skip=$((_schema_skip+1))')
    expect(block).not.toMatch(/\bfail\b\s+"config schema/) // 告警不 fail
    expect(block).toContain('log "config schema 对齐跳过')
  })
})
