// 文风检查器（v0.3.1，上游 lazyzhsh/quality-gate v1.27 WS-1/2/3 本地方言，MIT）：
// 确定性文风规则——长句/模糊词/多动作步骤，供 advisory 档 conventions 门与 CLI 消费。
// 纪律：确定性计数与字面量匹配，不理解语义；WS-3 为启发式（连接词少而动作多的情况
// 漏报，如实声明）。检查器自身失败＝error（fail-closed），零文件扫描＝error
// （零文件不构成符合规范的证据，与 ops scope-empty 同口径）。
// 代码块与行内代码不参与（路径/参数/字面量豁免）；表格逐单元格检查（不整表跳过）；
// findings 封顶 200 并显式标注截断；`qgate-style:example` 行标记豁免（规则样例与文档自引）。

export interface StyleFinding {
  rule: 'WS-1' | 'WS-2' | 'WS-3'
  file: string
  line: number
  detail: string
}

export interface StyleCheckResult {
  findings: StyleFinding[]
  truncated: boolean
  scannedFiles: number
  scannedChars: number
}

/** 模糊词表（W4，上游字面量词表原样）：命中即 finding——"适当处理/按需优化"类无判据表述。 */
const VAGUE_WORDS = ['适当处理', '按需优化', '酌情优化', '尽量保证', '后续完善'] as const

/** 多动作连接词（WS-3 启发式）：单列表行含 ≥2 个即多动作步骤。 */
const ACTION_CONNECTORS = ['然后', '接着', '同时', '并且'] as const

export const WS_DEFAULTS = { maxCnChars: 160, maxEnWords: 45, maxFindings: 200 }

/** 剥代码围栏与行内代码：```…``` 整块置空、`…` 置空（保留换行行号）。 */
function stripCode(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return ''
      }
      if (inFence) return ''
      // 行内代码（含多段）替换为等宽空位——不改变剩余文本的列位感，但长度参与豁免
      return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    })
    .join('\n')
}

/** 中文分句：按。！？；切（分号亦句界——长并列分号句同样难读）。 */
function cnSentences(text: string): string[] {
  return text.split(/[。！？；]/).map((s) => s.trim()).filter((s) => s.length > 0)
}

/** 英文句子：按 . ! ? 切（简单确定性规则，不做缩写消歧——声明边界）。 */
function enSentences(text: string): string[] {
  return text.split(/[.!?]+(\s|$)/).map((s) => s.trim()).filter((s) => s.length > 0)
}

const cnChar = (ch: string): boolean => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)

/** 检查单个已剥码文本片段（一个文件全文或一个单元格）。 */
export function checkText(
  stripped: string,
  file: string,
  lineOffset: number,
  opts: { maxCnChars: number; maxEnWords: number },
): StyleFinding[] {
  // 样例标记是行级豁免（非全文）：含 qgate-style:example 的行跳过，其余行照查
  //——全文级豁免会让样例行静默关掉整份文档的检查（吸收轮测试逮住）。
  const out: StyleFinding[] = []
  const lines = stripped.split('\n')
  let globalIdx = 0
  for (const [lineNo, rawLine] of lines.entries()) {
    if (rawLine.includes('qgate-style:example')) continue // 规则样例行豁免（文档自引不报）
    const line = rawLine
    // 表格行：逐单元格检查（| 分隔，首尾管道忽略）
    if (line.trim().startsWith('|') && line.trim().endsWith('|') && line.includes('|', 1)) {
      const cells = line.trim().slice(1, -1).split('|')
      for (const cell of cells) {
        const cn = cnSentences(cell)
        for (const sent of cn) {
          if ([...sent].filter(cnChar).length > opts.maxCnChars) {
            out.push({ rule: 'WS-1', file, line: lineOffset + lineNo, detail: `table cell cn sentence ${[...sent].filter(cnChar).length} chars > ${opts.maxCnChars}: ${sent.slice(0, 40)}…` })
          }
        }
        for (const w of VAGUE_WORDS) {
          if (cell.includes(w)) out.push({ rule: 'WS-2', file, line: lineOffset + lineNo, detail: `table cell vague word "${w}"` })
        }
      }
      continue
    }
    // 普通行：长句（中文分句 >N 字 / 英文句 >N 词）
    const cn = cnSentences(line)
    for (const sent of cn) {
      const cnLen = [...sent].filter(cnChar).length
      const enPart = sent.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
      if (cnLen > opts.maxCnChars) {
        out.push({ rule: 'WS-1', file, line: lineOffset + lineNo, detail: `cn sentence ${cnLen} chars > ${opts.maxCnChars}: ${sent.slice(0, 40)}…` })
        continue
      }
      // 中英混排句：英文部分按词数判（中文部分已判过字数）
      const enWords = enPart.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length
      if (enWords > opts.maxEnWords) {
        out.push({ rule: 'WS-1', file, line: lineOffset + lineNo, detail: `en sentence ${enWords} words > ${opts.maxEnWords}` })
      }
    }
    // 纯英文行兜底（cnSentences 不切无中文句读的行）
    if (cn.length === 1 && !cnChar(cn[0])) {
      for (const sent of enSentences(line)) {
        const words = sent.split(/\s+/).filter(Boolean).length
        if (words > opts.maxEnWords) out.push({ rule: 'WS-1', file, line: lineOffset + lineNo, detail: `en sentence ${words} words > ${opts.maxEnWords}` })
      }
    }
    // 模糊词
    for (const w of VAGUE_WORDS) {
      if (line.includes(w)) out.push({ rule: 'WS-2', file, line: lineOffset + lineNo, detail: `vague word "${w}"` })
    }
    // 多动作步骤（启发式）：列表行（-/*/数字.）含 ≥2 个动作连接词
    if (/^\s*(-|\*|\d+\.)\s/.test(line)) {
      const count = ACTION_CONNECTORS.filter((c) => line.includes(c)).length
      if (count >= 2) out.push({ rule: 'WS-3', file, line: lineOffset + lineNo, detail: `list step with ${count} action connectors (split into steps)` })
    }
    globalIdx++
  }
  void globalIdx
  return out
}

/** 检查一个 markdown 文档（全文）：剥码后逐行/逐单元格。 */
export function checkMarkdown(content: string, file: string, opts: Partial<typeof WS_DEFAULTS> = {}): StyleFinding[] {
  const o = { ...WS_DEFAULTS, ...opts }
  return checkText(stripCode(content), file, 1, o)
}
