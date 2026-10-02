// overlay/custom/server/contextarchive/__tests__/redact.test.ts
// C4 守门：手机（±86 前缀）/邮箱/18 位身份证/公司名各 pattern 脱敏 + 不误伤
// 普通文本 + 纯函数无 IO（源码级断言）。锚点行一律脱敏（保守策略）。
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactLines, redactAnchorLines } from '../redact'

afterEach(() => { delete process.env.CTX_REDACT_COMPANY_NAMES })

describe('pattern 脱敏', () => {
  it('手机号：裸 11 位与 +86 前缀均脱敏；前后贴数字不误伤', () => {
    const out = redactLines(['联系 13812345678 或 +8613812345678 或 8613812345678'], [])
    expect(out[0]).toBe('联系 *** 或 *** 或 ***')
    // 16 位长数字串整体不匹配手机规则（1[3-9] 起 11 位且后不贴数字），原样保留
    const keep = redactLines(['工单号 1381234567890123'], [])
    expect(keep[0]).toBe('工单号 1381234567890123')
  })

  it('邮箱脱敏', () => {
    const out = redactLines(['发到 zhang.san+tag@example.com.cn 即可'], [])
    expect(out[0]).toBe('发到 *** 即可')
  })

  it('18 位身份证脱敏（含 X 校验位）；15 位旧证不按 18 位规则误伤', () => {
    const out = redactLines(['证件 11010519491231002X 备案'], [])
    expect(out[0]).toBe('证件 *** 备案')
    const idLower = redactLines(['证件 11010519491231002x 备案'], [])
    expect(idLower[0]).toBe('证件 *** 备案')
    // 15 位不匹配 18 位规则，原样保留（诚实：规则只声明 18 位）
    const old15 = redactLines(['旧证 110105491231002'], [])
    expect(old15[0]).toBe('旧证 110105491231002')
  })

  it('身份证优先于手机：18 位数字串不被手机规则切成半脱敏', () => {
    const out = redactLines(['110105194912310021 记录'], [])
    expect(out[0]).toBe('*** 记录')
  })

  it('公司名列表（字面匹配、大小写不敏感、正则元字符安全）', () => {
    const out = redactLines(['客户 Acme Corp. 下单，联系 ACME CORP. 渠道'], ['Acme Corp.'])
    expect(out[0]).toBe('客户 *** 下单，联系 *** 渠道')
  })

  it('普通文本零改动', () => {
    const line = 'Context window #2 opened 任务：修复登录崩溃 最近动作：terminal npm test 通过'
    expect(redactLines([line], [])[0]).toBe(line)
  })

  it('redactAnchorLines 读 env CTX_REDACT_COMPANY_NAMES（逗号分隔，缺省空）', () => {
    process.env.CTX_REDACT_COMPANY_NAMES = '华为, Apple Inc.'
    const out = redactAnchorLines(['供应商：华为 / Apple Inc. / 13812345678'])
    expect(out[0]).toBe('供应商：*** / *** / ***')
    delete process.env.CTX_REDACT_COMPANY_NAMES
    const bare = redactAnchorLines(['供应商：华为'])
    expect(bare[0]).toBe('供应商：华为') // 未配置公司名=不动
  })

  it('守门：纯函数无 IO（源码无 fs/http/net/child_process/require/fetch）', () => {
    const src = readFileSync(join(__dirname, '../redact.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]node:(fs|http|https|net|child_process|os|dns|tls)/)
    expect(src).not.toMatch(/\brequire\s*\(/)
    expect(src).not.toMatch(/\bfetch\s*\(/)
  })
})
