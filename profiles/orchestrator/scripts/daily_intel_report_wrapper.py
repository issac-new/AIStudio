#!/usr/bin/env python3
"""每日技术情报内参 + 生活工作日报 — 完整自动化脚本

流程：
1. 拉取微信公众号今日文章（搜狗移动端，已有增量数据则用增量，否则重新抓）
2. 提取文章摘要/内容（复用 wechat_research/batch_all.json + 今日新抓）
3. 交叉验证（Bing搜索补充）
4. 生成内参 markdown（结构化：速览→头条→专题→行动清单）
5. 合并生活工作日报数据（daily_stats.py）
6. 生成 PDF（pandoc → Chrome headless）
7. 推送到微信（文字摘要 + PDF 附件）

由 cron job 调用，no_agent=true，stdout 注入 prompt。
"""

import json
import os
import re
import sys
import time
import random
import subprocess
import urllib.request
import urllib.parse
import html as htmlmod
from datetime import datetime, timedelta

# ─── 路径配置 ───
LIFE_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench"
REPORTS_DIR = os.path.join(LIFE_DIR, "reports")
WECHAT_DIR = os.path.join(LIFE_DIR, "wechat_daily")
SCRIPTS_DIR = os.path.join(LIFE_DIR, "scripts")
BATCH_ALL = os.path.join(LIFE_DIR, "wechat_research", "batch_all.json")
ACCOUNTS_FILE = "/tmp/wechat_50.json"

TODAY = datetime.now().strftime("%Y-%m-%d")
YESTERDAY = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

# ─── Step 1: 拉取公众号文章 ────────────────────────────

def load_accounts():
    """加载50个目标公众号"""
    if os.path.exists(ACCOUNTS_FILE):
        with open(ACCOUNTS_FILE) as f:
            return json.load(f)
    # Fallback: 从 weixinlist.txt 生成
    return ["机器之心", "量子位", "AI前线", "老刘说NLP", "CSDN", "GitHubDaily",
            "阿里技术", "字节跳动技术团队", "滴滴技术", "DeepSeek", "智谱",
            "Kimi智能助手", "魔搭ModelScope社区", "飞桨PaddlePaddle",
            "FreeBuf", "安全内参", "AI与安全", "管理者进阶实战", "AI组织进化论",
            "量子位", "新皮层NewNewThing", "InfoQ", "开发者头条", "Hugging Face"]

