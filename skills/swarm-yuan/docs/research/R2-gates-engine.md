# R2 — swarm-yuan 门禁引擎深度分析

> 调研切片：R2-门禁引擎分析员 ｜ 调研日期：2026-07-20 ｜ 方法：逐行精读源码 + 计数核验 + 审计文档交叉验证 + 标准文献检索
> 分析对象：`swarm-yuan/assets/precheck.sh`（2667 行 / 27 门禁）、`swarm-yuan/assets/precheck.conf`（146 变量）、`swarm-yuan/assets/state-machine.sh`（187 行）、`swarm-yuan/scripts/generate-skill.sh --inject-frameworks`、`swarm-yuan/assets/framework-gates/*.sh`（57 片段 / 13706 行）、`verifier/v1/`、`swarm-yuan/tests/`

---

## 1. 理念：门禁引擎在范式中的定位

swarm-yuan 的门禁引擎不是附属工具，而是范式"立法—执法"闭环的执法端：**特征卡（16 项认知 DNA）立法，precheck 执法**（README.md:271 明确表述"特征卡立法 + 门禁执法"）。其设计理念可归纳为五条，均有代码佐证：

1. **单文件可移植**：整个引擎是一个 2667 行 bash 单文件 + 一个 conf，生成目标 skill 时整文件复制，框架门禁经标记区块注入（precheck.sh:1-12、2514-2515）。为此明确拒绝模块化拆分（docs/paradigm-decisions.md:89「拆分会破坏 install.sh 的复制即用设计」）。
2. **配置即门禁开关**：146 个 conf 变量决定门禁"是否生效/阈值/目录边界"，未配置则跳过或降级（precheck.sh:125-148 注释「生成目标技能时按项目实际填充」）。
3. **有能力就用，无能力降级**：每个门禁优先调用已安装的运行时工具（gitnexus/graphify/ocr/claude-mem/madge），降级到内置 grep（precheck.sh:268-270 注释；README.md:131-137 降级链）。
4. **硬 fail 与 warn 分级执法**：`fail()` 置全局 `FAIL=1` 最终 exit 1（precheck.sh:241、2660-2667）；`warn()` 仅提示；`--all-full` 下未配置门禁经 `SILENT=1` 静默跳过（precheck.sh:237-248）。
5. **行为等价优先于整洁**：重构铁律是"不改变门禁判定语义"（verifier/v1/acceptance-criteria.md:3），公共库提取以 57 片段函数体逐字节比对为依据（precheck.sh:2546），并有字节级 A/B 验证器（verifier/v1/gate-ab-diff.sh:1-29）。对"沉睡门禁"采取**刻意不唤醒**的保守决策（docs/2026-07-20-audit-optimization-decisions.md:29-39「不贸然唤醒沉睡门禁」原则）。

## 2. 引擎总体结构（功能）

```
precheck.sh (2667 行)
├── L17-123    内部公共辅助：_resolve_path/_git_base/_git_changed_files/_first_existing_file/_scan_src/_norm_int/_resolve_rel_imports
├── L125-233   配置加载：_default_conf() 全量默认值 → source precheck.conf → 20 个数组变量 ${VAR+x} 兜底防空数组 unbound
├── L235-248   执行模式与执法原语：pass/fail/warn/skip_if_unconfigured；SILENT（--all-full 静默）
├── L250-264   门禁注册表：ALL_GATES_CORE(10) / ALL_GATES_FULL(27) / GATE_FLAGS(27)
├── L268-288   运行时工具检测：has_gitnexus/has_graphify/has_ocr/has_claude_mem/has_madge + 索引状态探测
├── L290-2512  27 个 check_* 门禁函数（详见 §3 分类表）
├── L2514-2515 框架门禁注入标记区块（# >>> swarm-yuan:framework-gates >>>）
├── L2517-2615 框架门禁公共库：_fw_resolve_globs/_fw_grep_count/8 族 _fw_strip_comments_*/_fw_report
├── L2617-2627 shellcheck 静态锚点（防 SC2317 级联误报）
└── L2629-2667 main 分发（--all/--all-full/单门禁）+ FAIL 汇总 exit
```

