// 长会话治理 607 配套把关：runtime 镜像对的符号契约交叉检查。
// 事故背景（2026-10-11 23:12 宿主实录）：manifest 部署把 series 版 kanban_db.py 推上
// 宿主，而宿主世代的 kanban_db_connect.py 引用 _kb.register_write_sanction_udf 等
// 写闸符号——series 版全缺，看板 watcher/dispatcher 全线 AttributeError。
// deploy 的源=overlay/runtime 镜像，所以闸门设在这里：镜像 connect.py 引用的
// 每一个 _kb 符号，必须在镜像 kanban_db.py 中有定义。新增引用而镜像缺定义时当场红，
// 挡在部署之前。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIRROR = join(dirname(import.meta.filename), '..', '..', '..', 'runtime', 'hermes_cli')

function mirrorConnectRefs(): { refs: string[]; connectSrc: string } {
  const connectSrc = readFileSync(join(MIRROR, 'kanban_db_connect.py'), 'utf8')
  const refs = [...new Set([...connectSrc.matchAll(/_kb\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]!))]
  return { refs, connectSrc }
}

function mirrorDbDefines(name: string): boolean {
  const dbSrc = readFileSync(join(MIRROR, 'kanban_db.py'), 'utf8')
  const patterns = [
    new RegExp(`^def ${name}\\(`, 'm'),
    new RegExp(`^${name}\\s*=`, 'm'),
    new RegExp(`^${name}\\s*:\\s`, 'm'),
  ]
  return patterns.some(re => re.test(dbSrc))
}

describe('runtime 镜像符号契约（607 守门：deploy 源自洽性）', () => {
  it('镜像 connect.py 引用的 _kb 符号必须在镜像 kanban_db.py 可解析', () => {
    const { refs } = mirrorConnectRefs()
    // 观测对象健全性：connect 引用面非空（引用清零=本守门失去观测对象）
    expect(refs.length).toBeGreaterThan(0)
    const missing = refs.filter(name => !mirrorDbDefines(name))
    expect(missing, `镜像 kanban_db.py 缺失 connect.py 引用的符号（部署会打崩宿主看板）：${missing.join(', ')}`).toEqual([])
  })

  it('写闸五件套在镜像中齐备（宿主世代契约的最小集）', () => {
    for (const name of [
      'register_write_sanction_udf', 'install_guardrail_triggers', 'SCHEMA_SQL', '_IS_WINDOWS', '_log',
    ]) {
      expect(mirrorDbDefines(name), `镜像缺 ${name}`).toBe(true)
    }
  })

  it('series 侧守门测试随补丁分发（607 契约测试存在于 hermes-agent 补丁面）', () => {
    // 607 把符号契约测试钉进 series 树；此处只断言补丁文件在位（series 完整性由
    // inject/replay 链验证），防止补丁被误删后只剩镜像侧单边把关。
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    const patch = join(dirname(import.meta.filename), '..', '..', '..', 'patches', '607-agent-kanban-guardrail-absorb.patch')
    expect(existsSync(patch), '607 补丁文件须在 patches/ 并登记 series').toBe(true)
    expect(readFileSync(patch, 'utf8')).toContain('test_kanban_guardrail_contract')
  })
})
