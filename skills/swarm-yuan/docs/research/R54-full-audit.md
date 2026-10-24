# R54 全面排查轮：全量回归 + G25 变异锁补缺

> 2026-09-25，用户指令"全面排查"。排查清单六项逐项打勾；唯一实锤缺陷（G25 六断言零变异锁——违背 R44"warn 级断言须负向断言"先例）本轮修复。v2.25.1。

## 一、排查清单与结果

| # | 排查面 | 结果 |
|---|--------|------|
| ① 基础验证 | self-check --check-only 全绿；**tests/ 全量 36 脚本逐一跑零失败**（sweep 实测：36×exit 0）；CI 最近三 run（R51/R52/R53 合并）全 success | ✅ |
| ② G25 断言族负向有效性 | **实锤缺口**：零测试引用 capability-map/G25——六断言若被重构弄坏会"永远绿" | ❌→本轮修复 |
| ③ 三表一致性 | map 表 46 行=47 档（map 自身不入表，§四已声明）；第六层五族表 31 全名+八档短名一行（设计如此，map 为逐档事实源——披露不修）；UNIVERSAL refs 31 条与分派表引用面对齐（G25 ⑥ 机器执法） | ✅（含两条披露） |
| ④ 死链/陈旧数字 | 文档互引死链零（两处 `references/workflow.md` 为"目标技能 references/…"限定语境，非生成器侧死链）；脚本引用死链零；陈旧数字 grep（320KiB/327680/第九次/13 份/10 字段/10 要素/310KB）零残留 | ✅ |
| ⑤ lite 档语义 | task-methodology-router 与 12 档补随发均为 standard 档——lite 档目标技能不分发分派表与方法论档，语义自洽（lite=认知档：特征卡+reference-manual，无 workflow 无执勤分派需求）——**披露**：lite 用户升级 standard 后自动获得 | ✅（披露） |
| ⑥ verifier/install 面 | verifier v1/v2 在 CI Job 6 全量进 CI（三次 run 绿实证）；install 面随 CI 覆盖 | ✅ |

## 二、缺陷修复：tests/test-capability-map-g25.sh（12 断言，CI 接线）

sed 提取 `check_capability_map_wiring` 函数为变异锁锚（改名/移位即提取失败=红），stub `warn` 为可断言输出，最小 base 拷全量 references（46 档）+真三件（map/router/UNIVERSAL 块）：

- 态0 正向：六断言全绿零 warn + 六个断言面标签存在性（检查段被删即红）；
- 态1 孤儿注入（map 未收录档）→ 须 warn"孤儿档"；
- 态2 幽灵注入（map 追加不存在档表行）→ 须 warn"幽灵档"；
- 态3 分派落档注入（router 抹掉 togaf-metamodel-methodology）→ 须 warn"分派落档"；
- 态4 随发缺口注入（UNIVERSAL 块删 knowledge-lifecycle 行）→ 须 warn"随发缺口"。

实测 12/12 PASS——首跑即抓到 fixture 不全（幽灵断言对缺失档真实报警，灵敏度实证）。

## 三、过程教训

- **G20 多字节坑六踩**（本测试 `$label（` 全角括号紧跟变量 → set -u unbound）——写测试同样适用"多字节混排一律 ${var}"，已再入记忆强化。
- warn 级自检断言的变异锁形态沉淀：**sed 提取函数 + stub warn + 最小真 fixture + 逐态注入**——后续新增 G 断言按此配锁。

## 四、验证清单

- [x] test-capability-map-g25 12/12 PASS
- [x] 主 sweep 36 测试零失败 + CI 三连绿（R51/R52/R53）
- [x] 死链/陈旧数字/三表/lite/verifier 五面排查记录在案
- [x] self-check --check-only 全绿（版本三面一致 v2.25.1）