**算术骨架（本次独立核验，与审计结论一致）**：
- 27 个 `check_*` 函数 ↔ 27 个 GATE_FLAGS 一一对应（precheck.sh:257；映射规则 `check_ + flag 去--前缀、-转_`，precheck.sh:255-256、2643）。
- `grep -cE '^[A-Z_0-9]+=' precheck.conf` = **146**（本次实跑核验）。
- framework-gates 片段 57 个，与 references/frameworks/*.md（除 _template）1:1，与 tests/fixtures/ 57 个双态目录 1:1:1（self-check.sh:474-483 机械核验同口径）。
- 57 片段头注释 `# gates:` 声明的子门禁合计 **676 个**（fail 124 / warn 552，本次逐片段 grep 统计）；片段内 `_fw_*_check` 调度函数恰 57 个。

## 3. ① 27 门禁逐一分析表（功能 / 判定逻辑 / 执法强度 / 配置依赖 / 已知问题）

执法强度分四级：**硬** = 存在 `fail()` 路径可置 exit 1；**软** = 只有 warn（永不 fail）；**仪式** = 几乎恒 pass；**睡** = 已知沉睡/失效路径。fail/warn 计数为函数体内直接调用数（本次 python 脚本逐函数统计）。

| # | 门禁 (行号) | 功能 | 判定逻辑要点 | fail/warn | 执法强度 | 配置依赖 | 已知问题 |
|---|---|---|---|---|---|---|---|
| 1 | check_branch (290) | 分支规范 | git 当前分支 ∉ PROTECTED_BRANCHES 且 =~ BRANCH_REGEX | 3/0+2skip | **硬** | 无（非 git 仓跳过） | detached HEAD 跳过；regex 含 main 特判冗余 |
| 2 | check_scope (317) | 改动范围 | `git diff base...HEAD` 文件清单命中 READONLY_DIRS 前缀 | 1/1 | **硬** | READONLY_DIRS | 只检只读侧；改动落在 WRITABLE_DIRS 之外不告警（单向洞） |
| 3 | check_build (345) | 构建 | `eval $BUILD_CMD` 非零即 fail | 1/0 | **硬** | BUILD_CMD | 未配置打印"(跳过)"后照常 pass（fail-open） |
| 4 | check_test (358) | 测试 | `eval $TEST_CMD` 非零即 fail | 1/0 | **硬** | TEST_CMD | 同 fail-open；eval 注入面（conf 即代码） |
| 5 | check_sensitive (371) | 敏感信息 | 9 组密钥 ERE × SCAN_DIRS，滤 example/test/mock | 1/0 | **硬** | SCAN_DIRS | **SCAN_DIRS 为空 → 循环不执行 → 打印"未发现"pass（fail-open，385-401）** |
| 6 | check_consistency (404) | 业务勾稽 | 同名写入 >5 处才 warn；否则恒 pass + 打印人工核对清单 | 0/1 | **仪式** | CONSISTENCY_DIRS | 实质是提示单，无自动判定 |
| 7 | check_review (429) | 代码审查 | ocr review --from base --to HEAD；输出含 high\|critical\|严重 → fail；降级 ocr scan / 人工 5 维 | 1/3 | **硬(条件)** | ocr 运行时 | `!= *"Error"* 弱错误探测（440）；grep 'high' 大小写不敏感误伤面 |
| 8 | check_layer (476) | DDD 分层 | 层→文件映射 + import 解析：tgt_idx ≤ src_idx 即 fail；领域层禁 import 框架；madge 循环依赖 fail；聚合跨边界对象引用 fail | 4/3+1skip | **硬** | LAYER_DEFS/LAYER_ORDER/DOMAIN_LAYER/AGGREGATE_DIR | madge verdict 走 stderr 被 `2>/dev/null` 丢弃，循环依赖分支**沉睡**（628-637，审计#5）；经 2 轮苏醒修复（_resolve_path 左结合 + glob 最长匹配，paradigm-decisions.md:20-28） |
| 9 | check_stable_diff (672) | 稳定单元篡改 | 变更文件命中 STABLE_GLOBS 前缀且不在 spec MODIFIED 清单 → fail | 1/2 | **硬** | STABLE_GLOBS + spec | spec 发现链脆弱；glob 前缀匹配粗糙（`$prefix*` 700 行） |
| 10 | check_link_depth (756) | 调用链深度 | gitnexus trace → graphify → madge → 纯转发函数统计；超阈值均只 warn | 0/5+1skip | **软** | MAX_LINK_DEPTH | 兜底 `grep -rzoP` **GNU-only，BSD/macOS 静默为 0**（818，审计#5）；四级降级全部 warn-only |
| 11 | check_reuse (829) | 复用合规 | spec §5.5 四 checkbox 未全勾 fail；新增单元名 ∩ reference-manual §4/5/6 稳定单元名 ≠ ∅ fail；新增导出 >30 warn | 3/1+1skip | **硬** | spec + reference-manual | checkbox 数硬编码 4（869）；模板排除逻辑已修（835-836） |
| 12 | check_deps (1000) | 依赖锁定 | codebase.md 版本表为基线，5+2 类依赖文件解析，版本不符且 spec 未声明 → fail | 1/1 | **硬** | CODEBASE_REF/SPEC_FILE | 基线无记录的新依赖直接跳过（1061 注释）；spec 声明用 `grep name.*ver` 弱匹配（1066） |
| 13 | check_security (1101) | OWASP 安全 | 10 个模式族：SQL/命令注入、eval、XSS、硬编码密钥、TLS 关闭 fail；路径穿越/弱哈希/CORS/调试 warn；MyBatis #{} 感知 + 白名单 | 6/6 | **硬** | WRITABLE+SCAN_DIRS、SQL_INJECTION_WHITELIST | 单行 grep 无数据流；targets 为空 warn 后 return 0（1111） |
| 14 | check_adr (1213) | 架构决策 | ADR_DIR 配置但目录不存在 → fail；其余（ADR 计数/新依赖未解释/技术债）全 warn | 1/5 | **硬(单点)** | ADR_DIR/TECH_DEBT_FILE | 新依赖检测只看 import 语句不看依赖清单文件 |
| 15 | check_contract (1295) | 接口契约 | 契约文件缺 version 字段 → fail；跨 CONTEXT_DIRS 直接 import 绕过 ACL → fail | 2/4 | **硬** | CONTRACT_DIR/ACL_DIR/CONTEXT_DIRS | CONTRACT_DIR 未配置/不存在均只 warn |
| 16 | check_consistency_cross (1366) | BDAT 一致性 | 术语表标识符代码中 grep 不到 → warn；SoR 表存在即 pass | 0/5 | **软** | GLOSSARY_FILE/SOR_FILE | 全 warn；SoR 仅存在性核验（1418 注释承认"详细双写检测需人工"） |
| 17 | check_impact (1428) | 变更影响 | 找不到含影响范围段的 spec → fail；spec 缺"影响范围"关键词 → fail；消费方 >3 warn | 2/2 | **硬** | spec | **回退到 assets 自带 spec-template.md 自证（1435，审计#3）** |
| 18 | check_service (1508) | 微服务架构 | 两服务 DB 配置同 URI → fail；共享库/网关/同步链/trace 全 warn | 1/6 | **硬(单点)** | SERVICE_DIRS/DB_CONFIG_FILES 等 | URI 粗筛（host\|url\|dsn 1525）易误判/漏判 |
| 19 | check_api (1612) | API 契约幂等 | API 定义文件缺 version → fail；幂等/2PC/Outbox 全 warn | 1/5 | **硬(单点)** | API_SPEC_DIR/WRITE_HANDLER_DIRS | 幂等检测为关键词 grep（idempotency\|幂等，1648） |
| 20 | check_state (1691) | 前端状态 | 巨型 store/prop drilling/派生 useState 全 warn | 0/4 | **软** | STORE_DIR/COMPONENT_DIR | 无 fail 路径 |
| 21 | check_frontend (1740) | 前端组件 | madge 循环依赖 fail；嵌套深度/容器展示混合/props 多/CSS 污染/重复依赖 warn | 1/7 | **硬(单点)** | COMPONENT_DIR 等 | 唯一 fail 路径（madge）同受 stderr 丢弃影响（1814-1821）**疑似沉睡**；嵌套深度靠 python3 正则估算（1758-1767） |
| 22 | check_cognition (1862) | 认知递进体检 | 六阶认知链 + 六维动力学 + 五层基底打分，≥15/19 pass、≥10 warn | 0/4 | **仪式/睡** | 几乎全部认知 conf | **0 个 fail()（审计#1）；分数上限标注 /11、/19 与实际满分 14、22 错配（2051、2125-2126）** |
| 23 | check_domain (2136) | 领域知识 | spec §18 存在性 + 4 条"客观规律"代码扫描：密码明文 fail、SQL 拼接 fail、XSS/全局可变状态 warn | 2/8+1skip | **硬(双点)** | spec + WRITABLE_DIRS | spec 缺 §18 只 warn；XSS 在 check_security 是 fail、此处是 warn（**同级违规执法不一**，1158 vs 2211） |
| 24 | check_knowledge (2226) | 知识复用 | 有 AGENTS/CLAUDE/记忆但 SKILL.md 零引用 → fail；部分引用 warn | 1/3+2skip | **硬(单点)** | 知识文件 + SKILL.md | 引用检测为关键词 grep（2262-2264）易自欺 |
| 25 | check_mermaid (2294) | 可视化 | reference-manual 无 ```mermaid → warn | 0/1 | **软** | reference-manual | 无 fail 路径 |
| 26 | check_shift_left (2329) | 左移（测试/变更/运维） | spec 缺 §19 → fail；plan 缺 §20 → fail；spec 无回滚关键词 → fail；§21 缺失/无 test 提交/埋点缺失 warn | 3/11 | **硬(三点)** | spec/plan/迁移/埋点 patterns | ①1b(2373-2375)与 3a(2426-2433) `warn+found=1` 但不调 fail()，页脚谎称"有 fail 项"而 FAIL 未置位（**严重度标签自相矛盾**）；②BREAKING_DDL/METRIC/LOG/TRACE 4 变量 `\|` 在 grep -E 下为字面量：BREAKING 恒 pass（**睡**），METRIC/LOG/TRACE 恒 warn"未检测到"（**醒着误报**）（审计#2/paradigm-decisions.md:30-36） |
| 27 | check_framework (2491) | 框架适配分发 | 遍历 ACTIVE_FRAMEWORKS 动态调 `_fw_<id>_check`；函数缺失 → fail | 1/2+1skip | **硬(分发)** | ACTIVE_FRAMEWORKS + 注入片段 | 漏配检测只识别 mybatis 一种信号（2496-2497）；676 子门禁本体在片段中 |

**汇总**：21/27 门禁存在 fail 路径（硬），其中 6 个是"单点硬"（仅 1-2 条 fail 规则）；6/27 永不 fail（consistency/link_depth/consistency_cross/state/cognition/mermaid）。`--all` 序列（L252）= branch/scope/build/sensitive/consistency/review/reuse/deps/security/test；`--all-full`（L254）在其上按序追加 17 个，test 排最后。

## 4. ② 核心 10 + 架构 17 的划分依据

划分依据在代码注释与文档中均有明示，可归为四个维度：

1. **普适性**：核心 10"适用所有项目"（precheck.sh:251 注释）——任何仓库都有分支/构建/测试/密钥/依赖；架构 17 依赖项目特定形态（分层、微服务、前端组件、DDD 聚合），无对应配置即无意义（precheck.sh:253 注释「含架构/认知门禁，未配置的静默跳过」）。
2. **运行成本**：核心 ~5 秒、全量 ~30 秒（README.md:92、107）——核心门禁全是无配置 O(1)-O(n) 快扫；架构门禁含多轮文件映射、import 解析、外部工具调用。
3. **执法姿态**：核心 10 中 7 个主判定为硬 fail（仅 consistency 仪式、build/test 未配置跳过）；架构 17 中 warn/skip 占比显著更高（上表 warn 列），且未配置即静默——它是"有条件执法"。
4. **特征卡映射**：README.md:94-105 把核心门禁逐项挂到特征卡第 4/5/6/7/11/12/14 项；README.md:109-127 把架构门禁挂到特征卡第 3/8/10/11/12/13/14 项及"—"（impact/knowledge/mermaid/shift-left 无直接特征卡项，属流程级约束）。即：**核心 ≈ 特征卡中"每次提交都必须成立"的铁律；架构 ≈ 特征卡中"项目形态相关"的结构性规律**。

注册表本身即划分的事实源：ALL_GATES_CORE（precheck.sh:252）与 ALL_GATES_FULL 的前 9+末 1 的差集恰好是中间 17 个架构门禁；self-check.sh:512 以 `true_arch = true_gates - 10` 反推架构数做文档漂移核验，说明"10"是硬编码契约。

## 5. ③ 框架门禁公共库设计（57 片段共享层）

**注入机制**：`generate-skill.sh --inject-frameworks`（generate-skill.sh:153-295）：
- 读 conf 的 ACTIVE_FRAMEWORKS（set +u/source/set -u 模式，防 conf 字面 `${}` 触发 unbound，176-182）→ 旧 id 迁移（pinia→vue/socketio→koa/vitest→jest-vitest，188-207）→ 拼接片段 → awk 幂等替换 `# >>> swarm-yuan:framework-gates >>>` 标记区块（242-246）；无标记则插入 main case 之前（247-259）保证函数先定义后调用。
- **fail-closed 设计**：开标记存在而闭标记缺失时中止不改动文件（235-241，修复自审计#5 的 fail-open：原 awk skip=1 到 EOF 会静默删除区块后 ~150 行公共库与 main 分发且无备份）。
- **手改裁决**：注入后记录区块 cksum 入 `.swarm-yuan-version`（282-293）；再注入时哈希不符即中止待用户裁决（162-174）。
- **requires_conf 机械核对**：解析片段头 `# ruleset: <id> requires_conf: ...`，conf 缺变量则注入占位 + warn（218-225、271-275），未覆盖框架列入清单不静默（277-280）。

**公共库四件套**（precheck.sh:2517-2615，注释明言"勿改名，片段依赖"，2543）：

| 组件 | 行号 | 设计 | 评价 |
|---|---|---|---|
| `_fw_resolve_globs` | 2520-2534 | 把 `dir/**/*.ext` glob 拆成 `find dir -name '*.ext'`，兼容 bash 3.2 无 globstar；输出文件清单供 grep | 解决 BSD/GNU 差异的核心适配器；`dir==g` 兜底单文件 |
| `_fw_grep_count` | 2537-2541 | `grep -rlE pat files | wc -l`，`\|\| true` 防 set -e+pipefail 无匹配退出 | 返回的是**匹配文件数**非匹配行数；不支持 -i（sentinel 片段因此无法收编，paradigm-decisions.md:64） |
| `_fw_strip_comments_*` ×8 族 | 2551-2603 | C 系/C 系 inline/Python hash/配置 cfg/SQL/MySQL/JS 行首/XML awk 状态机，家族聚类依据"57 片段嵌套函数体逐字节比对"（2544-2546；gate-ab-diff.sh:15-27 家族映射表） | 本次核验：306 处调用；是把"片段原内联实现字节级同语义"上提的典型案例 |
| `_fw_report` | 2605-2615 | 规范形报告尾收编：bad 非空 → `severity "id: msg:\n<bad>"`；空 → `pass "id: ok"`，与手写 if/else 逐字节等价 | 本次核验：419 处调用（README 称重构时收编 397 处，差值为后续新增片段）；不适用情形（多变量插值/双端动态/非 `-n` 条件/无 else pass）在 gate-ab-diff.sh:10-14 显式列为契约例外 |

**配套验证**：`scripts/verify-framework-ruleset.sh` 做四要素机械核验（规则 md 存在、§3 规律数 ≥ 深度门槛、每条规律挂"对应门禁/人工检查"、§4 门禁 id ⊆ 片段声明、函数存在、`bash -n` 语法、禁 `declare -A`、fixture 双态）。设计上的亮点是**命名契约即接口**（`_fw_<id>_check` 由 check_framework 按 `tr '-' '_'` 动态分发，precheck.sh:2502）+ **黄金主测试**（gate-ab-diff.sh：HEAD 原版 vs 工作区改版注入同一 precheck，stdout 逐字节 + 退出码一致才算等价）。短板是文本协议脆弱：片段与主文件仅靠函数名约定耦合，无类型/参数校验；`_fw_report` 的多行 bad 内容插值依赖调用方手工拼换行，错误拼法不会报错只会输出畸形。

## 6. ④ 配置变量 → 特征卡的推导链

链路的制度设计（文档层）：

```
项目仓库探查（exploration-guide.md：三路并行 + 运行时工具矩阵）
  → 16 项特征卡（AI 主动生成建议值，用户评估确认，SKILL.md:46-48）
  → 特征卡 → 目标文件映射表（template-spec.md §3，L206-226：每项特征卡落到 SKILL.md/reference-manual/spec-template/precheck 的具体章节与门禁 flag）
  → AI 从特征卡推导 146 个 precheck.conf 变量（SKILL.md:48「AI 从特征卡主动推导建议配置」；SKILL.md:82「所有 <占位符> 必须替换为真实值」）
  → generate-skill.sh --inject-frameworks 按 ACTIVE_FRAMEWORKS 注入片段 + requires_conf 核对补缺（Step ⑦.5，SKILL.md:66）
  → AI 运行 --all → --all-full 验证（SKILL.md:84）
