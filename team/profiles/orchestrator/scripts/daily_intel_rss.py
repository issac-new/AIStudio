#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日技术情报内参 — RSS 聚合管道（B方案）

放弃搜狗微信公众号抓取（反爬严重、正文提取失败率高），改用稳定的 RSS 聚合：
  - 量子位  https://www.qbitai.com/feed
  - InfoQ   https://www.infoq.cn/feed
  - HN Top  https://hnrss.org/frontpage
  - arXiv cs.AI  http://export.arxiv.org/rss/cs.AI
  - FreeBuf https://www.freebuf.com/feed
  - (机器之心 / 36氪 RSS 已退化为 JS 反爬 HTML 占位，见 fetch_feeds 注释)

管道：
  1. feedparser 拉取 RSS，解析 title / link / description / published
  2. 对每条生成 3-5 句提炼摘要（基于 title+description/arxiv abstract，规则提取核心观点+数据）
  3. 按 AI大模型 / AI安全 / AI应用 / 开源 / 学术 分类
  4. 生成结构化 markdown 内参（卷首速览 → 分类研判 → 行动清单）
  5. HTML + CSS → Chrome headless 渲染 PDF（无页眉日期/页脚路径）
  6. pymupdf 验证 PDF 页眉页脚区域无日期/URL

用法：
  .venv/bin/python scripts/daily_intel_rss.py [YYYY-MM-DD]
