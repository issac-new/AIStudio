---
name: deep-research-workflow
description: >-
  Multi-source deep research workflow: fetch articles, dispatch parallel
  subagents for industry-wide survey, mine failed subagent transcripts for
  partial data, use authenticated gh CLI for GitHub project surveys, and
  split output into multiple focused reports. Use when the user asks for
  "深入调研" across multiple sources (articles + GitHub + standards +
  forums), or when research subagents fail mid-way and collected data
  needs recovery.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, github, subagent, delegate-task, evidence]
    related_skills:
      - evidence-based-research
      - scope-discipline
      - wechat-article-research
      - research-methodology
---

# Deep Research Workflow

End-to-end workflow for multi-source deep research tasks: article
extraction → industry survey → technical deep-dive → structured reports.
Covers the patterns discovered during the EDA platform research session
(3 WeChat articles + 194 GitHub repos + Wikipedia + arXiv, producing
90KB across 3 report files).

## When to Use

- User provides multiple URLs (articles/papers) and asks for "深入调研"
- User says "调研完成后再创建团队" (research first, then propose)
- Research spans multiple source types (articles + GitHub + standards + forums)
- User asks for "重新跑深度调研" after a previous attempt was incomplete

## Workflow Steps

### Step 1: Fetch primary sources

Use curl + regex for WeChat articles (see `wechat-article-research` skill).
Save raw content to JSON for reference.

### Step 2: Dispatch research subagents in parallel

Split the research into independent workstreams. Each subagent gets a
specific domain with clear search keywords:

```
delegate_task(tasks=[
  {"goal": "Search international standards + GitHub open-source projects...",
   "context": "..."},
  {"goal": "Search Chinese tech community + domestic vendors + tool docs...",
   "context": "..."},
  {"goal": "Deep-dive algorithm analysis with formulas + Python code...",
   "context": "..."}
])
```

**Critical**: Do NOT propose solutions/team/architecture while subagents
are running. See `scope-discipline` skill — "调研未完成不得提出具体方案".

### Step 3: Mine failed subagent transcripts

**Prevent first** — "research finished, report never written" is the most
expensive failure mode: 100% of the collection cost is lost at the last
step. Enforce it mechanically in the brief, not as advice:
- **Skeleton-first must be a numbered step with a deadline**: "write the
  report skeleton to its final absolute path within your first 10 tool
  calls, then fill section by section after each dimension". A worker told
  only "write incrementally" still burned its whole iteration budget
  (90/90) with a fully-collected, 0%-written report; a retry told
  "skeleton in first 10 calls" wrote the skeleton within minutes of
  pickup. State the deadline, not the virtue.
- **Put the iteration-budget split in the brief**: e.g. of a ~90 tool-call
  budget — collection ≤55 / report writing & closing ≥20 / buffer ≥10.
  Workers that can see the split stop collecting in time.
- **Frame the acceptance floor as the target, not the ceiling**: "40 items
  is the acceptance line — secure it first, then keep growing" beats a
  bare "≥40", which workers read as do-40-last.
- **Shrink scope per subagent**: 1 focused question + ≤3 target packages/files each; a 4-question brief across a 55-package monorepo invites hitting the limit before writing.
- **Feed prior evidence forward**: when re-dispatching after an interruption, pass the first run's collected findings in `context` so the retry verifies + completes instead of re-reading from scratch.

When a subagent still hits iteration limit or provider error before writing
its output file, its collected data is NOT lost. The live transcript at
`~/.hermes/profiles/orchestrator/cache/delegation/live/<delegation_id>/task-0.log`
contains all tool call results.

Recover data by regex-mining the transcript:

```python
import re

with open(transcript_path, 'r') as f:
    content = f.read()

# GitHub repos with stars
pattern = r'([\w\-]+/[\w\-\.]+)\s*\|\s*Stars:\s*(\d+)\s*\|\s*Lang:\s*([\w+#]+)'
repos = [(m.group(1), int(m.group(2)), m.group(3))
         for m in re.finditer(pattern, content)]

# arXiv paper IDs
papers = [m.group(0) for m in re.finditer(r'arxiv\.org/abs/[\d.]+v\d+', content)]

# Wikipedia article content (between === markers)
sections = re.findall(r'=== (\w+) ===\n(.+?)(?====|\Z)', content, re.DOTALL)
```

