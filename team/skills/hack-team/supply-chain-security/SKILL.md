---
name: supply-chain-security
description: "供应链安全整合方案与能力路由。触发：SBOM 生成/分析、依赖漏洞扫描（osv-scanner/pip-audit/npm audit）、typosquatting/dependency confusion/恶意包检测、供应链攻击响应。汇总散在 cybersecurity-* 的 9 个供应链 skill 并定义缺口建设计划。"
version: 1.1.0
author: hack-team (supply-chain integration)
tags: [supply-chain, sbom, sca, dependency-confusion, typosquatting, incident-response]
---

# Supply Chain Security — 整合方案与能力路由

> 受众：hack-auditor / hack-forensics。本 skill 是**路由+整合层**：不重复实现已有能力，而是把散在 `cybersecurity-defense` / `cybersecurity-detection` / `cybersecurity-forensics` 的供应链 skill 集中编目，并补齐缺口（统一响应 playbook、生态覆盖）。

---

## 1. 现状盘点（截至 2026-08-24 实测）

### 1.1 已存在的供应链相关 skill（9 个）

| Skill | 位置 | 能力域 | 关键工具 |
|---|---|---|---|
| `generating-and-analyzing-sboms` | cybersecurity-defense | SBOM 生成+漏洞关联 | Syft, Grype, CycloneDX, SPDX |
| `analyzing-sbom-for-supply-chain-vulnerabilities` | cybersecurity-defense | SBOM 解析+CVE 关联+风险评分+合规报告 | NVD 2.0 API, CycloneDX/SPDX |
| `detecting-dependency-confusion` | cybersecurity-detection | 依赖混淆检测（npm/PyPI/Maven） | 包名解析规则 |
| `detecting-typosquatting-packages` | cybersecurity-detection | typosquat 检测（npm/PyPI/crates.io） | typomania, OSSGadget, pypi-scan |
| `detecting-typosquatting-packages-in-npm-pypi` | cybersecurity-detection | typosquat 检测（Levenshtein+发布日期+下载量异常） | PyPI/npm registry API |
| `detecting-malicious-npm-packages` | cybersecurity-detection | npm 恶意包分诊（install-script/窃取/蠕虫） | GuardDog, npm audit, osv-scanner（提及） |
| `detecting-supply-chain-attacks-in-ci-cd` | cybersecurity-detection | CI/CD 供应链审计（未 pin action、表达式注入、secrets 暴露） | PyGithub, YAML 解析 |
| `hunting-for-supply-chain-compromise` | cybersecurity-detection | 供应链妥协狩猎（木马更新/被篡改构件） | MITRE ATT&CK, osv-scanner（提及） |
| `analyzing-supply-chain-malware-artifacts` | cybersecurity-forensics | 供应链恶意构件取证（SolarWinds 类） | 取证工件分析 |

### 1.2 相邻支撑 skill

- `hack-team/skillguard` — Agent skill 自身供应链扫描（OWASP Agentic Skills Top 10，12 规则+SARIF）
- `hack-team/incident-response` — 通用 6 阶段 IR playbook（证据采集/链式保管规范，供 §4 playbook 复用）
- `hack-team/audit-orchestration` — 8-agent 并行审计编排（供应链审计可作为其中一个 lane）
- `devops/macos-security-tool-install`、`devops/tool-inventory-baseline` — 工具安装/盘点

### 1.3 缺口（Gap）

1. **无统一供应链攻击响应 playbook** — IR 是通用型，缺 SolarWinds/3CX/投毒包专属的遏制-根除-通知流程。
2. **工具链分散无编排** — Syft/Grype/cdxgen/osv-scanner/pip-audit 各自出现，无一站式 SCA 流水线。
3. **生态覆盖不均** — npm/PyPI 强，Maven/Go/RubyGems/Docker Hub 弱。
4. **两个 typosquat skill 功能重叠** — 需 dedupe 路由（见 §2.3）。
5. **GHA workflow 审计无确定性扫描器** — `detecting-supply-chain-attacks-in-ci-cd` 走 PyGithub/YAML 手工解析，无确定性规则库。2026-05 Trail of Bits 实证 zizmor 此前对 YAML anchor 有 4 类解析缺陷（序列内别名扁平化 #1557、anchor 前缀泄漏 #1562、重复 anchor panic #1575、别名 run 值 template-injection 崩溃 #1732），均已随 v1.23.0+ 修复；本机 v1.30.1 实测：四类 anchor fixture + `if: 0`/`timeout-minutes: 0.5`/`secrets: inherit` 反序列化边界全部正常解析，且检出注入/未 pin/危险 trigger。→ 已补：见 §2.2 路由表与 §3.3 zizmor 行（2026-09-18）。

