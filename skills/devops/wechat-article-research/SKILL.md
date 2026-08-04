---
name: wechat-article-research
description: >-
  Fetch and extract content from WeChat Official Account (mp.weixin.qq.com) articles using curl + regex parsing, then produce structured analysis reports. Use when the user provides WeChat article URLs and asks for research, analysis, or content extraction.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, wechat, content-extraction, analysis]
    related_skills: [wechat-article-extractor, evidence-based-research]
---

# WeChat Article Research

Fetch, extract, and analyze WeChat Official Account articles (`mp.weixin.qq.com/s/...` URLs) when the user provides links and asks for research, deep-dive analysis, or content reproduction.

## When to Use

- User provides one or more `mp.weixin.qq.com` URLs
- User asks to "调研分析" (research and analyze) WeChat articles
- User wants to "复刻" (reproduce) technology described in a WeChat article
- User asks to extract structured content from WeChat articles

## Fetching Strategy

### curl + regex extraction (reliable, no dependencies)

The `wechat-article-extractor` skill requires npm packages (cheerio, dayjs, request-promise) that may not be installed. Use curl + regex as a zero-dependency alternative:

```python
import subprocess, re, html as html_module

r = subprocess.run(
    ["curl", "-sL", "-A",
     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
     url],
    capture_output=True, text=True, timeout=30
)
html = r.stdout

# Extract content from rich_media_content div
content_match = re.search(
    r'id="js_content"[^>]*>(.*?)</div>\s*<script',
    html, re.DOTALL
)
if content_match:
    text = re.sub(r'<[^>]+>', '\n', content_match.group(1))
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = html_module.unescape(text.strip())
```

### Batch fetching

For multiple URLs, loop in `execute_code` and save results as JSON:

```python
results = []
for url in urls:
    # ... fetch and extract ...
    results.append({"url": url, "title": title, "content": text})

with open("wechat-articles.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
```

## Analysis Report Structure

After fetching all articles, produce a structured analysis report:

```markdown
# <Topic> Analysis Report

## Article N: <Title> (<source>)

### Core Architecture / Technology
- Key technical components and their relationships
- What is novel vs. established

### Reproducibility Assessment
| Component | Can reproduce? | Approach |
|-----------|---------------|----------|
| Software algorithms | Yes | Python/JS implementation |
| Hardware components | No | Requires physical devices |
| Frameworks | Yes | Open-source equivalents |

### Module Decomposition
Break the technology into implementable modules with clear boundaries. Each module should be assignable to a developer/team.

## Reproduction Plan
- Tech stack selection
- Module list with dependencies
- Team composition recommendation
```

## Key Pitfalls

### WeChat HTML structure varies

Not all articles use the same div structure. Some use `class="rich_media_content"` instead of `id="js_content"`. Always implement a fallback regex.

### Title extraction

The `<title>` tag is often empty for WeChat articles. Extract from JavaScript variables instead: `re.search(r"var\s+msg_title\s*=\s*['\"]([^'\"]*)['\"]", html)`.

### Content length varies dramatically

Articles can be 2K-10K chars. Long articles may be truncated by the regex if the closing `</div>` pattern appears inside the content.

### Do NOT present fabricated data

When analyzing articles about technology or products, the analysis report must contain ONLY information from the actual article content. Do NOT invent specifications, benchmarks, or features not mentioned in the source. This is enforced by the `cognition-self-check` skill's "fact vs fabrication" check.

## Related Skills

- **wechat-article-extractor** — npm-based extraction with metadata (author, publish time, account info). Use when you need full metadata or the curl+regex approach fails on complex article structures.
- **evidence-based-research** — Anti-hallucination research methodology. Every factual claim must be traceable to a source.