Compile the recovered data into the report yourself. This pattern rescued
194 GitHub repos + Wikipedia standards + arXiv papers from two subagents
that both hit provider errors.

**Reading subagent output** (applies to completed runs too): the final
summary is saved at
`~/.hermes/profiles/orchestrator/cache/delegation/subagent-summary-<N>-<ts>.txt`
(one file per task, newest = final answer). The live `task-N.log` is
append-only and long lines display truncated as `…(+N chars)` — a `tail`
of the live log is NOT the final conclusion; always open the
subagent-summary file for the complete report.

### Step 4: Use authenticated gh CLI for GitHub surveys

**Never** use unauthenticated `urllib`/`curl` to `api.github.com` — rate
limited to 60 requests/hour per IP, hitting 403 after ~10 requests.

**Always** use `gh search repos` via `execute_code` — authenticated via
`gh auth`, gets 5,000 requests/hour:

```python
from hermes_tools import terminal
import json

queries = [
    ('EDA tools', 'topic:eda'),
    ('FDTD electromagnetic', 'FDTD electromagnetic in:name,description'),
    # ... 15-20 queries covering all domains
]

all_repos = {}
for label, q in queries:
    result = terminal(
        f'gh search repos "{q}" --sort=stars --limit=10 '
        f'--json fullName,stargazersCount,description,language 2>/dev/null'
    )
    for r in json.loads(result.get("output", "[]")):
        name = r["fullName"]
        if name not in all_repos:
            all_repos[name] = {
                "stars": r["stargazersCount"],
                "lang": r.get("language", "N/A"),
                "desc": r.get("description", ""),
                "category": label
            }

sorted_repos = sorted(all_repos.values(), key=lambda x: x["stars"], reverse=True)
```

A single `execute_code` call with 20 queries collects 190+ repos in ~30
seconds. Store as JSON, then reference in the report.

For individual repo details (README, specific files):
```python
# Get repo metadata
r = terminal('gh api repos/neuraloperator/neuraloperator --jq '
             '"{full_name, stargazers_count, description, language, html_url}"')
```

### Step 5: Fetch Wikipedia content via Python urllib

Wikipedia doesn't rate-limit like GitHub. Use Python urllib with HTML
regex stripping:

```python
import urllib.request, re

def fetch_wiki(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=15)
    t = resp.read().decode("utf-8", errors="replace")
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t

# Extract specific sections
content = fetch_wiki("https://en.wikipedia.org/wiki/Synopsys")
idx = content.find("Products")
products_section = content[idx:idx+3000] if idx > 0 else ""
```

### Step 6: Split output into multiple focused reports

For complex research (3+ articles + industry survey), split into:

| Report | Content |
|--------|---------|
| `*-analysis-v2.md` (main) | Article analysis + standards + project matrix + commercial tools + tech stack + feasibility + module split |
| `*-supplement.md` | Domestic vendors + tool deep-docs (FEniCS/Meep/etc) + AI trends + standards detail |
| `*-tech-deep-dive.md` | Algorithm formulas + Python code snippets + implementation details from real source code |

Each report cross-references the others. Total can reach 80-100KB across
3 files without any single file being unmanageable.

---

## Variant: 整本扫描书 / 大部头扫描 PDF 全书精读（OCR 流水线）

When the "source" is a **scanned book / large image-only PDF** (e.g. a 500-page
methodology textbook the user wants 全书精读 to derive agent capability), the
web-fetch steps above don't apply. Use this sub-workflow instead.

**Trigger**: user attaches a large PDF and says "深入学习 / 全书精读", and the
PDF turns out to be image-only (no text layer).

### 1. Detect image-only first (before planning OCR)
```python
import fitz
doc = fitz.open(path)
print(doc.page_count, doc.metadata.get('title'))
for p in sample_pages:            # a few content pages, not just p0
    print(len(doc[p].get_text().strip()))   # 0 chars on ALL = image-only scan
```
Large scanned books (Pdg2Pic / FreePic2Pdf producers, >50MB, hundreds of pages)
are usually image-only. `read_file` refuses >50MB, so probe with `fitz` directly.

