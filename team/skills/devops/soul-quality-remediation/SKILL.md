---
name: soul-quality-remediation
description: "Use when SOUL.md 质量排查修订: 剥离过程叙事/黑话/死引用, 补验收链与三节, 机械终验."
version: "1.0.0"
metadata:
  hermes:
    tags: [soul-design, audit, quality, fleet, documentation]
    related_skills: [cot-leakage-audit, hermes-agent-teams-capability-audit, agent-soul-patching, kanban-soul-authoring]
---

# SOUL.md 质量排查与修订（fleet 级）

对全 fleet SOUL.md 做终态质量审计并修订：剥离过程叙事/黑话/死引用，补齐「目标→设计→执行→验收」链条与三节尾。检测分类学（八类泄漏、HEAD 读者测试）见 `cot-leakage-audit`（default profile，本 skill 引用不改写）；本 skill 是 fleet 级修订的执行 runbook 与判性规则。

## 铁律（每轮必守）

- **profiles/ 非 git 仓库**：动手前 tar 备份全部目标，验收无误后才可清理。
- **探针不是定义**：rg 探针命中后逐条判性，误杀机制文本比漏杀叙事严重。
- **不造空节**：缺标题但有等价实质 ≠ 缺口；为凑结构数新增无内容标题是反向污染。
- **禁跨 profile 复制段落**：复制会漂移成多个字节变体并集体过期；补充内容必须逐 profile 差异化。
- **只删叙事不丢机制**：每删一段先列举命题，幸存事实重述为现在时后才能删原文。

## 探针扫描（只读先行）

```bash
rg -n 't_[a-f0-9]{8}' ~/.hermes/profiles/*/SOUL.md                 # kanban 卡号死引用
rg -n '20[0-9]{2}-[0-9]{2}-[0-9]{2}' ~/.hermes/profiles/*/SOUL.md  # 日期锚
rg -n '范式转移|认知跃迁|（易误读|（2026-' ~/.hermes/profiles/*/SOUL.md  # 黑话/修复历史/节标题日期
rg -n '^#+ .*20[0-9]{2}' ~/.hermes/profiles/*/SOUL.md              # 标题级时间锚
```

日期豁免三类（命中但保留）：取证/时间线示例中的日期、外部事件日（标准/规则切换日）、命令参数中的示例日期。

## 判性规则（修订前逐条过）

1. **等价节名算数**：「工作流程」= 循环节；tester/eval 角色全文即验收——记为等价通过，不算缺口。
2. **等价实质 → rename 归位**：要求的标准节名（如「## 具体操作命令手册」）缺失但现有节（如「## 补充工具与命令」）已是该实质时，原地改名，不并存两个内容重叠的节（重叠必漂移）。
3. **无实质 → 补差异化**：新节内容取自该 profile 自身的 references/config/域命令；各队各写各的，禁止同一段复制到多 profile。
4. **多数派拷贝不可作权威**：同一 boilerplate（如夜间窗口段）复制 N 份漂移出多版本时，以活源头（判窗脚本/config 当前行为）为准统一重写，不取出现次数最多的版本——多数派可能集体过期。
5. **悬空引用先展开再判**：路径含 `~`/变量时直接 `test -e` 误报；先展开再判存在性。真悬空才清，可解析的引用保留。
6. **黑话判性**：域内编号（如「路线①-⑦」）在本文件有定义 = 非悬空，保留但标注为跨文件复用时的改进项；无定义的会话黑话（范式转移/认知跃迁类）改写为直接陈述机制。

## 修订分轮（每轮一类，可脚本化批处理）

1. **叙事剥离轮**：标题去日期锚/卡号/融合叙事 → 行内日期锚按豁免清单过滤 → 卡号删除且机制事实改按卡名/规则文件检索 → 会话语用句删除、机制原则保留。
2. **结构归位轮**：rename 等价节（`t.replace('## 旧名', '## 标准名', 1)`）→ 缺节补差异化内容（插入锚定**下一节标题** `re.search(r'^## (下一节)', t, re.M)` 前 splice，勿依赖末行 append）→ 重复节（字节级 duplicate）先删后补。
3. **机制核验轮**：按域 grep 机制关键词（脚本名/契约名/状态机术语/验收命令）确认存活；这是「只删了叙事」的实证。

## 终验（机械，全绿才收工）

```python
# 探针归零（剩豁免清单）+ 每文件代码围栏偶数 + 无畸形表行（^\|\|）
# 结构覆盖: 角色/循环/验收/退出 + 三节尾(具体操作命令手册/补充工具与命令/高级用法与实战技巧) = N/N
```

三节尾是用户全 fleet 硬性要求（缺任一节验收必抓）；验收锚 = 交付物质量判据，流程口号（「产出X方案」）不算。

## 汇报格式

问题分布（探针×数量×实例）→ 修订表（轮次×内容×文件数）→ 终验三件套 → 遗留建议（未动的合并/收敛类工作单列，需用户裁决）。

## Pitfalls

- **skill_manage 只能写 active profile 的 skill**：cot-leakage-audit / agent-soul-patching 等是 default 所有，orchestrator 侧为 symlink，patch 被拒且 batch 整体回滚。判性新知落在本 skill，对 default skill 只引用。
- **批量 skill_manage 一个失败全回滚**：多 op 批次把可写的与存疑的分开提交；description 限 60 字符（截断点 57），超限整批拒绝。
- **修复历史重述为反事实现在时**：「不加 X 则 Y」保留，「曾经 Y 后来改了」删除；机制事实（判窗脚本/状态机/output-contract）一个都不能丢。
- **同段多版本时先全量字节比对再动手**：`hashlib` 各 profile 同名段，版本数决定统一策略。

## Related

- `cot-leakage-audit`（default）— 泄漏分类学与 HEAD 读者测试
- `hermes-agent-teams-capability-audit`（default）— 能力盘点（本 skill 是其 SOUL quality 维度的深化）
- `agent-soul-patching`（default）— 批量 patch 技术（rename/插入锚定）
- `kanban-soul-authoring`（default）— 新建 SOUL.md 的 9+3 节模板
