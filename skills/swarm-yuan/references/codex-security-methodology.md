> **何时读我**：安全扫描门禁整合与威胁建模时。codex-security——约束推理扫描/source-sink/威胁模型五要素。

# codex-security 安全扫描方法论（OpenAI Codex Security CLI 整合）

> 来源：[openai/codex-security](https://github.com/openai/codex-security) `@openai/codex-security` v0.4.0（Apache-2.0，**完全开源免费**），CLI 整合层第 4 对象（与 OpenSpec/comet/gsd-core 同档）。
> **v0.1.11 要点**：① 嵌套 Git 仓库 scan snapshots（#116）——含 submodule 的项目可整仓扫描，remediation checkout 保留嵌套仓库；② protected multi-architecture 容器镜像（x64/arm64）+ AppArmor 受限主机自动降级到 legacy sandbox——Docker 沙箱在受限 Ubuntu/容器环境不再硬崩。这两项让 codex-security 在真实项目（常含 submodule）+ 受限 CI 环境更可靠。
> 纪律：CLI 整合层允许真实命令调用（`npx @openai/codex-security scan`），不重新实现、不复制源码（上游 clone 在 `swarm-yuan/research/codex-security/`，仅供 AI 阅读引用，gitignored）。
> 守决策 27：吸收优先于新增门禁，不新增 `check_*`，门禁数保持 55；守决策 26：复杂度预算不增。
> 适用场景：目标项目需要**AI 驱动的语义级安全扫描**（非传统 SAST 的模式匹配）时，`--sast-deep` 门禁的 `SAST_DEEP_TOOL=codex-security` 显式调用 codex-security CLI，产出 SARIF + findings.json + coverage.json 生成期必读文件。也用于 AI 在 spec/审查节点引用本文的静态评估七元组 + 威胁模型五要素 + 攻击路径分析方法论。

---

## 一、定位：非 SAST 的 AI 约束推理扫描（与 semgrep/opengrep 正交，非降级链一环）

**关键区别**：codex-security **不是传统 SAST**，OpenAI 官方明确说明它不产出 SAST 报告、不依赖模式匹配 + 降级链。它采用的是 **AI 驱动的约束推理 + 验证路径**——用大模型做 source→sink 数据流分析 + 攻击路径推演 + 威胁模型，而非规则引擎扫描。因此它**不进** swarm-yuan `--sast-deep` 的 `semgrep → opengrep → 内置词法` 降级链（降级链是 SAST 工具的降级，codex-security 非 SAST）。

codex-security 与 swarm-yuan 既有安全能力是**正交互补**关系：

| 维度 | swarm-yuan 既有（semgrep/opengrep/内置 = 传统 SAST） | codex-security（AI 约束推理，非 SAST） |
|------|------------------------------------------|---------------------|
| 设计哲学 | 规则匹配 + AST 模式 + 降级链 | AI 约束推理 + 攻击路径验证（官方明确「不包含 SAST 报告」） |
| 扫描层 | AST/词法层（规则匹配） | **语义层**（source→sink 数据流 + 攻击路径推演 + 威胁模型） |
| 输出 | JSON（severity + 规则 ID） | **生成期必读文件**：scan-manifest.json + findings.json + coverage.json + SARIF |
| 威胁模型 | 无（门禁不建威胁模型） | **repository-scoped 威胁模型**（assets/trust boundaries/attacker inputs/invariants） |
| 误报控制 | 豁免登记（5 字段） | **validate 阶段 + attack-path-analysis 阶段双重去误报**（counterevidence 必查） |
| 修复建议 | 无 | **patch 命令**（bundled fix-finding skill 产出修复补丁） |
| 扫描模式 | 全量/目录 | **standard/deep/diff/working-tree 四模式** + bulk-scan 多仓库 |
| 知识库 | 无 | `--knowledge-base` 注入架构文档/威胁模型/安全策略 |

**整合形态**：codex-security 是 `--sast-deep` 门禁的**可选独立载体**（`SAST_DEEP_TOOL=codex-security` 显式调用），**不参与** `auto` 降级链——`auto` 时降级链不变（semgrep→opengrep→builtin），codex-security 只在用户显式选择时启用。两者可并行使用（SAST 找模式命中 + codex-security 找语义漏洞）。

### 开源与许可（非付费门槛）

- **完全开源**：Apache-2.0 许可证，代码公开，任何人可 clone/阅读/修改/分发。
- **Trusted Access 非付费门槛**：README 原文是 `recommend`（推荐）非 `require`（必须）。Trusted Access 是 OpenAI 面向安全研究人员的**身份审核计划**（vetting），不是付费订阅层。有用户反馈完成验证后「API/Codex 模型中似乎什么也没解锁」。
- **真正的成本**：底层 OpenAI API 调用按 token 计费（`--max-cost USD` 可设上限），与任何调用 OpenAI API 的工具一样，非 codex-security 独有限制。

---

## 二、CLI 整合方式（门禁内显式调用，非降级链一环）

`check_sast_deep` 门禁在 `SAST_DEEP_TOOL=codex-security` 时的调用方式（显式选择，不参与 `auto` 降级链）：

```bash
# 前置：npm install @openai/codex-security + npx @openai/codex-security login（或设 OPENAI_API_KEY）
# 扫描（AI 约束推理，非 SAST 模式匹配）：
npx @openai/codex-security scan "${SECURITY_SCAN_DIRS[@]}" \
 --output-dir "$SCAN_ROOT/results" \
 --json \
 --fail-on-severity "$SEVERITY" \
 --model gpt-5.6-sol --effort high
# 导出 SARIF：
npx @openai/codex-security export "$SCAN_ROOT/results" --export-format sarif --output "$SCAN_ROOT/results.sarif"
```

**整合形态（非降级链）**：
```
SAST_DEEP_TOOL=auto（默认）→ SAST 降级链：semgrep → opengrep → 内置词法
SAST_DEEP_TOOL=codex-security → 显式选 codex-security（AI 约束推理，非 SAST；失败时降级回 SAST 链）
```

codex-security 不进 `auto` 降级链——它不是 SAST 工具，没有"装了就用"的降级关系。用户需显式选择 `SAST_DEEP_TOOL=codex-security` 才启用。两者可并行（SAST 找模式命中 + codex-security 找语义漏洞）。

**关键约束**：
- codex-security 需 **Node.js 22.13+ / 24.x / 26.x** + **Python 3.10+** + **OpenAI API Key 或 ChatGPT 登录**——比 semgrep 重得多，且按 API token 计费（`--max-cost USD` 可设上限），故不作为默认载体，只在显式配置时启用。
- **开源免费 + API 计费**：工具本身 Apache-2.0 完全开源免费；Trusted Access 是推荐的身份审核非付费门槛；真正成本是 OpenAI API 调用按量计费。
- `--fail-on-severity` 映射：`SAST_DEEP_SEVERITY=error` → `--fail-on-severity high`；`warning` → `--fail-on-severity medium`。
- 扫描结果存 `SCAN_ROOT/results`（仓库外，`mktemp -d` 创建），**不污染工作区**。
- SARIF 输出可被 swarm-yuan 既有 `to-sarif.sh` 管线消费，或直接上传 GitHub Code Scanning。
- self-check.sh 的 G15 `check_codex_security_cli_wiring`（warn-only）校验 CLI 整合配置。

---

## 三、静态评估七元组（AI 引用核心方法论）

codex-security 的 `references/static-finding-assessment.md` 定义了静态评估的最小有用元组，swarm-yuan AI 在 `--security` / `--sast-deep` / `--authz` 门禁的误报复核节点引用：

| 元组字段 | 含义 | swarm-yuan 既有触点 |
|---------|------|---------------------|
| **source** | 攻击者可控输入 / 外部触发 / 可信操作员输入 | `--security` 门禁的 OWASP Top 10 注入源 |
| **control** | 相关守卫 / 验证器 / 消毒器 / 鉴权检查 / 配置门 | `--authz` 门禁的 CWE-862/863/639 授权检查 |
| **sink** | 危险操作 / 易受攻击依赖 / 破损控制 / 影响点 | `--sast-deep` 内置词法的 eval/exec/Runtime.exec 检出点 |
| **reachable path** | 在给定前置条件下连接 source/control/sink 的代码/配置路径 | `--layer` 门禁的 DDD 分层边界 + 调用链 |
| **boundary** | 产品表面 + 信任边界（使路径具有安全相关性） | 特征卡第 10 项环境资源 + `--service` 微服务边界 |
| **counterevidence** | 削弱/击败/限定声明的静态事实 | `--reuse` 门禁的既有稳定单元复用（可能已含守卫） |
| **proof gaps** | 阻止更强结论的缺失事实 | `--consistency` 人工核对项（勾稽无法自动证伪的留人工） |

**铁律**（codex-security 原文转译）：不要把依赖存在性、字符串匹配、部分调用链当作完整评估。有用的静态评估既说明**找到了什么**，也说明**什么仍未证实**。

---

## 四、威胁模型五要素（repository-scoped）

codex-security 的 `skills/threat-model` 定义了仓库级威胁模型的最小五要素，swarm-yuan AI 在 spec §19 测试设计 + §20 变更影响节点引用：

| 要素 | 含义 | swarm-yuan 既有触点 |
|------|------|---------------------|
| **assets** | 哪些资产或权限重要 | 特征卡第 7 项安全规则（脱敏/密钥/白名单） |
| **trust boundaries** | 信任边界在哪 | 特征卡第 10 项环境资源（运行时/DB/缓存/MQ 边界） |
| **attacker inputs** | 哪些输入是攻击者可控的 | `--security` 门禁的注入源扫描 |
| **invariants** | 代码必须保持什么不变式 | 特征卡第 12 项数据规范（schema/勾稽） |
| **failure modes** | 仓库级最该关心的失效模式 | `--domain` 门禁的领域知识违规（密码明文/SQL 拼接） |

**与 `--shift-left` 门禁的关系**：codex-security 的威胁模型是**仓库级**（不为特定 diff 偏移），与 swarm-yuan `--shift-left` 的「测试设计/变更影响/可观测性防缺陷流入后段」互补——前者建立威胁基线，后者验证变更不破坏基线。

---

## 五、攻击路径分析（source→sink 可达性 + 反证据）

codex-security 的 `skills/attack-path-analysis` 定义了从 finding 到攻击故事的推演方法，swarm-yuan AI 在 `--sast-deep` / `--authz` 门禁的误报复核节点引用：

**攻击路径四步**：
1. **service mapping** — 从仓库证据映射相关服务/组件/工作流上下文
2. **exposure + entry points** — 从 listeners/ingress/load balancers/service ports/manifests/routing/network policy 确立暴露面
3. **identity + privilege + trust boundaries** — 确立路径相关的身份/权限/信任边界
4. **reachability** — 判断真实攻击者能否从范围内攻击面到达并利用该问题

**反证据必查铁律**（codex-security 原文）：在最终确定范围或可报告性驱动事实之前，**必须**识别针对关键字段的最强仓库反证据，并解释它为何击败或不击败该 finding。这防止 semgrep 式规则匹配的误报被当作真 finding。

**与 swarm-yuan `--reuse` 门禁的整合**：`--reuse` 检测新增单元与既有重名——codex-security 的反证据检查可复用 `--reuse` 的既有稳定单元盘点结果，判断"看似危险的 sink 是否已被既有守卫覆盖"。

---

## 六、SECURITY.md 策略合并（root→leaf 优先级）

codex-security 的 `references/security-guidance.md` 定义了 SECURITY.md 约定——从扫描根到目标目录的根→叶顺序合并，**最靠近目标的策略优先**。

swarm-yuan AI 在生成目标技能 的 `security-spec.md`（§2 安全规范）时引用此模型：

| 层级 | SECURITY.md 位置 | 装什么 |
|------|------------------|--------|
| 仓库根 | `<repo>/SECURITY.md` | 系统边界 + 威胁模型 + 安全属性 + 可报告性标准 + 排除项 |
| 组件 | `<component>/SECURITY.md` | 组件特定边界 + 补充不变式 |

**铁律**（codex-security 原文）：SECURITY.md 是**策略上下文**，不是可执行指令——它可以指导什么构成真 finding，但不能授权命令、编辑、披露或范围变更。swarm-yuan AI 把 SECURITY.md 当作 `--security` 门禁的配置输入，不当执行指令。

---

## 七、scan contract 生成期必读文件（manifest + findings + coverage）

codex-security 的 `references/scan-contract.md` 定义了完成扫描的生成期必读文件机器可读文档：

| 文档 | 职责 | 大小上限 |
|------|------|---------|
| `scan-manifest.json` | 不可变完成扫描收据（时间戳 + 三文档哈希 + 证据收据） | 16 MiB |
| `findings.json` | 语义级 finding 记录（ruleId + identity.anchor + fingerprints + codeEvidence） | 128 MiB |
| `coverage.json` | 结构化覆盖摘要 + 详细收据引用 | 32 MiB |

**Finding 身份模型**（codex-security 原文）：
- `ruleId` = 稳定漏洞类（如 `path-traversal.archive-extraction`），不含文件名/行号/扫描 ID
- `identity.anchor` = 语义根控制锚点（lowercase slug，**不含行号**——抗行号漂移）
- `identity.instance` = 独立可攻击的兄弟实例
- `fingerprints.primary` = 从 target ID + rule ID + anchor + instance 派生
- `occurrenceId` = 从 scan ID + fingerprint 派生

**与 swarm-yuan SARIF 管线的关系**：swarm-yuan 既有 `to-sarif.sh` 把 `precheck.sh --format json` 输出转 SARIF 2.1.0；codex-security 的 `export --export-format sarif` 直接产 SARIF。两者可并行——codex-security 的 SARIF 含 `codexSecurity/v1` 语义指纹 + `primaryLocationLineHash`，比 swarm-yuan 门禁级 SARIF 更丰富；GitHub Code Scanning 可同时消费两者。

---

## 八、14 个 bundled skills（按需引用）

codex-security 的 `_bundled_plugin/skills/` 含 14 个 skill，swarm-yuan AI 按 workflow 节点引用其模式（不调 CLI 的节点用方法论引用）：

| skill | 何时引用 | swarm-yuan 触点 |
|-------|---------|----------------|
| `threat-model` | spec §19 测试设计 | 威胁模型五要素（本文 §四） |
| `security-scan` | `--sast-deep` 全量扫描 | CLI 整合（本文 §二） |
| `deep-security-scan` | `--sast-deep --mode deep` 多轮发现 | AI 约束推理深度模式（非 SAST 补充，正交） |
| `security-diff-scan` | `--scope` + `--sast-deep` diff 扫描 | `--scope` 门禁的 git diff 触碰只读 |
| `finding-discovery` | `--sast-deep` 候选发现 | 静态评估七元组（本文 §三） |
| `validation` | `--sast-deep` 误报去伪 | counterevidence 必查（本文 §五） |
| `attack-path-analysis` | `--sast-deep` 攻击路径 | source→sink 可达性（本文 §五） |
| `triage-finding` | `--sast-deep` 分诊 | severity 校准 |
| `fix-finding` | `--sast-deep` 修复建议 | `patch` 命令 |
| `vulnerability-writeup` | `--sast-deep` 漏洞报告 | findings.json codeEvidence |
| `track-findings` | `--sast-deep` 跟踪 | scan history + workbench |
| `propose-security-hardening` | spec §20 变更影响 | 加固建议 |
| `define-security-policy` | 生成目标技能 的 security-spec.md | SECURITY.md 策略合并（本文 §六） |
| `config-preflight` | `--sast-deep` 前置检查 | `--doctor` 自检 |

---

## 九、Docker 沙箱模式（CI 批量扫描参考）

codex-security 的 `Dockerfile` + `compose.yaml` + `codex-security-seccomp.json` 提供了 CI 批量扫描的沙箱范式，swarm-yuan AI 在生成目标技能 的 CI 配置时引用：

| 沙箱层 | codex-security 实现 | swarm-yuan 引用价值 |
|--------|---------------------|---------------------|
| 用户隔离 | `useradd uid=10001` + `USER 10001:10001` | CI runner 非 root |
| 能力裁剪 | `cap_drop: ALL` + `no-new-privileges:true` | 最小权限原则 |
| seccomp | `codex-security-seccomp.json`（白名单 syscall） | 系统调用级隔离 |
| 卷挂载 | input read_only / output / state 三卷分离 | 扫描输入与产物隔离 |
| 凭据 | `CODEX_API_KEY` 环境变量传入，不持久化 | API key 不入仓库 |

**与 swarm-yuan `--sbom` / `--release-sign` 门禁的关系**：codex-security 的 Docker 沙箱是 CI 批量扫描的参考实现；swarm-yuan 的 `--sbom` 门禁做 SBOM 生成 + 许可证扫描，`--release-sign` 做发布签名——三者正交，可组合使用。

---

## 十、与 swarm-yuan 既有触点的整合声明

| codex-security 概念 | swarm-yuan 既有触点 | 整合方式 |
|---------------------|---------------------|---------|
| CLI scan 命令 | `check_sast_deep` 门禁（gates-warn.sh） | `SAST_DEEP_TOOL=codex-security` 时显式调用（非降级链一环，codex-security 非 SAST；失败时降级回 SAST 链 semgrep→opengrep→builtin） |
| 静态评估七元组 | `--security` / `--sast-deep` / `--authz` 门禁的误报复核 | AI 引用本文 §三 做七元组核对 |
| 威胁模型五要素 | spec §19 测试设计 + `--shift-left` | AI 引用本文 §四 建仓库级威胁模型 |
| 攻击路径分析 | `--reuse` 门禁的既有稳定单元盘点 | 复用 `--reuse` 结果做反证据检查 |
| SECURITY.md 策略合并 | 目标技能 的 security-spec.md（§2） | AI 引用本文 §六 的 root→leaf 合并 |
| scan contract 生成期必读文件 | `to-sarif.sh` SARIF 管线 | codex-security SARIF 与门禁级 SARIF 并行消费 |
| 14 bundled skills | swarm-yuan 13 步生成流程（Step 1-13） | AI 按 workflow 节点引用对应 skill 模式（本文 §八） |
| Docker 沙箱 | `--sbom` / `--release-sign` 门禁的 CI 配置 | AI 引用本文 §九 做目标技能 CI 沙箱设计 |

---

## 十一、不引用的部分（守纪律声明）

以下 codex-security 能力**不引用**，守 CLI 整合层「不重新实现、不复制源码」铁律：

- `_bundled_plugin/scripts/` 的 Python 脚本实现（resolve_security_md.py / finalize_scan_contract.py 等）——只引用模式，不复制脚本
- `_bundled_plugin/skills/*/` 的 skill 源码——只引用 skill 的方法论模式（本文 §八），不注册为 swarm-yuan skill
- `src/` 的 TypeScript SDK 实现（api.ts / runtime.ts / cli.ts 等 66k+ 行）——CLI 整合层只调 `npx @openai/codex-security` 命令，不重新实现 SDK
- `docker/` 的 seccomp profile + entrypoint.sh——只引用沙箱范式（本文 §九），不复制 Docker 配置
- codex-security 的 MCP server（`.mcp.json`）——swarm-yuan 已有 MCP 治理（`references/mcp-governance.md`），不重复注册 codex-security MCP

---

## 十二、版本与来源

- 来源：[openai/codex-security](https://github.com/openai/codex-security) `@openai/codex-security` v0.5.0（Apache-2.0）
- 许可证：Apache License 2.0
- 上游 clone 位置：`swarm-yuan/research/codex-security/`（本地参考，gitignored，不入 git）

npm v0.1.25-0.5.1 能力：

- **v0.6.0**（minor，2026-10-22，19 提交）：**厂商报告导入分离账本**（#1441/#1847 等——Wiz CSV/Snyk JSON/Semgrep/Endor/GitHub code scanning alerts 经 `publish findings --to local/cloud` 存证、`findings imported` 读回；本地导入免登录免模型调用，**与自产评估扫描结论分账不混**——实测证据与转述证据在存储面分级，消费方可辨来源）。**严重度多数票评审**（#1765，breaking——无自定义 rubric 用内置 rubric 兜底；`--runs N`（1-10，默认 3）独立评审、众数定档、**平票从严取最高**；**评审失败不回退继承扫描器严重度、不存部分票**——裁决失败回退继承值=把不确定性伪装成结论，与本仓门禁结果词表诚实化对齐；成本面默认每未缓存 finding 3 次模型调用，升级必读）。**owner suggestions 独立报告**（#1760——`scan --owner-suggestions` 另出独立报告，不改动已完成扫描）。**hosted 修复 CLI 化**（#1854——`patch --host`/`verify-fix --host` 暴露 v0.5.1 runHostedRemediation 协议；`--verification-mode static` 显式声明验证作用域为源码证据、不冒充命令执行边界）。**策略 diff 去 Python**（#1837——Node 内计算，SDK 保形改义——弃用模式记档：保接口形态、改实现语义须走弃用公告）。来源：`docs/research/R140-runtime-refresh.md`。

- **v0.5.1**（patch，2026-10-20，约 56 fix + 1 feat）：**宿主补丁生成与独立验证**（#1684 `runHostedRemediation()` + JSON-RPC 适配器——集成方可生成补丁并独立验证候选修复；**checkout 隔离、沙箱执法、候选补丁身份、发布权全部由宿主供给**——v0.4「宿主供给执行器」与 v0.5「完整证据输入」的延续：执行面与判定面分离，工具只做生成与验证）。**辅助输出不得覆盖命令结果**（#1800/#1818/#1824/#1826——可选日志、更新通知、清理动作不再覆盖已完成的扫描/导入/发布结果；失败命令不打印成功输出；补丁与验证命令等待必需输出写完——**「做了附加动作」不得冒充「主命令成功」**，结果词表诚实化又一证）。**取消语义补全**（#1819/#1593——取消后的修复验证恢复已应用补丁状态；Deep Scan 报告保留已接受的 worker 覆盖及原始证据（含取消/discovery 死线后恢复的）——**取消保留已完成，不连坐**）。**比较基准随数据保存**（#1740/#1811/#1810/#1815——Daybreak 选择、Bedrock region/profile、severity helper 以保存的仓库为准，跨扫描与修复持久；扫描历史/反馈/自动匹配统一按扫描开始时间——**比较口径随数据存档而非随会话重建**）。**路径与字面量保真**（#1812/#1814/#1786 等——保存的 scope/组件扫描/CSV 导入保留字面路径；`-` 开头的 helper 值与字面量 TOML 串保值）。来源：`docs/research/R132-runtime-refresh.md`。

- **v0.5.0**（minor，2026-10-20）：**调查时间预算**（#1674——`--max-time 15` / SDK `maxTimeMinutes` / 项目 `scan.max_time_minutes`；**Standard/diff 为 advisory，Deep Scan 在发现阶段强制执行**，截止后仍可继续报告；预算是“调查许可”不是硬超时也不是最短运行；resume 保留原 deadline，rerun 重新计。方法层：**时间预算的约束力按阶段声明**——发现阶段有界、报告阶段可溢出，避免“到点即截断结论”或“预算形同虚设”）。**宿主供给的 finding 复核与分级**（#1682/#1662——`validate --records` 对源码核验，`classify-severity --records` 按外部严重度标尺分级；两者都走宿主执行器，分级不需要仓库或已保存扫描——**证据核验与严重度裁决可分离，裁决标尺由宿主提供**）。**证据完整性成为修复前置**（#1608——patch/fix 验证必须使用保存扫描的完整 sealed findings，缺失或不匹配即停止，不再拿缩短预览喂模型——**修复输入=完整证据，缺证即拒**）。**用量口径区分“已记录/缺失回执/未完成轮次”**（#1640——部分总量显示 “at least X tokens; some usage unavailable”；历史账户限额读数不是实时额度——**计量下限必须显式，缺失不能补零**）。**删除 capability preflight 注册表**（#1609——可选 worker/goal 工具不再依赖预检注册；worker 起不来就在 parent 继续，不改持久配置去启用可选能力——**能力发现走真实 spawn 结果，配置不为失败兜底**）。**选中 profile 的 approval_policy 优先于根策略**（#530——显式 profile 策略覆盖 root；未设才继承——**就近显式策略优先，授权语义不合并模糊**）。**恢复前验证已完成工件**（#1720——bulk-scan 复用完成结果前校验契约与 seal，无效结果重开并保留旧工件；并行 worker 回执串行写、发布回执原子替换——**恢复=验真后复用，不是“有文件就算完成”**）。**provider 选项显式化**（#1623/#1677——Cheaper Inference / Bedrock / OpenRouter / Fireworks，非 OpenAI provider 须显式模型与凭据）；**reasoningEffort 字符串透传**（#1712/#1717）；**GitHub Action 分发与 npm 发布分离**（action-vX.Y.Z 携带 manifest/SBOM/完整提交 SHA）。来源：`docs/research/R124-runtime-refresh.md`。

- **v0.4.0**（minor）：**hosted scan 执行模型**（#1559——`runHostedScan(input, { executor, signal, onEvent })` SDK 与 `scan --host` JSON-RPC 适配器；**opt-in 且宿主供给执行器、冻结检出、显式模型与存储设置；授权、取消与持久执行态归宿主所有**——把「谁来执行、谁担责任」从隐式契约升为显式接口：执行权/取消权/执行态持久化三权在宿主侧声明，扫描器只消费冻结检出，与 G 系「扫描输入面冻结」参照同向）；**token 计量不双计**（此前 Deep Scan worker 失败尝试与上下文压缩的已记用量不入总额、resumed history 重复计——现失败尝试与压缩用量计入总额且恢复的历史只计一次；SDK 与兼容宿主可在报告生成后补记最终响应的尾款——**计量=真消耗的并集，恢复不重复收款**，与 claude-code 2.1.302「resume 后成本连续」同族互补：一个防从零重计、一个防恢复双计）；bulk-scan 恢复与报告格式化改善；**废弃 ranking helpers 移除**（minor 破坏项：直接消费 helper 者按迁移指引改道——破坏性删除进 minor 须带迁移指引）。来源：`docs/research/R117-runtime-refresh.md`。

- **v0.1.26**：GitLab MR 验证补丁通道；**安全修复验证须显式请求**（fail-closed）；confirmed finding 匹配提速；**跨扫描发现关系保留**（findings 生命周期跨扫描延续：new/persisting/resolved 关系不因重扫丢失）；sealed 扫描目录去重；去重评审阶段对齐加固（发现生命周期管理与本仓 gate-trends 的趋势记录一致）。来源：`docs/research/R20-runtime-refresh.md`。
- **v0.1.27**：patch/validation **复用 scan 认证**（认证态一致性）；SDK pipeline 去重并发可配；scan-contract 不声明「文档尺寸上限」（不存在的能力不写进契约）；UTF-8 BOM 容错。来源：`docs/research/R24-runtime-refresh.md`。
- **v0.1.28**：**fix-finding skill 限于安全漏洞**（#923）——扫描/评审技能的产出职责收敛，发现面不得越出其威胁模型承诺（scope fail-closed，与「契约只声明真实存在的能力」互补）；**cost 上下文感知估算区间**（#926，估算给区间不给点值）；CLI 接受任意扩展名 KB 文本（#924，输入宽容化）。来源：`docs/research/R32-runtime-refresh.md`。
- **v0.1.29**：**model refusals 后保留 undecided findings**（#960，去重不得吞掉模型拒绝面的未决发现——「模型拒绝 ≠ 发现不存在」）；**失败扫描发结构化 JSON 错误**（#709，错误可机读、门禁可消费）；**Terraform 进 scan inventories**（#944，IaC 安全面扩展）；**bound source preview reads**（#947，有界读取）；patch verified findings（#961）与 patching 进度显示（#931，修复验证面）；policy discovery 容忍 malformed archived Git metadata（#935，容错）。来源：`docs/research/R40-runtime-refresh.md`。
- **v0.1.30/0.1.31**：**finding 归属人建议 + 证据链**（`status: identified / abstained / error` + `evidence[]` + `limitations[]`，**允许弃权并说明局限**）；**CWE 映射进 finding 契约**（Ajv 2020 校验，测试含 `[" cwe-089 "]` 等脏输入）；**审计门禁语义**（**只有显式标为 scan-fatal 的错误才终止**，通用 OS 错误走有界重试；扫描失败按 error 上报而非静默；**本地 Git hook 是 advisory、不可作信任根**）。
- **v0.2.0**：**威胁模型 artifact 化**（Standard/Deep/Diff 扫描与策略生成均落盘威胁模型，`export --artifact threat-model` 无模型调用导出；`threatmodel.md` 路径可 null 须判、markdown 与结构化双格式兼容读——**生成的中间资产落盘可复用，且消费方须兼容双格式**）；**暴露凭证检查**（源码含未用代码与测试；离线不试证（发现凭证不打服务）、区分疑似暴露与占位符——**检查动作本身不得放大风险**）；`--model`/`--effort` 贯穿 patch/验证/修复核验/比对（工具档位显式化贯穿全命令面）；**扫描选择面扩展**（C++ 头 .hh/.hxx、EJS/ERB/PHTML 服务端模板、Vyper——模板与非常规扩展名是扫描面的系统性盲区）；**Unix 沙箱预检先于付费调用**（先证明沙箱可用再花钱——资源消耗前的环境前置检查）；升级注意三条：findings API 强制 `Content-Type: application/json`（缺即 400）、诊断文本不再脱敏（输出可含敏感值须复核后再分享）、effort 接受任意非空串（值合法性归 provider）。npm 断流终结（registry 0.2.0 已上，0.1.32 空洞跳过）。来源：`docs/research/R97-runtime-refresh.md`。
- **v0.3.0**（minor，328 提交）：**standalone validation 收窄 source-only**（#1423——独立验证输入面=源码+目录/内联上下文，不吃仓库全量上下文；验证面与扫描面输入契约分离，无仓库环境也能跑但结论口径相应收窄）；**scan outcome 退出码语义收敛为三值**（#1633——completed report-only=0 / opt-in findings 阈=1 / 执行或必需输出失败=2，**删 partial/unknown 中间态**：不可判定态不留词表，退出码每个值可判定；历史 sealed 报告保持可读（读兼容不写兼容）；Deep Scan 需当前版本插件；新 finding 须规范字段）；**CODEOWNERS 优先于推断归属**（#1519——归属建议先读声明式 CODEOWNERS，推断只补缺——声明优先于推断的归属族）；**config 加载失败给出原因**（#1634——坏配置文件报根因不静默，与 mark-active 框架 glob 报错附 file:line 精确位置的修复同向）；SDK 生成补丁无须管理 CLI 进程（#1635——能力内嵌不进程代理）；Cloud findings 读入 Codex（保存的发现可在宿主消费）；usage 耗尽即停 Deep Scan 工人（配额边界即停工）；`fix(cli)` 供给 issue 补丁返回 PR 详情、UNC 路径只读打开 SQLite 等修复批。来源：`docs/research/R115-runtime-refresh.md`。
