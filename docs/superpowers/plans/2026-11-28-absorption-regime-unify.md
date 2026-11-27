# 吸收制度合一、台账退役与记忆清理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 执行方式（用户既定，见 `~/.zcode/AGENTS.md` 工作模式）：主会话负责集成与验收；可并行的只读取数派子代理，子代理的产出由主会话复跑核验；合并前过独立审查。

**Goal:** 让今后的吸收轮只有一份规程、一本总账、一套裁决词；退役零消费的规格按域登记机制；把项目记忆索引修回限额内。

**Architecture:** 规程正本沿用 hermes 侧的 `article-methodology-fusion`（先回灌宿主副本再扩写）；总账是一份 Markdown，放在 `team/shared/research/`；守门是一个 Vitest 测试，直接读总账与规格目录，不引入新脚本或新门；记忆清理在仓外进行，先备份。

**Tech Stack:** Markdown、Vitest（根测试面）、Node（`scripts/governance-lint.mjs` 等既有脚本）、pytest（`team/tests` 隐私测试）、bash（`skills/swarm-yuan/tests/test-doc-numbers.sh`）、tar。

**Spec:** `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md`

## Global Constraints

- 工作树 `.claude/worktrees/absorption-regime-unify`，分支 `refactor/absorption-regime-unify`，基线 `60fb6243c`。不在主检出改文件；清理只走 `git worktree remove`。
- 不新增门、钩子、脚本、npm 脚本。`config/mechanism-budget.json` 的 `limits.scripts` 终值是 78。
- 不写宿主 `~/.hermes/` 下任何文件；不批量删记忆主题文件；不改已合入的规格（本规格除外）。
- 规格与规程正文禁用这些词：性能良好、体验优秀、快速、稳定、适当、合理、尽量、必要时、等等、诸如、大概、若干、左右。
- 注释用中文，标识符用英文。
- 每个任务末尾跑该任务的验证命令；失败与未验证项写进交付说明。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | 改 | 状态改为已批准，收口时回填实测验证 |
| `team/skills/devops/article-methodology-fusion/SKILL.md` | 回灌后改 | 规程正本，升 2.0.0 |
| `team/skills/devops/harness-fusion-patterns/SKILL.md` | 回灌后改 | 第 4 步指向统一词表，升 1.6.0 |
| `team/shared/research/absorption-ledger.md` | 建 | 吸收总账三张表 |
| `custom/__tests__/absorption-ledger.test.ts` | 建 | 五条断言加边角用例 |
| `AGENTS.md`、`docs/README.md` | 改 | 入口规则与文档入口 |
| `docs/DESIGN.md`、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` | 改 | 设计文档同步 |
| `scripts/spec-archive.mjs`、`scripts/__tests__/spec-archive.test.ts` | 删 | 退役 |
| `docs/superpowers/specs/registry/README.md` | 改 | 标冻结 |
| `config/mechanism-budget.json` | 改 | 删条目、上限 79 改 78、记一条变更 |
| `skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md` | 改 | 文件头冻结声明 |
| `docs/absorption-domain-README.md` | 改 | 缩成指针页 |
| 记忆目录 `MEMORY.md`、14 个候选主题文件、`memory-index-archive.md`、新 `memory-index-hygiene.md` | 改／建（仓外） | 记忆清理 |

## Review Focus

1. 规格抬头声明的编号存在，但总账那一行的来源档指向别的规格——声明必须与本规格互相指向（任务 3 的 `declaredId` 用例）。
2. 表二「提出处」写成 `l001` 或 `L1` 这种不合规格式的编号——既不是轮次编号也不是存在的文件，判红（任务 3 的 `badDeferRow` 用例）。
3. 单元格里的路径带反引号——解析时剥掉反引号再判断文件是否存在（任务 3 的 `parseTable` 用例）。
4. 规格目录下有名字含关键词的子目录或非 Markdown 文件——只认直接子文件里的 `.md`（任务 3 的 `matchingSpecs` 用例）。
5. 来源档写「未声明」或「不适用」时不去做文件存在性检查（任务 3 的文件级断言 A）。

---

### Task 1: 记忆清理（仓外，可回滚）

**Files:**
- 备份：`/Users/cuishi/.zcode/cli/memories/projects/aistudio-a5936c959ea077fa/memory-backup-20261128.tar.gz`
- Modify: 记忆目录下 `MEMORY.md`、`memory-index-archive.md`、规格 §5 过期候选表点名的主题文件
- Create: 记忆目录下 `memory-index-hygiene.md`

**Interfaces:**
- Consumes: 规格 §5 的五个步骤与过期候选表（14 行）。
- Produces: 无（仓外，后续任务不依赖）。

- [ ] **Step 1: 备份并核对条目数**

Run: `tar czf <父目录>/memory-backup-20261128.tar.gz -C <父目录> memory && tar tzf <同一个包> | grep -c '\.md$'`
Expected: 输出 919（与清理前 `ls memory | wc -l` 一致）。

- [ ] **Step 2: 重写 `MEMORY.md`**

规则：每个文件一行；行长不超过 160 字符；同一文件只出现一行；标题后只跟一句钩子；总字符数不超过 22,000；两处页尾归档说明并成一条。保留现有 125 个被索引文件的成员关系，不增不减（新增长的规则记忆除外）。

Run: `wc -m < MEMORY.md`；`awk '{ if (length($0) > 160) n++ } END { print n+0 }' < MEMORY.md`；`grep -oE '\]\([a-z0-9._-]+\.md\)' MEMORY.md | sort | uniq -d`
Expected: 第一个不超过 22000；第二个输出 0；第三个无输出。

- [ ] **Step 3: 订正 14 行过期候选**

逐行核对。属实的在主题文件末尾加一行 `**现状（2026-11-27 核）**：……`，索引行同步改；说法已错又没有可复用教训的，从索引移出，文件保留。第 14 行按 Step 4 处置。

- [ ] **Step 4: 订正 `memory-index-archive.md`**

页头的截止日期改成实际覆盖范围（用 `grep -oE '2026-[0-9]{2}-[0-9]{2}' memory-index-archive.md | sort | sed -n '1p;$p'` 取首末日期）；页尾两条计数注记并成一条，数字以实际条目数为准。

- [ ] **Step 5: 写长期规则记忆并验证**

新建 `memory-index-hygiene.md`（type 为 feedback），写明：行长上限 160 字符；同文件单行；状态类信息不进索引标题；每月末把两个月前且不是 feedback 类的条目移出索引。在 `MEMORY.md` 加它的索引行。重跑 Step 2 的三条命令，另加断链检查：索引指向的文件全部存在。

---

### Task 2: 规程正本回灌与扩写

**Files:**
- Modify: `team/skills/devops/article-methodology-fusion/SKILL.md`
- Modify: `team/skills/devops/harness-fusion-patterns/SKILL.md`

**Interfaces:**
- Produces: 规程正本里的节标题逐字为 `## 跨对象总规程（三类对象 × 四类材料）`；任务 3 的表三与任务 4 的仓规条文引用它。

