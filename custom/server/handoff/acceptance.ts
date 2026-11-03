// overlay/handoff 域：确定性验收断言（DeerFlow acceptance_checks 吸收轮 2026-11-03）。
//
// 来源：DeerFlow 2.0 的 L2 验证层（`subagents/acceptance_checks.py`，RFC #4651 PR4）——
// 统筹者把 acceptance_criteria 挂到委派上，**在代码里判定可判定项**：文件存在/大小/可读、
// `tests_passed: <命令>` 与记录的 bash 执行对账；**不可判定条目落 unchecked 且 all_hold=false**
// （宁可判「没验成」也不放行）。我方此前只有 delivery-contract 的「证据形态是否在档」粗判，
// 缺「一条一条判」的粒度。
//
// 本模块分两层：
//   ① 纯判定 `checkAcceptance`：输入「断言列表 + 观察到的证据」，不读盘——调用方（kanban 列
//      契约、qgate、harness 端点）把自己观测到的证据送来即可；
//   ② 探针 `probeArtifacts`：在**允许根**内实测文件存在/大小/尾部内容，供端点组装证据。
// 两条纪律：路径必须在允许根内（含 realpath 防符号链接逃逸）；不可判定就如实标 unchecked。

export const ACCEPTANCE_FAMILIES = [
  'file_exists',
  'file_readable',
  'file_min_bytes',
  'file_contains',
  'command_ok',
  'test_passed',
] as const
export type AcceptanceFamily = (typeof ACCEPTANCE_FAMILIES)[number]

export interface ArtifactObservation {
  path: string
  exists?: boolean
  readable?: boolean
  size?: number
  /** 内容尾部（用于 file_contains；调用方截断到合理长度）。 */
  contentTail?: string
}

export interface CommandRecord {
  command: string
  exitCode: number
  /** 输出尾部（判断 test_passed 的摘要行用）。 */
  stdoutTail?: string
}

export interface AcceptanceEvidence {
  artifacts?: ArtifactObservation[]
  commands?: CommandRecord[]
}

export interface AcceptanceLeaf {
  criterion: string
  family: AcceptanceFamily | 'undecidable'
  checked: boolean
  holds: boolean
  detail: string
}

export interface AcceptanceVerdict {
  /** 有没有可用断言（无断言时 applicable=false，调用方不该盖章）。 */
  applicable: boolean
  leaves: AcceptanceLeaf[]
  unchecked: string[]
  allHold: boolean
  note: string
}

/** 单条断言的语法：`family: 参数`。解析失败=不可判定（不猜）。 */
export interface ParsedCriterion {
  family: AcceptanceFamily
  path?: string
  bytes?: number
  text?: string
  command?: string
}

const FAMILY_RE = new RegExp(`^(${ACCEPTANCE_FAMILIES.join('|')})\\s*:\\s*(.+)$`)

export function parseCriterion(raw: string): ParsedCriterion | null {
  const m = FAMILY_RE.exec(String(raw ?? '').trim())
  if (!m) return null
  const family = m[1] as AcceptanceFamily
  const rest = m[2].trim()
  if (!rest) return null
  if (family === 'file_min_bytes') {
    const mm = /^(.+?)\s+(\d+)$/.exec(rest)
    if (!mm) return null
    return { family, path: mm[1].trim(), bytes: Number(mm[2]) }
  }
  if (family === 'file_contains') {
    const idx = rest.indexOf(' ')
    if (idx <= 0) return null
    return { family, path: rest.slice(0, idx).trim(), text: rest.slice(idx + 1) }
  }
  if (family === 'command_ok' || family === 'test_passed') return { family, command: rest }
  return { family, path: rest }
}

/** 测试摘要判定：退出码 0 且输出里出现过「N passed / PASS / ok / SUCCESS」类摘要。 */
export function looksLikePassingTestSummary(stdoutTail: string | undefined): boolean {
  const s = String(stdoutTail ?? '')
  if (!s) return false
  return /\b(\d+)\s+passed\b/i.test(s) || /\bPASS(ED)?\b/.test(s) || /^ok\s+\S+/m.test(s) || /\bSUCCESS\b/.test(s)
}

