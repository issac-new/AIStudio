// overlay/custom/client/ide/utils/wikiPipeline.ts
// Repo Wiki 生成管线提示词资产（R5，Qoder Repo Wiki 语义移植）：
// 多子代理分派 + 增量更新 + 引用注入。
// 落点与 M3/R3 同范式——sendMessage 注入普通代理回合，由 agent 自己扇出
// 子代理（delegate_task 已在 hermes 工具面）；无专用引擎，产物写回 docs/wiki/。
export interface WikiPipelineOptions {
  /** 已有页面路径列表（增量更新判据）；空 = 首次全量生成 */
  existingPages?: string[]
}

export function buildWikiPipelinePrompt(opts: WikiPipelineOptions = {}): string {
  const existing = opts.existingPages ?? []
  const modeSection = existing.length > 0
    ? [
      '## 模式：增量更新',
      `已存在 ${existing.length} 页（见下）。规则：`,
      '- 结构未变的模块跳过重写，只更新「发生了什么变化」的段落；',
      '- 新模块补页、废弃模块删页（删页前先列出待删清单让我确认）；',
      '- 最后统一刷新 docs/wiki/index.md 的目录与变更摘要。',
      '',
      '已存在页面：',
      ...existing.map((p) => `- ${p}`),
    ].join('\n')
    : [
      '## 模式：首次全量生成',
      '- 先浏览仓库结构（README、package.json、src/docs 顶层、关键模块）；',
      '- 识别 3-8 个主要模块/主题，每个一页；',
      '- 全部写完后生成 docs/wiki/index.md（项目简介 + 目录链接）。',
    ].join('\n')

  return `请为本仓库生成/更新 Wiki 到 docs/wiki/ 目录。

${modeSection}

## 执行方式（多子代理分派）
1. 若任务面支持 delegate_task：为每个模块/主题派一个子代理并行产出草稿
   （每个子代理只负责自己那页，上下文隔离，避免主会话上下文爆炸）；
2. 子代理回收后由你统一审校口径（术语一致、路径真实、无臆造链接）；
3. 全部页面写回 docs/wiki/ 后，给我一份「生成摘要」：新增/更新/跳过的页面清单。

## 每页硬性结构（子代理必须遵守）
- 标题（模块名）
- 职责一句话
- 关键文件路径（真实存在，先 ls 验证）
- 使用要点 / 何时读它
- 结尾「引用方式」一行：如何在对话里 @ 本页

## 引用注入
生成完成后，告诉我可以用「@wiki 模块名」在后续对话引用对应页。`
}