```

变量分组结构（precheck.conf 实读，146 = 基础 10 + DDD 8 + 依赖 2 + TOGAF 8 + 微服务 7 + 前端 7 + 认知 5 + 左移 14 + 框架适配 ~85 按 `<RULESET_ID>_<VAR>` 约定命名，conf:83-85）。

**推导链的机械化程度评估**：
- **已机械化的环节**：框架段的 requires_conf 核对（generate-skill.sh:218-225）；未声明数组变量兜底防崩（precheck.sh:226-233）；文档数字漂移核验（self-check.sh:470-554，从代码算真值扫 README/USAGE/PROMO）。
- **未机械化的主体**：146 变量的**填充正确性**全靠生成时 AI 自觉——没有任何脚本验证"LAYER_DEFS 的 glob 是否真的匹配到文件"（check_layer 只在 0 匹配时 warn，precheck.sh:552-555），也没有 conf schema/lint。审计已证实 5 个**死变量**（COGNITION_MAP/LOMBOK_ANNOTATIONS 在 precheck.sh 零引用；TEST_DIR_PATTERNS/IMPL_DIR_PATTERNS/METRIC_ENDPOINTS 仅出现在兜底清单、无门禁消费——本次 grep 核验；audit-optimization-decisions.md:46）。推导链是"AI 中介的散文契约"，不是可证伪的数据流。

## 7. ⑤ verifier/v1 验收体系（C1-C7）完备性评估

**体系构成**：acceptance-criteria.md（C1-C7）+ run-verifier.sh（fixtures/e2e/shellcheck/metrics 四模式）+ run-one-fixture.sh（单 fixture 双态退出码）+ golden-vector.txt（57 fixture 基线向量）+ gate-ab-diff.sh（片段级字节等价黄金标准）+ runs/ 只增不改运行日志。配套：tests/run-framework-fixture.sh、tests/e2e/run-e2e.sh（四框架注入 + 四 fail id 断言）、.github/workflows/ci.yml（4 Job）。

**逐条评估**：

| 条款 | 内容 | 强度 | 缺口 |
|---|---|---|---|
| C1 行为等价 | 57 fixture 退出码向量 (v,c) 重构前后逐值相等，golden-vector 比对 | **强**：退出码逐值相等强于 OK/BAD（acceptance-criteria.md:7）；R0 修复 conf 硬编码路径 → `__REPO_ROOT__` 占位（run-one-fixture.sh:12），机器无关 | 只覆盖 `--framework` 一条路径；**26 个非框架门禁零 fixture**（paradigm-decisions.md:42 承认留长期） |
| C2 e2e | run-e2e.sh RC=0 | 中：覆盖注入→分发→fail 全链路 | 仅 4 框架 4 fail id；不覆盖 --all/--all-full |
| C3 重复消除 | precheck 双副本 diff 469→22 + SKILLS_PATH_REWRITE 同步机制 | 中：有量化指标（run-verifier.sh:71 DUP_DIFF_LINES） | 度量只 diff 行数，无语义等价断言；同步机制本身在另一仓库，本仓无法单测 |
| C4 shellcheck 不恶化 | error 总数 ≤ 基线 | 中：fail-closed 解析链（无 shellcheck 报 UNAVAILABLE 而非谎报 0，run-verifier.sh:11-23，修复自审计#9） | warning 只计数不设阈值断言 |
| C5 CLI 兼容 | 27 flag 可用 + usage 不破坏 | **弱**：验收记录中的"131 次调用 A/B 逐字节一致"（verifier/README.md:16）是**手工执行**，run-verifier.sh 无 cli-compat 模式，不可重复 |
| C6 可维护性 | LOC/重复行数下降 | 弱：metrics 模式只打印数值（run-verifier.sh:68-75），**无阈值断言**，回归不会失败 |
| C7 交付物 | 重构报告 | 弱：非机器可验 |

**完备性总评**：v1 是一套**重构专用**验收器，对"57 框架片段行为不变"这一目标覆盖充分（C1+golden vector+gate-ab-diff 三层），且具备两个超出一般项目的设计：fail-closed 工具解析、机器无关 fixture。但作为**门禁引擎自身的质量验收体系**有结构性盲区：①门禁引擎的 26 个非框架门禁没有双态 fixture，fail 路径大多从未被负向测试执行过（CI 也不对生成器仓库跑 27 门禁，audit-optimization-decisions.md:47）；②C5/C6 无量化断言；③CI 仅 ubuntu（bash 5.x），而代码大量为 bash 3.2/BSD 兼容写的分支（如 precheck.sh:498、521）**从未在 macOS/bash 3.2 矩阵中验证**——`grep -rzoP` 这类 GNU-only 兜底（precheck.sh:818）正是在这个盲区里存活下来的。

## 8. ⑥ 距行业标准（静态分析/SAST 成熟度）的结构性差距

参照系：GB/T 34943-2017《C/C++语言源代码漏洞测试规范》、GB/T 34944-2017《Java语言源代码漏洞测试规范》、GB/T 34946-2017《C#语言源代码漏洞测试规范》、GB/T 39412-2020《信息安全技术 代码安全审计规范》、GB/T 25000.51-2016（SQuaRE/RUSP）、ISO/IEC 5055:2021（Automated Source Code Quality Measures，138 个弱点）、MITRE CWE。（标准号与内容来源见文末参考）

1. **检测原理停留在词法层**。check_security 全部是单行 `grep -E` + 拼接启发式（precheck.sh:1115-1199）；无 AST、控制流、数据流、污点分析。GB/T 34944-2017 要求静态分析"覆盖代码语法、控制流和数据流分析"（腾讯云解读，2025-12-08）。跨过程污点（如污点变量经函数传入 SQL）在本引擎原理上不可达。
2. **漏洞分类覆盖无标准映射**。check_security 约 10 个模式族 vs GB/T 34944-2017 的 9 大类 44 种漏洞、ISO/IEC 5055:2021 的 138 个弱点；全引擎仅 mybatis 片段一处标注 CWE-89（mybatis.sh:50），无 CWE/GB 条款号的系统性元数据。
3. **无误差工程学**。GB/T 34943-2017 §5.4 要求选择测试工具时"重点考虑漏报率和误报率"（知乎 CNAS 解读，2025-10-14）。本引擎无带标注语料、无误报/漏报度量；fixture 是双态冒烟而非精度评测；已知沉睡分支（madge stderr、grep -rzoP、`\|` 字面 ×4）说明"规则写了≠规则在工作"。
4. **输出不可互操作**。无 SARIF/JSON 机器可读输出，无稳定规则 id（核心门禁无 id，框架子门禁有 id 是好实践），退出码聚合掩盖了是哪个门禁失败；目标项目侧无运行日志/报告持久化。对照 GB/T 15532-2008 四阶段过程与 GB/T 34943-2017 §5.5 文档要求（测试计划/说明/日志/总结报告），门禁运行是"一次性的终端散文"。
5. **严重度与治理模型简陋**。仅 fail/warn/静默跳过三态；无基线文件（baseline）、无豁免/抑制机制（suppression）、无 waiver 工作流；阈值（MAX_*/COG_*）为裸数字无理由追溯。且存在**执法不一致**：同类 XSS 在 check_security 为 fail、check_domain 为 warn；check_shift_left 两处 warn 标签但页脚自称 fail 项（precheck.sh:2373-2375、2426-2433）。
6. **fail-open 默认姿态与"质量执法"定位冲突**。未配置即跳过/通过：check_build/check_test 未配置打印跳过照常 pass（precheck.sh:347-349、360-362）；check_sensitive 空 SCAN_DIRS 直接 pass"未发现"（385-401）；`--all-full` SILENT 使约 15 个门禁静默消失而总结仍声称"✓ 门禁检查通过"（237-248、2660-2663；审计#4 建议加跳过计数器未实施）。行业标准语境下"未检测"必须与"检测通过"严格区分。
7. **度量体系缺失**。ISO/IEC 5055:2021 要求弱点计数可按规模归一化（密度/西格玛水平）；本引擎只有阈值型计数（行数/个数），无密度、无趋势、无跨运行可比性（check_cognition 的"六维动力学"有观测意识但 0 fail 且基线比对未实现，precheck.sh:2011-2016 trend_val 恒"未知/基线"）。
8. **过程成熟度**：无增量分析/缓存；CI 无多平台矩阵；生成器自身不吃自己的狗粮（CI 不对范式仓库跑 27 门禁，审计遗留）。

## 9. 对 swarm-yuan 的启示（升级建议，按 ROI 排序）

1. **门禁覆盖报告**（低成本高收益）：汇总行输出"执行 X/27，跳过 Y（未配置清单），warn Z"，堵 SILENT 跳过洞——审计#4 已给出方向（跳过计数器，非破坏）。
2. **给 26 个非框架门禁补 violating/compliant fixture**，复用 tests/run-framework-fixture.sh 的 `__REPO_ROOT__` + 注入模式；把 C1 从 `--framework` 扩展到全部门禁的负向测试。这是把"沉睡门禁"从修辞变成可证伪的唯一办法。
3. **输出分层**：人读散文保留，新增 `--format json`（SARIF 子集即可）+ 每门禁稳定 id + 运行记录落盘（`.swarm-yuan/gate-runs/`），对齐 GB/T 15532-2008 过程文档要求与 verifier/runs 的只增不改范式。
4. **处置剩余 `\|` 字面量**：BREAKING_DDL（恒 pass）优先于 METRIC/LOG/TRACE（恒 warn）——前者是睡着的执法，后者是醒着的噪音；但须先补 fixture 再唤醒（paradigm-decisions.md:31-36 的既定纪律）。
5. **规则元数据标准化**：在 references/frameworks/*.md §3 与 check_security 模式族上挂 CWE id / GB-T 34944 条款号，使 676 子门禁可映射到国家与国际标准条款——这是"满足行业及国家质量/安全标准"的最短路径。
6. **conf lint（`--doctor`）**：对 146 变量做 schema 校验——glob 是否匹配到文件、路径是否存在、死变量警告，把"AI 中介的散文契约"升级为可证伪配置。
7. **执法一致性梳理**：统一 XSS 等同类违规在 check_security/check_domain 间的严重度；修复 check_shift_left 的 warn/fail 标签矛盾；明确"未配置=跳过（不计入通过）"的全局语义。
8. **CI 平台矩阵**：加 macOS runner（BSD grep + bash 3.2 via /bin/bash）——代码声称为三平台写的兼容分支需要真实覆盖；GNU-only 兜底（grep -rzoP）替换为可移植实现或显式能力探测。
9. **verifier 断言化**：C5 CLI 兼容的 131 调用 A/B 编入 run-verifier.sh；C6 设阈值断言（如 LOC 只降不升）；fixture 基线向量纳入 CI 比对而非仅存档。
10. **门禁引擎自食**：CI 对范式仓库自身跑 `--all`（它本身是 bash/markdown 项目，branch/scope/sensitive/security/consistency 等可直接生效）。

---

## 参考与证据

**项目内证据（文件:行号，2026-07-20 实读）**：
- `swarm-yuan/assets/precheck.sh`：门禁注册表 250-257；配置加载 125-233；执法原语 237-248；27 门禁 290-2512；框架公共库 2517-2615；main 分发 2629-2667
- `swarm-yuan/assets/precheck.conf`：146 变量（本次 `grep -cE '^[A-Z_0-9]+='` 核验）；框架变量约定 83-85
- `swarm-yuan/assets/state-machine.sh`：guard_phase 82-121（design/verify 守卫为占位 pass）；transition 允许前向跳阶段 134-136
- `swarm-yuan/scripts/generate-skill.sh`：inject_frameworks 153-295；fail-closed 闭标记校验 235-241；requires_conf 核对 218-225
- `swarm-yuan/assets/framework-gates/*.sh`：57 片段/13706 行/声明 676 子门禁（fail 124/warn 552，本次逐片段统计）；_fw_report 调用 419 处；_fw_strip_comments_* 调用 306 处
- `verifier/v1/`：acceptance-criteria.md C1-C7；run-verifier.sh fixtures/shellcheck fail-closed 11-23；gate-ab-diff.sh 等价契约 1-29；golden-vector.txt 57/57 OK
- `swarm-yuan/tests/run-framework-fixture.sh`（`__REPO_ROOT__` 机器无关化）；`swarm-yuan/tests/e2e/run-e2e.sh`（四框架注入 + 四 fail id）
- `swarm-yuan/scripts/verify-framework-ruleset.sh`（四要素机械核验）；`swarm-yuan/scripts/self-check.sh:470-554`（文档漂移核验）
- `docs/2026-07-20-audit-optimization-decisions.md`（沉睡/fail-open/模板自证清单 29-47）；`docs/paradigm-decisions.md`（苏醒纪律 28-36、不修清单 76-96）
- `.github/workflows/ci.yml`（4 Job，仅 ubuntu）

**标准文献（URL，访问日期 2026-07-20）**：
- GB/T 34944-2017《Java语言源代码漏洞测试规范》9 大类 44 种漏洞、SAST 须覆盖语法/控制流/数据流：https://cloud.tencent.com/developer/article/2598483
- GB/T 34943-2017《C/C++语言源代码漏洞测试规范》遵循 GB/T 15532-2008 四阶段（策划/设计/执行/总结）、§5.4 工具漏报率误报率、§5.5 测试文档：https://zhuanlan.zhihu.com/p/686373193 ；https://blog.csdn.net/lixueyan1987/article/details/156849002
- GB/T 34946-2017（C#）、GB/T 39412-2020《信息安全技术 代码安全审计规范》、GB/T 25000.51-2016 存在性引用：http://mp.weixin.qq.com/s?__biz=MzkzOTQxNDcwMA==&mid=2247489757&idx=2&sn=f195e8fa4e9d9dba251d8137a937b7f8 ；https://www.ces.org.cn/res/ces/2509/734cd9c06799c427b92d357aad395bb1.pdf（引用 GB/T 39412-2020 术语 3.1.1）
- ISO/IEC 5055:2021 Automated source code quality measures（138 weaknesses，源自 CISQ/OMG，CWE 对齐）：https://www.iso.org/standard/80623.html ；https://www.omg.org/spec/ATDM2/1.0/PDF