function artifactOf(evidence: AcceptanceEvidence, path: string): ArtifactObservation | null {
  return (evidence.artifacts ?? []).find((a) => a.path === path) ?? null
}

/**
 * 逐条判定（纯函数）。判定纪律：
 *   · 断言无法解析 / 证据里没有对应观察 → `checked:false, holds:false`，并进 unchecked；
 *   · `file_readable` 需要明确 readable===true；`file_exists` 只看 exists；
 *   · `command_ok` 要求命令精确匹配且 exitCode===0；
 *   · `test_passed` 在 command_ok 基础上还要求摘要行（防「跑了个啥都没输出的命令」冒充过测）；
 *   · `allHold` 只在**所有条目都 checked 且 holds** 时为真——有一条没判就整体不放行。
 */
export function checkAcceptance(criteria: string[], evidence: AcceptanceEvidence = {}): AcceptanceVerdict {
  const list = (criteria ?? []).map((c) => String(c ?? '').trim()).filter(Boolean)
  if (list.length === 0) {
    return { applicable: false, leaves: [], unchecked: [], allHold: false, note: '无验收断言：不盖章（不猜通过）' }
  }
  const leaves: AcceptanceLeaf[] = list.map((criterion) => {
    const parsed = parseCriterion(criterion)
    if (!parsed) {
      return { criterion, family: 'undecidable', checked: false, holds: false, detail: '断言语法不可解析（不可判定）' }
    }
    switch (parsed.family) {
      case 'file_exists': {
        const a = artifactOf(evidence, parsed.path!)
        if (!a || a.exists == null) return { criterion, family: parsed.family, checked: false, holds: false, detail: `未观测到 ${parsed.path}（缺证据）` }
        return { criterion, family: parsed.family, checked: true, holds: a.exists === true, detail: `exists=${a.exists}` }
      }
      case 'file_readable': {
        const a = artifactOf(evidence, parsed.path!)
        if (!a || a.readable == null) return { criterion, family: parsed.family, checked: false, holds: false, detail: `未观测可读性 ${parsed.path}` }
        return { criterion, family: parsed.family, checked: true, holds: a.readable === true, detail: `readable=${a.readable}` }
      }
      case 'file_min_bytes': {
        const a = artifactOf(evidence, parsed.path!)
        if (!a || typeof a.size !== 'number') return { criterion, family: parsed.family, checked: false, holds: false, detail: `未观测大小 ${parsed.path}` }
        return {
          criterion,
          family: parsed.family,
          checked: true,
          holds: a.size >= parsed.bytes!,
          detail: `size=${a.size} 阈值=${parsed.bytes}`,
        }
      }
      case 'file_contains': {
        const a = artifactOf(evidence, parsed.path!)
        if (!a || typeof a.contentTail !== 'string') return { criterion, family: parsed.family, checked: false, holds: false, detail: `未观测内容 ${parsed.path}` }
        return {
          criterion,
          family: parsed.family,
          checked: true,
          holds: a.contentTail.includes(parsed.text!),
          detail: `尾部${a.contentTail.includes(parsed.text!) ? '含' : '不含'}目标文本`,
        }
      }
      case 'command_ok':
      case 'test_passed': {
        const rec = (evidence.commands ?? []).find((c) => c.command === parsed.command)
        if (!rec) return { criterion, family: parsed.family, checked: false, holds: false, detail: `未观测命令执行：${parsed.command}` }
        const exitOk = rec.exitCode === 0
        if (parsed.family === 'command_ok') {
          return { criterion, family: parsed.family, checked: true, holds: exitOk, detail: `exit=${rec.exitCode}` }
        }
        const summaryOk = looksLikePassingTestSummary(rec.stdoutTail)
        return {
          criterion,
          family: parsed.family,
          checked: true,
          holds: exitOk && summaryOk,
          detail: `exit=${rec.exitCode} 摘要${summaryOk ? '命中' : '未命中'}`,
        }
      }
      default:
        return { criterion, family: 'undecidable', checked: false, holds: false, detail: '不可判定' }
    }
  })
  const unchecked = leaves.filter((l) => !l.checked).map((l) => l.criterion)
  const allHold = leaves.every((l) => l.checked && l.holds)
  return {
    applicable: true,
    leaves,
    unchecked,
    allHold,
    note: allHold
      ? `${leaves.length} 条断言全部可判定且成立`
      : `${unchecked.length} 条不可判定 / ${leaves.filter((l) => l.checked && !l.holds).length} 条不成立——整体不放行（不可判定不等于通过）`,
  }
}

