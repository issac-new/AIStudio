#!/usr/bin/env python3
"""LLM精选层 - 读正文，输出3句话替读摘要
用hermes -z 调用本地模型，零额外成本。
"""
import json, os, sys, subprocess

def llm_summarize(articles):
    """让LLM读一批文章正文，精选+摘要"""
    
    # 构造prompt：把所有文章正文打包给LLM
    articles_text = ""
    for i, a in enumerate(articles, 1):
        # 每篇截取前1500字（控制总长度）
        text = a.get("full_text", "")[:1500]
        articles_text += f"\n{'='*40}\n【文章{i}】\n标题：{a['title']}\n来源：{a['source']}\n正文（前1500字）：\n{text}\n"
    
    prompt = f"""你是技术情报分析师。以下是{len(articles)}篇AI技术文章。请从中选出最值得CTO/技术决策者花时间读的3-5篇，为每篇生成3句话替读摘要。

选文标准：
- 优先：新模型/工具发布+有工程细节、安全漏洞+技术分析、开源项目+实际可用、行业趋势+有数据支撑
- 排除：纯学术理论、招聘/会议/活动新闻、泛泛而谈的废话

输出格式（严格，不要多余文字）：
```
## 第N篇：《标题》| 来源
1. [这篇讲什么，一句话]
2. [核心数据/技术点/关键发现，一句话]
3. [对你的价值：值不值得点开原文，一句话]
```

文章列表：
{articles_text}

请选出3-5篇，按价值排序输出："""

    # 用hermes -z 调用本地模型
    result = subprocess.run(
        ["hermes", "-z", prompt, "--model", "glm-5.2", "--no-tools"],
        capture_output=True, text=True, timeout=120
    )
    
    return result.stdout.strip()


if __name__ == "__main__":
    # 从v3管道读取有效文章
    cache_dir = os.path.expanduser("~/hermes-docker-sandbox/workspace/life-workbench/cache/articles")
    today_articles_json = os.path.expanduser("~/hermes-docker-sandbox/workspace/life-workbench/cache/v3_valid_today.json")
    
    if not os.path.exists(today_articles_json):
        print("请先运行 daily_intel_v3.py 生成文章缓存")
        sys.exit(1)
    
    with open(today_articles_json) as f:
        articles = json.load(f)
    
    print(f"读取{len(articles)}篇有效文章，开始LLM精选...")
    output = llm_summarize(articles)
    print("\n" + "="*50)
    print(output)
    
    # 保存
    from datetime import datetime
    out_file = os.path.expanduser(f"~/hermes-docker-sandbox/workspace/life-workbench/reports/intel_v3_llm_{datetime.now().strftime('%Y-%m-%d')}.txt")
    with open(out_file, "w") as f:
        f.write(output)
    print(f"\n已保存: {out_file}")
