#!/usr/bin/env python3
"""LLM 分析器 — 基于文章正文生成真正的摘要/研判/关键数据/行动清单。

解决"样子货"核心：有了正文后，用 LLM 提炼信息，而不是只列标题。

用法（被 daily_intel_report.py 调用）：
  from llm_analyzer import analyze_articles, generate_strategic_analysis

能力：
  1. summarize_article(content, title) → 3-5句结构化摘要
  2. extract_key_data(content) → 关键数据/数字/产品名/版本号
  3. analyze_articles(articles) → 主题聚类 + 每篇深度摘要
  4. generate_strategic_analysis(articles, themes) → CTO 级战略研判 + 行动清单

LLM 调用：hermes -z "<prompt>" --no-tools -m <model>
节流：每篇调用间 2-3s，批量摘要可合并减少调用次数。
"""

import json
import os
import re
import sys
import time
import subprocess
from datetime import datetime

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
LIFE_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench"

# LLM 配置（复用 Hermes Agent 当前 model）
LLM_MODEL = os.environ.get("INTEL_LLM_MODEL", "")  # 空=用 hermes 默认 model
LLM_PROVIDER = os.environ.get("INTEL_LLM_PROVIDER", "")


def _hermes_llm(prompt, max_retries=2):
    """调用 hermes -z 做 LLM 推理。

    Returns: (text, error)
    """
    cmd = ["hermes", "-z", prompt, "-t", ""]  # -t "" 禁用工具集，纯文本推理
    if LLM_MODEL:
        cmd.extend(["-m", LLM_MODEL])
    if LLM_PROVIDER:
        cmd.extend(["--provider", LLM_PROVIDER])

    for attempt in range(max_retries + 1):
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=90,
            )
            out = (result.stdout or "").strip()
            if out and result.returncode == 0:
                # hermes -z 输出可能带一些前缀，取实际内容
                # 去掉可能的 session/meta 行
                lines = out.split("\n")
                # 找到第一个非空、非 session-id 行开始
                content_lines = []
                started = False
                for line in lines:
                    if not started:
                        # 跳过空行和看起来像 meta 的行
                        if not line.strip():
                            continue
                        if line.startswith(("session:", "model:", "provider:", "[")):
                            continue
                        started = True
                    content_lines.append(line)
                return "\n".join(content_lines).strip(), None
            err = (result.stderr or "").strip()[:200]
            if attempt < max_retries:
                time.sleep(3)
                continue
            return "", f"hermes_llm rc={result.returncode}: {err}"
        except subprocess.TimeoutExpired:
            if attempt < max_retries:
                time.sleep(3)
                continue
            return "", "hermes_llm timeout"
        except Exception as e:
            return "", f"hermes_llm: {str(e)[:80]}"
    return "", "hermes_llm exhausted retries"


# ─── 基于正则的本地分析（不依赖 LLM，兜底） ────────────

def local_summarize(content, max_len=300):
    """无 LLM 时的本地摘要：取首段 + 关键句。"""
    if not content:
        return ""
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    if not paragraphs:
        return content[:max_len]

    summary_parts = []
    char_count = 0

    # 首段（通常是引言/摘要）
    first = paragraphs[0]
    if len(first) < max_len:
        summary_parts.append(first)
        char_count = len(first)

    # 找含关键信号的句子（数字、产品名、结论词）
    signal_words = ["发布", "开源", "突破", "首次", "超过", "提升", "降低", "成本",
                    "性能", "benchmark", "SOTA", "参数", "token", "GPU", "训练",
                    "结论", "表明", "显示", "证明", "意义"]
    for p in paragraphs[1:]:
        if char_count >= max_len:
            break
        if any(w in p for w in signal_words) and len(p) > 30:
            # 取该段第一句
            first_sentence = re.split(r'[。！？\n]', p)[0] + "。"
            if char_count + len(first_sentence) <= max_len + 100:
                summary_parts.append(first_sentence)
                char_count += len(first_sentence)

    result = " ".join(summary_parts)
    return result[:max_len] if len(result) > max_len else result


