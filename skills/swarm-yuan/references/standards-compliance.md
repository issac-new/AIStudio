> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 标准合规映射矩阵（standards-compliance）

# 标准合规映射矩阵（standards-compliance）

> 证据基线：仓库根 `docs/research/` 质量与安全标准两份调研报告（2026-07-20，条款号均出自该两报告，禁止虚构）；门禁语义基线：`swarm-yuan/assets/precheck.sh`（56 门禁 = FULL 50 + advisory-only 6；FULL 50 = 标准 29（核心 11+架构 18）+ 合规 19 + FULL-only 2（decision/state-phase））与 `swarm-yuan/assets/precheck.conf`。
> **口径权威源**：`../assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。

## 本文件作用与用法

本文件是目标技能的**标准立法层**：把门禁体系与中国/国际软件工程、安全标准的条款建立显式映射，回答「每个门禁对应哪条标准、测量什么、阈值多少、产出什么证据」（对齐 GB/T 28448-2019 测评单元「指标→对象→实施→判定」四要素与 GB/T 25000.21/.30 测度元素「特性/测量函数/阈值/证据」四元组）。

用法：

1. **机器校验**：`precheck.sh --compliance` 门禁以本文件为校验对象——逐一检查 §A–§F 共 6 个锚点标题（冻结契约，一字不得改）存在、全文无占位标记残留；`SPEC_FILE` 存在时同时校验 spec 含「## 22. 标准合规」段。矩阵缺失或锚点不全即 fail。
2. **配置入口**：`precheck.conf` 标准合规段 16 变量（`COMPLIANCE_MATRIX_FILE` / `DOCS_PACK_PROFILE` / `SBOM_REQUIRED` / `PRIVACY_SCAN_DIRS` 等）驱动 §C/§D/§E 对应的 `--docs-pack` / `--sbom` / `--privacy` 门禁；「长期清单收口」段 8 变量（`RTM_REQUIRED` / `RTM_MATRIX_FILE` / `RTM_MATRIX_REQUIRED` / `RELEASE_SIGN_REQUIRED` / `RELEASE_ARTIFACTS_GLOB` / `RELEASE_SIGN_TOOL` / `RELEASE_PROVENANCE_REQUIRED` / `RELEASE_PROVENANCE_FILE`）驱动 `--rtm` / `--release-sign`。
3. **人工引用**：生成目标技能 时，AI 在 spec §22.1 剪裁声明中引用本矩阵（§B 附录 A 示例）；安全豁免按 §F 格式登记；验收（verifier）按 §D/§E 的「缺口」标注判断哪些标准条款当前无门禁覆盖、须人工兜底。
4. **姿态约定**（与计划铁律一致）：新门禁未配置时静默跳过；安全类门禁启用后 fail-closed；豁免必须留痕（§F）；既有标准门禁的判定语义与输出行不因本文件而改变。

---

## A. GB/T 25000.51 八特性 × 门禁映射

依据 GB/T 25000.51-2016（RUSP）§5.2 用户文档集要求、§5.3 软件质量要求（八特性，与 GB/T 25000.10-2016 质量模型一致），将 56 个门禁按八特性逐行登记；「测量函数/阈值/证据」列对齐 GB/T 25000.21-2019 测度元素格式（本文件即「门禁级四元组登记」的落地）。特性名同时标注 ISO/IEC 25010:2023 双轨命名（国标尚未跟进 2023 版）。

### A.1 功能适合性（Functional Suitability）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 功能适合性 | `--build`（check_build） | 构建命令执行退出码 | 退出码=0；未配置 BUILD_CMD 跳过（fail-open 已知，conf lint 收口缺口） | 终端 pass/fail 行 + 构建输出尾部 10 行 |
| 功能适合性 | `--test`（check_test） | 测试命令执行退出码 | 退出码=0；未配置 TEST_CMD：探到测试文件 → warn「测试体系存在但 TEST_CMD 未配置」，确无测试文件才安静跳过 | 终端 pass/warn/fail 行 + 测试输出尾部 20 行 |
| 功能适合性 | `--consistency`（check_consistency） | 可改目录内重复写入点计数（INSERT/create 粗筛） | >5 处 → warn 要求确认幂等性 | pass/warn 行 + 「无多漏错重」核对提示（人工核对清单） |
| 功能适合性 | `--framework`（check_framework） | 81 规则集 `_fw_<id>_<rule>` 逐条判定计数 | 任一规则 fail 即 fail；`ACTIVE_FRAMEWORKS` 空 → 静默跳过 | 各框架规则 fail 行（稳定 id）+ 81/81 fixture 绿 |

差距登记：需求↔测试追溯（RTM）—— 已覆盖（`--rtm` 门禁挂接：spec REQ- 编号须在测试目录或追溯矩阵可追溯，`RTM_MATRIX_REQUIRED=1` 时矩阵缺失 fail-closed）。

### A.2 性能效率（Performance Efficiency）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 性能效率 | `--link-depth`（check_link_depth） | 调用链最长路径深度（graphify → madge → 启发式纯转发函数统计，三级降级） | >MAX_LINK_DEPTH → warn（不 fail，深度可能合理）；纯转发函数 >5 → 提示 | warn 行 + 降级路径说明；GNU-only 兜底失效为已知缺陷（可移植兜底缺口） |

差距登记：性能密度度量（弱点密度/趋势）—— 缺口；框架门禁内 redis/kafka 性能规律属 `--framework` 已覆盖部分。

### A.3 兼容性（Compatibility）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 兼容性 | `--deps`（check_deps） | 依赖清单文件（package.json/pyproject.toml/go.mod/requirements.txt/Cargo.toml/pom.xml/build.gradle）版本 vs codebase.md 基线比对计数 | 版本变更且 spec 无版本约束声明 → fail（硬门禁）；无基线文件 → warn 返回 | fail 行（依赖名+基线/当前版本）+ spec 声明段 |

差距登记：actuator 嵌套 YAML 支持（spring-boot 框架门禁判定面）—— 缺口。

### A.4 易用性（ISO 25010:2023 = 交互能力 Interaction Capability）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 易用性 | `--docs-pack`（check_docs_pack） | profile 必备文档存在性计数 + 文档内占位标记扫描 | DOCS_PACK_PROFILE 空 → 静默跳过；缺必备文档 → fail（`gate_docs_pack_missing:<file>`）；含占位标记 → fail（ALLOW_TBD=1 降级 warn） | fail/warn 行 + 必备清单逐项结果；对应 GB/T 25000.51 §5.2 用户文档集 + §6 测试文档集（计划/说明/结果） |
| 易用性 | `--diagram`（check_diagram） | reference-manual.md / spec 中可视化图存在性（mermaid 结构图 + echarts/antv 数据图） | 无图 → warn（不 fail） | warn 提示行 |

差距登记：文档包覆盖 —— 已由 `--docs-pack` 补齐；文档结构合规（必备章节比对）—— 缺口。

### A.5 可靠性（Reliability）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 可靠性 | `--shift-left`（check_shift_left） | spec §19 测试设计/§20 变更影响/回滚预案段存在性 + test 先于 impl 提交 + 可观测性埋点计数 | 测试设计段/变更影响段/回滚预案缺失 → fail；可观测性段与埋点缺失 → warn | fail/warn 行 + 三左移分项结果 |
| 可靠性 | `--review`（check_review） | ocr review 输出中 High/Critical 计数 | ≥1 → fail；ocr 未装 → warn 转人工 5 维度清单 | ocr 输出尾部 + fail/warn 行 |
| 可靠性 | `--api`（check_api） | API 定义 version 字段缺失计数 + 写 handler 幂等键/分布式事务模式计数 | 缺 version → fail；无幂等键、检出 2PC → warn | fail/warn 行 |
| 可靠性 | `--service`（check_service） | 多服务共享同一 host+database 计数 + 同步链长度 | 共享 DB → fail；同步链 >MAX_SYNC_CHAIN、无网关/透传/Outbox → warn | fail/warn 行 |

差距登记：故障安全（ISO/IEC 25010:2023 Safety 子特性：故障安全/危险警告）无门禁 —— 缺口。

### A.6 信息安全性（Security）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 信息安全性 | `--security`（check_security） | 10 模式族命中计数：SQL 注入/命令注入/eval/XSS 拼接/硬编码密钥/TLS 关闭（6 类硬）+ 路径穿越/弱哈希/CORS */调试模式（4 类 warn） | 硬类 ≥1 → fail；MyBatis `#{}` 安全跳过、`${}` 白名单 warn | fail/warn 行（文件:行号:内容） |
| 信息安全性 | `--sensitive`（check_sensitive） | SCAN_DIRS 内 9 类密钥/连接串正则命中计数 | ≥1 → fail；SCAN_DIRS 空 → warn「未配置未执行（fail-open 风险）」 | fail/warn 行 |
| 信息安全性 | `--domain`（check_domain） | 客观规律违规计数：密码明文存储/SQL 拼接（硬）+ 未消毒 v-html/全局可变状态（warn） | 硬类 ≥1 → fail | fail/warn 行 + spec §18 领域分析表检查结果 |
| 信息安全性 | `--privacy`（check_privacy） | PRIVACY_SCAN_DIRS 内 PII 模式（18 位身份证/手机号/银行卡 + 自定义）命中计数 | 未启用静默跳过；启用后 fail-closed：配置目录全不存在 → fail；命中 → fail（`gate_privacy_pii_found:<file>`） | fail/warn 行 + 豁免逐条回显（§F） |
| 信息安全性 | `--sbom`（check_sbom） | SBOM 生成成功性 + 许可证块名单命中计数 | 未启用静默跳过；启用后 fail-closed：无工具且无 lockfile → fail（`gate_sbom_toolchain_unavailable`）；块名单命中 → fail（`gate_sbom_license_blocked:<组件>`） | SBOM 产物（SBOM_OUTPUT_DIR，带时间戳归档）+ fail/warn 行 |

