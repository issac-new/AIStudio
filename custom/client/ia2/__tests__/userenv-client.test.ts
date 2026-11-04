// N01 客户端纯函数守门：敏感判定（与服务端同源规则）、掩码形态、编辑态矩阵、
// 保存载荷构造（掩码回传=保持现值的往返语义）。
import { describe, expect, it } from 'vitest'
import {
  buildPutEntries, editStateOf, hasSensitiveDraft, isSensitiveEnvKey,
  maskEnvValue, needsSensitiveConfirm, type EnvRow,
} from '../utils/userenv'

function row(partial: Partial<EnvRow>): EnvRow {
  return { key: 'K', value: 'v', sensitive: false, edited: false, draft: '', ...partial }
}

describe('isSensitiveEnvKey —— 与服务端 SENSITIVE_KEY_RE 同源', () => {
  it('KEY/TOKEN/SECRET/PASSWORD/PASS/credential 命中即敏感（不区分大小写）', () => {
    for (const k of ['API_KEY', 'apikey', 'AUTH_TOKEN', 'CLIENT_SECRET', 'DB_PASSWORD', 'PASS', 'MY_PASSPHRASE', 'db_credentials']) {
      expect(isSensitiveEnvKey(k), k).toBe(true)
    }
  })
  it('子串命中宁滥勿漏（MONKEY 含 KEY）；普通配置键不误伤', () => {
    expect(isSensitiveEnvKey('MONKEY_TEST')).toBe(true)
    for (const k of ['MODEL', 'HTTP_PORT', 'TEMPERATURE', 'BASE_URL', 'LOG_LEVEL']) {
      expect(isSensitiveEnvKey(k), k).toBe(false)
    }
  })
})

describe('maskEnvValue', () => {
  it('掩码形态 ***len=N***（N=值长度，空值为 0）', () => {
    expect(maskEnvValue('abcde')).toBe('***len=5***')
    expect(maskEnvValue('')).toBe('***len=0***')
  })
})

describe('editStateOf —— 编辑态矩阵', () => {
  it('非敏感=plain（明文就地编辑）', () => {
    expect(editStateOf(row({ sensitive: false, edited: true }))).toBe('plain')
    expect(editStateOf(row({ sensitive: false, edited: false }))).toBe('plain')
  })
  it('敏感未动=sensitive-intact（只显掩码）；打开草稿框=sensitive-editing（空草稿也是）', () => {
    expect(editStateOf(row({ sensitive: true, edited: false }))).toBe('sensitive-intact')
    expect(editStateOf(row({ sensitive: true, edited: true, draft: '' }))).toBe('sensitive-editing')
    expect(editStateOf(row({ sensitive: true, edited: true, draft: 'x' }))).toBe('sensitive-editing')
  })
})

describe('确认位判定', () => {
  it('只有「敏感＋已编辑＋非空草稿」才需要确认；空草稿=保持现值不算变更', () => {
    expect(hasSensitiveDraft(row({ sensitive: true, edited: true, draft: 'x' }))).toBe(true)
    expect(hasSensitiveDraft(row({ sensitive: true, edited: true, draft: '' }))).toBe(false)
    expect(hasSensitiveDraft(row({ sensitive: true, edited: false, draft: 'x' }))).toBe(false)
    expect(hasSensitiveDraft(row({ sensitive: false, edited: true, draft: 'x' }))).toBe(false)
  })
  it('needsSensitiveConfirm：任一行需确认即 true', () => {
    expect(needsSensitiveConfirm([
      row({ key: 'MODEL', sensitive: false, edited: true, draft: 'new' }),
      row({ key: 'TOKEN', sensitive: true, edited: false }),
    ])).toBe(false)
    expect(needsSensitiveConfirm([
      row({ key: 'MODEL' }),
      row({ key: 'TOKEN', sensitive: true, edited: true, draft: 'new' }),
    ])).toBe(true)
  })
})

describe('buildPutEntries —— 掩码回传=保持现值', () => {
  it('非敏感行回传明文（含就地编辑后的值）；敏感未动行掩码原样回传；草稿行用草稿；键名去空白', () => {
    const rows = [
      row({ key: ' MODEL ', value: 'glm-4.7', edited: false }),
      row({ key: 'MODEL2', value: 'old', edited: false }), // 非敏感未动也回传明文
      row({ key: 'API_TOKEN', value: '***len=6***', sensitive: true, edited: false }),
      row({ key: 'API_KEY', value: '***len=3***', sensitive: true, edited: true, draft: 'brand-new' }),
      row({ key: 'DB_PASS', value: '***len=8***', sensitive: true, edited: true, draft: '' }),
    ]
    expect(buildPutEntries(rows)).toEqual([
      { key: 'MODEL', value: 'glm-4.7' },
      { key: 'MODEL2', value: 'old' },
      { key: 'API_TOKEN', value: '***len=6***' }, // 掩码串回传 → 服务端解析为保持现值
      { key: 'API_KEY', value: 'brand-new' },
      { key: 'DB_PASS', value: '***len=8***' }, // 空草稿=保持现值（防误清空）
    ])
  })
})
