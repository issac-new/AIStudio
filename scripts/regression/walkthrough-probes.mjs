export function isBlankContent({ contentLen, hasVisual, loading }) {
  return Boolean(loading) || (contentLen < 40 && !hasVisual)
}

export function routeReached(current, expected, kind) {
  if (!current) return false
  return kind === 'redirect' ? current !== expected : current === expected
}

export function routeSettled({ current, browser, expected, kind = 'page', allowCanonical = false, allowQuery = false }) {
  if (!current || !browser) return false
  const normalize = value => allowQuery ? value.split('?')[0] : value
  current = normalize(current)
  browser = normalize(browser)
  expected = normalize(expected)
  if (kind === 'redirect') return current !== expected && browser !== expected
  if (allowCanonical) {
    return (current === expected && browser === expected) || (current !== expected && browser !== expected)
  }
  return current === expected && browser === expected
}

function pageRouteKey(url) {
  const hash = String(url || '').split('#')[1]
  return (hash || String(url || '')).split('?')[0]
}

export function isLateRequest({ origin, pageAtResponse }) {
  if (!origin || !pageAtResponse) return false
  return pageRouteKey(origin) !== pageRouteKey(pageAtResponse)
}
