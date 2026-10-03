import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
await bootApp(page)
await clearMasks(page)
const probe = await page.evaluate(() => {
  const out = {}
  const railLink = [...document.querySelectorAll('a')].find(e => (e.getAttribute('aria-label') || '').includes('API 中继') || (e.href || '').includes('apikey'))
  out.railRelay = railLink ? (railLink.getAttribute('aria-label') || '') + ' | ' + railLink.href : 'not-found'
  out.colHead = [...document.querySelectorAll('[class*=flow-nav__head]')].map(e => e.textContent.trim())[0] || 'not-found'
  out.agentsHead = [...document.querySelectorAll('*')].filter(e => e.children.length <= 1 && /智能体/.test(e.textContent || '') && e.getBoundingClientRect().x < 350 && e.getBoundingClientRect().y > 300).map(e => e.textContent.trim()).slice(0, 2)
  return out
})
console.log('LABELS=', JSON.stringify(probe, null, 1))
await page.screenshot({ path: '/tmp/regression-shots/ux-labels.png' })
await browser.close()