def fetch_account_articles(account_name):
    """用 m.sogou.com 移动端搜索拉取公众号最近文章"""
    keyword = f"site:mp.weixin.qq.com {account_name}"
    query = urllib.parse.quote(keyword)
    url = f"https://m.sogou.com/web/searchList.jsp?keyword={query}&page=1"

    req = urllib.request.Request(url, headers={
        "User-Agent": MOBILE_UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="replace")

        if "antispider" in html or "用户您好" in html or "验证码" in html:
            return {"account": account_name, "error": "antispider", "articles": []}

        articles = []
        for m in re.finditer(r'href="\./id=[^"]*?&amp;url=([^&"]+)[^"]*"[^>]*>(.*?)</a>', html, re.S):
            real_url = urllib.parse.unquote(m.group(1))
            if "mp.weixin.qq.com/s?" not in real_url:
                continue
            real_url = re.sub(r'&qbExtraParams.*$', '', real_url)
            real_url = re.sub(r'&scene=.*$', '', real_url)
            real_url = htmlmod.unescape(real_url)
            title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()

            if title and real_url:
                articles.append({"title": title, "url": real_url})

        # Deduplicate
        seen = set()
        deduped = []
        for a in articles:
            if a["url"] not in seen:
                seen.add(a["url"])
                deduped.append(a)

        return {"account": account_name, "articles": deduped, "error": None}

    except Exception as e:
        return {"account": account_name, "error": str(e)[:60], "articles": []}


def collect_today_articles():
    """收集今日文章：增量数据 + 新抓取

    修复：合并 enriched_articles JSON 的 content 字段（真正文），
    不再只依赖 snippet（搜狗搜索结果的 ~80 字描述）。
    """
    all_results = []
    enriched = {}
    for d in (TODAY, YESTERDAY):
        enriched.update(load_enriched_content(d))

    def _attach_content(a):
        """把 enriched 正文挂到文章对象上（按归一化标题匹配）"""
        if a.get("content"):
            return
        key = _norm_title(a.get("title", ""))
        if key and key in enriched:
            a["content"] = enriched[key]
        return

    # 1. 从 batch_all.json 提取今日+昨日文章（已有摘要数据）
    if os.path.exists(BATCH_ALL):
        with open(BATCH_ALL) as f:
            batch = json.load(f)
        for account in batch:
            name = account.get('account', '')
            for art in account.get('articles', []):
                pub = art.get('pub_time', '')
                if pub in (TODAY, YESTERDAY):
                    rec = {
                        'account': name,
                        'title': art.get('title', ''),
                        'pub_time': pub,
                        'snippet': art.get('snippet', ''),
                        'source': 'batch_all',
                    }
                    _attach_content(rec)
                    all_results.append(rec)
    
    # 2. 今日新抓取（如果搜狗可用）
    today_file = os.path.join(WECHAT_DIR, f"articles_{TODAY}.json")
    if os.path.exists(today_file):
        with open(today_file) as f:
            new_data = json.load(f)
        for r in new_data:
            for a in r.get('articles', []):
                rec = {
                    'account': r['account'],
                    'title': a.get('title', ''),
                    'pub_time': TODAY,
                    'snippet': a.get('snippet', ''),
                    'url': a.get('url', ''),
                    'source': 'fresh',
                }
                # fresh 抓取数据本身也可能带 content
                if a.get('content'):
                    rec['content'] = a.get('content')
                _attach_content(rec)
                all_results.append(rec)

    # 3. enriched 文件中独有（未在 batch/today 里）的文章也补进来
    existing_keys = {_norm_title(a['title']) for a in all_results}
    for date_str, grp_iter in ((TODAY, None), (YESTERDAY, None)):
        path = os.path.join(WECHAT_DIR, f"enriched_articles_{date_str}.json")
        if not os.path.exists(path):
            continue
        with open(path) as f:
            data = json.load(f)
        groups = data if isinstance(data, list) else [data]
        for grp in groups:
            acct = grp.get("account", "")
            for a in grp.get("articles", []):
                c = (a.get("content") or "").strip()
                if len(c) < 80:
                    continue
                k = _norm_title(a.get("title", ""))
                if k and k not in existing_keys:
                    rec = {
                        'account': acct,
                        'title': a.get('title', ''),
                        'pub_time': date_str,
                        'snippet': a.get('snippet', ''),
                        'url': a.get('url', ''),
                        'content': c,
                        'source': 'enriched_only',
                    }
                    all_results.append(rec)
                    existing_keys.add(k)
    
    # 去重（按归一化标题）
    seen_titles = set()
    deduped = []
    for a in all_results:
        key = _norm_title(a['title'])
        if key not in seen_titles:
            seen_titles.add(key)
            deduped.append(a)
    
    return deduped


def load_enriched_content(date_str):
    """加载 enrich 阶段提取的文章正文（content 字段）。

    返回 {normalized_title: content_str} 映射，供 collect_today_articles 合并。
    这是修复"正文只有标题没有内容摘要"的关键数据源——enriched JSON 里有
    真正的正文（1000-15000 字），而 snippet 只是搜狗搜索结果的 ~80 字描述。
    """
    path = os.path.join(WECHAT_DIR, f"enriched_articles_{date_str}.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        return {}
    mapping = {}
    # data 可能是 list[account_group] 或 dict
    groups = data if isinstance(data, list) else [data]
    for grp in groups:
        for a in grp.get("articles", []):
            content = (a.get("content") or "").strip()
            if not content or len(content) < 80:
                continue
            title = _norm_title(a.get("title", ""))
            if title:
                mapping[title] = content
    return mapping


def _norm_title(t):
    """标题归一化用于匹配：去空白标点，取前24字"""
    import re as _re
    t = _re.sub(r"[\s\u3000\.\,\!\!\?\?\:\;\(\)\(\)\"'\-\—\–\|·]", "", str(t))
    return t[:24]


def extract_summary(content, max_sentences=4, max_chars=320):
    """从正文 content 提取 3-5 句核心摘要（数据/观点/技术要点）。

    规则（无 LLM 可用时）：
    - 按中文句号/问号/叹号/换行切句
    - 丢弃导航/版权/广告噪声句
    - 打分：含数字/百分号/价格/年份/技术词 加分；长度 15-90 字优先
    - 取最高分 max_sentences 句，按原文顺序输出，截断到 max_chars
    """
    import re as _re
    if not content:
        return ""
    # 切句：保留分隔符
    raw_sentences = _re.split(r"(?<=[。！？!?\n])", content)
    sentences = []
    noise_kw = ["扫码", "下载APP", "点击阅读原文", "阅读原文", "往期", "推荐阅读",
                "关注公众号", "免责声明", "版权声明", "来源：", "编辑：", "责编：",
                "投稿", "合作", "联系方式", "www.", "http", "微信公众号", "微信扫一扫",
                "长按识别", "更多精彩", "热门文章", "精选推荐"]
    tech_kw = ["AI","模型","算法","GPU","token","API","开源","推理","训练","参数",
               "性能","架构","部署","框架","芯片","算力","大模型","Agent","向量",
               "RAG","微调","量化","延迟","吞吐","并发","成本","价格","支持","发布",
               "更新","升级","突破","首次","最大","最快","最低","提升","降低","减少",
               "增长","达到","相比"]
    for s in raw_sentences:
        s = s.strip().strip("。！？!? \t\u3000")
        s = _re.sub(r"\s+", " ", s)
        if len(s) < 12 or len(s) > 110:
            continue
        if any(nk in s for nk in noise_kw):
            continue
        if _re.search(r"^\d+[\.\、\)]\s*\S", s):  # 列表项标号
            s = _re.sub(r"^\d+[\.\、\)]\s*", "", s)
        sentences.append(s)
    # 去重
    seen, uniq = set(), []
    for s in sentences:
        k = s[:20]
        if k not in seen:
            seen.add(k)
            uniq.append(s)
    sentences = uniq

    def score(s):
        sc = 0
        if _re.search(r"\d", s):
            sc += 3
        if _re.search(r"\d+[%％]|\d+\.?\d*[万千百亿]|￥|\$|/百万", s):
            sc += 4  # 硬数据信号
        if _re.search(r"20\d{2}年?|19\d{2}年?", s):
            sc += 1
        for kw in tech_kw:
            if kw in s:
                sc += 1
        if 20 <= len(s) <= 80:
            sc += 1
        return sc

    scored = [(score(s), i, s) for i, s in enumerate(sentences)]
    # 取高分句，但保留原文顺序
    scored.sort(key=lambda x: (-x[0], x[1]))
    top = sorted(scored[:max_sentences], key=lambda x: x[1])
    out = "。".join(t[2] for t in top if t[0] > 0)
    if not out and sentences:
        # 兜底：没句子得分>0，取前3句
        out = "。".join(sentences[:3])
    if out and not out.endswith(("。","！","？","!","?")):
        out += "。"
    return out[:max_chars]


def generate_action_list(articles):
    """基于当日文章内容动态生成行动清单（非死模板）。

    策略：扫描所有文章正文，按主题域提取已出现的高频动作信号词，
    组合成与当日情报相关的可执行建议。若无足够信号则返回空（宁缺毋滥）。
    """
    import re as _re
    # 按主题域收集信号
    all_text = " ".join(
        (a.get("content") or a.get("snippet") or "") + " " + a.get("title", "")
        for a in articles
    )
    actions = []

    # 信号→动作映射（只有当日文章命中该信号才出现对应动作）
    signals = [
        (("新模型" in all_text or "新发布" in all_text or "API" in all_text or "降价" in all_text
          or "开源" in all_text or "发布" in all_text or "上新" in all_text),
         "**评估并接入当日新发布的模型/API**：关注命中文章中的具体型号、定价与性能数据，"
         "重算自有推理链路的成本与延迟"),
        (("安全" in all_text or "漏洞" in all_text or "攻击" in all_text or "钓鱼" in all_text
          or "深度伪造" in all_text or "勒索" in all_text or "数据泄露" in all_text),
         "**跟进当日披露的安全威胁**：针对命中文章提到的漏洞/攻击手法，排查自有资产暴露面与缓解措施"),
        (("Agent" in all_text or "智能体" in all_text or "自动化" in all_text or "工作流" in all_text),
         "**验证 Agent/自动化方案的落地可行性**：参考命中文章的架构与案例，评估在自身业务场景的复用空间"),
        (("开源" in all_text or "GitHub" in all_text or "Hugging Face" in all_text),
         "**纳入当日开源新项目**：命中文章提到的开源仓库评估引入或对标价值"),
        (("量子" in all_text or "PQC" in all_text or "后量子" in all_text),
         "**跟踪后量子密码迁移进展**：量子安全是中长期确定性事件"),
        (("芯片" in all_text or "GPU" in all_text or "算力" in all_text or "推理卡" in all_text),
         "**审视算力与硬件采购节奏**：命中文章的硬件性能/价格信号影响下半年采购决策"),
        (("组织" in all_text or "团队" in all_text or "招聘" in all_text or "人才" in all_text),
         "**关注人才与组织动态**：命中文章反映的行业人才流向影响招聘与保留策略"),
    ]
    for cond, action in signals:
        if cond:
            actions.append(action)

    # 截断到 5 条
    return actions[:5]


# ─── Step 2: Bing 交叉验证 ─────────────────────────────

def bing_search(query, max_chars=2000):
    url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={"User-Agent": MOBILE_UA})
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace")
        text = re.sub(r'<script[^>]*>.*?</script>', '', raw, flags=re.S)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.S)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = htmlmod.unescape(text)
        text = re.sub(r'\s+', ' ', text).strip()
        idx = text.find("个结果")
        if idx > 0:
            text = text[idx+3:]
        return text[:max_chars]
    except:
        return ""