- [ ] **Step 1: 回灌两份宿主副本**

Run: `cp /Users/cuishi/.hermes/skills/devops/article-methodology-fusion/SKILL.md team/skills/devops/article-methodology-fusion/SKILL.md && cp /Users/cuishi/.hermes/skills/devops/harness-fusion-patterns/SKILL.md team/skills/devops/harness-fusion-patterns/SKILL.md && md5 team/skills/devops/article-methodology-fusion/SKILL.md /Users/cuishi/.hermes/skills/devops/article-methodology-fusion/SKILL.md`
Expected: 两份摘要相同；`harness-fusion-patterns` 同法核对。`git diff --stat` 只有这两个文件。

- [ ] **Step 2: 跑隐私测试**

Run: `python3.14 -m pytest team/tests/test_profiles_secret_hygiene.py -q`
Expected: 全部通过。失败则停下核对差异行里是否有敏感原值，不得为了通过而改测试。

- [ ] **Step 3: 扩写 `article-methodology-fusion`**

`version` 改 `2.0.0`；`description` 改为「吸收总规程与文章源融合：四类材料（文章、论文、报告；代码仓；技能包；上游版本差量）乘三类对象（AIStudio、hermes 智能体团队、swarm-yuan）的同源查重、五判定、成色、总账与回看，外加文章源 6 步流程」；触发词行末尾加「；任何吸收轮（含以 AIStudio、swarm-yuan 为对象的）」。

