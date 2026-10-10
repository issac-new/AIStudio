> **何时读我**：配置/审计 MCP 服务与工具边界时。MCP 治理——服务接入/工具暴露/安全边界。

# MCP 治理：默认最小化政策

> 适用范围：swarm-yuan 生成目标技能 时的 MCP connector 注册、MCP 配置中的 secret 处理、MCP 与门禁的联动。
> 上游依据：ECC v2.0（2026-06 稳定版）single-connector MCP 默认政策 + ecc.mcp.v1 inventory/secret redaction（`docs/research/R6-upstream-web.md` §1.7；https://github.com/affaan-m/ECC ，访问 2026-07-20）。
> 落地位置：spec 模板 §10 环境与外部资源（`references/template-spec.md` → 生成物 mcp-tools.md）、`references/security-spec.md` §4.5、`assets/precheck.sh` check_knowledge/check_security、`scripts/self-check.sh` MCP 重复注册检测。

## 一、Connector 注册原则：默认最小集 + 逐 connector 书面理由

### 1.1 默认最小集

目标技能 生成时，MCP connector 注册默认最小集为三个：

| connector | 用途 | 许可证约束 |
|---|---|---|
| graphify | 默认代码图谱工具（context/trace） | MIT |
| claude-mem | 项目记忆持久化（`--knowledge` 门禁依赖） | Apache-2.0 |
| gitnexus | 代码图谱增强（MCP tools + hooks） | **PolyForm Noncommercial 1.0.0 禁商用——仅非商用项目可选；商用项目默认集收缩为 graphify + claude-mem 两个** |

注册方式参照 `references/claude-code-capabilities.md:480`（`claude mcp add`）；现状登记见生成产物 `.mcp.json` 模板与 `references/claude-code-capabilities.md` 注册段。

上游对照：ECC v2.0 在 2026-06 审计后默认仅保留 chrome-devtools 一个 connector、其余六个转为 opt-in（见其 docs/MCP-CONNECTOR-POLICY.md）——**每多一个 connector 都是攻击面与 token 成本，默认最小、按需 opt-in**（访问 2026-07-20）。

### 1.2 新增 connector 的书面理由

默认最小集之外每增加一个 MCP connector，必须在 spec **§10 环境与外部资源**（生成物 mcp-tools.md）写明四要素：

1. **用途**：该 connector 为哪个 workflow 节点服务；
2. **数据流向**：读出/写入什么数据，是否出本机；
3. **替代方案为何不足**：为什么默认集与既有 CLI 不能覆盖；
4. **许可证与来源**：connector 的 LICENSE 与仓库 URL。

项目无外部 MCP 资源时，mcp-tools.md 写「本项目无外部 MCP 资源」（`references/template-spec.md:472`），不留空、不编造。

## 二、Secret redaction 要求（参照 ECC v2.0 ecc.mcp.v1）

凡收集、展示或落盘 MCP 配置（mcp-tools.md、hooks.json、settings.json、MCP inventory），必须按 `references/security-spec.md` §4.5 的六类启发式 redact：

| 类型 | 检测模式 | Redact 方式 |
|---|---|---|
| Env key pattern | `*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`/`*CREDENTIAL*` | 值替换为 `[REDACTED]` |
| Known token prefix | `sk-`/`ghp_`/`gho_`/`xox*`/`AIza`/`sk-ant-`/`sk-or-`/`sk_live`/`sk_test` | 检测到前缀即 redact |
| High-entropy heuristic | ≥32 字符 + 高 entropy（无空格/无重复/混合字符） | 视为疑似 secret，redact |
| Argv inline secret | `--flag=secret` 或 `--flag secret` | argv 中的值 redact |
| URL userinfo | `https://user:pass@host` | userinfo redact |
| URL query token | `?token=`/`?key=`/`?secret=` | query 参数值 redact |

原则：**只标记不存储**——redact 后的值替换为 `[REDACTED]`，原始值不写入任何文件/日志（`security-spec.md:161`）。ECC 实践表明该机制在开发期即可抓到真实 key 泄漏。

