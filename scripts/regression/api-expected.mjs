// API 回归判定口径（2026-11-04 Windows 离线回归批固化，spec 2026-11-04-win-regression-p1-fixes）。
// 三档判定（Windows 回归报告「九、复测方法」口径）：
//   expected —— 设计内失败，不计 FAIL：角色门 401/403、fail-closed 503、负向用例 404、
//               离线外部依赖 5xx、输入校验 400/405（用例缺参/方法错）。
//   FAIL    —— 非预期 5xx/4xx（页面会坏）。
//   WARN    —— 可达但耗时 > SLOW_MS（慢，需性能面跟进；文案不友好由调用方另行判定）。
// 零依赖纯函数：Windows 侧回归脚本可直接复制本文件复用（判定规则与状态码就地同源）。
export const API_SLOW_MS = 5000

/** expected 分类规则表：pattern 匹配 API 路径（不含 query）且 status 命中即 expected。
 *  expect 类别与 route-manifest 的 EXPECT_BY_NAME 四类对齐，另加 validation 归
 *  「探测用例自身错误」（报告三：405 方法错/缺参 400），同属不计 FAIL。 */
export const EXPECTED_API_RULES = [
  // 角色门：仅 super_admin（回归三：agents/status、ekko 运维区、performance/runtime、locked-ips）
  { expect: 'roleGate', statuses: [401, 403], pattern: /^\/api\/(auth\/locked-ips|agents\/status|ekko\/(config|memory|skills|mcp\/servers)|studio\/performance\/runtime)/, note: '仅 super_admin' },
  // fail-closed：环境变量未配置（ORGLOOP_LEDGER_TSV / OBS_SIM_ROOT）
  { expect: 'failClosed', statuses: [503], pattern: /^\/api\/hermes\/(sim|orgloop)\//, note: '未配置 fail-closed 门' },
  // 负向用例：占位资源/不存在资源 404 为正确语义（回归二-6 __missing__ 族）
  { expect: 'negative404', statuses: [404], pattern: /(walkthrough-missing|__missing__|\/1\/[^/]+$)/, note: '负向用例占位资源' },
  // 注册表未建（fail-soft null，2026-11-02 回归同判）
  { expect: 'negative404', statuses: [404], pattern: /^\/api\/governance\/registry\//, note: '注册表未建 fail-soft' },
  // 离线外部依赖：本机外网不可达时上游清单/公告/标签 5xx（回归三/四）
  { expect: 'offline', statuses: [500, 502], pattern: /^\/api\/studio\/(announcements|petdex\/manifest|update\/preview\/tags)/, note: '外部依赖不可达（离线环境预期）' },
  // 输入校验：探测用例缺参/方法错（回归三：films/start 400、config/providers 405）
  { expect: 'validation', statuses: [400, 405], pattern: /^\/api\/(studio\/films\/start|hermes\/config\/providers)/, note: '探测用例缺参/方法错（用例侧修正）' },
]

/** 归一 API 路径：容忍完整 URL，剥 origin/query/hash，返回 pathname。 */
export function normalizeApiPath(input) {
  const raw = String(input || '')
  try {
    return new URL(raw).pathname
  } catch {
    return raw.split('?')[0].split('#')[0]
  }
}

/** 单接口判定。入参 { url|path, status, ms?, method? } →
 *  { verdict: 'expected'|'PASS'|'WARN'|'FAIL', expect?, note?, path, status } */
export function judgeApi({ url, path, status, ms, method = 'GET' }) {
  const apiPath = normalizeApiPath(url ?? path)
  const st = Number(status)
  const rule = EXPECTED_API_RULES.find(r => r.pattern.test(apiPath) && r.statuses.includes(st))
  if (rule) return { verdict: 'expected', expect: rule.expect, note: rule.note, path: apiPath, status: st, method }
  if (st >= 400) return { verdict: 'FAIL', note: `非预期 ${st}`, path: apiPath, status: st, method }
  if (typeof ms === 'number' && ms > API_SLOW_MS) return { verdict: 'WARN', note: `${Math.round(ms)}ms > ${API_SLOW_MS}ms`, path: apiPath, status: st, method }
  return { verdict: 'PASS', path: apiPath, status: st, method }
}

/** 批量判定汇总：{ total, expected, pass, warn, fail, ok }，ok=无 FAIL。 */
export function summarizeJudgements(judgements) {
  const by = v => judgements.filter(j => j.verdict === v).length
  const fail = by('FAIL'); const expected = by('expected'); const warn = by('WARN'); const pass = by('PASS')
  return { total: judgements.length, expected, pass, warn, fail, ok: fail === 0 }
}