// ── 探针（IO 层）：在允许根内实测文件观测 ─────────────────────────────

export interface ProbeOptions {
  /** 允许根（绝对路径）；root 必须落在其中之一内。 */
  allowedRoots: string[]
  /** 读取内容尾部的字节数上限（用于 file_contains）。 */
  tailBytes?: number
}

export interface ProbeResult {
  artifacts: ArtifactObservation[]
  problems: string[]
}

/**
 * 在 root 下实测 paths 的存在/可读/大小/尾部内容。
 * 安全：拒绝 `..`、拒绝绝对路径逃逸、realpath 后再核一次（符号链接不能绕过）；
 * 单文件读取有上限（默认 64KB 尾部），不做全文加载。
 */
export function probeArtifacts(root: string, paths: string[], options: ProbeOptions): ProbeResult {
  // 延迟 require：本模块的纯函数部分要能在无 fs 场景（前端类型共享/测试）下被引用
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const rootAbs = path.resolve(root)
  const allowed = options.allowedRoots.map((r) => path.resolve(r))
  const problems: string[] = []
  if (!allowed.some((a) => rootAbs === a || rootAbs.startsWith(a + path.sep))) {
    return { artifacts: [], problems: [`root 不在允许根内：${rootAbs}（允许：${allowed.join('、')}）`] }
  }
  let realRoot: string
  try {
    realRoot = fs.realpathSync(rootAbs)
  } catch {
    return { artifacts: [], problems: [`root 不存在或不可解析：${rootAbs}`] }
  }
  const tailBytes = Math.max(1, Math.min(64 * 1024, options.tailBytes ?? 4096))
  const artifacts: ArtifactObservation[] = []
  for (const raw of paths) {
    const rel = String(raw ?? '').trim()
    if (!rel) {
      problems.push('空路径')
      continue
    }
    if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
      problems.push(`非法路径（绝对路径或含 ..）：${rel}`)
      artifacts.push({ path: rel, exists: false })
      continue
    }
    const abs = path.resolve(realRoot, rel)
    if (abs !== realRoot && !abs.startsWith(realRoot + path.sep)) {
      problems.push(`路径越出 root：${rel}`)
      artifacts.push({ path: rel, exists: false })
      continue
    }
    let exists = false
    let readable = false
    let size: number | undefined
    let contentTail: string | undefined
    try {
      const st = fs.statSync(abs)
      exists = true
      size = st.size
      if (st.isFile() && st.size > 0) {
        const fd = fs.openSync(abs, 'r')
        try {
          const start = Math.max(0, st.size - tailBytes)
          const buf = Buffer.alloc(Math.min(tailBytes, st.size))
          fs.readSync(fd, buf, 0, buf.length, start)
          contentTail = buf.toString('utf8')
          readable = true
        } finally {
          fs.closeSync(fd)
        }
      } else if (st.isFile()) {
        readable = true
        contentTail = ''
      }
      // realpath 复核：符号链接若指向 root 外则判为逃逸
      const real = fs.realpathSync(abs)
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        problems.push(`符号链接逃出 root：${rel}`)
        artifacts.push({ path: rel, exists: false, readable: false })
        continue
      }
    } catch {
      /* 不存在或不可读：按观测结果如实记录 */
    }
    artifacts.push({ path: rel, exists, readable, ...(size != null ? { size } : {}), ...(contentTail != null ? { contentTail } : {}) })
  }
  return { artifacts, problems }
}
