# swarm-yuan 研发过程四阶段顺序立法：分支开发 → 分支测试 → 主干合并 → 主干回归

- 日期：2026-10-27
- 分支：fix/swarm-yuan-branch-trunk-order
- 状态：已批准（用户指令："调整 swarm yuan skill：研发过程是分支开发、分支测试、主干合并、主干回归的顺序"）

## 变更

swarm-yuan 目标技能的开发工作流九节点保持 9 个不变，在其上立法**研发过程四阶段顺序**：**分支开发（⑤编码实现）→ 分支测试（⑥测试验证+⑦独立审查，均在分支完成）→ 主干合并（⑧合入 main）→ 主干回归（⑨构建发布前在 main 复跑全量回归，全绿才构建发布）**。当前模板缺陷：⑤⑥未言明"在分支上"，⑨无主干回归环节——合入后直接构建发布，主干集成质量无独立验证步。

改动文件（均在 skills/swarm-yuan/ 下）：

1. `scripts/generate-skill.sh`（`_fg_emit_workflow` 模板）：流程总览区新增四阶段顺序声明与 state-machine 对照更新（operate=⑨主干回归+构建发布）；节点⑤补分支开发纪律（feature 分支自 origin/main 起、禁主干直开发）；节点⑥补分支测试判据（门禁序列在分支跑全绿才可合入，主干不做"合后再测"）；节点⑧准入补前序分支测试全绿；节点⑨新增主干回归门禁（main 上全量测试全绿才构建发布，失败回退 merge 或分支重入⑤）；终检检查表 ⑤⑥⑧⑨ 三行同步。
2. `references/template-spec.md` §2：权威 9 节点命名表前增四阶段顺序行；⑤⑥⑧⑨ 行左移要求与详细节点说明同步；左移原则段补主干回归。
3. `SKILL.md`：frontmatter description 补四阶段口径；§目标技能使用九节点行与用户使用块 ⑤⑥⑧⑨ 三步补四阶段语义。
4. `README.md`：数字口径速览"生成流程"行补四阶段口径（纯文字，不动数字）。
5. `docs/design-evolution.md`：新增决策 57（四阶段顺序立法，append-only 决策史）。
6. `assets/facts.conf`：FACT_CONTEXT_SURFACE_BUDGET 逐例登记（视测量结果，SKILL.md+template-spec 属三件套计量面）。
7. `tests/test-r142-branch-trunk-order.sh`（新增）：锁四阶段顺序断言——模板 emit 产物、template-spec、SKILL.md 三处含四阶段口径且顺序正确；节点⑤含分支开发纪律、⑥含分支测试判据、⑨含主干回归门禁；FACT_FLOW_NODES 仍为 9。

安装面联动（不入本仓提交）：install.sh 同步 ~/.cc-switch/skills/swarm-yuan（~/.zcode/skills 软链指向它）；`generate-skill.sh --render-tools` 重渲 ~/.zcode/AGENTS.md 的 swarm-yuan 标记区块。

## 决策记录

1. **四阶段映射到既有九节点，不新增节点**：FACT_FLOW_NODES=9、状态机六阶段、verify-completeness 逐节点断言、既有测试全部不动节点数；四阶段是节点上的顺序语义立法（⑤=分支开发；⑥⑦=分支测试；⑧=主干合并；⑨=主干回归+发布）。避免节点数变更引发 facts.conf/状态机/测试连锁改写。
2. **主干回归落位节点⑨而非⑧**：⑧语义是"合并动作本身"（merge --no-ff+push），回归是合并后的独立验证步，属 operate 阶段；放⑨使"合入后、发布前"的时序自然成立，且不与⑧的合入序列（fetch→ff-only→rebase→merge→push）纠缠。
3. **分支测试判据=门禁序列在分支全绿**：⑥既有门禁序列（build→test→api→…→deps）不变，只补"在分支上执行、全绿才进⑦⑧"的位置与时序约束；主干不做"合后再测"（用户指令的顺序语义）。
4. **主干回归失败处置**：回退 merge（git 层回滚）或修复走分支重入⑤，不在 main 直接改——与用户级 worktree 纪律一致。
5. **Mechanical 类直接做**（决策分类三级）：用户指令明确、映射唯一、无品味分叉。

## 验证

- 新增锁测试 `bash skills/swarm-yuan/tests/test-r142-branch-trunk-order.sh` 全绿。
- 既有回归：`test-r126-generator-hardening.sh`（生成骨架）、`test-workflow-methodology-ref.sh`（workflow 方法论引用）、`test-r141-compendium-fullcheck.sh`（汇编一致性）不红。
- `bash skills/swarm-yuan/scripts/self-check.sh --check-only`（文档一致性对账）通过。
- 生成冒烟：临时目录跑 `generate-skill.sh` 骨架，断言产物 workflow.md 含四阶段且 `--verify-completeness` 过。
- context-surface 测量：`scripts/context-surface.sh --gen` 实测字节，超 195584 则在 facts.conf 逐例登记新预算（先例：功能本体增量非注记膨胀）。
- 安装面：install 后 diff 确认 ~/.cc-switch/skills/swarm-yuan 与仓内一致；--render-tools 后 ~/.zcode/AGENTS.md 区块含新四阶段口径。

## 设计文档影响

DESIGN_SYNC: none——本批不触及 DESIGN_DOCS（整合正本 2026-10-23-swarmstudio-integrated-design.md 与数字总账 2026-10-23-swarmstudio-design-ledger.md）；swarm-yuan 自身设计文档（README.md 数字口径行、docs/design-evolution.md 决策 57）的修订属本批变更本体、由本 spec 治理，随批提交。
