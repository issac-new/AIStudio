# R9 · 范式真实项目测试与结构性优化：5 项目实测暴露的 3 阻断 bug 与修复

- 调研角色：R9-范式真实项目测试员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-07-22
- 调研方法：5 个 GitHub 代表性项目 clone 本地实测 + `bash -x` 逐行追踪根因 + 修复后回归验证 + 端到端流程验证
- 测试项目：RuoYi-Vue3（Vue3+element-plus 权限管理）、mall-admin-web（Vue3+element-plus 电商后台）、slash-admin（React19+antd5+Vite+TS）、whatsmars（Spring 多模块示例集）、yudao-cloud（Spring 微服务电商，5564 java 文件）

> ⚠️ **样本偏倚声明**：本轮 5 个样本均为 Java/JS Web 后台管理系统，品类单一。结论的适用域仅限该品类；对嵌入式 C、科学计算 notebook、单体内核、Rust 系统编程等品类的适用性未验证，列为 R10 待测项（见文末"R10 待测品类"）。从单一品类外推到"范式成立"在统计上不成立--R9 的"5 项目回归全通过"应读作"在 Java/JS Web 品类上回归全通过"，而非"范式普适"。

---

## 0. 总览

本次测试的目标是验证 swarm-yuan 范式在**真实 GitHub 项目**上的可用性，而非自测 fixture。测试暴露了 3 个阻断性/严重缺陷，让范式在真实项目上**基本不可用**（默认入口 100% 崩溃、门禁全失效、框架探测错乱）。经根因定位与修复后，5 项目回归验证全通过，端到端流程可用。

**核心结论**：范式的自测 fixture 体系（61 框架双态绿）未能发现这 3 个 bug，因为 fixture 用的是构造的最小样例，而 bug 在真实项目的大文件量/多模块/跨语言场景才触发。**真实项目测试是 fixture 测试不可替代的补充**。

---

## 1. 测试矩阵

| 项目 | 形态 | 规模 | 修复前实测 | 修复后实测 |
|---|---|---|---|---|
| RuoYi-Vue3 | Vue3+element-plus+Vite | 97 vue / 289 文件 | auto 档 exit 141；precheck 无输出 exit 1；detect 3 框架（正确） | auto exit 0 / 58 文件；precheck 64 行门禁输出；detect 3 框架（一致） |
| mall-admin-web | Vue3+element-plus 电商 | 83 vue | 同 RuoYi | 同 RuoYi |
| slash-admin | React19+antd5+Vite+TS | 276 ts/tsx | auto 崩溃；precheck 失效；detect 误报 nextjs（i18next 子串） | auto OK；precheck OK；detect 4 框架（nextjs 误报消除） |
| whatsmars | Spring 多模块示例集 | 611 java | auto 崩溃；precheck 失效；detect 仅 3 框架（漏 12 个） | auto OK；precheck OK；detect 16 框架（补全 13 个） |
| yudao-cloud | Spring 微服务电商 | 5564 java | auto 崩溃；precheck 失效；detect 0 框架（8 项技术栈全漏） | auto OK；precheck OK；detect 19 框架（含新增 druid） |

---

## 2. Bug #1 [P0 阻断]：auto 档默认入口 SIGPIPE 崩溃

### 现象
`generate-skill.sh`（默认 `--profile auto`）在所有 5 个项目上 exit 141，0 文件生成。auto 是默认档，意味着范式开箱即用即崩溃。

### 根因（`bash -x` 逐行追踪确认）
`generate-skill.sh` L17 `set -euo pipefail` + L652-654 内联形态判定：
```bash
find "$PROJECT_DIR" -type f \( -name "*.vue" ... \) 2>/dev/null | head -1 | grep -q . && _forms=$((_forms+1))
```
`find` 产生大量输出被 `head -1` 截断 → `find` 收 SIGPIPE 退出 141 → `pipefail` 使管道返回 141 → `&&` 链非零 → `set -e` 触发脚本退出。

作者 L641 注释已自述为"全库已知坑"（pipefail 下 grep|head 的 SIGPIPE(141) 会让 if 管道直接误判），但只给 `_sig` 那行（L653）加了 `|| true`，L652-654 的形态判定行未兜底。

