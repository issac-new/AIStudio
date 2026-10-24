---
name: agent-interface-patterns
description: agent 集成层设计模式库：MCP 薄代理、token 契约、skill staging、配置写入三档策略。
version: 1.0.0
author: Hermes Agent (worker-coder)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [mcp, integration, design-contract, skill-staging, token-engineering, configuration]
    related_skills: [hermes-agent, claude-code, codex, ui-craft]
    source: "OpenDesign agent 集成层 + design-systems 数据层融合 (t_fd589e71)；源报告 research/opendesign-20261010/research/r2-design-systems-analysis.md 与 r3-agent-interface-analysis.md"
---

# Agent Interface Patterns — agent 与宿主系统集成层设计模式

一句话定位：把 OpenDesign 验证过的「agent ↔ 宿主」集成层决策提炼为可复用模式——每个模式带反例（OD 自己踩过的坑）与裁决理由，做 MCP/契约/技能分发/配置写入设计时按需取用。

## 何时加载

- 设计或评审 MCP server / 工具面 / agent 适配器时
- 设计 token/词表/schema 契约（尤其是「agent 会整体粘贴的契约」）时
- 给 worker/agent 分发 skill、或写用户配置文件（profile/config）的自动化时

## 模式索引（按优先级）

1. **MCP 薄代理分层** — MCP server 只做校验+转发，业务状态全在后台 daemon；凭据类字段在 MCP 层显式拒绝。MCP 层随时可重建而不背业务状态。→ references/integration-patterns.md §1
2. **粘贴式 token 契约 + 四层模型** — agent 把 `:root` 整块粘贴进单一 `<style>`，没有运行时级联，所以「必填但有 fallback」是声明纪律不是可选优化；配三禁令 prompt 句。→ references/token-contract.md
3. **技能实体拷贝 staging** — 每 run 把技能目录 dereference 拷入工作区，防 staged 树被 agent 编辑污染源；拷贝目录带源路径 hash 后缀。→ references/integration-patterns.md §2
4. **配置写入三档策略** — cli（用目标工具自己的 add 命令）/ json（深合并已知 schema）/ **manual（未确证格式一律拒绝写猜测路径，只打印可粘贴片段）**。把「写坏用户配置」风险结构化排除。→ references/integration-patterns.md §3
5. **host 契约单一源** — 产品代码消费的宿主契约（协议常量/标记/格式）单一文件定义、多路径消费、改一条路须点名全部路径逐一回答变更是否到达。反例：OD 双 prompt 实现，修复单侧花了两个 PR 近两倍体量。→ references/integration-patterns.md §4
6. **工具描述 token 工程** — 工具描述单职责短句；公共 fallback 语义上收写一次，省 ~150 token/会话。→ references/integration-patterns.md §5
7. **词表防腐**（schema-as-TS + 双镜像 parity guard + C 层白名单 + ≥2 使用者晋升） — 防词表无序生长，同时留扩展阀。→ references/token-contract.md §5
8. **registry shadow 语义** — 用户 root 遮蔽内置不删副本 + id 别名转发表续命改名。→ references/integration-patterns.md §6

## 明确反模式（三条红线）

1. **同一契约两份手维护实现** — 无论多强的新旧并行理由，等价需求走单一契约源。（OD 官方文档自认反模式，#7568→#7651 案例）
2. **绿灯测试替代路径枚举** — 「测试绿」回答的是更窄的问题；落地生成物行为变更前，点名每条组合路径并逐一回答变更是否到达。
3. **占位零权重角色** — 评审/决策角色要么给真权重要么不设，「带名字的零权重」是配置预留不是评分设计。

## References（按需加载）

- references/integration-patterns.md — MCP 薄代理 / staging / 三档写入 / 单一源 / token 工程 / shadow 语义全文
- references/token-contract.md — 四层 token 模型 / 粘贴契约三禁令 / 词表防腐晋升规则 / lint 回灌循环
- 融合裁决与不吸收清单：research/opendesign-20261010/research/c1-fusion-report.md §②⑤

## Attribution

- 模式来源：OpenDesign `apps/daemon/src/`（MCP 层、runtimes、skills）与 `packages/contracts/src/design-systems/`（MIT）。
- repo 锚点见各 references 文件头；分析报告 r2/r3 各带 file:line 与不吸收清单。
