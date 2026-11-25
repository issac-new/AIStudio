// overlay/custom/server/governance/__tests__/registry-admin.test.ts
// P6-P8 守门：注册表读写+保存即提交（R13）/建号 roster 追加/离职三步原子序。
// git 与 admin-service 全 mock——断言调用序与 payload，不触真仓。
// Task 7 追加：离职前置检查/自然人联动/改派核实——身份册与自然人走真实 JSON
//（AGENT_IDENTITY_STORE 指向临时目录，sync fs 未被 mock），文件写仍走 mock。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const execMock = vi.fn(async () => ({ stdout: 'abc1234\n' }))
vi.mock('node:child_process', () => ({ execFile: (...a: unknown[]) => {
  void execMock(a[0], a[1])
  const cb = a[a.length - 1]
  if (typeof cb === 'function') cb(null, { stdout: 'abc1234\n' })
} }))
const fsHoisted = vi.hoisted(() => ({
  writeFileMock: vi.fn(async () => undefined),
  appendFileMock: vi.fn(async () => undefined),
}))
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (p: string) => {
    if (p.includes('roster')) return '# roster\n\n| 账号 | AI 助理账号 | 角色 |\n| --- | --- | --- |\n| @admin:matrix.test | — | 管理员 |\n'
    return ''
  }),
  writeFile: fsHoisted.writeFileMock,
  appendFile: fsHoisted.appendFileMock,
  mkdir: vi.fn(async () => undefined),
}))
const createMock = vi.fn(async () => ({ userId: '', created: true }))
const deactivateMock = vi.fn(async () => true)
const whoamiMock = vi.fn(async () => ({ userId: '@admin:matrix.test', deviceId: '' }))
const stateMock = vi.fn(async () => 'active')
vi.mock('../../matrix/admin-service', () => ({
  createMatrixUser: (...a: unknown[]) => createMock(...a),
  setMatrixUserActive: (...a: unknown[]) => deactivateMock(...a),
  validateMatrixToken: (...a: unknown[]) => whoamiMock(...a),
  getMatrixUserState: (...a: unknown[]) => stateMock(...a),
}))
vi.mock('../governance-controller', () => ({ repoRoot: () => '/tmp/fake-repo' }))

import { readRegistry, writeRegistry, provisionMatrixAccount, offboardAccount, appendTableRow, precheckOffboard } from '../registry-admin'
import { registerIdentity } from '../../agentidentity/agent-identity'
import { upsertPerson, activatePerson, listPeople } from '../../agentidentity/people'

// Task 7：身份册/自然人走真实 JSON 临时目录；看板库指向空目录（查不到任务=不可读）。
let storeDir = ''
let kanbanHome = ''
beforeEach(() => {
  execMock.mockClear(); createMock.mockClear(); deactivateMock.mockClear(); whoamiMock.mockClear(); stateMock.mockClear(); stateMock.mockResolvedValue('active')
  // 守门③ 用 mockResolvedValue(false) 改的是持久实现，mockClear 不复原——每用例重置回默认成功
  deactivateMock.mockResolvedValue(true)
  fsHoisted.writeFileMock.mockClear(); fsHoisted.appendFileMock.mockClear()
  storeDir = mkdtempSync(path.join(tmpdir(), 'offboard-identity-'))
  kanbanHome = mkdtempSync(path.join(tmpdir(), 'offboard-kanban-'))
  process.env.AGENT_IDENTITY_STORE = storeDir
  process.env.HERMES_HOME = kanbanHome
})
afterEach(() => {
  delete process.env.AGENT_IDENTITY_STORE
  delete process.env.HERMES_HOME
  rmSync(storeDir, { recursive: true, force: true })
  rmSync(kanbanHome, { recursive: true, force: true })
})

