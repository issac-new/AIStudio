> **何时读我**：需要落 AI 过程记录（审计/复盘/交接）时。AI 过程记录规范——trace/decisions/key-nodes 的记录口径。

# AI 过程信息项制度（GB/T 8566-2022 过程信息项的 AI 扩展）

> 依据：GB/T 8566-2022（IDT ISO/IEC/IEEE 12207:2017）附录 A 过程剪裁 + 附录 B 信息项；联动 `references/standards-compliance.md` §B"剪裁声明写法示例"中"AI 过程信息项扩展"条目（prompt 记录、AI 产出 diff、人工复核记录纳入配置管理）——本文件即该声明的制度化落地。
> 姿态：本文档为**文档层制度，无专属门禁**。未建立留痕目录时体系行为不变（静默）；启用后与全局姿态一致——新门禁未配置时静默跳过、启用后 fail-closed。配套机制：门禁运行记录落盘 `.swarm-yuan/gate-runs/`（GB/T 15532 过程文档对齐）由独立任务承担，本文件只引用、不复述其格式。

## 1. 为什么需要 AI 过程信息项

GB/T 8566-2022 要求每个采用的过程留有信息项（留痕证据）。AI 辅助开发改变了过程的输入与产出形态：

| 传统过程要素 | AI 辅助开发的对应物 | 留痕缺口 |
|-------------|--------------------|---------|
| 过程输入（需求/指令） | 决策性 prompt | prompt 只存在于会话上下文，随会话结束蒸发 |
| 过程产出（工件） | AI 生成 diff | diff 在 git 可见，但"哪部分是 AI 生成、谁复核过"不可见 |
| 质量保证（评审记录） | 人工复核记录 | 复核行为发生但无落盘，验收时无法出示 |
| 过程执行（工具/技能调用） | AI 的子代理/技能/CLI 调用链 | 调用了何种工具及技能只存在于会话上下文，无法回查 |

三级留痕制度即对前三行逐项补齐：prompt（输入留痕）→ 生成 diff（产出留痕）→ 人工复核（复核留痕）。第四级（§2.4 调用留痕）补齐最后一行，对应设计理念 2（全链路追踪）。

## 2. 四级留痕规范

### 2.1 第一级：prompt 记录（输入留痕）

**范围**：只记录**决策性 prompt**——需求澄清结论、方案选型、门禁策略变更、豁免审批请求。闲聊式问答、探索性检索不强制。

**落盘**：`.swarm-yuan/ai-records/prompts/<YYYYMMDD-HHMMSS>-<主题>.md`

**字段**（头部清单即可，prompt 全文可选附录）：

| 字段 | 说明 |
|------|------|
| 时间戳 | YYYY-MM-DD HH:MM（本地时区） |
| 任务/变更 | 关联的变更名或 spec 路径 |
| prompt 摘要 | 3-5 行概括关键指令与约束（全文过长时只留摘要 + 关键约束原文） |
| 关键约束 | 用户明确给出的铁律/边界（逐字） |
| 决策结果 | 该 prompt 导致了什么决定（选型/放弃/豁免） |
| 关联 spec 段 | 该决策落在 spec 的哪一段（可回查） |

### 2.2 第二级：生成 diff（产出留痕）

**载体**：git 工作区 diff 本身即留痕基础，制度只补"归档 + 标注"两件事。

**规范**：

- 每个验收节点（spec 评审 / plan 评审 / 合入前）归档全量 diff：`.swarm-yuan/ai-records/diffs/<YYYYMMDD-HHMMSS>-<change>.diff`（未跟踪文件先 `git add -N` 使其进入 diff，或逐文件拷贝同名归档）
- commit message 或 diff 归档头部标注：**"AI 生成 + 复核人：<姓名/角色>"**——使"AI 生成 vs 人工手写"在配置管理中可区分
- 大段生成内容（整文件/整函数）在文件头注释或归档头部注明生成来源与工具

### 2.3 第三级：人工复核记录（复核留痕）

**落盘**：`.swarm-yuan/ai-records/reviews/<YYYYMMDD-HHMMSS>-<change>.md`

**字段**：

| 字段 | 说明 |
|------|------|
| 复核人 | 具名责任人（角色可接受，但须可追溯） |
| 日期 | YYYY-MM-DD |
| 复核范围 | 对应第二级的 diff 归档路径 / commit 区间 |
| 结论 | 通过 / 修改后通过（列修改点）/ 驳回（列理由） |
| 异议与处置 | 复核中提出的异议及最终处置 |

