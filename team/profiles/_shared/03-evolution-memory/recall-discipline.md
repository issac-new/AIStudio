# 知识检索纪律协议（Recall Discipline — 共享参考）

> 层级：03-evolution-memory（进化记忆层共享协议）
> 来源：t_8b00c6a8 融合 Tencent/teamai-cli v0.22.0 `agents/teamai-recall.md`（Step 0-5 + Hard rules；范式提炼见 `workspace/research/teamai-cli-research-report.md` §3.2，Gap 2）
> 触发词：hindsight_recall / hindsight_reflect / 记忆召回 / 检索纪律 / coverage 判断 / gap / 冷启动

## 一句话

召回 ≠ 知识存在：hindsight_recall 返回 topically-adjacent 结果不是答案存在的证据，单次排序查询不中也不是知识不存在的证据——检索前一问（预检短路）、检索后自判（coverage）、无覆盖按三段 gap 模板诚实输出，禁止把邻近结果包装成答案、禁止对 gap 区域猜答案。

## 纪律 1 — 预检短路（调用前 fail fast）

调 hindsight_recall 前先一问：这个任务是否可能与既有经验相关？

- **明显无关不调**：纯网页调研（外部公开知识）、全新领域首发任务、一次性脚本——直接走 web_search / 源码阅读，不烧检索。
- **冷启动 bank 不硬凑**（Hermes 侧补充判据，非源码转译）：bank 无命中历史（新 bank，命中 <5 条的阶段）时，召回大概率空转或噪声；预期空就别为了「看起来调过了」硬调一次。判据：hindsight_recall 连续两题全空 → 停止对后续同类任务预调，转 web_search / 自主推理。
- 预检拿不准不阻塞：允许低成本调一次试探（对应源范式「precheck 失败跳过预检继续」），但结果仍须过纪律 3 的 coverage 自判。

## 纪律 2 — 双语扩展（中英互补关键词）

知识 bank 中英混杂：中文经验条目会被纯英文任务词错过，反之亦然。调 hindsight_recall 前把领域词扩展成双语关键词集：

- 中文任务补英文领域词再召回（「摩擦信号沉淀」→ 同时用 `friction signal capture`）；英文任务补中文词（`restart inference cluster` → 同时补 `重启 推理 集群`）。
- **language-neutral token 不译**：专名/品牌与产品名/错误码/代码标识符/文件路径/版本号/CLI 命令（`Hermes`、`RuntimeError`、`v2.1.3`、`oauth`）原样保留——翻译只会伤匹配。
- 领域词双语各召回一次即可，不逐词穷举、不塞低信号填充词。

## 纪律 3 — coverage 反幻觉（召回命中 ≠ 知识覆盖）

hindsight_recall 按相似度返回候选，**不判断覆盖**；判 coverage 是调用者的责任，不是检索工具的：

- **命中不等于覆盖**：topically-adjacent 结果（同域不同题、术语子串命中、过期条目）禁止包装成答案——相似度不是事实正确性（与 memory-governance.md 读侧门「批判-重构」同源）。
- **换词上限 ≤3 次**：同一问题换词重召回（换支撑词/换主体词/切语言）≤3 次，超过即判 gap。两个方向都要自判：「召回有结果」不是知识存在的证据，「一次没召回」也不是知识不存在的证据。
- 记录每次的判别词（discriminating terms）与命中情况——纪律 4 的 gap 模板要用，无记录则 gap 报告无从写起。

## 纪律 4 — gap 三段模板（无覆盖时的诚实输出）

判 gap 后不猜答案，按三段模板输出给下游：

```
### 检索 gap 报告（<query 摘要>）

**无条目覆盖** <判别词>。（一句查证过程：试过哪些词/语言组合，是否已到换词上限）

Rejected matches（为何不适用）:
- <条目/主题> — 仅命中 <词>；<为何不适用于本任务>

Partial coverage（无则省略本段）:
- <条目> — 覆盖 <哪一半需求>；不覆盖 <哪一半>

Gaps:
⚠️ <gap 描述> — 禁猜答案区域。<指路：哪个工具/skill 能答，若明显。>
```

- Partial coverage 条目必须写明「答哪个需求、不答哪个需求」，禁止把部分覆盖升格为全答。
- Rejected matches 留在拒绝列表里——禁止把它们提拔为答案。
- 下游对 Gaps 区域只能转 web_search / 派工 / 问人，不得用邻近条目顶替。

## 纪律 5 — 深度分级（按任务类型选工具，不逐个平推）

| 任务类型 | 工具 | 理由 |
|---|---|---|
| 快速经验查证（之前怎么做/踩过什么坑） | `hindsight_recall` | 单跳语义召回，秒级 |
| 跨记忆综合推理（多源经验归纳/复盘/模式提炼） | `hindsight_reflect` | 跨条目综合，慢但出洞察 |
| 外部公开知识（新库/文档/行业现状） | `web_search` | 内部 bank 天然无覆盖，硬凑必空 |

- 同一任务可组合（先 reflect 出假设 → web_search 验证），但**按任务类型选主工具**，禁止三工具逐个平推式「都调一遍求安心」。
- 编辑类任务要 file:line 锚点时：先 hindsight_recall 定位经验，再 read_file / search_files 直查源码——检索工具不产锚点，源码才产。

## 单行形式（SOUL / skill 内引用）

```
**知识检索纪律**：hindsight_recall 前预检短路（无关任务/冷启动 bank 不硬调）、关键词中英双语扩展（language-neutral 不译）、召回命中≠知识覆盖（topically-adjacent 禁包装成答案，同题换词≤3 次超即判 gap）、无覆盖按 Rejected/Partial/Gaps 三段模板输出禁猜答案、按任务类型选 hindsight_recall/hindsight_reflect/web_search 不平推。详见 `~/.hermes/profiles/_shared/03-evolution-memory/recall-discipline.md`。
```