# ─── Step 3: 生成内参 markdown ────────────────────────

def analyze_articles(articles):
    """基于文章标题和摘要做关键词分析，提炼主题"""
    # 按主题分类
    themes = {
        "AI大模型": {"keywords": ["DeepSeek", "V4", "Flash", "Kimi", "K3", "智谱", "千问", "GLM", "token", "API", "大模型", "Agent"], "articles": []},
        "网络安全": {"keywords": ["漏洞", "CVE", "0day", "渗透", "勒索", "恶意", "木马", "后门", "攻击", "FreeBuf", "防火墙", "加密", "SQL注入", "XSS", "反序列化", "提权", "RCE"], "articles": []},
        "数据安全与舆情": {"keywords": ["数据泄露", "隐私", "舆情", "监管", "合规", "个人信息", "深度伪造", "deepfake", "诈骗", "钓鱼", "社工", "内鬼"], "articles": []},
        "AI安全": {"keywords": ["AI安全", "模型安全", "对抗样本", "投毒", "幻觉", "越狱", "prompt注入", "RAG安全", "Agent安全"], "articles": []},
        "AI for Science": {"keywords": ["量子", "生物", "科研", "InternAgentS", "津渡", "Science", "材料"], "articles": []},
        "开源生态": {"keywords": ["开源", "openEuler", "GitHub", "Hugging Face"], "articles": []},
        "前沿科研": {"keywords": ["Nature", "凝聚体", "DNA"], "articles": []},
    }
    
    for a in articles:
        title = a.get('title', '')
        snippet = a.get('snippet', '')
        combined = title + ' ' + snippet
        assigned = False
        for theme, cfg in themes.items():
            if any(kw.lower() in combined.lower() for kw in cfg["keywords"]):
                cfg["articles"].append(a)
                assigned = True
                break
        if not assigned:
            # 默认归入最匹配的主题
            best_theme = None
            best_score = 0
            for theme, cfg in themes.items():
                score = sum(1 for kw in cfg["keywords"] if kw.lower() in combined.lower())
                if score > best_score:
                    best_score = score
                    best_theme = theme
            if best_theme:
                themes[best_theme]["articles"].append(a)
    
    return themes


