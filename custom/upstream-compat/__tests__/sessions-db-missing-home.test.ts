// 回归（2026-11-23 全面复盘批）：会话库 state.db 不存在时（全新安装、从未启动过的 profile），
// 会话列表与详情读取必须返回空结果，不能抛错——上游以只读方式开库，文件缺席即 500，
// IDE 壳与协作历史页共 7 条路由受影响（补丁 817）。
// 口径与同文件既有读函数一致：库不存在即空，不把正常的初始状态呈现成故障。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sessionsDb = () =>
  import('../../../vendor/hermes-studio/packages/server/src/modules/hermes/services/history/sessions-db')
const profiles = () =>
  import('../../../vendor/hermes-studio/packages/server/src/modules/hermes/services/profiles/profile')

let home = ''
let previousHome: string | undefined

beforeEach(async () => {
  previousHome = process.env.HERMES_HOME
  home = await mkdtemp(join(tmpdir(), 'sessions-db-missing-home-'))
  process.env.HERMES_HOME = home
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = previousHome
  if (home) await rm(home, { recursive: true, force: true })
})

describe('会话库缺席时的读面降级（补丁 817）', () => {
  it('前置：隔离 HOME 确实是解析到的 hermes 根，且其中没有 state.db', async () => {
    const { getHermesBaseDir } = await profiles()
    expect(getHermesBaseDir()).toBe(home)
    expect(existsSync(join(home, 'state.db'))).toBe(false)
  })

  it('会话列表返回空数组', async () => {
    const db = await sessionsDb()
    await expect(db.listSessionSummaries()).resolves.toEqual([])
  })

  it('会话分组读取返回空分组', async () => {
    const db = await sessionsDb()
    await expect(db.listSessionSummaryGroups(20)).resolves.toEqual({ groups: [], included: [] })
  })

  it('按 profile 读取时同样返回空结果', async () => {
    const db = await sessionsDb()
    await expect(db.listSessionSummaries(undefined, 2000, 'default')).resolves.toEqual([])
    await expect(db.listSessionSummaryGroups(20, 'default')).resolves.toEqual({ groups: [], included: [] })
  })

  it('单会话详情读取返回 null', async () => {
    const db = await sessionsDb()
    await expect(db.getSessionMessagesFromDb('sess_missing')).resolves.toBeNull()
    await expect(db.getSessionDetailFromDb('sess_missing')).resolves.toBeNull()
    await expect(db.getSessionDetailFromDbWithProfile('sess_missing', 'default')).resolves.toBeNull()
    await expect(db.getSessionDetailPaginatedFromDbWithProfile('sess_missing', 'default')).resolves.toBeNull()
  })
})
