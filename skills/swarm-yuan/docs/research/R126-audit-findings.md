# R126 深度复盘审计发现台账（未修项登记待批）

> 轮次：R126（2026-10-20，基于 v2.88.1）。五路并行子代理全量审计共产出 96 项发现，33 项已修（见 CHANGELOG R126 节），本文件登记其余 63 项的结构性重构/方案抉择项，供后续轮次按优先级裁决。每项标注 [来源域/严重度/一句代价]，裁决时按「编号 + 决定」引用。
>
> 域缩写：GATE=门禁引擎，GEN=生成器管线，TEST=测试设施，DIST=分发与自检。

## A 类：跨文件结构性重构（建议独立轮次做，先出设计再动手）

1. **G8 fail 计数器盲区**（GATE/高）——gen-enforce-level.sh:51 只认行首 `^[ \t]*fail` 形态，漏计 `&& fail`、`*) fail` 与 helper 内 fail。实测偏差：check_authz 实际 5 fail（计 3）、check_reuse 5（计 3）、check_crypto 4、check_sensitive 3、check_requirements 4（按 conf 自述 "≥3=strict" 规则 requirements 应 strict 却标 warn）。修复将连锁改变 enforce 分层 → FACT_ENFORCE_* 六键 → usage-manual 三档表 → golden 再生。代价：一轮含全量回归的独立轮；不修的代价是"advisory 门禁内联加 fail 被静默降级"的潜伏面持续存在。
2. **conf 四消费方合成视图统一**（GEN/中）——同一 conf 变量四个入口四种读法：inject 走 source 链、check_framework_globs/check_spec_first_wiring 走文本 grep、conf-render lite 走追加（MED-10/11：lite 档 patch.conf 对 ACTIVE_FRAMEWORKS 的覆盖被击穿；mark-active 两道防线看不见 patch 层）。代价：抽一个 `_conf_effective` 合成函数并收编四消费方，触及 mark-active/inject/conf-render 三链路回归。
3. **门禁共享文件清单缓存**（GATE/中，性能）——56 门禁各自 find/grep 全树，~43 个调用点 O(模式×全树)。本仓实测 --all 全套 3.66s（可接受）；万文件级项目线性放大。代价：precheck 提供一次遍历缓存 + 逐门禁改造，大 diff 需逐 gate-fixture 回归；收益在大型目标项目。
4. **install.sh 宿主检测语义**（DIST/高）——以 `~/<host>/skills` 目录存在性判定，Codex/Cursor 等装后才建 skills/ 的宿主被误判未装 → auto 默认装 ~/.claude（没装的宿主）、--all 直接拒装。另有：--all 的 `echo|while` 子 shell 任一宿主失败静默中止后续（:382）、重装先 mv 后 cp 无回滚（:231）、自装判定字符串等值 vs 物理路径（:217）、--kimi 落旧路径（:366）、install.bat WSL 大写盘符（:47）。代价：一轮 install 链路专项 + 真机矩阵验证。
5. **trace-log 哈希链对抗性**（DIST/中）——无密钥 cksum（CRC-32 可伪造重算全链）；legacy 行重置链（中途插一行不含 checksum 子串的行即绕过 previous_checksum 连续性）；正文含 `"checksum":` 字面量误判；并发 --decision 无锁（wc -l+1 重复 seq）。代价：HMAC（需密钥管理）或文档诚实降级为"意外篡改取证"；并发锁可用 mkdir 原子锁根治。
6. **generate-skill 单体拆分/子命令统一 init**（GEN/中）——2679 行单体，子命令在共享初始化（ASSETS_DIR/_DELIVERY_SHAPES）之前逐个拦截 exit，是 HIGH-3/MED-8（--inject-frameworks 独立跑时 ASSETS_DIR 未定义、模板锚定失效）的结构性根因。代价：脚本结构重排 + 全 e2e 回归。

## B 类：测试覆盖缺口（补齐面，按价值排序）