### 修复
- `generate-skill.sh` L652-654：`find ... | head -1 | grep -q .` → `find ... -print -quit 2>/dev/null | grep -q .`（find 原生首匹配即停，无管道无 SIGPIPE）
- `auto_detect_profile` 函数 L585-593 同类模式同步修复
- `cost-report.sh:41`、`state-machine.sh:73`、`framework-gates/*.sh`（24 文件 69 行）的 `grep|head` 加 `|| true`
- L657 文件计数 `find|head -81|wc -l` → `find|wc -l`（全量计数无截断）

### 验证
5/5 项目 auto 档 exit 0，正确生成 58 文件骨架。

### 严重度修正
framework-gates 的 SIGPIPE 实际被 `check_framework` 的 `|| true`（gates-warn.sh:1249）兜住，不会崩溃 precheck，只会导致单框架检查不完整。仍加固以保证门禁完整性 + 跨平台（Linux CI grep SIGPIPE 行为差异）。

---

## 3. Bug #2 [P0 阻断]：standard 骨架 precheck 全失效

### 现象
standard 骨架跑任何 precheck 命令（`--all`/`--all-full`/`--scope`）都 exit 1 且无输出（4/4 项目复现）。

### 根因
`precheck.conf:36` 是 conf 文件最后一条语句：
```bash
[[ -f "$_conf_self_dir/precheck.compliance.conf" ]] && source "$_conf_self_dir/precheck.compliance.conf"
```
standard 档无 compliance.conf → `[[ -f ]]` 返回 false → 整行返回 1 → 成为 `source precheck.conf` 的返回值 → precheck.sh 在 `set -e`（L27）下 source conf 后立即退出。

`precheck.sh:283-287` source conf 时只 `set +u` 未 `set +e` 也未 `|| true`；`generate-skill.sh:219-222` 同类。

### 修复
- `precheck.conf:35-36`：`[[ -f ]] && source` 末尾加 `|| true`
- `precheck.sh:286`：`source "$_CONF_DIR/precheck.conf" || true`
- `precheck.sh:513`：gates source 同类加 `|| true`
- `generate-skill.sh:221`：`. "$conf" || true`

### 验证
standard 骨架 `precheck --all` 正常输出 64 行门禁结果（check_branch 检测分支名、check_scope 通过、check_sensitive 通过等）。修复前完全无输出。

---

## 4. Bug #3 [P1 严重]：detect-frameworks.sh 框架探测错乱

### 现象
- yudao-cloud 探测 0 框架（8 项技术栈全漏）
- whatsmars 仅 3 框架（漏 dubbo/rocketmq/sharding/es/spring-boot 等 12 个）
- slash-admin 误报 nextjs（i18next 包名含 next 子串）

### 三个子根因

**① pom 信号用 groupId 但只提取 artifactId**
31 个 pom 信号中 27 个 pattern 是 groupId（如 `org.apache.dubbo`），但 L136 只 grep `<artifactId>` 内容（如 `dubbo-spring-boot-starter`），不含 groupId → 27 个信号永不匹配。

**② file_type 字段被忽略**
L161 循环读 `ftype` 变量却从不使用，所有语言依赖混进一个 `_all_deps` 字符串 → pyreq 信号 `mybatis|mybatis|pyreq` 错误匹配 Java pom 的 `mybatis-spring-boot-starter`（跨语言误匹配）。

**③ 无单词边界 + 不递归子模块**
`nextjs|next|pkgjson` 的 `grep -qF "next"` 匹配 `i18next`；依赖收集只读根 `pom.xml`/`package.json`，不递归子模块 → yudao-cloud 根 pom 是聚合 pom 无依赖 → 全漏。

### 修复（4 处改动，集中单文件）
1. **提取逻辑**：pom 同时提取 `<groupId>` 和 `<artifactId>`（`sed -E` 兼容 BSD，修复 `\?` BRE 不支持 + `\s` BSD 不识别）
2. **file_type 分桶**：按 file_type 分桶收集（`_pom_deps`/`_pkgjson_deps`/...），匹配时只在该桶内 grep
3. **递归子模块**：`find "$PROJ" -name pom.xml -not -path '*/target/*'` 递归扫描（package.json 同理，排除 node_modules）
4. **单词边界**：pkgjson 短词用 `grep -qE "(^|/|@)${pattern}($|-|/|@|\.|_)"` 消除子串误报

