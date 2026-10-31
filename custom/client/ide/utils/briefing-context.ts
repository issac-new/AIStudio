// custom/client/ide/utils/briefing-context.ts
// 简报上下文文件扫描根（2026-10-31 全功能回归）：
// IdeShell 的 loadBriefingContextFiles 原先固定扫 ['', 'docs']，对没有 docs/ 的
// 工作区（如空的 global coding-agent workspace）发一次必 404 的请求——走查在
// /app/eval、/desktop-pet 上捕获 404 噪声（失败被 catch 吞掉、面板空态）。
// 先看根目录列表里是否真有 docs 目录，再决定是否二次探，避免预期失败请求。
export interface BriefingRootEntry {
  name?: string
  isDir?: boolean
}

/** 返回要扫描的目录根：根目录存在 docs/ 时才是 ['', 'docs']，否则仅 ['']。 */
export function briefingRoots(entries: ReadonlyArray<BriefingRootEntry> | null | undefined): string[] {
  const hasDocs = (entries ?? []).some(entry => Boolean(entry?.isDir) && entry?.name === 'docs')
  return hasDocs ? ['', 'docs'] : ['']
}
