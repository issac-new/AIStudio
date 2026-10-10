// overlay/custom/client/ide/utils/wikiPipeline.ts
// Repo Wiki 生成管线提示词资产 v2（2026-10-10 深化轮，调研落地）：
//   - 两段式执行：结构规划先行（deepwiki-open 祖师模板）再逐页写作
//   - C4-lite 页面分类学（deepwiki-rs 套件裁剪，用户裁定）
//   - Mermaid 硬约束清单（deepwiki-open 实证降低渲染失败率）
//   - meta 边车 docs/wiki/.wiki-meta.json（code-repo-wiki 增量映射 + Qoder 勿手改教训）
//   - git diff 驱动的页级增量（>10k 行回退全量，Qoder 限量）
//   - AGENTS.md 受管块（OpenWiki 范式）：@wiki 约定 + 目录导读
//   - wiki_plan.yaml 兼容（Qoder schema：documents 白名单/scope）
// 落点与 M3/R3 同范式——sendMessage 注入普通代理回合，由 agent 自己扇出
// 子代理（delegate_task 已在 hermes 工具面）；无专用引擎，产物写回 docs/wiki/。

/** meta 边车里的单页记录（页面→源文件映射 = 增量判据） */
export interface WikiPipelinePageMeta {
  path: string
  hash?: string
  sources?: string[]
}

/** docs/wiki/.wiki-meta.json 的解析形态（宽容解析：字段全可选） */
export interface WikiMeta {
  version?: number
  generatedAt?: string
  commitId?: string
  dirty?: boolean
  pages?: WikiPipelinePageMeta[]
  agentsBlockAt?: string
}

/** 生成配置（面板配置 popover 持久化于 settings-layers user 层） */
export interface WikiGenConfig {
  language: 'zh' | 'en'
  diagrams: boolean
  maxPages: number
}

export const DEFAULT_WIKI_GEN_CONFIG: WikiGenConfig = {
  language: 'zh',
  diagrams: true,
  maxPages: 8,
}

/** meta 边车固定路径（与提示词内指令同源，勿单边改） */
export const WIKI_META_PATH = 'docs/wiki/.wiki-meta.json'

export interface WikiPipelineOptions {
  /** 已有页面路径列表（无 meta 边车时的旧式增量判据）；空 = 首次全量生成 */
  existingPages?: string[]
  /** meta 边车解析结果；存在则走 git diff 驱动的页级增量 */
  meta?: WikiMeta | null
  /** 生成配置（语言/图表开关/页数上限），缺省用 DEFAULT_WIKI_GEN_CONFIG */
  config?: Partial<WikiGenConfig>
}

const MERMAID_RULES = [
  '只准 graph TD（自上而下），禁止 graph LR；',
  '节点文字 ≤4 个词，长名拆短语；',
  'sequenceDiagram 必须先声明全部 participant 再画消息；',
  '一张图节点数 ≤12，超出就拆成多张。',
].join('')

function configSection(cfg: WikiGenConfig): string {
  return [
    '## 生成配置（用户设定）',
    `- 撰写语言：${cfg.language === 'en' ? 'English（全部页面与目录用英文）' : '中文（全部页面与目录用中文）'}`,
    cfg.diagrams
      ? '- Mermaid 图：开启（architecture 用 graph TD，workflow 用 sequenceDiagram；遵守下方约束清单）'
      : '- Mermaid 图：关闭（不生成任何 Mermaid 图；架构/流程用文字+缩进列表描述）',
    `- 页数上限：${cfg.maxPages}（modules/ 页从紧取舍，超限先并小模块）`,
  ].join('\n')
}