### 验证
| 项目 | 修复前 | 修复后 |
|---|---|---|
| yudao-cloud | 0 框架 | 19 框架（含 druid） |
| whatsmars | 3 框架 | 16 框架 |
| slash-admin | 误报 nextjs | nextjs 消除 |

---

## 5. 附带修复：druid/celery/flink 收录

- **celery/flink 信号缺失**：有规则文件+gate 但 detect-frameworks 信号表无探测信号，永不自动识别。补 `celery|celery|pyreq/pyproject`、`flink|org.apache.flink|pom`+`flink-python|pyreq`
- **druid 整个体系未收录**（用户明确点名的后端技术栈）：新增 `references/frameworks/druid.md`（10 规律/4 门禁/六段结构，覆盖连接池参数/SQL 防火墙/StatViewServlet 暴露/慢 SQL）+ `assets/framework-gates/druid.sh`（4 门禁：statview_expose fail/wall_filter warn/datasource_pool warn/slow_sql warn）+ detect 信号
- **elasticsearch 补 `elasticsearch-java|pom` 兜底信号**
- facts.conf/SKILL.md/README/USAGE/PROMO/CLAUDE/standards-compliance：61 框架→62，141 变量→142，self-check 全绿

---

## 6. 回归验证（阶段 B）

5 项目复测 3 个 bug 修复：

| 测试项 | 修复前 | 修复后 |
|---|---|---|
| auto 档生成骨架 | 5/5 exit 141 | 5/5 exit 0（58 文件） |
| precheck --all 输出 | 4/4 无输出 exit 1 | 5/5 有门禁输出（64 行） |
| detect-frameworks 准确 | yudao 0/whatsmars 漏 12/slash 误报 | 全部准确 |

---

## 7. 端到端验证（阶段 C）

对 5 个项目做完整端到端：生成骨架 → AI 探查填充特征卡 P0 + 构件库清单 → 框架注入 → 门禁实跑 → verify-completeness。

### 汇总矩阵

| 项目 | 骨架生成 | AI 填充 | 框架注入 | 门禁实跑 | verify 零占位符 | 备注 |
|---|---|---|---|---|---|---|
| RuoYi-Vue3 | ✅ auto 58 文件 | ✅ codebase/reference-manual(172行构件表)/dev-guide/precheck.conf | ✅ vue/element/vite | ✅ vue 检出 script_setup/vhtml/Options API 真实问题 | ✅ 零占位符确认 | 子代理完整填充 |
| slash-admin | ✅ auto 58 文件 | ✅ codebase(React19/antd5版本表)/reference-manual(111行) | ✅ react/antd/vite/tailwind | ✅ | ⚠️ workflow/release 残留占位 | 子代理部分填充(rate limit) |
| mall-admin-web | ✅ auto 58 文件 | ✅ codebase/dev-guide/precheck.conf | ✅ vue/element/vite | ✅ | ⚠️ workflow 残留占位 | 子代理部分填充(rate limit) |
| whatsmars | ✅ auto 58 文件 | ✅ codebase/reference-manual(76行后端构件表)/dev-guide | ✅ spring-boot/mybatis 等 | ✅ | ✅ 零占位符确认 | 子代理完整填充 |
| yudao-cloud | ✅ auto 58 文件 | 手动聚焦 system 模块 | ✅ 含 druid(5 框架) | ✅ **druid 检出真实问题** | draft | 子代理 rate limit 失败,手动补 druid 门禁验证 |

### yudao-cloud druid 门禁实跑（重点验证新增 druid 规则）

druid 门禁在 yudao-cloud 真实配置上检出 **1 fail + 2 warn**：

| 门禁 | 级别 | 检出 | 合理性 |
|---|---|---|---|
| fw_druid_statview_expose | fail | StatViewServlet 已注册但缺 login-username/login-password | ✅ 真实安全问题（CWE-200 监控面板无鉴权暴露） |
| fw_druid_wall_filter | warn | druid.filters 不含 wall | ✅ 真实风险（MyBatis ${} 无 JDBC 层拦截） |
| fw_druid_datasource_pool | warn | min-idle≠initial-size + keep-alive 未显式 true | ✅ 真实配置问题（连接抖动 + DB 断连风险） |
| fw_druid_slow_sql | pass | slow-sql-millis 与 log-slow-sql 已配套 | ✅ 正确放行 |