### A.7 维护性（Maintainability）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 维护性 | `--layer`（check_layer） | 层依赖方向违规/领域层框架 import/循环依赖/聚合跨边界引用计数 | 任一 → fail（硬门禁）；未配置 LAYER_DEFS → 静默跳过 | fail/warn 行 |
| 维护性 | `--stable-diff`（check_stable_diff） | STABLE_GLOBS 内改动文件 vs spec MODIFIED 段声明比对 | 改动未声明 → fail（硬门禁） | fail 行 + spec MODIFIED 段 |
| 维护性 | `--reuse`（check_reuse） | spec §5.5 checkbox 勾选率 + 新增单元名 vs reference-manual §4/5/6 重名计数 + 新增导出单元计数 | §5.5 未全勾（<4/4）或重名 → fail；新增导出 >30 → warn；无 spec → 静默跳过 | fail/warn 行 |
| 维护性 | `--adr`（check_adr） | ADR_DIR 存在性 + 新增依赖未入 ADR 计数 + TODO/FIXME 登记检查 | ADR_DIR 缺失 → fail；其余 warn | fail/warn 行 |
| 维护性 | `--contract`（check_contract） | 契约文件 version 字段缺失计数 + 跨上下文 import 绕 ACL 计数 | 任一 → fail（硬门禁） | fail 行 |
| 维护性 | `--consistency-cross`（check_consistency_cross） | glossary 标识符代码中漂移计数 + SoR 表存在性 | warn-only（不 fail）；对应 GB/T 11457 术语一致 | warn 行 |
| 维护性 | `--impact`（check_impact） | spec 影响范围段存在性 + 改动文件消费方反查计数 | 段缺失 → fail；消费方 >3 → warn | fail/warn 行 |
| 维护性 | `--state`（check_state） | store 行数/props 透传处数/派生状态 useState 计数 | >MAX_STORE_LINES、透传 >5 → warn-only | warn 行 |
| 维护性 | `--frontend`（check_frontend） | 组件嵌套深度/props 数/循环依赖/CSS 污染计数 | 循环依赖（madge）→ fail；其余 warn | fail/warn 行 |
| 维护性 | `--cognition`（check_cognition） | 六阶认知链评分（满分 14）+ 五层认知基底总分（满分 22） | 不判违规（warn-only 体检报告）：第一层 ≥8+≥4 规律=完整；总分 ≥15=完整/10–14=部分/<10=不足 | 认知体检报告（终端输出） |
| 维护性 | `--knowledge`（check_knowledge） | 项目知识来源被 SKILL.md 引用率 | 有知识文件但 0 引用 → fail；部分引用 → warn；无知识文件 → 静默跳过 | fail/warn 行 |
| 维护性 | `--branch`（check_branch） | 分支名 vs BRANCH_REGEX、保护分支命中 | 保护分支上开发/命名违规 → fail；非 git/detached → 跳过 | pass/fail 行 |
| 维护性 | `--scope`（check_scope） | git diff 改动落 READONLY_DIRS 计数 | ≥1 → fail；非 git → warn 降级 | fail/warn 行 |

### A.8 可移植性（Portability；ISO 25010:2023 = 灵活性 Flexibility）