---

## 2. 整合方案

### 2.1 分类定位

本 skill 落在 `hack-team/supply-chain-security`，作为 hack-team 的供应链安全**入口**。不新建顶层 `supply-chain-security/` 目录去搬动既有 9 个 skill（避免破坏 `cybersecurity-*` 既有引用与 skill 索引），采用**中心辐射（hub-and-spoke）链接制**：

```
hack-team/supply-chain-security  ← 本 skill（hub：路由 + 缺口补齐 + 响应 playbook）
        ├──→ cybersecurity-defense/generating-and-analyzing-sboms
        ├──→ cybersecurity-defense/analyzing-sbom-for-supply-chain-vulnerabilities
        ├──→ cybersecurity-detection/detecting-dependency-confusion
        ├──→ cybersecurity-detection/detecting-typosquatting-packages        （首选）
        ├──→ cybersecurity-detection/detecting-typosquatting-packages-in-npm-pypi （API 元数据路线）
        ├──→ cybersecurity-detection/detecting-malicious-npm-packages
        ├──→ cybersecurity-detection/detecting-supply-chain-attacks-in-ci-cd
        ├──→ cybersecurity-detection/hunting-for-supply-chain-compromise
        └──→ cybersecurity-forensics/analyzing-supply-chain-malware-artifacts
```

> 参考的 "DevOps-Security 的 sbom-supply-chain + supply-chain-attack-response" 在本机 skill 库中不存在（`devops/` 下仅 `hermes-tool-dependencies` 沾边），按双 skill 模式（一个 SBOM/SCA 能力 + 一个响应 playbook）在本 skill 内合并落地。

### 2.2 路由表（按任务类型）

| 任务 | 路由到 |
|---|---|
| 生成 SBOM / 扫 SBOM 漏洞 | `generating-and-analyzing-sboms` → 深度分析接 `analyzing-sbom-for-supply-chain-vulnerabilities` |
| 依赖漏洞扫描（无 SBOM，直接扫 manifest/lockfile） | §3.2 快速命令矩阵（osv-scanner/pip-audit/npm audit） |
| Typosquat 检测 | `detecting-typosquatting-packages`（离线/语料匹配）；需要 registry 元数据（发布日期/下载量）时用 `detecting-typosquatting-packages-in-npm-pypi` |
| Dependency confusion | `detecting-dependency-confusion` |
| 恶意包分诊 | `detecting-malicious-npm-packages`（GuardDog） |
| GHA workflow 安全审计（未 pin action/表达式注入/pull_request_target/secrets 泄漏） | **zizmor（确定性，首选）→ §3.3 命令**；规则扩展/批量历史审计再接 `detecting-supply-chain-attacks-in-ci-cd`；SARIF 输出接 `hack-team/sarif-output` |
| 威胁狩猎（怀疑已妥协） | `hunting-for-supply-chain-compromise` |
| 事件取证 | `analyzing-supply-chain-malware-artifacts` + `hack-team/incident-response` |
| 确认攻击后的响应 | **§4 playbook**（本 skill 独有） |
| **AI agent 工具链审计（clone-exec / CI pwn-request / zizmor 结果定级）** | **§3.5 审计清单**（2026-10-04 新增，三类检查点） |

### 2.3 重叠 dedupe 说明

两个 typosquat skill 并存：优先 `detecting-typosquatting-packages`（工具链全、跨 npm/PyPI/crates.io）；当需要向 registry API 取证元数据做时间线/异常分析时补充第二个。后续可将后者 merge 进前者（skill-library-maintenance 待办）。

---

## 3. 核心能力

### 3.1 SBOM 生成与分析

**生成**（按目标选工具）：

```bash
# Syft — 文件系统/镜像通用，输出 SPDX 或 CycloneDX
syft . -o cyclonedx-json=sbom.cdx.json
syft <image> -o spdx-json=sbom.spdx.json

# cdxgen — 语言感知更深（npm/pip/maven/go/ruby），适合 monorepo
cdxgen -o bom.json --recurse .
```

**漏洞关联**：SBOM 喂给 Grype（`grype sbom:sbom.cdx.json`），或直接走 `analyzing-sbom-for-supply-chain-vulnerabilities`（NVD 2.0 关联 + 传递依赖路径 + 风险评分 + 合规报告）。

### 3.2 依赖漏洞扫描（不生成 SBOM 时的快速通道）

