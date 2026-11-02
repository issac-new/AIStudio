# MAET 四路径完备门 + 四层知识检索协议（方法论吸收批 C+D）

> 来源：MTSC2026《AI Native 测试工程实践》（极智嘉）吸收轮批 2（用户裁决「全做」的 C、D 两项）。C 补用例设计方法论缺口的最后一块：现有 spec §19.2 有 GWT 骨架与六类异常行，但无 Main/Alternative/Exception/Termination 四路径的系统区分与完备判据（Termination 终止路径完全缺位）。D 把散件（relations.jsonl 边集、docs 索引、路由表、glossary、vendor 基线、记忆台账）组织成「按层递进、不足时升层」的检索协议——文章对照结论：件件都在、链未成层。

## 变更

**C（MAET 四路径完备门）**：
1. `skills/swarm-yuan/assets/spec-template.md` §19.2 用例骨架重组：新增「路径类型」列（Main/Alternative/Exception/Termination 四值），行模板扩至覆盖四路径——Main（主流程）、Alternative（替代流程：合法但非典型的输入/顺序/分支）、Exception（异常路径：错误输入/依赖失败/超时/鉴权/校验/不存在，原有六行归此）、**Termination（终止路径：取消/中断/超时终止后的资源回收与状态落定——现缺位）**。
2. §19.3 测试左移声明加一项：`[ ] MAET 四路径标注完备（每特性至少 M/A/E/T 各 1 条；Termination=取消/中断后的回收与终态断言）`。
3. 守门测试（新 `skills/swarm-yuan/tests/test-spec-template-maet.sh`）：断言模板 §19.2 含四路径行与路径类型列、§19.3 含 MAET checklist 项——模板是 AI 填写契约，结构漂移=契约漂移，测试锁结构。

**D（四层知识检索协议）**：
4. `skills/swarm-yuan/references/knowledge-retrieval-ladder.md`（新）：四层定义+升层判据+佐证规则——L1 代码层（relations.jsonl import 边集+relations-query 反查）→ L2 结构层（docs/README 索引+SKILL 路由表+capability-map）→ L3 语义层（specs 477 份/reports/glossary 术语表/本体三件）→ L4 实现层（vendor 三树源码+记忆台账 .swarm-yuan/*）；「由近及远、命中即止、跨层佐证、结论带锚」四纪律。
5. SKILL.md 路由表「拼装与知识消费」族 + capability-map.md 登记。

**B 批补账**（本批发现）：generate-skill.sh dist-manifest 漏登记 failure-taxonomy.md（B 批新档未分发=目标技能拿不到）——同批补入，另含 knowledge-retrieval-ladder.md 与描述映射两行。

## 决策记录

1. **MAET 落模板而非建新门禁**：四路径完备的「每特性强制遍历」只有 AI 填 spec 时可判（哪些特性、哪些路径算覆盖需语义判断），机械门禁会退化成数行数游戏；模板契约+checklist 自声明+守门锁模板结构是本仓 spec-first 体系的同构做法（§19 既有模式）。
2. **Termination 单列**：文章四路径中 Termination 最易漏（取消/中断后的回收与终态）；本仓走查与单测的 teardown 语义（批 A DSL）正对应此路径——C 与 A 形成「设计契约→运行 DSL」闭环。
3. **检索协议不加新工具**：四层全部用既有件（relations.jsonl/docs 索引/specs/vendor/台账），协议的价值是把「查什么先查哪、何时升层、怎么算证据」从隐性经验变显性纪律；引入图谱工具的前置条件未满足（code-graph-tools.md:33 结论维持）。
4. **L1 代码层用边集不做符号级**：调用链级图谱是重工程，当前检索需求（谁依赖 X/影响面反查）import 边集已覆盖；升层判据里写明「边集不达时升 L4 读源码」。
5. **B 补账进本批**：dist-manifest 漏登记是 B 批真缺陷（未分发=死档），本批同文件（generate-skill.sh）改动顺手同批修，避免单独开批。
6. **DESIGN_SYNC: none**——技能模板/方法论/生成器清单，均不触及整合正本与数字总账。

## 验证

- `bash skills/swarm-yuan/tests/test-spec-template-maet.sh`（新守门绿）
- `bash skills/swarm-yuan/tests/test-failure-detector.sh`（B 面无回归）
- `bash -n skills/swarm-yuan/scripts/generate-skill.sh`（语法门）
- capability-map ② 检查：knowledge-retrieval-ladder.md 已登记（grep 锚）
- 合并前 `npm test` 全量

## 设计文档影响

DESIGN_SYNC: none——技能内部契约与文档；技能 CHANGELOG v2.98.4 随批。
