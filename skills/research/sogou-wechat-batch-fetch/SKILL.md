---
name: sogou-wechat-batch-fetch
description: "批量按公众号名拉取微信文章：官方站 API/镜像优先（Channel 0），搜狗 Web 通道兜底。"
---

# 微信公众号文章批量抓取（官方站优先，搜狗兜底）

按公众号名批量拉取"最近文章列表"（非关键词搜索文章）。

## 通道优先级总览

1. **Channel 0 — 公众号官方站 API/镜像**：零验证码、可高频，先试这个。
2. **搜狗 Web 通道**：反爬强、易封 IP、冷却期未知，只在目标公众号无官网/镜像时兜底使用。

## Channel 0 — 官方站 API/镜像（2026-09-04 实测）

量子位 qbitai.com（WordPress）：wp-json REST API 一轮拿到 300 篇近 60 天文章索引+全文，零验证码、连续高频请求无阻拦。正文在 `content.rendered`（HTML，去标签即全文），`date` 字段即发布日期。机器之心 jiqizhixin.com 官网列表页 HTML 中亦含结构化文章数据，直接解析原始 HTML 即可。

探测顺序（每号约 2 次请求）：

```python
# 1. WordPress 站：REST API 按时间列文章
#    https://qbitai.com/wp-json/wp/v2/posts?per_page=20&page=1&after=2026-07-05T00:00:00

# 2. 自建站：找首页/列表页里的 JSON 数据接口或 __NEXT_DATA__/__NUXT__ 内嵌数据

# 3. 都不通 → 退回搜狗通道（下文），并接受其封禁风险
```

## 搜狗端点选择（验证于 2026-08，macOS 出口 IP 114.x）

| 端点 | 反爬强度 | 备注 |
|---|---|---|
| `weixin.sogou.com/weixin?type=2&query=...` | 极高，几乎必出验证码 | 避免使用 |
| `www.sogou.com/web?query=site:mp.weixin.qq.com+<号名>` | 高，第二次请求起出 antispider | 仅首次请求可能成功 |
| `m.sogou.com/web/searchList.jsp?keyword=...` | 中，可连续约 10-15 次请求后封 IP | 搜狗内推荐，用移动端 UA |

移动端 UA：`Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`

## 移动端结果页解析

搜索结果的真实文章 URL 不在 `href` 明文里，而是包在搜狗跳转链接的 `url=` 参数中：

```
href="./id=<uuid>/keyword=.../tc?...&amp;url=<URLENCODED真实URL>&amp;..."
```

解析正则（Python）：

```python
import re, urllib.parse, html as htmlmod

for m in re.finditer(r'href="\./id=[^"]*?&amp;url=([^&"]+)[^"]*"[^>]*>(.*?)</a>', html, re.S):
    real_url = urllib.parse.unquote(m.group(1))
    # 只保留真实微信文章页，过滤搜狗站内跳转
    if "mp.weixin.qq.com/s?" not in real_url:
        continue
    real_url = re.sub(r'&qbExtraParams.*$', '', real_url)
    real_url = re.sub(r'&scene=.*$', '', real_url)
    real_url = htmlmod.unescape(real_url)
    title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
```

**关键过滤**：结果里混有大量搜狗内部跳转（`m.sogou.com/web/searchList.jsp?...`），其 `url=` 解码后仍是搜狗 URL。必须检查解码后 URL 含 `mp.weixin.qq.com/s?` 才算真实文章，否则会把"全部 / 相关搜索 / 平台介绍页"误收为文章。

## 速率与封禁（实测阈值）

- 单 IP 连续请求约 **10-15 次**后整站（含 m./www./weixin. 全部子域）封禁，返回 antispider 点击验证码页。
- 每请求间隔 2s 不够；建议 **≥8-15s 随机间隔**，且一次会话内账号数控制在 **10 个以内**。
- 封禁是 **IP 级**，换 UA/cookie 无效；浏览器工具（无住宅代理）同样无法绕过。
- **分页参数 `&p=2` 会显著加速封禁** —— 避免翻页，单页能拿到什么就拿什么。
- 被封后冷却期未知（>30min 仍封），**不要写自动重试循环**。

## 实战建议

1. 先跑 Channel 0（官方站 API），把搜狗留给无官网的小众号。
2. 搜狗一次跑完全部账号（每账号 1 次请求，间隔 ≥8s），不要失败后立刻重试 —— 重试加速封禁。
3. 小众公众号在搜狗索引很少，`site:` 查询常只得 1-2 篇，属正常现象；可追加 `<号名> 公众号` / `<号名> 微信` 变体查询补充。
4. 抓取脚本里**每账号跑完立即落盘增量 JSON**，被封时不丢已得数据（教训：覆盖式保存导致第二轮 0 结果把第一轮 46 条冲掉）。
5. 若 IP 已封，不要尝试 browser 工具（同一出口 IP），等冷却或换网络。
