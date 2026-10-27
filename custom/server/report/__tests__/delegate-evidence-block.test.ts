// 编码委托证据块把关测试（V8.54 §5.4.3 编码委托证据位，2026-10-26 接线）：
// 身份行（engine_bin_source=）是「ACP 调用的是谁」的报告证据——齐备=绿横幅，
// 缺失=delegate-identity-missing 红横幅（证据不全禁放行式呈现）；原文透传
// 且宿主路径脱敏（与 qgateBlock 同纪律）。
import { describe, expect, it } from 'vitest'

import { delegateEvidenceBlock } from '../evidence-blocks'

const FULL_LOG = [
  '[17:00:52] engine=/opt/homebrew/bin/zcode-acp-server engine_bin_source=official-bundle engine_bin=/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs cwd=/tmp/ws timeout=120s prompt_chars=67',
  '[17:00:56] session 模型已设置：GLM-5.3',
  '[17:01:07] RESULT exit=0 stopReason=end_turn in=35395 out=66',
].join('\n')

const LOG_WITHOUT_IDENTITY = [
  '[03:37:12] engine=zcode-acp-server cwd=/ws',
  '[03:53:01] RESULT exit=0',
].join('\n')

describe('delegateEvidenceBlock（V8.54 编码委托证据位）', () => {
  it('身份行齐备：绿横幅+原文透传（含 RESULT 与模型行）', () => {
    const html = delegateEvidenceBlock(FULL_LOG)
    expect(html).toContain('引擎身份行齐备')
    expect(html).not.toContain('delegate-identity-missing')
    expect(html).toContain('engine_bin_source=official-bundle')
    expect(html).toContain('RESULT exit=0')
    expect(html).toContain('session 模型已设置：GLM-5.3')
  })

  it('身份行缺失：红横幅标 delegate-identity-missing（禁放行式呈现）', () => {
    const html = delegateEvidenceBlock(LOG_WITHOUT_IDENTITY)
    expect(html).toContain('delegate-identity-missing')
    expect(html).not.toContain('引擎身份行齐备')
  })

  it('空日志：同样判身份缺失（空≠证据在位）', () => {
    const html = delegateEvidenceBlock('')
    expect(html).toContain('delegate-identity-missing')
  })

  it('宿主路径脱敏：/Users 与 /Volumes 不入呈现面', () => {
    const html = delegateEvidenceBlock(FULL_LOG.replace('/tmp/ws', '/Users/someone/ws'))
    expect(html).not.toMatch(/\/Users\/[A-Za-z0-9_.-]+/)
    expect(html).toContain('[宿主家目录]')
  })
})