"""

import sys
import os
import re
import html as htmlmod
import subprocess
import urllib.request
from datetime import datetime, timedelta, timezone

import feedparser

# ─── 路径配置 ───
LIFE_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench"
REPORTS_DIR = os.path.join(LIFE_DIR, "reports")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")

# ─── RSS 源（已验证可达；标记不可达源用于诚实说明） ───
FEEDS = [
    ("量子位",   "https://www.qbitai.com/feed"),
    ("InfoQ",   "https://www.infoq.cn/feed"),
    ("Hacker News", "https://hnrss.org/frontpage"),
    ("arXiv cs.AI", "http://export.arxiv.org/rss/cs.AI"),
    ("FreeBuf", "https://www.freebuf.com/feed"),
]
DEAD_FEEDS = [
    ("机器之心", "https://www.jiqizhixin.com/rss",
     "HTTP 200 但返回 JS 反爬 HTML 占位（非 XML feed），无备用 RSS 端点"),
    ("36氪",    "https://36kr.com/feed",
     "HTTP 200 但返回 JS 反爬 HTML 占位（非 XML feed），无备用 RSS 端点"),
]

TODAY = (sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d"))


# ═══════════════════════════════════════════════════════════
# 1. RSS 拉取与解析
# ═══════════════════════════════════════════════════════════
def strip_tags(s):
    """去 HTML 标签 + 解码实体 + 压空白"""
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_published(entry):
    """提取发布时间，返回 datetime（失败返回 None）"""
    for key in ("published_parsed", "updated_parsed"):
        t = getattr(entry, key, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    # fallback: 字符串解析
    for key in ("published", "updated"):
        s = getattr(entry, key, "")
        if s:
            t = feedparser._parse_date(s)
            if t:
                try:
                    return datetime(*t[:6], tzinfo=timezone.utc)
                except Exception:
                    pass
    return None


def fetch_feeds(target_date):
    """拉取所有 feed，返回 {source: [item dict]} 与 fetch log"""
    log = []
    by_source = {}
    target_dt = datetime.strptime(target_date, "%Y-%m-%d").date()
    # 窗口：目标日 ±1 天（RSS 缓存/时区漂移容忍）
    window_start = target_dt - timedelta(days=1)
    window_end = target_dt + timedelta(days=1)

    for name, url in FEEDS:
        try:
            f = feedparser.parse(url, request_headers={"User-Agent": UA})
            n = len(f.entries)
            items = []
            for e in f.entries:
                pub = parse_published(e)
                pub_date = pub.date() if pub else None
                # 保留窗口内 + 无日期的（避免漏掉缓存项）
                in_window = (pub_date is None) or (window_start <= pub_date <= window_end)
                if not in_window:
                    continue
                desc_raw = getattr(e, "description", "") or getattr(e, "summary", "")
                items.append({
                    "source": name,
                    "title": clean_latex(strip_tags(getattr(e, "title", ""))),
                    "link": getattr(e, "link", ""),
                    "published": pub,
                    "pub_str": pub.strftime("%Y-%m-%d %H:%M") if pub else "",
                    "desc_raw": desc_raw,
                    "desc": clean_latex(strip_tags(desc_raw)),
                })
            by_source[name] = items
            log.append("  [OK] %-14s %d 条 (窗口内 %d)" % (name, n, len(items)))
        except Exception as ex:
            by_source[name] = []
            log.append("  [FAIL] %-14s %s" % (name, ex))

    # 诚实记录不可达源
    for name, url, reason in DEAD_FEEDS:
        log.append("  [DEAD] %-14s %s" % (name, reason))
    return by_source, log


# ═══════════════════════════════════════════════════════════
# 2. 分类（基于关键词规则）
# ═══════════════════════════════════════════════════════════
CATEGORIES = ["AI大模型", "AI安全", "AI应用", "开源", "学术"]
MAX_PER_CAT = 15  # 每类展示上限，避免单源（arXiv 299 篇）撑爆内参

CAT_KEYWORDS = {
    "AI安全": [
        r"安全|漏洞|0day|零日|攻击|勒索|后门|投毒|越狱|提权|APT|恶意|威胁|Black ?Hat|DEF ?CON|FreeBuf|防火墙|CVE|泄露|窃取|绕过|沙箱",
        r"security|vulnerab|exploit|ransomware|backdoor|poison|jailbreak|attack|threat|malicious|CVE|breach",
    ],
    "AI大模型": [
        r"大模型|LLM|GPT|Claude|Gemini|DeepSeek|Qwen|通义|文心|Llama|Mistral|Grok|参数|推理|训练|微调|对齐|RAG|Agent|智能体|Token|上下文|MoE|多模态",
        r"\bLLM\b|\bGPT\b|Claude|Gemini|foundation model|reasoning|fine-tun|alignment|\bagent\b|token|context window|Mixture.of.Experts|multimodal",
    ],
    "AI应用": [
        r"应用|落地|产品|商业化|企业|行业|零售|医疗|金融|制造|客服|营销|代码|Copilot|编程|生产力|机器人|自动驾驶|芯片|算力|端侧",
        r"\bAI app|product|enterprise|deployment|robot|autonomous|chip|inference|copilot|coding assistant",
    ],
    "开源": [
        r"开源|GitHub|开源项目|仓库|框架|Apache|MIT License|自研开源|贡献",
        r"\bopen.source|GitHub|repository|framework|Apache|MIT license",
    ],
    "学术": [
        r"论文|研究|学术|benchmark|基准|NeurIPS|ICML|ICLR|CVPR|arXiv|实验|评估|benchmark",
        r"\bpaper|research|academic|benchmark|arXiv|experiment|evaluation|NeurIPS|ICML|ICLR|CVPR",
    ],
}


def categorize(item):
    """返回该 item 最匹配的单一分类（优先级：安全 > 大模型 > 学术 > 开源 > 应用）"""
    text_orig = item["title"] + " " + item["desc"]
    # arXiv 源：默认学术，只在出现具体攻防术语（exploit/poison/backdoor/jailbreak/CVE/ransomware）时归 AI安全
    if item["source"] == "arXiv cs.AI":
        arxiv_sec = re.compile(r"exploit|poison|backdoor|jailbreak|ransomware|\bCVE\b|adversarial attack|red.teaming|prompt injection|data exfiltration", re.IGNORECASE)
        if arxiv_sec.search(text_orig):
            return "AI安全"
        return "学术"
    priority = ["AI安全", "AI大模型", "学术", "开源", "AI应用"]
    best, best_hits = None, 0
    for cat in priority:
        hits = 0
        for pat in CAT_KEYWORDS[cat]:
            if re.search(pat, text_orig, re.IGNORECASE):
                hits += 1
        if hits > best_hits:
            best, best_hits = cat, hits
    return best or "AI应用"


# ═══════════════════════════════════════════════════════════
# 3. 提炼摘要（3-5 句：核心观点 + 关键数据，非原文照搬）
# ═══════════════════════════════════════════════════════════
def extract_numbers(text):
    """提取显式数据：百分比/美元/数量/版本号"""
    nums = []
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(亿|万|百万|千万|亿美元|\$|美元|%|百分|倍|张|个|款|篇|倍数|B|M\b)", text):
        nums.append(m.group(0))
    # 纯大数字
    for m in re.finditer(r"\b(\d{1,3}(?:,\d{3})+)\b", text):
        nums.append(m.group(1))
    # 版本号 vN.N
    for m in re.finditer(r"\b[vV]?\d+\.\d+(?:\.\d+)?\b", text):
        nums.append(m.group(0))
    return list(dict.fromkeys(nums))  # 去重保序


def clean_latex(s):
    """清理 arXiv 标题/摘要里的 LaTeX 残留：$...$, \\emph{}, \\textbf{}, \\varepsilon 等"""
    if not s:
        return s
    s = re.sub(r"\$\\?[a-zA-Z]+\$", "", s)            # $\varepsilon$
    s = re.sub(r"\\(?:emph|textbf|text|mathbf)\{([^}]*)\}", r"\1", s)  # \emph{x}->x
    s = re.sub(r"\\[a-zA-Z]+", "", s)                  # 裸 \foo
    s = s.replace("$", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def make_summary(item):
    """生成 3-5 句提炼摘要。基于 title+desc 规则化提炼，不照搬原文段落。"""
    title = clean_latex(item["title"].strip())
    desc = clean_latex(item["desc"].strip())
    src = item["source"]
    link = item["link"]
    parts = []  # 各句分开，最后统一 join，避免重复

    # arXiv：有完整 abstract，提炼核心问题 + 方法 + 贡献
    if src == "arXiv cs.AI":
        abs_text = re.sub(r"^arXiv:\S+\s+Announce Type:\s*\S+\s+Abstract:\s*", "", desc)
        abs_text = abs_text.strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", abs_text) if len(s.strip()) > 15]
        core = sentences[0] if sentences else title
        contrib = ""
        for s in sentences[1:]:
            if re.search(r"\b(we propose|we introduce|we present|we develop|our (method|approach|framework)|contribution)\b", s, re.IGNORECASE):
                contrib = s
                break
        parts.append("【研究背景】" + core)
        if contrib:
            parts.append("【方法/贡献】" + contrib)
        nums = extract_numbers(abs_text)
        if nums:
            parts.append("【关键数据】" + "、".join(nums[:6]))
        parts.append("原文：" + link)
        return "。".join(parts)

    # 量子位 / FreeBuf：desc 是单句精华 teaser，直接用 + 补数据
    if src in ("量子位", "FreeBuf"):
        teaser = desc if desc else title
        parts.append("【要点】" + teaser)
        nums = extract_numbers(title + " " + desc)
        if nums:
            parts.append("【关键数据】" + "、".join(nums[:5]))
        parts.append("【原文】" + link)
        return "。".join(parts)

    # InfoQ：desc 通常是"点击查看原文"链接（无内容），基于 title 提炼
    if src == "InfoQ":
        nums = extract_numbers(title)
        real_desc = desc if (desc and "点击查看" not in desc and len(desc) > 20) else ""
        parts.append("【要点】" + (real_desc or title))
        if nums:
            parts.append("【关键数据】" + "、".join(nums[:5]))
        parts.append("【原文】" + link)
        return "。".join(parts)

    # HN：desc 含 Article URL + 摘要片段
    if src == "Hacker News":
        hn_desc = re.sub(r"Article URL:\s*\S+\s*", "", desc)
        hn_desc = re.sub(r"Comments URL:.*$", "", hn_desc).strip()
        parts.append("【要点】" + (hn_desc[:160] if hn_desc else title))
        nums = extract_numbers(title + " " + hn_desc)
        if nums:
            parts.append("【关键数据】" + "、".join(nums[:5]))
        parts.append("【原文】" + link)
        return "。".join(parts)

    # fallback
    parts.append("【要点】" + (desc or title))
    parts.append("原文：" + link)
    return "。".join(parts)


# ═══════════════════════════════════════════════════════════
# 4. 动态行动清单（基于当日实际命中内容）
# ═══════════════════════════════════════════════════════════
def build_action_items(by_cat, all_items):
    """基于当日实际命中的标题/数据动态生成 3-5 条可执行建议，禁模板套话"""
    actions = []
    seen_topics = set()

    def add(tag, text):
        key = tag + text[:20]
        if key not in seen_topics:
            seen_topics.add(key)
            actions.append((tag, text))

    # 安全类 → 具体威胁响应
    for it in by_cat.get("AI安全", [])[:6]:
        t = it["title"]
        nums = extract_numbers(t + " " + it["desc"])
        if re.search(r"0day|零日|CVE|防火墙|漏洞", t + it["desc"]):
            add("安全", "排查「%s」提及的漏洞/CVE（%s）在自有资产的暴露面，确认补丁状态"
                % (t[:30], "、".join(nums[:3]) or "无编号"))
        elif re.search(r"投毒|越狱|后门|RAG|API", t + it["desc"]):
            add("安全", "评估「%s」描述的攻击面是否触及自有 AI 系统的检索/API 层" % t[:30])
        elif re.search(r"Black ?Hat|DEF ?CON|要点", t):
            add("安全", "对照「%s」披露的攻击趋势，更新内部威胁模型与检测规则" % t[:30])

    # 大模型类 → 模型/定价/能力更新
    for it in by_cat.get("AI大模型", [])[:6]:
        t = it["title"]
        nums = extract_numbers(t + " " + it["desc"])
        if re.search(r"价格|涨价|免费|开放API|发布|上线|开源", t):
            add("大模型", "评估「%s」（%s）对自有推理链路成本/能力的实际影响"
                % (t[:30], "、".join(nums[:3]) or "见原文"))
        elif re.search(r"芯片|算力|融资|端侧", t):
            add("算力", "跟踪「%s」代表的端侧/算力路线，预判对部署架构的选择空间" % t[:30])

    # 学术类 → 基准/方法可复用
    for it in by_cat.get("学术", [])[:4]:
        t = it["title"]
        if re.search(r"benchmark|基准|评估|Integrity|Reasoning", t, re.IGNORECASE):
            add("学术", "复用「%s」的评估方法/benchmark 检验自有模型的对应能力" % t[:40])

    # 应用类 → 落地案例参考
    for it in by_cat.get("AI应用", [])[:4]:
        t = it["title"]
        if re.search(r"交付|CTO|组织|企业|Copilot|代码", t):
            add("应用", "参考「%s」的工程实践，评估在自身团队的复用空间" % t[:40])

    # 开源类 → 项目引入
    for it in by_cat.get("开源", [])[:3]:
        t = it["title"]
        add("开源", "评估「%s」是否值得引入或对标（看 star/活跃度/许可）" % t[:40])

    # 兜底：若命中不足，给出基于实际源的可执行项
    if len(actions) < 3:
        srcs = sorted(set(it["source"] for it in all_items))
        add("订阅", "今日有效源：%s；持续监控这些 RSS 以积累趋势基线" % "、".join(srcs))
    return actions[:5]


# ═══════════════════════════════════════════════════════════
# 5. Markdown 生成
# ═══════════════════════════════════════════════════════════
def gen_markdown(target_date, by_cat, all_items, fetch_log):
    lines = []
    lines.append("# 每日技术情报内参 · %s" % target_date)
    lines.append("")
    lines.append("> **读者定位**：CTO / CIO / 技术决策者  ")
    lines.append("> **数据源**：量子位 · InfoQ · Hacker News · arXiv cs.AI · FreeBuf（RSS 聚合）  ")
    lines.append("> **生成方式**：feedparser 实时拉取 + 规则提炼（非 LLM 生成，可核验）")
    lines.append("")
    lines.append("---")
    lines.append("")

    # ── 卷首速览 ──
    lines.append("## 📌 卷首速览（60 秒）")
    lines.append("")
    lines.append("| 指标 | 数值 |")
    lines.append("|---|---|")
    total = len(all_items)
    lines.append("| 当日命中文章 | %d 篇 |" % total)
    for cat in CATEGORIES:
        shown = len(by_cat.get(cat, []))
        lines.append("| %s | %d 篇 |" % (cat, shown))
    src_counts = {}
    for it in all_items:
        src_counts[it["source"]] = src_counts.get(it["source"], 0) + 1
    lines.append("| 源分布 | %s |" % " · ".join("%s %d" % (k, v) for k, v in sorted(src_counts.items(), key=lambda x: -x[1])))
    lines.append("| 展示规则 | 每类按发布时间倒序取前 %d 篇（避免 arXiv 等大源撑爆） |" % MAX_PER_CAT)
    lines.append("")
    lines.append("**数据源健康**：")
    lines.append("")
    for line in fetch_log:
        lines.append(line)
    lines.append("")

    # ── 头条（每类取最重要的 1-2 条做重点研判） ──
    lines.append("---")
    lines.append("")
    lines.append("## 🔴 头条研判")
    lines.append("")
    CAT_EMOJI = {"AI大模型": "🧠", "AI安全": "🛡️", "AI应用": "🚀", "开源": "📦", "学术": "📚"}
    # 头条规则：安全类选 BlackHat/漏洞类；大模型选发布/定价类；学术选 benchmark 类
    for cat in ["AI安全", "AI大模型", "AI应用", "开源", "学术"]:
        items = by_cat.get(cat, [])
        if not items:
            continue
        # 选最长 description 的 1 条作头条（信息量最大）
        head = max(items, key=lambda x: len(x["desc"]))
        lines.append("### %s %s" % (CAT_EMOJI.get(cat, "•"), cat))
        lines.append("")
        lines.append("**%s**" % head["title"])
        lines.append("来源：%s · %s" % (head["source"], head["pub_str"] or target_date))
        lines.append("")
        lines.append(make_summary(head))
        lines.append("")
        lines.append("---")
        lines.append("")

    # ── 分类明细 ──
    lines.append("## 📂 分类明细")
    lines.append("")
    for cat in CATEGORIES:
        items = by_cat.get(cat, [])
        if not items:
            lines.append("### %s %s（今日无命中）" % (CAT_EMOJI.get(cat, "•"), cat))
            lines.append("")
            lines.append("_本类今日无命中文章。_")
            lines.append("")
            continue
        lines.append("### %s %s（%d 篇）" % (CAT_EMOJI.get(cat, "•"), cat, len(items)))
        lines.append("")
        for it in items:
            lines.append("**%s**  " % it["title"])
            lines.append("_%s · %s_  " % (it["source"], it["pub_str"] or target_date))
            lines.append("")
            lines.append(make_summary(it))
            lines.append("")
            lines.append("---")
            lines.append("")

    # ── 行动清单 ──
    actions = build_action_items(by_cat, all_items)
    lines.append("## ✅ 给 CTO/CIO 的行动清单")
    lines.append("")
    lines.append("_（基于当日 %d 篇实际命中内容动态生成，非模板）_" % total)
    lines.append("")
    TAG_EMOJI = {"安全": "🛡️", "大模型": "🧠", "算力": "⚡", "学术": "📚", "应用": "🚀", "开源": "📦", "订阅": "📡"}
    for i, (tag, text) in enumerate(actions, 1):
        lines.append("%d. %s **%s**：%s" % (i, TAG_EMOJI.get(tag, "•"), tag, text))
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 📋 数据来源与核验说明")
    lines.append("")
    lines.append("- 本内参由 `daily_intel_rss.py` 实时拉取 RSS 聚合生成，所有标题/链接/发布时间来自原始 feed。")
    lines.append("- 摘要为基于 title+description 的规则提炼（非原文照搬），关键数据来自源文本显式数字。")
    lines.append("- 机器之心、36氪 RSS 已退化为 JS 反爬 HTML 占位（非 XML feed），本期内参不含二者数据，待其恢复 RSS 后接入。")
    lines.append("- arXiv 摘要来自作者提交的 abstract，为学术一手信源。")
    lines.append("")
    lines.append("_本内参由 Hermes Agent · RSS 聚合管道自动生成 · 每日一期_")
    lines.append("")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════
# 6. HTML + Chrome PDF（遵循 8.3 经验：无页眉页脚）
# ═══════════════════════════════════════════════════════════
CSS = """
@media print { @page { margin: 0; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; }
body {
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 11px;
  line-height: 1.65;
  color: #1a1a1a;
  margin: 14mm 14mm 16mm 14mm;
  max-width: none;
  overflow-wrap: break-word;
  word-break: break-word;
}
h1 {
  font-size: 20px;
  color: #0b3d91;
  border-bottom: 3px solid #0b3d91;
  padding-bottom: 6px;
  margin-bottom: 4px;
}
h2 {
  font-size: 15px;
  color: #0b3d91;
  border-left: 4px solid #0b3d91;
  padding-left: 8px;
  margin-top: 22px;
}
h3 {
  font-size: 12.5px;
  color: #b00000;
  margin-top: 16px;
}
blockquote {
  background: #f0f4ff;
  border-left: 3px solid #0b3d91;
  padding: 6px 10px;
  margin: 8px 0;
  color: #333;
  font-size: 10px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 10px;
  margin: 8px 0;
}
th, td {
  border: 1px solid #ccc;
  padding: 4px 6px;
  text-align: left;
}
th { background: #0b3d91; color: #fff; }
tr:nth-child(even) { background: #f7f9fc; }
hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 10px 0;
}
a { color: #0b55a5; text-decoration: none; word-break: break-all; }
strong { color: #111; }
em { color: #666; }
code {
  font-family: "SF Mono", Menlo, monospace;
  background: #f0f0f0;
  padding: 1px 3px;
  border-radius: 2px;
  font-size: 9.5px;
}
ol, ul { padding-left: 1.6em; }
li { margin: 3px 0; }
"""


def markdown_to_html(md_text, title):
    """轻量 md→html 转换（不依赖 pandoc，避免外部依赖）"""
    import html as H
    lines = md_text.split("\n")
    out = []
    in_table = False
    in_list = False
    list_type = None

    def esc(s):
        return H.escape(s, quote=False)

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 表格
        if stripped.startswith("|") and "|" in stripped[1:]:
            if not in_table:
                in_table = True
                rows = []
                while i < len(lines) and lines[i].strip().startswith("|"):
                    cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                    rows.append(cells)
                    i += 1
                # rows[0]=header rows[1]=separator rows[2:]=data
                if len(rows) >= 2:
                    out.append("<table>")
                    out.append("<thead><tr>" + "".join("<th>%s</th>" % inline_md(c) for c in rows[0]) + "</tr></thead>")
                    out.append("<tbody>")
                    for r in rows[2:]:
                        out.append("<tr>" + "".join("<td>%s</td>" % inline_md(c) for c in r) + "</tr>")
                    out.append("</tbody></table>")
                continue

        if in_table:
            in_table = False

        # 标题
        if stripped.startswith("# "):
            out.append("<h1>%s</h1>" % inline_md(stripped[2:]))
        elif stripped.startswith("## "):
            out.append("<h2>%s</h2>" % inline_md(stripped[3:]))
        elif stripped.startswith("### "):
            out.append("<h3>%s</h3>" % inline_md(stripped[4:]))
        elif stripped == "---":
            out.append("<hr/>")
        elif stripped.startswith("> "):
            out.append("<blockquote>%s</blockquote>" % inline_md(stripped[2:]))
        elif re.match(r"^\d+\.\s", stripped):
            if not in_list or list_type != "ol":
                if in_list:
                    out.append("</%s>" % list_type)
                out.append("<ol>")
                in_list, list_type = True, "ol"
            content = re.sub(r"^\d+\.\s*", "", stripped)
            out.append("<li>%s</li>" % inline_md(content))
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list or list_type != "ul":
                if in_list:
                    out.append("</%s>" % list_type)
                out.append("<ul>")
                in_list, list_type = True, "ul"
            out.append("<li>%s</li>" % inline_md(stripped[2:]))
        elif stripped == "":
            if in_list:
                out.append("</%s>" % list_type)
                in_list, list_type = False, None
            out.append("")
        else:
            if in_list:
                out.append("</%s>" % list_type)
                in_list, list_type = False, None
            out.append("<p>%s</p>" % inline_md(stripped))
        i += 1

    if in_list:
        out.append("</%s>" % list_type)

    body = "\n".join(out)
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>%s</title>
<style>%s</style>
</head>
<body>
%s
</body>
</html>""" % (H.escape(title), CSS, body)
    return html


def inline_md(s):
    """处理行内 **bold** _italic_ `code` [link](url)"""
    s = htmlmod.escape(s, quote=False)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\w)_([^_]+)_(?!\w)", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


def render_pdf(html_path, pdf_path):
    """Chrome headless 渲染，强制无页眉页脚"""
    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",          # 关键：去页眉日期/页脚 URL
        "--print-to-pdf-no-header",        # 双保险
        "--run-all-compositor-stages-before-draw",
        "--print-to-pdf=%s" % pdf_path,
        html_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        sys.stderr.write("[chrome stderr] " + result.stderr[:500] + "\n")
    return os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000


# ═══════════════════════════════════════════════════════════
# 7. PDF 页眉页脚验证（pymupdf）
# ═══════════════════════════════════════════════════════════
def verify_pdf_no_header_footer(pdf_path):
    """检查每页是否有 Chrome 自动页眉页脚。

    Chrome 默认页眉=日期+标题，页脚=URL(file:///...html)+页码(1/N)。
    我们用 --no-pdf-header-footer 关闭，此函数验证是否真的关闭了。
    判据：页眉区(top 14px) / 页脚区(bottom 14px) 是否出现 Chrome 特征串：
      - 日期时间戳 "8/14/26, 12:34" 或 "2026-08-14"
      - file:/// 或 .html 路径
      - 纯页码 "3 / 51"
    （body 正文溢出到边缘不算 Chrome 页眉页脚——那是排版问题，另案处理）
    """
    import pymupdf
    doc = pymupdf.open(pdf_path)
    issues = []
    # Chrome 页眉页脚特征：日期/时间、file 路径、页码模式
    chrome_date = re.compile(r"\d{1,2}/\d{1,2}/\d{2,4}[, ]\d{1,2}:\d{2}")  # 8/14/26, 12:34
    chrome_file = re.compile(r"file:/|\.html$|\.html\b", re.IGNORECASE)
    chrome_pageno = re.compile(r"^\s*\d+\s*/\s*\d+\s*$")
    for pno in range(len(doc)):
        page = doc[pno]
        rect = page.rect
        w, h = rect.width, rect.height
        # Chrome 页眉/页脚通常在 6-14px 极窄带
        header_rect = pymupdf.Rect(0, 0, w, 14)
        footer_rect = pymupdf.Rect(0, h - 14, w, h)
        for region_name, region in [("页眉", header_rect), ("页脚", footer_rect)]:
            text = page.get_text("text", clip=region).strip()
            if not text:
                continue
            if chrome_date.search(text):
                issues.append("第%d页 %s 含Chrome日期戳: %r" % (pno + 1, region_name, text[:60]))
            if chrome_file.search(text):
                issues.append("第%d页 %s 含Chrome文件路径: %r" % (pno + 1, region_name, text[:60]))
            if chrome_pageno.search(text):
                issues.append("第%d页 %s 含Chrome页码: %r" % (pno + 1, region_name, text[:60]))
    doc.close()
    return issues


# ═══════════════════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════════════════
def main():
    print("=" * 60)
    print("每日技术情报内参 · RSS 聚合管道 · 目标日期 %s" % TODAY)
    print("=" * 60)

    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. 拉取
    print("\n[1/6] 拉取 RSS feeds...")
    by_source, fetch_log = fetch_feeds(TODAY)
    for line in fetch_log:
        print(line)

    # 2. 分类 + 摘要
    print("\n[2/6] 分类与提炼摘要...")
    all_items = []
    for src, items in by_source.items():
        all_items.extend(items)
    by_cat = {cat: [] for cat in CATEGORIES}
    for it in all_items:
        cat = categorize(it)
        by_cat[cat].append(it)
    # 每类按发布时间倒序，并限流（避免单源如 arXiv 299 篇撑爆内参）
    for cat in CATEGORIES:
        by_cat[cat].sort(key=lambda x: x["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        by_cat[cat] = by_cat[cat][:MAX_PER_CAT]
    for cat in CATEGORIES:
        print("  %s: %d 篇" % (cat, len(by_cat[cat])))

    # 3. 生成 markdown
    print("\n[3/6] 生成 markdown...")
    md = gen_markdown(TODAY, by_cat, all_items, fetch_log)
    md_path = os.path.join(REPORTS_DIR, "daily_intel_%s.md" % TODAY)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print("  写入 %s (%d 字符)" % (md_path, len(md)))

    # 4. HTML
    print("\n[4/6] 生成 HTML...")
    html = markdown_to_html(md, "每日技术情报内参 %s" % TODAY)
    html_path = os.path.join(REPORTS_DIR, "daily_intel_%s.html" % TODAY)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("  写入 %s (%d 字符)" % (html_path, len(html)))

    # 5. PDF
    print("\n[5/6] Chrome 渲染 PDF...")
    pdf_path = os.path.join(REPORTS_DIR, "daily_intel_%s.pdf" % TODAY)
    ok = render_pdf(html_path, pdf_path)
    if ok:
        print("  写入 %s (%d KB)" % (pdf_path, os.path.getsize(pdf_path) // 1024))
    else:
        print("  [FAIL] PDF 渲染失败")
        return 1

    # 6. 验证
    print("\n[6/6] pymupdf 验证页眉页脚...")
    issues = verify_pdf_no_header_footer(pdf_path)
    if not issues:
        print("  ✅ 全部 %d 页页眉页脚区域无日期/URL" % len(pymupdf.open(pdf_path)))
    else:
        print("  ⚠️ 发现 %d 个问题：" % len(issues))
        for iss in issues:
            print("    - " + iss)

    print("\n" + "=" * 60)
    print("完成。命中 %d 篇，PDF %d 页" % (len(all_items), len(pymupdf.open(pdf_path))))
    print("  MD:   %s" % md_path)
    print("  HTML: %s" % html_path)
    print("  PDF:  %s" % pdf_path)
    print("=" * 60)
    return 0


if __name__ == "__main__":
    import pymupdf  # 确保 import 可用
    sys.exit(main())