def local_extract_key_data(content):
    """提取关键数据：数字、百分比、版本号、产品名。"""
    if not content:
        return []

    data_points = []

    # 百分比提升/降低
    for m in re.finditer(r'(提升|提高|降低|减少|下降|增长|缩|快|慢|优)[^。]*(\d+(?:\.\d+)?)\s*(%|倍|x|X)', content):
        data_points.append(m.group(0).strip()[:60])

    # 参数规模
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*[Bb](?:illion)?\s*参数', content):
        data_points.append(f"{m.group(1)}B参数")
    for m in re.finditer(r'(\d+)\s*亿\s*参数', content):
        data_points.append(f"{m.group(1)}亿参数")

    # 版本号
    for m in re.finditer(r'(?:V|v|版本)?(\d+(?:\.\d+)+)\s*(?:Pro|Max|Turbo|Flash|Mini)?', content[:2000]):
        ver = m.group(0).strip()
        if len(ver) < 20:
            data_points.append(ver)

    # 价格/成本
    for m in re.finditer(r'(?:¥|$|￥|价格|成本|费用|定价)\s*(\d+(?:\.\d+)?)\s*(?:万|元|/|k|M)', content):
        data_points.append(m.group(0).strip()[:50])

    # benchmark 分数
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*(?:分|points|score|pts)', content, re.I):
        data_points.append(m.group(0).strip())

    # 去重，取前 5
    seen = set()
    unique = []
    for d in data_points:
        if d not in seen and len(d) > 3:
            seen.add(d)
            unique.append(d)
    return unique[:5]


# ─── LLM 驱动的深度分析 ────────────────────────────────

def llm_summarize_article(title, content, account=""):
    """用 LLM 生成单篇深度摘要。

    Returns: {summary, key_data, takeaway} 或 None（失败时）
    """
    if not content or len(content) < 150:
        return None

    # 截断超长正文（LLM 上下文限制）
    truncated = content[:6000]

    prompt = f"""你是技术情报分析师。请分析以下微信公众号文章，输出结构化分析。

【标题】{title}
【来源】{account}
【正文】
{truncated}

请严格按以下 JSON 格式输出（不要有其他内容）：
{{
  "summary": "3-5句话的核心摘要，说清楚是什么/做了什么/关键结果",
  "key_data": ["关键数据点1", "关键数据点2"],
  "significance": "对技术决策者的意义（1-2句）",
  "category": "AI大模型|AI安全|AI for Science|开源生态|组织管理|前沿科研|行业应用|其他"
}}

只输出 JSON，不要解释。"""

    text, err = _hermes_llm(prompt)
    if err or not text:
        return None

    # 解析 JSON（容错：LLM 可能加 ```json 包裹）
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

    # 找到第一个 { 和最后一个 }
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(text[start:end + 1])
            return data
        except json.JSONDecodeError:
            pass

    return None


def generate_strategic_analysis(articles_with_content):
    """用 LLM 生成 CTO 级战略研判 + 行动清单。

    输入：已提取正文的文章列表
    输出：{headline_judgment, cross_themes, action_items}
    """
    if not articles_with_content:
        return None

    # 准备素材：取信息量最大的前 8 篇
    sorted_arts = sorted(
        articles_with_content,
        key=lambda x: len(x.get("content", "")),
        reverse=True
    )
    top_arts = [a for a in sorted_arts if len(a.get("content", "")) > 200][:8]

    if not top_arts:
        return None

    materials = []
    for a in top_arts:
        summary = a.get("llm_summary") or local_summarize(a.get("content", ""), 200)
        materials.append(f"【{a.get('account','')}】{a.get('title','')}\n摘要：{summary}")

    materials_text = "\n\n---\n\n".join(materials)

    prompt = f"""你是资深技术战略顾问，为 CTO/CIO 撰写每日技术情报内参。

以下是今日 {len(top_arts)} 篇重要技术文章（已附摘要）：

{materials_text}

请基于以上内容，生成战略研判。严格按以下 JSON 输出（不要其他内容）：
{{
  "headline_judgment": "今日最值得关注的 1 个技术动向，用 2-3 句话说明为什么重要（必须引用具体文章内容，不能空泛）",
  "cross_theme_insights": [
    "跨主题洞察1：关联多篇内容发现的趋势（必须引用具体数据/产品名）",
    "跨主题洞察2"
  ],
  "action_items": [
    "具体的行动建议1（必须可执行，引用具体技术/产品/时间窗口）",
    "具体的行动建议2",
    "具体的行动建议3",
    "具体的行动建议4"
  ]
}}

红线：
- 拒绝空泛（如"关注AI发展"），每条必须有具体技术/产品/数据支撑
- 如果某主题信息不足，宁可少写也不要编造
- 行动清单必须可执行（如"评估X的Y功能"，而不是"加强关注"）

只输出 JSON。"""

    text, err = _hermes_llm(prompt)
    if err or not text:
        return None

    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    return None


