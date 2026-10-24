# 工具注册表（ToolRegistry）— 对标 YunkunSec

> 来源：YunkunSec `ToolRegistry`（原生工具 / 网络工具 / 主机工具 / MCP 工具 统一注册发现）。
> 作用：本机 hack team 的工具原先散落在各 SOUL `## 工具优先级` / `references/supplementary-tools.md` / ad-hoc terminal 调用，缺**统一注册视图**与 **MCP 集成状态**标注。本文给出本机可用工具的注册映射 + MCP 就绪度，4 个 hack profile 统一引用。

---

## 一、工具分类注册表

### 1. 原生/Hermes 内置（Agent 直接调用）

| 工具 | 类别 | hack 用法 | MCP? |
|------|------|-----------|------|
| `terminal` | 原生/主机 | nmap/nuclei/sqlmap/bandit/semgrep/volatility… 全部 CLI 工具的执行面 | 否 |
| `search_files` | 原生 | 仓内/镜像内证据检索、源码 sink grep | 否 |
| `read_file` | 原生 | 取证只读挂载、报告读取 | 否 |
| `web_search` / `web_extract` | 网络 | OSINT、CVE 查询、情报检索 | 否（外部 API） |
| `acp_send` | 原生 | 委托 Claude Code 跑深度利用/二分（hack-exploit 有 acp toolset） | 否 |

### 2. 浏览器 / GUI 自动化（MCP 等价层）

| Hermes 工具 | 对标 YunkunSec MCP | 状态 | 用途 |
|-------------|-------------------|------|------|
| `browser_exec` | chrome-devtools MCP（31+ tools） | ✅ 已就绪 | 登录态提取、JS 执行、截图、表单交互 |
| `computer_use` | 桌面自动化 | ✅ 已就绪 | 含验证码/交互式登录、Burp 联动人工环节 |

### 3. 主机/网络探测（CLI，经 terminal）

| 工具 | 安装源 | 类别 | 用途 |
|------|--------|------|------|
| nmap / masscan / rustscan | brew | 网络 | 端口/服务/OS 识别 |
| nuclei / subfinder / httpx | `go install` (projectdiscovery) | 网络/Web | 模板化漏洞探测、子域、存活 |
| ffuf / gobuster | brew/go | Web | 目录/参数爆破 |
| theHarvester / recon-ng / dnstwist / shodan | pip | 网络/OSINT | 邮箱/子域/泄露聚合 |
| sqlmap / searchsploit / msfconsole | 系统 | 利用 | 注入/EXP/Metasploit |
| bandit / semgrep / trivy / tfsec | pip | 审计 | SAST/SCA/IaC/容器 |
| volatility3 / plaso / foremost / binwalk / ewf* | 系统 | 取证 | 内存/时间线/雕刻/镜像 |
| gowitness | `go install` | 网络 | 截图式资产指纹 |
| **wih_engine.py** | `skills/hack-team/wih-secret-hunter/scripts/`（ARL-Next 移植, GPL-3.0） | Web/敏感信息 | JS chunk 4 级瀑布解析挖掘云凭据/AK/JWT/身份证；`python3 wih_engine.py --sites <url> --min-risk CRITICAL` |

### 4. 外部 MCP（YunkunSec 有，本机现状）

| YunkunSec MCP | 本机状态 | 备注 |
|---------------|----------|------|
| fetch（httpx） | 等价 = `web_extract` + `curl` via terminal | 已覆盖 |
| memory（JSON） | 等价 = `hindsight_*` + `memory` | 已覆盖 |
| chrome-devtools | 等价 = `browser_exec`（非标准 MCP 协议，但能力等价） | 已覆盖 |
| **burp** | ❌ 未接入 | HTTP 抓包/重放/漏洞扫描未 wire 到 hack profile；需 `java -jar burp-mcp` + 在 config 注册；当前 exploit SOUL 仅以 headless jar 方式引用（`references/burping...`） |

---

## 二、注册发现约定

- 新工具落地必须登记到本表 + 对应 profile 的 `references/supplementary-tools.md`。
- MCP 类工具在 Hermes 中通过 toolset 暴露（hack-exploit 有 `acp`；browser/computer 已在 default toolset）——**非**标准 MCP 协议，但能力等价，记为"MCP 等价层"。
- burp MCP 缺口：若需补齐，走 `_shared/03-evolution-memory/action-risk.md` 高危命令评审 + Staged Action 协议注册到 config.yaml toolset，不可直接裸跑。

---

## 三、Burp MCP 缺口评估与分级接入方案（2026-08-29 新增）

### 3.1 现状差距

| 维度 | YunkunSec / VulnClaw | 本机现状 | 影响 |
|---|---|---|---|
| HTTP 抓包/重放 | `burp` MCP 服务（stdio，多工具） | hack-exploit SOUL 仅引用 `references/burp-suite-guide.md` 的 headless jar 方式 | 无标准化工具调用接口，无法纳入 Agent Loop 自动编排 |
| 漏洞扫描集成 | Burp Scanner 通过 MCP 暴露为工具 | 无 | 自动化扫描需手工点按，不可编排 |
| 流量证据关联 | YunkunSec `EvidenceManager` 自动关联 HTTP 流量到 Evidence ID | 手工保存，无自动关联 | 证据链断裂，反幻觉闸门无法校验 Burp 流量 |