**豁免类复核**：安全类门禁豁免的复核不走本格式，按 `references/standards-compliance.md` §F 五字段（对象|规则|理由|审批人|日期）登记——spec §22.3 安全豁免登记表与本级记录同源互认，登记其一即视为留痕。

### 2.4 第四级：调用留痕（全链路追踪）

**范围**：节点级默认——每个 workflow 节点/生成 Step 的进出；调用级（每一次具体调用——子代理扇出、技能（skill）调用、CLI 工具（gitnexus/graphify/claude-mem/ocr/openspec/comet/gsd-tools）、门禁与状态机脚本）仅在 `SWARM_YUAN_TRACE=verbose` 时落盘。

**双通道**（均无需用户确认）：

1. **stdout 公告**：进入每个 workflow 节点先输出一行结构化提示，格式 `→ [节点X <节点名>] 调用 <技能/子代理/工具> · <目的>`；
2. **落盘**：节点级默认——进入/完成节点时执行 `bash scripts/trace-log.sh --node <节点> --actor <技能/子代理> --tool <工具/命令> [--status started|done|fail] [--note <说明>]`，追加 JSON 行到 `.swarm-yuan/trace.jsonl`；调用级细节设 `SWARM_YUAN_TRACE=verbose` 时全量落盘。聚合分析用 `scripts/cost-report.sh`。

**trace.jsonl 行格式**（与 `gate-runs/gate-runs.jsonl` 同目录、同构风格）：

```json
{"ts":"2026-07-21T08:30:00Z","node":"节点⑤ 编码实现","actor":"superpowers:subagent-driven-development","tool":"precheck.sh --scope","status":"started","note":"写前范围校验"}
```

| 字段 | 说明 |
|------|------|
| ts | UTC 时间戳（`date -u`） |
| node | 所属 workflow 节点 / 生成流程 Step |
| actor | 技能 / 子代理 / 角色（可空） |
| tool | 具体工具或命令（必填） |
| status | started（默认）/ done / fail |
| note | 一句话目的（可空） |

**与 workflow 的绑定**：调用追踪是 workflow 每节点第 ⑨ 要素（`references/template-spec.md` §2）；机器执法由 `generate-skill.sh --verify-completeness` 承担（每节点段缺「调用追踪」要素 → exit 1）。trace-log.sh 自身永不交互、落盘失败仅 warn 不阻塞主流程。

## 3. verifier 归档格式

verifier 运行记录统一归档于 `verifier/runs/`，作为 GB/T 25000.51 §7.5 符合性评价报告与 GB/T 15532 测试文档的原始证据。

**文件名**：`<YYYY-MM-DD>T<HHMM>-<场景>.log`（沿用既有惯例，如 `2026-07-19T1330-baseline-shellcheck.log`）

**头部元数据块**（每次运行首段落盘）：

| 字段 | 说明 |
|------|------|
| 日期时间 | 运行开始时间 |
| 分支 / commit | 被验对象的确切版本 |
| 门禁集合 | 本次运行的模式与门禁清单 |
| 环境 | OS / bash 版本（三平台兼容证据） |
| 退出码 | 运行结束时的退出码 |
| 耗时 | 秒级 |

**末行**：结果摘要（调用/跳过/fail/warn 计数，与 `--all-full` 汇总行同口径）。

**保留策略**：至少保留至验收完成 + 一个发布周期；进 git 或 CI artifacts，不进 `.gitignore` 黑洞。

## 4. 与 spec §22 剪裁声明的联动

- **§22.1 剪裁声明**：声明本变更采用 AI 过程信息项的级别与剪裁理由——
 - **最小集**（简单变更）：commit message 标注"AI 生成 + 复核人" + 关键决策 prompt 摘要；
 - **完整集**（标准/完整变更）：四级留痕全量 + verifier 归档。
 剪裁示例见 `references/standards-compliance.md` §B"剪裁声明写法示例"。
- **§22.2 文档包清单**：勾选文档包时，AI 过程记录作为对应文档的证据附件（如测试报告附 gate-runs / verifier 归档路径）。
- **§22.3 安全豁免登记**：与第三级人工复核记录同源互认（见 §2.3）。
- **联动校验**：`--docs-pack` 的 custom profile 可把 `ai-records/` 目录纳入必备清单；未配置时静默跳过。

## 5. 与其他文件的边界

- 本文件**不改变任何既有门禁的判定语义与输出行**；
- `.swarm-yuan/gate-runs/` 落盘格式由独立机制承担，本文件只引用不复述；
- 门禁↔标准条款映射见 `references/standards-compliance.md`；本文件只定义"AI 过程留什么痕、怎么归档"。
