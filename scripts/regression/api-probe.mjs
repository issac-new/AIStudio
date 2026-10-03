// API 对照探针：以浏览器会话 token 查关键只读接口，双链对比。
// 用法：WALK_BASE=... node scripts/regression/api-probe.mjs '/api/studio/sessions' [...paths]
import { openBrowser, BASE } from './harness.mjs'

const paths = process.argv.slice(2)
const { browser, page } = await openBrowser()
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
      const r = await fetch(path, { headers })
      const text = await r.text()
      let count = -1; let ids = ''; try { const j = JSON.parse(text); count = Array.isArray(j.sessions) ? j.sessions.length : -2; ids = j.sessions.slice(0, 8).map(x => x.id).join(',') } catch {}
      return { status: r.status, body: 'count=' + count + ' ids=' + ids, lsKeys: keys, profile: localStorage.getItem('hermes_active_profile_name') }
    }, p)
    console.log(`\n== ${BASE}${p} → ${res.status}`)
    console.log(res.body)
    console.log('profileHeader=' + res.profile)
    if (p === paths[0]) console.log('localStorage keys: ' + JSON.stringify(res.lsKeys))
  }
} finally {
  await browser.close()
}
