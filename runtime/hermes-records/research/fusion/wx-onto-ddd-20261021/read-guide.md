# 微信语料融合阅读指南（所有批次共用）

> 本文件是 6 个阅读批次子代理的统一语境滤镜与产出规范。读我，再读你分到的文章。

## 你的任务

通读分给你的全部文章（每篇都从头读到尾，禁只读开头判断跳过），产出一份机制清单笔记，写到指定输出文件。

## 语料格式

- 文章 JSON 在 `corpus-onto/` 或 `corpus-ddd/` 目录，每篇一个文件
- 字段：`title`（标题）、`content`（正文纯文本，首行可能残留 `id="js_content"` HTML 渣，忽略即可）、`len`（字数）
- 单篇 3K-12K 字，读全文用 read_file 或 python json.load 后打印

## 产出格式（写入你的输出文件，markdown）

开头一节：批次综述（≤300 字：这批文章整体讲什么、质量密度如何、哪些是重复叙事可归并）。

主体：机制清单，每条机制一个条目：

```
### M<批次>-<序号> <机制名>
- 来源：<slug>（<标题前20字>）
- 解决什么问题：<一句话>
- 机制本体：<2-4 句讲清怎么运作，讲机制不讲故事>
- 依附语境：<该机制成立的前提（如：多人团队/线上高流量/已有数据平台）>
- 对 hermes 的映射建议：<若可映射，映射到哪个资产/机制；若不可映射，写 DROP 并给理由>
```

- 每批 10-30 条机制，按机制密度取舍，宁缺毋滥
- 同一批内多篇文章讲同一个机制的，归并为一条，来源列全部 slug
- 纯新闻动态、财报解读、人物故事：不设机制条目，只进批次综述一句话

## 语境滤镜：hermes 集群是什么

映射建议必须基于以下事实，不匹配的机制直接 DROP：

- 编排机制：kanban 看板卡生命周期（create→ready→running→done）+ SOUL.md 角色定义 + `_shared/` 共享规则文档 + skill 库
- worker 是 headless LLM 会话，无 GUI，通过工具（terminal/read_file/patch 等）干活
- 无线上生产流量：没有真实外部用户，没有 SaaS 多租户，没有 SLA 压力
- 已有资产：Palantir FDE 模式已融合为 `_shared/01-scheduling-bus/forward-deployed-protocol.md`（前线侦察/Staged Action/Mission Coordinator/reportDelivery 四机制）；腾讯 Agent 评测体系已融合（evals/baseline.md + tool-chain-assert）；本体资产在 `_shared/02-org-orchestration/ontology.md` + `ontology-shapes.yaml`

## 显式 DROP 类（依附语境不匹配，见即 DROP，不用逐条分析）

- 线上 AB 实验、影子流量、灰度发布（无线上流量）
- 多人标注一致率、标注平台运营（单人）
- 模型训练配方、finetune 基建（冻结权重，只用推理）
- SaaS 计费/多租户成本分摊（单用户）
- 纯营销话术、PPT 讲稿的包装叙事（机制部分照常提取）

## 收尾契约

- 写完输出文件后，在最终回复里给：输出文件绝对路径 + 机制条数 + 3 条最重要的发现（各一句话）
- 不确定、存疑的机制照常收录，在条目里标「存疑：<疑点>」