7. **4 个孤儿门禁处置**（TEST/高）——operate/learnings/pr_quality/skill_supply_chain 定义于 gates-advisory 但不在任何 ALL_GATES_* 序列，只能单 flag 直调，等于半个孤儿；cwe-audit/cert-audit 有序列但零 fixture 零测试。裁决点：①注册进序列（--all 输出变多，advisory 不阻断）；②降级为文档化"显式调用门禁"；③删除。补最小双态 fixture 是任何选项的前置。
8. **14 组 gate-fixture 无 violating 样本**（TEST/高）——cognition/consistency/consistency-cross/decision-audit/diagram/knowledge/link-depth/loop-oracle/metrics/stable-diff/state/state-phase/summary/upstream-baseline 组只有 compliant 侧 rc==0 断言（advisory 语义下零信息量），检测逻辑死分支不可见。其中 10 组连 expected-ids 都没有。
9. **78/81 框架 fixture 无 compliant 负向断言**（TEST/中）——仅 dotnet/php/ruby 三家有 expected-pass-ids；且 verifier/golden 路径（run-one-fixture.sh）根本不执行负向断言（只有 CI Job2 的 run-framework-fixture.sh 执行），本地 run-sweep 与 CI 判定不同构。
10. **golden-vector 只锁三数字**（TEST/中高）——`rc_v rc_c id_failures` 三段逐行 diff，输出内容/误报增量漂移透明；且 fixtures 独立模式 OK 判据不含 violating rc。
11. **cli_ab CI 恒真票**（TEST/中）——CI checkout 干净时 A=git show HEAD 与 B=工作区逐字节相同，155+ 次全 OK 近乎无信息；stderr 不在比对面。
12. **make-offline-bundle 零实跑 e2e**（TEST/中）——test-r104 全部是对源码文本的 grep 断言，构建→SHA256SUMS→install-offline 全链路无执行覆盖。
13. **run-sweep 与 CI 双向不同构**（TEST/中）——CI 有 sweep 无（memory-writeback/industry 8 档/独立 shellcheck/real-project-smoke/macos+windows 矩阵）；sweep 有 CI 无（fieldchange 已于 R126 补入 CI，此项半解）。self-check 本地无 --ci 标志导致本地对运行时缺席更严格。
14. **verifier/runs/ 留档停摆**（TEST/低）——README 约定每次运行一条，最新停于 2026-08-19。流程纪律项。

## C 类：已确认待修小项（低风险，可下轮顺手）

15. GEN MED-4：`--inject-frameworks --remove` 先改 conf 后落快照，回滚恢复的是"已移除"态（F4 契约破裂）。
16. GEN MED-8：--inject-frameworks 独立子命令 ASSETS_DIR 未定义（结构根因见 #6，短期可局部赋值修补）。
17. GEN LOW-12/13：mkdir 先于 upgrade 存在性检查（空目录垃圾）；--upgrade --profile 不回写 frontmatter profile:（档位三体不一致）。
18. GEN LOW-16：标记区块缺失时 cksum(空)=4294967295 误报"被手改"（应识别无区块走重建）。
19. GEN LOW-18：detect-frameworks 每 create 全仓扫 3 遍。
20. GEN LOW-20/21/22：生成物自述 §1-24 漏 §25；detect-spec-scale 把行内代码 span 计为侵入点；gate-plan 对非法输入过度宽容。
21. GEN LOW-23：CRLF 文件的 sed 追加/区块注入行尾混乱（bash 3.2 兼容前提下难根治，登记披露即可）。
22. GATE LOW-17：semgrep helper 声明 rc=3 语义但无 return 3（死代码）+ 两处 fail 数注释陈旧。
23. GATE LOW-18：has_claude_mem/has_mattpocock/has_diagram_design 三个守卫零调用点（自证式存活）。
24. GATE LOW-19：loop-hook.sh 头部无 -e 但验证区 set +e/set -e 凭空开 errexit。
25. GATE LOW-20：((_ssc_limit++)) 后缀自增 set -e 陷阱（advisory 子 shell 掩盖中）。
26. GATE LOW-21：state-machine set_field 的 awk -v 解释值内转义（\n 变换行）。
27. GATE LOW-22：check_impact 对 gitnexus/graphify ensure 重复调用（警告双计）。
28. GATE LOW-23：--strict-skip 的 rc=2 与三个既有 rc=2 语义冲突。
29. GATE LOW-24/25：deny JSON 未转义路径/命令（非法 JSON 面）；hooks 侧 printf|grep -q 的 SIGPIPE 假阴性窗口。
30. GATE LOW-26：authz 文件清单复用带行号后缀的正则永不命中；check_scope 的 READONLY_DIRS 条目未转义内插（grep 退 2 被吞）。
31. DIST 中：SHA256SUMS 不覆盖 install-offline 入口三件（自举盲区，至少 README 披露）；离线装版本记 unknown（三处版本写入不同源）。
32. DIST 低：25 个零消费 FACT_ 键（僵尸开关族，FACT_TRACE_CHAIN/FACT_DOMAINS/FACT_SKILLMD_BYTES_BUDGET 等）；method 层计数是 facts 内部算术自洽（假对账）；memory-backends 固定 /tmp/cm_err.$$ 可预测名；mine-habits 假设 SHA-40（SHA-256 仓库解析错位）；cost-report set -e 与"恒 0"承诺矛盾；install.sh 只取首个参数静默丢弃多目标。
33. TEST 低：run-e2e git 构造链无失败处理（受限环境恒真面）；verifier/gen-e2e 固定 /tmp 日志路径并行互踩。
34. DOCS 低：Kimi 检测口径与其余 7 宿主不一致（父目录 vs skills/ 子目录）——与 #4 同批处理。

## 已核实无恙项（对账记录，防重复调研）

- facts.conf 全部闭合方程实测自洽（56=50+6、50=29+19+2、185=20+117+48、81/81 1:1、92/46、7041→7096 更新后）。
- --no-vendor 分支、runtime/ 两物化层（27 技能/45 类型）、NEVER_GATE 两源、golden 82=81+1 当前全对账通过。
- gates-warn:1326 的 `\s` 与 precheck:1681 的 glob 类内转义实测两平台均无实际缺陷（保守不动）。
