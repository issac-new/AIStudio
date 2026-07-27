# SwarmTeam / 蜂群团队

多 Profile [Hermes Agent](https://hermes-agent.nousresearch.com) 部署 — **23 个 Profile 跨 4 个团队**（swarm / hack / product / ops），具备集中路由、Kanban 任务分发、ACP 编码代理集成、Hindsight 持久记忆。

[English](README.md)

---

## 快速开始

```bash
# 安装全部 23 个 profile
./install-all.sh

# 或安装单个团队
./install-all.sh --team swarm    # 9 个 profile: orchestrator + 8 specialist
./install-all.sh --team hack     # 6 个 profile: recon/exploit/forensics/auditor/c2/weapons
./install-all.sh --team product  # 4 个 profile: manager/researcher/prioritizer/feedback
./install-all.sh --team ops      # 4 个 profile: devops/sre/incident-commander/exec-summary

# 或安装单个 profile
./install-all.sh --profile orchestrator
```

安装后填写凭据：

```bash
cp ~/.hermes/profiles/<name>/.env.EXAMPLE ~/.hermes/profiles/<name>/.env
# 用真实 API key 编辑 .env
```

## Profile 安装（官方分发格式）

每个 profile 是一个独立的 [Hermes 分发](https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions)：

```bash
hermes profile install github.com/issac-new/SwarmTeam --name orchestrator --alias -y
```

安装器读取 `distribution.yaml`，复制分发文件（SOUL.md、config.yaml、skills/、plugins/），并从 `env_requires` 生成 `.env.EXAMPLE`。

---

## 架构

```
                    ┌─────────────────────────────────┐
                    │         Gateway (Matrix,         │
                    │    Weixin, API Server, Email)    │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────▼─────────────────┐
                    │         orchestrator             │
                    │  (GLM-5.2 · 智能路由)            │
                    │  api_server:8650 · matrix · email│
                    └───────────────┬─────────────────┘
                                    │ Kanban 分发
           ┌────────────┬───────────┼────────────┬────────────┐
           ▼            ▼           ▼            ▼            ▼
      ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐
      │  swarm  │ │   hack   │ │ product │ │   ops    │ │ TUI/CLI │
      │ 8 prof  │ │ 6 prof   │ │ 4 prof  │ │ 4 prof   │ │ 直接执行 │
      │ GLM-5.2 │ │ Kimi K3  │ │ GLM-5.2 │ │ GLM-5.2  │ │         │
      └─────────┘ └──────────┘ └─────────┘ └──────────┘ └─────────┘
```

**集中路由**：只有 orchestrator 开启 `api_server` + `matrix` + `email` + `weixin`。所有 worker/specialist profile 均关闭这些平台，仅通过 Kanban 分发接收任务。

**智能路由**（v1.1.0+）：Gateway 消息按复杂度分级——
- **轻量**（问候、简单问答）→ 直接执行，不创建看板任务
- **中等**（单次工具调用、配置修改、日志检查）→ 直接执行 + 轻量留痕
- **重型**（研究、多步编码、安全测试、部署）→ 走完整看板流程 + board 路由

TUI/CLI 消息始终直接执行，不创建看板任务。

### 仓库结构

```
SwarmTeam/
├── install-all.sh              # 批量安装器（23 个 profile）
├── README.md                   # 英文文档
├── README_zh.md                # 中文文档
├── MIGRATION-GUIDE.md          # 部署指南
├── SOUL.md                     # 全局人格
├── global_kanban_rules.md      # 共享 Kanban 路由规则
├── config.yaml                 # 全局配置（已脱敏）
├── shared/                     # 单一事实来源配置管理
│   ├── generate-configs.py     # 配置生成器
│   ├── profiles.yaml           # Profile 定义（已脱敏）
│   ├── setup-hindsight-banks.py
│   └── start-gateway-with-dashboard.sh
├── skills/                     # 39 类，600+ 技能
└── profiles/                   # 23 个 profile 分发
    ├── orchestrator/
    │   ├── distribution.yaml   # 清单
    │   ├── SOUL.md             # 人格
    │   ├── config.yaml         # 模型、工具集、参数（已脱敏）
    │   ├── orchestrator_rules.md
    │   ├── email_kanban_rules.md
    │   ├── hindsight/config.json
    │   ├── skills/             # 39 类技能
    │   └── plugins/            # acp-client, hindsight, run-trace 等
    ├── architect/
    ├── worker-coder/
    ├── hack-recon/
    ├── product-manager/
    ├── ops-devops/
    └── ... （共 23 个）
```

---

## 团队与 Profile 能力

所有 23 个 profile 的 SOUL.md 顶部共享一个 ACP 强制规则块：**编码任务必须通过 `acp_send()` 委托给 Claude Code**，不得用 `write_file`/`patch` 直接写产线代码。只读操作（读代码、跑测试、验证产出）不受限制。配置文件、文档、脚本可直接编写。每个 profile 还有隐私保护规则（路径限制、env probe 关闭、密钥脱敏）。

### Swarm 团队（9 个 profile）— 软件开发流水线

集中编排 + 完整软件开发生命周期。全部使用 **GLM-5.2**（damoxing，1M 上下文），fallback 为 **deepseek-v4-flash**。记忆 bank：`hermes-XXXXXXXXXXXX-swarm`（9 个 profile 共享）。

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| **orchestrator** | Orchestrator / 编排器 | 中央智能路由器 | Gateway 消息智能路由（轻量/中等/重型）；看板管理（4 个看板：swarm/hack/product/ops）；按话题路由看板（安全→hack，产品→product，运维→ops，其他→swarm）；TUI/CLI 直接执行；向 worker 分发任务；租户提取 | 153 |
| **architect** | 架构师 | 技术设计专家 | 将需求转化为可执行技术架构；技术选型与理由；模块划分；接口规范（API 契约）；风险识别；输出标准化架构设计文档 | 227 |
| **project-manager** | 项目经理 | Sprint 编排者 | 从架构文档分解任务；创建带正确依赖链的开发/测试/审查/部署任务；Sprint 规划；燃尽图；worker 分配（coder→tester→reviewer→deployer） | 149 |
| **requirement-analyst** | 需求分析师 | 上游守门人 | 需求澄清与验证；PRD 编写；用户故事；API 规格（OpenAPI）；Gherkin 验收标准；Spectral/Prism 校验；需求不明确时阻塞而非猜测 | 350 |
| **worker-coder** | 开发工程师 | 实现执行者 | 通过 ACP→Claude Code 实现功能；反过度设计；反硬编码；可逆性分级（安全→危险变更）；开放式任务 goal_mode；通过 `kanban_create` 派生子任务 | 279 |
| **worker-deployer** | 部署工程师 | 最后一道关卡 | 部署前验证；回滚预案先行；零停机部署（蓝绿/金丝雀/滚动）；配置与密钥分离；灰度发布；K8s/Helm/Kustomize；容器镜像扫描 | 207 |
| **worker-researcher** | 研究分析工程师 | 证据驱动调研者 | 技术调研与可行性分析；多源三角验证；读原文不读摘要；时效意识；结构化研究报告；开放式调研子任务 goal_mode | 224 |
| **worker-reviewer** | 代码审查员 | 独立质量门 | 审 diff 不审整个文件；高信号低噪音；AI 生成代码专属审查清单（幻觉依赖、似是而非的 API、slopsquatting）；每条意见标注严重度；与 codebase 惯例一致性 | 217 |
| **worker-tester** | 测试工程师 | 独立验证者 | 测行为不测实现；E2E 测试（Playwright/Puppeteer）；负载测试（Locust/Artillery）；AI 生成代码测试（LLM 常见坑）；缺陷严重度分级；可复现证据 | 213 |

**SOUL.md 中嵌入的工具**：pre-commit, commitizen, git-cliff, cookiecutter（coder）；k9s, stern, kubectx, dive, syft, grype, trivy（deployer）；Playwright, Puppeteer, Artillery, Locust, Gatling, Newman（tester）；CodeQL, SonarQube, gitleaks, trufflehog（reviewer）；Graphviz, D2Lang, C4-Builder（architect）；Spectral, Prism, Cucumber, ajv（requirement-analyst）。

### Hack 团队（6 个 profile）— 进攻安全 / 红队

全部使用 **Kimi K3**（custom:kimicode，57 分，原生多模态，最低拒绝率），fallback 为 **deepseek-v4-flash**。记忆 bank：`hermes-XXXXXXXXXXXX-hack`（6 个 profile 共享）。外置引用架构：命令手册和工具文档存储在 `references/` 子目录中（共 8,600+ 行），通过 `read_file` 按需加载，保持 SOUL.md context 精简。

每个 hack profile 包含一个**授权声明**块，声明已授权的渗透测试/安全研究范围（自建靶场、已授权项目、CTF、防御性研究）及红线（无授权不操作、越界即停止、最小影响）。

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| **hack-recon** | 侦察工程师 | 侦察兵，不是突击手 | OSINT 与被动侦察；攻击面发现；目标枚举；为下游利用团队输出结构化成果；工具优先级：brew → go install → pip | 172 |
| **hack-exploit** | 渗透利用工程师 | 突击手，不是侦察兵 | 漏洞验证与利用；PoC 编写（proof-by-exploitation 模型）；初始访问获取；发现→验证两步法；每个利用必须附可复现 PoC | 174 |
| **hack-forensics** | 数字取证与应急响应工程师 | 事故调查员 | 攻击后证据保全；攻击链分析；损害评估；时间线驱动调查；证据链完整（内存/磁盘镜像、日志、网络抓包） | 191 |
| **hack-auditor** | 安全审计工程师 | 白盒分析师 | 源码安全审计；架构安全评估；CWE 分类；内联修复生成（file:line + 修复片段）；DevSecOps 集成；合规检查 | 200 |
| **hack-c2** | C2与后渗透工程师 | 红队操作手 | C2 基础设施搭建；持久化机制；后渗透；MITRE ATT&CK TTP 映射；OPSEC 优先（规避检测、模拟真实威胁行为者） | 198 |
| **hack-weapons** | 武器库工程师 | 武器专家 | 社工钓鱼；载荷生成；密码破解；无线攻击；DDoS 压测；团队中工具覆盖最广 | 180 |

**Hack 团队工作流**：recon → exploit →（c2 负责后渗透 / forensics 负责应急响应 / auditor 负责代码级发现 / weapons 负责工具支持）。orchestrator 根据任务类型分发到对应的 hack specialist。

### Product 团队（4 个 profile）— 产品管理

全部使用 **GLM-5.2**（damoxing），fallback 为 **deepseek-v4-flash**。记忆 bank：`hermes-XXXXXXXXXXXX-product`（4 个 profile 共享）。

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| **product-manager** | 产品经理 | 产品领导者，不是功能搬运工 | 问题框架（"为谁解决什么、成功长什么样"）；逆向新闻稿（用户价值→功能）；需求分解；取舍矩阵（显性化）；结果导向 | 199 |
| **product-researcher** | 产品研究员 | 市场情报专家 | 多角度检索（主源+替代源+反方观点）；三角验证；读原文不读摘要；时效意识；结构化市场调研报告 | 210 |
| **product-prioritizer** | 需求排序师 | 优先级裁判，不是需求搬运工 | RICE 评分（Reach/Impact/Confidence/Effort）；MoSCoW 分类；Kano 分析；容量感知排期；依赖映射；Sprint 排期表输出 | 209 |
| **product-feedback** | 反馈分析师 | 用户之声翻译官 | 多渠道反馈收集；定性编码；定量统计；痛点优先级化；结构化反馈分析报告 | 208 |

**Product 团队工作流**：researcher 收集市场情报 → manager 定义问题并写 PRD → prioritizer 评分排期 → feedback 收集上线后用户反馈。所有输出写入 `kanban_comment` 以便追溯。

### Ops 团队（4 个 profile）— 运维 / SRE

全部使用 **GLM-5.2**（damoxing），fallback 为 **deepseek-v4-flash**。记忆 bank：`hermes-XXXXXXXXXXXX-ops`（4 个 profile 共享）。

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| **ops-devops** | DevOps自动化工程师 | IaC 践行者 | Terraform/Pulumi 基础设施编排；CI/CD 流水线开发（lint→test→build→scan→deploy）；零停机部署（蓝绿/金丝雀/滚动）；Ansible/Helm/Kustomize 配置管理；DevSecOps（tfsec/checkov/gitleaks 嵌入流水线，fail-closed） | 180 |
| **ops-sre** | 站点可靠性工程师 | 可靠性守护者 | SLO/SLI 体系；可观测性建设（Prometheus/Grafana/Tempo/Loki/Jaeger）；错误预算治理；Toil 消除；混沌工程与韧性验证（Chaos Mesh/Litmus） | 174 |
| **ops-incident-commander** | 事件响应指挥官 | 压力下的锚点 | SEV1-SEV4 事故定级；响应协调；影响消除与恢复；无指责复盘；On-call 文化建设；时间线考古 | 211 |
| **ops-exec-summary** | 高管摘要生成器 | 咨询级思考者 | 输入消化（日志/指标/事故/报告）；结构化高管输出；量化呈现；行动建议；受众适配（C-level vs 工程） | 214 |

**Ops 团队工作流**：devops 建设并维护基础设施/流水线 → sre 监控可靠性与 SLO → incident-commander 在事故期间指挥 → exec-summary 产出事后报告和定期摘要。

**SOUL.md 中嵌入的工具**：Checkov, Terrascan, Tfsec, Terragrunt, Kubeval（devops）；Chaos Mesh, Litmus, promtool, Grafana CLI, Jaeger CLI（sre）；amtool, Grafana OnCall, Robusta, PagerDuty CLI（incident-commander）；Pandoc, Mermaid CLI（exec-summary）。

---

## 模型分配

| 模型 | Provider | 评分 | 使用者 | 理由 |
|------|----------|------|--------|------|
| **GLM-5.2** | damoxing（Anthropic API） | 51 分 | swarm（9）+ product（4）+ ops（4）+ orchestrator + 全部 auxiliary | 不限量，零边际成本，1M 上下文 |
| **Kimi K3** | custom:kimicode（Anthropic API） | 57 分 | hack（6）+ vision aux | 最高推理、最低拒绝、原生多模态——安全工作硬约束 |
| **deepseek-v4-flash** | deepseek（Anthropic API） | 40 分 | 全部 23 个 profile 的 fallback | 最快+最便宜，配额耗尽时的保险 |

**Fallback 链**：主模型 → `deepseek-v4-flash`（仅在 429/5xx 时触发）。Fallback 为只读配置——在实际触发前不验证凭据。

---

## 核心特性

### 🔌 ACP Claude Code 集成

所有 23 个 profile 包含 `acp-client` 插件，可通过 [ACP 协议](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp) 委托给外部编码代理（Claude Code、Codex、OpenCode）：

- `acp_send(provider="claude", prompt="...")` — 委托编码任务给 Claude Code
- `acp_agents()` — 发现可用的 ACP agent 和会话
- 通过本地 `cc switch` 代理路由（`127.0.0.1:15721`，可通过 `ANTHROPIC_BASE_URL` 配置）

### 🧠 Hindsight 持久记忆

团队共享记忆 bank，通过 `hindsight` 插件——4 个团队各自内部共享，跨团队隔离：

| 团队 | Bank ID | 共享的 Profile |
|------|---------|---------------|
| swarm | `hermes-XXXXXXXXXXXX-swarm` | orchestrator + 8 specialist（9） |
| hack | `hermes-XXXXXXXXXXXX-hack` | 6 个安全 specialist |
| product | `hermes-XXXXXXXXXXXX-product` | 4 个产品 specialist |
| ops | `hermes-XXXXXXXXXXXX-ops` | 4 个运维 specialist |

orchestrator 可以 `recall()` 同团队任何 worker 写入的领域知识。跨团队隔离实现 compartmentalization（hack ↔ swarm ↔ product ↔ ops 互不可见）。记忆每轮自动召回，重要事实自动留存。

### 📋 Kanban 任务分发

多看板 Kanban 系统用于任务路由：

- **swarm 看板** — orchestrator + 8 specialist（软件开发流水线）
- **hack 看板** — orchestrator + 6 个 hack specialist（安全操作）
- **product 看板** — orchestrator + 4 个产品 specialist
- **ops 看板** — orchestrator + 4 个运维 specialist

orchestrator 是所有看板的 `default_assignee` 和 triage 分解入口。看板路由由话题决定：安全 → hack，产品/市场 → product，运维/SRE → ops，其他 → swarm。

Worker 通过 `hermes -p <assignee> --cli --accept-hooks chat -q "work kanban task <id>"` 启动，每个 profile 最多同时运行 2 个任务，调度轮询间隔 60 秒。

### 🛠️ 技能库

39 个技能类别，600+ 个独立技能，按 profile 打包：

| 类别 | 关键技能 |
|------|---------|
| autonomous-ai-agents | hermes-agent, claude-code, codex, opencode, acp-delegation |
| devops | hermes-profile-config, hermes-worker-lifecycle, kanban-orchestrator, token-optimization, privacy-hardening（40+ 技能） |
| software-development | TDD, systematic-debugging, writing-plans, ai-code-review-checklist, kanban-handoff-contract |
| github | github-pr-workflow, github-code-review, github-issues, github-workflows |
| productivity | docx, xlsx, powerpoint, pdf, google-workspace, notion, linear |
| research | arxiv, evidence-based-research, github-repo-survey, open-source-architecture-analysis |
| cybersecurity | 100+ 安全实现技能（取证、审计、攻击路径） |
| mlops | training（axolotl, unsloth, TRL）, inference（vLLM, llama.cpp）, evaluation（lm-eval-harness） |
| creative | ascii-art, baoyu-infographic, comfyui, manim-video, design-md |
| mcp | native-mcp, mcporter |

### 📡 Gateway 平台

仅在 orchestrator profile 上配置：

| 平台 | 用途 |
|------|------|
| **api_server**（端口 8650） | OpenAI 兼容 HTTP API，模型路由 |
| **matrix** | 自建 Matrix 服务器（Synapse） |
| **email** | IMAP 渠道 + agently-cli（QQ 邮箱 API） |
| **weixin** | 微信公众号 |

全局配置中的 `multiplex_profiles: true` 启用统一 gateway 模式（所有 profile 共用一个进程）。

### 🔒 隐私与脱敏

所有凭据均已脱敏：

- `.env` 文件 → 已移除（安装器从 `env_requires` 生成 `.env.EXAMPLE`）
- `auth.json` 文件 → 已移除
- `config.yaml` 中的 `api_key:` 值 → 清空为 `""` 或 `${ENV_VAR}` 引用
- `profiles.yaml` 中的 `api_key:` 值 → 清空为 `${ENV_VAR}` 引用
- 真实邮箱地址 → 替换为 `your@email.com`
- macOS 用户路径 → 替换为 `$HOME/`
- 隐私加固：`env_probe: false`、`redact_pii`、`redact_secrets`、cwd 锁定工作区

---

## 必需的环境变量

安装后为每个 profile 填写 `.env`（或使用共享 `.env.common` 方式）：

```bash
# 必需 — LLM 访问
DAMOXING_API_KEY=sk-你的damoxing密钥        # GLM-5.2 provider（swarm/product/ops）
DAMOXING_BASE_URL=https://你的damoxing端点
DAMOXING_API_MODE=anthropic_messages
KIMI_API_KEY=sk-你的kimi密钥                 # Kimi K3 provider（hack 团队）
GLM_API_KEY=你的glm密钥                      # Z.AI/GLM 直接访问

# 必需 — Fallback
DEEPSEEK_API_KEY=sk-你的deepseek密钥         # deepseek-v4-flash fallback

# 可选 — Hindsight 记忆（向量检索）
SILICONFLOW_API_KEY=sk-你的sf密钥            # SiliconFlow embeddings

# 可选 — Matrix 网关
MATRIX_ACCESS_TOKEN=syt_你的matrix令牌

# 可选 — ACP Claude Code 集成
ANTHROPIC_AUTH_TOKEN=你的anthropic令牌
ANTHROPIC_BASE_URL=http://127.0.0.1:15721     # cc switch 代理
```

### 共享配置工作流

从单一事实来源管理全部 23 个 profile：

```bash
# 1. 编辑 shared/profiles.yaml — 修改 per-profile 或 shared_config 设置
# 2. 重新生成全部 config.yaml + .env
python3 ~/.hermes/shared/generate-configs.py

# 3. 验证
grep -E "(model|provider)" ~/.hermes/profiles/*/config.yaml

# 4. 重启 orchestrator gateway
hermes -p orchestrator gateway run --replace
```

生成器读取 `shared/profiles.yaml` + `shared/.env.common`，一次性输出全部 23 个 profile 的 `config.yaml` + `.env`。Per-profile 覆盖（model、toolsets、plugins、environment_hint）优先于 `shared_config` 默认值。

---

## 更新

```bash
# 更新单个 profile
hermes profile update orchestrator

# 或重新运行批量安装器
./install-all.sh --profile orchestrator

# 或拉取并重新安装全部
git pull origin main
./install-all.sh
```

## 统计

| 指标 | 值 |
|------|-----|
| Profile 总数 | 23 |
| 团队总数 | 4（swarm / hack / product / ops） |
| SOUL.md 总行数 | ~4,600 行（平均 200/profile） |
| 技能类别 | 39 |
| 独立技能 | 600+ |
| 命令手册工具 | 80+ GitHub 验证（pre-commit, k9s, Playwright, CodeQL 等） |
| 插件 | acp-client, hindsight, observability/langfuse, run-trace, matrix-chat-info |
| Gateway 平台 | api_server, matrix, email, weixin |
| 配置生成器 | `shared/generate-configs.py`（单一事实来源） |

## License

MIT
