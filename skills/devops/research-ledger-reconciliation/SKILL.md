---
name: research-ledger-reconciliation
version: 1.0.0
description: 历史调研记录全量对账与查缺补漏：五面证据扫描→分类→悬空清账→台账落盘，可增量重跑。
tags: [devops, research, governance, reconciliation]
when_to_use:
  - "历史调研/学习记录盘点"
  - "调研落地状态对账"
  - "查缺补漏"
---

# 调研记录全量对账（research-ledger-reconciliation）

> 来源：2026-09-24 用户裁决「重新盘点历史上所有调研学习记录，不要有漏」。首跑：orchestrator 会话，
> 204 单元全量分类 + 3 真悬空 + 2 类记录欠账清零，产物 research/history-research-ledger-20260925.md。

## 何时用

用户要求盘点/对账/查缺补漏历史调研（或任何「产物→落地」需要对账的资产面）时。
**范围口径**：用户说「历史所有记录」「不要有漏」= 全量对账（全部调研单元+全部记录欠账）；只盘某一类台账（如 gap_register）是子集，不满足「全量」口径。方向错跑满一轮再重跑=白烧预算。
半衰期建议：**每季度一次**（或 research/ 单元数增长 >30% 时增量重跑）。

## 对账管线（五面证据法）

调研「单元」= research/ 顶层 md + 专题目录（去资产类）。每个单元采五面证据：

| 面 | 判据 | 命令 |
|---|---|---|
| ① 裁决正册 | 设计文档/台账/changelog/adjudication/delivery-summary 是否提及 | `grep <key> research/hermes-*.md research/gap-closure-ledger.md` |
| ② skills 落地 | 中央库 SKILL.md 是否引用/承载 | `grep -rl <key> ~/.hermes/skills --include=SKILL.md` |
| ③ SOUL/规则 | profile SOUL 或 _shared 规则是否有痕 | `grep -rl <key> ~/.hermes/profiles --include=SOUL.md` |
| ④ 看板 | t_ 前缀产物按卡终态判定 | `sqlite3 <db> "SELECT status FROM tasks WHERE id='<tid>'"` |
| ⑤ 报告自带 | 文内 ADOPT/落地/收口/REJECT 标记 | 读尾部「结论/建议」节 |

## 分类与处置（frozen 口径）

| 类 | 判据 | 处置 |
|---|---|---|
| A1 正册有记录 | 面①命中 | ✓ 闭环 |
| A2 落地存在缺裁决 | 面②/③命中但面①空 | **不重做**，docsync 补账（单元名+一句话裁决入 gap-closure-ledger） |
| B 自带标记 | 面⑤命中 | ✓ 抽验后闭环 |
| C 真悬空 | 五面全空**且**报告尾部有未兑现承诺 | 建轻卡逐项收口（≤30min/项） |
| D 资产类 | figures/缓存/repo/venv/raw | 豁免（非承诺） |
| E 看板产物 | t_ 前缀 | 以卡终态为准 |

**C 类精查纪律（防误报）**：初扫的 C 候选必须逐个开报告尾部读「给消费方的建议」节再定性——
首跑 8 候选中 5 个是误报（openhuman 自称落地经查 4 skill 实存；同族文件已被代表；SOUL 有痕）。
同族多文件（如 aipay-01..07）按家族归并为一个单元再判。

## 记录性欠账检查（单元之外）

- `skill-proposals/pending-decision/`：挂起 >2 周未裁决的提案逐个 ADOPT/REJECT/DEFER
- `gap_register` done 无 resolved_fix：违反台账纪律 §5.2 条3，CLI 补一句话 fix 或转 dropped
- 历史用户指令线：对照 hindsight 可溯指令清单核对「指令→产物」无丢失

## 产物契约

1. 台账 `research/history-research-ledger-<date>.md`（分类总表+悬空清单+处置路径）
2. 底账 JSON 三件（scan/full/suspects，可增量重跑对比）
3. C 类清账卡 + 记录欠账清账卡（每卡 frozen 验收标准）
4. A2 类不占卡——随夜间 docsync 补账

## 增量重跑

```bash
python3 /tmp/ledger_scan.py     # 首跑脚本模板（或从本 skill scripts/ 取）
# 对比上次 _ledger_full_*.json：新增单元→走五面分类；旧 C 类→查清账卡终态
```

## 首跑基线（2026-09-25）

204 单元：A1=125 / A2=31 / B=26 / C=3 / D=6 / E=7 / REJECT=4；指令线 12 条全覆盖零丢失。
C1 bluearmy 过门 / C2 aipay pay 域沉淀 / C3 skill-miner 检索扩权 → 卡 t_de25eba6；
6 提案+33 无 fix → 卡 t_8fb229ad。

## Pitfalls

- **范围歧义先行**：用户说「不要漏」或「所有」时，按全量口径（全单元面+全欠账面）开工，子集盘点只能是全量的报告切片——方向错跑满一轮再重跑=白烧预算
- **初扫必多报**：关键词 grep 的 C 候选约 60% 是误报，必须人读报告尾部再定性
- **行号漂移**：引用旧报告的 file:line 修复项时先 grep 内容重定位（8 月报告的行号到 9 月已漂移）
- **家族归并**：同前缀系列文件（aipay-01..07）不归并会把 1 个单元数成 7 个欠账
- **资产豁免防漏判**：figures/templates/repo 目录不是承诺，但若含 ADJUDICATION 类文件需移出豁免
