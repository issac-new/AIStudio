// overlay/browsersec 域：浏览器安全层（antigravity §四 P1-5 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（浏览器安全层：URL allowlist/denylist+独立 Chrome profile）：
// 代理驱动浏览器的准入——**denylist 优先**（deny 命中即拒——比 allow 更高优先级），
// allowlist 白名单域（空=不限），**独立 profile**（浏览器会话用独立 profile 不混用户
// 身份——antigravity 独立 Chrome profile 语义）。衔接 402 审批域（deny→ask→allow 同族）。
export interface BrowserPolicy {
  allowlist: string[]
  denylist: string[]
  /** 独立 profile（antigravity：不混用户身份）。 */
  isolatedProfile: boolean
}

export type BrowserVerdict = 'deny' | 'allow'

export interface BrowserDecision {
  verdict: BrowserVerdict
  reason: string
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase()
}

/** URL 准入判定（denylist 优先于 allowlist——antigravity 语义）。 */
export function browserVerdict(url: string, policy: BrowserPolicy): BrowserDecision {
  const host = hostOf(url)
  if (policy.denylist.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) {
    return { verdict: 'deny', reason: 'denylist 命中（deny 优先于 allow）' }
  }
  if (policy.allowlist.length > 0 && !policy.allowlist.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) {
    return { verdict: 'deny', reason: 'allowlist 未含该域（白名单外）' }
  }
  return { verdict: 'allow', reason: policy.isolatedProfile ? '放行（独立 profile 隔离）' : '放行' }
}

/** 独立 profile 语义（antigravity：浏览器会话不混用户身份）。 */
export function profileIsolation(policy: BrowserPolicy): { isolated: boolean; detail: string } {
  return policy.isolatedProfile
    ? { isolated: true, detail: '独立 Chrome profile（用户身份隔离——antigravity 语义）' }
    : { isolated: false, detail: '共用 profile（注意：可能混用户身份）' }
}
