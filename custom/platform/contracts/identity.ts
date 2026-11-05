export interface PlatformPrincipal {
  id: number | string
  username?: string
  role?: 'super_admin' | 'admin'
  status?: 'active' | 'disabled'
  profiles?: string[]
}

export function normalizeIssuerOrigin(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('unsupported issuer protocol')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('issuer must be an origin')
  }
  return url.origin
}

export function evaluateIdentityBinding(
  stored: { issuerOrigin: string | null; subject: string },
  presented: { issuerOrigin: string; subject: string },
): { allowed: true } | { allowed: false; code: string } {
  if (stored.subject !== presented.subject) {
    return { allowed: false, code: 'MATRIX_IDENTITY_NOT_FOUND' }
  }
  if (!stored.issuerOrigin) {
    return { allowed: false, code: 'MATRIX_IDENTITY_ORIGIN_UNBOUND' }
  }
  return normalizeIssuerOrigin(stored.issuerOrigin) === presented.issuerOrigin
    ? { allowed: true }
    : { allowed: false, code: 'MATRIX_IDENTITY_CONFLICT' }
}
