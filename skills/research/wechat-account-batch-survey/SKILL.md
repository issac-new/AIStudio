---
name: wechat-account-batch-survey
description: Harvest WeChat articles by account name. Use for surveys.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, wechat, batch-survey, capability-mapping, anti-bot]
    related_skills: [wechat-article-research, real-browser-antibot-bypass, evidence-based-research]
---

# WeChat Account Batch Survey

Harvest recent article metadata (title / date / snippet) across many WeChat
Official Accounts when you only have account names, not article URLs. Validated
at scale (180 accounts to 886 articles in ~20 min). Pairs with
wechat-article-research (single-URL full-text fetch) and feeds downstream
capability-gap analysis.

## When to Use

- User provides a list of public-account names (or a file like weixinlist.txt)
  and asks to survey their recent articles.
- User says "调研公众号文章完善agent" / "收集最近N篇" / "深度调研关注列表".
- You need article titles + dates across many accounts to do keyword analysis
  and map findings to agent teams / skills / SOUL.md gaps.

## When NOT to Use

- You already have specific mp.weixin.qq.com/s/ URLs: use wechat-article-research.
- You need full article body text: discover titles here, then fetch each URL with
  the src=11+timestamp+signature direct-link technique (see references).

## Core Pipeline (4 stages)

### Stage 1 — Account classification
Classify raw account names into tech / mgmt / other via keyword matching. Only
tech + mgmt are survey targets; other (local-services, schools, brands) is
dropped to save requests. Save to accounts_classified.json.

### Stage 2 — Robust serial discovery (the workhorse)
Endpoint: weixin.sogou.com/weixin?type=2&query=<account> (Sogou WeChat article
search). This is the one that works reliably with curl.

Anti-bot strategy (battle-tested):
1. Desktop UA first: Mozilla/5.0 (Macintosh; ...) Chrome/120 Safari/537.36.
2. If response contains antispider / 验证码 / len < 3000, wait 15-25s (jittered),
   retry once with wap endpoint + mobile UA:
   wap.sogou.com/web/searchList.jsp?keyword=<q>&rcer=h9AFhNpLW.
3. Still blocked: mark account EMPTY and continue (never abort the batch).
4. Sleep 5 + random()*3 seconds between accounts.

Parse the result page: extract <li id="sogou_vr_11002601_box_N"> blocks; each
has a title (<h3><a>...</a></h3>), a timestamp (timeConvert('1234567890')), and
a snippet. Keep top 5 per account.

Critical resilience pattern: checkpoint every 5 accounts — write partial JSON
AND a done.log of completed account names so a restart resumes without redoing
finished accounts.

Full runnable script: see references/batch-discovery-pipeline.md (the
wx_robust.py recipe). It produced 180 accounts / 886 articles at 100% success.

### Stage 3 — Keyword analysis
Run regex keyword buckets over all titles to find knowledge-domain distribution:
AI Agent, 大模型/LLM, RAG, AI编程/Copilot, 安全/漏洞, DevOps/SRE, 架构,
管理/产品, 芯片/[已移除], 开源/框架. Count per domain + distinct accounts + how
many are 2025-2026-recent. Save analysis_NNN.json.

### Stage 4 — Downstream mapping (capability-gap)
Map domains to agent teams (swarm / hack / product / ops / [已移除] / platform /
[已移除]). For each team, list existing capabilities vs. gaps surfaced by recent
articles, with the source account as evidence. Output a HIGH / MED / LOW
prioritized enhancement list with concrete SOUL.md insertion points.

## Anti-Bot Knowledge (what works, what fails)

| Channel | curl? | Notes |
|---------|-------|-------|
| weixin.sogou.com/weixin?type=2 | Yes (desktop UA) | Primary. Article search; title+time+snippet. |
| wap.sogou.com/web/searchList.jsp | Yes (mobile UA) | Fallback when desktop triggers CAPTCHA. |
| www.sogou.com/web?query=site:mp.weixin.qq.com+<name> | 403 after ~3 reqs | IP rate-limit. Avoid for batches. |
| weixin.sogou.com /link?url= redirect | CAPTCHA on follow | The redirect step is the antispider gate. Do NOT follow. |
| cn.bing.com | No WeChat indexing | Returns account sites / Zhihu / Baike. |
| baidu.com | Security verification | Blocks curl entirely. |

Key insight: the Sogou WeChat article search (type=2) is far more bot-tolerant
than the web search (www.sogou.com/web). For batches, always start with type=2.
The /link?url= redirect step is the hard antispider gate — harvest metadata from
the search-list HTML and stop there; only attempt the redirect for a small number
of high-value full-text fetches.

## Full-Text Fetch (optional)

When you need full body text for a few top articles, use the
src=11+timestamp+signature direct-link technique documented in
references/batch-discovery-pipeline.md. Key points:
- Signed links are minute-scale expiry — fetch immediately after extraction.
- curl works on the fresh signed link directly (no browser needed).
- Extract var msg_title, var nickname, var ct (timestamp), and the
  id="js_content" div — same as wechat-article-research.

## Output Artifacts

| File | Purpose |
|------|---------|
| accounts_classified.json | tech/mgmt/other split of input account list |
| batch_all.json | all harvested article metadata |
| analysis_NNN.json | keyword-domain distribution + all articles flattened |
| capability_enhancement_report.md | team-gap analysis with prioritized SOUL.md actions |

## Pitfalls

- delegate_task subagents may hit their own provider quota (e.g. Kimi HTTP 403
  billing limit) and abort after 1 call. For large batches, run a Python script
  via terminal(background=true) instead of delegating — you control the model
  budget directly.
- Sogou /link?url= looks like it gives you articles but it is a trap — the
  redirect page is the antispider gate. Harvest the search-list HTML; do not
  follow redirects for batches.
- Signed src=11 links expire in minutes. If a full-text fetch returns empty,
  re-search to get a fresh link; do not retry the stale URL.
- computer_use + WeChat GUI is not viable for batch harvesting. cua-driver
  screen-capture returns 0x0 on WeChat Electron windows, buttons have no AX
  name, and Chinese input via AppleScript keystroke fails. Use the Sogou
  pipeline instead. (See references/batch-discovery-pipeline.md.)

## Related Skills

- wechat-article-research (default profile) — single-known-URL full-text fetch.
  Use AFTER this skill discovers high-value URLs, or when the user hands you
  URLs directly.
- real-browser-antibot-bypass — drive the host real browser (Edge/Safari) to
  bypass CAPTCHAs. Use only when the Sogou pipeline is fully blocked AND you
  need full text for a handful of articles.
- evidence-based-research — anti-hallucination methodology; every claim must
  trace to a harvested article.
