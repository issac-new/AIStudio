// overlay/custom/client/ide/__tests__/wiki-pipeline-v2.test.ts
// wikiPipeline v2 提示词资产守门（2026-10-10 深化轮，调研落地）：
// 三分支模式裁决（meta 驱动增量/旧式增量/首次全量两段式）、C4-lite 页树、
// Mermaid 硬约束、meta 边车 schema 指令（勿手改）、AGENTS.md 受管块标记、
// wiki_plan.yaml 消费、config 注入，以及 parseWikiMeta/parseWikiFrontMatter 容错。
// Value: protects=提示词资产的关键条款不被无声删改（生成质量的对冲面）; fails_when=任一板块缺失或措辞漂移; why_new=v2 重写后无既有覆盖; seam=none
import { describe, it, expect } from 'vitest'
import {
  buildWikiPipelinePrompt,
  parseWikiMeta,
  parseWikiFrontMatter,
  WIKI_META_PATH,
  DEFAULT_WIKI_GEN_CONFIG,
  type WikiMeta,
} from '../utils/wikiPipeline'

const META: WikiMeta = {
  version: 1,
  generatedAt: '2026-10-09T08:00:00.000Z',
  commitId: 'abc1234',
  dirty: false,
  pages: [
    { path: 'docs/wiki/modules/auth.md', hash: 'aabbcc', sources: ['src/auth/', 'src/sso/'] },
    { path: 'docs/wiki/overview.md', sources: [] },
  ],
  agentsBlockAt: '2026-10-09T08:00:00.000Z',
}

describe('wikiPipeline v2：模式三分支', () => {
  it('meta 存在 → meta 驱动增量：基线/映射/求交/>10k 回退/零写作出口全在档', () => {
    const p = buildWikiPipelinePrompt({ meta: META, existingPages: ['docs/wiki/modules/auth.md'] })
    expect(p).toContain('模式：增量更新（meta 驱动')
    expect(p).toContain('commitId=abc1234')
    expect(p).toContain('git diff <基线commitId>..HEAD --stat')
    expect(p).toContain('docs/wiki/modules/auth.md ← src/auth/, src/sso/')
    expect(p).toContain('>10000 时回退全量')
    expect(p).toContain('均无交集时：零写作')
    // meta 分支优先于 existingPages（两者同传时）
    expect(p).not.toContain('旧式，无 meta 边车')
  })

  it('无 meta 有 existingPages → 旧式增量（兼容通道）', () => {
    const p = buildWikiPipelinePrompt({ existingPages: ['docs/wiki/index.md'] })
    expect(p).toContain('模式：增量更新（旧式，无 meta 边车）')
    expect(p).toContain('- docs/wiki/index.md')
    expect(p).not.toContain('git diff <基线commitId>')
  })

  it('全空 → 首次全量两段式：先规划后写作', () => {
    const p = buildWikiPipelinePrompt({})
    expect(p).toContain('模式：首次全量生成（两段式——先规划后写作）')
    expect(p).toContain('先展示在回复中')
  })

  it('meta 无 pages 且无 commitId → 视为无效，回落首次全量', () => {
    const p = buildWikiPipelinePrompt({ meta: { version: 1 } as WikiMeta })
    expect(p).toContain('模式：首次全量生成')
  })
})

describe('wikiPipeline v2：C4-lite 页树与硬结构', () => {
  const p = buildWikiPipelinePrompt({})

  it('六页型骨架在档且 index 最后写', () => {
    for (const page of ['overview.md', 'architecture.md', 'workflow.md', 'modules/<模块>.md', 'boundary.md', 'index.md']) {
      expect(p).toContain(page)
    }
    expect(p).toContain('index.md 最后写')
  })

  it('每页硬性结构：front matter/ls 验证/Sources 行级引用', () => {
    expect(p).toContain('YAML front matter')
    expect(p).toContain('先 ls 验证')
    expect(p).toContain('Sources: [path:起始行-结束行]()')
    expect(p).toContain('至少 3 个真实文件引用')
  })

  it('Mermaid 硬约束清单（deepwiki-open 实证四条）', () => {
    expect(p).toContain('只准 graph TD')
    expect(p).toContain('禁止 graph LR')
    expect(p).toContain('≤4 个词')
    expect(p).toContain('先声明全部 participant')
  })

  it('wiki_plan.yaml 覆盖分支（Qoder schema 兼容）', () => {
    expect(p).toContain('wiki_plan.yaml')
    expect(p).toContain('documents[] 白名单')
    expect(p).toContain('scope.include/exclude')
  })
})

