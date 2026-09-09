#!/usr/bin/env python3
"""分层检索提取模块 — BrowserAct → crawl4ai → urllib 三级 fallback

解决微信文章页 JS 渲染 + 反爬验证问题。
优先级：
  L2a BrowserAct stealth-extract（有 API key 时，最强反爬）
  L2b crawl4ai undetected browser（本地免费，需安装）
  L2c urllib 直接提取（签名链接有效时）
  L2d computer_use 真实浏览器（最后手段，需要用户桌面会话）

使用方式：
  from wechat_retrieval_layers import extract_article_layered, check_browseract_available

  result = extract_article_layered(url)
  # result: {"content": str, "method": "browseract|crawl4ai|urllib|computer_use|failed", "error": str}
"""

import os
import re
import json
import subprocess
import urllib.request
import html as htmlmod

# ─── BrowserAct 检测 ────────────────────────────────────────

def check_browseract_available():
    """检测 BrowserAct CLI 是否可用 + 是否有 API key
    
    判断依据：实际运行一个轻量命令，观察是否报 "API key required"。
    auth poll 显示 pending 不代表 key 无效（可能是注册状态未同步），
    以 stealth-extract/browser list 的真实错误为准。
    
    Returns:
        (cli_available: bool, key_available: bool, detail: str)
    """
    # 1. CLI 是否存在
    which = subprocess.run(["which", "browser-act"], capture_output=True, text=True, timeout=5)
    if which.returncode != 0:
        return False, False, "browser-act CLI not installed"
    
    # 2. 尝试 browser list（轻量命令）判断 key 状态
    try:
        result = subprocess.run(
            ["browser-act", "browser", "list"],
            capture_output=True, text=True, timeout=15,
        )
        out = (result.stdout or "") + (result.stderr or "")
        if "API key required" in out or "Error 230103" in out:
            return True, False, "API key not set"
        # 没有报 key 缺失 → key 已配置（browser list 成功或 daemon 初始化中）
        if "Error 230305" in out or "timed out" in out:
            return True, True, "key set, daemon initializing (timeout)"
        return True, True, "key configured (browser list OK)"
    except Exception as e:
        return True, False, f"browser list check error: {str(e)[:60]}"


def browseract_extract(url, timeout=45):
    """用 BrowserAct stealth-extract 提取（最强反爬）"""
    result = subprocess.run(
        ["browser-act", "stealth-extract", url, "--content-type", "markdown", "--timeout", str(timeout)],
        capture_output=True, text=True, timeout=timeout + 15,
    )
    out = (result.stdout or "") + (result.stderr or "")
    
    # 检查错误
    if "API key required" in out or "Error 230103" in out:
        return {"content": "", "error": "browseract_api_key_required", "method": "browseract"}
    if "BLOCKING" in out:
        return {"content": "", "error": "browseract_skill_version_stale", "method": "browseract"}
    if "Error" in out and "环境异常" not in out:
        # 提取错误信息
        err_line = re.search(r"(Error \d+: .+)", out)
        return {"content": "", "error": err_line.group(1) if err_line else out[:80], "method": "browseract"}
    
    # 成功：输出是 markdown
    if result.returncode == 0 and out.strip():
        # 过滤掉可能的日志噪音
        lines = [l for l in out.splitlines() if not l.startswith(("[", "✓", "❌", "⚠", ">>>"))]
        content = "\n".join(lines).strip()
        if len(content) > 50:
            return {"content": content, "error": None, "method": "browseract"}
    
    return {"content": "", "error": f"empty result (rc={result.returncode})", "method": "browseract"}


# ─── crawl4ai 提取 ──────────────────────────────────────────

def crawl4ai_extract(url, timeout=45):
    """用 crawl4ai undetected browser 提取（本地免费）"""
    script = f'''
import asyncio, sys
sys.path.insert(0, "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/scripts")

async def main():
    from crawl4ai import AsyncWebCrawler, CacheMode
    target = """{url}"""
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=target, cache_mode=CacheMode.BYPASS)
            md = result.markdown if result else ""
            title = result.metadata.get("title", "") if result and result.metadata else ""
            print(f"__C4AI_TITLE__{{title}}")
            print(f"__C4AI_LEN__{{len(md)}}")
            # 只输出前 20000 字
            print(md[:20000])
    except Exception as e:
        print(f"__C4AI_ERR__{{str(e)[:120]}}")

asyncio.run(main())
'''
    try:
        result = subprocess.run(
            ["python3", "-c", script],
            capture_output=True, text=True, timeout=timeout + 20,
        )
        out = (result.stdout or "")
        
        # 解析
        title = ""
        tm = re.search(r"__C4AI_TITLE__(.*)", out)
        if tm: title = tm.group(1).strip()
        
        lm = re.search(r"__C4AI_LEN__(\d+)", out)
        content_len = int(lm.group(1)) if lm else 0
        
        em = re.search(r"__C4AI_ERR__(.*)", out)
        if em:
            return {"content": "", "error": f"crawl4ai: {em.group(1)[:80]}", "method": "crawl4ai"}
        
        # 提取正文（在标记之后）
        idx = out.find("__C4AI_LEN__")
        if idx >= 0:
            content = out[idx + len("__C4AI_LEN__1234567890"):].strip()
        else:
            content = out.strip()
        
        # 过滤"环境异常"（微信验证）
        if "环境异常" in content or len(content) < 50:
            return {"content": "", "error": "weixin_environment_check", "method": "crawl4ai"}
        
        return {"content": content, "title": title, "error": None, "method": "crawl4ai"}
    except Exception as e:
        return {"content": "", "error": f"crawl4ai exec: {str(e)[:80]}", "method": "crawl4ai"}


