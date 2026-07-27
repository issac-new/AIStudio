---
name: research-tools
description: Academic research and content monitoring — arXiv paper search, blog/RSS monitoring, YouTube transcript analysis, LLM wiki knowledge base management, and Polymarket prediction market queries.
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, arxiv, blogwatcher, youtube, polymarket, rss, knowledge]
---

# Research Tools — Papers, Content Monitoring, and Data

Five tools for academic research, content monitoring, and data gathering.

## arXiv — Paper Search
Full reference: `references/arxiv.md`

Search by keyword, author, category, or ID:

```bash
arxiv search "transformer attention"
arxiv search --author "Karpathy" --max 5
arxiv search --cat cs.LG --max 10
```

## Blogwatcher — RSS/Atom Feed Monitoring
Full reference: `references/blogwatcher.md`

Monitor blogs and RSS feeds:

```bash
blogwatcher-cli add https://blog.example.com/feed.xml
blogwatcher-cli list
blogwatcher-cli fetch
blogwatcher-cli search "keyword"
```

## YouTube Content — Transcripts to Summaries
Full reference: `references/youtube-content.md`

Get YouTube transcripts then summarize/analyze:

```
youtube-transcript https://youtu.be/VIDEO_ID
# Then summarize with agent
```

## LLM Wiki — Knowledge Base Management
Full reference: `references/llm-wiki.md`

Build/query interlinked markdown knowledge bases from Karpathy's LLM Wiki.

## Polymarket — Prediction Markets
Full reference: `references/polymarket.md`

Query markets, prices, orderbooks, history:

```
polymarket markets --category "crypto"
polymarket prices "Will ETH reach $10k by 2026?"
```

## Reference Files

| File | Content |
|------|---------|
| `references/arxiv.md` | arXiv search by keyword, author, category, ID |
| `references/blogwatcher.md` | RSS/Atom blog monitoring |
| `references/youtube-content.md` | YouTube transcript extraction and analysis |
| `references/llm-wiki.md` | LLM knowledge base querying |
| `references/polymarket.md` | Prediction market queries |