```bash
# 跨生态首选（lockfile/manifest 直扫，无 SBOM 开销）
osv-scanner scan --lockfile=package-lock.json
osv-scanner scan -r .            # 递归仓库

# 语言原生
pip-audit                        # Python（requirements/venv）
npm audit --json                 # Node
cargo audit / govulncheck ./...  # Rust / Go（按需）
```

判定升级优先级时结合：可达性（是否真实调用链）、是否生产依赖（`--production`）、EPSS/KEV（被在野利用者优先）。

### 3.3 供应链攻击检测

三类攻击分别路由：

| 攻击类型 | 特征 | 首选 skill / 工具 |
|---|---|---|
| **CI/CD 投毒（GHA workflow）** | 未 pin action、PR 表达式注入、危险 trigger、secrets 泄漏 | **zizmor**（Rust 确定性规则库，上游随 GitHub 官方 Known Answer Tests 对齐；离线跑加 `--no-online-audits`）：`pipx install zizmor && zizmor --no-online-audits .github/workflows/`；`--format sarif` 直接接 `hack-team/sarif-output` 上传 Code Scanning。2026-09-18 本机 v1.30.1 实测检出：unpinned-uses(High)/template-injection(Error)/dangerous-triggers(`pull_request_target`,Error)/artipacked/excessive-permissions/cache-poisoning；YAML anchor 工作流（v1.23.0+ 修复 ToB 四类解析缺陷）与 `if: 0`、`timeout-minutes: 0.5`、`secrets: inherit` 边界均已支持。深挖规则扩展/批量历史审计再接 `detecting-supply-chain-attacks-in-ci-cd` |
| **Typosquatting** | 包名编辑距离小、新注册、低下载量伪装流行包 | `detecting-typosquatting-packages`（typomania/OSSGadget/pypi-scan）；元数据取证走 `-in-npm-pypi` 版 |
| **Dependency confusion** | 私有包名被公网注册高版本劫持 | `detecting-dependency-confusion`；防御：私有 scope 前缀 + registry allowlist + lockfile pin |
| **Malicious packages** | install/postinstall 脚本、窃密外传、蠕虫化 | `detecting-malicious-npm-packages`（GuardDog 规则） |
| **CI/CD 投毒** | 未 pin action、PR 表达式注入、secrets 泄漏 | `detecting-supply-chain-attacks-in-ci-cd` |

狩猎已发生的妥协用 `hunting-for-supply-chain-compromise`（木马更新、构建产物篡改指标）。

### 3.4 供应链攻击响应 Playbook

> 骨架复用 `hack-team/incident-response` 的 6 阶段与链式保管规范（先哈希、后分析），下述为供应链特化动作。

**P0 Detection → Triage（0–1h）**
1. 确认受影响组件与版本范围：对 SBOM/manifest 反向定位受影响依赖（`osv-scanner` / Grype 定向查该包）。
2. 定范围：哪些仓库/镜像/制品含有受影响版本（SBOM 反查 + CI artifact 清单 + 部署清单）。
3. 判断是否已安装/已部署/已上线（install 脚本是否执行过 → 升级严重度）。

**P1 Containment（1–4h）**
4. 冻结部署与依赖更新；CI 加临时阻断规则（registry allowlist / lockfile diff gate）。
5. 已部署：回滚到已知良好制品；吊销轮换该环境所有 secrets（恶意包常规窃 npm token/cloud key/SSH）。
6. 网络侧：阻断包外联 C2 IoC（从 `analyzing-supply-chain-malware-artifacts` 取证输出提取）。

**P2 Eradication & Recovery（4h–数天）**
7. 清除：pin 到安全版本 + 全量重构建（不信任增量缓存，`--no-cache`）；开发者本机 node_modules/site-packages 重装并检查持久化残留。
8. 轮换：所有可能暴露的凭据（按 §5 取证范围清单执行，宁多勿少）。
9. 验证恢复：重建 SBOM → Grype 重扫 → 确认受影响组件清零。

**P3 Post-Incident**
10. 通知义务评估：下游客户/合规（若分发软件含受影响组件 → 出 advisory + 更新 SBOM）。
11. 复盘：攻击入口（typosquat？confusion？维护者账号劫持？）→ 对应加防御控制（§3.3 防御列）。
12. IOC 沉淀进检测规则；skill/playbook 缺口 patch 回本 skill。

### 3.5 AI agent 工具链供应链审计清单（2026-10-04 新增，3 真实仓库实测）