**结论**：新增的 druid 门禁在真实 Spring 微服务项目上有效检出真实配置问题，fail/warn 判定合理。

### RuoYi-Vue3 vue 门禁实跑

vue 门禁检出 RuoYi 真实代码问题：
- `fw_vue_script_setup` fail：1 个 SFC 用非 `<script setup>`（Legacy.vue）
- `fw_vue_no_options_api` fail：SvgIcon 用 Options API
- `fw_vue_vhtml_sanitize` fail：HeaderSearch/DetailView 用 v-html 未配 sanitize
- `fw_vue_vfor_index_key` warn：多处 v-for 用 index 作 key

**结论**：门禁在真实项目上有效检出代码规范问题，非空跑。

### druid fixture 双态测试

新增 druid fixture（violating + compliant），62/62 框架 fixture 全绿。

**fixture 调试中发现的一个 bug**：druid.sh 最初用 `cat` 合并配置文件，注释行里的关键词（如 `# 故意缺 login-username`）被误判为配置存在。修复为 `grep -vE '^[[:space:]]*#'` 剥离注释行。这是真实项目测试暴露的 fixture 测试盲区——fixture 的注释写法与真实配置不同，说明 **fixture 测试不能完全替代真实配置测试**。

### 端到端发现的问题

1. **子代理 rate limit**：5 个并行子代理中 3 个（mall/slash/yudao）因 provider rate limit 部分失败或完全失败。这不是范式问题，是测试基础设施限制。建议后续端到端测试串行或分批。
2. **slash-admin/mall workflow.md 残留占位符**：子代理填充了 codebase/reference-manual 但未填 workflow.md。这反映 AI 填充 workflow.md（八节点 10 要素）工作量较大，需更长上下文。不是范式 bug。
3. **druid.sh 注释剥离**：上述 fixture 调试发现的 cat→grep -v 修复，已合入。

---

## 8. 范式定位的实证修正

基于真实项目测试数据，范式定位（docs/paradigm-positioning.md）的适用/不适用场景得到实证：

- **适用场景验证**：yudao-cloud（5564 文件微服务）修复后正确识别 19 框架 + druid 门禁实跑检测真实配置问题 → 范式对中大型微服务项目有效
- **自适应验证**：auto 档在 5 项目上正确判定 profile（前端项目 standard，含合规信号会升 compliance）
- **fixture 测试的局限**：61 框架双态 fixture 全绿但未发现这 3 个 bug，因为 fixture 用构造的最小样例，bug 在真实项目的大文件量/多模块/跨语言场景才触发。**建议**：R10 起增加真实项目冒烟测试（至少 1 前端 + 1 后端多模块）

---

## 9. 后续优化建议

1. **真实项目冒烟测试入 CI**：在 fixture 双态测试之外，增加真实项目冒烟（auto 档生成 + precheck --all 有输出 + detect 准确），防止回归
2. **detect-frameworks 信号表自动化**：当前信号表手维护，易漏（celery/flink 曾漏）。建议 gen-framework-index.sh 同时校验"有规则文件但信号表缺"的情况
3. **set -e + pipefail 的系统性防御**：本次 SIGPIPE 坑遍布多个文件。建议 lint 规则：`find|head`/`grep|head` 模式必须加 `|| true` 或用 `-print -quit`/`-q` 替代

---

## 10. 端到端暴露的新问题（RuoYi-Vue3 子代理报告）

RuoYi-Vue3 完整端到端验证（子代理 93 tool_uses）通过，但暴露了 2 项 P1 门禁准确性问题：

### P1-1: `_fw_resolve_globs` 仅展开 `**` glob，简单 `*.ext` 后缀 glob 静默失效

- **现象**：`VUE_PINIA_FILE_GLOBS=("src/store/modules/*.js")` 会被当作字面路径 `[[ -e ]]` 判定 → 空 → 门禁误报"VUE_PINIA_FILE_GLOBS 未配置或无文件可检"
- **根因**：`_fw_resolve_globs`（precheck.sh:1525）只展开含 `**` 的 glob，不含 `**` 的 `*.js` 后缀 glob 不展开
- **影响**：用户自然写法 `src/store/modules/*.js` 触发假 warn
- **建议**：对无 `**` 的 glob 用 `compgen`/`shopt -s nullglob` 兜底展开，或在门禁头注释明示"glob 须含 `**`"

