// 守门:离线包打包器纯函数——脱敏扫描(fail-closed)/agent 树排除规则/模板派生/env 键解析。
// spec: docs/superpowers/specs/2026-11-02-offline-windows-package.md（D7/D13）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { scanSecrets, isDummySecret, allowlistReason, agentTreeExclude, zcodeTreeExclude, deriveConfigExample, parseEnvKeys, THIRD_PARTY_SRC, pluginLatestFilter } from '../make-offline-package.mjs'

const overlayRoot = process.cwd()

describe('scanSecrets 脱敏扫描(fail-closed 判定)', () => {
  it('七类凭据形态必命中', () => {
    const names = (t: string) => scanSecrets(t).map((h) => h.pattern)
    expect(names('export K="AKIAIOSFODNN7EXAMPLE"')).toContain('aws-access-key')
    expect(names('token: sk-proj-abcdefghijklmnopqrstuvwx')).toContain('openai-style-key')
    expect(names('ghp_' + 'a'.repeat(36))).toContain('github-pat')
    expect(names('xoxb-123456789012-AbCdEfGhIjKl')).toContain('slack-token')
    expect(names('glpat-' + 'x'.repeat(24))).toContain('gitlab-pat')
    expect(names('-----BEGIN RSA PRIVATE KEY-----')).toContain('private-key-block')
    expect(names('jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N')).toContain('jwt')
  })
  it('正常源码/模板放行(零误报线)', () => {
    expect(scanSecrets('Bearer token 从环境变量读取(code 内合法字面量)')).toEqual([])
    expect(scanSecrets('import os\nPATH = "/usr/local/bin"\nkey_name = "sk-short"')).toEqual([])
    expect(scanSecrets(readFileSync(resolve(overlayRoot, 'scripts/offline-template/env/dot-env.example'), 'utf8'))).toEqual([])
  })
  it('明显假值判定: 上游 fixture 形态降级, 随机形态保持 fatal(2026-11-02 实测采样校准)', () => {
    // 降级(实测采样自 agent 树 tests/ 与 website/)
    expect(isDummySecret('sk-abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(isDummySecret('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).toBe(true)
    expect(isDummySecret('sk-abc123def456ghi789jkl012345')).toBe(true)
    expect(isDummySecret('xoxb-workspace-token-here')).toBe(true)
    expect(isDummySecret('sk-ant-api-PROCESS-LEVEL-SHOULD-NOT-LEAK')).toBe(true)
    expect(isDummySecret('AKIAIOSFODNN7EXAMPLE')).toBe(true)
    // fatal(随机形态无假值标记)
    expect(isDummySecret('sk-Xk9mP2qL8vN4rT7wY3zA5bC1dE6fG0hJ')).toBe(false)
    expect(isDummySecret('ghp_Xk9mP2qL8vN4rT7wY3zA5bC1dE6fG0hJ2')).toBe(false)
    // 回归(审查 P0-3): 真 AWS Access Key ID 是 20 位大写字母数字, 不得被任何规则误降级
    expect(isDummySecret('AKIAXKQWZPJETMCLSA7')).toBe(false)
    expect(isDummySecret('AKIAIOSFODNN7EXAMPLE')).toBe(true) // 官方文档示例值仍降级
    // slug 词链(gstack 命令名撞 sk- 前缀)降级; 真随机 key 不受影响
    expect(isDummySecret('sk-user-question-format-compliance')).toBe(true)
    expect(isDummySecret('sk-Xk9mP2qL8vN4rT7wY3zA5bC1dE6fG0hJ')).toBe(false)
  })
})

describe('agentTreeExclude 排除规则(spec 打包链 2 两轮实测口径)', () => {
  it('环境/缓存/残留/构建产物目录与字节码剔除', () => {
    expect(agentTreeExclude('venv.py311', true)).toMatch(/venv\.py311/)
    expect(agentTreeExclude('.venv.bak-20261015-broken-python-3.14.8/lib/x.py', false)).toContain('.venv')
    expect(agentTreeExclude('.venv.dangling-20261013', true)).toContain('.venv')
    expect(agentTreeExclude('.hermes-runtime/python/gen/x.py', false)).toContain('.hermes-runtime')
    expect(agentTreeExclude('.worktrees/t_bce85b7e/tests/x.py', false)).toContain('.worktrees')
    expect(agentTreeExclude('apps/desktop/release/mac-arm64/x', false)).toContain('release')
    expect(agentTreeExclude('apps/desktop/dist/assets/x.js', false)).toContain('dist')
    expect(agentTreeExclude('agent/__pycache__/x.cpython-314.pyc', false)).toContain('__pycache__')
    expect(agentTreeExclude('.git', true)).toContain('.git')
    expect(agentTreeExclude('MagicMock/mock._routing_home/f', false)).toContain('MagicMock')
    expect(agentTreeExclude('hermes_agent.egg-info/PKG-INFO', false)).toContain('.egg-info')
    expect(agentTreeExclude('.ruff_cache/0000/xx', false)).toContain('ruff_cache')
    expect(agentTreeExclude('.pytest_cache/v/n', false)).toContain('pytest_cache')
    expect(agentTreeExclude('.pytest-cache/v/n', false)).toContain('pytest-cache')
    expect(agentTreeExclude('a/b.pyc', false)).toContain('字节码')
  })
  it('源码与无害点文件放行', () => {
    expect(agentTreeExclude('agent/runaway_guard.py', false)).toBeNull()
    expect(agentTreeExclude('tests/test_redact.py', false)).toBeNull()
    expect(agentTreeExclude('.envrc', false)).toBeNull()
    expect(agentTreeExclude('.env.example', false)).toBeNull()
    expect(agentTreeExclude('web/.env.example', false)).toBeNull()
  })
  it('敏感名文件剔除(.env 与 .env.*, 例外的 .env.example 除外)', () => {
    expect(agentTreeExclude('.env', false)).toContain('敏感名')
    expect(agentTreeExclude('web/.env', false)).toContain('敏感名')
    expect(agentTreeExclude('config/.env.production', false)).toContain('敏感名')
  })
})

describe('THIRD_PARTY_SRC 三方源清单(D15)', () => {
  it('覆盖 src-pins 三方(gstack 经 zcode 面)＋zcode 官方插件, 不含 npm/pip 可装项', () => {
    expect(THIRD_PARTY_SRC.map((x) => x.name).sort()).toEqual(['ecc', 'github', 'ralph-loop', 'superpowers'])
    expect(THIRD_PARTY_SRC.every((x) => x.path.length > 0 && x.note.length > 0)).toBe(true)
  })
})

describe('pluginLatestFilter 每插件只取最新版(D17)', () => {
  it('多版本目录只留最新, 旧版计数; 非版本顶层项放行', () => {
    expect(pluginLatestFilter('superpowers', ['7.0.0', '7.0.1'])).toEqual({ keep: ['7.0.1'], dropped: ['superpowers/7.0.0'] })
    expect(pluginLatestFilter('p', ['1.10.2', '1.9.9'])).toEqual({ keep: ['1.10.2'], dropped: ['p/1.9.9'] })  // 数值比较非字典序
    expect(pluginLatestFilter('p', ['2.0.0', '2.0.10', '2.0.9'])).toEqual({ keep: ['2.0.10'], dropped: ['p/2.0.0', 'p/2.0.9'] })
    expect(pluginLatestFilter('p', ['7.0.0', 'hooks', '7.0.1'])).toEqual({ keep: ['hooks', '7.0.1'], dropped: ['p/7.0.0'] })
  })
  it('0/1 个版本目录不过滤', () => {
    expect(pluginLatestFilter('p', ['7.0.0'])).toEqual({ keep: ['7.0.0'], dropped: [] })
    expect(pluginLatestFilter('p', ['skills', 'docs'])).toEqual({ keep: ['skills', 'docs'], dropped: [] })
  })
})

describe('扫描白名单(显式人工核判留痕)', () => {
  it('文件×模式粒度命中给理由, 其余不放行', () => {
    expect(allowlistReason('zcode/skills/gstack/lib/diagram-render/dist/diagram-render.html', 'aws-access-key')).toContain('base64 噪声')
    expect(allowlistReason('zcode/skills/gstack/lib/diagram-render/dist/diagram-render.html', 'openai-style-key')).toBeNull()
    expect(allowlistReason('hermes-agent-src/agent/x.py', 'aws-access-key')).toBeNull()
    expect(allowlistReason('zcode/skills/gstack/lib/redact-patterns.ts', 'private-key-block')).toContain('正则定义本体')
  })
})

describe('zcodeTreeExclude 排除规则(D14 配置面快照口径)', () => {
  it('可再生产物/缓存/备份/杂项剔除', () => {
    expect(zcodeTreeExclude('gstack/node_modules/x', false)).toContain('node_modules')
    expect(zcodeTreeExclude('gstack/.git/hooks', false)).toContain('.git')
    expect(zcodeTreeExclude('a/.pytest_cache/v', false)).toContain('pytest_cache')
    expect(zcodeTreeExclude('swarm-yuan.bak.1793151380/SKILL.md', false)).toContain('杂项')
    expect(zcodeTreeExclude('.DS_Store', false)).toContain('杂项')
  })
  it('mac 编译产物 bin/dist 剔除(D16), TS 源码与内容资产放行', () => {
    expect(zcodeTreeExclude('gstack/bin/gstack-global-discover', false)).toContain('bin')
    expect(zcodeTreeExclude('gstack/design/dist/design', false)).toContain('dist')
    expect(zcodeTreeExclude('browse/dist/browse', false)).toContain('dist')
    expect(zcodeTreeExclude('gstack/browse/src/main.ts', false)).toBeNull()
    expect(zcodeTreeExclude('gstack/browse/test/x.spec.ts', false)).toBeNull()
    expect(zcodeTreeExclude('huashu-design/assets/bgm-tutorial.mp3', false)).toBeNull()
    expect(zcodeTreeExclude('gongwen-bifa/SKILL.md', false)).toBeNull()
    expect(zcodeTreeExclude('model-peak-guard.sh', false)).toBeNull()
  })
})

describe('deriveConfigExample / parseEnvKeys', () => {
  it('config 模板带头注且保留正本内容', () => {
    const out = deriveConfigExample('model:\n  default: aim\n')
    expect(out).toContain('~/.hermes/config.yaml 模板')
    expect(out).toContain('default: aim')
    expect(out.endsWith('model:\n  default: aim\n')).toBe(true)
  })
  it('env 键解析跳过注释与空行,不误收带空格写法', () => {
    expect([...parseEnvKeys('# c\nAPI_SERVER_KEY=\nHERMES_GATEWAY_TOKEN=abc\nBAD KEY=1\nX =2')].sort())
      .toEqual(['API_SERVER_KEY', 'HERMES_GATEWAY_TOKEN'])
  })
})

describe('offline-template 结构与模板值纪律', () => {
  it('install 三件与 zcode/env 模板齐', () => {
    for (const f of [
      'scripts/offline-template/install/install-windows.ps1',
      'scripts/offline-template/install/install-windows.bat',
      'scripts/offline-template/install/README-windows.md',
      'scripts/offline-template/zcode/AGENTS.md',
      'scripts/offline-template/zcode/CLAUDE.md',
      'scripts/offline-template/env/env-vars.md',
    ]) expect(readFileSync(resolve(overlayRoot, f), 'utf8').length).toBeGreaterThan(0)
  })
  it('dot-env.example 所有键值一律为空(隐私红线:模板只含键名)', () => {
    const text = readFileSync(resolve(overlayRoot, 'scripts/offline-template/env/dot-env.example'), 'utf8')
    const withValue = text.split('\n').filter((l) => /^[A-Z_][A-Z0-9_]*=\S+/.test(l))
    expect(withValue).toEqual([])
  })
})