describe('wikiPipeline v2：meta 边车与 AGENTS.md 受管块', () => {
  const p = buildWikiPipelinePrompt({})

  it('meta 边车 schema 指令在档，含"勿手改"标注（Qoder 教训）', () => {
    expect(p).toContain(WIKI_META_PATH)
    expect(p).toContain('"_notice"')
    expect(p).toContain('请勿手改')
    expect(p).toContain('"pages"')
    expect(p).toContain('"sources"')
    expect(p).toContain('"agentsBlockAt"')
  })

  it('AGENTS.md 受管块：成对标记+只重写标记内+@wiki 双约定', () => {
    expect(p).toContain('<!-- HERMES-WIKI:START -->')
    expect(p).toContain('<!-- HERMES-WIKI:END -->')
    expect(p).toContain('只重写标记内文本')
    expect(p).toContain('标记外的既有内容一律保留')
    expect(p).toContain('@wiki:页名')
    expect(p).toContain('先读 docs/wiki/<页名>.md 再作答')
    expect(p).toContain('先读 docs/wiki/index.md 目录')
  })

  it('多子代理分派与生成摘要保留', () => {
    expect(p).toContain('delegate_task')
    expect(p).toContain('新增/更新/跳过/删除')
  })
})

describe('wikiPipeline v2：config 注入', () => {
  it('语言 zh/en 双档注入', () => {
    expect(buildWikiPipelinePrompt({ config: { language: 'en' } })).toContain('English')
    expect(buildWikiPipelinePrompt({ config: { language: 'zh' } })).toContain('中文')
  })

  it('图表开关：关闭时禁图条款在档', () => {
    const off = buildWikiPipelinePrompt({ config: { diagrams: false } })
    expect(off).toContain('Mermaid 图：关闭')
    expect(off).toContain('不生成任何 Mermaid 图')
    expect(buildWikiPipelinePrompt({})).toContain('Mermaid 图：开启')
  })

  it('页数上限注入且影响首次全量骨架描述', () => {
    expect(buildWikiPipelinePrompt({ config: { maxPages: 6 } })).toContain('共 5-6 页')
    expect(buildWikiPipelinePrompt({ config: { maxPages: 12 } })).toContain('共 5-12 页')
  })

  it('缺省配置 = DEFAULT_WIKI_GEN_CONFIG', () => {
    expect(buildWikiPipelinePrompt({})).toBe(buildWikiPipelinePrompt({ config: DEFAULT_WIKI_GEN_CONFIG }))
  })
})

describe('parseWikiMeta（宽容解析）', () => {
  it('合法 meta 全字段解析', () => {
    const m = parseWikiMeta(JSON.stringify(META))
    expect(m?.commitId).toBe('abc1234')
    expect(m?.pages).toHaveLength(2)
    expect(m?.pages?.[0].sources).toEqual(['src/auth/', 'src/sso/'])
  })

  it('坏 JSON / 非对象 / 空内容字段 → null 不抛', () => {
    expect(parseWikiMeta('{oops')).toBeNull()
    expect(parseWikiMeta('"just a string"')).toBeNull()
    expect(parseWikiMeta('[1,2]')).toBeNull()
    expect(parseWikiMeta('{}')).toBeNull()
    expect(parseWikiMeta('# docs/wiki/.wiki-meta.json\n不是json')).toBeNull()
  })
})

describe('parseWikiFrontMatter（简易 key:value）', () => {
  it('围栏内字段解析：引号剥离/order 数值化', () => {
    const fm = parseWikiFrontMatter('---\ntitle: "认证模块"\norder: 2\nmodule: auth\ngenerated_at: 2026-10-09T08:00:00Z\ncommit: abc1234\nunknown: x\n---\n\n# 认证模块\n')
    expect(fm.title).toBe('认证模块')
    expect(fm.order).toBe(2)
    expect(fm.module).toBe('auth')
    expect(fm.generatedAt).toBe('2026-10-09T08:00:00Z')
    expect(fm.commit).toBe('abc1234')
  })

  it('无围栏/围栏未闭合 → 空对象不抛', () => {
    expect(parseWikiFrontMatter('# 没有围栏')).toEqual({})
    expect(parseWikiFrontMatter('---\ntitle: 断头\n')).toEqual({})
  })

  it('order 非数值忽略', () => {
    expect(parseWikiFrontMatter('---\norder: abc\n---\n').order).toBeUndefined()
  })
})