def generate_intel_md(articles, themes):
    """生成结构化内参 markdown

    修复：
    - 正文优先用 enriched content 提取的 3-5 句摘要（extract_summary），
      只在无正文时退回 snippet。
    - 行动清单改为 generate_action_list() 基于当日文章内容动态生成，
      不再使用硬编码死模板。
    """
    
    # 筛选有效文章（排除广告/招聘）
    skip_kw = ['招租', '招租Prime', '招聘', '招生', '开工', '文明实践', '周刊第', '真题', '文明周记', '校园招聘', '江景办公']
    valuable = [a for a in articles if not any(kw in a.get('title', '') for kw in skip_kw)]
    
    md = f"""# 每日技术情报内参 · {TODAY}

> **读者定位**：CTO / CIO / 技术决策者
> **情报来源**：{len(set(a['account'] for a in valuable))}个公众号 · 有效文章{len(valuable)}篇
> **密级**：内部参考 · 非涉密

---

## 📌 本期速览

"""
    
    # 头条：按"内容丰富度"排序（有正文的优先，正文越长越靠前）
    def _content_len(a):
        return len(a.get("content", "") or a.get("snippet", ""))
    valuable.sort(key=_content_len, reverse=True)
    
    for i, a in enumerate(valuable[:5], 1):
        md += f"| {i} | {a['title'][:45]} | {a['account']} |\n"
    
    md += "\n---\n\n## 🔴 头条研判\n\n"
    
    # 按主题输出
    theme_icons = {
        "AI大模型": "🔴", "网络安全": "🛡️", "数据安全与舆情": "🔒",
        "AI安全": "🟠", "AI for Science": "🟡",
        "开源生态": "🔵", "前沿科研": "🟣"
    }
    
    for theme, cfg in themes.items():
        if not cfg["articles"]:
            continue
        icon = theme_icons.get(theme, "📌")
        md += f"\n### {icon} {theme}\n\n"
        
        # 按正文长度排序（有正文者优先），取前3
        theme_arts = sorted(cfg["articles"], key=_content_len, reverse=True)[:3]
        
        for a in theme_arts:
            md += f"**{a['title']}**\n"
            md += f"来源：{a['account']} · {a.get('pub_time', '')}\n\n"
            # 修复：优先用 enriched 正文提取的实质摘要
            summary = ""
            content = a.get("content", "")
            if content and len(content) > 80:
                summary = extract_summary(content, max_sentences=5, max_chars=380)
            if not summary:
                snippet = a.get('snippet', '')
                if snippet and len(snippet) > 30:
                    summary = snippet
            if summary:
                md += f"{summary}\n\n"
            else:
                # 无正文也无 snippet：诚实标注，不编造内容
                md += "*（正文未抓取成功，详见原文链接）*\n\n"
            md += "---\n"
    
    # 行动清单（修复：动态生成，不再硬编码死模板）
    actions = generate_action_list(valuable)
    if actions:
        md += "## ✅ 给CTO/CIO的行动清单\n\n"
        md += "*（基于当日 {0} 篇有效文章的内容信号动态生成）*\n\n".format(len(valuable))
        for i, act in enumerate(actions, 1):
            md += f"{i}. {act}\n"
        md += "\n---\n\n"
    # 若 generate_action_list 返回空，则不写行动清单段落（宁缺毋滥，不用假内容）
    
    md += "*本内参由 Hermes Agent 自动生成 · 每日一期*\n"
    
    return md


