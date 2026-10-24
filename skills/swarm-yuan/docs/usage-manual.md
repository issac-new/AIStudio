# 使用手册（USAGE）

> 命令级使用参考：生成/激活/升级/门禁/审计全命令行手册。

> 对 AI 说"为这个项目生成 skill"，AI 全自动探查 → 生成 → 配置 → 验证，你拿到一套无占位符的项目专属开发技能。
>
> **口径权威源**：`assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。
>
> **两体阅读提示**：本文覆盖两个对象——**生成器**（swarm-yuan 本身，"生成"段落操作它）与**目标技能**（生成器产出的项目专属规则包，"日常使用"段落操作它；亦称"生成物"）。17 项特征卡、56 个门禁、四本账都是**目标技能**的资产；生成器是它们的模板来源。

---

### 1. 设计理念（速览）

四条设计原则：**先认识再行动**（不探查不动手，特征卡完成认知）、**拼装式开发**（新功能 = 既有稳定单元拼装 + 最小新增胶水，`--reuse` 守卫）、**诚实降级**（外部运行时未装就显式披露，不假装满配）、**AI 全自动零手动**（生成与使用都靠对 AI 说话，bash 是排查与 CI 的备份通道）。完整推导见 `swarm-yuan/README.md` 二章 Why；本文余下只讲操作。

---

### 2. 安装

```bash
git clone https://github.com/issac-new/Swarm-yuan.git
cd Swarm-yuan/swarm-yuan
bash install.sh
```

| 选项 | 安装到 |
|------|--------|
| `--claude` | `~/.claude/skills/` |
| `--codex` | `~/.codex/skills/` |
| `--cursor` | `~/.cursor/skills/` |
| `--windsurf` | `~/.codeium/windsurf/skills/` |
| `--opencode` | `~/.config/opencode/skills/` |
| `--gemini` | `~/.gemini/skills/` |
| `--kimi` | `~/.kimi/skills/`（优先 `~/.kimi-code/skills/`） |
| `--zcode` | `~/.zcode/skills/` |
| `--all` | 所有已检测到的环境 |
| `--list` | 仅列出检测到的环境 |
| `--uninstall --<目标>` | 从对应环境卸载（如 `--uninstall --claude`，`--uninstall --all` 卸载所有已检测环境）。技能目录存档为 `<目录>.uninstalled.<UTC时间戳>`，渲染期写入的宿主配置（hooks 条目/标记块/插件注册）一并注销，用户自有配置保留；幂等可重复执行 |

环境检测判据：宿主家目录存在（如 `~/.cursor`）或宿主 CLI 在 PATH（如 `command -v cursor`），二者满足其一即视为已安装；安装目标始终是各自 `skills/` 子目录。

---

### 3. 特征卡：项目的「认知 DNA」

#### 什么是特征卡

特征卡是 AI 探查项目后提取的 **17 项项目特征**，每项落到真实路径和版本号，不用占位符。它不是独立文件，而是**分散承接进目标技能的各个文件中**，是门禁配置和文件填充的「数据源」。

**没有特征卡，门禁就是无源之水——不知道项目边界在哪、哪些单元稳定、什么领域规律不能违反。**

#### 17 项特征卡详解

| # | 特征项 | AI 提取什么 | 为什么重要 |
|---|--------|-----------|-----------|
| 1 | 项目类型 | 单体/monorepo/overlay-fork/微服务/库 | 决定后续探查策略和门禁配置方向 |
| 2 | **可改范围** | 可改目录列表 + 只读目录列表 + 只读区修改机制 | **安全铁律的依据**——改了只读区 = 违规 |
| 3 | **改造分类** | A类(纯新增)/B类(骨架修改) 或 core/plugin 或 src/lib | **决定代码怎么写**——A类放 custom/，B类放 patches/ |
| 4 | 技术栈摘要 | 语言+主框架+构建+测试（含版本基线） | 版本锁定铁律的依据，`--deps` 门禁的对比基线 |
| 5 | **构建发布命令** | dev/build/test/release 真实命令 + 端口 | **门禁执行的基础**——`--build` 和 `--test` 跑这些命令 |
| 6 | 分支规范 | 命名格式/合入策略/保护分支/推送规则 | `--branch` 门禁的校验规则 |
| 7 | 安全规则 | 脱敏规则/密钥管理/网络白名单 | `--sensitive` `--security` 门禁的扫描范围 |
| 8 | 文档约定 | spec/plan 位置和命名格式 | spec 文件创建时的路径和命名 |
| 9 | 测试体系 | 框架/目录/运行命令 | `--test` 门禁的执行命令 |
| 10 | 环境与外部资源 | 运行时版本/DB/缓存/MQ/MCP 工具 | `--service` 门禁的微服务配置 |
| 11 | **可复用稳定单元** | 全部稳定 API/组件/类/函数/store/类型（五维字段定义见 `references/exploration-guide.md` §11f） | **拼装式开发的核心依据**——`--reuse` 门禁的重名检测源 |
| 12 | 数据规范 | schema 位置/样例数据/业务规则/勾稽关系 | `--consistency` 门禁的勾稽核对项 |
| 13 | 认知框架 | 认知映射表 + 六维动力学基线（速度/聚散/趋势/强度/能耗/累积量） | `--cognition` 门禁的对比基线 |
| 14 | **领域知识** | 技术+业务领域识别 → 推导客观规律 | **防达克效应**——`--domain` 门禁的违规检测依据 |
| 15 | **编排调用关系及约束** | 导入方向/注册顺序/路由挂载/改造分类/状态所有权/测试边界（每条含代码证据） | **拼装式开发的执行边界**——`--layer`/`--frontend` 门禁的校验依据 |
| 16 | **详尽组件库清单** | 全量枚举 + 每维度计数核验（清单计数 ≥ 枚举计数 × 0.95） | **防漏**——`inventory-verify.sh` 的核验对象，reference-manual 组件库清单的来源 |
| 17 | **合规与质量特性基线** | 等保/密评/PIA/行业监管/认证要求 + 既有合规证据 + GB/T 25000 质量特性声明 + 数据分级 | compliance 档与合规门禁族的输入 |

#### 特征卡如何驱动一切

**特征卡 → 文件填充（Step 4）：** SKILL.md 的铁律来自第 2/6 项 → codebase.md 的技术栈来自第 4 项 → dev-guide.md 的改造分类来自第 3 项 → reference-manual.md 的组件库来自第 11 项 → release.md 的命令来自第 5 项……17 项特征卡是目标技能所有文件的「数据源」。

**特征卡 → 门禁配置（Step 5）：** precheck.conf 生成期必读文件合计 197 个变量（core 28 + arch 121 + compliance 48；真值 `assets/facts.conf` FACT_CONF_VARS 族），从特征卡推导：

| 配置变量 | 来自特征卡第几项 |
|---------|----------------|
| PROJECT_DIR / WRITABLE_DIRS / READONLY_DIRS | 第 2 项（可改范围） |
| TEST_CMD / BUILD_CMD | 第 5 项（构建命令） |
| LAYER_DEFS / LAYER_ORDER / DOMAIN_LAYER | 第 3 项（改造分类） |
| STABLE_GLOBS | 第 11 项（可复用单元） |
| SERVICE_DIRS / DB_CONFIG_FILES | 第 10 项（环境资源） |
| STORE_DIR / COMPONENT_DIR | 第 11 项（可复用单元） |
| ADR_DIR / GLOSSARY_FILE | 第 7/8 项（安全/文档） |
| SCAN_DIRS / CONSISTENCY_DIRS | 第 7/12 项（安全/数据） |
| COG_SPEED_FILES / COG_CUMULATIVE_TODO | 第 13 项（认知框架） |

**特征卡 → 开发流程（日常使用）：** 开始新需求时，AI 从特征卡第 11 项检索可复用单元，预填 spec §5.5 复用约束。编码时 AI 查特征卡第 11 项的组件库清单，拼装优先。提交前 56 个门禁按特征卡配置的规则检查。

#### 特征卡探查工具矩阵

每项探查优先用运行时工具，无则降级到内置 grep：

| # | 特征项 | 优先工具 | 降级 |
|---|--------|---------|------|
| 1 | 项目类型 | gitnexus `query "architecture"` + graphify `explain` | Read package.json |
| 2 | 可改范围 | 记忆后端检索（memory-backends.sh 注册，如 claude-mem `search "project rules"`）+ Read AGENTS.md | Glob + Grep |
| 4 | 技术栈 | gitnexus `query "tech stack"` + graphify `explain` | Read package.json |
| 9 | 测试体系 | gitnexus `query "test files"` | Glob `**/*.test.*` |
| 10 | 环境资源 | gitnexus `route_map` + `tool_map` | Grep "host/port" |
| 11 | 可复用单元 | **gitnexus `context <symbol>`**（360 度上下文） | Grep `export` |
| 12 | 数据规范 | gitnexus `query "data models"` | Grep `CREATE TABLE` |
| 14 | 领域知识 | gitnexus `query "domain"` + 记忆后端（如 claude-mem）+ WebSearch | Read 领域模型 |

> 注：GitNexus（PolyForm Noncommercial 禁商用）降级为非默认；graphify（MIT）提为默认代码图谱工具——商用场景请把上表 gitnexus 优先位替换为 graphify（依据见 `references/code-graph-tools.md` §许可证与选型）。

大型项目（>100 文件）可用 Dynamic Workflow 并行扇出三路子代理，交叉验证特征卡。

#### 落地示例（AIStudio 单仓，原 SwarmStudio overlay 仓）

| # | 特征项 | 真实值 |
|---|--------|--------|
| 1 | 项目类型 | 单仓整合 + vendor 钉版基线注入式二次开发（Vue 3 + Electron） |
| 2 | 可改范围 | 可改: custom/、patches/、本仓源码；只读: vendor/（钉版基线，严格禁止手改） |
| 3 | 改造分类 | A类（custom/ 纯新增）+ B类（patches/ 骨架修改） |
| 4 | 技术栈 | Vue 3 + TypeScript + Vite + NaiveUI + Vitest + SQLite + Koa |
| 5 | 构建命令 | `npm run dev`(:8649) / `npm run build` / `npm test` / `npm run inject` |
| 11 | 可复用单元 | CockpitWorkspace / CockpitKanban / GatewayNoticeBanner 等 15+ 组件 |
| 14 | 领域知识 | IM 通讯（Matrix 协议）+ DevOps 监控（cockpit 看板） |

---

### 4. 质量门禁：特征卡的守卫者

#### 门禁与特征卡的关系

特征卡定义了「项目应该是什么样的」，56 个门禁验证「代码是否符合特征卡定义的规则」。

#### 门禁分层（决策 19，横切维度）

56 门禁按 `fail()` 调用能力分三档，与 core/standard/compliance 门禁家族正交（一个门禁同时属于 core + strict，或 standard + advisory）。计数真值在 `assets/facts.conf`（FACT_ENFORCE_* 族）：

| 分层 | 静态计数 | 有效计数 | fail() 能力与行为 |
|------|------|------|------------|
| **strict** | 21 | 21 | ≥3 真实 fail()，真 fail 阻断交付 |
| **warn** | 20 | 17 | 1-2 真实 fail()，能 fail 但触发窄，混合 warn |
| **advisory** | 15 | 18 | 0 fail()，永不阻断（认知/观测类；子 shell 内重定义 `fail()`/`warn()` 为纯 echo，"不阻断"语义机器化） |

- **有效 = 静态 + precheck.sh 顶部 `_ENFORCE_OVERRIDE`**（当前 3 项 warn→advisory：stable-diff / knowledge / metrics；名单以 precheck.sh 数组为准，不在此手抄）
- **查实时名单**：`bash scripts/precheck.sh --list-gates`（输出 flag / gate_fn / enforce / tier 四列）——本节不手抄 56 个门禁名，手抄即漂移（agents-md-audit-round：旧名单表三度失同步后删除）
- **自动归类**：`bash scripts/gen-enforce-level.sh` 扫 precheck.sh fail() 数，重生成 `assets/gate-enforce-level.conf`（幂等，可逐字节再生）
- **自检**：`self-check.sh` 校验 conf 与 precheck.sh fail 数一致 + strict 门禁必含 ≥1 fail()（防 strict 声明空壳）

**特征卡是立法，门禁是执法。**

| 特征卡项 | 立法定义 | 门禁执法 |
|---------|---------|---------|
| 第 2 项 可改范围 | overlay/ 可改，upstream/ 只读 | `--scope` 检查 git diff 是否触碰只读目录 |
| 第 5 项 构建命令 | `npm run build` | `--build` 运行此命令，非零 = fail |
| 第 6 项 分支规范 | feat/fix/refactor | `--branch` 校验分支名是否匹配正则 |
| 第 7 项 安全规则 | 密钥不入代码库 | `--sensitive` `--security` grep 扫描密钥模式 |
| 第 11 项 可复用单元 | CockpitWorkspace 等稳定单元 | `--reuse` 检测新增单元是否与既有重名 |
| 第 11 项 稳定层 | STABLE_GLOBS 指定的文件 | `--stable-diff` 检测稳定层是否被改而未声明 |
| 第 14 项 领域知识 | 密码必须哈希 | `--domain` grep 检测密码明文存储 |

#### 核心门禁（`--all` 跑 11 个，通常 10-20 秒，取决于项目规模与 build/test 命令耗时）

| 门禁 | 检查什么 | fail 条件 | 特征卡依据 |
|------|---------|----------|-----------|
| `--branch` | 分支命名 + 保护分支 | 在 main 上开发 / 分支名不合规 | 第 6 项 |
| `--scope` | 改动范围（可改 vs 只读） | 只读目录有改动 | 第 2 项 |
| `--spec-first` | spec 流程门（可写源码区有变更时须有本变更集内已批准 spec） | 变更触及可写区但无已批准的 spec（含「## 决策记录」段、非占位） | 第 8 项 |
| `--build` | 构建通过 | 构建失败 | 第 5 项 |
| `--sensitive` | 敏感信息脱敏 | 密码/密钥/token 明文 | 第 7 项 |
| `--consistency` | 业务规则 + 数据勾稽 | 人工核对项（提示性） | 第 12 项 |
| `--review` | 代码审查（5 维度） | ocr 检测到 High 级问题 | — |
| `--reuse` | 复用合规（拼装式开发） | spec 缺 §5.5 / 新增单元与既有重名 | **第 11 项** |
| `--deps` | 依赖版本锁定 | 依赖版本变更但 spec 未声明 | 第 4 项 |
| `--security` | 安全规范（OWASP Top 10） | 注入/eval/XSS/硬编码密钥/TLS 关闭 | 第 7 项 |
| `--test` | 测试通过 | 测试失败 | 第 5/9 项 |

#### 架构门禁（`--all-full` 额外跑 18 个，未配置则静默跳过）

| 门禁 | 检查什么 | 特征卡依据 |
|------|---------|-----------|
| `--layer` | DDD 分层边界（穿透/倒置/领域污染/聚合跨引用） | 第 3 项 |
| `--stable-diff` | 稳定单元篡改（改稳定层须 spec MODIFIED 声明；下游 1 跳传播 warn，决策 28） | **第 11 项** |
| `--link-depth` | 调用链深度（链路膨胀/纯转发堆叠） | 第 13 项 |
| `--adr` | 架构决策记录（ADR + 技术债登记） | 第 8 项 |
| `--contract` | 接口契约（version + ACL 防腐层） | 第 10 项 |
| `--consistency-cross` | BDAT 一致性（术语表 vs 代码 + 数据所有权） | 第 12 项 |
| `--impact` | 变更影响分析（消费方反查） | — |
| `--service` | 微服务架构（共享 DB/同步链/网关/trace） | 第 10 项 |
| `--api` | API 契约与幂等 | 第 10 项 |
| `--state` | 前端状态管理（巨型 store/prop drilling） | **第 11 项** |
| `--frontend` | 前端组件架构（层级/props/循环依赖/CSS 污染） | **第 11 项** |
| `--method-size` | 方法粒度（单方法行数超 METHOD_MAX_LINES 默认 60 warn——语言无关启发式，只抓"物理太大"） | 第 3 项 |
| `--cognition` | 认知递进体检（六阶+六维+五层总分） | 第 13 项 |
| `--domain` | 领域知识违规检测 | **第 14 项** |
| `--knowledge` | 项目知识复用（AGENTS.md/CLAUDE.md/记忆 → skill 引用） | — |
| `--diagram` | 图表生产：客观契约机械查（可访问 SVG/单文件安全/远程资源/脚本策略/viewBox）+ 主观质量 AI 检查单；产物默认 `docs/diagrams/` 或 `.swarm-yuan/diagrams/`；可发布图用 `runtime/diagram-design/`，每 sprint 变的活文档用 Mermaid（`--mermaid` 为别名） | — |
| `--shift-left` | 左移核验（spec §19 测试设计/§20 变更影响/§21 可观测性非占位） | 第 8 项 |
| `--framework` | 框架适配门禁（按 ACTIVE_FRAMEWORKS 跑注入的 `_fw_<id>_check` 片段） | 第 4 项 |

#### 合规门禁（19 个，独立 `--compliance-suite` 按需执行；未配置静默跳过或登记豁免留痕）

| 门禁 | 检查什么 | 特征卡依据 |
|------|---------|-----------|
| `--compliance` | 标准合规矩阵核验（六锚点 + 无占位符 + spec §22 标准合规段） | 第 8 项 |
| `--docs-pack` | 文档包清单（rusp/gbt9386/gbt8567 profile 必备文档 + TBD 扫描） | 第 8 项 |
| `--sbom` | SBOM 生成 + 许可证块名单扫描（启用后 fail-closed） | 第 4 项 |
| `--privacy` | 个人信息扫描（身份证/手机号/银行卡内置模式 + 豁免留痕，启用后 fail-closed） | 第 7 项 |
| `--authz` | 授权类弱点扫描（缺鉴权注解/IDOR/CORS 放行带凭据，CWE-862/863/639/284） | 第 7 项 |
| `--requirements` | 需求质量检查（spec 无 TBD/待定 + REQ- 唯一编号，严格模式 fail-closed） | 第 8 项 |
| `--crypto` | 密码算法合规（profile=gm 密评：弱算法 → fail，国密白名单 SM2/SM3/SM4） | 第 7 项 |
| `--rtm` | 需求追溯矩阵（spec REQ- 编号须在测试目录或追溯矩阵可追溯；RTM_MATRIX_REQUIRED=1 时矩阵缺失 fail-closed） | 第 8 项 |
| `--release-sign` | 发布签名与 provenance（产物须带 .sig/.asc/.att/.bundle 伴随签名；cosign verify-blob 验签 + SLSA provenance fail-closed） | 第 5 项 |
| `--dengbao` | 等保 2.0 控制点（DENGBAO_LEVEL 二/三级分级：双因子/审计日志/审计字段/个人信息保护缺口，启用后 fail-closed + 豁免留痕） | 第 7 项 |
| `--pia` | 隐私影响评估（PIA 文档缺失 → fail，启用后 fail-closed） | 第 7 项 |
| `--sast-deep` | 深度 SAST（semgrep→opengrep→内置降级链，启用后 fail-closed） | 第 7 项 |
| `--oss-eval` | 开源代码安全评价（复用 --sbom 产物，成分清单/许可证纳入评价，启用后 fail-closed） | 第 4 项 |
| `--quality-model` | 质量特性剪裁核验（GB/T 25000.10 八特性：功能性/性能效率/兼容性/易用性/可靠性/安全性/维护性/可移植性，启用后 fail-closed） | 第 8 项 |
| `--test-evidence` | 测试证据留存（TEST_EVIDENCE_REQUIRED=1：每测试用例须有执行证据记录，启用后 fail-closed） | 第 5 项 |
| `--review-record` | 评审记录留存（REVIEW_RECORD_REQUIRED=1：spec/code 合入须留评审记录，启用后 fail-closed） | 第 8 项 |
| `--metrics` | 度量趋势（cognition-metrics.jsonl：认知层得分/门禁执行计数趋势，warn 为主，enforce=warn） | 第 13 项 |
| `--cert-audit` | 安全认证合规聚合（等保/BCP/GB22240/PCI-DSS/ISO27001 认证 profile：组合调度既有安全门禁 + 人工核对项 warn；advisory 级不重复各门禁 fail 逻辑） | 第 7 项 |
| `--cwe-audit` | CWE 元数据库对账（仓库内 CWE-NNN 标注须在 cwe-database.md 登记 + 检查点 + 严重度分级；对齐 ISO/IEC 5055 / GB/T 34943 / CWE Top 25） | 第 7 项 |

#### 门禁工具优先级 + 降级策略

每个门禁优先用已安装的运行时工具，无则降级：

| 门禁 | 优先（运行时） | 降级（内置） |
|------|--------------|-------------|
| `--link-depth` | graphify path → gitnexus trace（仅非商用场景）→ madge | 转发函数统计 |
| `--impact` | gitnexus detect_changes | git diff + grep |
| `--layer` | gitnexus query | grep import |
| `--review` | ocr review / `claude ultrareview` | AI 5 维度审查 |
| `--knowledge` | 记忆后端检索（memory-backends.sh 适配层，如 claude-mem） | 文件检测 |
| `--frontend` 循环 | madge --circular | grep 互引 |

---

### 5. 生成流程

对 AI 说："为 /path/to/my-project 生成 skill"

或用 slash 命令：`/swarm-yuan /path/to/my-project`

| 步骤 | 做什么 |
|------|--------|
| Step 1 | 自检（15 运行时整合口径 = 深度 4 + CLI 6 + 方法论 5；11 个运行时工具自动探测） |
| Step 2 | 读取项目知识（AGENTS.md / CLAUDE.md / 记忆 / agent 运行时）+ **行为观察**（`mine-habits.sh` 六维统计初稿 → AI 审读三去向） |
| Step 3 | 三路并行探查代码库（结构 / 规范 / 代码组织） |
| Step 4 | **项目形态判定 + 详尽组件库清单 + 调用链路分析**（§D.0-§D.7，按形态选维度，全量穷举 + 计数核验 + **业务功能盘点与任务配方提取**→recipes.md + **关系边集**→relations.jsonl + **框架深化与门禁注入**（逐激活框架按 frameworks/<fw>.md §1-§6 枚举 + 规律实例化 + `generate-skill.sh --inject-frameworks` 门禁片段写入 precheck.sh 标记区块） |
| Step 5 | **提取 17 项特征卡**（每项落到真实路径，不用占位符） |
| Step 6 | 创建骨架（含 hooks / commands / precheck.conf） |
| Step 7 | AI 填充全部文件——**特征卡驱动，消除全部占位符** |
| Step 8 | AI 配置 precheck.conf——**197 个变量从特征卡推导** |
| Step 9 | AI 生成 hooks / commands / settings.local.json / .mcp.json 集成（generate-skill.sh create 段自动产出骨架，AI 按项目已装运行时激活 MCP server） |
| Step 10 | AI 运行门禁（--all 核心 11 → --all-full 标准 29；合规 19 按需 --compliance-suite）——**特征卡定义规则，门禁验证合规** |
| Step 11 | AI 独立审查——`precheck.sh --review`（ocr 5 维度或 AI 清单）+ review-record 落盘 |
| Step 12 | AI 写回项目记忆（闭环） |
| Step 13 | AI 最终检查——运行 `generate-skill.sh --verify-completeness` 脚本确认**无占位符残留 + workflow 每节点含「调用追踪」要素**（命中即列 file:line 并 exit 1，零命中才通过） |

#### 质量门禁序列（quality:full 模式，交付收口用）

多门禁同跑时按序串行、fail-fast（任一步 fail 即停不跑后续），顺序与理由：build（构建能过）→ test（测试真过，0 用例检出）→ contract（契约不破）→ reuse（新增不与稳定单元重名）→ consistency（业务/数据勾稽）→ layer/link-depth（分层与依赖方向）→ docs-pack（文档齐备）→ security（安全）→ deps（版本锁定）。构建测试先行（跑不了代码谈什么都白搭），契约一致性次之，架构文档安全殿后。全部映射 precheck 既有 flag，不新增门禁；执行入口：`--all`（日常核心 11）/ `--all-full`（结构变更标准 29）/ 追加 `--compliance-suite`（强监管合规 19）。每步耗时与 pass/fail 落 `.swarm-yuan/gate-runs.jsonl`；节点⑦独立审查以此确认序列真实跑过。

> **全链路追踪（每步必做，无需确认）**：每步开始先公告 `→ [Step N] 调用 <技能/工具> · <目的>`，节点级落盘 `.swarm-yuan/trace.jsonl`（`SWARM_YUAN_TRACE=verbose` 时含每次具体调用）。

---

#### 三档骨架（--profile）

按项目规模与合规要求选择生成档位（**默认 `auto` 项目级自适应**：合规关键词 → compliance；文件数 <80 → lite；其余 standard；信号明确才升档，模糊走默认 standard，判定依据会打印供你评估，显式 `--profile` 可覆盖。upgrade 自动继承既有档）：

| 档 | 适用 | 骨架内容 |
|----|------|---------|
| `auto`（默认） | 让生成器按项目信号判定 | 按下方三档之一产出，附判定依据 |
| `lite` | 小项目 / 试水 / 增量采用 | 特征卡 + reference-manual + 核心门禁脚本（precheck/state-machine/trace-log/self-check/cost-report）+ spec/plan 模板；无 hooks/commands/settings/.mcp.json |
| `standard` | 一般项目 | 全量骨架（hooks + commands + 方法论 references 全集） |
| `compliance` | 金融/医疗等强监管交付 | standard + 标准合规矩阵参考（`references/standards-compliance.md`，配套 `--compliance-suite` 合规 19 门禁） |

无占位符铁律按档适用：只要求当前档包含的文件无占位符。**自适应的偏置方向是质量优先：宁可偏重，不可偏轻**——auto 判定不确定时升档；后续开发中任务规模判断同样升档（见 §6 任务级门禁映射）。

### 6. 日常使用

#### 开始新需求

对 AI 说："开始新需求：给 cockpit 添加通知面板"

AI 自动：创建 spec → 判断规模 → **从特征卡第 11 项检索可复用单元，预填 §5.5 复用约束** → 验证。

**全程可见（全链路追踪，无需确认）**：AI 每进入一节点先公告 `→ [节点X] 调用 <技能/工具> · <目的>`，节点级落盘 `.swarm-yuan/trace.jsonl`（`scripts/trace-log.sh`；`SWARM_YUAN_TRACE=verbose` 时含每次具体调用）。你随时知道正在调用何种工具及技能。

| 规模 | 填哪些段 | 提交前门禁（任务级自适应） | 典型场景 |
|------|---------|---------|---------|
| 简单 | §1-§4 + §5.5 复用约束 + §12 风险回滚 | `--all`（核心 11） | 改 bug / 加字段 |
| 标准 | §1-§13 + §5.5/§5.6/§5.7 约束段 | `--all-full`（标准 29） | 新功能 / 改接口 |
| 完整 | spec 全 25 节（含 §14-§18 认知/辩证/领域 + §25 功能点估算，仅 compliance 档保留 §14-§18） | `--all-full` + `--shift-left`；compliance 档项目追加 `--compliance-suite` | 架构变更 / 跨服务 |

> **任务级自适应规则（质量优先偏置）**：规模判断不确定时**按更大规模处理**（升档不降级）；涉及公共接口/数据模型/权限的改动，无论规模一律按「完整」执行门禁集；compliance 档项目任意规模都追加 `--compliance-suite`（强监管场景无"简单任务"豁免）。

#### 提交前门禁检查

```bash
bash .claude/skills/my-project-dev/scripts/precheck.sh --all         # 核心 11 门禁
bash .claude/skills/my-project-dev/scripts/precheck.sh --all-full    # 标准 29 门禁（核心 11 + 架构 18）
bash .claude/skills/my-project-dev/scripts/precheck.sh --compliance-suite  # 合规 19 门禁（强监管交付按需）
```

**结果**：`✓` 通过 / `✗` 必须修复 / `⚠` 人工评估

#### 门禁输出与证据（--doctor / --format json / GATE_RUNS_DIR）

```bash
bash scripts/precheck.sh --doctor              # conf 诊断 lint：路径/glob 可达/死变量/框架 requires_conf（非门禁，可带病启动）
bash scripts/precheck.sh --all --format json   # 门禁结果以 SARIF 2.1.0 子集 json 追加输出（GATE_JSON_OUT=<path> 可落盘）
GATE_RUNS_DIR=.gate-runs bash scripts/precheck.sh --all-full
# 证据落盘：gate-runs.jsonl（ts/门禁名/状态/fail id 数组/耗时）逐行写入 .gate-runs/
```

#### 全旅程速查

```
首次：
  bash install.sh --claude
  对 AI 说 "为 /path/to/project 生成 skill"
    → AI 探查 → 提取 17 项特征卡 → 填充文件 → 配置门禁 → 验证 → 无占位符

日常：
  对 AI 说 "开始新需求：xxx"
    → AI 从特征卡第 11 项检索可复用单元 → 预填 §5.5
    → 编码（拼装优先，查特征卡第 11 项组件库清单）
      → 对 AI 说 "跑门禁"
        ├→ 全 ✓ → 提交
        ├→ 有 ✗ → 修复重跑
        └→ 有 ⚠ → 评估

架构审查：
  对 AI 说 "跑全量门禁"（56 个门禁全跑）

升级：
  对 AI 说 "升级 skill"（AI 重新探查 → 更新特征卡 → 更新门禁配置）
```
```

默认 text 模式输出与旧版逐字节一致；`--format json` 或 `GATE_RUNS_DIR` 仅在显式开启时生效。

#### 趋势可视化与运行报告（gate-trends / gate-report）

以 `GATE_RUNS_DIR` 落盘的 `gate-runs.jsonl` 为数据源（行格式 `{"ts","gate","status","ids","duration_s"}`）：

```bash
bash scripts/gate-trends.sh [gate-runs.jsonl] [N=10]        # 各门禁近 N 次通过率趋势表（终端文本）
bash scripts/gate-trends.sh --html report.html              # 自包含 HTML 报告（内联 SVG：通过率折线/状态色块/fail id TOP10，零外链）
bash scripts/gate-report.sh [gate-runs.jsonl] [输出.md]     # GB/T 15532 对齐的门禁运行报告（标识/概述/环境/执行结果/结论）
```

无 jsonl（或空/无有效行）时提示并 exit 0——与门禁族「未配置静默跳过」姿态一致。

#### 成本遥测（cost-report）

以 `.swarm-yuan/trace.jsonl`（trace-log.sh 落盘）为数据源，聚合每次生成/使用的调用成本——评估"流程重不重"的量化依据：

```bash
bash scripts/cost-report.sh                  # 写 .swarm-yuan/cost-report.md 并打印摘要
bash scripts/cost-report.sh --stdout         # 只打印不落盘
SWARM_YUAN_TRACE=verbose <生成/使用流程>      # 先收集调用级细节，再跑 cost-report 数据更全
```

输出：时间跨度 / 总调用数（含 fail 数）/ 按节点、执行者、工具的 Top10 聚合。无 trace.jsonl 时提示并 exit 0（fail-open）。

#### 多平台规则渲染（--render-tools）

从目标技能的 SKILL.md + precheck.conf 派生各 AI 工具原生规则文件（幂等，重渲染为 no-op）：

```bash
bash scripts/generate-skill.sh --render-tools <skill-dir> [project-root] [tool]
# Cursor .cursor/rules/<skill>.mdc；Windsurf .windsurf/rules/<skill>.md；
# Gemini/Codex/OpenCode/Kimi 的 GEMINI.md/AGENTS.md 标记区块段；Claude Code 已深度集成不渲染。
# tool 缺省渲染全部 8 工具；适配器见 assets/tool-adapters/<tool>.sh。install.sh 安装后自动调用。
```

#### 行业 profile（金融 / 医疗 / 政务）

行业立法文档 + 配套 conf 覆盖包，把行业法规条款转成门禁配置：

| 行业 | 立法文档 | 配置包 |
|------|---------|--------|
| 金融 | `references/industry-profile-finance.md`（网安法/数安法/个保法 + 人民银行/金监总局/证监会办法 + JR/T 系列 ↔ 门禁映射） | `assets/industry-profiles/finance.conf` |
| 医疗 | `references/industry-profile-medical.md`（个保法/数安法 + 卫健委办法/互联网诊疗细则 + GB/T 39725 ↔ 门禁映射） | `assets/industry-profiles/medical.conf` |
| 政务 | `references/industry-profile-gov.md`（网安法 21 条/密评/个保法 55-56 + GB/T 22239/39786/43848 ↔ 门禁映射） | `assets/industry-profiles/gov.conf` |

用法：`cat assets/industry-profiles/finance.conf >> <目标技能>/scripts/precheck.conf`，再按项目裁剪（逐行注释含条款依据）；追加后 `bash scripts/precheck.sh --doctor` 诊断应为 0 fail。医疗器械注册申报（SaMD/SiMD）场景不适用，见 standards-compliance.md §E.5 功能安全域占位。

---

### 7. 升级

对 AI 说："升级 my-project-dev skill"

或直接运行：

```bash
bash ~/.claude/skills/swarm-yuan/scripts/generate-skill.sh --upgrade my-project-dev /path/to/project
```

默认继承原 profile。升级先核验项目状态机（`.swarm-yuan/state.yaml`）：任务停在中间阶段（design/build/verify/operate）即以退出码 2 拒绝升级，并点名在途任务与解除路径；仅注册（open）与已归档（archive）放行，确认接受任务前后工具链版本斜切时设 `SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT=1` 显式豁免。通过后在临时副本完成，成功后发布并把完整原件存到 `.upgrade-backup-*`；失败保留原技能。项目正文与已有配置保持，缺失配置项由生成器补齐。

升档示例：`bash swarm-yuan/scripts/generate-skill.sh --upgrade --profile compliance my-project-dev /path/to/project`。新增骨架复用创建流程，状态回到 draft；AI 填完新增项后重新验证激活。升级不重新安装项目 Git hooks。

升级预演：在 `--upgrade` 后加 `--dry-run`，走完整升级流程但不写入任何文件，输出将 add/change/delete 的文件三态清单。预演不落 trace 台账、暂存目录放系统临时目录，并在最后说明实际升级方式。在途状态门对预演放行（零写入无斜切风险），真升级仍按原规则拦截。示例：`bash swarm-yuan/scripts/generate-skill.sh --upgrade --dry-run my-project-dev /path/to/project`。

项目迁移：把项目目录整体移动或克隆到新路径后，在原路径运行 `--upgrade` 会刷新 `PROJECT_DIR` 与技能操作档（SKILL.md 项目根、recipes/codebase/dev-guide/reference-manual 中的旧根路径）；历史 specs/reviews 保持原路径作为证据。技能目录不在新项目根内时只告警不自动改写。

阶段恢复：`bash <技能目录>/scripts/state-machine.sh checkpoint` 创建快照，`restore` 恢复最近快照。恢复会校验决策前缀，先把原状态与账本保存到 `.swarm-yuan/restore-backups/`，再恢复阶段与决策前缀；源码文件需通过 Git 恢复。

---

### 8. FAQ

#### 任务配方（recipes.md）是什么？行为观察（mine-habits）会读我的什么数据？

- **recipes.md**：目标技能里的"装配说明书"——§A 业务功能清单（既有功能各由哪些组件拼成）+ §B 任务配方（高频任务按什么顺序查表/复用/写胶水/过门禁，五要素）。开发时 AI 先查配方再动手；解决新问题后按 SKILL.md 自成长段第⑤环沉淀新配方。
- **mine-habits.sh** 只读 git 元数据（提交信息前缀/分支名/变更文件清单/行数统计），产出 `.swarm-yuan/notes/habits.md` 统计初稿供 AI 审读；不读文件内容、不外传。统计事实 ≠ 规范——书面规则优先。
- **relations.jsonl**：机器可读依赖边集（谁 import 谁），`--stable-diff` 传播与探查消费；`bash scripts/relations-extract.sh <项目根> --skill-dir <技能目录>` 重建。

**Q: 门禁报误报？** → 对 AI 说"precheck 报了误报"。AI 分析原因 → 调整 precheck.conf（特征卡配置）→ 重跑。

**Q: `--reuse` 总是 fail？** → 每次变更前写 spec，填 §5.5 的 4 个 checkbox。核心约束：先声明复用了特征卡第 11 项的哪些单元，再写代码。

**Q: 不需要微服务/前端/TOGAF？** → 特征卡第 10/11 项留空 = 对应门禁静默跳过。

**Q: 项目结构变了？** → 对 AI 说"重新探查并更新 skill"。AI 重新探查 → **更新特征卡** → 更新 precheck.conf。

---

### 9. 数字与口径

全部数字（特征卡 17 / 门禁 56 四族分层 / 运行时 15 / 领域 32 / 认知 5 层 / 兼容 8 工具 / 三平台）不在本文手抄——速览表见 `swarm-yuan/README.md` 附录 A，真值以 `swarm-yuan/assets/facts.conf` 为准（self-check 机器对账，手抄即漂移）。

### 框架规则引擎

swarm-yuan 内置 81 个框架规则集（references/frameworks/*.md + assets/framework-gates/*.sh 1:1 配对），覆盖 Java/Node/Python/Go/前端全栈。

#### 生成时激活

1. **框架探查**（§D.0.5）：从 pom.xml/package.json/go.mod/pyproject.toml 提取依赖，识别 ACTIVE_FRAMEWORKS
2. **门禁注入**（--inject-frameworks）：按 ACTIVE_FRAMEWORKS 把对应门禁片段注入目标技能的 precheck.sh 标记区块
3. **四要素核验**（verify-framework-ruleset.sh）：每框架须通过 枚举+领域知识+门禁+约束 四要素
4. **fixture 正反例**（run-framework-fixture.sh）：每框架含 violating→FAIL / compliant→PASS 测试

#### 扩展新框架

1. 复制 `references/frameworks/_template.md` 为 `<fw>.md`（六节式：§1 探查信号 + §2 构件枚举 + §3 领域规律≥10 + §4 门禁清单 + §5 跨框架交互 + §6 版本陷阱）
2. 创建 `assets/framework-gates/<fw>.sh`（`_fw_<id>_check()` 函数 + 头注释 `# ruleset:` + `# gates:`）
3. 创建 `tests/fixtures/<fw>/{violating,compliant}/`
4. 跑 `bash scripts/verify-framework-ruleset.sh <fw>` 核验
5. 跑 `bash scripts/gen-framework-index.sh` 更新索引（产物：assets/framework-signals.md + exploration-guide.md §D.0.5 指针）

#### 门禁运行

```bash
bash scripts/precheck.sh --framework    # 运行所有激活框架门禁
bash scripts/precheck.sh --all-full     # 标准 29 门禁（核心 11 + 架构 18，含 --framework）
bash scripts/precheck.sh --compliance-suite  # 合规 19 门禁（强监管交付按需）
```

#### 时效检查

`bash scripts/self-check.sh` 末尾自动检查规则库时效（>180 天 warn，>365 天 warn 强烈建议重新核实）。

---

## 术语、易混概念与边界

| 易混对 | 辨析 |
|--------|------|
| **生成器 vs 目标技能** | 生成器 = swarm-yuan 本身（造规则包的）；目标技能 = 生成物（某项目专属的规则包，"生成物"是同义通称，多用于预算/厚薄语境）。两者各有一份 `SKILL.md` 和 `scripts/`——生成器的 SKILL.md 是生成器的入口说明书；目标技能的 SKILL.md 是目标技能的入口说明书（≤11392B，约 11KiB，另有 20000B 硬顶——宿主压缩后重挂载技能在 20000 字符处截断，超线内容整会话消失，管的是**后者**）。 |
| **"自检"一词三义** | ①生成器自检 = 生成器仓库的 `scripts/self-check.sh`（生成流程 Step 1，检查生成器健康）；②目标技能门禁运行 = 目标技能的 `scripts/precheck.sh`（执法检查，日常"提交前自检"指的是它）；③conf 诊断 = 目标技能的 `precheck.sh --doctor`（配置 lint，不判门禁）。三者是三份不同脚本/模式，分属两体。 |
| **.swarm-yuan/ 目录 vs swarm-yuan 仓库** | `.swarm-yuan/`（带点）是**目标技能在目标项目根**落下的运行时数据目录（四本账等）；`swarm-yuan/`（不带点）是生成器仓库/目录。同名是历史沿用，一指数据一指代码。 |
| **门禁家族 vs 严格度 vs 执行序列** | 见 §4「门禁分层」。家族=归哪个套餐管；严格度=会不会阻断；执行序列=怎么触发。三轴正交，互不推出。 |
| **运行时三口径** | "15"=外部运行时**整合**总数（深度整合 4 + CLI 整合 6 + 纯方法论引用 5）；"11"=自检**可检测可安装**的工具数（codex-security 无独立包可装、impeccable 是纯方法论，不在 11 内）；"8"=**安装目标**（生成器可以装进哪几个 AI 助手——install.sh 装的是生成器，不是目标技能；目标技能是在目标项目里生成的，不经 install.sh）。三个数答三个不同问题。 |
| **pass / fail / warn / skip** | pass=通过；fail=阻断（退出非零，必须修）；warn=警告（计数不阻断）；skip=未配置该规矩**明示跳过**——skip 不计入 warn 更不算 pass，防止"没配规矩"被当成"合规"。**fail-open** 是另一回事：指某机制失败时不阻塞主流程（只允许在有下层强制兜底的地方使用）。 |
| **特征卡 vs conf vs spec** | 特征卡=17 项**探查清单**（项目是什么样）；conf=特征卡翻译成的**配置变量**（门禁读它执法）；spec=每个开发任务的**任务规格**（本次需求/决策/测试/规模估算，25 节模板）。三者是"项目立法 → 执法配置 → 任务合同"。 |
| **门禁 vs rules.d 规则** | 门禁=检查**代码与仓库状态**的 bash 函数（56 个，四结果）；rules.d=判定**命令该不该执行**的数据规则（三值）。前者管"代码合不合规矩"，后者管"命令让不让跑"。 |
| **hooks/ 目录 vs scripts/ 目录** | 目标技能里：`scripts/` 放全部可执行脚本（含 5 个钩子脚本）；`hooks/` 只放 `hooks.json`（宿主钩子注册配置）。 |
| **draft vs active** | 目标技能的两个生命周期状态：draft=骨架未填满（禁全量门禁，防半成品错觉）；active=验证无占位符后激活（全量解锁）。 |
| **WP-/R-/决策编号** | 历史档案（design-evolution/CHANGELOG/docs/research 文件名）中的溯源标签（形如 WP- 工作包号、R 加数字的轮次号、决策加数字的决策号），用于追溯"为什么改成这样"。它们不是系统概念；终态文档正文不使用，读者只在历史档案里会遇到。 |
| **verifier v1 vs v2** | v1=内部自洽验收（改动前后行为一致吗——CI 强制）；v2=外部有效验收（门禁能拦真实 bug 吗——测量脚本已落地、语料待采集，未达阈值前对外禁用"100% 可靠"）。 |

---

### 标准术语对照表（黑话清零·禁用词清单）

> **纪律**：用户面文档（SKILL.md / README / references/*.md）禁止使用下列自造词——用右列标准术语；新增写作前先读本表。机器锚（变量名/gate id/文件名/占位词/【生成器侧】）不受此约束。防复发锁：`tests/test-r68-jargon-free.sh`。

| 禁用自造词 | 标准术语 |
|-----------|---------|
| 流A / 流B | 生成流程 / 开发工作流 |
| 接线 | 整合 |
| 机械（执法/计数/提取） | 自动（检查/计数/提取） |
| 执法（独立用法） | 检查 / 拦截（"立法/执法/司法"三权隐喻除外） |
| 台账 | 清单 |
| 三件套 | 生成期必读文件 |
| 认知面 | 上下文预算 |
| 税制 | 预算 |
| 变异锁 | 变异回归断言 |
| 悬置清单 | 待确认事项清单 |
| 能力地图 | 文档索引 |
| 方法论分派表 / 分派表 | 文档路由表 / 路由表 |
| 零占位符 | 无占位符 |
| 双态（夹具/断言） | 正反例 |
| 孤儿 / 幽灵（引用） | 未登记 / 失效引用 |
| 分派零落档 | 文档路由覆盖 |
| 随发或声明 | 分发范围 |
| 随发 | 随技能分发 |
| 对偶 | 互为反查 |
| 双向对账 | 双向一致性校验 |
| 弧线表 | 概念追踪表 |
| 五族 / 四段协议 | 五类 / 四阶段协议 |
| 假绿 / 假红 | 假阳性通过 / 假阳性失败 |
| 失锚 | 校验失效 |
| 空转 | 不生效 |
| 承载位 | 存放位置 |
| 两跳 / 一跳（图遍历） | 一环 / 两环邻接（或"直接/间接引用"） |
| 零件目录（指组件清单本体时） | 组件库清单 |
| 项目地图 | 组件库清单 |
| 执勤九节点 / 9 节点 | 开发工作流九节点 |
| 翻 active | 激活 |

### 术语词典（首次定义汇总，按拼音排序）

- **本体（ontology）**：对系统全部概念的类型化声明（有什么东西、什么关系、什么动作），三份文件 objects/links/actions，是一切机制的上游。
- **受控语言（controlled language）**：AI 面向人的输出纪律——结论先行、一词一义、术语首现定义、短句不跳跃、情态不升降级；规则见技能 references/controlled-language-methodology.md。机器账本（jsonl/conf）不受此约束。
- **账本（ledger）**：目标项目根 `.swarm-yuan/` 下的 JSONL 留痕文件，四本：trace / decisions / gate-runs / gate-audit。
- **档位（profile）**：生成物的轻重配置：lite / standard / compliance / auto。
- **生成器（generator）**：swarm-yuan 本身，元技能——生成目标技能的技能。
- **目标技能（project skill / 生成物）**：生成器为某个项目产出的规则包（含 SKILL.md、references、scripts、rules.d、hooks 配置）。"生成物"是同义通称。
- **门禁（gate）**：检查代码与仓库状态的 bash 函数，56 个，结果为 pass/fail/warn/skip 之一。
- **骨架（skeleton）**：生成器产出的未填充目标技能（draft 态），AI 填充后转 active。
- **骨架铁律（无占位符）**：draft 转 active 前必须无"待填充"占位符——防止半成品被当成品。
- **框架生成期必读文件**：一个技术框架的规则文档 + 门禁片段 + 正反例夹具，三者一致性由 CI 核验。
- **hooks / 宿主 hooks**：AI 编码助手提供的时机钩子机制（写文件前/会话结束等），目标技能把检查脚本挂在上面。
- **夹具（fixture）**：最小测试样本项目，分 violating（必被检出）与 compliant（必通过）正反例。
- **闭环流 / 四本账链式锚定**：账本行间用校验和互相引用，上游篡改导致全链失效可检出。
- **特征卡（feature card）**：17 项项目探查清单，立法产物。
- **外部运行时（runtime）**：被整合的外部工具/方法论，14 个，分深度整合/CLI 整合/方法论引用三层，未装自动降级不阻塞（mattpocock-skills 为仓内物化运行时，恒可达）。
- **组件库清单（map）**：目标技能 references/reference-manual.md 里的两列"路径|说明与约束"清单，≤32KiB（特征卡第 16 项"详尽组件库清单"指同一物；旧称"项目地图/地图/零件目录"已废弃）。
- **Oracle（预言机验证）**：AI 声称完成时由 hook 独立重跑验证命令的机制，"完成了"需经独立验证才算数。
- **facts.conf**：全部招牌数字的唯一权威文件；self-check 用代码真值自动对账。
- **FAIL-open / fail-closed**：失败时放行 / 失败时拒绝。权限边界一律 fail-closed；fail-open 只用于有下层兜底处。
- **五层认知（cognition）**：`references/cognition-framework.md` 定义的五层框架（认知递进/思维语言/认知辩证/偏差防范/辩证认知），特征卡第 13 项的认知基底；属建议性体检（`--cognition` 出报告不判违规），不是门禁家族。
- **spec / spec 模板**：任务规格（每次开发任务的合同），模板 25 节按任务类型裁减（§25 功能点估算 feature 档选填）。
- **生成流程**：生成器把一个仓库变成目标技能的 13 步流程（Step 1-13，逐步详解在 references/generation-flow.md）。
- **开发工作流**：目标技能里的九节点开发工作流（①需求理解→②探查→③设计 spec→④实施 plan→⑤编码→⑥测试→⑦独立审查→⑧合入→⑨发布，载体是目标技能的 references/workflow.md）。
- **档（参考文档）**：references/ 目录下按需阅读的参考文档的简称（"57 档"=57 个 .md 文件；每档开头有"何时读我"路由行）。
- **随技能分发**：随目标技能一起安装分发——generate-skill.sh 的 UNIVERSAL_FILES 清单列出的文件会拷进每个目标技能；不在清单里的文档只存在于生成器仓，目标技能读不到。
- **整合**：一项被吸收的能力"从哪来、在哪个环节被使用、用不了时怎么降级"的登记关系。
- **文档索引（capability-map.md）**：吸收内容的总清单——每个参考文档的来源、证据分级、被使用的环节、何时读；生成器侧维护，不随技能分发。
- **文档路由表**：references/task-methodology-router.md 里"任务类型 → 该读哪些参考文档"的反查表，随目标技能分发；与文档索引互为反查——索引从文档查用途，路由表从任务查文档。
- **【生成器侧】**：路由表里的标注，表示该文档只在生成器仓里存在、不随目标技能分发（引用它的任务是在生成器里做的）。
- **G 断言（G13-G25 等）**：生成器 self-check 里编号的自检断言；G25=文档索引双向一致性校验（每个参考文档都进清单、清单不记幽灵、路由表与清单互指、任务分派可达、被分派的文档随技能分发或在生成器侧）。
- **生成期必读文件（生成期必读面）**：SKILL.md + exploration-guide.md + template-spec.md——跑生成流程前必读的三个文件，合计字节数有预算上限。
- **上下文预算**：AI 一次会话要读的文档总量（按字节计），分两条预算线：生成期必读生成期必读文件、随技能分发总量（UNIVERSAL_FILES 拷贝体积）。
- **预算**：预算的别名——把每次会话的固定阅读成本当作"税"，超出上限必须逐例登记说明理由，不许静默膨胀。
- **变异回归断言**：证明校验真能拦住错的正反测试——正向：合规样本必须通过；负向：故意注入违规必须被拦。防"断言永远绿但其实拦不住"。
- **证据分级 A/B/C**：吸收外部内容时的采信等级——A=本机实测、B=官方一手资料直查、C=二手转述（未经核验不写入基线）。

---

### 边界与诚实声明（它不做什么）

1. **不替代宿主**：AI 助手（Claude Code/Codex 等）管会话循环、沙箱、审批通道；本系统只管项目上下文、业务规则、操作边界。
2. **Windows 硬前置 bash**：原生 cmd/PowerShell 不支持——Windows 用户须先装 Git for Windows（自带 Git Bash）或 WSL。
3. **重量级是设计选择**：小项目请用 lite 档或更轻的替代（单拷 precheck.sh / 传统 lint 工具链 / 直接对 AI 说需求），不必强上本系统。
4. **外部有效性未达成**：verifier v2（门禁能否拦截真实缺陷）的语料评测未完成前，对外不说"100% 可靠"；已验证的是"组件测试 + 受约束生成 + 独立校验"三段。
5. **降级是常态不是异常**：外部工具未装就降级（图谱工具→grep），合规规矩未配置就明示 skip——系统不假装满配运行。
6. **门禁不抓逻辑错误**：56 个门禁全是词法/结构模式匹配（import 方向、注解模式、文件存在性、命令黑名单）——它们抓"不懂规矩"，不抓"想错逻辑"。逻辑错误的兜底是**测试+审查**，且机器层对兜底本身有核验：①测试兜底要求 spec §11 测试策略段有实质内容（check_shift_left 核验非占位）；check_test 除退出码外核验零用例、覆盖率阈值、零断言/断言密度、负向用例占比与聚焦测试，可选追加 mutation score；`--api` 按 HTTP 方法 × 路径模板核对端点映射，并要求每个已覆盖端点有自己的就近状态码/错误路径断言；②审查兜底要求留痕（check_review 核验 docs/reviews/<日期>.md 存在，三要素：评审人/日期/结论；模板随生成物分发 assets/review-record-template.md）。这是设计边界，不是缺陷（SKILL.md:16"自动脚本不假装能判断质量"）——但"该做的兜底没做"是机器可查的。
7. **流程强制的覆盖边界**：spec 前置门（SPEC_REQUIRED=1）拦"无 spec 写源码区"，门禁失败捕获门（GATE_ENFORCE_DENY）拦"fail 未修复继续写"——但流程节点的**判断质量**（spec 写得对不对、plan 是否合理）仍是 AI/人的责任，机器只管"顺序与存在性"，不管"内容好坏"。

---

### 阅读地图（接下来读什么）

| 想深入了解 | 去读 |
|-----------|------|
| 设计内核（What/Why/How/实现/When/总结+附录） | `swarm-yuan/README.md`（唯一设计文档） |
| 每个数字的权威值 | `swarm-yuan/assets/facts.conf` |
| 为什么门禁长这样（改动前必读） | `docs/design-evolution.md` §12 决策史（决策 1-46；1-17 见其 §13 档案 A5） |
| 生成流程逐步口径 | `swarm-yuan/references/generation-flow.md`（Step 1-13） |
| 81 框架各自的规则 | `swarm-yuan/references/frameworks/` |
| 验收体系怎么运作 | `verifier/README.md` 与 `verifier/v1/acceptance-criteria.md` |
| 调研证据（方案怎么长出来的） | `docs/research/`（各轮调研报告，文件名带轮次编号） |

> 维护注记：本段是解释层，不承载规格——若与设计文档（`swarm-yuan/README.md`）冲突以设计文档为准，并视为本段需要修订；发现歧义请按"术语词典"先对齐命名再讨论。
