// patch 754 守门：kanban 毒 run 指针免疫与 dir 卡建卡校验（run27 派单器停滞根治）。
// 夹具对注入后的 vendor/hermes-agent 树（PYTHONPATH）做行为断言——与仓内其他跨树
// 测试同前提：worktree 内先 npm run inject；夹具自持临时 HERMES_HOME。
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const FIXTURE = join(ROOT, 'simharness/tests/fixtures/kanban-junk-runid.py')
const VENDOR = join(ROOT, 'vendor/hermes-agent')

describe('patch 754：kanban 毒 run 指针免疫', () => {
  it('五断言全绿（reclaim 兜底/读点 None/goal superseded/dir 拒与不误伤）', () => {
    const env = { ...process.env, KANBAN_VENDOR_ROOT: VENDOR }
    delete env.HERMES_HOME // 夹具自建临时 HERMES_HOME，宿主值防串库
    // 解释器回落（2026-11-25，清偿批 C CI 暴露）：夹具导入 hermes-agent，系统 python3 在
    // CI 上缺 ruamel 等第三方依赖而 ModuleNotFoundError（stdout 空、断言红）。优先用回归
    // 矩阵传入的 AISTUDIO_PYTHON（CI 已装好依赖的 venv）；本机不设时维持原样。
    const python = process.env.AISTUDIO_PYTHON ?? 'python3'
    const r = spawnSync(python, [FIXTURE], {
      encoding: 'utf8',
      env,
      timeout: 120_000,
    })
    // stderr 只许良性环境告警（SQLite WAL 版本提示等），断言失败行才算红
    const realFailures = (r.stderr ?? '').split('\n').filter((l) => l.startsWith('FAIL '))
    expect(realFailures, '夹具断言失败详情').toEqual([])
    expect(r.status, `夹具应零退出（stdout=${r.stdout?.trim()}）`).toBe(0)
    expect(r.stdout ?? '', '应报告 5/5 通过').toContain('5/5 断言通过')
  })
})