# ─── urllib 直接提取 ────────────────────────────────────────

def urllib_extract(url):
    """urllib 直接提取（签名链接有效时）"""
    # 修复 URL 编码问题
    url = url.replace('\u00d7', 'x').replace('\ufffd', 'x')
    
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        html = resp.read().decode("utf-8", errors="replace")
        
        # 提取标题
        title = ""
        m = re.search(r'var msg_title = "([^"]*)"', html)
        if m: title = htmlmod.unescape(m.group(1))
        if not title:
            m = re.search(r'<h1[^>]*class="rich_media_title"[^>]*>(.*?)</h1>', html, re.S)
            if m: title = htmlmod.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip()
        
        # 提取正文
        content = ""
        m = re.search(r'<div[^>]*id="js_content"[^>]*>(.*?)</div>\s*<script', html, re.S)
        if not m:
            m = re.search(r'<div[^>]*id="js_content"[^>]*>(.*?)</div>', html, re.S)
        if m:
            raw = m.group(1)
            raw = re.sub(r'<p[^>]*>', '\n', raw)
            raw = re.sub(r'<br\s*/?>', '\n', raw)
            raw = re.sub(r'<[^>]+>', '', raw)
            content = htmlmod.unescape(raw).strip()
            content = re.sub(r'\n{3,}', '\n\n', content)
            content = re.sub(r'[ \t]+', ' ', content)
        
        if len(content) < 50:
            return {"content": "", "error": "empty_content_js_rendered", "method": "urllib"}
        
        return {"content": content[:15000], "title": title, "error": None, "method": "urllib"}
    except Exception as e:
        return {"content": "", "error": f"urllib: {str(e)[:60]}", "method": "urllib"}


# ─── 分层主函数 ─────────────────────────────────────────────

def extract_article_layered(url, prefer="auto"):
    """分层提取微信文章正文
    
    Args:
        url: 文章 URL
        prefer: "auto" | "browseract" | "crawl4ai" | "urllib" — 首选方法
    """
    methods = ["browseract", "crawl4ai", "urllib"]
    if prefer != "auto" and prefer in methods:
        methods = [prefer] + [m for m in methods if m != prefer]
    
    # BrowserAct 只在有 key 时尝试
    if "browseract" in methods:
        cli_ok, key_ok, detail = check_browseract_available()
        if not (cli_ok and key_ok):
            methods = [m for m in methods if m != "browseract"]
    
    for method in methods:
        if method == "browseract":
            result = browseract_extract(url)
        elif method == "crawl4ai":
            result = crawl4ai_extract(url)
        else:
            result = urllib_extract(url)
        
        if result.get("content") and len(result.get("content", "")) > 50:
            result["attempts"] = methods[:methods.index(method) + 1]
            return result
        
        # 记录失败，继续下一层
        result["attempted_methods"] = methods[:methods.index(method) + 1]
    
    # 全部失败
    return {
        "content": "",
        "error": "all_methods_failed",
        "attempted_methods": methods,
        "method": "failed",
    }


def computer_use_hint(url):
    """当所有自动方法失败时，返回 computer_use 操作提示"""
    return {
        "hint": "自动提取失败。用 computer_use 驱动宿主机浏览器打开文章页（参考 real-browser-antibot-bypass skill）：\n"
                f"1. osascript -e 'tell application \"Microsoft Edge\" to set URL of active tab of front window to \"{url}\"'\n"
                "2. 等待渲染后 computer_use capture (som 模式) 读取正文",
        "method": "computer_use",
    }


if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else ""
    if not url:
        print("Usage: python3 wechat_retrieval_layers.py <article_url> [prefer]")
        sys.exit(1)
    
    prefer = sys.argv[2] if len(sys.argv) > 2 else "auto"
    print(f"URL: {url[:80]}...")
    print(f"Prefer: {prefer}")
    print()
    
    cli_ok, key_ok, detail = check_browseract_available()
    print(f"BrowserAct: cli={cli_ok}, key={key_ok} ({detail})")
    print()
    
    result = extract_article_layered(url, prefer)
    print(f"方法: {result.get('method')}")
    print(f"错误: {result.get('error')}")
    print(f"尝试: {result.get('attempted_methods', result.get('attempted_methods', 'N/A'))}")
    content = result.get("content", "")
    print(f"内容长度: {len(content)}")
    if content:
        print(f"前300字: {content[:300]}")
