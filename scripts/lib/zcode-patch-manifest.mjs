// zcode 补丁新增文件清单解析（ensure-injected 漂移自愈用）。
//
// 背景：zcode 树被 reset/re-pull 后补丁会丢；旧自愈只在 `git status` 干净时重放。
// 树脏（部分补丁已打）但某个新增文件被外部删除时，旧逻辑完全不检查，测试
// import 直接红（2026-10-19 CUA node-backend.js 实录）。本模块只做纯解析：
// 从 unified diff 里取出「新增文件」路径，交给 ensure-injected 逐个核对。

/** 从单个 patch 文本解析新增文件相对路径（去重，保持声明顺序）。 */
export function addedFilesFromPatch(patchText) {
  const out = []
  const seen = new Set()
  const blocks = String(patchText).split(/^diff --git /m).slice(1)
  for (const block of blocks) {
    const header = block.split('\n')[0] ?? ''
    const m = /^a\/(.+?) b\/(.+)$/.exec(header)
    if (!m) continue
    const rel = m[2]
    const isNew = /^new file mode /m.test(block) || /^--- \/dev\/null$/m.test(block)
    if (!isNew || seen.has(rel)) continue
    seen.add(rel)
    out.push(rel)
  }
  return out
}

/** 声明的文件里哪些在工作树缺席。 */
export function missingFiles(declared, exists) {
  return declared.filter((rel) => !exists(rel))
}
