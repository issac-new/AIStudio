---
name: wechat-research-patch-notes
description: 微信调研技能实证补丁存档。触发：核对 wechat-article-research 过期步骤。
version: 1.0.0
metadata:
  hermes:
    tags: [research, wechat, patch-notes]
---

# WeChat Research Patch Notes

`wechat-article-research` / `wechat-batch-discovery` 归 default profile（user-owned），orchestrator 无法直接 patch。本 skill 存档会话实证修正，供 curator adopt 后合并回主 skill。

## 2026-09-02 PMO前沿实证修正（53 篇全量调研）

### 修正 1：Sogou 搜索页 curl 可直接用（不需 browser）

主 skill 原文称「Sogou result DOM loads via JS; browser_exec 是可靠路径」——**2026-09-02 实证 curl 直接可用**：单 UA + 3-5s pacing，返回服务端渲染 HTML，正则 `<li id="sogou_vr_11002601_box_N">` 块一次解析出 title/href/timestamp/snippet（PMO前沿 10 页 89 条全拿到）。browser 仅留给 `/link?url=` 跳转解析（那步 curl 确实不 redirect）。

解析正则（curl 路径实测）：标题 `<h3[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>`，时间戳 `timeConvert\('(\d{10})'`，摘要 `<p class="txt-info"[^>]*>(.*?)</p>`。

### 修正 2：账号全量调研要双通道（账号名 + 主题池）

账号名直搜常只返回活动/邀请函类结果（PMO前沿 89 条里干货仅 14 条）。补搜 `<账号> <主题>` 关键词组合（如 `PMO前沿 复盘`/`PMO前沿 风险管理`，7 个查询）额外捞出 61 篇干货候选。做「全量调研」务必双通道。

### 修正 3：batch 落盘纪律

每批 ~12 篇立即写 `batchN.json` 到 workspace（禁 /tmp），单批失败不丢前批进度；最后合并去重出 `clean.json`。PMO前沿 61 候选 5 批全通过、0 次 403（pacing=load 后 sleep 3s + 篇间 9-12s）。too_short 8 篇为图片主导文章，属正常损耗非失败。

## 配套模板

`references/account-fusion-gap-template.md` — 「公众号→领域融合」GAP 分析模板（REPORT.md 骨架 + 判定四档纪律 + 落地优先顺序）。