在「## 与 repo 源融合的关键差异」之后、「## 流程（6 步）」之前插入 `## 跨对象总规程（三类对象 × 四类材料）`，内容逐字取规格 §1 的五步表、两条硬约束、词表、各对象附加约束表，开头加一句指向总账路径。

第 3 步开头加：「先查吸收总账 `team/shared/research/absorption-ledger.md`，再查三处档案家：」。
第 6 步末尾加：「收口三件事：标成色（语义落地、机制落地、效力落地，另记默认行为变更有或无）、在吸收总账写轮次行、给每个记档待定项写一行带回看日。」

- [ ] **Step 4: `harness-fusion-patterns` 加一句并升版**

`version` 改 `1.6.0`。第 4 步「融合方案」句末加：「判定词与落地成色以 `article-methodology-fusion` 的「跨对象总规程」词表为准（吸收、收缩吸收、等效印证、记档待定、不吸收）。」

- [ ] **Step 5: 验证并提交**

Run: `grep -c '^## 跨对象总规程（三类对象 × 四类材料）' team/skills/devops/article-methodology-fusion/SKILL.md`；`grep -n '^version:' team/skills/devops/article-methodology-fusion/SKILL.md team/skills/devops/harness-fusion-patterns/SKILL.md`；重跑 Step 2。
Expected: 第一个输出 1；版本分别是 2.0.0 与 1.6.0；隐私测试通过。

```bash
git add team/skills/devops/article-methodology-fusion/SKILL.md team/skills/devops/harness-fusion-patterns/SKILL.md
git commit -m "feat(team): 回灌两份融合枢纽技能并把 article-methodology-fusion 抬成跨对象总规程（v2.0.0）"
```

---

### Task 3: 吸收总账与守门测试

**Files:**
- Create: `team/shared/research/absorption-ledger.md`
- Test: `custom/__tests__/absorption-ledger.test.ts`

**Interfaces:**
- Consumes: 规格 §2 的三张表列名与取值规则、22 份回填清单、12 项挂账表。
- Produces: 总账路径 `team/shared/research/absorption-ledger.md`；表一列名 `编号 日期 来源 深度 对象 裁决计数 成色计数 默认行为变更 来源档 回看日`；表二列名 `编号 提出处 事项 回看日 处置`；表三列名 `路径 所属侧 角色 说明`。

- [ ] **Step 1: 写失败的测试**

```ts
// 吸收总账守门（规格 2026-11-27-absorption-regime-unify §2）：五条断言 A–E 加五个边角用例。
// 只读总账与规格目录；解析函数是纯函数，边角用例用内联文本喂。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const LEDGER = 'team/shared/research/absorption-ledger.md'
const SPECS = 'docs/superpowers/specs'
const SINCE_NAME = '2026-10-24'
const SINCE_DECL = '2026-11-28'
const NAME_RE = /^(\d{4}-\d{2}-\d{2})-.*(absorption|absorb|research|survey)[^/]*\.md$/
const LITERAL = new Set(['未声明', '不适用'])
const DEPTH = new Set(['源码级', '全文级', '摘要级'])
const VERDICT = new Set(['吸收', '收缩吸收', '等效印证', '记档待定', '不吸收'])

type Row = Record<string, string>

// 取「## <title>」节的 Markdown 表；单元格剥首尾反引号。
export function parseTable(md: string, title: string): Row[] {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`))
  if (start < 0) return []
  const rows: string[][] = []
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith('## ')) break
    if (!l.startsWith('|')) continue
    rows.push(l.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, '').trim()))
  }
  if (rows.length < 2) return []
  const head = rows[0]
  return rows.slice(2).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

// 抬头里「吸收总账：」后面的记号；没有则 null。
export function declaredId(head: string): string | null {
  const m = /吸收总账：\s*(\S+)/.exec(head)
  return m ? m[1] : null
}

// 规格目录直接子文件里，日期达标且文件名含关键词的 Markdown。
export function matchingSpecs(names: string[], since: string): string[] {
  return names.filter((n) => {
    const m = NAME_RE.exec(n)
    return !!m && m[1] >= since
  })
}