function firstFullSection(maxPages: number): string {
  return [
    '## 模式：首次全量生成（两段式——先规划后写作）',
    '第一段·结构规划：先浏览仓库（README、依赖清单、src 顶层、docs/、关键模块入口），',
    '产出一页树清单并先展示在回复中（每页一行：路径 + 一句话职责），然后再开始写作。',
    `页树骨架（C4-lite，共 5-${maxPages} 页）：`,
    '- overview.md：项目定位、技术栈表、仓库结构；',
    '- architecture.md：分层与组件关系；',
    '- workflow.md：1-3 条核心运行时流程；',
    '- modules/<模块>.md：每个主要模块一页；',
    '- boundary.md：模块边界与接口契约；',
    '- index.md 最后写：项目简介 + 目录链接 + 本次变更摘要。',
  ].join('\n')
}

function metaIncrementalSection(meta: WikiMeta): string {
  const commitId = meta.commitId || '(边车缺 commitId——改为全量重规划)'
  const mapping = (meta.pages ?? [])
    .map((p) => `- ${p.path} ← ${(p.sources ?? []).join(', ') || '(sources 未记录，按页内容关联判断)'}`)
    .join('\n')
  return [
    '## 模式：增量更新（meta 驱动，页面→源文件映射）',
    `上次生成基线：commitId=${commitId}${meta.generatedAt ? `，generatedAt=${meta.generatedAt}` : ''}，已有 ${meta.pages?.length ?? 0} 页。`,
    '1. 执行 `git diff <基线commitId>..HEAD --stat` 与 `git status --short`，得到变更文件集；',
    '2. 将变更文件与下方映射求交，得到受影响页清单并先展示在回复中；',
    '3. 只重写受影响页——页内未变化段落保留原文措辞，只改「发生了什么变化」的段落；',
    '4. 变更总行数 >10000 时回退全量重生成（在摘要中说明回退原因）；',
    '5. 新模块补页、废弃模块删页（删页前先列出待删清单让我确认）；',
    '6. 变更文件与所有页的 sources 均无交集时：零写作，仅回复「Wiki 无需更新」+ 变更概览；',
    '7. 最后统一刷新 index.md 目录与变更摘要，并更新 .wiki-meta.json。',
    '',
    '页面→源文件映射：',
    mapping || '（边车 pages 为空——视为首次全量，走两段式规划）',
  ].join('\n')
}

function legacyIncrementalSection(existing: string[]): string {
  return [
    '## 模式：增量更新（旧式，无 meta 边车）',
    `已存在 ${existing.length} 页（见下）。规则：`,
    '- 结构未变的模块跳过重写，只更新「发生了什么变化」的段落；',
    '- 新模块补页、废弃模块删页（删页前先列出待删清单让我确认）；',
    '- 最后统一刷新 docs/wiki/index.md 的目录与变更摘要。',
    '',
    '已存在页面：',
    ...existing.map((p) => `- ${p}`),
  ].join('\n')
}