### 2. Pick the OCR engine by probing, not by assuming
- `ocrmac` (Apple Vision) — **best for Chinese printed-book scans on macOS**:
  ~5-6 s/page, near-perfect on 印刷体, no model download, no GPU. Verified on a
  527-page 中文 textbook.
- `rapidocr` / `easyocr` — cross-platform fallbacks.
- `paddleocr` may be **broken in the local env** (`np.sctypes` removed in
  NumPy 2.0) — probe import before relying on it; don't assume it works.

### 3. Resumable per-chapter OCR pipeline (critical for hundreds of pages)
Single-shot OCR of 500+ pages will hit timeouts and lose work. Build an
**incremental, resumable** script — a ready-to-run one ships with this skill at
`scripts/ocr_scanned_pdf.py` (pymupdf + ocrmac, resumable, per-chapter, pN anchors):
- Track done-pages in a `_state.json`; skip already-done pages on re-run.
- Split output **per chapter** using the PDF's TOC (`doc.get_toc()`), writing
  `第N章….md` files; tag each page with a `<!-- pN -->` anchor so downstream
  notes can cite `pN` page references (satisfies the 可追溯 / no-fabrication rule).
- Run it in the **background** (`terminal background=true` + notify_on_complete)
  and continue orchestrating while it runs; poll progress, don't block.

### 4. 骨架先行（skeleton-first）是全局规则，非单任务技巧

任何「调研 + 报告」卡（含融合裁决矩阵、多源调研）都必须在 body 显式写「骨架先行」+ 字数约束 + 分节验收清单，不得只在单任务失败经验里隐含（潜在记忆是「防止失败模式扩散到下一个任务」）。骨架先行必须作为**编号步骤**写入 body（如「步骤 3 先写骨架到落盘路径，步骤 5 填内容」），不能只作为建议。

### 5. 调研卡验收陷阱清单（研究卡只裁决不写码）

研究卡（如 SoL-Pi 调研融合裁决矩阵）本质是「调研 + 报告 + 裁决矩阵」的复合体，须按以下陷阱清单独立核验（弱证明抽查判据）：

1. **大数字逐条抽查 + 引用编号精确页码行号**——worker 声称「数字全部经论文侧核对」时，必须逐条抽查关键数字（如 44.7-49.0%、94%、1/40）并对照落盘论文快照实际行号核验；**引用编号命中 + 内容空/错**（或反之）才判失实。
2. **验收标准矩阵逐项过勾选**——冻结验收表（如「论文全文通读」「裁决矩阵覆盖」「引用行号核验」）逐项 checkbox 机械核验，不整体「符合验收」。
3. **产物在场 + 非空挂核验**——`ls -la` + `wc -l` 确认快照目录/文件在场且非零行（REPORT.md 14k + paper.txt 5041 行是基线）。
4. **引用行号/页码锚点定位真实**——worker 报告引用的论文正文行号必须含该机制引用（`grep -c "Action Fusion" paper.txt`），缺引用锚点判失实。
5. **完整快照目录在场核验**——核验 `paper.txt`、源码目录、微信文快照全在，不能只查 REPORT.md。
6. **验收标准勾选与交付物一致**——正文「44.7-49.0%、94%」逐条对应落盘行号，缺对应判失实。
7. **验收标准冻结项完整性**——「每个采纳/增量项给唯一落点 + 引用行 + 证据强度」逐项核验，缺任一项判未达成验收。

**时间差异常复核路线（自报时长与完成度矛盾时）**：created→started 短于分钟级（如 4min）而 self-described 任务全量完成时，按 checklist 逐级追问（turns>15? 产物在场？ 完成度），禁默认信任 time-consistent 即 truth。

**返工总耗时达预估3x+的豁免**：返工总耗时（含 crash/重派）显著超过显式预估（如 3x，实测基线 15min→45min）且全 checklist 通过时，直接采信大数字（如 -44.7~49.0%、94%），不逐条追加人工复验——这是对诚实报告的奖赏，不是验收降级。该例外成立的前提是 checklist 硬证据链在档。

### 6. 多源引用核验（arXiv + 开源仓 + 微信文 + 第三方深读）

