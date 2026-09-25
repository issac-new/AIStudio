// overlay/agentsmd 域：AGENTS.md 装载链细节+/init 模板（codex-product /init+cc 装载链吸收，矩阵 §3.8）。
//
// 两源合并：
// - **codex-product /init**（行 247）：生成项目 AGENTS.md 骨架（目标/构建命令/约定/红线四段）；
// - **装载链细节**（行 149）：32KB 告警（超限提示裁剪——与 400 compact 六段口径一致）+
//   防抖 watch（文件变更防抖窗口，避免重载风暴）。
export const AGENTS_MD_WARN_BYTES = 32 * 1024
export const WATCH_DEBOUNCE_MS = 300

export interface SizeCheck {
  bytes: number
  warn: boolean
  /** 建议文案（warn 时给出）。 */
  advice?: string
}

/** 32KB 告警（UTF-8 字节计量）。 */
export function checkSize(content: string, warnBytes = AGENTS_MD_WARN_BYTES): SizeCheck {
  const bytes = Buffer.byteLength(content, 'utf8')
  const warn = bytes > warnBytes
  return {
    bytes,
    warn,
    ...(warn ? { advice: `AGENTS.md ${bytes}B 超 ${warnBytes}B 告警线——裁剪低优先约定或拆分模块文档` } : {}),
  }
}

/** /init 模板（codex-product 语义：四段骨架）。 */
export function initTemplate(projectName: string): string {
  return `# ${projectName}

## 目标
（项目一句话定位）

## 构建与验证
- 构建：
- 测试：

## 约定
- （代码风格/命名/提交规范）

## 红线
- （禁止事项）
`
}

/** 防抖 watch 判定（变更后 debounce 窗口内只放行一次）。 */
export function shouldEmit(lastEmitAt: number, now: number, debounceMs = WATCH_DEBOUNCE_MS): boolean {
  return now - lastEmitAt >= debounceMs
}
