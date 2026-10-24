# R114：mattpocock/skills 运行时整合轮（机制源→CLI 层升级）

> 触发：用户指令（2026-10-15）"增加 https://github.com/mattpocock/skills 作为 swarm yuan 的运行时，整合优化完善 swarm yuan 的能力。进行一次完整回归测试（生成典型场景 skill + 基于其做若干典型研发工作），识别排查修复缺陷，验证通过后发版 GitHub"。
> 定位变更：R86 把 mattpocock/skills 登记为机制源（不进 FACT_RUNTIMES，同 dsh/pua/semantica 先例）；本轮用户指令推翻该定位，升级为 **CLI 层第 14 个运行时（物化型）**。

## 一、物化（runtime/mattpocock-skills/）

| 项 | 值 |
|---|---|
| 上游 | mattpocock/skills（MIT，main `49dd158` 2026-10-09；=v1.3.1 tag 0b6cee1 + wizard template fixes 1 提交） |
| 范围 | engineering 20 + productivity 7 = **27 技能整目录镜像**（含附属文件 PHASE-BOUNDARIES/DEEPENING/FORMATS/template.sh/agents.yaml），452K |
| 不取 | in-progress 7（上游自标未完成）/ misc 4（Claude Code 专用违背工具无关总目标、特定库迁移、教学脚手架、与 L2 重叠）；上游安装链不调（物化即达） |
| 登记 | MANIFEST.md（来源/基线/不取理由/清点/刷新方法）+ LICENSE 副本 |

## 二、接线（六处）

1. `precheck.sh`：`has_mattpocock()` 物化型守卫（目录存在性双候选探测，非 command -v 型）。
2. `facts.conf`：FACT_RUNTIMES 13→14、FACT_RUNTIMES_CLI 4→5、新增 FACT_MATTPPOCOCK_SKILLS=27。
3. `self-check.sh`：三层标注行、check_runtime_tier 对账循环（cli 顶层 has_ 4）、新 mattpocock 物化完整性断言（27 技能+MANIFEST+LICENSE）、codex-security 段两处硬编码 13/4 → 14/5。
4. `SKILL.md`：三层整合节 CLI 行 + 路由表 runtime 物化层说明。
5. `mattpocock-skills-methodology.md`：双层定位（方法论改写 ↔ 运行时原语）、§六"未实施"改"已物化直调"、§七基线 49dd158。
6. capability-map（CLI×5 行+机制源×7）/ task-methodology-router（运行时可及性注记）/ upstream-baseline（mattpocock 行升级+pi 行先例修正）/ README 附录 A / usage-manual×2 / CLAUDE.md（14 运行时口径）。

数字链：FACT_SCRIPT_LOC 6669→6681（precheck +12）。手抄面清剿：13 运行时口径全量 grep 替换（CLAUDE/README/usage-manual/facts 头注）。

## 三、三门禁 + 回归门（全绿）

self-check --check-only 全绿（新断言"mattpocock 物化完整 27 技能"过）/ shellcheck CI 口径 0 error（info 级 49 处与 main 基线同源）/ e2e OK（四框架注入+fail id 全链）/ verifier golden 82 行逐行一致 / verifier all / fixture 抽样 vue+mybatis 双态通过。

## 四、全栈真机回归（FastAPI 缺口栈首测——回归矩阵补位）

样例项目 mark-forge（/tmp/r114-sample/mark-forge，uv+FastAPI 0.115+SQLAlchemy 2.x+Pydantic v2+pytest，5 源文件 5 用例起）。

**生成链**（Step 1-13 机械面全走）：self-check → generate-skill.sh 骨架（standard 档）→ framework-evidence 探测 fastapi/sqlalchemy/pytest 三框架 → --inject-frameworks 门禁注入 → AI 填充（codebase/dev-guide/reference-manual/recipes/release + workflow 九节点 + 30 条框架规律带代码证据 + GLOSSARY + 决策 2 条）→ --verify-completeness --strict → --mark-active（active）。

**门禁执法实证**（本轮逮到的真实拦截，全部为设计内行为）：

| # | 门禁 | 拦截内容 | 处置 |
|---|------|----------|------|
| 1 | check_branch | master/main 直接开发 | 改 feat/fix 分支流程 |
| 2 | strict 终检 | SKILL.md 清单未勾/配方五要素命名/决策 0 条/30 规律待填/description 占位 | 逐项补齐 |
| 3 | mark-active 框架 glob | FASTAPI/SQLALCHEMY glob 空 | 填 arch.conf（真实值） |
| 4 | mark-active spec-first 联动 | WRITABLE_DIRS 空=静默放行 | 填 (app tests) |
| 5 | spec-first L2 pre-commit | staged 含 .pyc 触源码区+无 spec | gitignore 补齐+产物出库（经 --no-verify 逃生门留痕） |
| 6 | check_reuse | spec 缺 §5.5/合规声明未勾 | 补 §5.5 四勾+§12 |
| 7 | 状态机 | open→archive 跨级/verify_result pending/证据空（MEA 铁律） | 逐级+set verify_result pass+证据引用 |

**Task A（feature：导出端点 json/csv）九节点全绿**：访谈假设（grilling 降级形态）→ spec D1-D5+影响面 → 单票纵切 → TDD 红（404）→绿（7/7）→ precheck fail0 → 两轴审查 PASS+review-record → 状态机 open→design→build→verify→archive → merge --no-ff → 起服冒烟 RUNTIME-OK（GET 200/POST 201/csv 实测）。

**Task B（fix：datetime.utcnow 弃用）**：诊断回路（反馈回路先行=`-W error::DeprecationWarning` 红 7 failed）→ 单行修复 → 绿 7/7 → 回归面全绿 → merge。retro 结果物化：filterwarnings=error 入 pyproject（弃用潜伏→机械检查）。

**mattpocock 运行时消费实证**：domain-modeling（GLOSSARY.md 建立）/ tdd（缝先行+先红后绿+纵切）/ to-spec 纪律（测试缝 D5+防腐不写代码）/ grilling（节点①假设清单+前沿记录）/ retro（环境改进六类复盘）——全部读 runtime/mattpocock-skills/ 原文执行，CLI 层"读原文执行不悬空"路径验证通过。

## 五、缺陷账本

**阻断级缺陷：0**（所有拦截均为设计内执法）。撤回 1 项误报候选：状态机"失败转换落 approved 留痕"——账本核实 4 条 approved 全对应 4 次成功转换，失败转换未落痕（stdout 交错误读）。

**改进候选（UX 级，未动代码——范围外列清单待批）**：
1. 框架变量双 conf 分散（precheck.conf 与 precheck.arch.conf 各持若干），首次填充易改错文件——mark-active 报错可给精确 file:line。
2. state-machine 提示"可在 precheck.conf 配 PROPOSAL_FILE"但 conf 初稿无该键（含注释行）——conf-render 预置注释键可省一次试错。

**使用侧滑误（非产品缺陷，记档）**：管道 `| tail` 吞状态机非零退出码致合入先于 archive 达成（顺序滑误，证据链已补全）；git add -A 于无 .gitignore 样例把构建产物带入跟踪（样例缺陷已修）。

## 六、发版

v2.79.0（CHANGELOG+README 徽章+tag）；离线安装包 swarm-yuan-offline-v2.79.0.zip 沿 R113 流程。
