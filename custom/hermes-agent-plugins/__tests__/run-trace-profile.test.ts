// overlay[run-trace]: profile 身份字段测试面（2026-10-24 清账批 D14）。
// 行为门：真实执行插件的 _detect_profile/_write_jsonl_line（python3 import），
// 验证 env 优先/HERMES_HOME 基名推导/咽喉行补 profile；结构门防回归漂移。
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hermes-agent-plugins', 'run-trace')

describe('run-trace profile 字段（清账批 D14）', () => {
  it('结构门：探测函数+咽喉注入在位', () => {
    const src = readFileSync(join(pluginDir, '__init__.py'), 'utf8')
    expect(src).toContain('def _detect_profile()')
    expect(src).toContain('HERMES_RUN_TRACE_PROFILE')
    expect(src).toContain('data.setdefault("profile", _PROFILE)')
  })

  it('行为门：显式 env 优先；HERMES_HOME 基名推导；根 home 归 root', () => {
    const py = `
import importlib.util, sys, json
spec = importlib.util.spec_from_file_location('rt', ${JSON.stringify(join(pluginDir, '__init__.py'))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import os
os.environ['HERMES_RUN_TRACE_PROFILE'] = 'explicit-prof'
print(json.dumps({'explicit': m._detect_profile()}))
del os.environ['HERMES_RUN_TRACE_PROFILE']
os.environ['HERMES_HOME'] = '/sim/hermes/profiles/bella-agent'
print(json.dumps({'home': m._detect_profile()}))
os.environ['HERMES_HOME'] = '/root/.hermes'
print(json.dumps({'root': m._detect_profile()}))
`
    const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
    const lines = out.trim().split('\n').map(l => JSON.parse(l))
    expect(lines[0].explicit).toBe('explicit-prof')
    expect(lines[1].home).toBe('bella-agent')
    expect(lines[2].root).toBe('root')
  })

  it('行为门：_write_jsonl_line 给行补 profile 且不覆盖显式字段', () => {
    const py = `
import importlib.util, json, io
spec = importlib.util.spec_from_file_location('rt', ${JSON.stringify(join(pluginDir, '__init__.py'))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m._PROFILE = 'qi-agent'
buf = io.StringIO()
m._write_jsonl_line(buf, {'type': 'chunk', 'kind': 'llm_span'})
m._write_jsonl_line(buf, {'type': 'header', 'profile': 'already-set'})
print(buf.getvalue())
`
    const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
    const [a, b] = out.trim().split('\n').map(l => JSON.parse(l))
    expect(a.profile).toBe('qi-agent')
    expect(b.profile).toBe('already-set')
  })
})