无独立门禁。可移植性由范式级铁律承担：三平台兼容（macOS BSD bash 3.2 + Linux GNU bash 4+ + Windows .bat 包装器），编码规则见 references/security-spec.md §六。差距登记：**CI 仅 ubuntu，BSD/bash3.2 分支无验证** —— 缺口（macOS CI 矩阵 + NOBSD 静态检查）；`--link-depth` GNU-only 兜底失效（已知缺陷）。

### A.9 符合性评价（GB/T 25000.51 §7，贯穿八特性）

| 特性 | 门禁 | 测量函数 | 阈值 | 证据 |
|---|---|---|---|---|
| 符合性评价（贯穿） | `--compliance`（check_compliance） | 本矩阵 6 锚点存在性计数 + 全文占位标记计数 + spec「## 22. 标准合规」段存在性 | 矩阵文件不存在（且 COMPLIANCE_MATRIX_FILE 未设）→ 静默跳过；锚点缺失 → fail（`gate_compliance_anchor_incomplete:<锚点>`）；占位标记 → fail；spec 段缺失 → fail | fail/pass 行；对应 GB/T 25000.51 §7.5 符合性评价报告（🟡：verifier 报告格式对齐缺口） |

---

## B. GB/T 8566 过程 × 生成流程映射

GB/T 8566-2022（IDT ISO/IEC/IEEE 12207:2017）第 6 章四大过程组：6.1 协定、6.2 组织的项目使能、6.3 技术管理、6.4 技术。验证过程定「构建了正确的产品」（built right），确认过程定「产品是正确构建的」（right built）。swarm-yuan 生成流程 Step 1-13（编号口径见 references/generation-flow.md）映射如下：

| 生成流程步骤 | 8566-2022 过程组 | 过程定位 | 信息项（留痕证据，附录 B 对齐） |
|---|---|---|---|
| Step 1 自检（15 运行时） | 6.2 组织的项目使能 | 基础设施/工具链就绪 | self-check 运行记录 |
| Step 2 读取项目知识（AGENTS.md/CLAUDE.md/记忆） | 6.2 组织的项目使能 | 知识管理（组织资产复用） | 知识来源清单（入特征卡） |
| Step 3 探查仓库（三路并行+图谱工具） | 6.4 技术过程组 | 利益相关方需求/现状分析 | 探查报告（构件库清单+调用链） |
| Step 4 项目形态判定+详尽构件库清单+调用链路分析（§D.0–§D.5） | 6.4 技术过程组 | 系统/软件需求分析（现状建模） | reference-manual.md 各维表 + 计数核验记录 |
| Step 5 提取 17 项特征卡 | 6.4 技术过程组 | 需求定义（质量需求按特性陈述，对齐 GB/T 25000.10） | codebase.md 特征卡（17 项具体值） |
| Step 6 create 骨架 | 6.4 技术过程组 | 设计/实现启动（合成） | generate-skill.sh 输出 + 骨架文件树 |
| Step 7 AI 填充全部文件 + Step 4 框架深化 | 6.4 技术过程组 | 实现过程（文档/门禁实现） | 六段式文件全量内容（零占位标记） |
| Step 8 AI 配置 precheck.conf | 6.3 技术管理过程组 | 质量保证策划 + 配置管理（测度元素实例化） | precheck.conf 生成期必读文件（197 变量真实值） |
| Step 9 AI 生成 hooks/commands/MCP 集成 | 6.2 组织的项目使能 | 工具链/过程支撑环境 | hooks.json/commands/settings.local.json/.mcp.json |
| Step 10 AI 运行门禁验证（--all → --all-full） | 6.4 技术过程组·验证过程 | built-right 证据 | precheck 输出 + fail 修复重跑记录 |
| Step 4 框架深化：门禁注入（--inject-frameworks） | 6.3 技术管理过程组 | 配置管理（受控变更，幂等+哈希裁决） | precheck.sh 标记区块 + 注入日志 |
| Step 12 AI 写回项目记忆 | 6.2 组织的项目使能 | 知识/信息管理（闭环） | claude-mem/.zcode/memories/.project-knowledge.md |
| Step 13 AI 最终检查（零占位标记+计数核验+框架四要素） | 6.4 技术过程组·确认过程 + 6.3 质量保证 | right-built 证据 | 最终检查清单 + 计数核验偏差记录 |

### 剪裁声明写法示例（GB/T 8566-2022 附录 A 对齐）

8566 不要求特定生存周期模型，但要求组织**显式声明剪裁**并对每个采用过程留信息项证据（经 spec §22 剪裁声明落地）。生成目标技能 时，在 spec「22.1 剪裁声明」段按如下格式填写（示例）：

```markdown
### 22.1 剪裁声明（GB/T 8566-2022 附录 A）

本项目采用 AI 辅助敏捷生存周期，对 GB/T 8566-2022 第 6 章过程组剪裁如下：

- 采用的过程组：6.2 组织的项目使能（知识管理/工具链）、6.3 技术管理（质量保证策划、
 配置管理）、6.4 技术过程组（需求分析/实现/验证/确认）。
- 剪裁掉的过程：6.1 协定过程组——理由：本项目为内部演进式开发，无甲乙双方协定场景；
 对外采购/外包时须恢复并补充协定信息项。
- 剪裁掉的信息项：正式评审会议记录——理由：以门禁运行记录（precheck 输出）+ ADR +
 spec 变更声明替代人工评审留痕；验收测试前须补正式评审记录（GB/T 15532 评审点）。
- AI 过程信息项扩展：prompt 记录、AI 产出 diff、人工复核记录纳入配置管理
 （AI 过程信息项为 8566 信息项的合理扩展，先声明，制度化留后续）。
- 门禁↔过程映射：见 references/standards-compliance.md §A/§B。
```

差距登记：验证/确认双证据——verifier/v1 C1 强、C5/C6 弱（🟡 → C5/C6 断言化缺口）。

---

## C. GB/T 8567+9386 文档包 × 交付物映射

六包交付物（行业惯例归并）× `--docs-pack` 4 个 profile 的必备文档清单。`--docs-pack` 门禁按 profile 逐项检查存在性 + 占位标记清零。

