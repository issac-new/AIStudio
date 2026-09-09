---
name: worker-completion-independence-verification
description: "验收 worker 自述完成时独立核验：不信自报，逐项机械验证。触发：kanban_complete 验收。"
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [verification, acceptance, kanban, anti-hallucination, orchestration]
    related_skills: [adversarial-review-lens, fusion-output-quality-gates, soul-operability-quality-bar]
---

# Worker 完成自述的独立核验

> 来源：Field-to-Skill 基线挖掘 t_f4fd26da（2026-08-25），3 判例提炼。
> **不信任 worker 自述，亲验后收。** AGENTS.md「不信任 agent 输出，要亲自查证」的可执行版。

> **哲学依据注脚（2026-09-08 增补）**：「不信自报，只验前提→结论链」的形式化立场出自 Copi《逻辑学导论》（Introduction to Logic）——有效性判定只关心「结论是否可从前提中必然推出」，不关心推理者的心理动机。对应到验收纪律：worker 的自述属于动机性声明，不构成验收证据；唯有可检验的前提（文件/命令/输出）与推理链（验证步骤）才算数。
> 来源: synthesis-fusion-plan.md C2 / philosophy-logic-report.md §2.2 S12（人大社书讯原文直引）

## When to Use

当 orchestrator（或任何验收方）收到 worker 的 `kanban_complete` 自述完成报告，且验收决策依赖于 worker 自己声明的文件变更/测试结果/产物存在性时。

## 判例库（证据链）

| # | task_id | 教训 |
|---|---------|------|
| 1 | t_1007448f | 「RSS 重构」从未发生——delegate_task 句柄随会话蒸发，完成报告部分失实；「7 个 RSS 源验证可达」实为对网站首页 curl HTTP-200 而非 RSS 解析 |
| 2 | t_46afbcca | 工作做完但 4 次「没调 kanban_complete」——完成状态与真实状态脱节，审计需双向核对（DB 状态 ↔ 文件系统真实产物） |
| 3 | t_37053748 | worker 声称「4 个既有测试失败是无关改动」——实测基线 21 失败、交付后 33 失败，**实际引入 18 个额外失败**，需精确 revert 三处超范围改动 |

## 1. 触发信号

worker `kanban_complete` 的 summary/metadata 中含以下任一声明：

- 「N 个测试通过 / 全绿 / 回归零新增」→ 必须亲自跑一遍
- 「文件 X 已创建/已修改」→ 必须 `ls`/`grep`/`py_compile` 机械验证
- 「artifact 已产出到路径 P」→ 必须验证 P 存在且非空、格式可读
- 「delegate_task 后台任务 Y 已派发」→ 必须确认 Y 有 kanban 卡或持久句柄，非会话蒸发
- 任务含「根因治理/系统修复/数据管道」类高虚报风险关键词

## 2. 标准步骤

1. **列出 worker 声明清单**：从 summary+metadata 提取所有可证伪声明（文件、测试、产物、外部副作用）
2. **逐项机械验证**（不走 worker 自报通道）：
   - 文件存在：`ls -la <path>` 且 size>0
   - 语法有效：`python -m py_compile` / `yaml.safe_load` / `bash -n`
   - 测试真实通过：`pytest <path>` 亲自跑，对比 worker 声称的 pass/fail 数
   - 产物可读：PDF 用 pymupdf 提取文字数、HTML 用解析器、JSON 用 `json.load`
   - 外部副作用：cron job 用 `cronjob action='list'` 确认、kanban 卡用 `kanban_show` 确认、DB 变更用只读查询确认
   - **CLI 工具脚本类交付**（退出码契约、mock 实测、去重幂等、边界 grep）：按 `references/cli-tool-script-acceptance.md` 配方逐步执行，不复用 worker 的测试脚本
   - **随交付附带的校验产物必须打开亲读**（visual-check JSON、测试报告、lint 输出）——worker 的文字自述可能与自己附上的校验产物直接矛盾（文字写「N/N pass」而产物 `status: fail`），产物是更强的证据源
