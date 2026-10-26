#!/usr/bin/env python3
"""补充数据源：按今日热点关键词搜索微信文章

搜狗微信搜索 by 关键词（非公众号名），获取更多今日文章
"""

import json
import time
import random
import re
import os
import urllib.request
import urllib.parse
import html as htmlmod
from datetime import datetime

OUTPUT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
TODAY = datetime.now().strftime("%Y-%m-%d")

MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

# 今日热点关键词（AI技术 + 管理 + 安全）
KEYWORDS = [
    "AI大模型 2026",
    "LLM 最新进展",
    "Claude GPT",
    "Agent 多智能体",
    "RAG 检索增强",
    "DevOps 最佳实践",
    "微服务架构",
    "数据治理",
    "企业架构 EA",
    "零信任安全",
    "API安全",
    "代码审计",
    "量子计算",
    "芯片 EDA",
    "开源大模型",
    "prompt工程",
    "AIGC 应用",
    "向量数据库",
    "K8s 云原生",
    "网络安全 2026",
]

def search_keyword(keyword):
    """按关键词搜索微信文章"""
    query = urllib.parse.quote(f"site:mp.weixin.qq.com {keyword}")
    url = f"https://m.sogou.com/web/searchList.jsp?keyword={query}&page=1"

    req = urllib.request.Request(url, headers={
        "User-Agent": MOBILE_UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="replace")

        if "antispider" in html:
            return {"keyword": keyword, "error": "antispider", "articles": []}

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
                articles.append({
                    "title": title,
                    "url": real_url,
                    "keyword": keyword,
                })

        # Deduplicate
        seen = set()
        deduped = []
        for a in articles:
            if a["url"] not in seen:
                seen.add(a["url"])
                deduped.append(a)

        return {"keyword": keyword, "articles": deduped, "error": None}

    except Exception as e:
        return {"keyword": keyword, "error": str(e), "articles": []}


def main():
    output_file = os.path.join(OUTPUT_DIR, f"keyword_articles_{TODAY}.json")
    
    results = []
    print(f"=== 关键词补充搜索 ===")
    print(f"关键词: {len(KEYWORDS)} 个")
    print(flush=True)

    consecutive_fail = 0
    
    for i, kw in enumerate(KEYWORDS, 1):
        print(f"  [{i:2d}/{len(KEYWORDS)}] 🔄 {kw}...", end=" ", flush=True)
        
        result = search_keyword(kw)
        n = len(result.get("articles", []))
        error = result.get("error")
        
        if error == "antispider":
            print("❌ 封IP")
            consecutive_fail += 1
            if consecutive_fail >= 2:
                print("连续封禁，退出")
                break
            time.sleep(60)
            continue
        elif error:
            print(f"⚠️ {error[:30]}")
        else:
            print(f"✅ {n}篇")
            results.append(result)
            consecutive_fail = 0
        
        # Save incrementally
        with open(output_file, 'w') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        if i < len(KEYWORDS):
            time.sleep(random.uniform(10, 15))
    
    total = sum(len(r.get("articles", [])) for r in results)
    print(f"\n=== 关键词搜索完成 ===")
    print(f"成功: {len(results)} 关键词, {total} 篇文章")
    print(f"输出: {output_file}")


if __name__ == "__main__":
    main()
