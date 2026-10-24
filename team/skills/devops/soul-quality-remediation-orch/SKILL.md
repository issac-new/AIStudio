---
name: soul-quality-remediation-orch
description: "Use when fleet SOUL 审计/收敛执行时：备份双落位+共段收敛+编号黑话剥离三规则。"
version: 0.1.0
tags: [soul-design, audit, convergence, fleet, orchestrator]
metadata:
  hermes:
    tags: [soul-design, audit, convergence, fleet, orchestrator]
    related_skills: [soul-quality-remediation, soul-framework-propagation, orchestrator-profile-skill-writeback]
---

# SOUL 审计/收敛的 orchestrator 执行补充（-orch 增量件）

> **权威声明**：基础 runbook（探针扫描/判性规则/修订分轮/机械终验）在 default profile 的
> `soul-quality-remediation`。本件只存该件未覆盖、且在 orchestrator 会话实测验证过的增量规则。
> 两件并存时以 default 件为基准、本件为增量；禁把本件当全量 runbook 用。增量经用户裁决后
> 应合并回 default 件并删除本件（见文末前台待办）。

## 一、改前快照双落位（备份的持久纪律）

- tar 快照禁留 scratch——scratch 24h 自动剪枝，验收窗口一过即失去回滚能力。
- 落两处：① `~/.hermes/profiles/orchestrator/backups/<主题>-<日期>.tar.gz`（本机持久位）；
  ② 共享 git 仓 `~/hermes-docker-sandbox/workspace/fleet-archive/<主题>-<日期>/`：快照 + README
  （写范围/修订清单/回滚命令）后 commit。profiles/ 目录本身非 git 管理，共享仓留档是唯一
  带历史的副本。

## 二、共段收敛（N 份同名共享段漂移的统一）

前置：多个 profile 各有一段同名共享段（如「正面管教工具段」）且措辞各异时，按以下顺序：

1. **先分层再动手**：分「共性壳」（引用头/纪律行/术语表指针——应金句统一）与「专属内容」
   （学科植入点/域命令——必须原样保留）。只收敛壳；把专属内容也统一 = 抹掉真差异。
2. **先盘点共享文档副本形态**：段内引用的共享文档（toolkit/mapping 类）逐份 `readlink` +
   `shasum`。已 symlink 化的副本无文件级漂移——此时唯一漂移源就是段内壳文本，把全部精力
   花在壳上，零精力花在合并文档上。
3. **壳替换的正则要兼容小节名变体**：跨文件同名小节常带前缀/同义变体（`### 话术纪律` /
   `### ⚠️ 话术纪律` / `### 统一术语纪律` / 段尾 `> 术语统一：`），用 alternation 匹配 + 段尾
   blockquote 兑底；头块替换锚 `(?=\n### )` 停在第一个子节前，防吞夹在其间的专属内容。
4. **终验成对查**：每文件 canonical 文本 grep 计数 ==1 **且** 该文件专属关键词仍在位——
   只查前者漏 over-replacement（壳吞了专属），只查后者漏 under-replacement（没换干净）。

## 三、域内编号黑话的伴随语义名判据

- 域内编号（如「路线①-⑦」）逐处查伴随语义名：标题或行内括号里已有语义名时，编号是纯装饰，
  直接剥离零信息损失；编号是唯一语义承载时保留并在首次出现处定义。
- 判据是**逐处**不是文件级——同一文件内可能两种形态混存，按处裁决。

## 四、_shared 规则文风整改（2026-10-10 全量实证，语言规范 v3.0 的执行面）

> 触发：用户令「全局规则去 AI 味/终态化」。本轮 17 个规则文件、机械信号 160+→6（余量为规则引述豁免），机制事实抽查 14/14 幸存。

**病灶五类与改法**（探针全命中过）：
1. 标题日期缀（`（X 融合，2026-XX-XX）`）→ 剥日期与融合来源，标题只留机制名
2. 来历叙事（「由 F6 归并/增补自 X/源码级调研」）→ 头部改一行终态定位+来源行，或直接删（出处归 git）
3. 卡号死引用（`t_xxxxxxxx`）→ 删卡号留机制事实（39 处规则正文清零）；「事故卡 id」类活机制术语不算
4. 版本史节（`## 版本` + v1.x 清单）→ 删节，换一行「变更历史见 git log」；上游锚点（论文/标准）单列保留
5. 黑话（判性/成色/抓手/chokepoint/湖仓治理a5/X1 交叉裁决/B1 丙案）→ 按语言规范 11a 替换表直述

**顺序纪律**：先全量扫描出病灶分布 → tar 快照双落位（本机 backups + fleet-archive 共享仓）→ 按「标题级→行内级→版本节→黑话」分轮批量替换 → git commit（只挑本轮文件，不混历史未提交件）→ SOUL 引用行同步（受保护文件放最后）→ 终验三件套（机械信号对比/机制事实幸存抽查/结构完整性）。

**豁免清单**（命中但不动）：语言规范里引述病灶词的规则条文本身、外部论文元数据日期（arXiv 编号/发表年）、「已移档+复查条件」活机制指针、「事故卡 id」类机制术语、取证/时间线示例日期。

**教训**：①旧 squad 表的删除线「下轮审计可清」——批到本轮就清，不留「等下轮」尾巴；②git index.lock 撞锁时先查 lock 年龄（<2min=并发进程在跑，等；>3min=stale，清掉重试）；③共享仓常有 auto-backup cron，快照可能已被自动 commit，手动 commit 前先 log 核对防重复。

## 前台待办（本件的归宿）

以下三处应同步进 default 的 `soul-quality-remediation`（`hermes -p default` 前台会话直改，
或用户裁决后合并并删除本件）：

1. 铁律「profiles/ 非 git 仓库」句 → 补双落位（本文 §一）
2. 判性规则 4 之后 → 插入共段收敛规则（本文 §二）
3. 判性规则 6「域内编号保留」→ 改为伴随语义名判据（本文 §三）：默认「保留」已过时，
   语义名共存时剥离更优