## 三、MCP 与门禁的联动

| 门禁/检查 | 联动点 | 行为 |
|---|---|---|
| `--knowledge`（check_knowledge，`assets/precheck.sh:2271`） | 优先 `claude-mem search` 查项目记忆 | 无 claude-mem 时降级检查 AGENTS.md/CLAUDE.md/记忆目录；全部不存在时 `skip_if_unconfigured` 静默跳过；有知识文件而生成 SKILL.md 未引用 → fail（fail-closed） |
| `--security`（check_security） | MCP 配置中未 redact 的 secret（`secret_detected` 词汇，`security-spec.md:173`） | 检出即按安全门禁判定 |
| self-check MCP 重复注册检测（`scripts/self-check.sh:262-263`） | 同一 binary 注册多个 MCP key（如 claude-flow + ruflo 并存） | 提示经 `ruflo doctor` 自愈，canonical MCP key 保留一个 |
| 新门禁通用契约 | 未配置时静默跳过、启用后 fail-closed | 与全部门禁一致 |

## 四、生成与审查清单

- [ ] 生成 skill 时仅注册默认最小集（商用项目不含 gitnexus）
- [ ] 默认集之外每增加一个 connector，§10 mcp-tools.md 已写四要素书面理由
- [ ] mcp-tools.md 按项目实际填充；无外部 MCP 资源时写明「本项目无外部 MCP 资源」
- [ ] 任何 MCP 配置落盘前过六类 redaction 规则，原始 secret 零落盘
- [ ] `--knowledge`/`--security` 自跑通过；self-check 无重复 MCP key 告警

## ruflo v3.42.0：MCP 治理 opt-in 与调用者身份绑定

- **opt-in MCP 治理策略执行**（#3138）：MCP 工具调用可挂治理策略，但显式 opt-in 才生效。治理面越强、误伤面越大，开关归用户——同一类同意边界（与 3.41.2 `autoStart:false` 被尊重一致）：治理与易用性的权衡显式化，不替用户做主。
- **ADR-377 调用者身份验证绑定**（#3102）：工具调用携带调用者身份并验证。跨边界调用须有可验证身份；无身份绑定的调用与 Sybil 假票（#3290 hive-mind 共识修复同版）一样不可信——身份唯一性是共识与审计的共同前件。与 gstack v1.87「verified audits」互证（见 `references/review-methodology.md`）。

## 工具面设计三原则（来源：《Harness实践》× colbymchenry/codegraph）

> 证据分级：codegraph 仓库元数据 A 级（MIT，71,356★，2026-09-18 API 核验）；"单工具优于多工具"论断为文章作者观点 + codegraph 官方基准 B 级（−88% 工具调用 / −62% token / −44% 成本，7 仓库×4 次）。

1. **单强工具优于多窄工具**：一个高内聚工具（codegraph 只暴露单个 `codegraph_explore` MCP 工具，接受自然语言任务描述自主决定检索深度）胜过一堆窄工具——工具越多，选择开销与误用面越大；描述被截断时窄工具直接失效。与 GitNexus 17 个 MCP 工具形成选型对照（见 `code-graph-tools.md`）：前者赌模型自主检索能力，后者给确定性查询面——目标技能按项目规模与模型档选择，不设唯一答案。
2. **CLI 形态覆盖子代理盲区**：子代理的上下文里**看不到 MCP 工具描述**（工具表不随 dispatch 下发），只认 CLI——给关键能力同时提供 MCP 与 CLI 双形态（codegraph：MCP 工具 + `codegraph explore <task>` / `codegraph affected <file>` CLI）。目标技能的编排契约（subagent-orchestration 状态回报）同理：子代理可调用的能力必须有 CLI 通道。
3. **生效=多前提同时就位**："装了 CLI ≠ 索引建好 ≠ MCP 注册生效"——comet doctor 把"CodeGraph effective for X"判为三者同时就位（见 subagent-orchestration 的 comet doctor 段）。self-check 探测外部运行时同口径：二进制、索引/配置、宿主注册三面齐查，缺一披露降级。
