// 多槽凭据仓（vault）生命周期守门（spec 2026-11-13 matrix-account-switch）：
// 写活跃凭据自动入仓（三条路径全覆盖）/ upsert 同 userId 覆盖 / 登出只清活跃槽不清仓
// （D3）/ 删除失效项 / savedAt 降序 / 畸形 JSON 容错。
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import {
  storeMatrixCredentials,
  getMatrixCredentials,
  clearMatrixCredentials,
  listVaultAccounts,
  getVaultAccount,
  upsertAccountVault,
  removeVaultAccount,
} from '../stores/matrix-credentials'

beforeEach(() => {
  localStorage.clear()
})

const A = { accessToken: 'tok_a', userId: '@a:ms.test', deviceId: 'DEV_A', homeserverUrl: 'https://ms.test' }
const B = { accessToken: 'tok_b', userId: '@b:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' }

describe('storeMatrixCredentials 自动入仓', () => {
  it('写活跃凭据即入仓（meta 缺省 source=manual），登出清活跃槽不清仓', async () => {
    storeMatrixCredentials(A)
    // savedAt 毫秒精度：两次写入间隔 2ms 保证降序断言不受同毫秒并列影响
    await new Promise(r => setTimeout(r, 2))
    storeMatrixCredentials(B)
    // 活跃槽是最后写入的 B
    expect(getMatrixCredentials()).toEqual(B)
    // 仓里两个都在（savedAt 降序：B 在前）
    const list = listVaultAccounts()
    expect(list.map(e => e.userId)).toEqual(['@b:ms.test', '@a:ms.test'])
    expect(list[1].source).toBe('manual')
    // 登出：活跃槽清空，仓保留
    clearMatrixCredentials()
    expect(getMatrixCredentials()).toBeNull()
    expect(listVaultAccounts().map(e => e.userId)).toEqual(['@b:ms.test', '@a:ms.test'])
  })

  it('带 meta 入仓（source=profile + 档位名 + displayName）', () => {
    storeMatrixCredentials(A, { source: 'profile', profile: 'pay-orchestrator', displayName: '支付总监' })
    const entry = getVaultAccount('@a:ms.test')
    expect(entry).toMatchObject({
      source: 'profile',
      profile: 'pay-orchestrator',
      displayName: '支付总监',
      accessToken: 'tok_a',
    })
  })
})

describe('upsertAccountVault 覆盖语义', () => {
  it('同 userId 再入仓覆盖旧记录并刷新 savedAt', async () => {
    upsertAccountVault(A, { displayName: '旧名' })
    await new Promise(r => setTimeout(r, 5))
    upsertAccountVault({ ...A, accessToken: 'tok_a2' }, { displayName: '新名' })
    const list = listVaultAccounts()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ accessToken: 'tok_a2', displayName: '新名' })
  })
})

describe('removeVaultAccount', () => {
  it('按 userId 删除；不存在的 userId 静默无操作', () => {
    upsertAccountVault(A)
    upsertAccountVault(B)
    removeVaultAccount('@a:ms.test')
    expect(listVaultAccounts().map(e => e.userId)).toEqual(['@b:ms.test'])
    removeVaultAccount('@ghost:ms.test')
    expect(listVaultAccounts()).toHaveLength(1)
  })
})

describe('畸形仓容错', () => {
  it('非 JSON / 非数组 / 字段残缺条目静默剔除，不抛错', () => {
    localStorage.setItem('matrix_account_vault', 'not-json{')
    expect(listVaultAccounts()).toEqual([])
    localStorage.setItem('matrix_account_vault', JSON.stringify([
      { accessToken: 'tok', userId: '@ok:ms.test', homeserverUrl: 'https://ms.test' },
      { userId: '@no-token:ms.test' }, // 缺 accessToken → 剔除
      'garbage',
    ]))
    const list = listVaultAccounts()
    expect(list.map(e => e.userId)).toEqual(['@ok:ms.test'])
    // getVaultAccount 同一解析链
    expect(getVaultAccount('@no-token:ms.test')).toBeNull()
  })
})