# ─── Step 4: 合并日报数据 ────────────────────────────

def get_daily_stats():
    """运行 daily_stats.py 获取活动数据"""
    try:
        result = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS_DIR, "daily_stats.py")],
            capture_output=True, text=True, timeout=30,
            cwd=LIFE_DIR,
        )
        return result.stdout if result.returncode == 0 else ""
    except:
        return ""


def generate_full_report(intel_md, stats_text):
    """合并内参和日报"""
    md = intel_md
    
    # 在行动清单之前插入日报部分
    insert_point = md.find("## ✅ 给CTO/CIO的行动清单")
    if insert_point > 0:
        daily_section = f"""
---

## 📊 生活工作塔 · 今日活动

{stats_text}

"""
        md = md[:insert_point] + daily_section + md[insert_point:]
    
    return md


# ─── Step 5: 生成 PDF ────────────────────────────────

def generate_pdf(md_content, output_path):
    """markdown → HTML → PDF"""
    md_path = output_path.replace('.pdf', '.md')
    html_path = output_path.replace('.pdf', '.html')
    
    with open(md_path, 'w') as f:
        f.write(md_content)
    
    # pandoc（修复：去掉 metadata title，避免 pandoc 生成重复的
    # <header id="title-block-header"><h1 class="title"> 块——它在 PDF 顶部
    # 渲染成一个与正文 H1 重复的标题块，被用户识别为"页眉日期"。
    # 页面真正的标题已经是 markdown 正文里的第一个 # 一级标题。
    # 另：用 -f gfm 避免 pandoc 把正文里的 "---" / "*xxx*" 误判为 YAML 元数据
    # 导致 "Error parsing YAML metadata" 整个转换失败（返回码 64，HTML 不更新）。
    subprocess.run([
        "pandoc", md_path, "-o", html_path,
        "--standalone",
        "-f", "gfm",
        "-V", "lang=zh-CN",
    ], capture_output=True, timeout=30)
    
    # Inject CSS
    css = """
<style>
@page { size: A4 portrait; margin: 18mm 16mm; }
body { font-family: "Hiragino Sans GB", "STSong", "PingFang SC", sans-serif; font-size: 10.5px; line-height: 1.65; color: #2d2d2d; max-width: none !important; padding: 0 !important; }
h1 { font-size: 22px; color: #0a0a23; border-bottom: 3px solid #0f3460; padding-bottom: 12px; margin-top: 30px; }
h2 { font-size: 15px; color: #0f3460; border-left: 5px solid #e94560; padding-left: 10px; margin-top: 24px; }
h3 { font-size: 12.5px; color: #16213e; margin-top: 18px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5px; }
th { background-color: #0f3460; color: white; padding: 5px 8px; }
td { border: 1px solid #ddd; padding: 4px 8px; }
tr:nth-child(even) { background-color: #f6f8fb; }
blockquote { border-left: 4px solid #e94560; margin: 10px 0; padding: 8px 14px; background-color: #fdf3f4; color: #555; }
strong { color: #0a0a23; }
hr { border: none; border-top: 1.5px solid #e0e0e0; margin: 20px 0; }
/* 修复：隐藏 pandoc 自动生成的标题块（重复的日期标题），避免被识别为页眉 */
#title-block-header, header.title, h1.title { display: none !important; }
</style>
"""
    with open(html_path, 'r') as f:
        html = f.read()
    html = html.replace("</head>", css + "</head>")
    with open(html_path, 'w') as f:
        f.write(html)
    
    # Chrome headless → PDF
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    subprocess.run([
        chrome, "--headless", "--disable-gpu", "--no-sandbox",
        "--print-to-pdf=" + output_path,
        "--print-to-pdf-no-header",
        "--no-pdf-header-footer",
        html_path
    ], capture_output=True, timeout=60)
    
    return os.path.exists(output_path)