多源调研产出（论文 + 源码 + 微信文 + 第三方深读）必须核验全部引用源在场且格式可读（pdf 用 pymupdf 提取文字数、txt 用 `wc -l`、md 用 `wc -l`），缺任一个判部分在场。引用编号命中（如 arXiv 2609.20519、github.com/NVlabs/SoL-Pi）必须精确对应落盘快照文件。引用行号命中 + 内容空/错才判失实。

症状：worker 心跳自报「68 典籍全部实证，准备写报告」→ 迭代预算耗尽（90/90）中断，报告零落盘，成果只存在于已终止会话内存。注意：dispatcher 超时通知里的 `max_runtime=0s` 可能是展示 bug，真因去 kanban.db `task_runs.error` 查（如 `Iteration budget exhausted`），wall-clock（7200s）根本没到。

恢复四步（本次全程奏效，重试质量反超首跑）：
1. **心跳即恢复包**：`task_events` 表 kind=heartbeat 的 payload.note 记录了 worker 每次的结构性发现（如三级分类体系/ID 段位规律/方法验证）——中断后第一步回收这些，别让重试 worker 从零探索
2. 回收物写成 `recovery-context.md` 落盘到工作区
3. `kanban_comment` 注入重试卡：标「未读不开工」+ 指向恢复包 + 死因纪律两条（前 10 个工具调用内落报告骨架；先保验收下限再增量）
4. 效果实证：run256 骨架先行+资产复用声明，27 分钟完成，产出超验收线 75%（70 种典籍 vs 验收 40）

预防（建卡时写进 body）：「报告骨架落盘」列为前置验收项，时序约束优于事后纪律约定。

### Pitfalls (扫描书精读)
- **Don't OCR before scoping**: confirm with the user 全书 vs 核心章节 — full-book
  OCR of 500+ pages is ~1 hour; selective 精读 of the chapters that matter is
  often the right call. But if the user says 全书, do 全书.
- **Verify OCR quality on one page before the full run**: render one dense page
  to PNG, OCR it, read the text. Garbage in = garbage notes.
- **Anchors are mandatory**: per-page `<!-- pN -->` markers are what let the
  精读 notes and the final skill carry verifiable `pN` citations.
- **The synthesis is the deliverable, not the OCR**: OCR text is an intermediate;
  the user wants the distilled 方法论 → agent-capability mapping + skill 落地.

---

## 调研方法论检查清单（《社会研究方法》精读注入，2026-08-25）

> 完整 55 条清单见底座 skill **`research-methodology`**（开题 T1-T5 / 检索 S1-S10 /
> 证据 E1-E16 / 三角验证 V1-V4 / 报告 R1-R12 / 伦理 L1-L8 + 12 判例对照表，
> 全部带书源 pN 锚点）。本小节是骨架十条——**任何深研任务启动前与交付前各过一遍**。

> **知识检索纪律**：hindsight_recall 前预检短路（无关任务/冷启动 bank 不硬调）、关键词中英双语扩展（language-neutral 不译）、召回命中≠知识覆盖（topically-adjacent 禁包装成答案，同题换词≤3 次超即判 gap）、无覆盖按 Rejected/Partial/Gaps 三段模板输出禁猜答案、按任务类型选 hindsight_recall/hindsight_reflect/web_search 不平推。详见 `~/.hermes/profiles/_shared/03-evolution-memory/recall-discipline.md`。

1. **开题分型**：探索/描述/解释——探索型标注"不具代表性"，解释型必须过因果三问（p111-113）。
2. **概念化**：模糊问题先列维度+操作定义；比较前先对齐口径，口径不一禁止直接对比（p146-150, p43）。
3. **抽样框声明**：每条结论附来源集合+未覆盖声明；框错了样本量再大无用（《文学文摘》教训，p198, p215）。
4. **来源独立性**：同源转载链=1 个来源；交叉验证先查引用依赖（p332-333, p66-67）。
5. **反方检索义务**：每个关键结论配一次反方检索（相反关键词/怀疑者视角），矛盾案例写进报告（p333-334）。
6. **因果三问门禁**：有相关吗？时间顺序对吗？有第三变量吗？缺一则降级为"相关"（p114-116）。
7. **一致性≠真实性**：信度不保证效度；全网转载同一错误=来源一致但全错（p162）。
8. **报告三律**：披露局限 / 报告负面结果（搜不到=证据，写明"未找到 X 的公开证据"）/ 不把事后发现粉饰为预先计划（p91-93）。
9. **计数必报基数**：百分比必须给总样本数与独立来源数（p332-333）。
10. **不信自报**：来源自我声明（官网能力宣称/准确率/用户数）一律 Present 级以下，第三方实测才升级（p104）。

