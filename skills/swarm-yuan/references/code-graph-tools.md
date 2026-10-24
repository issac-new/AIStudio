> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 代码图谱工具引用 (Code-Graph Tools Reference)

# 代码图谱工具引用 (Code-Graph Tools Reference)

> 本文件指导目标技能如何**引用调用** [GitNexus](https://github.com/abhigyanpatwari/GitNexus)、[graphify](https://github.com/Graphify-Labs/graphify) 与 [codegraph](https://github.com/colbymchenry/codegraph) 构建代码知识图谱。
> **铁律：只引用调用工具命令，不复制其源码，不重新实现其功能。**

## 为什么用代码图谱

AI agent 理解代码库时，传统方式是 grep + 读文件——易遗漏关系、上下文爆炸。代码图谱工具将整个代码库索引为知识图（依赖、调用链、簇、执行流），agent 查询图谱而非 grep，**不漏关系、省上下文**。

## 选型（按技术能力）

> 数据实测 2026-07-20；codegraph 行 2026-09-18 增（API 核验 + 文章转述，未本机跑通——选型参考级）。
> **选型方针（2026-07-21 起）：范式层面按技术能力选型，不因开源组件商业授权条款降级或调整优先级。** 授权合规评估是使用方组织自身的责任（登记见下表「许可证」列，仅供使用方自查），不进入 swarm-yuan 的工具默认/降级决策。

| 工具 | 许可证（事实登记，供使用方自查） | 能力定位 |
|------|--------|----------|
| **graphify** | Apache-2.0（2026-07-18 MIT→Apache 2.0） | 广谱知识图（代码+文档+媒体）、可提交 graph.json、Mermaid 导出；**--watch 自动同步（代码变更免 LLM 即时重建+文档/图片仅通知）+ git commit hook + --wiki agent 可爬取知识库导出**；91.7k stars、活跃（2026-10 核验） |
| **GitNexus** | PolyForm Noncommercial 1.0.0（GitHub API 返回 NOASSERTION，LICENSE 原文实测 2026-07-20；2026-09-14 复核不变） | 深度代码调用图、Tree-sitter 原生解析、LadybugDB 持久图、`--pdg` 污点分析、PreToolUse/PostToolUse hooks、多仓库 group query（v1.6.12 stable（2026-09-12 tag）；license-risk 结论不变——v1.6.12 含诚实状态报告（diverged/unknown 索引态显式报告 + foreign embedding fail-closed），license 解除前零接触） |
| **codegraph** | MIT（GitHub API 2026-09-18 实测；71,356★、2026-01 创建、活跃） | 预索引代码知识图 + 代码变更自动同步；**单 MCP 工具** `codegraph_explore`（自然语言任务描述，自主决定检索深度）+ `codegraph explore/affected` CLI；100% 本地（SQLite + FTS5，无 LLM API）；代码变更时索引自动更新 |

三者**平权**，按项目需要选择或并用：
- 侧重深度调用链分析、持久 DB、多仓库、 hooks 集成 → GitNexus
- 侧重广谱（代码+文档+媒体）、可提交的图、Mermaid 可视化 → graphify
- 侧重零配置本地索引、单工具自主检索、子代理 CLI 通道、索引随代码自动同步 → codegraph
- 大型项目可并用：如 codegraph/GitNexus 做深度调用图，graphify 做广谱知识图 + Mermaid 可视化

补充说明：

- **graphify 仓库已迁移**：org URL 由 `safishamsi/graphify` 迁至 [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)（GitHub API 2026-07-20 实测），引用一律用新 URL。
- **graphify 引用基线：v0.9.75（GitHub v8 线）**——名为 v1.0.0 的 tag 是 2026-04-05 旧异源分支、版本线归属实测不在 v8 线，**不取**（npm `graphifyy` 通道的 0.10.0/v1.0.0 同源；0.x 版本升级前须核验版本线归属：merge-base 祖先确认在 v8 线才升）。选型相关的三项能力：--watch 后台自动同步（代码保存触发 AST-only 即时重建零 LLM、文档/图片变更仅通知跑 --update 做 LLM 复扫——确定性/语义分流）+ post-commit git hook（每次提交自动重建，无后台进程）+ --wiki 导出（每社区/god node 一篇 Wikipedia 式 markdown+index.md 入口，agent 读文件即可导航知识库，不必解析 JSON）；基准表规模条件化（6 文件 ~1x——小语料价值是结构清晰非压缩、52 文件 71.5x，worked/ 目录含原始输入+真实输出可自行复验）。
- **codegraph 证据与边界**：官方基准（B 级）工具调用 −88% / token −62% / 成本 −44%、文件读取归零（7 仓库×4 次）；**上下文残留 +80%**（官方诚实声明——索引驻留上下文的代价）；Swift 27k 文件约 100s、Linux 内核 70k 文件约 12min（文章转述 C 级）。选型对照：GitNexus 给 17 个确定性 MCP 查询工具，codegraph 押单工具+模型自主检索（工具面哲学对照见 `mcp-governance.md` 工具面设计三原则）。本机未实测安装与索引（npm/cargo 安装形态未核）——**整合前置条件：本机跑通一次索引+查询再进目标技能默认推荐**。

## GitNexus（Node 生态，深度代码调用图）

### 安装
```bash
npm install -g gitnexus
# 或一次性（不安装）：
npx gitnexus@latest analyze
# 可选：跳过部分语法（Dart/Proto/Swift/Kotlin）
GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 npm install -g gitnexus
```

### 核心命令
```bash
gitnexus setup # 一次性：为检测到的编辑器写 MCP 配置（-c 选择）
gitnexus analyze [path] # 索引仓库（或更新过期索引）— 在仓库根运行
gitnexus analyze --force # 全量重建
gitnexus analyze --embeddings [n] # 启用语义嵌入（默认上限 50000 节点；0 禁用）
gitnexus analyze --skills # 生成仓库专属 skill 文件
gitnexus mcp # 启动 MCP server（stdio）— 服务所有已索引仓库
gitnexus serve # 本地 HTTP server（多仓库）供 Web UI 桥接
gitnexus list # 列出所有已索引仓库
gitnexus status # 当前仓库的索引状态
gitnexus clean [--all --force] # 删除索引
gitnexus wiki [path] [--model m] # 从图谱生成仓库 wiki
gitnexus group create <name> # 多仓库/monorepo 组 + 跨仓库契约同步
```

### 输入/输出
- **输入**：本地仓库路径（默认当前目录）。Tree-sitter 原生绑定解析多语言
- **输出**：持久本地知识图（LadybugDB，存于 `.gitnexus/`，gitignored）；`AGENTS.md`/`CLAUDE.md` 上下文文件；`.claude/skills/gitnexus/` skill 文件；MCP server 暴露图谱查询工具

### Agent 集成模式
1. `npm install -g gitnexus`
2. `gitnexus setup`（注册 MCP 到编辑器）或手动：`claude mcp add gitnexus -- npx -y gitnexus@latest mcp`
3. `gitnexus analyze`（在目标仓库根构建索引）
4. agent 调用 GitNexus MCP 工具（依赖查询、调用链遍历、簇查询）替代 grep
5. 索引过期（提交后）→ 重新 `gitnexus analyze`

## graphify（Python 生态，广谱知识图）

### 安装
```bash
# 推荐（隔离环境）：
uv tool install graphifyy
# 或：
pipx install graphifyy
```
> ⚠️ PyPI 包名是 `graphifyy`（双 y）。其他 `graphify*` 包不相关。
> ⚠️ `uvx graphify` 会失败——必须 `uvx --from graphifyy graphify install`。
> ⚠️ 若 `graphify: command not found`，运行 `uv tool update-shell`（或 `pipx ensurepath`）后重开终端。
> 📌 **v0.9.42 Windows 可移植性加固**：`source_file` 与模型面向的路径规范为 POSIX；原子写/install 对 Windows 加固（含只读打包 bundle）；`GRAPH_REPORT.md` 用可移植 basename 而非宿主绝对路径。Windows 上 graph.json 的 node id 不含 `\` 路径（v0.9.40 修复跨平台 `source_file` 绝对路径泄漏）。graph provenance（`built_at_commit`）从被分析仓库盖戳，而非 shell cwd——与 swarm-yuan `trace-log.sh` 的 honest-edge provenance（EXTRACTED/INFERRED/AMBIGUOUS）一致：溯源锚到真实仓库，不锚到运行环境。

### 核心命令
```bash
graphify install # 注册 skill 到 AI 助手（默认 Claude Code）
graphify install --platform agents # 注册到 .agents/skills/（跨框架）
graphify install --project # 安装到当前仓库而非用户 profile
graphify . # 构建图谱（当前文件夹）
graphify . --watch # 后台自动同步：代码保存即时重建（AST-only 零 LLM）；文档/图片变更仅通知跑 --update
graphify . --wiki # 导出 agent 可爬取知识库（index.md + 每社区/god node 一篇 markdown）
graphify . --update # 增量 LLM 复扫（--watch 通知后续接）
graphify extract ./docs --backend claude # 无头提取（非代码需 API key）
graphify query "什么连接了 auth 和数据库？" # 自然语言查询 graph.json
graphify path "ComponentA" "ComponentB" # 依赖链/最短路径
graphify explain "RateLimiter" # 节点邻域
graphify export callflow-html # Mermaid 调用流 HTML
graphify hook install # git commit 时自动重建图
graphify hook-guard <search|read> # hook 守卫子命令（跨平台，v0.9.8+）
graphify merge-graphs a.json b.json # 合并图
python -m graphify.serve graphify-out/graph.json # MCP server（stdio）
python -m graphify.serve graph.json --transport http --port 8080 # 共享 HTTP MCP
```

> ⚠️ **hook-guard 子命令（v0.9.8+）**：`PreToolUse` / `BeforeTool` hook 逻辑已移入 shell 无关的 `graphify hook-guard <search|read>` 子命令，Windows/macOS/Linux 行为字节一致。不再依赖 POSIX bash 内联（`case/esac`、`[ -f ]`），Windows 上 hook 不再静默失败。Gemini 的 `BeforeTool` 用 `graphify hook-guard gemini`，移除对 bare `python` 在 PATH 的依赖。

### ECC v2.0 Hook 治理（hook runtime governance）

> 来源：ECC v2.0.0。Hook 管理采用运行时 profile + env gating + dispatcher 架构。

#### Hook Runtime Governance

ECC 的 hook 系统有 4 层治理：

| 层 | 机制 | 说明 |
|----|------|------|
| **Stable hook IDs** | `pre:bash:dispatcher` | 每个 hook 有稳定 ID，重装时 dedupe（不重复注册） |
| **Runtime profiles** | `ECC_HOOK_PROFILE=minimal\|standard\|strict` | 按 profile 启用不同 hook 集合（minimal=仅核心，strict=全量） |
| **Env gating** | `ECC_DISABLED_HOOKS` | 环境变量禁用特定 hook，不编辑文件 |
| **Consolidated dispatchers** | 一个 `PreToolUse(Bash)` 入口 fan-out 到多个检查 | 减少 hook 数量，降低开销 |

**在目标技能中的落地：**
- 生成的目标技能的 hooks.json 可增加 `hookProfile` 字段，支持 minimal/standard/strict
- 用 `ECC_DISABLED_HOOKS` 风格的 env 变量允许用户禁用特定 hook
- 用 dispatcher 模式：一个 PreToolUse 入口调用多个检查脚本（而非每个检查一个 hook）

#### Gateguard Fact-Forcing Gate（事实强制门禁）

ECC 的 `gateguard-fact-force.js` hook 在**首次 Edit/Write/MultiEdit** 时阻断，直到 agent 展示具体调查证据：

- 阻断条件：首次修改某文件
- 放行条件：agent 在 prompt 中展示：importers 分析 / data schemas 分析 / 用户明确指令

**在目标技能中的落地：**
- 生成的目标技能的 PreToolUse(Write|Edit) hook 可引用此模式：首次修改前须展示调查证据
- 这防止 agent 盲目修改未调查的文件

#### Config Protection（配置保护）

ECC 的 `config-protection.js` hook 阻断**削弱 linter/formatter 配置的编辑**：

- 阻断：减少 lint 规则 / 禁用 formatter / 降低严格度
- 放行：修复代码以通过 lint（而非放松 lint）

**在目标技能中的落地：**
- 生成的目标技能的 PreToolUse(Write|Edit) hook 可引用此模式：防止 agent 通过放松配置来"修复"问题
- 引导 agent 修复代码而非放松配置

#### MCP Health Check（MCP 健康检查）

ECC 的 `mcp-health-check.js` hook 在 MCP 调用前检查 server 健康：

- 阻断：MCP server 不健康（unreachable / error）
- 放行：MCP server 健康

**在目标技能中的落地：**
- 若目标技能依赖 MCP，可在 PreToolUse(mcp__*) hook 中加健康检查
- 防止调用不健康的 MCP server（避免超时/错误）

### graphify v0.9.13–v0.9.19 新增能力

> 来源：graphify v0.9.13–v0.9.19 release notes。

| 能力 | 版本 | 描述 | swarm-yuan 落点 |
|------|------|------|----------------|
| **`--strict` PreToolUse 硬阻断** | v0.9.19 | `graphify install --strict` 安装的 hook 首次 raw source read 时 `permissionDecision: "deny"` 阻断 + 重定向到 `graphify query`，然后降级为 soft nudge（每会话最多一次，不会 strand agent） | 目标技能的 hook 可引用此 strict 模式 |
| **原子 JSON 写入** | v0.9.18 | `graph.json`/`manifest.json` 等写入 temp 文件 + `os.replace` 原子替换（写穿 symlink），kill/OOM/ENOSPC 不留截断文件 | 图完整性可引用 |
| **不完整提取不覆盖完整图** | v0.9.18 | 崩溃/部分失败/权限拒绝的提取拒绝覆盖更大的已有图（exit 1，除非 `--allow-partial`）；不可解析的已有图 fail-closed | 图完整性可引用 |
| **查询日志默认关闭** | v0.9.13 | `querylog` 不再默认开启（原默认写 `~/.cache/graphify-queries.log` 明文），须 `GRAPHIFY_QUERY_LOG=1` 显式开启 | 隐私可引用 |
| **`.git/info/exclude` 遵守** | v0.9.14 | 检测遵守 `.git/info/exclude`（git worktree 记录嵌套 worktree 路径处），不再走入 worktree 副本（避免图膨胀 20x） | worktree 项目可引用 |
| **嵌套 `.gitignore` 作用域** | v0.9.15/v0.9.16 | 嵌套 `.gitignore`/`.graphifyignore` 的 `*` 只作用于自己的子树，不吞整棵树 | 图正确性可引用 |
| **graph.html stored XSS 修复** | v0.9.15 | 导出的 `graph.html` 邻居链接的 node id 现在用 HTML-escaped `data-nid` 属性 + 单一 delegated listener，防止 stored XSS | 安全可引用 |
| **原子 GraphML 导出** | v0.9.14 | `graphify export graphml` 不再因 dict/list 属性崩溃；非标量 JSON 序列化；原子写 | 导出可靠性可引用 |
| **hyperedge-only 文档 stamping** | v0.9.17 | hyperedge-only 文档在 manifest 中 stamp，不再每次运行重提取 | 增量效率可引用 |
| **Ruby `.rake` + Bash `source` 边** | v0.9.13 | 新语言覆盖：Ruby `.rake` 文件 + 跨文件 Bash script execution 边 | 语言覆盖可引用 |
| **`--strict` 运行时切换** | v0.9.19 | `GRAPHIFY_HOOK_STRICT=1/0` 运行时切换 strict 模式，无需重装 | 用户体验可引用 |

**`--strict` hook 模式详解（v0.9.19）：**
- 默认安装：soft nudge（advisory `additionalContext`，模型可忽略）
- strict 安装（`--strict`）：首次 raw source read 时 `permissionDecision: "deny"` 硬阻断 + 重定向到 `graphify query`
- 阻断后降级：下次 read 自动放行（即使 `graphify query` 失败也不 strand agent）
- "recently oriented" stamp：运行任何 `graphify query`/`explain`/`path` 后刷新短期 stamp，抑制阻断
- 仅 Claude Code 支持硬阻断（Bash-grep 和 Glob 仍 nudge-only；Gemini/Codex/OpenCode 无法硬阻断）

**在目标技能中的落地：**
- 生成的目标技能若用 graphify，hooks.json 可提供 strict 模式选项
- precheck.sh 的 `--graph` 子命令可校验 `graph.json` 是否原子写入（检查是否有 `.tmp` 残留）

### 输入/输出
- **输入**：文件夹路径。代码（36 种 tree-sitter 语法）本地离线解析；文档/PDF/图片/视频需 LLM backend（`--backend claude|gemini|openai|deepseek|kimi|azure|bedrock|ollama`）
- **输出**：`graphify-out/` 目录（可提交）：`graph.html`（交互可视化）、`GRAPH_REPORT.md`（god nodes、surprising connections、建议问题、置信度标签 EXTRACTED/INFERRED/AMBIGUOUS）、`graph.json`（完整图，默认 512MiB 上限）；可选 Mermaid/Obsidian/SVG/GraphML/Neo4j 导出；可选 MCP server

### Agent 集成模式
1. `uv tool install graphifyy` + `graphify install --platform agents`
2. 在目标项目运行 `graphify .`
3. agent 读 `graphify-out/GRAPH_REPORT.md` 获取架构概览
4. 用 `graphify query/path/explain` 查具体依赖链，或启 MCP server 用结构化工具（`get_neighbors`、`shortest_path`）
5. `graphify export callflow-html` 生成 Mermaid 调用流（用于 reference-manual.md 的"组件依赖链路"段）
6. `graphify hook install` 保持图谱新鲜

## 三者对比与选择

| 维度 | GitNexus | graphify | codegraph |
|------|----------|---------|-----------|
| 运行时 | Node.js / TypeScript | Python 3.10+ | 本地索引引擎（SQLite + FTS5，无 LLM API） |
| 安装 | `npm i -g gitnexus` | `uv tool install graphifyy` | 未本机核验（整合前先跑通） |
| 解析 | Tree-sitter 原生 | Tree-sitter（代码离线）+ LLM（文档/媒体） | 预索引 + 代码变更自动同步 |
| 存储 | LadybugDB（持久本地图） | `graphify-out/graph.json`（可提交） | 本地索引（100% 本地） |
| Agent 接口 | MCP server（stdio）+ HTTP 桥 + Web UI | MCP server + `query/path/explain` CLI + IDE skill | **单 MCP 工具** `codegraph_explore` + `explore/affected` CLI |
| 依赖链查询 | MCP 图工具；`gitnexus group query`（多仓库） | `graphify path A B`、`graphify explain X`、MCP `shortest_path` | `codegraph explore <task>`（自然语言）/ `codegraph affected <file>` |
| 主要输出 | 知识图 + MCP 工具 + wiki + AGENTS/CLAUDE.md | `graph.html` + `GRAPH_REPORT.md` + `graph.json` + Mermaid | 检索结果（上下文残留 +80% 为其已知代价） |

**选择建议（按技术能力，不做授权驱动的降级）：**
- 侧重深度调用图、持久 DB、多仓库 → GitNexus
- 侧重广谱（代码+文档+媒体）、需可提交的图、Mermaid 导出 → graphify
- 侧重零配置、单工具自主检索、子代理 CLI 通道、索引自动同步 → codegraph
- 可并用：深度图 + 广谱图组合（如 codegraph/GitNexus + graphify）

## 在目标技能中的落地

目标技能的 `references/code-graph-tools.md` 应：
1. 引用上述安装与命令（按项目实际选择 GitNexus/graphify/codegraph 或并用）
2. 在探查阶段（Step 3）先运行图谱工具索引仓库
3. 在 `reference-manual.md` 的"组件依赖链路"段引用图谱输出（`GRAPH_REPORT.md` / Mermaid 调用流）
4. 在 workflow 节点⑤编码时，agent 查图谱查依赖（`graphify path` / GitNexus MCP）而非 grep
5. **只引用命令，不复制工具源码**

## GitNexus v1.6 全量能力（swarm-yuan 须知道但可选引用）

> 来源：GitNexus v1.6.9 源码调研。44 节点类型 + 21 关系类型，14 语言支持。

### 17 个 MCP 工具

| 工具 | 用途 | swarm-yuan 落点 |
|------|------|----------------|
| `query` | 混合搜索（BM25 + 语义 + RRF） | 探查阶段找稳定单元 |
| `context` | 360 度符号上下文 | 依赖链路段 |
| `impact` | 爆炸半径分析（depth grouping + confidence + risk） | `--impact` 门禁可引用 |
| `trace` | 最短有向路径（调用 + 类成员边） | `--link-depth` 可引用 |
| `detect_changes` | git diff → 受影响进程 | `--stable-diff` 可引用 |
| `check` | 健康检查 | 自检阶段 |
| `rename` | 多文件协调重命名（dry_run） | 重构时引用 |
| `cypher` | 原始 Cypher 查询 | 高级分析 |
| `route_map` | API 路由图 | `--api` 可引用 |
| `tool_map` | MCP/RPC 工具映射 | `--contract` 可引用 |
| `shape_check` | API 响应结构校验 | `--api` 可引用 |
| `api_impact` | 变更前 API 影响报告 | `--impact` 可引用 |
| `explain` | 污点/数据流解释（需 `--pdg`） | `--security` 可引用 |
| `pdg_query` | 语句级控制/数据依赖（需 `--pdg`） | 安全审查可引用 |
| `group_list/sync` | 多仓库组 + 契约注册 | 微服务跨仓库可引用 |

### 关键能力

- **`--pdg` CFG/PDG/taint 基质**（TS/JS）：`explain` 做源→汇污点流分析，`pdg_query` 做语句级依赖——安全审查利器
- **`gitnexus wiki`**：LLM 生成每模块文档 + 交叉引用
- **`--skills`**：Leiden 社区检测 → 每功能域一个 `SKILL.md`（`.claude/skills/generated/`）
- **Claude Code PostToolUse hook**：commit/merge/rebase 后自动检测 stale index → 提示 reindex
- **Codex 全支持**（v1.6.9+）：hooks + plugin marketplace + `gitnexus setup` 自动检测 Codex 并写入 MCP 配置
- **CodeBuddy + Qoder 集成**（v1.6.9+）：`gitnexus setup -c codebuddy,qoder` 扩展 IDE 支持
- **MCP prompts**：`detect_impact`（提交前变更分析）+ `generate_map`（架构文档 + Mermaid）
- **多仓库组**：Contract Registry → 跨仓库爆炸半径 + 跨仓库 trace

### 支持的 AI 平台（v1.6.9+）

| 平台 | 集成深度 | setup 方式 |
|------|---------|-----------|
| **Claude Code** | MCP + skills + PreToolUse/PostToolUse hooks | `gitnexus setup`（自动检测） |
| **Codex** | MCP + skills + hooks（v1.6.9 新增全支持） | `gitnexus setup -c codex` |
| **Cursor** | MCP + skills + postToolUse hook | `gitnexus setup -c cursor` |
| **Antigravity/Google** | MCP + skills + AfterTool hook | `gitnexus setup -c antigravity` |
| **OpenCode** | MCP + skills | `gitnexus setup -c opencode` |
| **Windsurf** | MCP only | `gitnexus setup -c windsurf` |
| **CodeBuddy** | MCP + skills（v1.6.9 新增） | `gitnexus setup -c codebuddy` |
| **Qoder** | MCP + skills（v1.6.9 新增） | `gitnexus setup -c qoder` |

## graphify v0.9 全量能力（swarm-yuan 须知道但可选引用）

> 来源：graphify v0.9.5 源码调研。36 tree-sitter 语法，22 平台集成。

### 关键能力（swarm-yuan 可能没用到）

| 能力 | 描述 | swarm-yuan 落点 |
|------|------|----------------|
| **Work memory + reflection loop** | `save-result` 记录 Q&A 结果 → `reflect` 聚合为 `LESSONS.md` + `.graphify_learning.json`（preferred/tentative/contested 标签 + recency 加权 + provenance） | 记忆闭环可引用 |
| **PR 情报套件** | `graphify prs` → CI 状态 + review 状态 + worktree→branch→PR 映射 + AI triage 排名 + merge-order 冲突检测 | `--impact` 可引用 |
| **跨项目全局图** | `graphify global add/remove/list` → `~/.graphify/global-graph.json` | 多项目可引用 |
| **Callflow HTML 导出** | `graphify export callflow-html` → Mermaid 架构/调用流 HTML | `--mermaid` 可引用 |
| **MCP 工具** | `query_graph`/`get_node`/`get_neighbors`/`shortest_path`/`list_prs`/`get_pr_impact`/`triage_prs` | 探查+审查可引用 |
| **共享 HTTP MCP** | `--transport http --host 0.0.0.0 --api-key` → 团队共享一个图 URL | 团队协作可引用 |
| **Git merge driver** | `graph.json` union-merge → 并发 commit 无冲突标记 | 团队协作可引用 |
| **语义缓存** | `--update` 只重新提取变更文件 | 增量探查可引用 |
| **`--exclude-hubs N`** | 抑制工具超级枢纽节点出 god-node 排名 | 更清晰的依赖分析 |
| **多 LLM 后端** | Gemini/Kimi/Claude/OpenAI/DeepSeek/Azure/Bedrock/Ollama + `claude-cli`（用订阅，免 API key） | 按项目环境选择 |
| **Obsidian vault 导出** | `--obsidian` → 可被 agent 爬取的文档 | 文档方向可引用 |
| **36 tree-sitter 语法** | 含 CUDA/Metal/SystemVerilog/Fortran/Pascal/Delphi/Lua/Zig/Elixir/Julia/Vue/Svelte/Astro | 更广语言覆盖 |
| **MCP 配置作为一等节点** | `.mcp.json` 提取 server 节点 + 包引用 + env-var 需求 | MCP 工具盘点可引用 |
| **包清单作为枢纽节点** | `pyproject.toml`/`go.mod`/`pom.xml` → `depends_on` 边 | `--deps` 可引用 |

### graphify v0.9.6–v0.9.12 新增能力

> 来源：graphify v0.9.6–v0.9.12 release notes。

| 能力 | 版本 | 描述 | swarm-yuan 落点 |
|------|------|------|----------------|
| **`hook-guard` 跨平台 hook 子命令** | v0.9.8 | hook 逻辑移入 shell 无关的 `graphify hook-guard` 子命令，Windows/macOS/Linux 行为字节一致 | 目标技能的 hook 安装可引用 |
| **不静默丢弃：无 extractor 的代码文件** | v0.9.9 | `.r`/`.ejs`/`.ets` 等被分类为代码但无 AST extractor 的文件，现在 print grouped warning 而非静默消失 | 探查阶段可引用（图完整性） |
| **不静默丢弃：`os.walk` 错误** | v0.9.11 | `os.walk` 的 `os.scandir` 失败（权限/并发写入）现在记录每个跳过的子树 + warn，而非吞掉整棵子树 | 探查阶段可引用（图完整性） |
| **anti-shrink guard** | v0.9.11 | 非空但不可读的旧 `graph.json` 拒绝覆盖（须 `force=True`），空文件仍继续 | 图完整性可引用 |
| **幻影边防御：builtin-typed receivers** | v0.9.10 | TS/JS `x: Date; x.getTime` 不再绑定到同名用户 `class DATE` | 图正确性可引用 |
| **幻影边防御：跨语言 calls** | v0.9.10 | 禁止跨语言 `calls` 边（按 interop family 过滤候选） | 图正确性可引用 |
| **语义超边保留** | v0.9.12 | `graphify update` 不再在 AST 重建时删除 doc-sourced hyperedges | 增量探查可引用 |
| **PostgreSQL 只读 FK 内省** | v0.9.12 | `--postgres` 从 `pg_catalog.pg_constraint` 读 FK，只读角色也能得 `references` 边 | DB 项目可引用 |
| **`json_config` 依赖边** | v0.9.12 | `package.json` 依赖 + `tsconfig.json` `extends`/`$ref` 创建 `concept` 目标节点再连边 | 依赖图可引用 |
| **Ruby `mixes_in` 边** | v0.9.7 | `include`/`extend`/`prepend <Module>` → `mixes_in` 边，Rails concern 可见 | Ruby 项目可引用 |
| **rationale/doc_ref 节点** | v0.9.7 | JS/TS `// NOTE:` 注释与 ADR/RFC 引用成为 `rationale`/`doc_ref` 节点 | 文档关联可引用 |
| **`pascal` 可选 extra** | v0.9.7 | Delphi 提取（AST-quality） | Delphi 项目可引用 |
| **大小写不敏感扩展名分发** | v0.9.7 | `App.PY`/`script.JS` 不再被跳过 | 跨平台文件名可引用 |
| **`affected <Class>` 成员种子** | v0.9.7 | `affected` 从类的成员节点种子反向遍历 | 影响分析可引用 |
- **v0.9.56**：Rust trait 方法提取、Node subpath imports 解析、无向 MCP 查询、TS normalizer 去二次方扫描；克隆 origin 指向 Graphify-Labs。
- **v0.9.57**：**增量重建保留跨文件项目 AST 节点**（重提取 `.csproj` 不连带丢被引用项目的 package/framework 节点）+ 重复节点合并保**更富节点**为幸存者（非空字段折叠）+ C# 泛型调用点解析 + `this.X` 成员全形态捕获。
- **v0.9.58**：**python/php/bash import 解析**（跨语言边扩展）+ 同文件源路径碰撞合并修复 + SQL 索引 + rust static/const 声明提取。
- **v0.9.61（跨 0.9.59–61）**：**未分类文件浮出双出口**（GRAPH_REPORT.md 列出 + `graphify update` 路径同浮出——「不可分类 ≠ 静默跳过」，图谱构建侧的显式报告）+ **Windows os.replace 回退语义**（fallback swap 失败恢复目标原状 + src==dst 守卫 + symlink 目标保持 replace 语义 + GraphML/AST 缓存/skill 安装三写点统一共享 helper，与 ocr 报告原子写入同一写安全做法）+ Python 3.12/3.13 断裂连环修复（0.9.60 引入、0.9.61 修复）+ Python 3.14 可选依赖 + JS 导出函数内调用解析（含 aliased imports）/workspace exports 按 importer 平台选择。**v1.0.0 tag 为 2026-04-05 旧异源分支、不在 v8 线，不取。**
- **v0.9.63**：**god node guard**——拒绝跨两个无关同名类型并池方法 + 重复索引键保留全部映射方法（同名碰撞是伪超级节点成因）：「**同名 ≠ 同物**」的图谱侧实体判别原语，消歧必须显式（同类设计：权限路径规范化空间比对）；elixir 跨文件 alias/import 解析（含嵌套模块捕获守卫）+ rust selective extraction（跨语言边扩展）；code-span mention 边跨增量重建保持 + markdown 点式限定词/显式相对引用；回归测试四批先于修复入库。
- **v0.9.64**：**Terraform block attributes 提取 + secret 命名属性值 redaction**——机密不落图谱索引（界画在索引入口，与 claude URL 脱敏/codex 遥测最小化同类）+ **PHP 内联 script 的 JS 索引与 PHP/JS 节点碰撞边丢弃修复**（跨语言嵌入代码归属判别：同文件多语言共存消歧）+ Kotlin object 成员调用 resolver / generic Rust self calls（跨语言边扩展）+ Markdown 链接 parse 失败保持与后缀 reconcile（容错不丢数据）。
- **v0.9.65**：**JS let/const 块级作用域绑定**——绑定按所在块（block）解析而非函数级，不同块的 `let x` 是不同绑定实体（「**同名 ≠ 同物**」判别原语，与 v0.9.63 god node guard 同类），配块级遮蔽回归测试；**fail-closed 保全节点跨遍存活**（#3695：显式判为 fail-closed preserved 的节点不得被后续 AST 所有权逐出遍删除——保全承诺必须在所有后续遍保持）+ Go interface/Swift protocol 方法需求提取（实现关系边提取面拓宽）+ Java enum 成员归属 enum 而非文件（归属精确性）+ Verilog 实例链接本地定义 + vis-network 导出栈溢出崩溃修复（查看器稳定性）+ Pillow CVE floor（cve-2026-54058→12.3.0）+ 删除两条永不触发的 symlink 假测试（永不触发的测试 = 假阳性通过）。

- **v0.9.66**：**五语言提取器**（COBOL/VB.NET/R/Solidity/Erlang，单版最大语言扩展）+ **PYTHONHASHSEED 确定性入构建**（同输入同输出，构建可复现）+ 共享 GRAPHIFY_OUT 绝对路径 root marker 修复（共享输出根判别，配回归测试）。

- **v0.9.67**：**PHP 闭包提取**（路由闭包合成 `VERB /path`，非路由用 `{closure#N}`）+ **Python 绝对包导入解析**（**跨树同名歧义 fail closed 而非随意绑定**）+ **幽灵环回撤**（只回撤匹配模块文件 id 的临时边，无「唯一即回撤」盲回落）+ **导出幂等**（`write_text_atomic_if_changed`）+ **Windows hash-seed 修复**（改 `python -m graphify` 重 exec）。

- **v0.9.75（跨 v0.9.72→v0.9.75 共 76 提交）**：**干净解析零符号须警告**（f81c4e5：解析成功≠有产出，「不可分类≠静默跳过」）+ **去重收缩须用户同意且计量不入 graph.json**（daee93f/e8b5d27：节点合并致图谱收缩=破坏性操作须同意；收缩计量属报告面不属数据面，数据面/计量面分离）+ **聚类/标签写回保留全部原始边**（7527e73：派生层写回不得重定义边集，写回保真）+ **按 node id 恢复既有社区**（9ec7df0：恢复按身份不按名字，同物须按 id 认）+ hook-guard 输出路径用解析不用子串匹配（8e5649f）+ 五语言 self/super 调用绑定调用者类链 + Rust prelude 类型不成为 god node（7f1d45d）+ workspace 源条目优先于构建产物（81b0391）。**v8 线 v0.9.75 许可三处一致**（LICENSE/LICENSE-MIT 在树+pyproject Apache-2.0+license-files 齐备）；**版本线归属核验（merge-base 祖先确认）是 0.x 升级前的强制步骤**，不只在拒绝动作时执行；

- **v0.9.80（跨 v0.9.76→v0.9.80 共 65 提交，v8 世系核验通过）**：**克隆同一性确定性族**——node id 与 manifest 键不再泄漏本地检出路径与 OS 用户名（#4175，re-clone 产同一张图）、AST 缓存命中遇已删 import 目标重提取不回放陈旧绝对路径 id（#4185）、`--no-cluster` graph.json 不带运行期绝对源路径与未声明端点（#4189）——**图谱产物不得编码构建环境的身份**（与 PYTHONHASHSEED 确定性同向：环境无关性是可复现的完整口径）；**MCP 检索缓存**（遍历视图与最短路图按已载图一次构建、LRU 封顶内存：query ~1.6x、shortest_path ~300x——**派生视图按源图代缓存**，与 graphify 增量重建的「按 node id 恢复」同一身份原则在查询面）；Python 注解/构造器/with 绑定类型方法解析（歧义 fail-closed）+ Java 匿名类体捕获 + `if TYPE_CHECKING:` 标 type-only（不成运行时环）+ graph_stats 报构建 commit 与落后 HEAD（图谱新鲜度自报）。来源：`docs/research/R97-runtime-refresh.md`。

- **v0.9.82（跨 v0.9.81→v0.9.82 共 20 提交，v8 世系核验通过；v1.0.0 异源 tag 诱取拦截第六例）**：**跨文件类型解析族收口**——python `self/cls/super()` 调用解析到**他文件的基类方法**（继承链跨文件不再断边）、嵌套类身份按外围类链保全（同名嵌套不混）、TS 同名接收者按**调用方 import** 绑定（绝不误绑 `#private`）、`this.field` 接收者从类字段声明定型、C# 命名空间内类型解析、Elixir keyword-form 函数体与限定/别名远程调用、PHP 8.5 void cast——「调用边」从名字级升到**类型解析级**（同名在不同文件=不同物，与「按 node id 认物」同一身份原则在解析面）；**图快照不变性钉测**——`graph.json` 在 checkout 目录不同/rebuild/行尾三态下逐字节一致写成钉测（确定性口径从克隆同一性扩到**产物文件级**：同一输入任何环境出同一字节）；AMBIGUOUS 边从 top-N/modularity 隔离（歧义数据不参与度量聚合）；unlabelled node 绘图 id 剥控制字符。来源：`docs/research/R105-runtime-refresh.md`。

- **v0.9.85（跨 v0.9.82→v0.9.85 共 50 提交，v8 世系核验通过；v1.0.0 异源 tag 诱取拦截第七例）**：**单遍树走查性能族**——symbol facts 收集每棵 JS/TS 树只走一次、路径记忆键去掉 os.getcwd()（绝对输入不掺本地态）——性能修复同时是**确定性修复**（与克隆同一性纪律同轴：产物不编码构建环境）；**同名节点 id 去重防吞**——不同文件铸造同一 node id 时保两个节点不合并（「同名 ≠ 同物」判别原语在去重面：合并必须显式，收缩不得静默吞节点）；**巨型 export default 字面量防崩**——解析在超大字面量上不再崩（上界输入不炸是提取器基本契约）；**watch 重建锁 unlink-vs-flock 竞态修复**+**非 ASCII 文件名 hook 拾取**+**未锚定 ignore 模式按条目名匹配**（「重建不丢变更」与「文件名不是 ASCII 假设」两族）；**AFFECTED_RELATIONS 补 defines**（影响面查询边类型完备性——缺一种边=影响面漏报）；多语言提取修复族：Rust stub 绑定越过 impl 块、TS5 `export type *` 重导出、Scala given...with 成员限定到实例、Elixir defdelegate、Julia/Fortran where 子句函数与参数化类型、Fortran 具名泛型接口、HTML 内嵌脚本标签越界。来源：`docs/research/R106-runtime-refresh.md`。

- **v0.9.86（1 patch 20 提交，v8 世系核验通过；v1.0.0 异源 tag 诱取拦截第八例）**：**产物单行紧凑 JSON**——graph.json 从 pretty-print 改单行紧凑，每 PR 提交重建图谱的 diff 从数万行降到一行，always-on 文档明示「大 graph.json diff 是预期的」——**产物格式本身是评审基建**（写安全族新面：不是原子性而是可评审性；产物为 diff/评审场景设计）；**查无此名 exit 3/4**——explain/path/query 歧义（列候选）=3、无匹配=4、答案=0，「无路径」仍是答案不是错误——**CLI 退出码是机器接口**（脚本与 agent 不解析文本即可辨拒答与答案；与 ruflo「未知 id exit 1」、codex Guardian JSON transcript 同族）；**去重排序以扫描根为锚**——relative source_file 按 scan root 解析排序而非 CWD（原子目录运行曾造出 firmware/firmware/... 键使边跟不上改名节点——排序键锚定扫描域不锚运行环境，确定性族）；Rust grouped use 声明展开成 import 绑定+Scala derives 子句链接 typeclass+Julia operator/functor 方法+codex 语义分块过 B3 合并保全+Ollama 采样种子+null token counts 归零+尊重 git 全局 ignore（core.excludesFile）+uninstall --purge 不删项目安全界。来源：`docs/research/R107-runtime-refresh.md`。

- **v0.9.89（3 patch 28 提交，v8 世系核验通过；v1.0.0 诱取拦截第九例）**：**跨仓成员调用「先停靠后链接」**——接收者类型声明在另一仓时先 park 成显式挂起态，跨仓信息可得时再链接（五语言，TS 仅 .mjs/.cjs 按 interop 家族门控）——解析不完备时保全调用点身份，宁可挂起不可错绑（「同名 ≠ 同物」跨仓域）；**置信度防守门污染**——接口成员链全实现者（e7395e6）但 gate 失败者不计置信度（9aa9d03）：链接可以宽，置信必须净；泛型类型参数不入引用（四语言）——类型参数是声明域噪声；AST schema 13。来源：`docs/research/R110-runtime-refresh.md`。

- **v0.9.90（1 patch 18 提交，v8 世系核验通过；v1.0.0 异源 tag 诱取拦截第十例——该 tag 时点 2026-04-05 早于 v0.9.89，非发布线）**：**post-merge 钩子治愈 merge 复活态**（31cc7921：merge driver 复活的已删图谱态由 post-merge 钩子重新治愈——合并是图态污染入口，自愈通道要挂在污染入口上，与 v0.9.86「产物为评审场景设计」同属合并域）；**回退遍历保留已访节点关系**（07588ee1：fallback 路径也不丢边——降级通道与主通道同一保全标准，「不完备时保全身份」域内深化）；**边存活与宿主文件解绑**（642e4b84：edge source_file 被删时两端俱在的边保留——边的生死由端点决定不由宿主文件决定）；**C# 同名消歧族**（仅 `_`/大小写差异的名字不合并 931ca226、`new X()` 不绑同名方法 50436e78、部分合并前 id 碰撞先加盐 ab8d63bf——「同名 ≠ 同物」在绑定端与合并端同时执法）；**孤儿清扫与剪枝赦免**（重提取遗留的无源占位符清扫 9cbb70a4、hyperedge 成员免于语义隔离预剪枝 aa18a71c——清扫要精确到「真孤儿」，赦免要护住「有边的成员」）；Go 泛型接收者归一化后再建 id（1331be17）、C# foreach 循环变量类型化供接收者解析（b4f4a5b3）、Python  enclosing scopes 走查模块成员调用（edb93314）、Jinja 模板归类为文档（22124ba7）；AST schema 14→15（两跳）。来源：`docs/research/R112-runtime-refresh.md`。

- **v0.9.91（1 patch 16 提交，v8 世系核验通过；v1.0.0 异源 tag 诱取拦截第十一例——该 tag 时点 2026-04-05，异源旧 tag 非发布线）**：**接收者限定三连**——`this.x` 仅从调用方类+其基类读（990ab1b7，不越界到无关联类）、class-field 接收者类型限定到字段所属类（5fd413a0）、JS 文件域回调自身参数遮蔽（1af5104b——「解析范围=声明范围」在三种形态上同时执法）；**导入落点**——Rust `use` 落在它导入的声明上（ef1d256e）且根须在本 crate（5faa05c8——导入边的落点是声明不是文件、根不在本 crate 不落）；**同形消歧**——拼作兄弟文件旧 id 的符号在导入时保留（c29950f8，改名遗留不误删）；**社区标签防误合并**——成员重叠仍在时保留社区标签（a0587559，聚类合并的保守面）；ollama 请求走 `/api/chat` 令 num_ctx 真实生效（f48425e6——配置通道=生效通道，写了不生效等于没配）。来源：`docs/research/R113-runtime-refresh.md`。

- **v0.9.92（1 patch 23 个社区 PR，v8 世系核验通过；PyPI `graphifyy` 通道 0.10.0→0.9.92 归位——此前登记的「npm/pip 通道超前」通道异常解除，PyPI 与 GitHub v8 线同版）**：**成员名修饰符差异=不同节点**（#4475/#4479——JS/TS 类成员仅 `_`/`$`/`#` 前缀差异时保独立节点不合并——「同名 ≠ 同物」把命名修饰符纳入同一性判据，与 v0.9.90 C# 仅 `_`/大小写差异不合并跨语言同执法）；**`this.field` 类型化扩面**（#4473/#4482——任意方法内赋值均可定型，含 `static` 与访问器——类型证据的采集面从构造器扩到全部赋值点）；**barrel 悬空边删除**（#4486/#4488——经 barrel 解析成功后，原先挂同名 barrel 的悬空导入边删除——解析态前进一步，旧占位边跟着退场，边存活跟随解析真相）；**workspace exports 只指 dist/ 时回退 src/**（#4485/#4489——发布物路径缺席时按源码树回退，与 #4486 同族「解析不到就换真实可得源」）；AST cache schema 升代（升级后首次构建重提取——缓存代际与提取器版本绑定）；其余为五语言 call-resolution/id-collision 修复族、图往返/去重/置信折叠修复与 Ollama/检测修复。来源：`docs/research/R117-runtime-refresh.md`。

- **v0.9.93（1 patch 22 个社区 PR，v8 世系核验通过；诱取 tag v1.0.0 仍在 tags 首位，异源旧 tag 不取，第十二例记档）**：**引用解析不铸无源 stub**（六语言族：Kotlin `typealias`、C# `delegate`、Swift `macro`、Dart `typedef`、Python 模块函数、Rust 兄弟模块 `use`——引用现在解析到真实声明，不再铸造 sourceless stub 节点；未知/标准库宏保持 unresolved 而非造 stub——**图里每个节点要么有真实源码出处，要么显式未解析：失败显式优于成功伪造**）。**半读文件可检测可恢复**（skill 提取路径 #3987/#2225）：每个 chunk 自报覆盖行数，实报覆盖不足真实长度的文件写 `.graphify_partial.txt`、缓存记 partial（loader 视为 miss）、manifest 不盖章，下次 `--update` 重派并整体替换半读节点集——「子代理只浏览了长文件」从静默永久损失变为显式暂存态，**部分读取不得与完成读取同权重入库**（镜像库路径截断恢复）。**只读命令零副作用**（#4545）：`--version`/`--help` 不再改写/备份已装技能文件，只有真实命令刷新技能。**凭证形文本脱敏**（#4566）：API key/token/Bearer/私钥头/`user:pass@` URL 进 rationale label 前脱敏（git SHA/UUID 保留）。**裸名恰为多节点精确名时拒绝并列候选**（#4511/#4517，歧义退出码与 explain/path 对齐）。其余：`.graphifyrc` 以 utf-8-sig 读（BOM 不丢首键）；两仓同路径文件 explain/path 保持区分；AST cache schema bump——**升级后首次构建全量重提取**（缓存版本化失效）。来源：`docs/research/R132-runtime-refresh.md`。

- **v0.9.94（1 patch 35 提交、19 个社区 PR，2026-10-22，v8 世系核验通过；v1.0.0 tag 异源诱取第十三例：浅克隆实测 `merge-base --is-ancestor v0.9.94 v1.0.0` exit=1、两线自 81a43f0 分叉、v1.0.0=0a31c08（2026-04-05 旧线）——v8 世系判定不变）**：**摄取安全前置校验**——validate_url 拒无主机/非数值与越界端口/内嵌 `user:pass@` 凭证的 URL，请求发出前拒且每次重定向再拒（#4643/#4644/#4645/#4657）；文本采集 lstat 判符号链接，悬空链接不跟出语料库外。**MCP 查询拒绝 substring 近似匹配**（get_node/get_neighbors/explain，#3917/#4618）——不确定即拒绝并列候选（与 v0.9.93 裸名歧义拒绝 #4511 同族）。**解析诚实族**——Maven POM 只贡献自身 `<dependencies>`，dependencyManagement/BOM 版本锁不再被当依赖边（#4596）；JS/TS 无类型接收者不再猜测同文件同名方法（#4598/#4605）；CommonJS `require` 不遮蔽导出类（#4621/#4634）——失败显式优于成功伪造在解析面延续。**其余**——ObjC category 节点 id 改 repo-relative（#4666/#4642，克隆同一性族延续）；T-SQL 解析独立一遍（#4635-#4654）；设计性跳过与失败性跳过分账（ast_empty 放行、真失败仍重试，#2543/#4672）；`--platform` 列表单一事实源+守门测试防漂移（#4655）；AST cache schema 第三连升（升级后首建全量重提取）。来源：`docs/research/R140-runtime-refresh.md`。

- **v0.9.95（1 patch 21 个社区 PR，2026-10-23，v8 线；v1.0.0 正式版=异源线正式化——GitHub API compare 实测与 v0.9.95 diverged（ahead 28/behind 2533），pip graphifyy 通道未跟进仍 0.9.95，双通道版本分裂记档；v8 世系判定不变）**：**skill-install 写入经 mkstemp/mkdtemp 随机名+O_EXCL+限权 mode**（#4513）——预埋符号链接不再能劫持可预测 `*.tmp` 路径改写任意文件；**临时文件名不可预测是写入安全基线**，最终移动保持原子。**类型别名四语言提取**——Python TypeAlias/`type =`/NewType（#4578）、Go `type A = B`（#4579）、C++ using/typedef（#4580）、Rust type+union（#4581）入类型节点，引用解析到别名而非铸无源 stub；C# 重载按参数个数独立节点、调用按实参数绑定（#4584/#4591）。**YAML 结构化提取**（#2214/#4706）——file 节点+keys 的 contains 边、分类为 code；**safe_load 防 `!!python/` 执行+输出有界（1 MiB/500 pairs/depth 6）+数据密集型（OpenAPI/Swagger/JSON-schema/纯数据束）跳过防孤儿节点**：结构化≠全提取，数据与结构要分。**EXTRACTED 虚假认证修复**（#2945/#4707）——bare call 仅因「caller 导入了同名符号所在模块」被提升 EXTRACTED→降回 INFERRED：连接性边保留、**认证等级不虚标**（证据分级诚实：边可以推，等级不能借）。**其余**——SSRF 守卫补 multicast 段 224.0.0.0/4、ff00::/8（#4708）；二进制媒体不计入文本语料、SVG 仍按 XML 文本计（#4548）；package.json 依赖清单项与导入节点共点 `name@range`（#4569/#4572）；affected 解析共享 basename 消歧后缀（#4698/#4713）；跨仓 ObjC 头实分仓绑实现、同名双定义仍歧义（#4690/#4691）；rebuild hook 从 checkout 顶层跑（#3258/#4689——防子目录残留输出目录错根）；`NS_CLOSED_ENUM` 提取（#4705）；SQL 列默认不可解析时从 ERROR 节点恢复（#4613/#4677）；AST cache schema 第四连升。来源：`docs/research/R141-runtime-refresh.md`。