---
name: shidianguji-classics-access
description: "Use when a task accesses 识典古籍 (shidianguji.com) classics."
version: 0.1.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, chinese, classics, shidianguji, digital-library, metadata]
    related_skills:
      - chinese-classics-book-resources
---

# 识典古籍 (Shidianguji) Classics Access

## 合规红线（F5——正文首段，优先级高于本 skill 其余内容）

- **元数据批发 + 按需引导阅读**：agent 只批量获取书目元数据（URL/书名/作者/版本/收录状态），
  正文阅读一律引导用户到官方阅读器（未登录可读，T5 §3.1）。
- **不批量抓正文**：正文文本与影像的权利方为北京大学/合作机构，未开放批量再分发
  （T5 §六前提共识、§1.3）。任何路径都不得批量抓取正文。
- **不代登录复制**：阅读页 UI 的 Highlight/Note/Copy 功能以登录为前提且受用户协议约束；
  agent 不代登录、不代复制（T5 §1.3 [S8]）。
- **版权归属**：北大提供的图文数据版权归北京大学；平台内容由字节跳动运营
  （T5 §1.1/§1.3 [S1]）。

## Skill 范围

Access 识典古籍 (shidianguji.com) — the ByteDance/北大 digital classics
platform — for book metadata, lookup, and reading guidance. This skill
covers compliant access paths, search methodology, ID-segment indexing,
and scale boundaries. All numbers cite the source report's section (T5 =
shidianguji-platform-report.md, surveyed 2026-09-07).

## When to Use

- 需要在识典古籍中查找某部古籍（书目卡、版本信息、阅读链接）
- 需要平台级书目索引或收录规模数据（引用前必须重新实测，见「收录规模三口径」）
- [已移除] 书单/经典书目目录需要补充识典古籍的在册书目与直链
- 需要判断某古籍是否被识典古籍收录（检索双试 + sitemap 在册验证）

Don't use for: 非 shidianguji 系古籍站（ctext/guwendao/zdic —— 见
chinese-classics-book-resources）；guoxue.com 与 gu.zdic.net 现返回识典古籍同一页面，
属本 skill 生态，不算独立来源（T5 §1.5）。

## 接入路径（按实测排序 A > B > C > D）

### 路径 A：官方 sitemap 元数据全量索引（首选）

- 做法：`GET https://www.shidianguji.com/sitemap-book` → 解析全部 /book/<ID> URL
  （2026-09-07 实测 76,484 条，HTTP 200、205KB 压缩响应；curl 默认 UA 即可，无需伪装）
  （T5 §3.2/§六A [S5]）。入口为官网页脚挂出的「站点地图」官方开放链接（T5 §3.2 [S4]）。
- 成本：极低——单请求拿全量 URL 清单；书名/作者/版本元数据需经路径 B/C 按需逐条补齐
  （sitemap 只给 URL）（T5 §六A）。
- 合规：高——官方开放入口；robots.txt 对主流爬虫 UA 显式白名单，Disallow 仅
  /profile、/passport、/ttwid、/api/ancientlib/read/count/volume-version、
  /eden-web-socket-server 五条隐私路径（T5 §3.2 [S9]）。
- 可行性：高——已全链路实测（76,484 条落地、69/69 核心清单交叉验证）（T5 §六A [S5]）。
- 限制：URL→书名映射不在 sitemap 内，只对核心子集补齐即可（T5 §六A）。

### 路径 B：站内 SSR 检索（按需查询）

- 做法：对查询词请求站内搜索页，解析 SSR HTML 中的「相关书籍：书名[朝代]作者·版本」
  命中列表（T5 §四 [S11]）。
- 成本：低——每查询 1 请求；69 词实测 68 词命中真实书目（T5 §四 [S11]）。
- 合规：高——等同人工站内搜索，元数据级返回；保持人工频率（T5 §六B）。
- 可行性：高，但有三条硬性注意（T5 §六B）：
  1. 必须经渲染通道（web_extract/无头浏览器）——裸 curl 命中 argus 风控壳（见 Pitfalls）；
  2. 控制频率——8 线程并发实测立即触发风控；
  3. 通行名+底本名双试（见下节）。

### 路径 C：渲染通道单书直读（条件触发，不批量）

- 做法：对具体书页 /book/<ID> 经 web_extract 渲染获取 SSR 内容（标题/简介/目录），
  返回书目卡与阅读链接；正文引导用户至官方阅读器（T5 §六C）。
- 成本：中——渲染通道比 curl 慢（单页约 1–2 秒），需维护；按需单页，不批量（T5 §六A/§六C）。
- 合规：中高——单页元数据级获取 + 引导官方阅读，不落正文不分发正文（T5 §六C）。
- 可行性：中——2026-09-07 实测可用，但站方风控强度存在按 IP/速率/时段的波动窗口，
  持续可用性无法保证（T5 §3.3 [S11]、§七 7.1 第 7 条）。

### 路径 D：外部搜索引擎反查（轻量兜底）

- 做法：web_search「site:shidianguji.com <书名>」——Google/Bing 已索引书页
  （搜索可直接返回书页标题与简介）（T5 §四/§六D [S5]）。
- 成本：近零。合规：高（公开搜索引擎索引）。可行性：中——覆盖限于搜索引擎已收录页，
  新收录书可能查不到；适合兜底，不适合全量（T5 §六D）。

**路径选择结论**（T5 §六）：元数据规模接入走 A；交互式问答走 B；
具体书目卡走 C；A/B 失效时以 D 兜底。

## 检索方法学（路径 B 专用）

- **双试**：通行名 + 底本名都查。底本名与通行名常不一致（如《诗经》底本名《毛诗》），
  这是官方内测已知问题（T5 §四 [S3]）。
