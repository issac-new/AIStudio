---
name: personnel-academic-footprint
description: >-
  Profile a researcher/founder's technical footprint from public academic
  databases (DBLP, Semantic Scholar, arXiv, IEEE Xplore) — publication
  record, co-author network, technical domain, disambiguation from
  same-name collisions. Use when the task asks to 画像 a person's 技术足迹,
  学术背景, or when due-diligence on a founder/CTO requires anchoring
  their identity via publications before touching company-specific
  sources. Covers the DBLP REST API (primary), Semantic Scholar
  (rate-limited supplementary), arXiv API (XML), and the co-author pivot
  search technique for common Chinese names.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [osint, academic, dblp, personnel-profiling, due-diligence]
    related_skills:
      - osint-asset-mapping
      - deep-research-workflow
      - scope-discipline
---

# Personnel Academic Footprint Profiling

Build a publication-and-citation map of a researcher/founder from
public academic databases. The publication record anchors the person's
identity, co-author network, and technical domain — this disambiguates
them from same-name collisions before you touch company-specific sources.

## When to use

- Task asks to 画像 a person's 技术足迹 / 学术背景 / 发表记录
- Due diligence on a founder/CTO whose academic credentials matter
- Verifying a claimed award (e.g. "Schelkunoff Best Paper Award") via
  the publication record rather than press releases
- Mapping a co-author network to identify team/recruitment connections

## Source priority ladder

| Source | Role | Auth needed? | Rate limit |
|--------|------|-------------|------------|
| **DBLP REST API** | Primary — free, comprehensive CS bibliography | No | Lenient |
| **Semantic Scholar API** | Supplementary — DOIs, ArXiv cross-links | No (API key optional) | Aggressive 429 |
| **arXiv API** | Supplementary — preprints, AI/ML methods | No | Lenient |
| **IEEE Xplore search** | For IEEE-published papers (ICCAD/DAC/DATE) | No for search page | JS-rendered, limited |
| **Google Scholar** | ❌ Blocked (CAPTCHA) | — | Do not use |
| **Wikipedia** | Investor/competitor context only, NOT personnel | No | None |

## DBLP REST API (primary)

`https://dblp.org/search/publ/api?q=<query>&format=json&h=<limit>`

### Parsing

```python
import json
data = json.loads(text)
hits = data.get('result', {}).get('hits', {})
total = hits.get('@total', '0')
entries = hits.get('hit', [])
for entry in entries:
    info = entry.get('info', {})
    title = info.get('title', '')
    year = info.get('year', '')
    venue = info.get('venue', '')
    authors_raw = info.get('authors', {}).get('author', [])
    # Normalize: can be single dict when only 1 author
    if isinstance(authors_raw, dict):
        authors_raw = [authors_raw]
    authors = [a.get('text', '') if isinstance(a, dict) else str(a)
               for a in authors_raw]
    doi = info.get('doi', '')
    ee = info.get('ee', '')  # external link
```

### Query 500 errors (critical)

Multi-word queries with certain term combinations return HTTP 500:

| Query | Result |
|-------|--------|
| `Qing+He+parasitic` | ❌ 500 |
| `Qing+He+extraction` | ✅ OK (85 hits) |
| `Qing+He+ICCAD` | ✅ OK (6 hits) |
| `Qing+He+DAC` | ✅ OK (30 hits) |
| `Qing+He+DATE` | ✅ OK (10 hits) |
| `%22Qing+He%22+on-chip` | ✅ OK (14 hits, exact phrase) |
| `Qing+He+Broadcom` | ✅ OK (0 hits) |
| `Qing+He+Purdue` | ❌ 500 |

**Rule**: if a query 500s, drop one term, switch the conjunction, or use
quoted exact-phrase (`%22...%22`) syntax. Retry with a simpler query.

### Author disambiguation

DBLP appends numeric suffixes to disambiguate common names:

| DBLP key | Identity |
|----------|----------|
| `Qing He 0007` | NLP researcher (Renmin Univ, aspect sentiment) |
| `Qing He 0003` | CAS agent-systems researcher |
| `Qing He` (no suffix) | Not yet assigned a disambiguation pid |

When the target has no suffix, attribute unsuffixed entries to the same
person **only when venue + co-authors are consistent across hits**.
Cross-check by looking at the co-author set — if the same co-authors
appear across multiple papers, they are the same person.

### Co-author pivot search (key technique)

When the target name is too common (85+ hits across many unrelated
domains), search by a **domain-specific co-author** instead of by topic:

```
# Direct search: 85 hits, most are NLP/ML, hard to filter
?q=Qing+He+extraction

# Co-author pivot: 7 hits, ALL correctly the [已移除] Qing He
?q=Lingli+Wang+Qing+He
```

The co-author acts as a domain filter. Choose a co-author who is:
- Well-known in the target's specific subfield ([已移除], not general CS)
- Prolific enough to share authorship on multiple papers
- Unlikely to collaborate with the same-name researchers in other fields

For [已移除] researchers, good pivots: `Lingli Wang` (Fudan), `Yu He`,
`Wai-Shing Luk`, `Lei He` (UCLA). For NLP: `Ping Luo`, `Fen Lin`.

## Semantic Scholar (supplementary, rate-limited)

`https://api.semanticscholar.org/graph/v1/paper/search?query=...&fields=title,authors,year,venue,externalIds`

### Rate limit behavior (verified 2026-07)

- **3 consecutive queries → HTTP 429**, even with 5-15s delays
- 20s delay after 429 → still 429 (cool-down period is longer than 20s)
- Author-search endpoint (`/author/search`) also rate-limited

**Strategy**: 1-2 queries max per session. If you hit 429, abandon S2
and fall back to DBLP + arXiv. Do NOT retry in a loop.

### Author search limitations

`/author/search?query=Qing+He` returns 20 authors, but:
- `affiliations` field is `null` for ALL entries — cannot use for
  affiliation-based disambiguation
- Name variants returned: "Q. He", "He Qing", "Qingwen He", etc.
- `paperCount` and `citationCount` are populated but not reliable for
  distinguishing same-name researchers (a botanist "He Qing" with 22
  papers and a tobacco-chemistry "He Qing" with 9 papers both appear)

### When S2 IS useful

- You need `externalIds.DOI` to cross-link a DBLP paper to its full text
- You need `externalIds.ArXiv` to find a preprint version
- One-shot author-lookup (not bulk search)

## arXiv API (supplementary, XML)

`http://export.arxiv.org/api/query?search_query=au:%22Qing+He%22+AND+ti:parasitic&max_results=30`

- Atom XML format — parse with `xml.etree.ElementTree`
- Namespace: `http://www.w3.org/2005/Atom`
- Also extract `arxiv:` namespace for `arxiv:primary_category`

```python
import xml.etree.ElementTree as ET
root = ET.fromstring(content)
ns = {'atom': 'http://www.w3.org/2005/Atom',
      'arxiv': 'http://arxiv.org/schemas/atom'}
entries = root.findall('atom:entry', ns)
for e in entries:
    title = e.find('atom:title', ns).text.strip()
    year = e.find('atom:published', ns).text[:4]
    authors = [a.find('atom:name', ns).text
               for a in e.findall('atom:author', ns)]
    arxiv_id = e.find('atom:id', ns).text.strip()
```

### Domain coverage caveat

[已移除] parasitic-extraction / signoff papers **rarely appear on arXiv** —
they go to IEEE Xplore (ICCAD, DAC, DATE, ISCAS) or ACM DL instead.
arXiv is better for AI-for-[已移除] and ML-method papers.

**Treat zero arXiv hits as expected for hardware/[已移除] topics, not as
evidence of non-existence.** The researcher may be prolific in IEEE
venues that arXiv doesn't index.

## IEEE Xplore (limited, JS-rendered)

`https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=<query>`