### 3.2 分级接入路线图

#### Phase 0：评估与风控（当前 → 立即）✅ **已完成**
- ✅ 确认本机有 Burp Suite Community Edition (2026.7.3)
- ✅ 下载 `burp-mcp-bridge v2.8.1` JAR (`~/.hermes/tools/burp-mcp-all.jar`，4.9MB)
- ✅ 验证 `java -version` ≥ 17 (当前 17.0.11)
- ⚠️ **Phase 0 结论**：社区版不支持 Scanner API，但 Proxy/Repeater 工具可用。完整功能需 Pro License。

#### Phase 1：最小可用接入 ✅ **配置就绪，待 Pro License 激活**
```yaml
# ~/.hermes/profiles/hack-exploit/config.yaml 追加
toolsets:
  - hermes-cli
  - acp
  - kanban
  - memory
  - mcp-burp   # 新增
mcp:
  servers:
    burp:
      enabled: false
      transport:
        type: stdio
        command: /opt/homebrew/bin/node
        args: ["/Users/YOURNAME/.hermes/tools/burp-mcp-bridge/bridge/index.js"]
      env:
        BURP_MCP_JAVA_EXTENSION: /Users/YOURNAME/.hermes/tools/burp-mcp-all.jar
        BURP_MCP_BURP_API_URL: http://127.0.0.1:8081
        BURP_MCP_TRANSPORT: stdio
```
- ✅ Burp Suite Community Edition 已安装 (`brew install --cask burp-suite`)
- ✅ burp-mcp-bridge v2.8.1 JAR 已下载 (`~/.hermes/tools/burp-mcp-all.jar`)
- ✅ Node.js Bridge 已安装依赖 (`~/.hermes/tools/burp-mcp-bridge/bridge/`)
- ⚠️ **配置已写入 config.yaml，但 `enabled: false`** —— 等待 Burp Suite Pro License 激活
- 在 `hack-tool-registry.md` 表 4 更新状态为 `⚠️ Phase 1 配置就绪，待 Pro License`

#### Phase 2：全能力编排（1 个月内）
- 开发 Hermes 原生 `burp_mcp` toolset wrapper（参考 `acp` toolset 实现）
- 将 Burp 流量自动写入 `evidence/traffic/`（对齐 `_shared/hack-knowledge-index.md` checkpoint 协议）
- `evidence_gate.py` 扩展支持 `eNNN_burp` 证据 ID 格式，校验 Burp 流量原文
- `verify_finding.py` PoC 模板新增 `burp_replay` 类型：从 Evidence 取出请求 → Burp Repeater 重放 → 判定

#### Phase 3：YunkunSec 级联动（长期）
- `ToolRegistry` 注册 Burp 为标准 MCP server，健康状态机对齐 `vulnclaw/mcp/registry.py:34-160`
- `SkillResolver` 新增 `burp` 相关 alias（`burp-scan`/`burp-replay`/`burp-intruder`），自动路由到 hack-exploit

### 3.3 决策矩阵（是否接入？）

| 条件 | 决策 |
|---|---|
| 无 Burp Pro License | **不接入** Phase 1/2，仅保留 headless jar 手工模式；Phase 3 标记为 `blocked-by-license` |
| 有 License 但团队无 Java 运维能力 | **仅 Phase 1**，冻结 Phase 2/3 |
| 有 License + Java 运维 + 高频需求（周均 ≥3 次 Burp 重放/扫描） | **全 Phase 推进**，纳入 sprint 计划 |

---

## 四、Staged Action Proposal（Phase 1 执行前置文档）

完整的 Staged Action Proposal 已单独归档：
> [`scripts/burp-mcp-phase1-staged-action.md`](scripts/burp-mcp-phase1-staged-action.md)

包含：动作描述、意图收益、影响范围、回滚命令、预计后果、决策矩阵、确认要求、关联文档。

执行 Phase 1 前，必须按 `_shared/01-scheduling-bus/forward-deployed-protocol.md` §三 提交该 Proposal 并获得人类确认。

---

## 五、外部参照工具登记：腾讯朱雀 AI-Infra-Guard（AIG）（2026-10-14 融合）

> 来源：微信转述文《腾讯朱雀开源 AI 红队工具》+ 一手回源 GitHub Tencent/AI-Infra-Guard（Apache-2.0，v4.5.2 2026-08-17：2000+ CVE 规则）；裁决矩阵 `workspace/research/hermes-teams-fusion-20261014/FUSION-VERDICT-20261014.md` A1/A2/A3/A4。

**登记定位：外部参照与对照基线，不部署。** 理由：①Web 平台无鉴权（官方明示禁公网）；②扫描依赖外部 LLM API（openrouter 默认），违集群「LLM 调用统一走 cc-switch」红线；③Skill 扫描能力与已 vendor 的 skillguard 重叠（openclaw-fusion 2026-09 P0 已落地）。当 skillguard 检测能力不足且经批准引入外部扫描服务时为翻案条件。

