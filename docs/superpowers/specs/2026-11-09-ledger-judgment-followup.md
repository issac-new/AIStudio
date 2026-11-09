# 台账裁决执行批（2026-11-09 晚）

> 用户指令：「完成未做」——台账刷新批（`2026-11-09-runtime-deps-refresh.md`，main 1fbb4b1a8）交付说明所列待裁决/欠账项全数执行。三项：判级升档 2 条落表、OpenExecutive v0.7.0 delta 重跑收口、ATT&CK 技能面 v20.1 指引句刷新。

## 变更

1. **判级正式升 🔴 2 条**（台账 §3.2 两行随批改判，用户裁决授权）：better-harness（QoderAI）🟡→🔴（v0.6.4 深读基线后 359c，pushed 2026-11-07；10-31 记 67c 系口径端点差异已在行内记档）；pi-harness（earendil-works/pi）🟡→🔴（tag 顶 v1.5.0 跨 minor，v1.4.0...main 634c；runtimes.tsv source 行 v1.5.0 已于 R143 登记）。两线均无本机在役依赖，升档为观察线口径，不派吸收卡。
2. **OpenExecutive v0.7.0 delta 重跑收口**：报告落外置盘 `research/openexec-delta-20261109/delta-report.md`（不入库）——v0.6.8→v0.7.0 为 66c/300 文件（经 v0.6.9 2026-11-03 与 v0.7.0 2026-11-07 两版）；v0.7.0 五主题：**Memory 子系统重做 8 条**（standing facts＋来源日期＋人可编辑删除＋变更可见 Undo＝带来源可审计可撤销的事实库）、**Approvals 每通道单门**（#706）、**claim check 后重写整段回复而非追加更正**（#717）、卡片四型问询、同名人物歧义问询；v0.6.9 补覆盖（长 turn Stop/I'll finish it 中断续作、Drive 域外共享落盘前确认、步数用尽诚实降级）。**机制层与本仓五面同构（记忆面/审批单门/诚实回复/外发确认/中断续作）无必吸收增量**，结论性收口；台账 §3.2 行基线 v0.6.8→v0.7.0 随批进位。
3. **ATT&CK 技能面 v20.1 句刷新**（11-07 挂账清偿）：`team/skills/devops/security-tool-landscape-tracking/SKILL.md` v20.0 段旧指引「cite v20.0 in red-team reports」改为指向现行版本 v20.1（与 11-07 增补段的「cite v20.1 going forward」统一单一口径；历史 STIX-diff 数字段保留原样）。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | 升档两线不派吸收卡 | 均无本机在役依赖；升档=观察线口径（§一.4 派卡依据是「有吸收价值」非判级本身） | 自动派卡（否决：无依赖面的 delta 边际收益低） |
| D2 | OpenExecutive delta 结论性收口 | 五面同构逐一对照（记忆/审批/诚实/外发/中断）；上游 v0.7.0 主题全部落在本仓既有机制面 | 强行吸收（否决：无增量机制，制造同义重复） |
| D3 | delta 报告落外置盘不入库 | 10-28 先例：research/{组件}-delta-YYYYMMDD/ 落外置盘，台账行登记去向 | 入库（否决：调研产物不占仓容，仓规 8） |

以上落 `.swarm-yuan/decisions.jsonl`（合并时点）。

## 验证

2026-11-09 实测：docs-ssot-guard **7/7 全绿**（附录 A 计数 605=标题声明=实际行数；机械索引 614=文件系统实测）；台账行 grep 对账——升档两行判级列 🔴 命中 2、OpenExecutive 行 v0.7.0 记档 12 处、外置盘路径在册；ATT&CK SKILL.md「cite v20.0」**零残留**（单一版本口径）；delta 报告复验命令三连（releases 前 3 版/compare 66/compare main 210）均已在报告内可复现。

## 设计文档影响

DESIGN_SYNC: none——本批不触 DESIGN_DOCS 四正本（tech-components-ledger 是调研台账非设计正本，其 §3.2/§二/§八 已随批修订；SKILL.md 属技能文档非设计文档）；spec 三处登记（附录 A＋机械索引＋scope.yaml）随批。