/** 离职/前置检查的基准入参（homeserver 推导 serverName=matrix.test）。 */
function base() {
  return { localName: 'zhang', handoverTo: 'chen', taskIds: [] as string[], reason: '转岗', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' }
}

/** 登记绑定 @zhang-agent:matrix.test 的执行单元并把阶段直接置为指定值
 * （走真实身份册文件；迁移状态机的准入证据链不属于本测试面）。 */
function registerBoundUnit(stage: string): { id: string; name: string } {
  const res = registerIdentity({
    name: 'zhang-agent-unit', kind: 'agent', owner: 'tester',
    runtimeBindings: { matrixAccounts: ['@zhang-agent:matrix.test'] },
  }, 'tester')
  if (!res.ok) throw new Error(`登记失败：${res.problems.join('；')}`)
  const file = path.join(storeDir, 'identities.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { identities: Array<{ id: string; lifecycle?: unknown }> }
  const ident = raw.identities.find((i) => i.id === res.identity.id)
  if (!ident) throw new Error('身份未落盘')
  ident.lifecycle = { stage, history: [] }
  writeFileSync(file, JSON.stringify(raw))
  return { id: res.identity.id, name: res.identity.name }
}

/** 登记并启用 mxids 命中 @zhang:matrix.test 的自然人 carol。 */
function registerLinkedPerson(): string {
  const up = upsertPerson({ name: 'carol', mxids: ['@zhang:matrix.test'] }, 'tester')
  if (!up.ok || !up.person) throw new Error(`自然人登记失败：${up.problems.join('；')}`)
  const act = activatePerson(up.person.id, 'tester')
  if (!act.ok) throw new Error(`自然人启用失败：${act.problems.join('；')}`)
  return up.person.id
}

function gitCommitCalls(): string[] {
  return execMock.mock.calls.map((c: unknown[]) => (c[1] as string[]).join(' ')).filter((s: string) => s.includes('commit'))
}

describe('registry-admin（P6-P8）', () => {
  it('保存即提交：write → git add <path> → git commit（R13 链）', async () => {
    const r = await writeRegistry('org', '# org', '组织关系更新', 'tester')
    expect(r.commit).toBe('abc1234')
    const calls = execMock.mock.calls.map((c: unknown[]) => (c[1] as string[]).join(' '))
    expect(calls.some((s: string) => s.includes('add docs/admin/org.md'))).toBe(true)
    expect(calls.some((s: string) => s.includes('commit'))).toBe(true)
  })

  it('readRegistry 返回 markdown+commit', async () => {
    const r = await readRegistry('roster')
    expect(r.commit).toBe('abc1234')
    expect(r.markdown).toContain('@admin:matrix.test')
  })

  it('建号：synapse 双账号 + roster 追加行 + 提交', async () => {
    const r = await provisionMatrixAccount({ localName: 'zhang', role: '研发', password: 'Pw1!', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' })
    expect(r.created).toEqual(['@zhang:matrix.test', '@zhang-agent:matrix.test'])
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(r.rosterCommit).toBe('abc1234')
  })

  it('防假成功：建号失败（createMatrixUser=false）即 reject 且不产生任何 roster 提交', async () => {
    createMock.mockResolvedValueOnce(false as never)
    await expect(provisionMatrixAccount({ localName: 'bad', role: '研发', password: 'Pw1!', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' }))
      .rejects.toThrow('建号失败')
    const calls = execMock.mock.calls.map((c: unknown[]) => (c[1] as string[]).join(' '))
    expect(calls.some((s: string) => s.includes('commit'))).toBe(false)
  })

  it('离职三步：移交工单提交 → 停用双号 → 审计留痕提交', async () => {
    const r = await offboardAccount({ localName: 'zhang', handoverTo: 'chen', taskIds: ['t_1', 't_2'], reason: '转岗', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' })
    expect(deactivateMock).toHaveBeenCalledTimes(2)
    expect(r.deactivated).toHaveLength(2)
    const commits = execMock.mock.calls.filter((c: unknown[]) => (c[1] as string[]).join(' ').includes('commit')).length
    expect(commits).toBeGreaterThanOrEqual(2) // ①移交工单 + ③审计留痕 两笔提交
  })

  it('离职守门①：非法用户名（路径穿越形态）拒收且零写盘零 git', async () => {
    await expect(offboardAccount({ localName: '../../escape', handoverTo: 'chen', taskIds: [], reason: 'x', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' }))
      .rejects.toThrow('非法用户名')
    expect(execMock).not.toHaveBeenCalled()
    expect(deactivateMock).not.toHaveBeenCalled()
  })

  it('离职守门②：adminToken 无效先拒，不产生任何工单/审计落盘', async () => {
    whoamiMock.mockResolvedValueOnce(null)
    await expect(offboardAccount({ localName: 'zhang', handoverTo: 'chen', taskIds: [], reason: 'x', adminToken: 'bad', homeserverUrl: 'http://127.0.0.1:8008' }))
      .rejects.toThrow('adminToken 无效')
    expect(execMock).not.toHaveBeenCalled()
    expect(deactivateMock).not.toHaveBeenCalled()
  })

  it('离职守门③：停用被拒（存在但 deactivate=false）炸出报错，不静默记空数组', async () => {
    deactivateMock.mockResolvedValue(false)
    await expect(offboardAccount({ localName: 'zhang', handoverTo: 'chen', taskIds: [], reason: 'x', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' }))
      .rejects.toThrow('停用失败')
  })

  it('离职守门④：账号不存在（missing）跳过不炸；已停用（deactivated）幂等跳过', async () => {
    stateMock.mockResolvedValue('missing')
    const r = await offboardAccount({ localName: 'zhang', handoverTo: 'chen', taskIds: [], reason: 'x', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' })
    expect(r.deactivated).toHaveLength(0)
    expect(deactivateMock).not.toHaveBeenCalled()
    stateMock.mockResolvedValue('deactivated')
    const r2 = await offboardAccount({ localName: 'zhang', handoverTo: 'chen', taskIds: [], reason: 'x', adminToken: 't', homeserverUrl: 'http://127.0.0.1:8008' })
    expect(r2.deactivated).toHaveLength(0)
    expect(deactivateMock).not.toHaveBeenCalled()
  })

  it('appendTableRow 追加到表末行后', () => {
    const md = '# t\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n尾部段'
    const out = appendTableRow(md, ['3', '4'])
    expect(out).toContain('| 3 | 4 |')
    expect(out.indexOf('| 3 | 4 |')).toBeGreaterThan(out.indexOf('| 1 | 2 |'))
    expect(out.indexOf('| 3 | 4 |')).toBeLessThan(out.indexOf('尾部段'))
  })
})

describe('离职前置检查与联动（Task 7）', () => {
  it('precheck：令牌无效 → 抛错且不写任何文件', async () => {
    whoamiMock.mockResolvedValueOnce(null as never)
    await expect(precheckOffboard(base())).rejects.toThrow()
    expect(fsHoisted.writeFileMock).not.toHaveBeenCalled()
    expect(gitCommitCalls()).toHaveLength(0)
  })

  it('precheck：命中在岗执行单元 → blockedUnits 列出；不写文件', async () => {
    const unit = registerBoundUnit('running')
    const r = await precheckOffboard(base())
    expect(r.blockedUnits).toEqual([{ identityId: unit.id, name: unit.name, stage: 'running' }])
    expect(fsHoisted.writeFileMock).not.toHaveBeenCalled()
    expect(gitCommitCalls()).toHaveLength(0)
  })

  it('precheck：无命中 → blockedUnits 为空', async () => {
    const r = await precheckOffboard(base())
    expect(r.blockedUnits).toEqual([])
    expect(r.person.status).toBe('not-linked')
  })

  it('precheck：自然人 mxids 命中 → 预览 deactivated', async () => {
    const personId = registerLinkedPerson()
    const r = await precheckOffboard(base())
    expect(r.person.status).toBe('deactivated')
    expect(r.person.personId).toBe(personId)
    // 预览是只读：自然人仍为在岗
    expect(listPeople().find((p) => p.id === personId)?.active).toBe(true)
  })

  it('offboard：仍有在岗执行单元 → 抛 offboard_blocked，未停用账号、未写文件', async () => {
    registerBoundUnit('running')
    await expect(offboardAccount(base())).rejects.toThrow(/offboard_blocked|先完成退役/)
    expect(deactivateMock).not.toHaveBeenCalled()
    expect(fsHoisted.writeFileMock).not.toHaveBeenCalled()
    expect(gitCommitCalls()).toHaveLength(0)
  })

  it('offboard：联动停用命中的自然人', async () => {
    const personId = registerLinkedPerson()
    const r = await offboardAccount(base())
    expect(r.person.status).toBe('deactivated')
    expect(r.person.personId).toBe(personId)
    expect(listPeople().find((p) => p.id === personId)?.active).toBe(false)
  })

  it('offboard：移交工单写入逐卡核实结果', async () => {
    const r = await offboardAccount({ ...base(), taskIds: ['t1', 't2'], handoverProfile: 'worker-coder' })
    expect(r.taskHandover).toHaveLength(2)
    const doc = fsHoisted.writeFileMock.mock.calls
      .map((c: unknown[]) => String(c[1]))
      .find((s: string) => s.includes('离职移交工单'))
    expect(doc).toBeDefined()
    expect(doc).toContain('t1')
    // 空看板库下两卡均查不到：核实行如实写「任务不存在或不可读」
    expect(doc).toContain('任务不存在或不可读')
    expect(r.taskHandover.every((row) => row.reassigned === false)).toBe(true)
  })

  it('offboard：未填接手执行单元 → 不核实改派，工单写「仅登记」', async () => {
    const r = await offboardAccount({ ...base(), taskIds: ['t1'] })
    expect(r.taskHandover).toHaveLength(1)
    expect(r.taskHandover[0]).toMatchObject({ taskId: 't1', reassigned: false, note: '仅登记' })
    const doc = fsHoisted.writeFileMock.mock.calls
      .map((c: unknown[]) => String(c[1]))
      .find((s: string) => s.includes('离职移交工单'))
    expect(doc).toContain('仅登记')
  })
})