| 交付物包 | 主要标准依据 | profile=rusp（GB/T 25000.51 §5.1/§5.2/§6 内置） | profile=gbt9386（GB/T 9386-2008 §4–§11 内置 4+4） | profile=gbt8567（GB/T 8567-2006 §7，DOCS_PACK_REQUIRED 配置） | profile=custom（DOCS_PACK_REQUIRED 自定义） |
|---|---|---|---|---|---|
| 需求包 | GB/T 8567 §7.1/7.7/7.8/7.11/7.12；ISO/IEC/IEEE 29148:2018 | 产品说明（可用性/功能陈述） | —（9386 不要求需求包） | 可行性分析报告 FAR / 软件需求规格说明 SRS /（按需）系统需求 SSS / 接口需求 IRS / 数据需求 DRD | 由 DOCS_PACK_REQUIRED 逐项声明 |
| 设计包 | GB/T 8567 §7.9/7.10/7.13/7.14 | 产品说明（架构/接口陈述） | — | 系统设计 SSDD / 软件设计 SDD / 接口设计 IDD / 数据库设计 DBDD | 同上 |
| 测试包 | GB/T 9386 §4–§11；GB/T 15532；GB/T 25000.51 §6 | 测试计划 + 测试说明 + 测试报告（RUSP 测试文档集生成期必读文件） | 测试计划（§4）+ 测试设计说明（§5）/测试用例说明（§6）/测试规程说明（§7）+ 测试项传递报告（§8）/测试日志（§9）/测试事件报告（§10）/测试总结报告（§11） | 软件测试计划 STP / 软件测试说明 STD / 软件测试报告 STR | 同上 |
| 部署包 | GB/T 8567 §7.4/7.22/7.23；行业归档惯例 | 产品说明（安装/部署要求陈述） | — | 软件安装计划 SIP / 软件移交计划 STrP / 软件版本说明 SVD / 软件产品规格说明 SPS | 同上 |
| 运维包 | GB/T 8567 §7.23–7.25；GB/T 32424-2015 | 用户文档集（用户手册/操作手册，§5.2） | — | 软件用户手册 SUM / 计算机操作手册 COM / 计算机编程手册 CPM | 同上 |
| 管理包 | GB/T 8567 §7.2/7.17/7.18/7.19/7.20 | 符合性评价报告（§7.5，可挂 verifier 报告） | — | 软件开发计划 SDP / 软件配置管理计划 SCMP / 软件质量保证计划 SQAP / 开发进度月报 DPMR / 项目开发总结报告 PDSR | 同上 |

补充映射：

- **GB/T 15532-2008 准入**：受控基线 + 编译通过 + 文档齐 ↔ `--build`/`--test`（未配置 fail-open，🟡 → conf lint 缺口）。
- **GB/T 15532-2008 准出**：文档齐全、问题有处理、**失效须可见** ↔ SILENT 跳过计数器（`--all-full` 末次汇总打印「调用 N / 跳过 S（清单）/ fail F / warn W」，退出码与既有输出行不改）+ sensitive warn + 安全门禁 fail-closed。
- **ISO/IEC/IEEE 29148:2018**：无占位标记/唯一 ID/可验证/RTM ↔ 占位标记清零校验（`generate-skill.sh --verify-completeness`）+ `--requirements` 需求 lint（TBD/唯一 REQ- ID 严格模式 fail-closed，EARS 覆盖率 warn-only）+ `--rtm` 追溯（REQ- ↔ 测试目录/矩阵双向追溯，矩阵强制可 fail-closed）。

---

## D. 安全标准 × 门禁映射（等保/三法/38674/34943/39786）

条款号以 docs/research/ 安全标准调研报告为准。门禁落点：`--security`（10 模式族）/ `--sensitive` / `--domain` / `--privacy` / `--sbom` / security-spec.md（规范层）。

### D.1 等保 GB/T 22239-2019（二级 7.1.4.x / 三级 8.1.4.x）

| 标准条款 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| 7.1.4.1 a)/b) 身份鉴别（口令复杂度、失败锁定、超时退出） | 口令策略/登录失败处理 | `--security` §6 硬编码密钥 + `--domain` 密码明文检测（部分）；口令策略配置扫描 | 🟡 部分；配置级核查缺口（安全门禁族扩展） |
| 7.1.4.2 访问控制（默认账户/默认口令/最小权限） | 无默认账户、默认口令已改 | security-spec.md 清单（规范层）；默认凭据字典扫描 | 🟡 缺口 |
| 7.1.4.3 安全审计（字段完整/防删改） | 审计记录含时间/主体/客体/结果 | `--shift-left` 运维监控左移（日志结构化段，部分） | 🟡 部分；日志 schema lint 缺口 |
| 7.1.4.7 数据完整性 | 校验/密码技术保证传输存储完整性 | `--security` §8 TLS 验证关闭检测（部分） | 🟡 部分 |
| 7.1.4.10 剩余信息保护 | 敏感数据释放前完全清除 | 无（Cache-Control/会话清除检查） | 🟡 缺口 |
| 7.1.4.11 个人信息保护 | 仅采集必需信息、禁未授权访问 | `--privacy`（PII 扫描 + fail-closed + 豁免留痕） | ✅ 已覆盖 |
| 8.1.4.1 d) 三级身份鉴别（双因素，至少一种密码技术） | 双因素认证 | 无 | ❌ 缺口（等保/国密 profile） |
| 8.1.4.8 三级数据保密性（密码技术保证传输+存储保密） | 加密传输/加密存储 | `--security` §8 TLS 检测（传输，部分） | 🟡 部分；存储加密核查缺口（国密/等保 profile） |
| 三级安全方案设计须含密码技术内容并形成配套文件 | 密码方案文档 | spec §22.4 密评登记（模板层） | 🟡 文档层登记；核查缺口 |

### D.2 三法 + GB/T 35273-2020

| 法律/标准条款 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| 网络安全法 §21（三） | 网络日志留存不少于六个月 | `--shift-left` 可观测性段（日志规范，部分） | 🟡 部分；留存配置核查缺口 |
| 网络安全法 §21（四） | 数据分类、重要数据备份和加密 | `--security`（加密，部分）+ security-spec.md | 🟡 部分 |
| 数据安全法 §27 | 全流程数据安全管理制度 + 技术措施 | `--security`/`--sensitive`（技术措施，部分） | 🟡 部分；制度文档挂 `--docs-pack` custom |
| 数据安全法 §29 | 漏洞风险监测、立即补救 | `--review` + framework 安全规律（部分） | 🟡 部分 |
| 个人信息保护法 §51（三） | 加密、去标识化等安全技术措施 | `--privacy`（PII 检出 fail）+ `--security` | ✅🟡 主体覆盖；去标识化函数核查缺口 |
| 个人信息保护法 §55 + GB/T 35273-2020 11.4 c) | **发布前**个人信息保护影响评估（PIA），报告留存 | spec §22.4 PIA 登记（模板层）+ `--privacy` 门禁 | ✅🟡 登记+门禁；PIA 报告签署状态核查缺口 |
| GB/T 35273-2020 11.2 | 个人信息安全工程（Privacy by Design） | `--privacy` | ✅🟡 |
| GB/T 35273-2020 9.7 | 第三方接入（SDK/API）管理机制 | `--sbom`（成分清单） | ✅🟡 |

