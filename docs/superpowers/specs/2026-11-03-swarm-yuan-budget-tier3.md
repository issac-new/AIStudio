# 2026-11-03 swarm-yuan 收官批：分发预算瘦身＋Tier-3 行为评测落地

## 变更

上一批（pstack 吸收）留了两笔未做，本批清偿：

1. **`FACT_ARTIFACT_BYTES_BUDGET` 欠账**：实测 642207B > 预算 618496B（其中 641806B 是本批之前就存在的超支，本批 +401B 来自路由表一行）。本批不动预算数字，改**分发面分类**：`references/code-graph-tools.md`（45651B）由 `copy`（随目标技能分发）转 `gen_only`（生成器侧）。理由：该档登记的唯一消费节点是「生成流程 Step 3 图谱优先」——图谱工具**选型**是生成期决策，目标技能运行期不需要它。改后实测 598954B ≤ 618496B，余量 19542B。
2. **Tier-3 行为评测未移植**：新增 `scripts/skill-behavioral-eval.sh`，只移植执行骨架，判分换成**确定性动作断言**（见决策 D2）。

## 决策记录

- **D1（瘦身走分类而非降预算；2026-11-03 用户令「完成未做」）**：`FACT_ARTIFACT_BYTES_BUDGET` 是决策 26.2 的税制锚，为容纳新增而调高它，正是本批吸收的 floor guard 要拦的「降标」。可选替代两条：①逐例登记上调（有先例，但会把 4 万字节的选型研究永久留在目标技能的上下文税里）；②把该档转 gen_only（分类如实）。选②。
- **D2（Tier-3 只移植骨架，判分改确定性断言）**：上游用 LLM judge 按 `expectations[]` 打分，自己记录了同一用例 6/6、1/6、2/7 的波动。本仓的做法是抓 stream-json trace，断言「该出现的动作出现、不该出现的动作没出现」（正则匹配工具调用与目标路径）。代价：只能判「做了什么」，不能判「做得好不好」；收益：可重复、可解释、零 token 也能用假 runner 测。
- **D3（Tier-3 不进 precheck）**：烧 token 的检查不能进默认门禁序列，只能显式调用。`--dry-run` 先出计划；runner 不可用 exit 2 并明说「未运行≠通过」。
- **D4（显式 `--runner` 是权威，不回落）**：实现中发现 `--runner` 指定的二进制不存在时会静默回落到 `claude` 并真跑起来（测试 hang 暴露）。改为显式指定即权威，找不到直接 exit 2——静默回落会真烧 token 且结论不对应。
- **D5（`verify-<project>` 与 Tier-3 的分工）**：verify 技能属**目标项目**资产（跑它自己的应用），Tier-3 属**生成期**资产（验生成的技能有没有改变 agent 行为）。两者不共享脚本，也不互相替代。

## 验证

- `registry-render.sh --check` ✓
- `self-check.sh --check-only` → **✓ 自检通过**（本仓首次全绿；此前长期停在「部分未通过」的 artifact 预算 warn）
- `tests/test-skill-behavioral-eval.sh`：5 态全过（模板 dry-run / runner 不可用 exit 2 / 动作命中 / 动作缺失 / 触发禁止项）
- 门禁夹具全量 58 组（上一批已验，本批未动门禁）
- `npm test`（合并后在 main 跑）

## 设计文档影响

**DESIGN_SYNC: none** —— 技能面内部分发分类与评测工具，不触及仓级整合正本与数字总账；技能自身的数字单一事实源 `assets/facts.conf` 随批更新并由 `self-check.sh` 自证。
