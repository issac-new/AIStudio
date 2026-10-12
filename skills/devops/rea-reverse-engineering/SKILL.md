---
name: rea-reverse-engineering
description: "Use when 用 REA 做逆向分析或排查其 CLI/MCP 故障：免 provider 能力入口与实测坑。"
version: 1.1.0
metadata:
  author: orchestrator
  license: MIT
  source: morluto/rea v6.4.0 融合实测（2026-10-11）
  tags: [devops, security, reverse-engineering, mcp]
  related_skills: [upstream-agent-skill-fusion, open-source-architecture-research]
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
4. **改注册配置走 hermes mcp add**：config.yaml 手改被工具层拒绝（安全敏感）；env 附加用 `--env KEY=VALUE` 重注册。`--args` 是 REMAINDER——`--env` 必须放在 `--args` 之前，否则 env 键值被吞进 server 启动参数：配置看似写入、环境变量实际没配，到 rea doctor 才暴露。server 需要进程级 env（GHIDRA_INSTALL_DIR/JAVA_HOME 类）时用 wrapper 脚本内嵌 env + config env 注入双保险，任一通道失效另一个兜底。
5. **不跑 `rea setup`**：它会探测并写入 Claude Code/Cursor 等其他 agent 配置；集群接入只走 `hermes mcp add`。
6. 本机边界：pwntools/pwndbg 类（ELF 布局/崩溃转储）上游标注 Linux x64，macOS 不可用。
7. **Ghidra 深度 provider 已全通（2026-10-11）**：Ghidra 12.1.4 在 `~/lab/tools/ghidra_12.1.4_PUBLIC`（含源码构建的 mac_arm_64 decompile）；MCP 注册走 wrapper `~/lab/tools/rea-mcp-wrapper.sh`（内嵌 GHIDRA_INSTALL_DIR+JAVA_HOME=temurin-21）。系统二进制是 fat/arm64e，Ghidra 不支持 universal——先 `lipo -thin x86_64` 切片再分析。源码构建纪要：`gradle -I gradle/support/fetchDependencies.gradle` 后需手动把 `dependencies/downloads/` 的 jar/tlb cp 进 `flatRepo/`，再 `gradle --no-daemon :Decompiler:buildNatives`（46s）。
8. 反编译 CLI：`rea decompile <path> --procedure <名或地址>`（函数名不对会报 Unknown procedure，先用 nm/entry 地址 0x100000f60 类入口试）。