### D.3 GB/T 38674-2020（应用软件安全编程指南）

| 标准条款 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| §5.1 数据清洗（输入验证/输出净化） | 注入类防护 | `--security` §1 SQL 注入/§2 命令注入/§4 XSS + `--domain` SQL 拼接 | ✅ 同构覆盖 |
| §5.2 数据加密与保护 | 加密保护 | `--security` §7 弱哈希 warn/§8 TLS fail | 🟡 部分 |
| §5.3 访问控制 | 访问控制实现 | 无服务端授权覆盖门禁 | 🟡 缺口（授权类门禁，CWE-862/863） |
| §5.4 日志安全 | 日志不泄密 | `--sensitive`（密钥扫描，部分） | 🟡 部分 |
| §8.1 第三方软件使用安全 | 引入前安全评估 | `--sbom`（许可证）+ `--deps`（版本锁定） | ✅🟡 许可证层覆盖；CVE 阈值门禁缺口（SCA） |

### D.4 GB/T 34943/34944/34946-2017（源代码漏洞测试规范系列）

| 标准条款 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| GB/T 34943-2017 6.2.3.x（C/C++ 漏洞分类，如 6.2.3.6 缓冲区溢出危险函数） | 危险函数禁用 | framework 语言规则（部分） | 🟡 部分；危险函数 lint 缺口 |
| GB/T 34944-2017 6.2.6.3（口令硬编码） | 无硬编码密钥/口令 | `--security` §6 + `--sensitive` | ✅ 覆盖 |
| GB/T 34944-2017 6.2.6.7/6.2.6.18（危险加密算法/无盐散列） | 禁用 MD5/SHA1/DES | `--security` §7 弱哈希（warn） | 🟡 部分（warn 级） |
| 系列共性（总则 §5）：SAST + 人工复核 + 测试四件套报告 | 扫描+复核+报告 | `--security`（SAST 词法层）+ `--review`（人工复核）+ `--docs-pack` 测试包 | 🟡 部分：流程已覆盖；CWE 轻量映射已建（`security-spec.md` §5.1 参考表），完整 CWE 元数据分级（676 子门禁逐条标注）仍缺口 |

### D.5 GB/T 39786-2021（密评）+ 其余登记

| 标准条款 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| GB/T 39786-2021 8.4（三级应用和数据安全：身份鉴别/重要数据机密性/完整性/不可否认性） | SM2/3/4 国密算法保护 | `--crypto`（CRYPTO_PROFILE=gm：弱算法 MD5/SHA1/DES/RSA-1024/ECDSA → fail，国密白名单 SM2/SM3/SM4） | ✅🟡 词法层覆盖（机构密评测评仍属线下） |
| GB/T 39786-2021 8.7（三级建设运行：运行前密评通过） | 密评证明登记 | spec §22.4 密评登记（模板层） | 🟡 文档层登记 |
| GB/T 28448-2019（测评单元四要素：指标→对象→实施→判定） | 结构化测评证据 | 本矩阵四元组列；门禁运行记录落盘 | 🟡 本文件登记；落盘 `.swarm-yuan/gate-runs/` 缺口 |
| GB/T 18336（CC/EAL1–7：配置管理/交付/测试/缺陷纠正证据分级） | 交付物完备度分级 | 无对应；EAL↔verifier 等级语义文档层登记（EAL3 ≈ 系统化测试+检查 ≈ verifier/v1 验收套件） | ❌ 缺口（仅本行登记；制度化留后续） |
| GB/T 39204-2022 §7.9 j)（关基：定制软件源代码安全检测报告） | SAST 报告归档 | `--security` 扫描（终端输出，无归档） | 🟡 缺口（gate-runs 落盘） |
| ISO/IEC 27001:2022 A.8.25–A.8.33（安全 SDLC/编码/测试/环境分离） | 安全开发控制 | `--security`+`--sensitive` 部分覆盖；A.8.31 环境分离无检 | 🟡 缺口（privacy/sensitive 深化） |
| 工具链许可证（GitNexus=PolyForm Noncommercial 禁商用） | 商用合规 | 无门禁；GitNexus 降级 + graphify(MIT) 提默认 | ❌→已修复（文件层） |

---

## E. 国际工程标准映射（ISO 5055/SSDF/ASVS/SBOM-SLSA）

已覆盖的挂门禁，未覆盖的标注「缺口」。

### E.1 ISO/IEC 5055:2021（自动化源代码质量度量，138 弱点映射 CWE）

| 标准要求 | 门禁映射 | 状态 |
|---|---|---|
| 可靠性/安全性/性能/可维护性四特性弱点静态计数 | `--security` 10 模式族 + framework 81 规则集（词法层 grep） | ✅ 仓库实际涉及的 60 个唯一 CWE 全量元数据已建（`references/cwe-database.md`，6 维分级：CWE 编号/名称/OWASP/严重度/ISO 5055 四特性/检查点；`--cwe-audit` 门禁对账）；security-spec §5.1 参考表（15 项高频弱点）；ISO 5055 全集 138 条的完整覆盖需机构 SAST 工具 |
| 弱点密度/合规率双指标 | 无度量入库 | ❌ 缺口（密度度量/趋势） |

### E.2 NIST SSDF v1.1（SP 800-218，PO/PS/PW/RV 四组 19 项）