- Search page returns ~36KB but is heavily JS-rendered — `curl` gets
  the shell, not the results
- No JSON API without institutional auth
- **Do NOT rely on IEEE Xplore for bulk paper discovery** — use DBLP
  instead, then resolve individual DOIs via `https://doi.org/<doi>`
  (which redirects to the publisher, but may hit AWS WAF CAPTCHA)

## Wikipedia (investor/competitor context, NOT personnel)

Wikipedia is stable, not rate-limited, and carries structured infobox
data useful for **investor/competitor** context, but it does NOT have:

- Individual researcher CVs or affiliation pages
- IEEE society award winner lists (e.g. Schelkunoff Award)
- Private company shareholder registries

### Useful articles for [已移除]/semiconductor due diligence

| Article | What it provides |
|---------|-----------------|
| `China_Integrated_Circuit_Industry_Investment_Fund` | Big Fund phases I/II/III, AUM ($95.7B), owners (MoF 36.74%, CDB 22.29%, China Tobacco 11.14%), investee list |
| `Empyrean_Technology` | 华大九天: owners (CEC + Big Fund), revenue (¥1.01B 2023), products, state-owned |
| `Cadence_Design_Systems` | Competitor products (Quantus Extraction = parasitic RC) |
| `Synopsys` | Competitor products (StarRC = parasitic extraction) |
| `SMIC` | Foundry context, Big Fund investment history |

### Parsing investment portfolio lists

The Big Fund article lists investees in a `<div class="div-col">` block
with `[[Company]]` wiki-links — extract with:

```python
import re
block = re.search(r'class="div-col"[^>]*>(.*?)</div>', html, re.DOTALL)
if block:
    companies = re.findall(r'\[\[([^\]|]+)', block.group(1))
```

## Report structure for personnel profiles

```
## <Person Name> 技术画像

### 学术身份
- DBLP 检索结果: N 篇论文, 涉及会议/期刊列表
- 合作者网络: 核心合作者 (>=2篇共同论文), 所属机构
- 技术领域: 基于论文标题关键词聚类

### 代表性论文 (table)
| 年份 | 标题 | 会议/期刊 | 合作者 | DOI |

### 合作者网络分析
- 核心合作者 → 机构关联 → 团队/招聘线索
- 跨机构合作 → 产学研合作证据

### 奖项与荣誉验证
- 声称的奖项: <award name>
- 验证状态: ✅ DBLP确认 / ❌ 未找到公开记录 / ⚠️ 需学会官网核实
- 验证方法说明
```

## Pitfalls

- **Same-name collision is the #1 risk**. "Qing He" on DBLP has at
  least 3 distinct researchers (NLP, CAS agent-systems, [已移除]). Always
  filter by venue + co-author consistency, never by name alone.
- **DBLP 500 errors are not your fault** — simplify the query, don't
  retry the exact same string.
- **Semantic Scholar 429 is not recoverable within a session** —
  abandon S2, don't loop.
- **Zero arXiv hits ≠ non-existent** for [已移除]/hardware topics. arXiv
  indexes AI/ML, not ICCAD/DAC. Check IEEE venues via DBLP instead.
- **Do NOT claim an award is unverified just because Wikipedia doesn't
  list it** — IEEE society awards (Schelkunoff, Guillemin-Cauer, etc.)
  are on the society's own site, not Wikipedia. State "需学会官网核实"
  rather than "未找到".
- **GitHub usernames collide** — `phlexing` on GitHub is an unrelated
  Ruby project (marcoroth/phlexing). Always verify org ownership before
  attributing a repo to a person or company.

## Related skills

- **osint-asset-mapping** — company-level public-asset mapping (this
  skill complements it with personnel-level academic profiling)
- **deep-research-workflow** — multi-source research with subagents
- **scope-discipline** — when user constrains to "只调研不触碰目标"

## References

See `references/academic-database-techniques.md` for detailed per-API
parsing patterns, rate-limit signatures, and the disambiguation
decision tree.
