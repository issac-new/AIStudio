// overlay/custom/client/ide/utils/ideErrors.ts
// IDE 面板统一错误分级：状态码/网络错误 → 人话文案 + 级别。
//
// 2026-10-18 回归暴露三种裸错误：工作流页签 http_401、引擎 ECONNREFUSED、
// 草稿会话 404。逐面板写文案会漏，这里做唯一映射。
// 2026-10-18 立查立改：文案中英对照（locale 参数缺省 zh），表在 ide/i18n.ts。

import { IDE_LOCAL_TEXT, type IdeLocale } from '../i18n'

export type IdeErrorKind =
  | 'auth' | 'forbidden' | 'not-found' | 'unavailable'
  | 'timeout' | 'server' | 'network' | 'unknown'

export type IdeErrorSeverity = 'warn' | 'error'

export interface IdeErrorInfo {
  kind: IdeErrorKind
  message: string
  severity: IdeErrorSeverity
}

export type IdeErrorLocale = IdeLocale | unknown

function table(locale: IdeErrorLocale) {
  return IDE_LOCAL_TEXT[String(locale) === 'en' ? 'en' : 'zh'].errors
}

export function classifyIdeStatus(status: number, locale: IdeErrorLocale = 'zh'): IdeErrorInfo {
  const t = table(locale)
  if (status === 401) return { kind: 'auth', message: t.auth, severity: 'error' }
  if (status === 403) return { kind: 'forbidden', message: t.forbidden, severity: 'warn' }
  if (status === 404) return { kind: 'not-found', message: t.notFound, severity: 'warn' }
  if (status === 503) return { kind: 'unavailable', message: t.unavailable, severity: 'warn' }
  if (status >= 500) return { kind: 'server', message: t.server(status), severity: 'error' }
  return { kind: 'unknown', message: t.generic(status), severity: 'error' }
}

export function ideErrorFrom(err: unknown, fallback?: string, locale: IdeErrorLocale = 'zh'): IdeErrorInfo {
  const t = table(locale)
  const value = err as { status?: number; code?: string; message?: string; name?: string } | null
  const status = typeof value?.status === 'number' ? value.status : null
  if (status != null) return classifyIdeStatus(status, locale)

  const message = String(value?.message ?? fallback ?? t.fallback)
  const embedded = message.match(/http_(\d{3})/i)
  if (embedded) return classifyIdeStatus(Number(embedded[1]), locale)
  if (value?.name === 'AbortError' || /timeout|timed out|超时/i.test(message)) {
    return { kind: 'timeout', message: t.timeout, severity: 'warn' }
  }
  if (/engine_unreachable|ECONNREFUSED|fetch failed/i.test(message)) {
    return { kind: 'unavailable', message: t.engineOffline, severity: 'warn' }
  }
  if (/not_a_repo/i.test(message) || value?.code === 'not_a_repo') {
    return { kind: 'not-found', message: t.notRepo, severity: 'warn' }
  }
  if (/network|Failed to fetch|ENOTFOUND|ECONNRESET/i.test(message)) {
    return { kind: 'network', message: t.network, severity: 'error' }
  }
  return { kind: 'unknown', message, severity: 'error' }
}

export function friendlyIdeError(err: unknown, fallback?: string, locale: IdeErrorLocale = 'zh'): string {
  return ideErrorFrom(err, fallback, locale).message
}
