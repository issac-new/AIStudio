---
name: doc-runtime-consistency
description: "Use when editing design docs across multiple edit passes."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, design-doc, verification]
    related_skills: [design-doc-sync-audit, design-doc-feynman-craft, mermaid-a4-diagram-design]
---

# 文档-运行态一致性纪律（Doc-Runtime Consistency）

> orchestrator 自有沉淀位：多轮大编辑设计文档时的验证纪律与状态判定权归属。
> 与 default profile 的 design-doc-sync-audit（同步五件套）/ feynman-craft（写作法）互补——那些 skill 不可跨 profile 直改时，规则落这里。

## 规则一：大编辑会静默回滚早前已断言的改写

多轮改造同一章节时，早前 replace 成功过的标题/导语/过渡段会被后续大段编辑覆盖回旧文，而同批的表格行与新小节存活——**部分存活最难察觉**（查表以为改过，读导语发现旧文）。

- 每次大编辑后对**整节从标题到末行**重读校验，不能只验本轮命中的锚点
- 盲区优先查：导语区（标题+首段+过渡句）与 mermaid 图块内标签

## 规则二：mermaid 图是正文口径的影子副本

图块里的 subgraph 标签/节点/计数复制了正文的口径主张。改正文岗位数/命名时**同一轮**：grep 图块内旧口径词 → 改块 → 重渲染 → vision 清单验收（节点齐/标签新/新连线在/无截断）。只改正文不改图 = 文档自相矛盾，且旧渲染图在 `git diff` 里不可见。

单块重提渲染：

```bash
python3 -c "
import re
text = open(DOC).read()
blocks = re.findall(r'\x60\x60\x60mermaid\n(.*?)\x60\x60\x60', text, re.S)
open('/tmp/f.mmd','w').write(next(b for b in blocks if 'MARKER' in b))"
mmdc -i /tmp/f.mmd -o /tmp/f.png -p /tmp/pptr.json -b white -s 2
```

## 规则三：文档不体现 ≠ 退役

判定资产/团队/域的状态以**运行态名册**为准（board.json roster、profiles 目录、config 实测）。「整体设计文档不体现」是叙事范围裁定，不是编制裁定——按前者写 `status: retired`/清空名册会把活跃编制打下线。状态落笔前必查运行态；叙事裁定零落地。

## 规则四：载体存在 ≠ 已接线（防形式可达）

机制实体在盘、文档有引用，仍可能断链：载体躺在归档区、调度入口（orchestrator SOUL 路由表）没有它的触发词。接线验收**查消费侧**：读调用方 SOUL/路由表的触发条件行，grep 触发词命中才算 Wired；只 grep 载体文件存在 = Present 假验收。

## 规则五：登记类 YAML 演进用示范条目

给 registry/台账类文件新增可选字段时，挑 1 条补全作示范、其余条目渐进入位，不批量重写全部条目——schema 向后兼容，断链面最小。

## 关联

- 同步审计五件套/口径扫描 → default profile `design-doc-sync-audit`
- 写作法（正面陈述/递进骨架） → default profile `design-doc-feynman-craft`
- 图设计美学（主题/布局） → default profile `mermaid-a4-diagram-design`