// 表二一行的毛病；没有毛病返回 null。
export function badDeferRow(row: Row, roundIds: Set<string>, pathExists: (p: string) => boolean): string | null {
  const from = row['提出处'] ?? ''
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(row['回看日'] ?? '')) return '缺提出处或回看日'
  if (/^L\d{3}$/.test(from)) return roundIds.has(from) ? null : `轮次 ${from} 不在表一`
  return pathExists(from) ? null : `提出处 ${from} 不是轮次编号，也不是存在的文件`
}

// 取值词表检查；kind 区分表一与表二。
export function vocabError(row: Row, kind: 'round' | 'defer'): string | null {
  if (kind === 'defer') return VERDICT.has(row['处置'] ?? '') ? null : `处置取值越界：${row['处置']}`
  const depth = row['深度'] ?? ''
  const five = row['裁决计数'] ?? ''
  const three = row['成色计数'] ?? ''
  const behavior = row['默认行为变更'] ?? ''
  if (!DEPTH.has(depth) && !LITERAL.has(depth)) return `深度取值越界：${depth}`
  if (!/^\d+(\/\d+){4}$/.test(five) && !LITERAL.has(five)) return `裁决计数格式错：${five}`
  if (!/^\d+(\/\d+){2}$/.test(three) && !LITERAL.has(three)) return `成色计数格式错：${three}`
  if (!['有', '无'].includes(behavior) && !LITERAL.has(behavior)) return `默认行为变更取值越界：${behavior}`
  return null
}

const ledger = () => readFileSync(join(ROOT, LEDGER), 'utf8')
const specNames = () =>
  readdirSync(join(ROOT, SPECS), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name)
const headOf = (name: string) => readFileSync(join(ROOT, SPECS, name), 'utf8').split('\n').slice(0, 15).join('\n')

describe('吸收总账', () => {
  it('A 来源档真实', () => {
    for (const row of parseTable(ledger(), '一、轮次')) {
      const doc = row['来源档'] ?? ''
      if (LITERAL.has(doc) || !doc) continue
      expect(existsSync(join(ROOT, doc)), `${row['编号']} 的来源档不存在：${doc}`).toBe(true)
    }
  })

  it('B 文件名可识别的吸收规格全部入账', () => {
    const referenced = new Set(parseTable(ledger(), '一、轮次').map((r) => r['来源档'].split('/').pop()))
    for (const name of matchingSpecs(specNames(), SINCE_NAME)) {
      expect(referenced.has(name) || /吸收总账：不适用/.test(headOf(name)), `${name} 没有入账，抬头也没写不适用`).toBe(true)
    }
  })

  it('C 新规格声明的行不悬空', () => {
    const rounds = parseTable(ledger(), '一、轮次')
    for (const name of specNames().filter((n) => n.slice(0, 10) >= SINCE_DECL)) {
      const id = declaredId(headOf(name))
      if (!id || id.startsWith('不适用')) continue
      const row = rounds.find((r) => r['编号'] === id)
      expect(row, `${name} 声明的 ${id} 不在表一`).toBeDefined()
      expect(row!['来源档'], `${name} 声明的 ${id} 指向别的规格`).toBe(`${SPECS}/${name}`)
    }
  })

  it('D 待定行字段齐', () => {
    const roundIds = new Set(parseTable(ledger(), '一、轮次').map((r) => r['编号']))
    for (const row of parseTable(ledger(), '二、记档待定')) {
      expect(badDeferRow(row, roundIds, (p) => existsSync(join(ROOT, p))), row['编号']).toBeNull()
    }
  })

  it('E 用词不漂移', () => {
    const md = ledger()
    for (const row of parseTable(md, '一、轮次')) expect(vocabError(row, 'round'), row['编号']).toBeNull()
    for (const row of parseTable(md, '二、记档待定')) expect(vocabError(row, 'defer'), row['编号']).toBeNull()
  })
})

