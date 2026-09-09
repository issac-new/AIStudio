---
name: web-scraping-antibot
description: 中文平台（搜狗/微信/知乎）被反爬拦截时，选型爬虫/反爬工具并设计检索管线。
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [scraping, anti-bot, wechat, sogou, zhihu, crawler, proxy, stealth]
    related_skills:
      - real-browser-antibot-bypass
      - web-search-antibot-research
      - sogou-wechat-batch-fetch
---

# Web Scraping & Anti-Bot Retrieval（中文平台）

爬虫/反爬绕过 + 检索能力增强的类级知识。涵盖搜狗/微信专项实测、反检测工具选型、分层检索架构。

## When to Use

- 搜狗微信搜索（`weixin.sogou.com` / `m.sogou.com`）返回验证码或 403
- 微信文章页 `mp.weixin.qq.com` curl/crawl4ai/playwright 都拿不到正文
- 需要选型爬虫框架（crawl4ai / Firecrawl / ScrapeGraphAI / Camoufox / nanobrowser）
- 设计"批量拉公众号今日文章 → 分析 → 内参"类检索管线
- 任何中文平台（搜狗/微信/知乎/百度）被反爬拦截时

## 搜狗端点实时状态（2026-08-05 实测，macOS 出口 IP 114.x）

| 端点 | 反爬强度 | 备注 |
|---|---|---|
| `weixin.sogou.com/weixin?type=2&query=...` | 极高，首次请求即字符验证码 | 不可用 |
| `www.sogou.com/web?query=...` | 高，第二次请求起 antispider | 仅首次可能成功 |
| `m.sogou.com/web/searchList.jsp?keyword=site:mp.weixin.qq.com+<号名>` | 中，约 5 次成功后连续 403 | **推荐**；移动端 UA |

**封禁信号**：m.sogou.com 被封后返回 **HTTP 403 Forbidden**（不是 antispider 页）。脚本必须把 403 当封禁立即停止，不继续重试剩余账号。封禁数小时后可恢复。

## 搜狗签名 URL 的 ×tamp 编码陷阱

搜狗跳转链接解码后形如 `https://mp.weixin.qq.com/s?src=11×tamp=1785899135&ver=...&signature=...`——`×` 是 **U+00D7（乘号）**，源自 `&timestamp` 被截断。

**正确修复**（直接字符替换双保险）：
```python
url = url.replace('\u00d7', 'x').replace('\ufffd', 'x')
```

**错误修复**：先 `encode('latin-1', errors='replace').decode('utf-8')` 再 replace——latin-1 往返把 U+00D7 转成 U+FFFD，后续 replace 永远匹配不到。

**注意**：修复后签名 URL 仍多数拿不到正文（签名过期/参数截断），只有 `__biz=` 标准 URL 可访问。搜狗通道价值 = 标题+摘要（snippet ~80 字）。

## 微信文章正文提取：headless 全败，唯一路径是真实浏览器

对 `mp.weixin.qq.com` 实测：
- curl/urllib → 30KB JS shell，无 `js_content`
- crawl4ai 0.9.2（undetected browser）→ "环境异常，完成验证后即可继续访问"
- Playwright + playwright-stealth 2.0.3 → 空白页，`js_content` NOT FOUND
  - v2 API：无 `stealth_async/stealth_sync`，用 `from playwright_stealth import Stealth; await Stealth().apply_stealth_async(context)`

**结论**：正文提取不要试 headless/stealth，直接用 computer_use + AppleScript 驱动宿主机真实浏览器（Edge/Chrome，见 real-browser-antibot-bypass）。摘要级需求用搜狗 snippet + Bing RSS 交叉即可，不必逐篇取全文。

## 工具矩阵速查（详情见 references/anti-bot-tool-matrix.md）

- **AI 原生爬虫**：Firecrawl（161K★，托管隐身模式）、crawl4ai（76K★，undetected browser+代理+会话）、ScrapeGraphAI（29K★，自然语言指令）
- **反检测浏览器**：Camoufox（C++级指纹注入，<200MB，专为 AI agent）、selenium-stealth、undetected-chromedriver、playwright-stealth
- **Agent 浏览器**：nanobrowser（13.5K★，多智能体 Chrome 扩展）、browser-use
- **微信公众号专项**：wechat_articles_spider（344★）等，均受限；微信生态封闭
- **商用 API/代理**：Scrappey（按成功付费含住宅代理）、Talordata（$0.25/1000）、Firecrawl API、Bright Data

## 分层检索架构

```
L0 直接请求   urllib/curl + Bing RSS（搜狗被封时降级 site:mp.weixin.qq.com 搜索）
L1 增强请求   ProxyRotator（代理轮换 + UA 池 + 8-15s 随机间隔 + 403 立即停）
L2 浏览器渲染 crawl4ai undetected / Playwright+stealth / Camoufox / Firecrawl API
L3 Agent      nanobrowser / computer_use 宿主机真实浏览器（微信正文唯一路径）
L4 多源融合   搜狗 + Bing RSS + 微信搜一搜 + 第三方公众号数据平台（新榜/清博）
```

## 检索管线落地（life-workbench 参考）

- `scripts/fetch_wechat_enhanced.py`：搜狗移动端 → 403/antispider 降级 Bing RSS → 标题+URL
- `scripts/daily_intel_report.py`：collect → 6 类主题分析 → 内参 md → 合并日报 → pandoc+Chrome headless PDF → `hermes send -t weixin`
- cron 安全策略：script 必须放 `~/.hermes/scripts/`（软链接到 workspace），cron job script 字段填相对文件名，profile scripts 绝对路径被拒绝

## References

- `references/wechat-sogou-anti-bot-notes.md` — 搜狗/微信反爬实测笔记（封禁信号、×tamp 修复、headless 全败、管线数据流）
- `references/anti-bot-tool-matrix.md` — 爬虫/反爬工具矩阵（Stars、能力、反爬机制、商用 API 定价）

## Related Skills

- **real-browser-antibot-bypass** — 验证码绕过唯一可靠路径（computer_use + 宿主机浏览器）
- **web-search-antibot-research** — Bing RSS 无浏览器反爬搜索技巧
- **sogou-wechat-batch-fetch** — 搜狗批量抓取（本 skill 的实测更新优先）
