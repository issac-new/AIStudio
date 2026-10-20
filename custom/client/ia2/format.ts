// overlay/custom/client/ia2/format.ts
// 日常/推演共用的“人话格式化”单一事实源。技术枚举和原始时间戳仍保留在
// title/原始 JSON 里，首屏只给人可读文案；不要在组件里再散落第二套映射。
const ENUM_LABELS: Record<string, string> = {
  strict: '严格',
  standard: '标准',
  demo: '演示',
  pass: '通过',
  conditional: '有条件通过',
  reject: '不通过',
  fail: '不通过',
  important: '重要',
  nit: '建议',
  preexisting: '历史存量',
  lite: '轻量',
  compliance: '合规',
  event: '事件',
  commit: '提交',
  card: '任务卡',
  room: '房间',
  open: '待处理',
  waived: '已豁免',
  resolved: '已处理',
  approved: '已批准',
  rejected: '已打回',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  paused: '已暂停',
  unknown: '未知',
}

const STAGE_NAMES = ['', '搭建', '需求', '分析设计', '开发', '验收', '治理'] as const

function pad2(n: number): string { return String(n).padStart(2, '0') }

/** 枚举/阶段号 → 中文；未知值原样保留，绝不猜一个“正常”。 */
export function humanEnum(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const raw = String(value)
  if (/^p[1-6]$/i.test(raw)) return STAGE_NAMES[Number(raw.slice(1))]
  return ENUM_LABELS[raw] ?? raw
}

/** ISO/epoch(s|ms)/Date → YYYY-MM-DD HH:mm；无效值返回原文。 */
export function humanDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  const d = value instanceof Date ? value
    : Number.isFinite(n) && n > 0 ? new Date(n < 1e12 ? n * 1000 : n)
    : new Date(value)
  const time = d.getTime()
  if (!Number.isFinite(time)) return String(value)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 长路径只显示末两段；完整路径由调用方放 title。 */
export function shortPath(value: string | null | undefined, segments = 2): string {
  const parts = String(value ?? '').split('/').filter(Boolean)
  return parts.length ? parts.slice(-segments).join('/') : '—'
}

/** snake_case/camelCase → 中文标签式字段名；技术词保留原样。 */
const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  run: '运行',
  runId: '运行 ID',
  ts: '时间',
  actor: '操作人',
  action: '动作',
  state: '状态',
  status: '状态',
  verdict: '判定',
  posture: '模式',
  severity: '级别',
  tier: '分层',
  type: '类型',
  evidence: '证据',
  source: '来源',
  target: '目标',
  note: '备注',
  reason: '原因',
  result: '结果',
  branch: '分支',
}
export function humanField(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/[_-]+/g, ' ')
}

/** 递归把 JSON 原文压平成可读字段；对象/数组仍折叠为 JSON 字符串。 */
export function jsonEntries(raw: string | null | undefined): Array<{ key: string; value: string }> {
  if (!raw) return []
  try {
    const obj = JSON.parse(raw) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return [{ key: '内容', value: Array.isArray(obj) ? JSON.stringify(obj) : String(obj) }]
    }
    return Object.entries(obj as Record<string, unknown>).map(([k, v]) => ({
      key: humanField(k),
      value: typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—'),
    }))
  } catch {
    return [{ key: '原文', value: raw }]
  }
}
