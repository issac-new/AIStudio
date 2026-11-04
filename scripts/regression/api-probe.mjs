// API 对照探针：以浏览器会话 token 查关键只读接口，双链对比＋判定行。
// 用法：WALK_BASE=... node scripts/regression/api-probe.mjs '/api/studio/sessions' [...paths]
// 判定口径（2026-11-04 Windows 离线回归批固化）：每接口输出 [expected/PASS/WARN/FAIL]，
// 规则表在 api-expected.mjs（expected=角色门/fail-closed/负向 404/离线依赖/输入校验，
// FAIL=非预期 5xx/4xx，WARN=>5s）；退出码 1=存在 FAIL。
import { openBrowser, BASE } from './harness.mjs'
import { judgeApi, summarizeJudgements } from './api-expected.mjs'

const paths = process.argv.slice(2)
const { browser, page } = await openBrowser()
const judgements = []
try {
  await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  for (const p of paths) {
    const res = await page.evaluate(async (path) => {
      const token = localStorage.getItem('hermes_api_key') || ''
      const profile = localStorage.getItem('hermes_active_profile_name') || ''
      const keys = Object.keys(localStorage)
      const headers = {}
      if (token) headers.Authorization = `Bearer ${token}`
      if (profile) headers['X-Hermes-Profile'] = profile
      const startedAt = performance.now()
      const r = await fetch(path, { headers })
      const text = await r.text()
      const ms = Math.round(performance.now() - startedAt)
      let count = -1; let ids = ''; try { const j = JSON.parse(text); count = Array.isArray(j.sessions) ? j.sessions.length : -2; ids = j.sessions.slice(0, 8).map(x => x.id).join(',') } catch {}
      return { status: r.status, ms, body: 'count=' + count + ' ids=' + ids, lsKeys: keys, profile: localStorage.getItem('hermes_active_profile_name') }
    }, p)
    const judged = judgeApi({ url: p, status: res.status, ms: res.ms })
    judgements.push(judged)
    console.log(`\n== ${BASE}${p} → ${res.status} (${res.ms}ms) [${judged.verdict}${judged.expect ? `:${judged.expect}` : ''}]`)
    if (judged.note) console.log(`   note: ${judged.note}`)
    console.log(res.body)
    console.log('profileHeader=' + res.profile)
    if (p === paths[0]) console.log('localStorage keys: ' + JSON.stringify(res.lsKeys))
  }
} finally {
  await browser.close()
}
const summary = summarizeJudgements(judgements)
console.log(`\n[API JUDGE] total=${summary.total} expected=${summary.expected} pass=${summary.pass} warn=${summary.warn} fail=${summary.fail}`)
if (!summary.ok) process.exitCode = 1
