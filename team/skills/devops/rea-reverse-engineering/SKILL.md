---
name: rea-reverse-engineering
description: "Use when 用 REA 做逆向分析、按 REAP 提示词跑逆向任务、或排查 REA CLI/MCP 故障：免 provider 能力入口+26 提示词包+实测坑。"
version: 1.2.0
metadata:
  author: orchestrator
  license: MIT
  source: "morluto/rea v6.4.0 融合实测（2026-10-11）；JoasASantos/REA-Prompts REAP 融合（2026-10-26）"
  tags: [devops, security, reverse-engineering, mcp, prompts]
  related_skills: [upstream-agent-skill-fusion, open-source-architecture-research, security-domain-delegation]
---

# REA（Reverse Engineer Anything）集群使用

## When to Use

- 需要对本机 app/包/二进制/网站捕获取证或结构分析时（MCP 工具已在会话内，直接用）。
- REA CLI/MCP 报 provider_unavailable、连接失败、产物解析失败时。

集群已把 morluto/rea v6.4.0 作为逆向执行引擎接入：`hermes mcp add rea --command rea --args mcp`，170 个 MCP 工具全启用（orchestrator profile config）。调研报告（架构/gap/落地路径）：`~/hermes-docker-sandbox/workspace/research/rea-research-report.md`。

## 命令速查

```bash
# MCP 层（agent 会话内自动可用 170 工具；会话中 /reload-mcp 生效）
hermes mcp test rea          # 连接 + 工具发现验证

# CLI 层（一次性分析）
rea capabilities              # 94 个 capability 及副作用声明
rea analyze-javascript-application '/Applications/X.app'   # 免 provider JS/Electron 图谱
rea doctor                    # 环境/注册诊断

# 深度原生分析（需 BYO provider，本机均未装）
# Hopper（商业）/ Ghidra 12.1.x（GHIDRA_INSTALL_DIR，需 JDK 21+）/ IDA（REA_IDA_MCP_CONFIG）
```

## 实测纪律（macOS，2026-10-11）

1. **provider_unavailable ≠ 能力不可用**：`rea analyze/inspect <.app>` 走深度 provider 路由（显式拒绝不降级）；免 provider 能力（JS/Electron/ASAR/.NET/APK 静态/固件/HAR/进程捕获/PE 资源）走专用子命令或 MCP 对应工具。先 `rea --help` 查子命令再下结论。
2. **产物是 YAML 非 JSON**，progress 行混在 stdout，体积可达 32MB——关键旧行（evidence_id/confidence/authority/limitations）在文件头部正则提取，不要按行 json.loads。
3. **Evidence 三要素是验收标准**：引用 REA 结论必须带 evidence_id（内容寻址 ev_ 前缀）+ confidence/authority + limitations；limitations 明示的覆盖缺口不得当作「无此行为」。
4. **改注册配置走 hermes mcp add**：config.yaml 手改被工具层拒绝（安全敏感）；env 附加用 `--env KEY=VALUE` 重注册。`--args` 是 REMAINDER——`--env` 必须放在 `--args` 之前，否则 env 键值被吞进 server 启动参数：配置看似写入、环境变量实际没配，到 rea doctor 才暴露。server 需要进程级 env（GHIDRA_INSTALL_DIR/JAVA_HOME 类）时用 wrapper 脚本内嵌 env + config env 注入双保险，任一通道失效另一个兜底。**（2026-10-12 判例）**PyYAML 直写 profile config.yaml 的 mcp_servers 段运行时实际有效（worker 会话内 170 工具可用、调用全成功），但 `rea doctor` 会报 registration:hermes state=stale——那是 REA 侧登记簿不认识手写段的 cosmetic 噪音，不阻塞作业；消除噪音走 `hermes mcp add` 正式重注册。
5. **不跑 `rea setup`**：它会探测并写入 Claude Code/Cursor 等其他 agent 配置；集群接入只走 `hermes mcp add`。
6. 本机边界：pwntools/pwndbg 类（ELF 布局/崩溃转储）上游标注 Linux x64，macOS 不可用。
7. **Ghidra 深度 provider 已全通（2026-10-11）**：Ghidra 12.1.4 在 `~/lab/tools/ghidra_12.1.4_PUBLIC`（含源码构建的 mac_arm_64 decompile）；MCP 注册走 wrapper `~/lab/tools/rea-mcp-wrapper.sh`（内嵌 GHIDRA_INSTALL_DIR+JAVA_HOME=temurin-21）。系统二进制是 fat/arm64e，Ghidra 不支持 universal——先 `lipo -thin x86_64` 切片再分析。源码构建纪要：`gradle -I gradle/support/fetchDependencies.gradle` 后需手动把 `dependencies/downloads/` 的 jar/tlb cp 进 `flatRepo/`，再 `gradle --no-daemon :Decompiler:buildNatives`（46s）。
8. 反编译 CLI：`rea decompile <path> --procedure <名或地址>`（函数名不对会报 Unknown procedure，先用 nm/entry 地址 0x100000f60 类入口试）。

## REAP 提示词库（2026-10-26 融合）

来源：JoasASantos/REA-Prompts（REAP，MIT，2462★）。26 个场景包 / 102 个提示词，存于本技能 `references/reap/`（`reap-00`…`reap-22` + `reap-prompts` 索引 + `reap-wildcard` + `reap-prompt-writing-tips` + `system_prompt.md` 全库单文件）。正典快照：`~/.hermes/shared/research/reap-fusion-20261026/REA-Prompts-main/`。

### 用法（hack worker 接逆向任务时）

1. 按目标类型选包：`skill_view('rea-reverse-engineering', file_path='references/reap/<pack>/SKILL.md')` 读该场景全部提示词。
2. 复制提示词模板，替换 `<尖括号>` 占位符，一次只聚焦**一个特性**（窄问得证据链，宽问得浅地图）。
3. 产出纪律：每个结论带 file/function/address 证据；确认事实 / 推断 / 未知三桶分离；静态优先（明确「本步不执行目标」）；以具体交付物收尾（SPEC.md / reader 脚本 / 对比表）。

### hack 角色 → REAP 包映射

| hack 角色 | 主用包 | 说明 |
|---|---|---|
| hack-recon | reap-02 (feature tracing), reap-11 (Electron/Web) | 攻击面初绘：单特性追踪 + Web/JS 面指纹 |
| hack-exploit | reap-10 (vuln research), reap-19 (kernel exploit), reap-03 (native binary) | 漏洞研究：信任边界审计→source→sink 追踪→补丁 diff |
| hack-auditor | reap-17 (malware), reap-21 (protectors), reap-14 (cracking), reap-12/13 (anti-cheat/DMA 防御) | 样本分析、保护层研究、合规审计 |
| hack-forensics | reap-15 (version compare), reap-17 (malware), reap-16 (long-running), reap-22 (Go/Rust 恢复) | 取证对账：版本对比、攻击链重构、长期调查续接 |
| 跨角色 | reap-18 (反混淆), reap-08 (Android), reap-07 (固件), reap-09 (内核分析), reap-04/20 (clean-room 克隆), reap-05/06 (游戏/WASM) | 按任务域取用 |

### 安全边界（与 security-domain-delegation 对齐）

REAP 原文红线逐字保留：仅分析自有软件、明确授权的软件或合法研究目标。逆向任务派工照旧过授权门（被动优先、范围限定、授权来自目标侧）。clean-room 克隆只提取行为规格，禁复制代码/资产/品牌/授权机制。