# ─── 主题分类（增强版，支持 LLM 分类） ──────────────────

THEME_KEYWORDS = {
    "AI大模型": ["DeepSeek", "Kimi", "K3", "V4", "智谱", "千问", "GLM", "token", "API",
                 "大模型", "Agent", "Harness", "LLM", "GPT", "Claude", "推理", "训练",
                 "MoE", "Mixture", "RAG", "微调", "fine-tun", "Reasoning", "o1", "o3"],
    "AI安全": ["安全", "下架", "标准", "规范", "钓鱼", "深度伪造", "审核", "漏洞",
              "CVE", "渗透", "红队", "越狱", "jailbreak", "对抗", "投毒", "隐私"],
    "AI for Science": ["量子", "生物", "科研", "蛋白质", "分子", "材料", "药物",
                       "Science", "Nature", "发现", "合成", "晶体", "DNA", "基因组"],
    "开源生态": ["开源", "openEuler", "GitHub", "Hugging Face", "Apache", "MIT",
                "GPL", "开源模型", "开源框架", "社区"],
    "组织管理": ["组织", "管理", "团队", "架构", "实践", "转型", "效率",
               "协作", "OKR", "敏捷", "工程文化"],
    "前沿科研": ["量子计算", "凝聚体", "拓扑", "超导", "光子", "中微子",
               "引力波", "黑洞", "论文", "学术"],
    "行业应用": ["医疗", "金融", "制造", "零售", "汽车", "无人", "机器人",
               "自动驾驶", "智慧", "产业", "落地", "应用场景"],
}


def classify_theme(title, content=""):
    """根据标题+正文关键词分类主题。"""
    combined = (title + " " + content[:500]).lower()
    best_theme = "其他"
    best_score = 0
    for theme, keywords in THEME_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in combined)
        if score > best_score:
            best_score = score
            best_theme = theme
    return best_theme if best_score > 0 else "其他"


# ─── 批量分析主函数 ────────────────────────────────────

def analyze_articles(articles, use_llm=True, llm_batch_delay=2.5):
    """批量分析文章：分类 + 摘要 + 关键数据。

    Args:
        articles: 文章列表（每个含 content 字段）
        use_llm: 是否用 LLM 生成深度摘要
        llm_batch_delay: LLM 调用间延迟

    Returns: (articles_with_analysis, themes)
    """
    themes = {t: [] for t in list(THEME_KEYWORDS.keys()) + ["其他"]}
    analyzed = []
    llm_success = 0

    for i, art in enumerate(articles):
        content = art.get("content", "")
        title = art.get("title", "")

        # 主题分类
        theme = classify_theme(title, content)
        art["theme"] = theme
        themes[theme].append(art)

        # 本地摘要（兜底，始终计算）
        art["local_summary"] = local_summarize(content, 250)
        art["key_data"] = local_extract_key_data(content)

        # LLM 深度摘要（可选）
        if use_llm and content and len(content) > 150:
            result = llm_summarize_article(title, content, art.get("account", ""))
            if result:
                art["llm_summary"] = result.get("summary", "")
                art["llm_key_data"] = result.get("key_data", [])
                art["llm_significance"] = result.get("significance", "")
                if result.get("category"):
                    art["llm_category"] = result["category"]
                llm_success += 1
            if llm_batch_delay and i < len(articles) - 1:
                time.sleep(llm_batch_delay)

        analyzed.append(art)

    print(f"  LLM 深度摘要: {llm_success}/{len([a for a in articles if len(a.get('content',''))>150])} 篇成功")
    return analyzed, themes


if __name__ == "__main__":
    # 测试
    from extract_article_content import clean_content
    test = """# 测试文章
这是一篇关于 DeepSeek V4 Pro 的文章。性能提升了 3.5 倍。参数量达到 671B。
训练成本降低了 80%。这是一个重要的突破。"""
    print("=== 本地摘要测试 ===")
    print(local_summarize(test))
    print("\n=== 关键数据测试 ===")
    print(local_extract_key_data(test))