export function buildWikiPipelinePrompt(opts: WikiPipelineOptions = {}): string {
  const cfg = { ...DEFAULT_WIKI_GEN_CONFIG, ...opts.config }
  const existing = opts.existingPages ?? []
  const meta = opts.meta ?? null

  const hasMeta = Boolean(meta && (meta.pages?.length || meta.commitId))
  const modeSection = hasMeta
    ? metaIncrementalSection(meta!)
    : existing.length > 0
      ? legacyIncrementalSection(existing)
      : firstFullSection(cfg.maxPages)

  return `请为本仓库生成/更新 Wiki 到 docs/wiki/ 目录。

${modeSection}

${configSection(cfg)}

## wiki_plan.yaml 覆盖（存在即生效）
若仓库根存在 wiki_plan.yaml（Qoder 兼容 schema）：其 repowiki.documents[] 白名单
（每页 title/goal/parent/hints）取代上面的自动页树规划，hints 作为该页写作引导；
scope.include/exclude（gitignore 语法）约束浏览范围。不存在则忽略本节。

## 每页硬性结构（必须遵守）
- 文件头 YAML front matter：\`title/order/module/generated_at/commit\`（generated_at=ISO 时间，commit=当前 HEAD 短串）；
- 标题 + 职责一句话；
- 关键文件路径（真实存在，写前先 ls 验证；臆造路径=返工）；
- 使用要点 / 何时读它；
- 结尾「引用方式」一行：如何在对话里 @ 本页；
- 页脚 Sources 清单：每页至少 3 个真实文件引用，格式 \`Sources: [path:起始行-结束行]()\`（括号留空）。

## Mermaid 约束清单（开启图表时逐条遵守——实证显著降低渲染失败）
${MERMAID_RULES}

## 状态边车（生成器状态，勿手改）
全部写完后更新 ${WIKI_META_PATH}（JSON；文件内加 "_notice": "生成器状态文件，请勿手改" 字段）：
{"version":1,"generatedAt":"<ISO>","commitId":"<git rev-parse HEAD>","dirty":<是否有未提交变更>,
 "pages":[{"path":"docs/wiki/xxx.md","hash":"<sha256 前 12 位，可执行 shasum/sha256sum 则记录，否则省略>","sources":["src/..."]}],
 "agentsBlockAt":"<ISO>"}

## AGENTS.md 受管块（@wiki 约定落地点）
维护仓库根 AGENTS.md 中 \`<!-- HERMES-WIKI:START -->\` 与 \`<!-- HERMES-WIKI:END -->\` 标记之间的内容：
只重写标记内文本；文件不存在则创建（含标记对）；标记外的既有内容一律保留。块内容三行：
- \`@wiki:页名\` 出现在用户消息中 = 先读 docs/wiki/<页名>.md 再作答；
- \`@wiki\` 单独出现 = 先读 docs/wiki/index.md 目录再按需读页；
- 一句话目录导读（当前 wiki 覆盖哪些模块）。

## 执行方式（多子代理分派）
1. 若任务面支持 delegate_task：为每个模块/主题派一个子代理并行产出草稿
   （每个子代理只负责自己那页，上下文隔离，避免主会话上下文爆炸）；
2. 子代理回收后由你统一审校口径（术语一致、路径真实、无臆造链接）；
3. 全部页面写回 docs/wiki/ 后，给我一份「生成摘要」：新增/更新/跳过/删除的页面清单。

## 引用注入
生成完成后，告诉我可以用「@wiki 模块名」在后续对话引用对应页。`
}

/** 解析 .wiki-meta.json 文本（宽容：坏 JSON/非对象返回 null，不抛） */
export function parseWikiMeta(text: string): WikiMeta | null {
  try {
    const obj = JSON.parse(text)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    const m = obj as WikiMeta
    if (!m.commitId && !m.pages?.length && !m.generatedAt) return null
    return m
  } catch {
    return null
  }
}

/** 页面 front matter 的解析形态（列表排序/页头陈旧度展示共用） */
export interface WikiFrontMatter {
  title?: string
  order?: number
  module?: string
  generatedAt?: string
  commit?: string
}

/**
 * 简易 front matter 解析（首段 ```---``` 围栏内的 key: value 行）。
 * 不引 yaml 库：只认标量（字符串/数字），带引号去引号；其余行忽略。
 * 无围栏返回空对象，不抛。
 */
export function parseWikiFrontMatter(text: string): WikiFrontMatter {
  const out: WikiFrontMatter = {}
  if (!text.startsWith('---')) return out
  const end = text.indexOf('\n---', 3)
  if (end === -1) return out
  const block = text.slice(4, end)
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let raw = line.slice(idx + 1).trim()
    if (!key || !raw) continue
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1)
    }
    switch (key) {
      case 'title': out.title = raw; break
      case 'module': out.module = raw; break
      case 'generated_at': out.generatedAt = raw; break
      case 'commit': out.commit = raw; break
      case 'order': {
        const n = Number.parseInt(raw, 10)
        if (Number.isFinite(n)) out.order = n
        break
      }
    }
  }
  return out
}