**登记价值（分类法对照锚）**：AIG 维护两套 AI 供应链风险分类法，可作为 skillguard 扫描结果的**风险命名对照词典**——

| AIG 分类 | 含义 | skillguard/SkillSieve 对位 |
|---|---|---|
| MCP01-MCP10 + 3 补充（名称混淆/拉地毯 Rug Pull/工具阴影） | MCP Server 风险 13 类 | L2 启发已有管道执行/凭据读取；投毒类命名可对照 |
| SkillTrustBench T01-T09 | Skill 风险 9 类 | 扫描结果 risk_type 命名对照 |

**随登记的三个 gap（裁决 A2/A3/A4 收缩吸收，待派工实现，登记即立项）**：

| Gap | 内容 | 建议执行 |
|---|---|---|
| G-A2 供应链检测规则增补 | skillguard 增补：①SKILL.md/HTML 注释内嵌指令检测（strip 注释前后语义差）②工具描述与代码行为一致性比对（AIG「Agent Skill 审计」同款）③Rug-Pull 模式（审批后触发的条件分支）标记 | worker-coder，改 skillguard 规则文件+回环 fixture 测试 |
| G-A3 多轮对抗策略 | llm-redteam 增补「多轮对抗策略」节：上下文铺垫后诱导、响应自适应 payload 生成、策略交叉验证（方法源：AIG Agent Scan 三阶段流程） | worker-researcher/hack-auditor，skill 增节 |
| G-A4 skill 引入安全门禁 | 新 skill 准入第 0 步=skillguard 扫描+SKILL.md 一致性审计（对接设计文档 §3.8「工具准入门」待办） | orchestrator 流程改动，依赖 G-A2 |

---

## 五、AI-Infra-Guard（腾讯朱雀 AIG）外部参照工具登记（2026-10-14 新增）

> 来源：微信转述文 + 一手 GitHub README（v4.5.2，2026-08-17）；裁决矩阵 `workspace/research/hermes-teams-fusion-20261014/FUSION-VERDICT-20261014.md` A1-A6。
> 定位：**外部参照登记，非部署引入**——AIG 本体不部署（WebUI 无鉴权禁公网；平台形态需配外部 LLM API token，违 cc-switch 统一红线；与 skillguard/mcp_poison_scan/模安局五闸门功能重叠）。登记价值：①扫描结果风险命名对照轴 ②本机 AI 组件 CVE 摸底的候选工具（gap 登记，实测前不作能力承诺）。

| AIG 模块 | 一手能力（转述口径） | 本机对位 | 状态 |
|---|---|---|---|
| MCP Server & Skills scan | 14 大类风险（MCP01-MCP10 + 3 补充分类）；源码/远程 URL 双输入 | skillguard 12 规则（SG）+ mcp_poison_scan 6 规则（MP）+ 哈希基线 Rug-Pull | 已有等效工具（skillguard），AIG 分类法作命名对照 |
| SkillTrustBench T01-T09 | 9 类 Skill 风险基准 | skillguard 扫描结果归类参照 | 命名对照轴 |
| Agent Scan | 多阶段红队（信息收集→探测→分级）+ 多轮对抗策略，对标 OWASP ASI | llm-redteam（OWASP LLM Top10 模板 + 多轮拆分注入）+ ARTEX 对标 8 技能 | 方法源引用；HAR 学习/Dify/Coze 对接语境 DROP |
| AI Infra scan | 指纹 100+ AI 组件匹配 2000+ CVE（vLLM/Ollama/ComfyUI/Dify 等） | **无对位**——本机跑本地推理服务从未做过组件级 CVE 摸底 | gap 登记（hack 域），工具实测后更新本表 |
| Jailbreak Evaluation | 越狱数据集批量 + 跨模型对比 | godmode-hunter 攻击模板等效；跨模型对比被模型裁决排除 | 不吸收 |
| Model/API Relay Checker | 中继指纹/黑盒审计 | cc-switch 统一代理 + provider-route-diagnostics | 已覆盖 |

**接线约定**：后续若引入 AIG（仅 CLI/二进制形态、仅内网、扫描本地资产），先过 §3.3 决策矩阵同款评估 + `action-risk.md` 高危评审；登记为「外部参照」期间，其风险分类名（MCP01-MCP10/T01-T09）仅用于 skillguard/mcp_poison_scan 扫描结果的人工归档对照，不接入自动管线。

---

## 修订记录
| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-08-29 | 调研 YunkunSec ToolRegistry 后整理本机 hack team 工具注册映射 + MCP 就绪度 |
| v1.1 | 2026-08-29 | 新增 Burp MCP 缺口评估与分级接入方案（§三） |
| v1.2 | 2026-10-14 | 新增外部参照工具登记 AI-Infra-Guard（§五）+ 三个供应链/对抗/门禁 gap 立项（三微信文融合 t_bced6953） |
