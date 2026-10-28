---
name: incremental-repo-research
description: "Use when 重复调研既往已融合的仓库：recall先行/基线锚融合产物/CHANGELOG盘点/双侧gap核验."
version: 1.1.0
metadata:
  hermes:
    tags: [devops, research, open-source, delta-research, gap-verification]
    related_skills: [open-source-architecture-research, open-source-skill-fusion-v2, orchestrator-profile-skill-writeback]
---

# 同仓库增量重调研（delta re-research）

> 权威源声明：仓库调研的通用纪律（分层映射/高信号目标/file:line 引用/蓝军核查/gap 三分类）
> 在 default profile 的 `open-source-architecture-research`（原件）；融合落盘纪律在
> `open-source-skill-fusion-v2`（原件，pitfall #12 既有融合查询 / #17 不吸收清单）。
> 本 skill 只承载「同一仓库第二次及以后调研」的增量子程序，不复制上述通用纪律——查原件。

## When to Use

- 用户再次点名既往调研过的仓库（hindsight/记忆有该仓库名记录）
- 旧调研报告已佚失但融合产物可能在位
- 上游仓库持续活跃（release 密集、当日仍有 push）

## 纪律：先 recall 再 clone
动手前先 hindsight_recall 仓库名。命中既往调研即走本增量模式，禁全量重跑——
否则会把一个月前的调研重做一遍，浪费整轮 clone+深读预算。

## Procedure（6 步）

1. **基线三查**：① 既往调研版本号（recall 记录）；② 融合产物逐项 grep 在位（协议
   文件/skill/已装 CLI 实测存在）；③ 本地已装版本（CLI `--version`）vs 上游最新
   （`npm view <pkg> version` / releases 页）。
2. **版本跨度盘点**：`git log --oneline <baseline-tag>..HEAD` + CHANGELOG 基线后各版本节。
   **[Unreleased] 节必读**——未发版机制常比最近 release 更多，只盘已发版本会漏增量。
3. **新模块发现**：`find src -maxdepth 1 -type d` + 各模块 `wc -l | sort -n`，
   只深读基线后新增/膨胀目录；旧模块只追 CHANGELOG 点名的变更点。
4. **gap 双侧机械核验**：每条「本侧缺失」grep 目标文件证实不存在；每条「已融合」
   grep 产物文件证实存在。禁凭记忆断言——验收抽查会打回。
5. **报告**：`<repo>-<ver>-delta-report.md` 落 workspace 持久层。结构：版本增量表 /
   新模块架构（file:line 锚）/ 吸收候选表（每行必带「现状核验」列，注 grep 证据）/
   显式不吸收清单+理由 / file:line 索引两列表（供蓝军抽查）。
6. **蓝军核查后待裁决**：delegate_task 抽查 file:line + gap 公允性（output_schema
   强制结构化回执）；报告交付即止，融合执行待用户裁决（「调研先行」纪律）。

## 融合执行阶段（用户裁决吸收后）

裁决「全选/部分吸收」后进入落地派工。拆卡、派发与验收：

1. **垂直切片+尾批合一**：单项机制一张卡；多条小项（<10 行规则增补类）合并
   一张「尾批合一卡」，body 按源报告逐项列 WHAT 与逐项 grep 验收——小项逐卡
   派发会把限流波次拖长数倍。卡 body 首行注明项数与源报告路径。
2. **卡 body 注入源锚**：每项 WHAT 带上游 file:line + 一句语义复述（可引一句
   上游动机原文），worker 免重复摸底；同时写明本侧落点「先 grep 现状再动手、
   纯增不重写」边界与零删除抽查要求。
3. **frozen 验收=可直接复跑的命令**：写实参，模式先对预期落点实测一次再冻结
   （坑 6）。
4. **限流分波**：同 profile 每波 ≤3 张，波间等 complete 回执再放下一波。
5. **独立验收**：worker 报 done 后逐卡复跑 frozen 命令，不信自述与内嵌评审
   结论；检测器类脚本必做负例对照（坑 7）；卡 metadata 在 `task_runs` 表
   （不是 `runs`）。
6. **落点偏差处置**：worker 把落点从卡定文件挪到别处（如共享协议文件→现役
   skill 载体）时，验收判内容在位+依据合理即收，但偏差必须已在卡内留痕；
   未留痕的落点漂移打回补记。

## Pitfalls

### 1. 基线锚融合产物，不锚报告文件
workspace 清理会删旧调研报告；「已吸收什么」的地面真值是落地物（协议/skill/CLI）
   逐项 grep，报告佚失不影响增量调研成立。反之报告还在也不代表产物在位——以产物为准。

### 2. 凭记忆写「我们没有 X / 上次融过 X」
增量 gap 表最易翻车处。缺失侧与已有侧都要实测 grep，每行落「现状核验」列——
   把已融合机制误报为 gap 会产生重复协议，把已有能力误报为缺失会浪费融合轮。

### 3. 只盘已发版本
活跃仓库的 [Unreleased] 节常含最大机制变更（breaking change、架构迁移预告）。
   CHANGELOG 从头读到基线行为止，别从最新 release 倒着看两版就走。

### 4. 基线自证的深度要复核——「源码级」可能名不副实
判断历史调研线是否真源码级，看产物证据形态而非名义：锚点全在
   `xxx.py:1-60` 式模块开头段=结构级；锚点带函数签名/公式逐字引用/行区间
   落在实现中部=源码级；自证「证据=release 页抓取」=文档级。增量卡派发前
   grep 基线产物的锚点密度（`\.py:[0-9]+` 计数+引用方式），文档级/结构级
   基线要在卡 body 写明「本基线欠源码深度，须补读」，别让增量轮继承浅基线。

### 5. 深读纪律是验收条款不是风格建议
用户裁决（2026-10-18）：禁 grep 关键词匹配式肤浅调研。落地为卡 body
   「深读纪律」节并入 frozen 验收：每条机制结论先读后断言；算法级机制给
   语义复述+函数签名+核心行引用；证据分级 [SRC file:line]/[DOC]，[DOC]
   级不得单独作吸收依据；报告附已通读文件清单+行数；锚点 ±5 行漂移容忍、
   超窗降级。行号锚点是读过的副产物，不是替代品。

### 6. 验收 grep 模式凭预期想象写
frozen 验收命令的模式与产物真实形态不符（标题有无 § 前缀、全半角标点、编号
   格式），复跑零命中误判「未落地」。写验收命令前先对预期落点实测一次 grep，
   模式照抄产物真实格式。

### 7. 检测器脚本只验正例
正例全过≠检测器有效——永不触发的检测器同样「正例全过」。验收必做负例对照：
   手工注入一处违规（注水数字/未脱敏密钥样张），实跑确认命中且对原文零误报。

### 8. 蓝军抽查上游锚点时快照已被清理
worker 收尾常删上游 tarball/快照，报告里的「删除前路径」不可复跑。蓝军抽查
   须自行重拉对应 tag/tarball 再比对：上游侧语义级吻合（docstring/注释逐字、
   行号零漂移）+ 本地侧行号精确命中，合起来才是真源码级读过的证据。