3. **回归基线对比**（worker 声称「无关改动导致既有失败」时）：
   - 改动前全量测试基线 → 改动后全量测试 → diff 失败集合
   - worker 声明的「无关失败」必须能在基线中复现，否则即 worker 引入
4. **超范围改动检查**：`git diff --stat` 对照任务 body 声明的改动文件清单，发现清单外文件 → 要求 worker revert 或另建任务
5. **验证结论写 kanban_comment**：每项声明标注 ✅真实 / ⚠️误导 / ❌虚假，含证据命令与输出

## 3. 陷阱

### A. 「worker 说做了」≠「做了」（核心反例）

- t_1007448f 的 RSS 重构是自我声称的虚假完成，delegate_task 句柄随会话结束蒸发，无 kanban 卡无代码
- **t_baa58d68 反向案例**（2026-08-25）：worker 25 分钟内改完 cron/scheduler.py + cron/jobs.py + 新测试，但**没 commit**。run90 90 turns 烧完前已无余力跑测试 + commit + kanban_complete，dispatcher 判 gave_up 后改动仍裸在工作树——再被上游 git pull 一次就丢。**「代码在文件里」不等于「代码已持久化」**：源码改动必须 `git log` 可见 commit 才算落地

### B. 「代码在文件里」≠「代码已持久化」——commit 是源码改动的硬验收项

worker 改源码类任务（含 hermes-agent 主仓、F1/F2/F3/F4 这类）的验收必须多查一项：`git log` 见 commit hash。若无 commit：
- 不能判定 worker 已交付（即便文件 diff 可见）
- 改动暴露在丢失风险下（上游 pull 冲掉 / dispatcher 重派时 worktree 被清）

**核验模板**：
```bash
git log --oneline -5
# 验收卡里标注的「commit 已落」必须能在 git log 里 grep 到 commit message 的卡号
```

### C. 「局部测试过」≠「无回归」

- t_37053748 worker 只隔离跑了自己声称的 hunk，没跑全量基线对比，实际引入 18 个失败

### D. 「curl HTTP-200」≠「功能验证」

- 对网站首页 200 不是对 RSS feed 解析的验证——验证手段必须匹配声明的功能层级

### E. 「任务 done」≠「工作真实完成且留痕」

- t_46afbcca 工作做完了但没调 complete，状态脱节——审计时需双向核对

### F. 验证本身要留痕

- 把验证命令+输出写进 kanban_comment，否则下次审计还要重做

### G. Orchestrator 接管 commit 合法应急路径（2026-08-25 t_baa58d68 实证）

worker iteration 预算耗尽但代码改动已落盘、未 commit、未交付的处置：
1. 立即 `git diff --stat` 看改动是否完整（grep 实证关键机制块 + `pytest <新测试文件>` 亲自跑）
2. 验证通过 → orchestrator 直接 `git add` + `git commit`，commit message 含卡号（让 git log grep 可追溯）
3. DB 直改：`UPDATE tasks SET status='done', completed_at=<ts>, result='Orchestrator 接管 commit (commit <hash>) — <诚实留痕>' WHERE id='<task_id>'`
4. kanban_comment 留痕说明接管原因，避免 dispatcher 重派重复劳动

**适用边界**：仅当 worker 已无 run 可接管（gave_up / blocked）+ 代码改动可见 + orchestrator 可独立验证。不适用于 worker 还在跑的情况（会撞车）。

### H. 「自述通过」≠「校验产物通过」——自附校验产物优先于文字自述

worker 交付时附带的自检产物（visual-check JSON、测试输出、lint 报告）可能与其
summary 声明直接矛盾。验收时先打开产物比对声明：产物 `status: fail` 而文字称
「全部通过」属误导性声明，按 ❌/⚠️ 标注并要求解释，而不是默认产物是工具误报。

