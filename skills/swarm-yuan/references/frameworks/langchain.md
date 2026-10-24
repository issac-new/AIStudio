---
ruleset_id: langchain
适用版本: LangChain 0.3.x（LTS）/ 1.0（2025-10-22 GA）+ LangGraph 现行（差异单独标注）
最后调研: 2026-07-20（来源：https://python.langchain.com/docs/versions/v0_3/ ；https://docs.langchain.com/oss/python/security-policy ；https://unit42.paloaltonetworks.com/langchain-vulnerabilities/ ；https://securityaffairs.com/186185/hacking/langchain-core-vulnerability-allows-prompt-injection-and-data-exposure.html ）
深度门槛: 10
---

# LangChain 规则集

<!--
本规则集覆盖 LangChain Python 0.3.x（LTS 分支）/ 1.0（2025-10-22 GA，承诺至 2.0 无破坏性变更）
+ langchain-core + 伙伴包（langchain-openai 等）+ LangGraph 现行版本。
调研时点：2026-07-20。核心背景：0.1→0.3 为持续 API 漂移期（LLMChain/AgentExecutor/旧导入路径
相继弃用），1.0 将旧 API 整体迁入 langchain-classic 包；安全侧有 CVE-2023-44467（PALChain
prompt 注入 RCE）、CVE-2023-36189（SQLDatabaseChain SQL 注入）、CVE-2025-68664（langchain-core
序列化注入 LangGrinch，CVSS 9.3）三起实证。无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `langchain` / `langchain-core` / `langchain-community` / `langgraph`（requirements.txt / pyproject.toml） | 高 |
| 代码 | `from langchain` / `from langchain_core` / `from langchain_openai` / `from langgraph` | 高 |
| 代码 | `PromptTemplate(` / `ChatPromptTemplate` / `AgentExecutor` / `create_react_agent` / `StateGraph(` | 中（需与依赖信号组合） |
| 配置 | `LANGCHAIN_TRACING_V2` / `LANGSMITH_API_KEY` / `OPENAI_API_KEY` 环境变量 | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 langchain 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 链/LCEL 管道：`grep -rnE 'PromptTemplate\(|ChatPromptTemplate|\|[[:space:]]*StrOutputParser' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- Agent：`grep -rnE 'AgentExecutor|create_react_agent|create_tool_calling_agent|create_agent\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- 工具：`grep -rnE '@tool|Tool\(|BaseTool' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- 检索器/向量库：`grep -rnE 'as_retriever\(|FAISS|Chroma|PGVector' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中文件数）
- LangGraph 图：`grep -rnE 'StateGraph\(|add_node\(|compile\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：StateGraph( 命中行数）
- 记忆：`grep -rnE 'Memory\(|RunnableWithMessageHistory|ChatMessageHistory' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：0.1 时代导入路径必须迁移 langchain_core/伙伴包
- **适用版本**: LangChain ≥0.2（0.3 / 1.0 同）
- **规律**: `from langchain.chat_models import ChatOpenAI`、`from langchain.llms import OpenAI`、`from langchain.prompts import`、`from langchain.schema import`、`from langchain.callbacks import`、`from langchain.memory/document_loaders/vectorstores/embeddings/text_splitter import` 等 0.1 路径已相继弃用或移除：模型类迁伙伴包（`langchain_openai` 等），核心抽象迁 `langchain_core.*`，文本切分迁 `langchain_text_splitters`。
- **违反后果**: 升级即 ImportError/ModuleNotFoundError；旧教程代码直接粘贴必炸。
- **验证方法**: 检出 `from langchain.(chat_models|llms|prompts|schema|callbacks|memory|document_loaders|vectorstores|embeddings|text_splitter) import` → fail。
- **对应门禁**: fw_langchain_legacy_imports(fail)

```verify
id: langchain-r1
cmd: 
expect: always
```

- **证据**: LangChain 0.3 版本说明与迁移指南（https://python.langchain.com/docs/versions/v0_3/ ；https://python.langchain.com/docs/versions/migrating_chains/ ）：“integrations moved out of langchain-community into dedicated langchain-{name} packages”。

### 规律：LLMChain / initialize_agent / .run() 旧链式 API 必须迁 LCEL + .invoke()
- **适用版本**: LangChain ≥0.2（0.1 弃用 LLMChain，0.2 弃用 AgentExecutor，0.3 移除 initialize_agent）
- **规律**: `LLMChain(llm=..., prompt=...)` 由 LCEL 管道 `prompt | llm | StrOutputParser()` 取代；`initialize_agent(...)` 已移除，由 `create_react_agent`/`create_tool_calling_agent`（1.0 起 `create_agent`，底层 LangGraph）取代；链/Agent 执行统一 `.invoke()`（异步 `.ainvoke()`），旧 `.run()` 弃用。
- **违反后果**: 0.3/1.0 环境 ImportError/AttributeError；旧 API 无维护，行为差异静默引入 bug。
- **验证方法**: 检出 `LLMChain(`/`initialize_agent(`/`chain.run(`/`agent.run(`/`executor.run(` → fail。
- **对应门禁**: fw_langchain_legacy_chain(fail)

```verify
id: langchain-r2
cmd: 
expect: always
```

- **证据**: 0.1.0 弃用 LLMChain 推荐 LCEL、0.2.0 弃用 AgentExecutor、0.3.0 要求 Pydantic v2 并移除 initialize_agent（https://python.langchain.com/docs/versions/v0_3/ ；https://python.langchain.com/docs/versions/migrating_chains/ ）。

### 规律：API 密钥禁止硬编码进源码，必须环境变量/密钥管理
- **适用版本**: 全版本
- **规律**: `ChatOpenAI(api_key="sk-...")`、`openai_api_key="..."`、`os.environ["OPENAI_API_KEY"] = "sk-..."` 等写法把密钥钉进源码与 git 历史。密钥必须 `os.environ.get("OPENAI_API_KEY")` 读取或经 AWS Secrets Manager/Vault 等密钥管理服务注入；模型构造默认自行读环境变量，优先不传参。
- **违反后果**: 密钥随仓库泄露即被计费盗用与数据外泄（CWE-798）；git 历史残留须轮换密钥才能止损。
- **验证方法**: 检出 `(api_key|apikey|api_secret|secret_key|access_token)="..."`（≥8 字符字面值）或 `os.environ["..."] = "..."` 赋值 → fail。
- **对应门禁**: fw_langchain_hardcoded_key(fail)

```verify
id: langchain-r3
cmd: 
expect: always
```

- **证据**: LangChain 安全最佳实践（https://milvus.io/ai-quick-reference/how-do-i-implement-security-best-practices-in-langchain ：“avoid hardcoding them in scripts and instead use environment variables or secret management tools”）；CWE-798 Use of Hard-coded Credentials。

### 规律：PythonREPL/PALChain 等代码执行工具只允许在沙箱内使用
- **适用版本**: 全版本（langchain-experimental 高危区）
- **规律**: `PythonREPLTool`/`PythonREPL`/`load_tools(["python_repl"])`/`PALChain` 把 LLM 生成文本直接喂 Python 解释器。prompt 注入即可诱导模型输出任意代码——官方黑名单（system/exec/eval）可被 `__import__` 等动态特性绕过，黑名单路线本质不可守。此类工具仅可在无网络、无凭证、一次性容器沙箱内使用。
- **违反后果**: 远程代码执行（CWE-94）、宿主机文件读写、内网横移；CVE-2023-44467（PALChain prompt 注入 RCE）为实证。
- **验证方法**: 检出 `PythonREPL`/`python_repl`/`PALChain` → fail。
- **对应门禁**: fw_langchain_dangerous_tool(fail)

```verify
id: langchain-r4
cmd: 
expect: always
```

- **证据**: Unit42《Vulnerabilities in LangChain Gen AI》（https://unit42.paloaltonetworks.com/langchain-vulnerabilities/ ：CVE-2023-44467，演示 `__import__("subprocess")` 绕过 AST 黑名单达成 RCE）。

### 规律：SQLDatabaseChain / create_sql_agent 必须只读凭证 + 最小权限 + 人工复核
- **适用版本**: 全版本（langchain-experimental）
- **规律**: 模型生成 SQL 未经人工确认直送数据库执行：prompt 注入或模型误判即可产出 DROP/DELETE/越权 SELECT。官方安全策略要求"假设 LLM 可能按其凭证权限做任何事"——数据库账号必须只读、行级权限收敛、禁连生产主库，写操作须人工复核闸门。
- **违反后果**: 数据篡改/删除/拖库（CWE-89 SQL 注入）；CVE-2023-36189（SQLDatabaseChain SQL 注入，CVSS 7.5）为实证。
- **验证方法**: 检出 `SQLDatabaseChain`/`create_sql_agent` → warn（提示人工落实只读凭证与复核）。
- **对应门禁**: fw_langchain_sql_chain(warn)

```verify
id: langchain-r5
cmd: 
expect: always
```

- **证据**: LangChain 官方安全策略（https://docs.langchain.com/oss/python/security-policy ：“Limit permissions … use read-only credentials”；“assume that any system access or credentials may be used in any way allowed”）；VulDB CVE-2023-36189 条目。

### 规律：PII 字段进 prompt 前必须脱敏/假名化
- **适用版本**: 全版本
- **规律**: prompt 模板或 .format() 拼接身份证号、手机号、护照、银行卡等 PII 字段后直送第三方 LLM，即构成个人信息对外提供。送模前必须脱敏（掩码/假名化/本地小模型前置清洗），并在日志与 trace 层同步屏蔽；无法脱敏的场景改用私有化部署模型。
- **违反后果**: 个人信息泄露（CWE-359）；违反 GB/T 35273《信息安全技术 个人信息安全规范》最小必要与委托处理要求。
- **验证方法**: 文件含 `PromptTemplate|ChatPromptTemplate|.format(` 且含 `id_card|idcard|phone_number|mobile|passport|ssn|bank_card|身份证|手机号` → warn。
- **对应门禁**: fw_langchain_pii_prompt(warn)

```verify
id: langchain-r6
cmd: 
expect: always
```

- **证据**: CWE-359 Exposure of Private Information；GB/T 35273-2020 个人信息最小必要原则；LangChain 安全实践“PII is anonymized or pseudonymized before being sent to LLMs”（https://milvus.io/ai-quick-reference/how-do-i-implement-security-best-practices-in-langchain ）。

### 规律：Chat 模型构造必须显式 timeout / max_retries，限流抖动要有缓冲
- **适用版本**: 全版本
- **规律**: `ChatOpenAI(model=...)` 裸构造不带 `timeout`/`max_retries`（各伙伴包参数名略异，如 `request_timeout`），遭遇 429 限流/网络抖动时请求挂死或直接失败级联。生产必须显式超时（如 timeout=30）+ 有限重试（max_retries=2~3），批量/长链路场景叠加 tenacity 指数退避。
- **违反后果**: 限流期级联超时雪崩；无上限重试放大计费与限流。
- **验证方法**: 文件含 `Chat(OpenAI|Anthropic|Tongyi|...)(` 但无 `timeout|max_retries` → warn。
- **对应门禁**: fw_langchain_retry_timeout(warn)

```verify
id: langchain-r7
cmd: 
expect: always
```

- **证据**: LangChain 0.3 新增 chat model 工具集“rate limiting … to make long-running or high-traffic agents easier to manage”（https://www.crawleo.dev/blog/langchain-v03-tutorial-and-migration-guide-for-2026 ）；生产实践“Wrap LLM calls in retry logic with exponential backoff”（https://github.com/sickn33/antigravity-awesome-skills multi-agent-architect）。

### 规律：async 上下文内禁止同步 .invoke()，必须 await .ainvoke()
- **适用版本**: 全版本（Runnable 接口统一后同）
- **规律**: FastAPI/async 服务内调用链的同步 `.invoke()` 是数十秒级阻塞调用，与 time.sleep 同害——整个事件循环停摆，该 worker 全部并发请求饿死。异步路径必须 `await chain.ainvoke(...)` / `.astream()`；不得不用同步时 run_in_threadpool。
- **违反后果**: 事件循环阻塞，并发吞吐崩塌，超时级联。
- **验证方法**: 文件含 `async def` 且检出 `.invoke(` 但无 `ainvoke` → warn。
- **对应门禁**: fw_langchain_async_sync(warn)

```verify
id: langchain-r8
cmd: 
expect: always
```

- **证据**: LangChain Runnable 接口异步方法族 ainvoke/astream（https://reference.langchain.com/v0.3/python/ ）；FastAPI async 阻塞通用机理（本库 fastapi.md §3 同型规律）。

### 规律：verbose=True 仅调试用，生产泄露 prompt 与工具入参
- **适用版本**: 全版本
- **规律**: `AgentExecutor(..., verbose=True)` / chain verbose 会把完整 prompt、LLM 中间推理、工具入参（常含用户数据/检索内容）打印进 stdout/日志。生产关闭 verbose，可观测性改 LangSmith/回调结构化 trace 并按需脱敏。
- **违反后果**: 日志敏感信息泄露（CWE-532），prompt 与业务数据经日志管道外泄。
- **验证方法**: 检出 `verbose=True` → warn。
- **对应门禁**: fw_langchain_verbose(warn)

```verify
id: langchain-r9
cmd: 
expect: always
```

- **证据**: CWE-532 Insertion of Sensitive Information into Log File；LangChain 安全实践“log data usage, but be cautious not to log sensitive information”（https://zilliz.com/ai-faq/how-do-i-implement-security-best-practices-in-langchain ）。

### 规律：对话记忆必须有 token 上限，防爆上下文窗口
- **适用版本**: 全版本（0.3 起推荐 RunnableWithMessageHistory + trim_messages）
- **规律**: `ConversationBufferMemory()` 默认全量保留历史：长会话累积超过模型上下文窗口即 API 报错，token 计费随轮次线性膨胀。必须 `max_token_limit` 封顶（0.3 语义为超限裁剪），或改 `ConversationBufferWindowMemory`/`ConversationSummaryBufferMemory`，或直接 `trim_messages` 裁剪。
- **违反后果**: 长会话必崩（context length exceeded）；计费失控。
- **验证方法**: 检出 `ConversationBufferMemory(` 但无 `max_token_limit` → warn。
- **对应门禁**: fw_langchain_memory_limit(warn)

```verify
id: langchain-r10
cmd: 
expect: always
```

- **证据**: LangChain 0.3 提供“message trimming/merging helpers”（https://www.crawleo.dev/blog/langchain-v03-tutorial-and-migration-guide-for-2026 ）；RAG/记忆工程实践“Chunks too large — Won't fit in context”（https://github.com/davila7/claude-code-templates agents-langchain/references/rag.md）。

### 规律：AgentExecutor 必须 max_iterations 兜底，防 agent 死循环烧钱
- **适用版本**: AgentExecutor 存续版本（0.2 起弃用但存量广）；LangGraph 场景同须 recursion_limit
- **规律**: agent 工具循环不收敛（模型反复选错工具/参数）时无 `max_iterations` 即无限调用 LLM。必须 `max_iterations`（默认 15，按场景收紧）与 `max_execution_time` 双兜底；LangGraph 图同须 `recursion_limit` 配置。
- **违反后果**: 死循环 token 计费失控；请求挂死占满 worker。
- **验证方法**: 文件含 `AgentExecutor` 但无 `max_iterations` → warn。
- **对应门禁**: fw_langchain_agent_loop(warn)

```verify
id: langchain-r11
cmd: 
expect: always
```

- **证据**: 多智能体工程实践“Problem: Agent loops indefinitely … return 'end' when step_count > N”（https://github.com/sickn33/antigravity-awesome-skills multi-agent-architect）；AgentEvals 成本视角“Agent 为解决简单 Bug 消耗 10 万 Token 即商业失败”（https://juejin.cn/post/7613514109243834387 ）。

### 规律：allow_dangerous_deserialization=True 只允许加载自产可信产物
- **适用版本**: ≥0.2（FAISS 等向量库本地加载默认拒绝 pickle 反序列化）
- **规律**: `FAISS.load_local(..., allow_dangerous_deserialization=True)` 打开 pickle 反序列化开关：加载外部来源索引文件等价于执行其中内嵌代码。该开关只允许指向本系统自产的索引产物，且产物存储须防篡改；禁加载用户上传/网络下载产物。
- **违反后果**: 恶意 pickle 反序列化 RCE（CWE-502）。
- **验证方法**: 检出 `allow_dangerous_deserialization=True` → warn。
- **对应门禁**: fw_langchain_untrusted_deser(warn)

```verify
id: langchain-r12
cmd: 
expect: always
```

- **证据**: CWE-502 Deserialization of Untrusted Data；langchain-core 序列化注入 CVE-2025-68664（LangGrinch，CVSS 9.3，https://securityaffairs.com/186185/hacking/langchain-core-vulnerability-allows-prompt-injection-and-data-exposure.html ）证明 LangChain 生态序列化面是真实攻击面。

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_langchain_legacy_imports | fail | from langchain.(chat_models\|llms\|prompts\|schema\|callbacks\|memory\|document_loaders\|vectorstores\|embeddings\|text_splitter) import → fail | LANGCHAIN_SRC_GLOBS | — |
| fw_langchain_legacy_chain | fail | LLMChain(/initialize_agent(/chain.run( 等旧 API → fail | LANGCHAIN_SRC_GLOBS | — |
| fw_langchain_hardcoded_key | fail | api_key="..."/os.environ["..."]="..." 字面值密钥 → fail | LANGCHAIN_SRC_GLOBS | CWE-798 |
| fw_langchain_dangerous_tool | fail | PythonREPL/python_repl/PALChain → fail 代码执行须沙箱 | LANGCHAIN_SRC_GLOBS | CWE-94；CWE-74 |
| fw_langchain_sql_chain | warn | SQLDatabaseChain/create_sql_agent → warn 只读凭证+人工复核 | LANGCHAIN_SRC_GLOBS | CWE-89；CWE-74 |
| fw_langchain_pii_prompt | warn | prompt 模板+PII 字段（身份证/手机号等） → warn 须脱敏 | LANGCHAIN_SRC_GLOBS | CWE-359；GB/T 35273 |
| fw_langchain_retry_timeout | warn | Chat 模型构造无 timeout/max_retries → warn | LANGCHAIN_SRC_GLOBS | CWE-400 |
| fw_langchain_async_sync | warn | async def 文件检出 .invoke( 且无 ainvoke → warn | LANGCHAIN_SRC_GLOBS | CWE-400 |
| fw_langchain_verbose | warn | verbose=True → warn 生产泄露 prompt/中间步 | LANGCHAIN_SRC_GLOBS | CWE-532 |
| fw_langchain_memory_limit | warn | ConversationBufferMemory( 无 max_token_limit → warn | LANGCHAIN_SRC_GLOBS | — |
| fw_langchain_agent_loop | warn | AgentExecutor 无 max_iterations → warn 死循环烧钱 | LANGCHAIN_SRC_GLOBS | — |
| fw_langchain_untrusted_deser | warn | allow_dangerous_deserialization=True → warn 仅可信产物 | LANGCHAIN_SRC_GLOBS | CWE-502 |

<!--
门禁 id 命名规范：fw_langchain_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/langchain.sh 中有同名实现痕迹（grep 命中）。
prompt 注入类（dangerous_tool/sql_chain）挂 CWE-74（Improper Neutralization of Special Elements
in Output Used by a Downstream Component，即"Injection"泛类）；PII 类挂 CWE-359 与 GB/T 35273。
片段头注释 `# gates: fw_langchain_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: langchain  requires_conf: LANGCHAIN_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 0.1 导入 + LLMChain/initialize_agent + 硬编码密钥 + PythonREPL
→ legacy_imports/legacy_chain/hardcoded_key/dangerous_tool 四个 fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| langchain × fastapi | async 路由内链调用必须 ainvoke；密钥经环境变量注入不进依赖项 | 同步 invoke 阻塞事件循环；密钥入 DI 容器易随日志外泄 |
| langchain × pydantic | 0.3 起 core 要求 Pydantic v2；自定义 output parser 模型须 model_rebuild() | v1 模型在 v2 语义下校验行为静默变化 |
| langchain × celery | 长链路链/Agent 执行推 Celery 任务，HTTP 请求路径只做投递 | LLM 调用数十秒超 HTTP 超时，同步等待拖垮 worker |
| langchain × redis | RedisChatMessageHistory 键须按 session_id 隔离并设 TTL | 会话串扰与内存泄漏 |

<!--
无强交互的框架组合省略；本表聚焦 langchain 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| LangChain 0.1.0（2024-01） | LLMChain 弃用，推荐 LCEL | 链式代码迁移起点 |
| LangChain 0.2.0（2024-05） | AgentExecutor 弃用（推荐 LangGraph）；向量库本地加载默认拒绝危险反序列化 | Agent 模式迁移起点；FAISS.load_local 须显式开关 |
| LangChain 0.3.0（2024-09） | 弃 Python 3.8/3.9；core 要求 Pydantic v2；initialize_agent 移除；伙伴包拆分完成 | 0.1 导入路径/旧 API 大面积报错 |
| LangChain 1.0.0（2025-10-22 GA） | 旧 API 整体迁 langchain-classic 包；create_agent（LangGraph 背书）为官方入口；承诺至 2.0 无破坏性变更 | 未迁移代码须装 langchain-classic 过渡 |
| langchain-core 1.2.5 / 0.3.81（2025-12） | 修复 CVE-2025-68664 序列化注入（LangGrinch，CVSS 9.3） | 低于此版本须立即升级 |
| langchain-experimental <0.0.306 | CVE-2023-44467 PALChain prompt 注入 RCE | experimental 包视为高危区，生产慎用 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的
版本号匹配本表，落在受影响区间的项目须额外提示。
-->
