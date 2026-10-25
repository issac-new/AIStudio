import { ensureDesktopAuthReady, getActiveProfileName, getApiKey, getBaseUrlValue } from '../client'

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeProfile(profile?: string | null): string | null {
  const value = typeof profile === 'string' ? profile.trim() : ''
  return value || null
}

function hasConventionalExtension(value: string): boolean {
  return /\.[A-Za-z0-9]{1,12}$/.test(value.trim())
}

function extractDownloadPath(filePath: string): string {
  if (filePath.startsWith('/api/studio/files/download?')) {
    try {
      const parsed = new URL(filePath, 'http://localhost')
      return parsed.searchParams.get('path') || filePath
    } catch {
      return filePath
    }
  }

  return filePath.split('?')[0].split('#')[0]
}

function getPathBasename(filePath: string): string {
  const decodedPath = safeDecodeURIComponent(extractDownloadPath(filePath))
  return decodedPath.split(/[\\/]/).pop()?.trim() || ''
}

export function inferDownloadFileName(filePath: string, fileName?: string): string {
  const decodedName = fileName ? safeDecodeURIComponent(fileName).trim() : ''
  if (decodedName && hasConventionalExtension(decodedName)) return decodedName

  const basename = getPathBasename(filePath)
  if (basename && hasConventionalExtension(basename)) return basename

  return decodedName || basename || 'download'
}

/**
 * Construct a download URL with auth token as query parameter.
 * Token is passed via query param because <a> tags cannot set headers.
 */
export function getDownloadUrl(filePath: string, fileName?: string, profile?: string | null, root?: string): string {
  const base = getBaseUrlValue()

  // Guard: if filePath is already a full download URL, extract the real path
  // to prevent double-wrapping (/api/studio/files/download?path=/api/studio/files/download?path=...)
  if (filePath.startsWith('/api/studio/files/download?')) {
    try {
      const parsed = new URL(filePath, 'http://localhost')
      const realPath = parsed.searchParams.get('path')
      if (realPath) filePath = realPath
    } catch {
      // fall through with original filePath
    }
  }

  // Decode the path first in case it's already encoded (e.g., from AI responses)
  // URLSearchParams will encode it again, so we need to start with decoded text
  const decodedPath = safeDecodeURIComponent(filePath)
  const params = new URLSearchParams({ path: decodedPath })
  if (fileName) {
    const decodedName = inferDownloadFileName(decodedPath, fileName)
    params.set('name', decodedName)
  }
  const explicitProfile = normalizeProfile(profile)
  const profileName = profile === undefined ? getActiveProfileName() : explicitProfile
  if (profileName) params.set('profile', profileName)
  // workspaceRoot 模式：下载路径相对 root，缺 root 会在默认根下 404
  if (root) params.set('root', root)
  const token = getApiKey()
  if (token) params.set('token', token)
  return `${base}/api/studio/files/download?${params.toString()}`
}


/**
 * fetch 下载/预览路径：安全加固（SecNoQueryToken）后 query token 不再被服务端
 * 接受，且 token 出现在 URL 会泄露到日志/Referer。fetch 能带 header，故剥离
 * URL token 并改用 Authorization。
 */
function authenticatedRequest(url: string): { url: string; headers: Record<string, string> } {
  const [base, query = ''] = url.split('?')
  let nextUrl = url
  if (query) {
    const params = new URLSearchParams(query)
    params.delete('token')
    const rest = params.toString()
    nextUrl = rest ? `${base}?${rest}` : base
  }
  const token = getApiKey()
  return { url: nextUrl, headers: token ? { Authorization: `Bearer ${token}` } : {} }
}

/**
 * Download a file. Uses fetch to detect errors, then creates a blob URL
 * for the browser download. Throws with error message on failure.
 */
export async function downloadFile(filePath: string, fileName?: string, profile?: string | null, root?: string): Promise<void> {
  await ensureDesktopAuthReady()
  const request = authenticatedRequest(getDownloadUrl(filePath, fileName, profile, root))
  const res = await fetch(request.url, { headers: request.headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(body.error || `Download failed: ${res.status}`)
  }
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = inferDownloadFileName(filePath, fileName)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

/**
 * Get preview file content.
 * Throws with error message on failure.
 */
export async function fetchFileText(filePath: string, fileName?: string, profile?: string | null, root?: string): Promise<string> {
  await ensureDesktopAuthReady()
  const request = authenticatedRequest(getDownloadUrl(filePath, fileName, profile, root))
  const res = await fetch(request.url, { headers: request.headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(body.error || `Preview failed: ${res.status}`)
  }
  return res.text()
}