- **简繁同义**：站内用字有底本原字/繁体/简体三态，检索对简繁同义——实测「三国志」与
  「三國志」命中同一书目（T5 §四 [S11]）。
- **假题对照法**（方法学自证）：验证检索通道时构造 1 个不存在的假书名作为对照——
  实测假题「天担保元历」0 命中，证明命中列表是真实检索结果而非无条件返回（T5 §四/§7.3 [S11]）。

## ID 段位与索引设计（F6）

- **分类页 ID 段位**（SSR 分类页直读实测，T5 §2.4 [S6]）：
  - 10000–10007 = 八大部类（经/史/子/集/道教/佛教/出土文献/文书档案）
  - 20000–20075 = 二级类（实测 76 个，T5 §2.1 注）
  - 30000+ = 三级属（实测 126 个，T5 §2.2）
- **书籍 ID 形态**：字母前缀+数字（SBCK011 = 四部丛刊第 11 种，T5 §2.4 [S5]）或
  纯数字大整数（新合作批次，如天工开物 7246…、红楼梦 7428…，T5 §2.3）。
- **警示：前缀语义未确认**。NGJ/HY/NA/QLZ/K 等字母前缀的含义官方未公布对照表，
  现有解释均为实测推断——索引设计只用段位规律，不用前缀语义（T5 §2.3/§七 7.1 第 1 条）。
- 索引合成策略：「核心优先、长尾在册」——核心典籍子集补齐元数据，长尾仅以 sitemap
  URL 在册（T5 §六A）。

## 收录规模三口径（勿混用；引用前必须重新实测）

| 口径 | 数字 | 性质 | 来源 |
|---|---|---|---|
| 上线之初 | 390 部（约 3000 多万字） | 官方宣称（2022-10） | T5 §1.2 [S3] |
| 近期官方口径 | 两千余部 | 官方宣称（维基转引，2025-07） | T5 §1.2 [S3] |
| sitemap 实测 | 76,484 条 /book/ URL | 实测（2026-09-07） | T5 §1.2/§3.2 [S5] |
| L3 属级自述合计 | 38,421 种（122/126 属有数字） | 站内页面自述实测 | T5 §1.2/§2.2 [S6] |

- 三口径差异属「宣称滞后于实际扩容」形态，非矛盾；以实测值为准（T5 §1.2）。
- **时效声明**：以上计数类数据调研时点均为 2026-09-07；任何引用前必须重新实测
  sitemap 计数（T5 卷首、§六边界）。
- L3 自述合计 38,421 ≠ 全站总数：122/126 属直和，未含无数字属与 L2 直属书籍（T5 §7.2）。

## Pitfalls

- **裸 curl 抓书页/搜索页 = argus 风控壳**：同名页对渲染通道返回完整 SSR，
  对裸 curl 返回 2561 字节 argus 反爬壳页（带浏览器 UA 亦同）；高频并发（8 线程）
  触发 208KB 挑战页变体。一律走 web_extract/无头浏览器，单线程低频（T5 §3.3 [S8][S10]）。
- **不要依赖 curl 直抓的「偶然窗口」**：调研期内曾实测到分类页可被 curl 直读
  （214 页样本），属风控波动窗口，工程上不应依赖（T5 §3.3 [S11]）。
- **不要把 guoxue.com / gu.zdic.net 计为独立来源**：三者返回识典古籍同一页面，
  属同一生态（T5 §1.5）。
- **没有公开 API 与批量下载**：未发现官方全文批量下载/开放数据集入口；仅见 robots
  Disallow 的一条私有阅读计数 API，未探测（T5 §3.4/§7.1 第 6 条）。「未发现≠不存在」，
  指未登录可见范围内无此功能。
- **登录态与 APP 端未验证**：书架/笔记/全文复制等登录态功能、APP 专属内容
  （听书/播客/AI 问答范围）零凭据调研未触及，不做断言（T5 §7.1 第 2/4 条）。

## Procedure

1. 明确需求类型：全量索引 / 单书查询 / 书目卡 —— 对应路径 A / B / C。
2. 路径 A：`terminal("curl -s 'https://www.shidianguji.com/sitemap-book' -o sitemap.xml")`，
   统计 /book/ URL 数（完成判据：得到 URL 总数并与引用口径标注实测时间）。
3. 路径 B：web_extract 站内搜索页（通行名、底本名各一次）（完成判据：命中列表含
   书名[朝代]作者·版本，或双试均 0 命中并记录）。
4. 路径 C：web_extract 书页 /book/<ID>（完成判据：拿到标题/简介/目录其一）。
5. 需要收录验证时交叉：检索命中 ∩ sitemap 在册（完成判据：双重验证通过才标「收录」）。
6. 交付书目卡时附官方阅读链接，正文阅读引导至官网阅读器（红线：不贴正文、不代复制）。

## Verification

- 抽 1 本书跑通「检索命中 + sitemap 在册」双链（完成判据：两处都命中同一 /book/<ID>）。
- sitemap 计数与上次引用值偏差大时，视为平台扩容，更新引用时点标注（完成判据：
  报告中的数字旁有实测日期）。

## 来源

- T5 = shidianguji-platform-report.md（research/cluster-knowledge-fusion-20260907/，
  调研日期 2026-09-07，S1–S12 来源台账见其第七章）。
- 注入依据：synthesis-fusion-plan.md §3.6 F 组（F1–F6）+ §4.2 候选表 + §五裁决项 3。
- 互链：chinese-classics-book-resources（[已移除] 书单目录验证职责，本 skill 为平台工程接入职责）。
