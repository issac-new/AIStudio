# SwarmTeam

Multi-profile [Hermes Agent](https://hermes-agent.nousresearch.com) deployment — **23 profiles across 4 teams** (swarm / hack / product / ops), with centralized routing, Kanban-based task dispatch, ACP coding-agent integration, and Hindsight persistent memory.

[中文文档](README_zh.md)

---

## Quick Start

```bash
# Install all 23 profiles
./install-all.sh

# Or install a single team
./install-all.sh --team swarm    # 9 profiles: orchestrator + 8 specialists
./install-all.sh --team hack     # 6 profiles: recon/exploit/forensics/auditor/c2/weapons
./install-all.sh --team product  # 4 profiles: manager/researcher/prioritizer/feedback
./install-all.sh --team ops      # 4 profiles: devops/sre/incident-commander/exec-summary

# Or install a single profile
./install-all.sh --profile orchestrator
```

After install, fill in credentials:

```bash
cp ~/.hermes/profiles/<name>/.env.EXAMPLE ~/.hermes/profiles/<name>/.env
# Edit .env with your real API keys
```

## Profile Install (Official Distribution Format)

Each profile is a standalone [Hermes distribution](https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions):

```bash
hermes profile install github.com/issac-new/SwarmTeam --name orchestrator --alias -y
```

The installer reads `distribution.yaml`, copies distribution-owned files (SOUL.md, config.yaml, skills/, plugins/), and generates `.env.EXAMPLE` from `env_requires`.

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Gateway (Matrix,         │
                    │    Weixin, API Server, Email)    │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────▼─────────────────┐
                    │         orchestrator             │
                    │  (GLM-5.2 · smart routing)       │
                    │  api_server:8650 · matrix · email│
                    └───────────────┬─────────────────┘
                                    │ Kanban dispatch
           ┌────────────┬───────────┼────────────┬────────────┐
           ▼            ▼           ▼            ▼            ▼
      ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐
      │  swarm  │ │   hack   │ │ product │ │   ops    │ │ TUI/CLI │
      │ 8 prof  │ │ 6 prof   │ │ 4 prof  │ │ 4 prof   │ │ direct  │
      │ GLM-5.2 │ │ Kimi K3  │ │ GLM-5.2 │ │ GLM-5.2  │ │ execute │
      └─────────┘ └──────────┘ └─────────┘ └──────────┘ └─────────┘
```

**Centralized routing**: only the orchestrator opens `api_server` + `matrix` + `email` + `weixin`. All worker/specialist profiles have these disabled and receive tasks exclusively through Kanban dispatch.

**Smart routing** (v1.1.0+): Gateway messages are classified by complexity —
- **Light** (greetings, simple Q&A) → direct execution, no Kanban task
- **Medium** (single tool call, config edit, log check) → direct execution + lightweight Kanban trace
- **Heavy** (research, multi-step coding, security testing, deployment) → full Kanban flow with board routing

TUI/CLI messages always execute directly without creating Kanban tasks.

### Repository Layout

```
SwarmTeam/
├── install-all.sh              # Batch installer (23 profiles)
├── README.md                   # English documentation
├── README_zh.md                # Chinese documentation
├── MIGRATION-GUIDE.md          # Step-by-step deployment guide
├── SOUL.md                     # Global personality
├── global_kanban_rules.md      # Shared Kanban routing rules
├── config.yaml                 # Global config (sanitized)
├── shared/                     # Single-source-of-truth config management
│   ├── generate-configs.py     # Config generator
│   ├── profiles.yaml           # Profile definitions (sanitized)
│   ├── setup-hindsight-banks.py
│   └── start-gateway-with-dashboard.sh
├── skills/                     # 39 skill categories, 600+ skills
└── profiles/                   # 23 profile distributions
    ├── orchestrator/
    │   ├── distribution.yaml   # Manifest: name, version, env_requires
    │   ├── SOUL.md             # Personality
    │   ├── config.yaml         # Model, toolsets, agent params (sanitized)
    │   ├── orchestrator_rules.md
    │   ├── email_kanban_rules.md
    │   ├── hindsight/config.json
    │   ├── skills/             # 39 categories
    │   └── plugins/            # acp-client, hindsight, run-trace, etc.
    ├── architect/
    ├── worker-coder/
    ├── hack-recon/
    ├── product-manager/
    ├── ops-devops/
    └── ... (23 total)
```

---

## Teams & Profile Capabilities

All 23 profiles share a common ACP enforcement block at the top of their SOUL.md: **coding tasks must be delegated to Claude Code via `acp_send()`**, not written directly with `write_file`/`patch`. Read-only operations (reading code, running tests, verifying output) are unrestricted. Configuration files, docs, and scripts may be written directly. Each profile also has privacy protection rules (path restriction, env probe disabled, secret redaction).

### Swarm Team (9 profiles) — Software Development Pipeline

Central orchestration + full software development lifecycle. All profiles use **GLM-5.2** (damoxing, 1M context) with **deepseek-v4-flash** fallback. Memory bank: `hermes-XXXXXXXXXXXX-swarm` (shared by all 9).

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| **orchestrator** | Orchestrator | Central smart router | Gateway message smart routing (light/medium/heavy); Kanban board management (4 boards: swarm/hack/product/ops); board routing by topic (security→hack, product→product, ops→ops, else→swarm); TUI/CLI direct execution; Kanban dispatch to workers; tenant extraction | 153 |
| **architect** | 架构师 (Architect) | Tech design specialist | Translates requirements into executable technical architecture; tech selection & rationale; module division; interface specification (API contracts); risk identification; outputs standardized architecture design documents (Markdown) | 227 |
| **project-manager** | 项目经理 (Project Manager) | Sprint orchestrator | Task decomposition from architecture docs; creates dev/test/review/deploy tasks with correct `parents` dependency chains; sprint planning; burndown charts; worker assignment (coder→tester→reviewer→deployer) | 149 |
| **requirement-analyst** | 需求分析师 (Requirement Analyst) | Upstream gatekeeper | Requirement clarification & validation; PRD authoring; user stories; API specs (OpenAPI); Gherkin acceptance criteria; Spectral/Prism validation; blocks on ambiguous requirements rather than guessing | 350 |
| **worker-coder** | 开发工程师 (Worker-Coder) | Implementation executor | Feature implementation via ACP→Claude Code; anti-over-engineering; anti-hardcoding; reversibility grading (safe→risky changes); goal_mode for open-ended tasks; subtask spawning via `kanban_create` | 279 |
| **worker-deployer** | 部署工程师 (Worker-Deployer) | Last-mile gatekeeper | Pre-deployment verification; rollback plan first; zero-downtime deploy (blue-green/canary/rolling); config & secret separation; gradual rollout; K8s/Helm/Kustomize; container image scanning | 207 |
| **worker-researcher** | 研究分析工程师 (Worker-Researcher) | Evidence-driven investigator | Tech research & feasibility analysis; multi-source triangulation; reads primary sources not summaries; timeliness awareness; structured research reports; goal_mode for open-ended research subtasks | 224 |
| **worker-reviewer** | 代码审查员 (Worker-Reviewer) | Independent quality gate | Reviews diffs not whole files; high-signal low-noise feedback; AI-generated code specific checklist (hallucinated dependencies, plausible-but-wrong APIs, slopsquatting); severity grading per finding; codebase convention consistency | 217 |
| **worker-tester** | 测试工程师 (Worker-Tester) | Independent validator | Tests behavior not implementation; E2E testing (Playwright/Puppeteer); load testing (Locust/Artillery); AI-generated code testing (common LLM pitfalls); defect severity grading; reproducible evidence; test report into `kanban_comment` | 213 |

**Tools embedded in SOUL.md**: pre-commit, commitizen, git-cliff, cookiecutter (coder); k9s, stern, kubectx, dive, syft, grype, trivy (deployer); Playwright, Puppeteer, Artillery, Locust, Gatling, Newman (tester); CodeQL, SonarQube, gitleaks, trufflehog (reviewer); Graphviz, D2Lang, C4-Builder (architect); Spectral, Prism, Cucumber, ajv (requirement-analyst).

### Hack Team (6 profiles) — Offensive Security / Red Team

All profiles use **Kimi K3** (custom:kimicode, 57 pts, native multi-modal, lowest refusal rate) with **deepseek-v4-flash** fallback. Memory bank: `hermes-XXXXXXXXXXXX-hack` (shared by all 6). External-references architecture: command manuals and tool docs stored in `references/` subdirectories (8,600+ lines total), loaded on-demand via `read_file` to keep SOUL.md context lean.

Each hack profile includes an **Authorization Context** block declaring authorized pentest/security research scope (self-built labs, authorized engagements, CTF, defensive research) and red lines (no unauthorized access, stop on boundary crossing, minimal impact).

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| **hack-recon** | 侦察工程师 (Hack-Recon) | Scout, not attacker | OSINT & passive recon; attack surface discovery; target enumeration; structured output for downstream exploit team; tool priority: brew → go install → pip | 172 |
| **hack-exploit** | 渗透利用工程师 (Hack-Exploit) | Breacher, not scout | Vulnerability validation & exploitation; PoC authoring (proof-by-exploitation model); initial access acquisition; Discovery→Validation two-step methodology; every exploit must have reproducible PoC | 174 |
| **hack-forensics** | 数字取证与应急响应工程师 (Hack-Forensics) | Incident investigator | Post-attack evidence preservation; attack chain analysis; damage assessment; timeline-driven investigation; evidence chain integrity (memory/disk images, logs, network captures) | 191 |
| **hack-auditor** | 安全审计工程师 (Hack-Auditor) | White-box analyst | Source code security audit; architecture security assessment; CWE classification; inline fix generation (file:line + fix snippet); DevSecOps integration; compliance checking | 200 |
| **hack-c2** | C2与后渗透工程师 (Hack-C2) | Red team operator | C2 infrastructure setup; persistence mechanisms; post-exploitation; MITRE ATT&CK TTP mapping; OPSEC-first (evade detection, simulate real threat actors) | 198 |
| **hack-weapons** | 武器库工程师 (Hack-Weapons) | Weapons specialist | Social engineering & phishing; payload generation; password hash cracking; wireless attack setup; DDoS stress testing; broadest hackingtool category coverage in the team | 180 |

**Hack team workflow**: recon → exploit → (c2 for post-exploitation / forensics for incident response / auditor for code-level findings / weapons for tooling support). The orchestrator dispatches to the appropriate hack specialist based on task type.

### Product Team (4 profiles) — Product Management

All profiles use **GLM-5.2** (damoxing) with **deepseek-v4-flash** fallback. Memory bank: `hermes-XXXXXXXXXXXX-product` (shared by all 4).

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| **product-manager** | 产品经理 (Product Manager) | Product leader, not feature courier | Problem framing ("who/what/success"); reverse press release (user value → features); requirement decomposition; tradeoff matrix (explicit, not hidden); outcome-oriented | 199 |
| **product-researcher** | 产品研究员 (Product Researcher) | Market intelligence specialist | Multi-angle search (primary + alternative + contrarian sources); triangulation verification; reads primary sources not summaries; timeliness awareness; structured market research reports | 210 |
| **product-prioritizer** | 需求排序师 (Sprint Prioritizer) | Priority referee, not backlog courier | RICE scoring (Reach/Impact/Confidence/Effort); MoSCoW classification; Kano analysis; capacity-aware scheduling; dependency mapping; Sprint backlog output | 209 |
| **product-feedback** | 反馈分析师 (Feedback Analyst) | User voice translator | Multi-channel feedback collection; qualitative coding; quantitative statistics; pain point prioritization; structured feedback analysis reports | 208 |

**Product team workflow**: researcher gathers market intelligence → manager frames the problem and writes PRD → prioritizer scores and schedules → feedback collects user response post-launch. All outputs go into `kanban_comment` for traceability.

### Ops Team (4 profiles) — Operations / SRE

All profiles use **GLM-5.2** (damoxing) with **deepseek-v4-flash** fallback. Memory bank: `hermes-XXXXXXXXXXXX-ops` (shared by all 4).

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| **ops-devops** | DevOps自动化工程师 (DevOps Automator) | IaC practitioner | Terraform/Pulumi infrastructure orchestration; CI/CD pipeline development (lint→test→build→scan→deploy); zero-downtime deploy (blue-green/canary/rolling); Ansible/Helm/Kustomize config management; DevSecOps (tfsec/checkov/gitleaks embedded in pipeline, fail-closed) | 180 |
| **ops-sre** | 站点可靠性工程师 (SRE) | Reliability guardian | SLO/SLI体系; observability stack (Prometheus/Grafana/Tempo/Loki/Jaeger); error budget governance; toil elimination; chaos engineering & resilience verification (Chaos Mesh/Litmus) | 174 |
| **ops-incident-commander** | 事件响应指挥官 (Incident Response Commander) | Anchor under pressure | SEV1-SEV4 incident grading; response coordination; impact elimination & recovery; blameless postmortem; on-call culture building; timeline archaeology | 211 |
| **ops-exec-summary** | 高管摘要生成器 (Executive Summary Generator) | Consultative thinker | Input digestion (logs/metrics/incidents/reports); structured executive output; quantified presentation; actionable recommendations; audience-adapted (C-level vs engineering) | 214 |

**Ops team workflow**: devops builds & maintains infrastructure/pipelines → sre monitors reliability & SLOs → incident-commander leads during incidents → exec-summary produces post-incident reports and periodic summaries.

**Tools embedded in SOUL.md**: Checkov, Terrascan, Tfsec, Terragrunt, Kubeval (devops); Chaos Mesh, Litmus, promtool, Grafana CLI, Jaeger CLI (sre); amtool, Grafana OnCall, Robusta, PagerDuty CLI (incident-commander); Pandoc, Mermaid CLI (exec-summary).

---

## Model Allocation

| Model | Provider | Score | Used By | Rationale |
|-------|----------|-------|---------|-----------|
| **GLM-5.2** | damoxing (Anthropic API) | 51 pts | swarm (9) + product (4) + ops (4) + orchestrator + all auxiliary | Unlimited quota, zero marginal cost, 1M context |
| **Kimi K3** | custom:kimicode (Anthropic API) | 57 pts | hack (6) + vision aux | Highest reasoning, lowest refusal, native multi-modal — critical for security work |
| **deepseek-v4-flash** | deepseek (Anthropic API) | 40 pts | Fallback for all 23 profiles | Fastest + cheapest, insurance when primary quota exhausted |

**Fallback chain**: Primary model → `deepseek-v4-flash` (triggered only on 429/5xx). Fallback is read-only config — it does not verify credentials until actually triggered.

---

## Key Features

### 🔌 ACP Claude Code Integration

All 23 profiles include the `acp-client` plugin, enabling delegation to external coding agents (Claude Code, Codex, OpenCode) via the [Agent Client Protocol](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp):

- `acp_send(provider="claude", prompt="...")` — delegate coding tasks to Claude Code
- `acp_agents()` — discover available ACP agents and sessions
- Routed through a local `cc switch` proxy at `127.0.0.1:15721` (configurable via `ANTHROPIC_BASE_URL`)

### 🧠 Hindsight Persistent Memory

Team-shared memory banks via the `hindsight` plugin — all 4 teams share within, isolate across:

| Team | Bank ID | Profiles Sharing |
|------|---------|-----------------|
| swarm | `hermes-XXXXXXXXXXXX-swarm` | orchestrator + 8 specialists (9) |
| hack | `hermes-XXXXXXXXXXXX-hack` | 6 hack specialists |
| product | `hermes-XXXXXXXXXXXX-product` | 4 product specialists |
| ops | `hermes-XXXXXXXXXXXX-ops` | 4 ops specialists |

This lets the orchestrator `recall()` domain knowledge written by any worker in the same team. Cross-team isolation provides compartmentalization (hack ↔ swarm ↔ product ↔ ops). Memory is auto-recalled each turn and auto-retained on significant facts.

### 📋 Kanban Task Dispatch

Multi-board Kanban system for task routing:

- **swarm board** — orchestrator + 8 specialists (software dev pipeline)
- **hack board** — orchestrator + 6 hack specialists (security operations)
- **product board** — orchestrator + 4 product specialists
- **ops board** — orchestrator + 4 ops specialists

The orchestrator is `default_assignee` on all boards and the triage decomposition entry point. Board routing is determined by topic: security → hack, product/market → product, ops/SRE → ops, everything else → swarm.

Workers are spawned via `hermes -p <assignee> --cli --accept-hooks chat -q "work kanban task <id>"`, with a max of 2 concurrent tasks per profile and 60s dispatch polling.

### 🛠️ Skills Library

39 skill categories with 600+ individual skills, bundled per-profile:

| Category | Key Skills |
|----------|-----------|
| autonomous-ai-agents | hermes-agent, claude-code, codex, opencode, acp-delegation |
| devops | hermes-profile-config, hermes-worker-lifecycle, kanban-orchestrator, token-optimization, privacy-hardening (40+ skills) |
| software-development | TDD, systematic-debugging, writing-plans, ai-code-review-checklist, kanban-handoff-contract |
| github | github-pr-workflow, github-code-review, github-issues, github-workflows |
| productivity | docx, xlsx, powerpoint, pdf, google-workspace, notion, linear |
| research | arxiv, evidence-based-research, github-repo-survey, open-source-architecture-analysis |
| cybersecurity | 100+ security implementation skills (forensics, audit, attack paths) |
| mlops | training (axolotl, unsloth, TRL), inference (vLLM, llama.cpp), evaluation (lm-eval-harness) |
| creative | ascii-art, baoyu-infographic, comfyui, manim-video, design-md |
| mcp | native-mcp, mcporter |

### 📡 Gateway Platforms

Configured on the orchestrator profile only:

| Platform | Purpose |
|----------|---------|
| **api_server** (port 8650) | OpenAI-compatible HTTP API, model routing |
| **matrix** | Self-hosted Matrix server (Synapse) |
| **email** | IMAP channel + agently-cli (QQ Mail API) |
| **weixin** | WeChat Official Account |

`multiplex_profiles: true` in global config enables unified gateway mode (single process for all profiles).

### 🔒 Privacy & Sanitization

All credentials have been sanitized:

- `.env` files → removed (installer generates `.env.EXAMPLE` from `env_requires`)
- `auth.json` files → removed
- `config.yaml` `api_key:` values → cleared to `""` or `${ENV_VAR}` references
- `profiles.yaml` `api_key:` values → cleared to `${ENV_VAR}` references
- Real email addresses → replaced with `your@email.com`
- macOS user paths → replaced with `$HOME/`
- Privacy hardening: `env_probe: false`, `redact_pii`, `redact_secrets`, cwd locked to workspace

---

## Required Environment Variables

After install, fill in `.env` for each profile (or use the shared `.env.common` approach):

```bash
# Required — LLM access
DAMOXING_API_KEY=sk-your-damoxing-key        # GLM-5.2 provider (swarm/product/ops)
DAMOXING_BASE_URL=https://your-damoxing-endpoint
DAMOXING_API_MODE=anthropic_messages
KIMI_API_KEY=sk-your-kimi-key                 # Kimi K3 provider (hack team)
GLM_API_KEY=your-glm-key                      # Z.AI/GLM direct access

# Required — Fallback
DEEPSEEK_API_KEY=sk-your-deepseek-key         # deepseek-v4-flash fallback

# Optional — Hindsight memory (vector search)
SILICONFLOW_API_KEY=sk-your-sf-key            # SiliconFlow embeddings

# Optional — Matrix gateway
MATRIX_ACCESS_TOKEN=syt_your-matrix-token

# Optional — ACP Claude Code integration
ANTHROPIC_AUTH_TOKEN=your-anthropic-token
ANTHROPIC_BASE_URL=http://127.0.0.1:15721     # cc switch proxy
```

### Shared Config Workflow

For managing all 23 profiles from a single source of truth:

```bash
# 1. Edit shared/profiles.yaml — change per-profile or shared_config settings
# 2. Regenerate all config.yaml + .env files
python3 ~/.hermes/shared/generate-configs.py

# 3. Verify
grep -E "(model|provider)" ~/.hermes/profiles/*/config.yaml

# 4. Restart orchestrator gateway
hermes -p orchestrator gateway run --replace
```

The generator reads `shared/profiles.yaml` + `shared/.env.common` and outputs `config.yaml` + `.env` for all 23 profiles in one run. Per-profile overrides (model, toolsets, plugins, environment_hint) take precedence over `shared_config` defaults.

---

## Updating

```bash
# Update a single profile
hermes profile update orchestrator

# Or re-run the batch installer
./install-all.sh --profile orchestrator

# Or pull and reinstall all
git pull origin main
./install-all.sh
```

## Stats

| Metric | Value |
|--------|-------|
| Total profiles | 23 |
| Total teams | 4 (swarm / hack / product / ops) |
| SOUL.md total lines | ~4,600 lines (avg 200/profile) |
| Skill categories | 39 |
| Individual skills | 600+ |
| Command manual tools | 80+ GitHub-verified (pre-commit, k9s, Playwright, CodeQL, etc.) |
| Plugins | acp-client, hindsight, observability/langfuse, run-trace, matrix-chat-info |
| Gateway platforms | api_server, matrix, email, weixin |
| Config generator | `shared/generate-configs.py` (single-source-of-truth) |

## License

MIT
