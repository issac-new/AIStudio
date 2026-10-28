---
name: delta-research-dispatch
version: 1.1.0
description: "派发上游增量(delta)调研卡的程序与验收模板。Use when 台账判级后要把 🔴 线转为增量调研卡。"
tags: [research, dispatch, delta, kanban]
---

# 增量(delta)调研卡派发程序

> 触发：组件台账刷新后 🔴 线需派增量调研卡（上游活跃、基线报告落后）。上游实测方法归 skill `tech-component-ledger-refresh-orch`（读无边界，勿在此重述 gh api 细节）。

## Procedure

1. **基线三锚先定位再建卡**：基线报告路径、基线版本锚（HEAD sha / tag）、本机在役面（如常驻 runtime 技能）。仓库名从基线报告/卡 body 抓 github.com 正名——凭印象写 owner 是混记头号来源。
2. **建卡五要素**（缺一即验收漏洞）：①基线→现版区间 ②必读 context（基线报告路径+在役面路径，标注「先全文读完」）③工作步骤（compare 全量拉取→主题聚类→基线过期结论清单→三档建议→落盘）④frozen 验收清单 ⑤收尾契约。落盘路径写死为 `<调研区>/<组件>-delta-<日期>/<组件>-delta-<日期>.md`，目录不存在则 worker 自建。
3. **frozen 验收清单四件**（本 fleet 实测最优形状）：
   - 增量 commit 全量拉取（compare API 的 ahead_by 精确值，禁封顶近似入报告）
   - 主题聚类表 + 基线过期结论清单（逐条引基线报告原节编号）
   - 三档吸收建议：必吸收/可选/不吸收，逐项附理由与 file:line 锚点
   - 关键论断带 commit sha / tag 锚点；落盘路径与卡面一致
4. **建卡必显式 board**：kanban 工具不传 board 落遗留根库（卡能跑但板内不可见、易被重复派生）；目标板写死。
5. **并行派发与预算**：互不依赖的 delta 卡一次建 2-3 张并行（同 assignee 并行位上限约 5）；body 首行写 `> 预估 ~N 轮`；单卡 goal_mode 不必要，delta 类 25-30 轮常规收敛。
6. **收口验收**：worker complete 后独立核验四件——报告存在且行数合理（>100 行）、头部含精确 commit 总数、三档建议节存在、基线过期清单引用了真实基线报告节。报告质量高时其勘误（如混记仓库、封顶修正）回写台账。
7. **收口后台账联动**：对应行改「delta 已完成」+ 判级降 🟡（吸收决策期）；台账判级汇总补该线摘要；AIStudio 同步仓 commit。
8. **吸收闭环（delta ≠ 终点）**：报告的「必吸收」项是派卡依据——按落点域分卡（skill 层增补合一张 worker-coder 卡；pay/hack 等域内文件刷新各一张轻卡），卡 body 逐项抄报告原节（含锚点 sha）+ frozen grep 验收词。收口后机械 grep 验收（每组报告必吸收节的关键词在落点文件命中数>0），验收词清单直接用报告原文关键词，不自造。agent-skills/Autopt 类无必吸收项的报告以结论性收口，不硬造吸收卡。

## Pitfalls

- 基线快照常在外置盘调研区（如 hermes-docker-sandbox/workspace/research/），shared/research 未必有副本——建卡前 find 定位实际路径，勿写错必读 context。
- delta 报告经常反向勘误台账本身（仓库名混记/封顶近似/基线日期错）——收口时把勘误回写台账勘误节，勿只收报告。
- worker 用 compare API 会得出比台账 `since=` 法更精确的数（时区边界漏当日 commit）——台账旧值与报告新值不一致时以 compare 为准并记录差异。
- 派卡顺序：本机常驻 runtime 依赖的组件最前（过期风险实存）；纯方法论/survey 引用线殿后或不派。
- 吸收卡落点在 default 中央库 skill 时（如 prompt-injection-guard），worker 跨 profile 写会被拒——卡 body 预先注明按 orchestrator-profile-skill-writeback 纪律直接 patch 文件本体，勿让 worker 卡在权限上。