| 实践组 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| PO（组织准备 PO.1–PO.5：安全需求/角色/工具链/检查标准） | 生成器配置层：特征卡定级 + precheck.conf 测度实例化 + 本矩阵 | 本矩阵 + conf | ✅🟡 文档层覆盖 |
| PS（保护软件 PS.1–PS.3：代码防篡改/**发布完整性验证机制**/发布归档） | PS.1/PS.3 部分 ↔ git 工作流 + `--stable-diff`；**PS.2 ↔ `--release-sign`** | `--release-sign` | ✅🟡 已覆盖（产物伴随签名 .sig/.asc/.att/.bundle + cosign verify-blob 验签 + provenance fail-closed；无 cosign 降级存在性检查） |
| PW（生产安全软件 PW.1–PW.9：安全设计/编码/构建/评审/测试/默认安全配置） | 门禁体系主体：`--security`/`--layer`/`--review`/`--test`/`--shift-left` | 56 门禁 | ✅ 主体覆盖（PW≈门禁体系） |
| RV（响应漏洞 RV.1–RV.3：识别/修复/**根因分析**） | `--review` 部分覆盖；缺陷追踪根因字段 | 无 | 🟡 部分；RV ❌ 缺口（根因字段） |

动态登记：SP 800-218 Rev.1（v1.2）公开草案强化 SBOM/VEX/签名发布——发布签名门禁设计须对齐 v1.2。

### E.3 OWASP ASVS 5.0 / Top 10:2025 / CWE Top 25:2025

| 标准要求 | 门禁映射 | 状态 |
|---|---|---|
| ASVS 5.0「文档化安全决策」（每章开头强制） | 特征卡/认知 DNA + spec §22 标准合规段（swarm-yuan 原生能力） | ✅ 覆盖 |
| ASVS V6–V10 认证/会话/授权；CWE-862/863/284/639 授权类四弱点（2025 榜） | `--authz`（缺鉴权注解/IDOR/CORS 放行带凭据 → fail；AUTHZ_EXTRA_PATTERNS warn-only） | ✅🟡 词法层覆盖 |
| Top 10:2025 A10 异常状况处理不当（fail-secure/统一异常处理） | `--domain` 部分（客观规律） | 🟡 部分；异常处理 lint 缺口 |
| Top 10:2025 A03 软件供应链失效（lock 锁定+SBOM+持续监控） | `--deps`（版本锁定）+ `--sbom` | ✅🟡 主体覆盖 |
| security-spec.md 对齐 OWASP Top 10 2021 版 | 规范层 | 🟡 待升 2025 版 |

### E.4 SBOM / SLSA / OpenChain（供应链）

| 标准 | 要求 | 门禁映射 | 状态 |
|---|---|---|---|
| ISO/IEC 5962:2021（SPDX）/ ECMA-424:2024（CycloneDX）/ GB/T 43848-2024（开源成分评价） | 机器可读 SBOM + 成分评价 | `--sbom`（工具降级链 syft→cdxgen→scancode→lockfile 解析；产物带时间戳归档；许可证块名单） | ✅ 已覆盖（格式由 SBOM_FORMAT 定） |
| SLSA v1.0 Build L2 / Sigstore（签名 provenance） | 构建来源证明可验签 | `--release-sign`（cosign verify-blob 验签 + `RELEASE_PROVENANCE_REQUIRED=1` provenance 存在性 fail-closed，无 cosign 降级签名存在性检查） | ✅🟡 已覆盖（in-toto 完整布局/见证仍缺口） |
| ISO/IEC 5230:2020（OpenChain 许可证合规程序） | 许可证合规程序 | `--sbom` 块名单 + 溯源已迁移至 GitHub Release 源码包体系（release-src-packages.sh） | ✅🟡 覆盖 |
| ISO/IEC 25010:2023 Safety（故障安全/危险警告） | 无害性论证 | 无 | ❌ 缺口 |

### E.5 功能安全域（显式边界声明，须机构外审）

**明确不覆盖**：ISO 26262（车规 ASIL）/ IEC 62304（医疗软件）/ IEC 61508-62443（工控功能安全）。

**理由**：这些标准要求完整的功能安全生命周期（HARA 危害分析 / ASIL 分解 / 安全案例 Safety Case / SOUP 评估 / 工具链鉴定），属机构测评/认证级，远超门禁级自动化范畴。强行门禁化会淹没误报（违反"不贸然唤醒沉睡门禁"原则——无真实项目校准的硬门禁是头号风险）。正确做法是显式声明边界，让"不覆盖"成为诚实声明而非隐性缺口。

**外审指引**：涉及功能安全域的项目，swarm-yuan 的 56 门禁可作为**通用质量/安全基线**，但功能安全合规必须由具备资质的机构按标准全文外审。swarm-yuan 的门禁证据（gate-runs.jsonl / SBOM 产物 / RTM 追溯矩阵 / 豁免 5 字段登记）可作为外审输入材料，**不构成合规证据本身**。

> **适用范围声明**：本范式暂不覆盖功能安全认证场景。涉及车规（ISO 26262 ASIL 分级）、医疗软件（IEC 62304 安全分级）或工控功能安全（IEC 61508/62443）时，本矩阵与门禁体系**不构成合规证据**——须经具备资质的外部机构评审（外审），并补充行业专用过程（危害分析/HARA、安全案例 safety case、SOUP 评估、工具链鉴定等）后方可用于对应场景。

| 标准 | 适用范围 | 本范式姿态 | 状态 |
|---|---|---|---|
| ISO 26262（道路车辆功能安全） | 车规 E/E 系统 ASIL A–D 分级开发 | 不覆盖；涉车规时须外审 + 补充 HARA/安全案例/工具链鉴定（TCL） | ❌ 占位 |
| IEC 62304（医疗器械软件生存周期） | 医疗软件 A/B/C 安全分级 | 不覆盖；涉医疗时须外审 + 补充 SOUP/遗留软件评估 | ❌ 占位 |
| IEC 61508 / IEC 62443（工控功能安全/信息安全） | 工控系统 SIL 分级 | 不覆盖；涉工控时须外审 | ❌ 占位 |

> **行业 profile 落地**：金融/医疗行业立法文档与配套配置包已入库——生成器仓 `references/industry-profile-{finance,medical}.md` + `assets/industry-profiles/{finance,medical}.conf`（md 方法论不随技能分发；conf 由 --industry 实际加载）（用法：conf 追加到目标技能 `precheck.conf` 末尾后按项目裁剪，追加后 `--doctor` 自检）。医疗 profile 覆盖医疗机构信息系统（HIS/EMR/LIS/PACS/互联网医院平台）研发交付；上表医疗器械注册申报（IEC 62304/YY/T 0664 SaMD/SiMD）场景仍维持外审占位，profile 与门禁输出**不构成注册合规证据**。

---

## F. 门禁姿态与豁免登记

### F.1 全 56 门禁姿态表

姿态三值：`fail-closed`（启用即执法，命中即 fail）/ `skip-if-unconfigured`（未配置静默跳过，--all-full 下不打印；显式单门禁调用时 warn 提示）/ `warn-only`（只告警不判违规）。混合姿态以「主姿态+备注」记。判定语义与既有输出行不因本登记改变。

| # | 门禁（flag / 函数） | 姿态 | 备注（证据：precheck.sh 行为） |
|---|---|---|---|
| 1 | `--branch` / check_branch | fail-closed | 非 git 仓库 / detached HEAD → skip-if-unconfigured |
| 2 | `--scope` / check_scope | fail-closed | 非 git 仓库降级为 warn（只读目录无法自动检测） |
| 3 | `--build` / check_build | skip-if-unconfigured | 未配置 BUILD_CMD 打印「(跳过)」返回（fail-open 已知，conf lint 收口缺口） |
| 4 | `--test` / check_test | skip-if-unconfigured | 未配置 TEST_CMD：探到测试文件 warn，无测试文件才跳过（同上） |
| 5 | `--sensitive` / check_sensitive | fail-closed | SCAN_DIRS 空 → warn「未配置未执行（fail-open 风险）」 |
| 6 | `--consistency` / check_consistency | warn-only | 写入点 >5 warn；其余 pass + 人工核对清单提示 |
| 7 | `--review` / check_review | fail-closed | ocr High/Critical fail；ocr 未装 → warn 转人工 5 维度清单 |
| 8 | `--reuse` / check_reuse | fail-closed | 无 §5.5 spec → skip-if-unconfigured；有 spec 未全勾/重名 → fail；新增导出 >30 warn |
| 9 | `--deps` / check_deps | fail-closed | 无 codebase.md 基线 → warn 返回 |
| 10 | `--security` / check_security | fail-closed | 6 类硬（SQL/命令/eval/XSS/硬编码/TLS）fail + 4 类 warn；无可扫目录 → warn 返回 |
| 11 | `--layer` / check_layer | skip-if-unconfigured → 配置后 fail-closed | 未配置 LAYER_DEFS/LAYER_ORDER 静默跳过；配置后硬门禁 |
| 12 | `--stable-diff` / check_stable_diff | fail-closed | STABLE_GLOBS 空时不触发（硬门禁限于已声明稳定层） |
| 13 | `--link-depth` / check_link_depth | skip-if-unconfigured → 启用后 warn-only | MAX_LINK_DEPTH=0 跳过；超阈值 warn 不 fail |
| 14 | `--adr` / check_adr | fail-closed | ADR_DIR 缺失 fail；新增依赖未入 ADR / TODO 未登记 warn |
| 15 | `--contract` / check_contract | fail-closed | 契约缺 version / 绕 ACL → fail |
| 16 | `--consistency-cross` / check_consistency_cross | warn-only | glossary 漂移 / SoR 缺失均 warn |
| 17 | `--impact` / check_impact | fail-closed | spec 缺影响段 fail；消费方 >3 warn |
| 18 | `--service` / check_service | fail-closed | 共享 DB fail；网关/同步链/透传/Outbox warn |
| 19 | `--api` / check_api | fail-closed | 缺 version fail；幂等/2PC/Outbox warn |
| 20 | `--state` / check_state | warn-only | 巨型 store / prop drilling / 派生状态均 warn |
| 21 | `--frontend` / check_frontend | fail-closed | 循环依赖 fail；深度/props/CSS/bundle warn |
| 22 | `--cognition` / check_cognition | warn-only | 不判违规，输出认知体检报告（/14 + /22） |
| 23 | `--domain` / check_domain | fail-closed | 密码明文/SQL 拼接 fail；文档段与消毒/并发项 warn；无 spec → skip-if-unconfigured |
| 24 | `--knowledge` / check_knowledge | fail-closed | 有知识文件但 0 引用 fail；部分引用 warn；无知识文件/无 SKILL.md → skip-if-unconfigured |
| 25 | `--diagram` / check_diagram | warn-only | 无可视化图 warn（mermaid 结构图 + echarts/antv 数据图） |
| 26 | `--shift-left` / check_shift_left | fail-closed | 测试设计段/变更影响段/回滚预案缺失 fail；可观测性段与埋点 warn |
| 27 | `--framework` / check_framework | fail-closed | ACTIVE_FRAMEWORKS 空 → 静默跳过；`_fw_<id>_<rule>` 缺失或规则命中 → fail |
| 28 | `--compliance` / check_compliance | skip-if-unconfigured → 存在即执法 | 矩阵不存在且未设 COMPLIANCE_MATRIX_FILE → 静默跳过；存在后锚点缺失/占位标记/spec 缺 §22 → fail |
| 29 | `--docs-pack` / check_docs_pack | skip-if-unconfigured → 启用后 fail-closed | DOCS_PACK_PROFILE 空 → 静默跳过；启用后缺必备文档 fail；占位标记 fail（ALLOW_TBD=1 降级 warn） |
| 30 | `--sbom` / check_sbom（安全类） | skip-if-unconfigured → 启用后 fail-closed | SBOM_REQUIRED≠"1" → 静默跳过；启用后无工具且无 lockfile → fail（`gate_sbom_toolchain_unavailable`） |
| 31 | `--privacy` / check_privacy（安全类） | skip-if-unconfigured → 启用后 fail-closed | PRIVACY_SCAN_DIRS 空 → 静默跳过；启用后配置目录全不存在 → fail；PII 命中 → fail |
| 32 | `--authz` / check_authz（安全类） | skip-if-unconfigured → 启用后 fail-closed | AUTHZ_SCAN_DIRS 空 → 静默跳过；缺鉴权注解/IDOR/CORS 放行带凭据 → fail；AUTHZ_EXTRA_PATTERNS 命中 warn-only |
| 33 | `--requirements` / check_requirements | skip-if-unconfigured → 严格模式 fail-closed | SPEC_FILE 未配置 → 静默跳过；REQUIREMENTS_STRICT=1 TBD → fail；REQUIREMENTS_ID_REQUIRED=1 缺 REQ- 编号 → fail；EARS 覆盖率 warn-only |
| 34 | `--crypto` / check_crypto（安全类） | skip-if-unconfigured → 启用后 fail-closed | CRYPTO_PROFILE 空 → 静默跳过；=gm 且 CRYPTO_SCAN_DIRS 空 → warn 披露 fail-open（同 sensitive 姿态）；弱算法命中 → fail |
| 35 | `--rtm` / check_rtm | skip-if-unconfigured → 启用后 fail-closed | RTM_REQUIRED≠1 → 静默跳过；RTM_MATRIX_REQUIRED=1 且矩阵缺失 → fail（`gate_rtm_matrix_missing`）；REQ- 在测试目录与矩阵均无追溯 → fail（`gate_rtm_untraced:<REQ->`）；矩阵缺失未强制 → warn 降级仅测试目录追溯 |
| 36 | `--release-sign` / check_release_sign（安全类） | skip-if-unconfigured → 启用后 fail-closed | RELEASE_SIGN_REQUIRED≠1 → 静默跳过；产物缺伴随签名 → fail（`gate_release_sign_missing`）；cosign verify-blob 验签失败 → fail（`gate_release_sign_verify_failed`）；RELEASE_PROVENANCE_REQUIRED=1 缺 provenance → fail（`gate_release_provenance_missing`）；无 cosign 降级签名存在性检查 |
| 37 | `--dengbao` / check_dengbao | fail-closed（Z3） | DENGBAO_LEVEL 未配置且无 DENGBAO_EXEMPT_REASON → fail（`gate_dengbao_unconfigured`）；豁免 → warn 留痕；启用后双因子/审计日志/审计字段缺口 → fail |
| 38 | `--pia` / check_pia | fail-closed（Z3） | PIA_REQUIRED 未启用且无 PIA_EXEMPT_REASON → fail（`gate_pia_unconfigured`）；豁免 → warn 留痕；启用后 PIA 文档缺失/待定项 → fail |
| 39 | `--sast-deep` / check_sast_deep | fail-closed（Z3） | SECURITY_SCAN_DIRS 未配置且无 SAST_DEEP_EXEMPT_REASON → fail（`gate_sast_deep_unconfigured`）；豁免 → warn 留痕；启用后 semgrep→opengrep→内置降级链检出 sink → fail |
| 40 | `--oss-eval` / check_oss_eval | fail-closed（Z3） | OSS_EVAL_REQUIRED 未启用且无 OSS_EVAL_EXEMPT_REASON → fail（`gate_oss_eval_unconfigured`）；豁免 → warn 留痕；启用后复用 --sbom 产物，成分/许可证缺口 → fail |
| 41 | `--quality-model` / check_quality_model | skip-if-unconfigured → 启用后 fail-closed | 未配置质量特性剪裁 → 静默跳过；启用后八特性剪裁/证据缺口 → fail |
| 42 | `--test-evidence` / check_test_evidence | skip-if-unconfigured → 启用后 fail-closed | TEST_EVIDENCE_REQUIRED 未启用 → SKIP 明示；启用后测试证据缺失 → fail |
| 43 | `--review-record` / check_review_record | skip-if-unconfigured → 启用后 fail-closed | REVIEW_RECORD_REQUIRED 未启用 → SKIP 明示；启用后评审记录缺失 → fail |
| 44 | `--metrics` / check_metrics | skip-if-unconfigured → warn 为主 | 未配置度量基线 → 静默跳过；启用后度量趋势异常 warn（enforce=warn，1 fail 触发窄） |
| 45 | `--operate` / check_operate | advisory-only（0 fail） | 不在三档执行序列，显式单门禁调用；发布后运营观测（日志/告警/灰度清单），warn/pass |
| 46 | `--decision-audit` / check_decision_audit | advisory-only（0 fail） | 同上；decisions.jsonl 决策留痕完整性观测 |
| 47 | `--canary` / check_canary | advisory-only（0 fail） | 同上；灰度/金丝雀发布配置观测 |
| 48 | `--cwe-audit` / check_cwe_audit | advisory-only（0 fail） | 同上；自动读取 references/cwe-database.md（60 条目）做 CWE 覆盖观测 |
| 49 | `--cert-audit` / check_cert_audit | advisory-only（0 fail） | 同上；自动读取 references/security-certification-profiles.md（6 认证 profile）做认证准备度观测 |
| 50 | `--learnings` / check_learnings | advisory-only（0 fail） | 同上；经验沉淀（learnings 清单）观测 |
| 51 | `--pr-quality` / check_pr_quality | advisory-only（0 fail） | 同上；PR 质量信号观测 |
| 52 | `--skill-supply-chain` / check_skill_supply_chain | advisory-only（0 fail） | 同上；技能供应链（来源/签名/版本）观测 |
| 53 | `--state-phase` / check_state_phase | advisory-only（0 fail） | 同上；状态机阶段流转一致性观测 |
| 54 | `--upstream-baseline` / check_upstream_baseline | advisory-only（0 fail） | 同上；上游基线漂移观测（生成器仓 docs/upstream-baseline.md 对账，drifted → warn） |
| 55 | `--method-size` / check_method_size | warn-only（enforce advisory，0 fail） | 在标准/完整序列内执行（决策 26.2 追认预算 55）；方法体规模预算观测，超限 warn |
| 56 | `--spec-first` / check_spec_first | fail-closed | 可写区（WRITABLE_DIRS）变更无已批准 spec → fail；未配置 WRITABLE_DIRS / 缺 spec-first-lib.sh → skip-if-unconfigured（spec-first 四层拦截的门禁面承载，核心序列成员） |

汇总姿态约定（与 GB/T 15532 准出「失效须可见」对齐）：`--all-full` 末次汇总打印「—— 执行汇总：调用 N，执行 N−S，跳过 S（清单），fail F，warn W ——」（跳过计数器）；退出码与既有输出行一字不改。

### F.2 豁免登记格式（5 字段）

安全类门禁（`--sbom`/`--privacy` 及 `--security` 白名单）的豁免必须显式登记并留痕（对应 GB/T 39786「宜」级条款裁剪论证要求）。格式（单行，竖线分隔，与 conf 中 `SBOM_LICENSE_EXEMPTIONS` / `PRIVACY_EXEMPTIONS` 变量元素一致）：

```
对象|规则|理由|审批人|日期
```

字段说明：

- **对象**：豁免作用对象（组件名/文件路径/目录，与门禁输出 id 可对应）；
- **规则**：被豁免的规则或判定（许可证 id / PII 模式 / 门禁 id）；
- **理由**：业务/技术理由（不得为空；空理由视为无效豁免 → `gate_*_exemption_invalid`）；
- **审批人**：具名责任人；
- **日期**：审批日期（YYYY-MM-DD）。

填写示例（conf 片段）：

```bash
# 示例 1：SBOM 许可证豁免——内部自研组件误标 GPL-3.0，实为私有许可
SBOM_LICENSE_EXEMPTIONS=(
 "internal-utils@2.3.0|GPL-3.0-only|自研组件许可证误标，法务实为私有许可，已出确认函|张三|2026-07-20"
)
# 示例 2：隐私豁免——测试固化的样例身份证串，属构造数据非真实 PII
PRIVACY_EXEMPTIONS=(
 "tests/fixtures/idcard-sample.txt|PII:18位身份证|测试夹具构造数据（全 1 序列），非真实个人信息，见夹具 README|李四|2026-07-20"
)
```

门禁执行时对每条豁免做 5 字段完整性校验（字段数≠5 或理由/审批人/日期为空 → `gate_sbom_exemption_invalid` / `gate_privacy_exemption_invalid` fail），有效豁免逐条回显（对象+规则+审批人+日期），确保「豁免可见、失效可见」。spec §22.3 安全豁免登记表（表头：门禁|规则|对象|理由|审批人|日期）与本节同源，二者任一登记即视为留痕。