涉及抓取合规、涉人数据、争议议题时，另过 `research-methodology` 第 6 节伦理清单
（合规三问 / 数据敏感度分级 / 递归风险 / 议题价值不为方法免责两问）。

## 消歧判例、报告互链与侦察纪律（2026-09-08 增补，知识底座融合 C8/D6/D8）

**C8 消歧判例（同名异实的口径对齐训练案例）**：调研以书名/项目名/系统名等唯一输入开始时，同名多义是常态而非例外。判例：《心术全书》（通俗权谋汇编，1993，已绝版）与《管子》心术四篇（稷下道家哲学文献）是同名异实——前者是唯一书名精确匹配的出版物，后者是「心术」术语的哲学源头，且从未被任何来源称作《心术全书》这一书目。**双轨口径（用户裁决 1）**：凡引用《心术全书》必须带「通俗权谋汇编(1993,已绝版)」定性标注，价值取分类框架与对抗性视角、不作学术权威引用；凡哲学语境引「心术」一律指向《管子》四篇背景链。消歧产物是五类候选逐一定性的判例表（候选→身份→关键证据→判定），不是一句「已消歧」。
>
> 来源: synthesis-fusion-plan.md C8+§五裁决项1 / philosophy-logic-report.md §1.1（候选五类逐一判定实例，S1-S11）

**D6 报告互链约定（交叉引用网络）**：同一任务族的报告拆成多份时，每份报告带「共享术语表 + 相关报告互链」：报告内锚点指向本报告章节，跨报告引用写明 `报告文件名#章节`；跨报告的共享数字（同一实体在不同报告中的计数）必须显式核对一致，口径不同的分列不混用。
>
> 来源: synthesis-fusion-plan.md D6 / math-3books-report.md §2.1（普林斯顿数学指南交叉引用网络：三层条目织成可按需进入的图结构，[7][15]）

**D8 侦察先于行动（注脚）**：本 skill「调研完成后再创建团队」「Do NOT propose solutions while subagents are running」两条 Key Lessons 的古典同构——《孙子兵法·谋攻》「知彼知己，百战不殆」：派工（行动）之前先完成侦察（调研），基于真实调研数据决定团队规模与角色划分。
>
> 来源: synthesis-fusion-plan.md D8 / philosophy-logic-report.md §四 S46（ctext.org/sun-tzu/zhs 实测 200）

## Key Lessons

### "调研完成后再创建团队" means WAIT

The user explicitly said "调研完成后再创建团队 — 基于真实调研数据决定团队规模和角色划分".
This is a hard constraint: no team proposals until research is complete
and presented. The agent violated this by proposing a 7-profile team
after only fetching 3 articles, before any industry research was done.

### Do NOT second-guess user-specified parameters

User said "全部使用glm-5.2模型". The agent asked "模型分配：全部用
glm-5.2还是关键角色用k3？". When the user says "全部使用X", that means
ALL roles use X. No exceptions, no "but what about important roles?"
follow-up.

### Do NOT end research with "需要你确认"

"需要你确认：1.团队规模 2.模型分配 3.是否现在开始？" pushes decisions
back to the user. Either complete the task autonomously when the answer
is inferable from research data, or respect scope boundaries if the user
constrained scope.

### Subagent failure is recoverable

Two subagents hit "API call failed after 3 retries: Provider returned
an empty stream" — but both had collected 50+ tool calls of real data
in their transcripts. Mining transcripts recovered all data and the
final report was completed without re-dispatching.

## Related Skills

- **research-methodology** — 调研方法论底座（55 条检查清单，本 skill 的方法论来源）
- **evidence-based-research** — anti-hallucination citation rules
- **scope-discipline** — research-then-propose sequence enforcement
- **wechat-article-research** — WeChat article fetching with curl+regex
- **cognition-lattice §七A** — pre-output quality gate