> 适用：审计含 AI agent 工具链、或由 AI agent 开发/使用的目标仓库。来源：gap-20260925-004（验证仓 RD-Agent / pi-harness / VulnClaw 实测，zizmor 1.30.1 离线）+ gap-20260925-001 GitSpawn 白盒审计。总纪律：**工具 finding 必须人工可达性确认后才写报告**；zizmor 结果先过盲区冒烟再采信。

#### 检查点 1 — clone-exec（GitSpawn 类：仓库配置即代码执行）

> **批量/自动化路径（2026-10-09 起，标准入口）**：`scripts/gitspawn_scan.py`（self-contained，零外网）把本节三类检查点固化为可执行扫描，输出 JSON findings + 退出码可直接进 CI 门禁（`--strict` 仅 CRITICAL/HIGH 置 1）。人工命令保留作复核与单仓快查。

```bash
# 批量扫描（三类检查点一次跑完；多仓可并列）
python3 ~/.hermes/skills/hack-team/supply-chain-security/scripts/gitspawn_scan.py <repo> [repo2 ...] --json findings.json
# CI 门禁模式（有 CRITICAL/HIGH 才失败）
python3 ~/.hermes/skills/hack-team/supply-chain-security/scripts/gitspawn_scan.py <repo> --strict
```

```bash
# 接收外来仓库（zip/共享盘/同步盘/USB）后、开 agent 前，先看 .git/config：
cat <repo>/.git/config
# 任何 value 是路径/命令的 key 视为武器：
#   core.fsmonitor / core.hooksPath / core.pager / core.editor / core.askPass
#   core.sshCommand / credential.helper / diff.external / diff.*.command
#   filter.*.{clean,smudge,process}（读 .gitattributes 自命名）
#   log.showSignature + gpg.program（Sonar 变体：伪造 gpgsig commit 的 git log 路径）
git config --global core.fsmonitor false   # 全局兜底
```

- 传播边界：`git clone` **不**传播本地 config；zip/共享盘/USB 才可达。威胁模型=「外来仓库以文件形式到达」，不是「clone 危险」。
- 攻击时机：agent 启动自动 `git status`/`git log`（trust prompt 之前）→ sink 以用户权限执行。
- 绕过史：Sonar 2026-04 用 `log.showSignature + gpg.program` 击穿 Claude 的 fsmonitor-only 修复 → **枚举式 sink 清单必然滞后**，审计时按「value 指向可执行物」语义扫而非仅对照已知清单。
- 实测锚点：gap-20260925-001（Hermes 本机 gpg.program 缺口 PoC + 修复）；3 验证仓 `.git/config` 扫描 clean（负面样本有效）。

#### 检查点 2 — CI pwn-request（pull_request_target / workflow_run 误配）

判定三步（顺序执行，任一步不过即无攻击链）：
1. **fork 可达吗**：触发器是 `pull_request_target` / `workflow_run` /（`pull_request` + forks 权限写者 approve）？
2. **gate 可穿透吗**：特权 gate 条件能否被 fork 仓库天然属性满足？——`head_branch == 'main'`（fork 默认分支同名，可穿透）；`conclusion == 'success'`（fork 也能跑绿上游 CI）；`actor` 成员判断（不校验 repo 归属）。**金标准 gate**：`github.event.workflow_run.head_repository.full_name == github.repository`。
3. **消费 fork 输入吗**：gate 后 checkout `head_sha`/`head_ref`、或把 PR 内容拼进 `run:`/脚本/secrets 上下文？

```bash
grep -n -E 'pull_request_target|workflow_run|head_branch|head_sha|head_ref' .github/workflows/
```

- 危险/安全对照（实测案例）：pi-harness `pr-gate.yml` = 安全模式（prt 但无 checkout、无模板插值、github-script 只读 API）；pi-harness `publish-model-catalog.yml` = pwn 链（workflow_run gate 仅查 conclusion+head_branch → checkout fork head_sha → npm 生命周期脚本 → publish job 携 R2 密钥上传产物）；RD-Agent `readthedocs-preview.yml` = 中危模式（prt + 第三方 action 仅可变 tag pin + PR 写权限，无 checkout/secrets → 降 Medium）。
- **误报豁免（平台语义）**：`pull_request` 事件 GITHUB_TOKEN 被 GitHub 强制 read-only（fork），`[bot]` 后缀是保留名 fork 不可伪造 → zizmor `bot-conditions`/`excessive-permissions` 报 High 的 job，先看触发器：挂在 `pull_request` 下的按降权语义判 Low/Info。实测：RD-Agent ci.yml dependabot job（actor=='dependabot[bot]' + contents:write）为误报示范。

