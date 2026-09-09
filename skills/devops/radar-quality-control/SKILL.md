---
name: radar-quality-control
description: "Use when 雷达报告被批样子货/扩源/邮件无摘要：先原料后模型诊断+扩源三关+邮件红线。"
version: 1.0.1
metadata:
  hermes:
    tags: [radar, intel, quality, rss, llm-input]
---

# Radar Quality Control — 情报雷达扩源与报告质量

管辖：`life-workbench/scripts/` 的雷达管线（radar_fetch / domain_nightly / build_domain_report /
build_[已移除] / radar_llm_brief / send_report_email）。管道运维（幂等/补跑/投递）见
nightly-radar-runbook 与 domain-nightly-ops；本 skill 管内容质量与源扩展。

## 诊断铁律：先原料，后模型

报告被批「样子货/空话」时按序查，**不要先动 prompt**：

1. **看产物体积**：域报告 PDF ~190KB ≈ LLM 失败的纯雷达模式，~530KB ≈ 正常生成；md <2KB = 纯标题列表。
2. **看 LLM 实际吃到的原料**：从 summary json 抽 top_items 的 snippet——含 `<figure><img`
   等 HTML 残片 = 原料污染；数输出里「标题判断，待读原文」出现率，>1/3 即原料不足。
3. **原料干净且充足仍空话，才调 prompt/换模型**——此时才允许怀疑 LLM。

根因法则：**原料层缺陷会伪装成「LLM 能力不行」——先看喂进去的是什么，再怪模型。**
历史根因 RC1（字段错位）/RC7（截断过薄）/RC8（HTML 穿透）全是这一类。

## 原料红线（always-on）

- strip_html 必须「剥标签 → unescape → 再剥」两轮 + 清 CDATA 壳——escaped 源
  （`&lt;img&gt;` 形式）的标签经 unescape 会变回真标签穿透；第三层 escaped
  字面量保留（`&lt;guardrail&gt;` 是合法代码记号，剥掉 = 过度清洗）。
- 改任何报告生成器前先核实上游字段名（是 `snippet` 不是 `summary`），不信记忆。
- prompt 每条原料 400 字；硬约束「标题判断 ≤1 条；摘要为空的条目跳过，宁缺毋滥」。
- 所有 LLM 调用走 `radar_llm.ask_llm_json`（3 次重试+线性退避+平衡括号 JSON 提取），禁止裸 spawn。
- 关键词打分：ASCII 词 word-boundary、中文词 in——substring 会中文恒 False + `agent` 误中 `user-agent`。

## 邮件红线（always-on）

- 标题必须自识别：报告类型+领域+日期（如【支付清结算】领域深度雷达 2026-09-07），
  禁止所有报告共用一个无差别标题。
- 正文必须有实质摘要（态势/关键信号/建议），数据来自 LLM 分析落盘 JSON
  （`llm_advice_<prefix>_<date>.json`）；LLM 段缺失显式标注，禁止静默、
  禁止只有「数据底座 N 源 M 条」一行充数。
- 邮件通道不受微信限流影响 = 兜底通道，其质量标准与微信同。

## 扩源流程（三关 + 两复查）

1. **三关**：`curl -sL -A "Mozilla/5.0"` 返回 200 → `<item>`/`<entry>` ≥5 →
   description 非 HTML-escaped（escaped 源可入库但要登记备注）
2. **入库**：注册表登记 → py_compile → 该域真跑一次抓取 → sources_ok 全满才算过
3. **两复查**：① 来源分布——单一源占 Top10 一半以上 = 噪声重；
   ② **关键词命中率**（`_dscore>0` 占比）——命中率低先补该域 keywords 再上线
   （缺词 = 排名退化回 relevance 主键，新源噪声顶进 Top10）
4. 双份同步 `~/.hermes/scripts/` + diff 复核（两份并存不同步 = cron 跑旧版，
   修复静默不生效——无论改哪份，收工前 diff 两份必须一致）

## 退役源 / 拒收源（不要复试）

- 403（WAF/无公开 feed）：finextra rssing、devops.com/feed、thefinancialbrand.com、cadence community blog
- 200 但 0 items：americanbanker、usenix loginonline、36kr.com/feed、edutopia、langchain blog、anthropic.com/rss.xml、sre.google

当前注册表（49 源 × 10 域）落点：`domain_nightly.py` 的 `DOMAINS`（源 URL 明细以代码为准，
勿按记忆引用 references 文件——本 skill 的 references 明细表尚未建立）。

## Related

- nightly-intel-radar / nightly-radar-runbook / domain-nightly-ops — 管道与投递运维
- web-scraping-antibot — TLS 指纹/反爬选型