# ─── Step 6: 推送微信 ────────────────────────────────

def push_weixin(text, pdf_path=None):
    """推送到微信（两次发送间加 3s 延迟，避免 iLink rate-limit cooldown）"""
    import time as _time
    # 发送文字
    subprocess.run(
        ["hermes", "send", "-t", "weixin", text],
        capture_output=True, timeout=30,
    )
    # 发送PDF附件（延迟避免限流）
    if pdf_path and os.path.exists(pdf_path):
        _time.sleep(3)  # iLink sendmessage cooldown 防护
        subprocess.run(
            ["hermes", "send", "-t", "weixin", f"MEDIA:{pdf_path}"],
            capture_output=True, timeout=60,
        )


# ─── Step 0: 实时抓取今日文章（sogou + Bing 双通道） ────

def fetch_fresh_articles():
    """先跑搜狗聚焦抓取，再跑 Bing 补充，写入 wechat_daily/articles_{TODAY}.json。

    解决原始痛点：collect_today_articles() 只读已有文件，不主动抓取，
    导致 batch_all.json 过期后日报长期为空。
    """
    print("Step 0: 实时抓取今日文章（sogou + Bing + 安全情报）...")
    fetch_sogou = os.path.join(SCRIPTS_DIR, "fetch_today_focused.py")
    fetch_bing = os.path.join(SCRIPTS_DIR, "fetch_bing_supplement.py")
    fetch_security = os.path.join(SCRIPTS_DIR, "fetch_security_intel.py")

    for label, script in [("sogou", fetch_sogou), ("Bing", fetch_bing), ("安全", fetch_security)]:
        if not os.path.exists(script):
            print(f"  [{label}] 脚本不存在，跳过: {script}")
            continue
        try:
            result = subprocess.run(
                [sys.executable, script],
                capture_output=True, text=True, timeout=180,
                cwd=LIFE_DIR,
            )
            # 打印最后 3 行摘要
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()][-3:]
            for l in lines:
                print(f"  [{label}] {l}")
        except subprocess.TimeoutExpired:
            print(f"  [{label}] 超时(180s)，跳过")
        except Exception as e:
            print(f"  [{label}] 异常: {e}")

    # Step 0c: 正文提取 — 把 articles_{TODAY}.json 转成 enriched_articles_{TODAY}.json
    extract_script = os.path.join(SCRIPTS_DIR, "extract_article_content.py")
    if os.path.exists(extract_script):
        print("  [enrich] 开始提取文章正文（跳过微信反爬，优先非微信源，限量30篇含安全）...")
        try:
            result = subprocess.run(
                [sys.executable, extract_script, "--skip-wechat", "--limit", "30", "--delay-min", "2", "--delay-max", "4"],
                capture_output=True, text=True, timeout=600,
                cwd=LIFE_DIR,
            )
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()][-5:]
            for l in lines:
                print(f"  [enrich] {l}")
        except subprocess.TimeoutExpired:
            print("  [enrich] 超时(600s)，跳过正文提取")
        except Exception as e:
            print(f"  [enrich] 异常: {e}")
    else:
        print(f"  [enrich] 脚本不存在: {extract_script}")


