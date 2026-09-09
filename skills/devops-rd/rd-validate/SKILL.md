---
name: rd-validate
description: "RD 需求-实现-测试三方对账（/rd:validate）：requirement ↔ diff ↔ test 逐项对照，产出 implementation-check.md + continue-prompt.md。触发：编码任务验收、接续开发、kanban_complete 前对账。"
version: 1.1.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [rd, validate, reconciliation, acceptance, kanban]
    related_skills: [worker-completion-independence-verification, code-review, rd-apply, verify-requirement]
---

# /rd:validate — 需求-实现-测试三方对账

> 版本说明：v1.1（2026-08-27 重建）。v1.0 实体在 devops-rd master 化迁移中丢失（倒挂 symlink 事故），
> 本版从 taobao-rd-harness 调研规范（analysis-report.md L154/L366/L386）+ 基座 skill
> `worker-completion-independence-verification`（t_f4fd26da 判例库）重建，逻辑等价并强化对账产物契约。

## When to Use

- worker-tester / worker-coder 在 `kanban_complete` 前对账（RD 质量门检查清单"测试/对账类"）
- orchestrator 验收编码类任务（需求 ↔ 实现 ↔ 测试三方一致才放行）
- 接续开发场景：上一轮 requirement 是否被本轮 diff 完整承接

## 产物契约（强制）

对账必须产出两份文件到任务工作区：

1. **`implementation-check.md`** —— 三方对账矩阵：
   | # | 验收项（requirement 原文） | 实现位置（file:line） | 测试证据（用例/命令+结果） | 判定 |
   每行必须三列齐备才可判 ✓；缺任一列 = GAP，逐条列出。
2. **`continue-prompt.md`** —— 接续开发提示词：当前完成度、剩余 GAP、下一步入口（文件/分支/测试命令），
   让全新上下文的 agent 不读历史即可接手。

## 标准步骤

1. **提取 requirement 锚点**：从 kanban body / requirement.md 提取全部验收标准（frozen:true，不得
   临时改写；需改必须 kanban_comment @orchestrator 审批——见 verify-requirement）。
2. **提取实现锚点**：`git diff --stat <baseline>..HEAD` 逐文件对照验收项，落 file:line。超范围改动
   单列（不属于任何验收项 = 范围违规，交 code-review 处置）。
3. **提取测试锚点**：亲自跑测试（不信 worker 自报 pass 数），记录命令 + 退出码 + 失败清单。
   回归判定用基线对比：改动前失败集合 vs 改动后失败集合的 diff（判例 t_37053748：worker 声称
   「无关失败」实测引入 18 个额外失败）。
4. **三方对照**：填 implementation-check.md 矩阵，每项判 ✓/GAP/PARTIAL。
5. **生成 continue-prompt.md**：GAP 项转下一步行动。
6. **退出路由**：全 ✓ → 允许 kanban_complete（metadata 附两文件路径）；有 GAP → kanban_request_changes
   或 block，GAP 清单原样进 reason。

## 硬门（继承 worker-completion-independence-verification）

- 「测试全绿」声明必须亲自复跑验证
- 「文件已创建」声明必须 ls + 语法检查机械验证
- 产物存在且可读（PDF/HTML/JSON 各自解析器验证）
- 不信任任何自报通道；无证据 = 未完成

## Pitfalls

1. requirement 措辞模糊时，对**冻结原文**而非自己脑补的意图——发现模糊先 block 让上游澄清。
2. 测试基线必须先跑再改（改动后补基线 = 伪造对照）。
3. implementation-check.md 的「实现位置」列禁止写目录级（`src/foo.py`），必须到行号。
