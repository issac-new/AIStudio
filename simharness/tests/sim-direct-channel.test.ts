import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import * as yaml from 'js-yaml'

// SIM 直连 LLM 通道守门（2026-11-05 用户指令：SIM 全编制脱离 cc-switch 代理直连
// bigmodel anthropic 端点）。断言三面：①helper 从 cc-switch DB 取数生成正确的
// 直连三键段（XGLM 主/SGLM fallback/glm-5.3/1M/anthropic_messages）；
// ②--check 双态判定（直连形态过 / cc-switch 代理形态拦）；③mx-lib.sh 三处生成器
// （write_root_config/write_user_profile/write_agent_profile）全部接线
// apply_direct_channel——缺一处即下一轮 mx-setup 再生回代理通道（本轮根治点）。
const HARNESS = resolve(__dirname, '..')
const HELPER = join(HARNESS, 'mux', 'mx_model_channel.py')
const FIX = join(HARNESS, 'tests', 'fixtures', 'direct-channel')

function run(cmd: string, envExtra: Record<string, string> = {}) {
  return execSync(cmd, { cwd: HARNESS, encoding: 'utf8', shell: '/bin/bash', env: { ...process.env, ...envExtra } })
}

const XGLM_KEY = 'test-xglm-key-0001'
const SGLM_KEY = 'test-sglm-key-0002'

beforeAll(() => {
  rmSync(FIX, { recursive: true, force: true })
  mkdirSync(FIX, { recursive: true })
  // 夹具 cc-switch DB：只建 helper 依赖的 providers 表与两行通道定义。
  // SQL 走文件通道（单引号字面量内嵌原生双引号 JSON，避开 shell 三层转义）
  const db = join(FIX, 'cc-switch.db')
  const sql = join(FIX, 'seed.sql')
  writeFileSync(sql, [
    `CREATE TABLE providers (id TEXT NOT NULL, app_type TEXT NOT NULL, name TEXT NOT NULL,`,
    `  settings_config TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (id, app_type));`,
    `INSERT INTO providers VALUES ('p1','hermes','XGLM','{"name":"XGLM","base_url":"https://open.bigmodel.cn/api/anthropic","api_key":"${XGLM_KEY}","api_mode":"anthropic_messages"}','{}');`,
    `INSERT INTO providers VALUES ('p2','hermes','SGLM','{"name":"SGLM","base_url":"https://open.bigmodel.cn/api/anthropic","api_key":"${SGLM_KEY}","api_mode":"anthropic_messages"}','{}');`,
  ].join('\n'))
  run(`sqlite3 ${JSON.stringify(db)} < ${JSON.stringify(sql)}`)
})

afterAll(() => {
  rmSync(FIX, { recursive: true, force: true })
})

describe('mx_model_channel --emit-config（从 cc-switch DB 取数）', () => {
  it('生成直连三键段：XGLM 主/SGLM fallback/1M/anthropic_messages，key 运行时取自 DB', () => {
    const out = run(`python3 ${JSON.stringify(HELPER)} --emit-config --cc-db ${JSON.stringify(join(FIX, 'cc-switch.db'))}`)
    const cfg = yaml.load(out) as any
    expect(cfg.model).toEqual({ default: 'glm-5.3', provider: 'xglm' })
    expect(cfg.fallback_providers).toEqual([{ provider: 'sglm', model: 'glm-5.3' }])
    expect(cfg.custom_providers).toHaveLength(2)
    const [xglm, sglm] = cfg.custom_providers
    expect(xglm.api_key).toBe(XGLM_KEY)
    expect(sglm.api_key).toBe(SGLM_KEY)
    for (const c of cfg.custom_providers) {
      expect(c.base_url).toBe('https://open.bigmodel.cn/api/anthropic')
      expect(c.api_mode).toBe('anthropic_messages')
      expect(c.model).toBe('glm-5.3')
      expect(c.models['glm-5.3'].context_length).toBe(1048576)
    }
  })

  it('DB 缺通道行时响亮失败（非空配置半套产出）', () => {
    const bad = join(FIX, 'empty.db')
    run(`sqlite3 ${JSON.stringify(bad)} "CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)"`)
    const r = spawnSync('python3', [HELPER, '--emit-config', '--cc-db', bad], { encoding: 'utf8' })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('缺 hermes 通道行')
  })

  it('MX_MODEL_CHANNEL=host 时 apply_direct_channel 原样返回（回滚开关）', () => {
    const r = spawnSync('python3', ['-c', `
import os, sys
os.environ['MX_MODEL_CHANNEL'] = 'host'
sys.path.insert(0, ${JSON.stringify(join(HARNESS, 'mux'))})
from mx_model_channel import apply_direct_channel
out = {'model': {'provider': 'cc-switch-route'}}
assert apply_direct_channel(out) is out and out['model']['provider'] == 'cc-switch-route'
print('host-noop-ok')
`], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('host-noop-ok')
  })
})

describe('mx_model_channel --check（直连形态判定）', () => {
  it('直连形态过；cc-switch 代理形态与 codex_responses 残留形态拦', () => {
    const good = run(`python3 ${JSON.stringify(HELPER)} --emit-config --cc-db ${JSON.stringify(join(FIX, 'cc-switch.db'))}`)
    const goodFile = join(FIX, 'good.yaml')
    writeFileSync(goodFile, good)
    expect(run(`python3 ${JSON.stringify(HELPER)} --check ${JSON.stringify(goodFile)}`).trim())
      .toBe(`direct-ok ${goodFile}`)

    const oldForm = [
      'model:',
      '  default: glm-5.3',
      '  provider: cc-switch-route',
      'fallback_providers: []',
      'custom_providers:',
      '  - name: cc-switch-route',
      '    base_url: http://127.0.0.1:15721/hermes/v1',
      '    api_key: PROXY_MANAGED',
      '    api_mode: codex_responses',
      '    model: glm-5.3',
    ].join('\n')
    const oldFile = join(FIX, 'old.yaml')
    writeFileSync(oldFile, oldForm)
    const r = spawnSync('python3', [HELPER, '--check', oldFile], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('model.provider')
  })
})

describe('mx-lib.sh 三生成器接线', () => {
  it('write_root_config/write_user_profile/write_agent_profile 均调 apply_direct_channel', () => {
    const lib = readFileSync(join(HARNESS, 'mux', 'mx-lib.sh'), 'utf8')
    expect((lib.match(/^from mx_model_channel import apply_direct_channel$/gm) || []).length).toBe(3)
    expect((lib.match(/^apply_direct_channel\(out\)$/gm) || []).length).toBe(3)
    // 三处调用点都注入了 helper 目录（缺 env 前缀=import 失败产出空配置）
    expect((lib.match(/MX_MUX_DIR="\$_MX_MUX_DIR"/g) || []).length).toBe(3)
  })

  it('mx-lib.sh 语法门', () => {
    run(`bash -n ${JSON.stringify(join(HARNESS, 'mux', 'mx-lib.sh'))}`)
  })
})
