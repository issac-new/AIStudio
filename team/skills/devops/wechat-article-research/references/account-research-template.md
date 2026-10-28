# Account-level WeChat Research — Report Skeleton

Use this skeleton when the user asks to "research all articles from account X and apply to domain Y" (e.g. readsemi → improve EDA team). Verified on a 43-result / 41-article account (readsemi, 2026-08-27).

## Front-matter (always state, never fake)

> 数据源：搜狗微信检索 `<account>` 全部结果（N 条 / 公众号「<display_name>」）
> 抓取方式：浏览器逐篇跳转 mp.weixin.qq.com，成功抓取 **M 篇** 正文（约 X 万字），K 篇无关转载剔除。
> 所有断言均来自原文标题与正文，可回溯，无臆造参数。

## 0. 执行摘要

- Account focus & signature style (e.g. readsemi = 先进封装/异构集成/HBM/光互连/材料工艺; "不是X而是Y" insight 范式)
- Article count mapped to each target profile/team
- Core trend statement
- Capability gaps (what the target team's SOULs currently DON'T cover)

## 1. 文章主题聚类 (N 篇)

Group by theme with sub-bullets per article title.

## 2. 按目标 Profile/Team 的文章映射与能力缺口

### <Profile A> (k 篇)
- **文章1**
- **文章2**
...

## 3. 关键技术概念覆盖矩阵（文章数）

| 技术概念 | ProfileA | ProfileB | ProfileC | ProfileD |
|---|---|---|---|---|
| Hybrid Bonding | 6 | 7 | 0 | 0 |
...

## 4. 能力完善建议（落点）

### 4.1 <Profile with biggest gap>
- concrete new section / skill / toolchain additions

## 5. 交叉洞察（insight 范式）

- 不是X，而是Y bullet list distilled from the account's recurring framing

## 6. 附：全部文章清单（标题｜分组｜字数）

---

## Deliverable discipline (from the readsemi run)

1. Raw抓取 → `<workdir>/<account>_all_urls.json` (link+date)
2. Extractions → `<account>_clean.json` (unique status=ok, title+content+account)
3. Enriched → `<account>_enriched.json` (adds primary_profile tag per article)
4. Report → `<workdir>/<account>_research_report.md`
5. Cross-team domain knowledge → `~/.hermes/profiles/_shared/knowledge/<account>_<topic>_domain.md` (shared, loadable by all 4 profiles — avoids editing protected SOUL.md files)
6. If you must patch SOUL.md: it's a PROTECTED agent-instruction file — the write guard will BLOCK it. Route domain knowledge to `_shared/knowledge/` instead, and report the SOUL patch as a proposed-diff for the user to authorize.