#### 检查点 3 — zizmor 结果定级（工具信任边界 + 盲区 + 误报控制）

```bash
zizmor --no-online-audits --format json .github/workflows/ > zizmor.json   # 基线
zizmor --no-online-audits --format sarif .github/workflows/ > zizmor.sarif # → hack-team/sarif-output
```

- **盲区冒烟（先于采信）**：YAML anchor 跨 job 别名 + `if: 0` + `timeout-minutes: 0.5` + `secrets: inherit` 四类边界用例先跑一遍，解析崩溃/漏报则本次结果不可信。史实：ToB 披露 4 类 YAML anchor 解析缺陷（#1557/#1562/#1575/#1732）v1.23.0+ 修复；本机 2026-09-18 与 2026-10-04 两轮实测 v1.30.1 均正常。zizmor 升级后重跑冒烟。
- **定级规则**：`unpinned-uses` 第三方 action > GitHub 官方（tag 重定向风险不对称）；`dangerous-triggers` 仅是入口提示，必须走检查点 2 三步人工判定；`template-injection` 查 `${{ github.event.* }}` 是否进 `run:` 且 event 字段攻击者可控（PR title/body 可控，bot 触发字段不可控）。
- coverage 纪律：每次审计记录 `(repo, workflow, 检查点类, 状态)` 三元组；未跑检查点的类显式标 skipped。

#### 验证信号（2026-10-04 实测记录，gap-20260925-004）

| 验证仓 | zizmor findings | 确认 finding | 误报示范 |
|---|---|---|---|
| RD-Agent | 21 | readthedocs-preview.yml prt+tag-pin（Medium，降级） | ci.yml bot-conditions High → 平台 token 降级豁免 |
| pi-harness | 15 | publish-model-catalog.yml workflow_run pwn 链（High，gate 可穿透+R2 密钥） | — |
| VulnClaw | 19 | ci.yml unpinned-uses x12（High，含第三方 codecov） | — |

clone-exec 面：3 仓 `.git/config` 全 clean（检查点 1 可出确定性结论）。

---

## 4. 建设计划（缺口补齐）

| 优先级 | 项 | 动作 |
|---|---|---|
| P1 | 统一 SCA 流水线 | 新增 `references/sca-pipeline.md`：Syft/cdxgen → Grype/osv-scanner → 报告 的一条龙命令与 CI 集成模板 |
| P1 | Maven/Go/RubyGems 检测覆盖 | 扩 `detecting-typosquatting-packages` 语料；dependency-confusion skill 已有 Maven，补 Go/RubyGems |
| P2 | typosquat 双 skill merge | 走 `skill-library-maintenance` 流程，后者 absorbed_into 前者 |
| P2 | 供应链威胁情报 feed | 接 OSV/GitHub Advisory 订阅，联动 `hunting-for-supply-chain-compromise` |
| P3 | Agent skill 供应链自查 | `hack-team/skillguard` 纳入本路由表（安装第三方 skill 前必扫） |

---

## 5. 快速命令速查

```bash
# 一站式：生成 SBOM → 扫漏洞
syft . -o cyclonedx-json=sbom.json && grype sbom:sbom.json

# 快速扫（无 SBOM）
osv-scanner scan -r . ; pip-audit ; npm audit --production

# GHA workflow 审计（zizmor，2026-09-18 本机 v1.30.1 实测）
pipx install zizmor
zizmor --no-online-audits .github/workflows/        # 离线人工审计
zizmor --no-online-audits --format sarif .github/workflows/ > zizmor.sarif  # 喂 Code Scanning（经 hack-team/sarif-output）

# AI agent 工具链审计（→ §3.5 三类检查点清单；脚本化批量路径）
python3 ~/.hermes/skills/hack-team/supply-chain-security/scripts/gitspawn_scan.py <repo> --json findings.json   # 检查点 1+2+3 一次跑完
cat <repo>/.git/config                              # 人工复核：检查点 1 clone-exec sink
grep -n -E 'pull_request_target|workflow_run|head_branch|head_sha' <repo>/.github/workflows/  # 检查点 2: pwn-request

# 疑似恶意包：先别装，先分诊（→ detecting-malicious-npm-packages / GuardDog）
# 疑似已中招：进入 §3.4 playbook P0
```

---

*维护：hack-team。发现本路由表与实际 skill 漂移（skill 删除/改名/新增）时，patch 本文档 §1/§2。*
