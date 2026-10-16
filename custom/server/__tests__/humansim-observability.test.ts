/**
 * humansim+observability 纯函数面单测（PR-0 配套守门）。
 * 覆盖：发送校验四则/审计行构造/state 解析/闸与步键筛选/台账摘要（含 open 计数与
 * 重复键取首行语义）。端点 koa 层挂载走 B 类 patch（部署窗口），此处守纯函数契约。
 */
import { describe, expect, it } from 'vitest'
import { auditLine, validateSend } from '../humansim/humansim-controller'
import { gateKeys, ledgerSummary, parseStateEnv, stepKeys } from '../observability/observability-controller'

describe('humansim validateSend', () => {
  const ok = { as: 'fanfan', room: '!abc:matrix.test', body: 'G5 批准：通过', kind: 'approval' }
  it('合法请求过', () => expect(validateSend(ok).ok).toBe(true))
  it('账号 localpart 非法拒', () => expect(validateSend({ ...ok, as: 'a b/c' }).ok).toBe(false))
  it('房间 ID 非完整形拒', () => expect(validateSend({ ...ok, room: 'abc' }).ok).toBe(false))
  it('空正文拒/超长拒', () => {
    expect(validateSend({ ...ok, body: '  ' }).ok).toBe(false)
    expect(validateSend({ ...ok, body: 'x'.repeat(4001) }).ok).toBe(false)
  })
  it('kind 越枚举拒', () => expect(validateSend({ ...ok, kind: 'spam' }).ok).toBe(false))
  it('审计行是合法 ndjson 且含摘要', () => {
    const line = auditLine(ok, '$ev1', '2026-10-15T00:00:00Z')
    const obj = JSON.parse(line)
    expect(obj.as).toBe('fanfan'); expect(obj.kind).toBe('approval'); expect(obj.eventId).toBe('$ev1')
  })
})

describe('observability 纯函数', () => {
  const env = ['posture=standard', 'g2_arch_pass=1792030714', 'security_review_done=1', 'report_done=', 'analysis_done=1', 'analysis_done=2', 'room_analysis=!r:x']
  it('state 解析+重复键取首行', () => {
    const s = parseStateEnv(env.join('\n'))
    expect(s.posture).toBe('standard'); expect(s.analysis_done).toBe('1')
  })
  it('闸键筛选含 report_done 排除步键', () => {
    const g = gateKeys(parseStateEnv(env.join('\n')))
    expect(g.g2_arch_pass).toBeDefined(); expect(g.report_done).toBeDefined()
    expect(g.analysis_done).toBeUndefined()
  })
  it('步键筛选排除闸键族', () => {
    const st = stepKeys(parseStateEnv(env.join('\n')))
    expect(st.analysis_done).toBe('1'); expect(st.security_review_done).toBeUndefined()
  })

  it('步键加法扩展：§3.3 两键纳入，缺席不造键（2026-10-16 B2 消费发现）', () => {
    const st = stepKeys(parseStateEnv(env.join('\n')))
    expect(st.room_analysis).toBe('!r:x')
    expect(st.dispatch_marker).toBeUndefined()
  })
  it('台账摘要计数与 open', () => {
    const tsv = ['id\tts\ttype\tdefect\tdetail\tstatus\tres',
      'c1\tt1\tnudge\tPR-3\ta\topen\t', 'c2\tt2\tnudge\tPR-3\tb\tresolve\tfix',
      'c3\tt3\tauto-approve\tPR-2\tc\topen\t'].join('\n')
    const s = ledgerSummary(tsv)
    expect(s.total).toBe(3); expect(s.open).toBe(2); expect(s.byType.nudge).toBe(2)
  })
  it('空台账零计数', () => expect(ledgerSummary('id\tts\ttype\tdefect\tdetail\tstatus\tres')).toEqual({ total: 0, open: 0, byType: {} }))
})
