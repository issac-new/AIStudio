# 安全情报信源分层（六类）与端点参数坑

适用：为雷达/舆情管道扩安全轴信源时选源与写 fetcher。设计原则：**权威库一手源 × 媒体
转述双层**——同日两条独立通道命中同一威胁（如 KEV 目录条目 × 媒体报道）是最强信号，
单层媒体只是二手转述。接入顺序按类别优先级，不按发现顺序。

## 一、漏洞编号权威库（第一优先，全部免费机器可读）

| 源 | 端点 | 坑/要点 |
|---|---|---|
| CISA KEV | `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | **全量目录非增量 feed**——拉全量后客户端过滤 `dateAdded` 近 7 天为当日增量；`knownRansomwareCampaignUse` 字段是勒索关联强信号 |
| GitHub Security Advisories | `https://api.github.com/advisories?per_page=15` | **`published=` 参数是精确日期匹配非范围查询**（传范围起点会返回 0 条）——裸拉倒序 + 客户端过滤 `published_at`；无 token 可用，403 限流时降 per_page |
| NVD API 2.0 | `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=...&pubEndDate=...&cvssV3Severity=HIGH` | 无 key 限流 5 req/30s（单次调用无碍）；日期参数要完整 ISO 含毫秒；`cvssV3Severity=HIGH` 过滤防淹没；baseScore 在 `metrics.cvssMetricV31[0].cvssData` |
| CVE.org | `https://cveawg.mitre.org/api/cve/` | 新 CVE 登记 fast path，NVD enrich 慢时补位 |
| CNVD / CNNVD | 网页通道 | 国产软件/信创漏洞独家收录，海外库没有；无公开 API，抓取走 HTML |

## 二、厂商 PSIRT（第二优先）

Microsoft MSRC（API+RSS）、Cisco PSIRT RSS、Oracle CPU（季度）、云厂商安全公告、卡组织/
支付厂商安全中心。特征：最准但只覆盖自家——做补位源，不做主力。

## 三、安全媒体（已接骨架时的补强）

优先补 The Record（`https://therecord.media/feed`，Recorded Future 旗下，日条目少而质量高）；
Dark Reading / SecurityWeek 可选。媒体层职责是「叙事与归因」，与权威库互证。

## 四、威胁情报聚合（IOC/恶意基础设施，攻防运营向）

AlienVault OTX（Pulse 订阅+API）、abuse.ch 家族（URLhaus/MalwareBazaar/ThreatFox 免费
feed）、GreyNoise（扫描归因，免费层够用）、VirusTotal（免费层限额）；国内商业：微步 X/Ti、
奇安信 TI。金融舆情场景次优先。

## 五、PoC/在野利用追踪

Exploit-DB/Packet Storm（存档）、inthewild.io、GitHub 按时间窗搜新 CVE PoC 仓（API 可
自动化）；KEV × PoC 双确认 = 最强处置优先级信号。

## 六、社区邮件列表（最后接，噪声比高）

oss-security、full-disclosure、r/netsec；HN 关键词通道可提前覆盖部分。

## fetcher 写法约定

- 条目 title 带库前缀标识：`[KEV] {cveID} {vendor}/{product}: {name}`、`[GHSA] {summary}`、
  `[NVD {baseScore}] {id}`——前缀确保五轴评分落安全轴且机构匹配不误判。
- 全量目录类源（KEV）fetcher 必须含日期窗过滤，否则每次全量上千条灌爆当日报告。
