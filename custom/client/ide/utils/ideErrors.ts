// overlay/custom/client/ide/utils/ideErrors.ts
// IDE 面板统一错误分级：状态码/网络错误 → 人话文案 + 级别。
//
// 2026-10-18 回归暴露三种裸错误：工作流页签 http_401、引擎 ECONNREFUSED、
// 草稿会话 404。逐面板写文案会漏，这里做唯一映射。

export type IdeErrorKind =
  | 'auth' | 'forbidden' | 'not-found' | 'unavailable'
  | 'timeout' | 'server' | 'network' | 'unknown'

export type IdeErrorSeverity = 'warn' | 'error'

export interface IdeErrorInfo {
  kind: IdeErrorKind
  message: string
  severity: IdeErrorSeverity
}

export function classifyIdeStatus(status: number): IdeErrorInfo {
  if (status === 401) return { kind: 'auth', message: '登录态失效，请重新登录', severity: 'error' }
  if (status === 403) return { kind: 'forbidden', message: '没有权限访问该资源', severity: 'warn' }
  if (status === 404) return { kind: 'not-found', message: '资源不存在', severity: 'warn' }
  if (status === 503) return { kind: 'unavailable', message: '依赖服务未启动或暂不可用', severity: 'warn' }
  if (status >= 500) return { kind: 'server', message: `服务端错误（HTTP ${status}）`, severity: 'error' }
  return { kind: 'unknown', message: `请求失败（HTTP ${status}）`, severity: 'error' }
}

export function ideErrorFrom(err: unknown, fallback = '请求失败'): IdeErrorInfo {
  const value = err as { status?: number; code?: string; message?: string; name?: string } | null
  const status = typeof value?.status === 'number' ? value.status : null
  if (status != null) return classifyIdeStatus(status)

  const message = String(value?.message ?? fallback)
  const embedded = message.match(/http_(\d{3})/i)
  if (embedded) return classifyIdeStatus(Number(embedded[1]))
  if (value?.name === 'AbortError' || /timeout|timed out|超时/i.test(message)) {
    return { kind: 'timeout', message: '请求超时，请稍后重试', severity: 'warn' }
  }
  if (/engine_unreachable|ECONNREFUSED|fetch failed/i.test(message)) {
    return { kind: 'unavailable', message: '依赖服务未启动（工作流引擎）', severity: 'warn' }
  }
  if (/not_a_repo/i.test(message) || value?.code === 'not_a_repo') {
    return { kind: 'not-found', message: '当前目录不是 Git 仓库', severity: 'warn' }
  }
  if (/network|Failed to fetch|ENOTFOUND|ECONNRESET/i.test(message)) {
    return { kind: 'network', message: '网络连接失败', severity: 'error' }
  }
  return { kind: 'unknown', message, severity: 'error' }
}

export function friendlyIdeError(err: unknown, fallback?: string): string {
  return ideErrorFrom(err, fallback).message
}
