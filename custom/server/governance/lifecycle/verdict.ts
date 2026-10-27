/**
 * 生命周期判词器（融合批一）——门禁判词语义唯一正本。
 *
 * 移植自 simharness mux/mx-scenario-lib.sh mx_text_gate_verdict（:1495）与
 * mux/uat_verdict.py：判词语义逐字迁移（run2 转述污染/f1979781 卡面自毒/run12
 * 模板字面三案归一、run22 复审轮注记剥离、末判词赢）；simharness 侧原 awk/py
 * 实现降级为兼容壳后退役（影子对照一致后删除）。characterization 语料双侧一致
 * 为退役判据，差异即缺陷。
 *
 * 语义要点（与原实现逐条对齐）：
 * - 成对行（同现 PASS 与 FAIL）：含「或/二选一」=协议模板或转述，整行弃；
 *   含「→/改判/修正」族=旧判词→新判词过渡叙述，取末 token；其余成对=语境不明保守弃。
 * - 单 token 行仅两种上下文可判：行首（前导仅格式符/编号），或紧邻结论锚点
 *   （锚点与 token 之间只允许格式符与可选为/是）。
 * - 多条结论行取最后一条（末判词赢，打回后复审 PASS 盖过前次 FAIL）。
 */

export type GateVerdict = 'PASS' | 'FAIL' | ''

/** 复审轮注记剥离（run22 复盘根治②）：只剥「（roundN…）」精确形态，任意括注不放宽。 */
const ROUND_NOTE_RES = [
  /[(（]round\d+，改判重报[)）]:?/g,
  /[(（]round\d+，改判[)）]:?/g,
  /[(（]round\d+，维持[)）]:?/g,
  /[(（]round\d+[)）]:?/g,
]

/** 行首前导白名单：格式符 + 可选编号（`1)` / `2.`）。 */
const LEADING_RE = /^[\s*_+>.#|~-]*(\d+[.)]\s*)?$/
/** 结论锚点：锚点词与判词之间只允许格式符与可选「为/是」（含全角冒号归一后）。 */
const ANCHOR_RE = /(结论行|结论|判词行|判词|conclusion|verdict|closing)[\s:=*_·「」<>#|~.-]*(为|是)?[\s:=*_·「」<>#|~.-]*$/
const PAIR_CHOICE_RE = /或|二选一/
const PAIR_TRANSITION_RE = /->|→|改判|改写|修正|覆写|已解决|已修复|已补/

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 单文本判词提取（多行，末判词赢）。gate 形如 'READY-GATE'/'ARCH-GATE'。 */
export function gateVerdictOfText(gate: string, text: string): GateVerdict {
  let last: GateVerdict = ''
  for (const rawLine of text.split('\n')) {
    let line = rawLine.replace(/：/g, ':')
    for (const re of ROUND_NOTE_RES) line = line.replace(re, '')
    const passTok = `${gate}-PASS`
    const failTok = `${gate}-FAIL`
    const hasP = line.includes(passTok)
    const hasF = line.includes(failTok)
    if (hasP && hasF) {
      if (PAIR_CHOICE_RE.test(line)) continue
      if (PAIR_TRANSITION_RE.test(line)) {
        const tokenRe = new RegExp(`${escapeRe(gate)}-(PASS|FAIL)`, 'g')
        let m: RegExpExecArray | null
        let v: GateVerdict = ''
        while ((m = tokenRe.exec(line)) !== null) v = m[1] as GateVerdict
        last = v
      }
      continue
    }
    if (!hasP && !hasF) continue
    const tok = hasP ? 'PASS' : 'FAIL'
    const pos = line.indexOf(`${gate}-${tok}`)
    const pre = line.slice(0, pos)
    if (LEADING_RE.test(pre)) { last = tok; continue }
    if (ANCHOR_RE.test(pre)) { last = tok; continue }
  }
  return last
}

/** 房间行 + 评审卡双源保守合并（原 mx_gate_verdict_combined 判定面，R-A2）：
 *  FAIL 任一出现即 FAIL；仅当无 FAIL 且任一 PASS 才 PASS。 */
export function combinedGateVerdict(sources: { room?: GateVerdict; card?: GateVerdict }): GateVerdict {
  const room = sources.room ?? ''
  const card = sources.card ?? ''
  if (room === 'FAIL' || card === 'FAIL') return 'FAIL'
  if (room === 'PASS' || card === 'PASS') return 'PASS'
  return ''
}

// ── UAT 逐 AC 判词（原 mux/uat_verdict.py，run2/run6 语义）──

export type UatVerdictWord = '通过' | '有条件通过' | '不通过' | '未见'

const UAT_VERDICT_ALT = '(有条件通过|不通过|未通过|通过|FAIL|PASS)'
const UAT_SEG_RE = new RegExp(`(AC-\\d+(?:[/、,及和 ]+AC-\\d+)*)[^。；;\\n]{0,40}?${UAT_VERDICT_ALT}`, 'g')
const FROZEN_AC_RE = /冻结\s*AC-(\d+)/
const UAT_NORM: Record<string, UatVerdictWord> = {
  有条件通过: '有条件通过', 不通过: '不通过', 未通过: '不通过',
  通过: '通过', FAIL: '不通过', PASS: '通过',
}

/** 证据正文按 AC 编号取判词。段共享/括号注耐受/冻结映射/整词/后段胜，未见=缺席如实。 */
export function uatVerdictFor(body: string, ac: string): UatVerdictWord {
  const own = new RegExp(`(?<!\\d)${escapeRe(ac)}(?!\\d)`)
  const num = ac.slice(3)
  let hit: UatVerdictWord = '未见'
  for (const line of body.split('\n')) {
    for (const m of line.matchAll(UAT_SEG_RE)) {
      if (own.test(m[1]) || FROZEN_AC_RE.exec(m[0])?.[1] === num) {
        hit = UAT_NORM[m[2]]
      }
    }
  }
  return hit
}

/** AC 覆盖缺号清单（原 uat_ac_covered 根治版：AC-1 不被 AC-10 子串误满足）。 */
export function coveredAcs(acList: string[], body: string): string[] {
  const missing: string[] = []
  for (const ac of acList) {
    if (!new RegExp(`(?<![\\dA-Za-z-])${escapeRe(ac)}(?!\\d)`).test(body)) missing.push(ac)
  }
  return missing
}
