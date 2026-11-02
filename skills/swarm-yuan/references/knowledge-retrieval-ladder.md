# 四层知识检索协议（knowledge retrieval ladder）

> **何时读我**：任何「查这个功能怎么实现/谁依赖它/这个概念什么语义/改这里影响哪」的检索起点——先按层递进查，不足时升层，禁止一上来 grep 全仓或直奔 vendor 源码。改 relations.jsonl 结构或 docs 索引组织前必读。首行：# 四层知识检索协议（knowledge retrieval ladder）。

## 定位

来源：MTSC2026《AI Native 测试工程实践》（极智嘉）四层知识检索（codegraph→graphify 文档图谱→本地文档库→外部源码+mem）的本仓化。对照结论：**件件都在、链未成层**——relations.jsonl 边集、docs 索引、SKILL 路由表、glossary 术语表、vendor 基线、记忆台账各自存在，但「查什么先查哪、何时升层、怎么算证据」是隐性经验。本协议把它变显性纪律。

## 四层定义（由近及远）

| 层 | 载体 | 回答什么 | 工具/入口 |
|----|------|---------|----------|
| **L1 代码层** | `references/relations.jsonl`（import/调用/路由/消息边集，每行 `{from,to,kind,evidence}`） | 谁依赖 X / X 依赖谁 / 影响面反查 / 跨端链路 | `scripts/relations-query.sh`；AI 补语义边（call/route/ipc/job-flow） |
| **L2 结构层** | `docs/README.md` 入口索引 + SKILL.md 参考文档路由表 + `references/capability-map.md`（档→消费节点→触发） | 这类知识在哪个文档 / 该读哪份方法论 | 路由表按族分流；capability-map 反查「什么任务消费什么档」 |
| **L3 语义层** | `docs/superpowers/specs/*.md`（决策事实源，含收据）/ `docs/reports/` 复盘 / `simharness/mux/glossary.txt` 术语表（94 条：标准名+别名+定义）/ `references/ontology/` 本体三件 | 为什么这样设计 / 这个术语确切语义 / 历史决策与教训 | spec 按 `YYYY-MM-DD-<slug>` 命名检索；附录 A 索引全文主旨 |
| **L4 实现层** | `vendor/` 三树钉版源码（hermes-studio/hermes-agent/zcode，只读）+ `.swarm-yuan/` 台账族（decisions/trace/gate-deny/error-history） | 文档说的与代码做的是否一致 / 最后一行真相 | 读源码带 `file:line` 锚回填结论；台账查历史失败与决策 |

## 四条纪律

1. **由近及远，命中即止**：L1 命中（边集能回答依赖/影响）就不升层；L1 只有 import 边不够（需函数级调用链）才升 L4 读源码——中间层不重复劳动。
2. **不足时升层**：本层证据不能回答问题（如 L2 只知文档名不知语义→升 L3；L3 文档与现象矛盾→升 L4 对账实现）。
3. **跨层佐证**：改行为类结论须 L3（设计意图）+L4（实现事实）双侧命中才算定谳——文章「知识可证伪」纪律：文档与实现不一致时以实现为准、并回改文档（docs-ssot-guard/spec 收据体系执法）。
4. **结论带锚**：任何层的产出结论必须带 `file:line`/URL/命令输出锚点；无锚推断标注「推断」，禁与实测混写。

## 升层判据速查

| 问题形态 | 起查层 | 升层触发 |
|---------|-------|---------|
| 谁依赖/影响面 | L1 | 边集无语义边（只有 import）且问题涉运行时行为 → L4 |
| 概念/术语语义 | L3 glossary | 术语不在表 → 查 specs（L3）→ 仍无 → 新术语先入表再用 |
| 怎么改某功能 | L3 spec（该功能决策） | spec 缺席 → L2 找域文档 → 仍无 → L4 读实现后**补 spec** |
| 历史踩坑 | L4 `.swarm-yuan/` 台账 | 台账无 → decisions.jsonl → 仍无=新问题（处置后沉淀） |
| 测试该怎么写 | L3 spec §19（测试左移契约） | 契约不明 → L1 查既有同类测试形态 |

## 与检索工具的边界

graphify/GitNexus/codegraph 重型图谱工具维持「选型文档化、未实跑」结论（`references/code-graph-tools.md`：本机跑通一次索引+查询才进默认推荐）；L1 边集覆盖当前依赖/影响面检索需求，符号级调用链是未来升级项（触发条件：边集不达的检索场景连续出现三次以上）。