# ─── 主流程 ───────────────────────────────────────────

def main():
    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(WECHAT_DIR, exist_ok=True)
    
    print(f"[{TODAY}] 开始生成每日技术情报内参...")
    
    # Step 0: 实时抓取（sogou 搜狗聚焦 + Bing 补充）
    fetch_fresh_articles()
    
    # Step 1: 收集文章
    articles = collect_today_articles()
    print(f"收集到 {len(articles)} 篇文章（今日+昨日）")
    
    # Step 2: 分析主题
    themes = analyze_articles(articles)
    for theme, cfg in themes.items():
        if cfg["articles"]:
            print(f"  {theme}: {len(cfg['articles'])} 篇")
    
    # Step 3: 生成内参
    intel_md = generate_intel_md(articles, themes)
    
    # Step 4: 合并日报
    stats_text = get_daily_stats()
    full_md = generate_full_report(intel_md, stats_text)
    
    # Step 5: 生成 PDF
    pdf_path = os.path.join(REPORTS_DIR, f"daily_intel_{TODAY}.pdf")
    ok = generate_pdf(full_md, pdf_path)
    
    if ok:
        size = os.path.getsize(pdf_path) / 1024
        print(f"PDF 生成成功: {pdf_path} ({size:.0f} KB)")
        
        # Step 6: 推送微信
        summary_text = f"【每日技术情报内参 · {TODAY}】\n共{len(articles)}篇有效文章，{len(set(a['account'] for a in articles))}个公众号覆盖。\n完整内参PDF已生成，请查收附件。"
        push_weixin(summary_text, pdf_path)
        print("已推送到微信")
    else:
        print("PDF 生成失败")
        push_weixin(f"【每日技术情报内参 · {TODAY}】\nPDF 生成失败，请查看 markdown 版本。")
    
    print("完成")


if __name__ == "__main__":
    main()