### P1-2: `fw_vite_inject_clean` 对无 inject 脚本项目无降级

- **现象**：VITE_INJECT_SCRIPT 指向非 inject 文件（如 vite/plugins/index.js）时 fail
- **根因**：门禁假定 VITE_INJECT_SCRIPT 指向支持 `--clean` 的 inject.mjs，但无 inject 脚本的项目缺降级路径
- **建议**：VITE_INJECT_SCRIPT 为空时 skip（而非 fail），或检测目标文件非 inject.mjs 时降为 warn

### P2: `fw_vite_alias_array_form` 把对象形式 alias 判 fail

- 对象形式 alias 是 vite 合法用法，建议降为 warn 或仅当存在顺序敏感别名时 fail

### P3: `--inject-frameworks` 注入的 TODO 占位符覆盖盲区

- `--inject-frameworks` 自动注入的 `ELEMENT_SRC_GLOBS=()  # TODO(framework-gates)` 占位符落在 precheck.arch.conf，而 verify-completeness 只扫 precheck.conf（不扫 arch.conf）
- 建议：verify-completeness 把 precheck.arch.conf 纳入扫描，或注入时直接填项目默认 glob

### 门禁合理性正面验证

- vue 门禁：检出 RuoYi 的 SvgIcon 用 Options API、HeaderSearch 用 v-html 未配 sanitize —— **真实代码问题，判定精准**
- element 门禁：0 fail + 9 warn（全量引入 ElementPlus 等）—— **克制得当，已知架构决策不升级为 fail**
- 构件库计数核验：views 50/50、components 29/29、store 8/8、api 19/19 —— **零偏差，全量枚举达标**

**结论**：修复后的范式在真实项目上端到端可用，门禁在真实代码上有效检出问题。P1-2/P1-2 项门禁准确性问题值得后续修复，但不阻断范式可用性。

---

## 11. P1/P2 门禁准确性问题修复（第二批）

端到端暴露的 P1-1/P1-2/P2 三个门禁准确性问题，在 whatsmars 和 slash-admin 两个项目独立触发，属普遍问题，本批次修复。

### P1-1 修复：`_fw_resolve_globs` glob 展开盲区

- **现象**：RuoYi 和 whatsmars 均报告——`VUE_PINIA_FILE_GLOBS=("src/store/modules/*.js")` 等**不含 `**` 的后缀 glob** 被当作字面路径 `[[ -e ]]` 判定 → 永远 false → 门禁假 warn "未配置或无文件可检"
- **根因**：`_fw_resolve_globs`（precheck.sh:1057）只对含 `**` 的 glob 做 `find` 展开，不含 `**` 的 `*.js` 后缀 glob 走 `[[ -e "$g" ]]` 字面判定
- **修复**：无 `**` 的 glob 若含通配符（`*`/`?`/`[`），用 `compgen -G` 在 cwd（=PROJECT_DIR）下展开；纯路径仍用 `[[ -e ]]`
- **验证**：RuoYi `src/store/modules/*.js` 正确展开 7 个 store 文件；62/62 fixture 回归全绿

### P1-2 修复：`fw_vite_inject_clean` 对无 inject 脚本项目无降级

- **现象**：RuoYi 把 `VITE_INJECT_SCRIPT` 填为 `vite/plugins/index.js`（非 inject 脚本），门禁 grep 不到 `--clean` 直接 fail
- **根因**：门禁假定 VITE_INJECT_SCRIPT 指向 inject.mjs，未区分"是 inject 脚本但缺 --clean"（真问题）与"指向非 inject 文件"（误配/无 inject 需求）
- **修复**：先判定目标文件是否 inject 脚本（文件名含 inject 或内容含 inject/transform/replace 特征）；是 inject 但缺 --clean 才 fail，非 inject 文件降为 warn（可能误配，提示置空该变量）；级别 fail→warn
- **验证**：62/62 fixture 回归全绿（vite fixture 双态不变）

### P2 修复：`fw_vite_alias_array_form` / `fw_vite_alias_order` 对象形式过严