describe('总账解析与判定（边角用例）', () => {
  const md = ['## 一、轮次', '', '| 编号 | 来源档 |', '|---|---|', '| L001 | `docs/a.md` |', '| L002 | 未声明 |', '', '## 二、记档待定', '', '| 编号 | 提出处 | 事项 | 回看日 | 处置 |', '|---|---|---|---|---|', '| P001 | L001 | 甲 | 2027-01-01 | 记档待定 |', ''].join('\n')

  it('单元格里的路径剥掉反引号', () => {
    expect(parseTable(md, '一、轮次')[0]!['来源档']).toBe('docs/a.md')
    expect(parseTable(md, '一、轮次')[1]!['来源档']).toBe('未声明')
  })

  it('声明的编号存在但来源档指向别的规格，判为悬空', () => {
    const rounds = parseTable(md, '一、轮次')
    const row = rounds.find((r) => r['编号'] === declaredId('> 吸收总账：L001'))
    expect(row!['来源档']).not.toBe(`${SPECS}/2026-12-01-other-research.md`)
  })

  it('提出处写成 l001 或 L1 判红，存在的文件路径放行', () => {
    const ids = new Set(['L001'])
    const never = () => false
    expect(badDeferRow({ 提出处: 'l001', 回看日: '2027-01-01' }, ids, never)).toContain('不是轮次编号')
    expect(badDeferRow({ 提出处: 'L1', 回看日: '2027-01-01' }, ids, never)).toContain('不是轮次编号')
    expect(badDeferRow({ 提出处: 'L009', 回看日: '2027-01-01' }, ids, never)).toContain('不在表一')
    expect(badDeferRow({ 提出处: 'docs/x.md', 回看日: '2027-01-01' }, ids, () => true)).toBeNull()
    expect(badDeferRow({ 提出处: 'L001', 回看日: '2027/01/01' }, ids, never)).toBe('缺提出处或回看日')
  })

  it('只认直接子文件里日期达标的 Markdown', () => {
    const names = ['2026-11-20-foo-research', '2026-11-20-bar-research.md', '2026-09-01-x-absorption.md', '2026-11-20-plain.md']
    expect(matchingSpecs(names, SINCE_NAME)).toEqual(['2026-11-20-bar-research.md'])
  })

  it('未声明与不适用放行，词表外的写法判红', () => {
    const base = { 深度: '源码级', 裁决计数: '1/0/2/0/3', 成色计数: '2/1/0', 默认行为变更: '有' }
    expect(vocabError({ ...base, 深度: '未声明', 裁决计数: '不适用' }, 'round')).toBeNull()
    expect(vocabError({ ...base, 深度: '读了一部分' }, 'round')).toContain('深度')
    expect(vocabError({ ...base, 裁决计数: '3/2' }, 'round')).toContain('裁决计数')
    expect(vocabError({ ...base, 默认行为变更: '也许' }, 'round')).toContain('默认行为变更')
    expect(vocabError({ 处置: '再议' }, 'defer')).toContain('处置')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run custom/__tests__/absorption-ledger.test.ts`
Expected: FAIL，文件级五条因总账文件不存在而红；边角用例通过。

- [ ] **Step 3: 建总账并回填**

总账抬头四行：标题；一句用途加规程正本与守门测试的路径；一行取值说明；一行回填口径（取自规格 §2：深度按来源档自述；成色只按来源档「验证」段写明的事实映射——只落文档记语义，有代码且记录了运行结果记机制，记录了变异探针或实物走查抓出缺陷记效力，只列命令未记结果记未声明；裁决计数只在来源档有可数清单时填写）。

三张表用「## 一、轮次」「## 二、记档待定」「## 三、规程地图」三个二级标题，列名见 Interfaces。表一 22 行，按规格 §2 清单顺序编 `L001` 到 `L022`，回看日取日期加 60 天。表二 20 行：12 行蒸发挂账（提出处写 `L` 编号，回看日取提出日加 60 天，处置写记档待定）加 8 行待判载体（提出处写本规格文件名，回看日 2026-12-27）。表三登记：规程正本；`skills/swarm-yuan/references/capability-map.md`、`skills/swarm-yuan/docs/upstream-baseline.md`、技术组件台账三份真值载体；T1 登记目录（已退役）、T2 停更台账（已冻结）。

- [ ] **Step 4: 跑测试确认通过，做三个变异探针**

Run: `npx vitest run custom/__tests__/absorption-ledger.test.ts`
Expected: 全部通过。

变异探针，每个做完还原并核对文件摘要与变异前一致：
1. 删表一任意一行——断言 B 判红（若删的是无同名关键词的行，则断言 A 不受影响，此时改删一行文件名含关键词的）。
2. 在工作树里新建 `docs/superpowers/specs/2026-12-01-probe-research.md`，首行写 `> 吸收总账：L999`——断言 B、C 判红；探针文件用完删除。
3. 删表二某一行的回看日——断言 D 判红。

- [ ] **Step 5: 提交**

```bash
git add team/shared/research/absorption-ledger.md custom/__tests__/absorption-ledger.test.ts
git commit -m "feat(docs): 吸收总账（回填 22 轮、20 条记档待定）与守门测试"
```

---

### Task 4: 入口规则与设计文档同步

**Files:**
- Modify: `AGENTS.md`（工作规则末尾）
- Modify: `docs/README.md:26`、目录职责表
- Modify: `docs/DESIGN.md:1315` 之后
- Modify: `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` §A 表末

- [ ] **Step 1: `AGENTS.md` 加第 15 条**

「15. 吸收轮入口（2026-11-28 用户批准，规格 2026-11-27-absorption-regime-unify）：外来材料（文章、论文、报告、代码仓、技能包、上游版本差量）用于改进本仓、hermes 智能体团队或 swarm-yuan 之前，先查吸收总账 `team/shared/research/absorption-ledger.md` 的同源行，再按 `team/skills/devops/article-methodology-fusion/SKILL.md` 的「跨对象总规程」执行。收口时在总账写轮次行，记档待定项逐条入账；新写的吸收规格在抬头写「吸收总账：编号」。守门是 `custom/__tests__/absorption-ledger.test.ts`。」

- [ ] **Step 2: `docs/README.md` 两处**

现行入口表第 26 行改为指向 `../team/shared/research/absorption-ledger.md`，说明写「吸收总账：外来材料的裁决、落地成色与回看（含方法论与组件两类来源的轮次索引）」。目录职责表在 `upstream-analysis/` 一行后加 `team/shared/research/` 一行：技术组件台账与吸收总账。

- [ ] **Step 3: 设计正本与数字总账**

`docs/DESIGN.md` 在「新增概念必须说明消费者、验证方式和退役条件，不能只增不减。」之后加两行：
「外来材料的吸收只有一份规程正本和一本总账：`team/skills/devops/article-methodology-fusion` 与 `team/shared/research/absorption-ledger.md`。」
「裁决只用五个判定词（吸收、收缩吸收、等效印证、记档待定、不吸收），落地必报三档成色（语义、机制、效力），记档待定项带回看日。」
数字总账 §A 表末加一行：`| 吸收制度 | 规程 1 份；总账 1 本；判定词 5 个；成色 3 档；深度 3 档 | 2026-11-27-absorption-regime-unify.md |`

- [ ] **Step 4: 验证并提交**

Run: `npx vitest run custom/__tests__/docs-ssot-guard.test.ts scripts/__tests__/regression-matrix.test.ts custom/__tests__/evidence-binary-freeze.test.ts custom/__tests__/mimo-coding-agent.test.ts custom/__tests__/precommit-vendor-guard.test.ts custom/__tests__/qgate-repo-scope-fence.test.ts scripts/__tests__/harness-doctor.test.ts scripts/__tests__/make-offline-package.test.ts`；`node scripts/gen-doc-indexes.mjs --check`
Expected: 全部通过；索引检查无差异。

```bash
git add AGENTS.md docs/README.md docs/DESIGN.md docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md
git commit -m "docs(governance): 吸收轮入口规则（仓规第 15 条）与设计正本同步"
```

---

### Task 5: 退役与降级

**Files:**
- Delete: `scripts/spec-archive.mjs`、`scripts/__tests__/spec-archive.test.ts`
- Modify: `docs/superpowers/specs/registry/README.md`
- Modify: `config/mechanism-budget.json`
- Modify: `skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md`（前 6 行）
- Modify: `docs/absorption-domain-README.md`

- [ ] **Step 1: 确认零消费后删脚本**

Run: `grep -rn "spec-archive" --include='*.mjs' --include='*.ts' --include='*.json' --include='*.yml' --include='*.yaml' . --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git | grep -v '^./scripts/spec-archive.mjs\|^./scripts/__tests__/spec-archive.test.ts'`
Expected: 只剩 `config/mechanism-budget.json` 里的条目。然后 `git rm` 两个文件。

- [ ] **Step 2: 登记目录标冻结，改机制预算**

`registry/README.md` 标题下加一段：「2026-11-28 起冻结：`scripts/spec-archive.mjs` 已退役（规格 2026-11-27-absorption-regime-unify T1），本目录只作历史锚，不再维护。吸收轮的查重与回看改用 `team/shared/research/absorption-ledger.md`。」
`config/mechanism-budget.json`：`sunset` 删 `id` 为 `spec-archive` 的条目；`limits.scripts` 改 78；`changes` 追加一条 `{ "at": "2026-11-28", "delta": "-1 scripts / +0 gates / +0 ledgers / +0 npm scripts；limits.scripts 79→78 对齐在册数", "reason": "规格按域登记机制退役（spec 2026-11-27-absorption-regime-unify T1）：11-05 立后只有 ainative 一个域、脚本无自动调用方；与新增吸收总账配对", "pairedRemovals": [] }`（字段形状对齐文件里已有的退役类条目）。

- [ ] **Step 3: 两份停更快照降级**

T2 文件标题下加：「> 已冻结（2026-11-28）：本稿是 2026-10-20 的派生视图，10-24 后停更，不承载真值。现行载体：`skills/swarm-yuan/references/capability-map.md`（方法论与运行时登记）与 `team/shared/research/absorption-ledger.md`（跨对象吸收总账）。」
T3 整文件替换为不超过 15 行的指针页，三个链接指向技术组件台账、吸收总账、`reports/2026-10-01-upstream-absorption-analysis.md` 与 `reports/2026-10-01-upstream-absorption-round2-exhaustive.md`。

- [ ] **Step 4: 验证并提交**

Run: `node scripts/governance-lint.mjs --budget`；`bash skills/swarm-yuan/tests/test-doc-numbers.sh`；`npx vitest run scripts/__tests__/regression-matrix.test.ts`
Expected: 预算 lint 0 problem；文档数字测试 0 失败；回归矩阵测试通过（被删的测试文件原本未单独登记）。

```bash
git add -A scripts/spec-archive.mjs scripts/__tests__/spec-archive.test.ts docs/superpowers/specs/registry/README.md config/mechanism-budget.json skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md docs/absorption-domain-README.md
git add -u scripts
git commit -m "chore(governance): 退役规格按域登记机制，冻结两份停更快照（limits.scripts 79→78）"
```

---

### Task 6: 回归与收口

**Files:**
- Modify: `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md`（状态与验证回填）

- [ ] **Step 1: 合并档回归**

Run: `npm run regress -- --scope merge`
Expected: 全部面通过。单面超时的，按回归工具给出的办法单面复跑并如实记录。

- [ ] **Step 2: 独立审查**

派一个没参与实施的子代理做只读审查：对照规格逐条核对交付物与锚点，变异探针由它重做一遍。审查发现的缺陷当场修或登记，不在主干改。

- [ ] **Step 3: 回填规格并提交**

规格状态改「已实施」，验证一节回填实测数字（各命令结果、探针结果、回归面数、记忆索引数字）。提交时若钩子因收据判漂移，用 `SPEC_REBIND=1` 重绑。

```bash
git add docs/superpowers/specs/2026-11-27-absorption-regime-unify.md
SPEC_REBIND=1 git commit -m "docs(spec): 吸收制度合一规格回填实测验证与实施状态"
```

- [ ] **Step 4: 推送与合入**

按仓规第 14 条：查 `.qgate/registers/task-intent.json` 槽位；槽位里是别的会话的卡时，登记本批任务卡 `absorption-regime-unify-20261128`（范围写实际变更集），同步 `custom/qgate/gate-packs/l0/gates/scope-check.yaml` 与 `intent-drift.yaml` 的哈希绑定，推送后把对方在先的登记与绑定按字节归还。变基到 `origin/main`，`--no-ff` 合入。

- [ ] **Step 5: 清理工作树**

`git worktree remove .claude/worktrees/absorption-regime-unify`，随后 `git worktree prune`。

## Self-Review 记录

- 规格覆盖：§1 对应任务 2；§2 对应任务 3；§3、设计文档影响对应任务 4；§4 对应任务 5；§5 对应任务 1；§6 不做的事无任务；§7 顺序对应任务 1 到 6。
- 类型一致：`parseTable`、`declaredId`、`matchingSpecs`、`badDeferRow`、`vocabError` 在任务 3 内定义并使用；总账列名与 Interfaces 一致。
- Review Focus 五条各有用例（任务 3 第二个 `describe`）。