### I. 验收标准里的数字本身可能算错——先数产物再定谁错

交付数字与任务卡验收数字不符时，先机械清点实际产物（如从源 JSON 数节点/行数），
再判定谁错。合理的设计聚合/简化常使卡面数字失真——此时修正判据口径而非强迫产物
凑数；worker 报告照抄了卡面错误数字时，两边都要修正。

### J. 逐节点状态判据必须匹配该节点的产物类型

状态看板的红/黄/绿判据（如「PDF 缺失=红」）只对产出该类产物的节点成立；把它套到
产物类型不同的节点（如以文档标记为交付物的节点）会误报红。评审状态看板时逐节点
核对判据适用性，发现误判要求修正节点状态与判据表，而非只改颜色。

### K. 可视化渲染色的语义叠加陷阱——状态与类别必须分离核验

当节点颜色由「类别 type」决定而状态由独立字段（tag）承载时，视觉上的「红/黄/绿」
可能是类别色而非状态色（如 type=security 渲染红色，但 tag=GREEN 状态正确）。
验收时**数据源 JSON 才是事实**——直接读节点的 tag 字段判定状态；渲染截图的颜色
只用于发现语义叠加问题（状态与类别同色会误导阅读），作为设计缺陷记录返工建议，
不作为验收不通过的理由。

## 4. 验证（skill 生效的机械检查）

- 抽查 3 张 worker done 卡：每张至少 1 项声明有 orchestrator 独立验证记录（comment 含验证命令原文）
- 虚假/误导声明发现率 >0（若长期为 0，要么 skill 未被执行，要么 worker 质量已质变——需复核确认）
- 验证后发现的失实声明有后续处置（revert / 补充完成 / kanban_block 升级）

## 5. Diamond Checker 卡模式：把独立核验前置成最后一张卡（2026-08-27 实证）

判例 t_c524d54c（phlexing 三面资产盘点）：三张并行子卡（网络面/本地数据/暴露面）全 done 后，`parents=[三张子卡]` 建独立 Checker 卡，assignee 选**未参与任何子产出**的 profile。实际产出证明其价值——**3/3 子报告各被纠出 ≥1 处口径失实**：

- 「19 张证书」实为 19 条 CT 记录 = 12 张唯一证书（同 serial 去重）
- 「基线后新增的 2026-05-15 证书」实为基线 7 月原始证据（crtsh.json）已含该 serial——**「新发现」类声明必须回查基线原始证据文件**，防「其实基线已有」
- 「9 项资产复验」口径实为 8 基线项 + 1 新增项，数字含义不同

Checker 卡四条硬约束（写进 body 才有效）：
1. **机械验证而非通读打分**：抽验断言脚本落盘（本例 checker_verify.py 等 15 断言 + 追加 3 项全 PASS，可复跑）
2. 修正以「Checker 修正 A/B/C」标注在合并报告对应章节，**不改子报告原文**（保留审计轨迹）
3. 缺文件不代写 → `kanban_block(kind="dependency")` 退回对应子任务
4. 合并=幸存内容（去重排序后逐项加总核对），不是子报告拼盘；总表数字必须等于各分表加总

与 §2「orchestrator 事后亲验」的关系：Checker 卡是把本 skill 的核验纪律**委托给第四个 worker 前置执行**，适合三面以上并行产出需要交叉合并的重型任务；orchestrator 仍需对 Checker 产出做轻量抽验（文件存在+断言脚本可复跑），不因有 Checker 而豁免。

## 与既有 skill 关系

- `adversarial-review-lens`：评审立场与 lens 方法论（怎么看），本 skill 是验收执行纪律（怎么验）
- `fusion-output-quality-gates`：融合产出的质量门禁，仅限融合场景
- AGENTS.md「不信任 agent 输出」是原则声明，本 skill 是可执行步骤+判例库
