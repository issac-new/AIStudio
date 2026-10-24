# R52 随发补缺轮：节点级方法论引用契约与分派可达性

> 2026-09-25，完成校验器指出 R51 自曝弱覆盖（"workflow.md 九节点是否逐节点实载分派档单，未单独设断言"）须消除；补强审计中发现更深裂缝并同轮修复。
> 证据分级：全部 A 级（grep/生成实测/gen-e2e 输出）。
> 结论：①节点级「⑩ 方法论引用」机器契约 + 正负变异锁；②12 档随发补缺（13 方法论仅 3 随发 → 目标侧分派悬空实锤）+ G25 ⑥「随发或声明」。吸收层三向闭环：建档必接线 + 接线必可达 + 可达必随发。v2.24.0。

## 一、完成审计：判据 → 现状 → 本轮处置

| 判据 | R51 后状态 | R52 处置 |
|------|-----------|---------|
| 节点级实载分派档单有机器断言 | ❌ 自曝弱覆盖 | verify-completeness ⑩ 要素契约 + 变异锁测试 |
| 被分派的档目标侧可达 | ❌ **13 方法论仅 3 随发**（audit 新发现） | 12 档随发补缺 + G25 ⑥ |
| 正反对偶闭环机器可检 | 🟡 G25 ⑤ 只守生成器侧 | +⑥ 随发或声明（目标侧可达） |

**实锤（A 级）**：UNIVERSAL_FILES 内 references 条目仅 22 条（含 ontology）；13 篇 `*-methodology.md` 中仅 cost-estimation/lazy-generation/review-methodology 随发。task-methodology-router（随发）分派表引用的 knowledge-lifecycle（feature 行【必】）、codex-methodology（fix 行）、agent-skills-methodology（验收行）等 10 档在目标技能产物中不存在——分派表在目标侧指向空气。

## 二、修复设计

1. **12 档随发补缺**（UNIVERSAL_FILES 71→83）：按流B 消费节点取齐——knowledge-lifecycle/decision-governance/ai-process-records/agent-skills（流B 核心四档）+ codex/mea-loop/togaf/cordis/frontend-design/codex-security/mcp-governance（standard）+ crypto-spec（compliance，check_crypto 判定依据同 cwe-database 口径）。随发判定准则入决策 44：**流B/执勤行引用必随发；纯生成侧行引用标【生成器侧】**（four-theories/dsh-engineering/context-engineering-layering）。
2. **G25 ⑥ 随发或声明**：`*-methodology.md` 不在 UNIVERSAL_FILES 则分派表须有【生成器侧】标注行——可达性机器可检。
3. **节点级「⑩ 方法论引用」机器契约**：verify-completeness 每个「## 节点…」段双要素断言（⑨ 调用追踪 + ⑩ 方法论引用），缺则列 file:line 并 exit 1；emit 九节点预填具体档（对偶分派表消费节点序）；template-spec 10→11 字段（⑩ 插 ⑨ 后保"第 ⑨ 要素"引用面零涟漪）。
4. **变异锁**（tests/test-workflow-methodology-ref.sh，CI 接线）：正向全要素通过 / 负向①剥方法论引用 rc=1 / 负向②剥调用追踪 rc=1；run-gen-e2e 增「方法论引用 ≥9 处」。

## 三、随发暴露的新形态缺陷（gen-e2e 实测）

新随发的 cordis/mea-loop 自带「## AI 填充指引」章节标题——**撞零占位符扫描词表**（'填充指引' 四词之一），随发进目标技能即卡 --mark-active（"占位符未清零，保持 draft"）。此前不随发从未暴露。修：章节改名「AI 填充指南」（语义不变，扫描词表不动——test-template-lexical-consistency 对检测语义有变异锁，动词表风险更大）。**新 checklist 项**：随发新档必过占位符四词预扫（待填充/（待填充）/\<占位符\>/填充指引）。

## 四、预算处置（三笔登记）

| 面 | 实测 | 处置 |
|----|------|------|
| 三件套（认知面） | 188443B 超 27B → 瘦身 98B 后 188345B | 不登记（≤188416B，余量 71B） |
| UNIVERSAL 拷贝（税制） | 477979B 超 141083B | FACT_ARTIFACT_BYTES_BUDGET 第十一次登记 336896→483328（12 档 ≈+145KB 功能必要税） |
| 生成物 SKILL.md | gen-e2e 9697B 超 481B | FACT_SKILLMD_BYTES_BUDGET 第三次登记 9216→9728（索引表 +12 行） |

README 预算行三处陈旧数字同轮清账（R51 漏改 artifact 行 + R33 起 SKILLMD"≤8KB"漂移）——**预算登记 checklist 自本轮起含 README 两处同步**（同族残留第三次升级防复发）。

## 五、过程教训

- **G20 铁律自踩**：新测试 `"rc=$rc；输出"` 全角分号紧跟变量（bash 3.2 多字节解析成新变量名 → set -u 爆 unbound）——security-spec §6.1 记载的坑，G20 断言扫描面未含 tests/ 新档；修为 `${rc}`。写多字节混排 shell 一律 `${var}`。
- 随发面是新缺陷探测器：cordis/mea-loop 碰撞词、SKILLMD 索引膨胀均只有拷进目标技能才现形——**随发新档必跑 gen-e2e** 入 checklist。

## 六、验证清单

- [x] test-workflow-methodology-ref 3/3 PASS（正向+双负向变异锁）
- [x] run-gen-e2e 全绿（SKILLMD 9697B≤9728B、mark-active 通、方法论引用 ≥9）
- [x] self-check --check-only 全绿（G25 六断言、双预算、UNIVERSAL 83=83、版本三面一致）
- [x] 三件套 188345B ≤ 188416B；12 档随发清单 grep 独立复核
- [x] 决策 44 入 design-evolution；本报告即证据链
