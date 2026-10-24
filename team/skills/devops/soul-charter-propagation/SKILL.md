---
name: soul-charter-propagation
description: "Use when an org-wide framework must reach all agent SOULs."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, charter, single-source-of-truth, fleet-propagation, cjk-verification]
    related_skills: [soul-framework-propagation, soul-protocol-block-insertion, delegation-brief-format]
---

# SOUL Charter Propagation（纲领的单源舰队挂接）

触发词：公共部分/单一事实源/改一处全生效/灵魂/纲领挂接；中文触发词见正文首段。

本 profile 本地副本：中央库 soul-framework-propagation / soul-protocol-block-insertion
属 default profile，skill_manage 拒写；本 skill 承载它们缺的两课——**载体选型**
（charter 引用 vs 全文粘贴）与 **CJK 验证陷阱**。深层 patch 机制（锚点变体、步号重排、
批量脚本纪律）直接读那两个 skill，本文件不重复。

## When to Use

- 用户给了一套理念/方法论/纲领，要求成为「全体 agent 的灵魂/共识/公共部分」
- 用户说「可以作为公共部分写入么，避免每次动全局所有文件」——这是点名 Pattern C
- 任何「改一处、全舰队生效」的 SOUL 内容分发需求

## 载体选型（动手前先定，选错返工成本是 47 个文件）

| | Pattern C — charter 引用（默认） | Pattern F — 全文粘贴 |
|---|---|---|
| 适用 | 长期演进型纲领；岗位差异能压成一行主镜 | 每岗需要深度定制小节（表格/话术/场景）；内容稳定不再改 |
| SOUL 净增 | ≤3 行（引用行 + 可选主镜行） | 一整个小节 |
| 纲领修订成本 | 改 charter 1 个文件 | 舰队级批量 patch 重来 |
| 单源纪律 | charter 是唯一全文载体；**charter 存在时禁往任何 SOUL 粘全文** | 各 SOUL 即全文，无 charter |

**Pattern C 步骤**：
1. 纲领写成 `_shared/<域>/<name>-charter.md`，必含 `## 引用方式` 小节：标准引用行原文逐字在此，worker 只准从此复制，禁另行措辞（另行措辞会碎片化全舰队口径）。
2. 引用行形态：`> <emoji> **<纲领名>**（<触发时机>）：<一句压缩全文>。全文见 [`_shared/<域>/<文件.md>`](~/.hermes/profiles/_shared/<域>/<文件.md>)。`
3. `_shared` git 库 commit，hash 进派工卡验收判据。
4. orchestrator 自己的 SOUL 先行改为引用式（若先前写了全文版，收编进 charter 后必须同步替换，防双处维护）。
5. 其余 46 个 SOUL 按 census 锚点批量插入引用行（机制见 soul-protocol-block-insertion；批量纪律见 soul-framework-propagation §Batch）。
6. 设计文档接线：理论节加指路行（as-is 措辞）；待舰队挂接验收通过后回写为现状描述。

## CJK 验证陷阱（验收判据必须按此写，否则误判方向不可控）

**禁用 bash `grep '<中文串>'` 验证 CJK 内容插入**——多字节字面量在 bash grep 里对
实际存在的行可能返回 0 命中，把合格批次误判为全灭（失败方向误报）。实测判例：
46 文件逐一含完全相同的中文引用行，`grep` 中文句式报 0/46，python 比对实为 46/46 一致。

- CJK 行验证：python 逐文件 utf-8 读入，与 charter 标准行**逐字节比对**（strip 后相等），
  计数必须 = 舰队规模。
- bash `grep -c` 只用于 ASCII 标记（如 charter 文件名）。
- macOS/BSD 无 `cat -A`，字节检查用 `od -c` 或 python。
- 双向计数都查：每文件 marker 计数 =1（0=漏插，>1=重复插入）。

## 派工卡验收判据模板（frozen，全部可二分）

- census：目标文件数与实测 profile 目录数一致（排除项列名）
- 覆盖：逐文件 grep charter 文件名命中数 =1，缺失名单必须列名
- 一致性：python 逐字节比对引用行 = 标准行，计数 = N
- 位置：插入行落文件前 70% 决策区（>70% 视为尾部堆放违规）
- 单源：charter 已 git commit（hash 留痕）；SOUL 中无全文粘贴（抽查 5 团队）

## 相关 skill

- `soul-framework-propagation`（default，只读）— Pattern F 全文机制与批量纪律
- `soul-protocol-block-insertion`（default，只读）— 锚点结构变体与步号重排
- `delegation-brief-format` — 派工卡七要素与 frozen 验收写法