- **现象**：RuoYi 用对象形式 alias（Vite 合法用法 `resolve.alias: Record<string,string>`），门禁 fail 要求数组形式
- **修复**：对象形式降为 warn（提示数组保证顺序更佳，但不 fail）；alias_order 在对象形式下无法判定顺序，降为 warn；完全无 alias 配置才 fail；级别 fail→warn
- **验证**：62/62 fixture 回归全绿

### whatsmars 端到端补充结果（子代理 103 tool_uses）

whatsmars（Spring Boot 3.5 多模块，16 框架）完整端到端通过：
- 零占位符确认 + mark-active 成功
- spring-boot 门禁检出真实 bug：2 文件残留 `javax.annotation.PostConstruct`（Boot 3.x 须 jakarta 迁移，否则启动期 NoClassDefFoundError）+ @Transactional 同类自调用
- mybatis 门禁检出 Mapper 接口数(4) ≠ XML namespace 数(3)
- **独立确认 P1-1 普遍性**：whatsmars 报告 SRC_GLOBS 以 `**` 开头时 `_fw_resolve_globs` 拆 `**` 后 dir 为空，须改 `./**/` 前缀——与 RuoYi 的 `*.ext` 后缀盲区同源（glob 展开缺陷），P1-1 修复覆盖两类场景

### slash-admin 端到端补充结果（子代理 121 tool_uses）

slash-admin（React19+antd5+Vite6）完整端到端通过：
- 构件库计数核验 100% 覆盖（pages 85/85、components 71/71、ui 34/34 等 8 维度）
- react 门禁检出真实问题：useEffect 无依赖数组、直接 mutate state（search-bar.tsx push）
- antd 门禁 0 fail + 2 warn（全量 import + Typography ellipsis 手写截断）——克制得当
- `--reuse` 门禁通过：新增 ProductPage/productService/Product 与 §4 稳定单元无重名，范式成功阻止重复造轮子
- **发现 4 项范式侧可改进点**（非阻断）：arch.conf 覆盖陷阱（ACTIVE_FRAMEWORKS 须填 arch.conf 非 precheck.conf）、fw_react_server_client_boundary 对 CSR SPA 误报（41 文件）、ErrorBoundary/forwardRef 漏检——记入后续优化

### 修复验证

| 修复项 | 修复前 | 修复后 | fixture 回归 |
|---|---|---|---|
| P1-1 glob 盲区 | *.ext glob 假 warn | compgen 展开 | 62/62 绿 |
| P1-2 vite inject | 非 inject 文件 fail | 降 warn + 特征判定 | 62/62 绿 |
| P2 vite alias | 对象形式 fail | 降 warn | 62/62 绿 |

self-check 全绿（62 框架 / 142 变量 / 五文档头部一致 / framework-signal-index 同步）。

---

## R10 待测品类（样本偏倚缓解计划）

R9 的 5 个样本清一色 Java/JS Web 后台，品类单一。为缓解幸存者偏差，立 R10 待测项，目标是在 ≥3 个非 Java/JS 品类上复现"detect-frameworks 准确 + auto 档不崩溃 + 至少 1 个真实 bug 被门禁拦截"。

| 品类 | 候选样本 | 验收点 | 状态 |
|------|---------|--------|------|
| 嵌入式 C | zephyr-rtos 子模块 / NuttX 子树 | detect-frameworks 识别 RTOS/驱动框架；C 门禁（如有）拦截真实缺陷 | 未测 |
| 科学计算 notebook | jupyter 教学仓 / kaggle 竞品仓 | notebook 形态判定；数据流门禁（如有）可用 | 未测 |
| 单体内核 | Linux driver 子树 / Redox 子模块 | 大文件量下 auto 档不崩溃；C 门禁可用 | 未测 |
| Rust 系统编程 | tokio 子 crate / axum 子模块 | cargo/detect 准确；Rust 门禁可用 | 未测 |

**验收阈值**：每个品类至少 1 个样本通过"detect-frameworks 准确 + auto 档不崩溃"；其中 ≥1 个品类须复现"门禁拦截真实历史 bug"（与 verifier/v2 外部有效性立项对齐，见 `verifier/v2/external-validity.md`）。

**未达此阈值前**：README/PROMO 中"守护代码合规""54 门禁守护分支质量"等断言应限定为"在 Java/JS Web 品类上验证"，不得外推为普适断言。

**欢迎社区补充样本**：提 issue 标注 `R10-品类测试` 并附候选仓库，附已知历史 bug commit 更佳。
