# 技术组件调研台账（2026-10-27 刷新）

> 范围：既往调研线覆盖的技术组件（research/ 目录 2026-10-21 起的 7 条调研线 + 本机部署的配套组件）。
> 刷新日：2026-10-27。上游状态全部为本日 gh api / npm view / STIX-diff 实测，非记忆引用。
> 留痕卡：t_2bee444f（swarm 板）。
> 每组件五栏：基线（上次调研锚）｜上游现版（本日实测）｜能力差异｜本机部署态｜处置与去向。

## 一、总表

| # | 组件 | 基线（上次调研） | 上游现版（10-27 实测） | 本机部署态 | 处置 |
|---|------|------------------|------------------------|------------|------|
| 1 | REA MCP（rea-agents） | 6.4.0（10-12 部署，170 工具） | **6.8.0**（npm 10-25 发布） | ✅ 已升级 6.8.0（本日 npm -g 实测 `rea --version`=6.8.0） | 已升级+冒烟通过 |
| 2 | Ghidra | 12.1.4（10-14 部署） | **12.2**（10-22 发布） | 12.1.4 在位，wrapper JAVA_HOME=temurin-21 | 登记缺口：12.2 需 JDK 25（已确认在位 jdk-25.jdk），换绑即升，未静默动 wrapper |
| 3 | ATT&CK（方法论坐标系） | v19.2（2026-08 基线） | **v20.0** | 技能基线已刷 v20.0（本日 patch） | 已落地（+9 AI 类技术入技能锚点） |
| 4 | REAP 提示词库 | 26 包快照（10-26 融合，skill v1.2.0） | 10-26 push 后 Skills 树 + README md5 **零漂移** | 本地快照=上游（实测 md5 一致） | 无需动作；星 2462→2817 仅热度变化 |
| 5 | CyberStrikeAI | v1.7.24 上游（10-22 调研立项，T2 卡 gave_up） | v1.7.24（10-16）+ 10-23 feat 提交（durable async conversation runs） | 未部署（调研线，本体不部署） | T2 卡 13:44 unblock→13:47 拾取→**13:51:34 二次 gave_up**（cc-switch 路由超时，crash 早于 13:53 恢复确认），现 blocked 待重入队（复活命令留 t_2bee444f comment）；源码深读含 10-23 新提交 |
| 6 | HexStrikeAI | v6.0（7 月底概念级融合；10-22 立项源码深读 T1 卡 gave_up） | master 末 push 2026-08-03（13116★） | 概念级融合在位 | T1 卡同上二次 gave_up 待重入队；上游停滞 10-27−08-03≈3 个月，源码深读基线仍有效 |
| 7 | Sonic Harness（蛙池） | 机制分析 S1-S12（10-22） | 无公开 repo（闭源产品） | 机制层已吸收（长程任务纪律） | 无版本追踪面；完结 |
| 8 | RedEvoAgent | arXiv v2（10-23 融合，llm-redteam v1.7.0） | arXiv 仍 v1/v2（无 v3） | v1.7.0 在位 | 无增量；完结 |
| 9 | DeepInfer | 5537415（10-25 快照） | origin/main=5537415（fetch 后 0 落后，本日实测） | 本地 clone 在位 | **调研未收口**：目录内无 VERDICT/裁决文件，登记欠账 |
| 10 | deepseek-recipe | 935817c（10-20 快照） | origin/main=935817c（0 落后）；CHANGELOG 最新 0.2.0（10-20）+Unreleased 空 | 本地 clone 在位 | 同上：调研未收口，登记欠账 |
| 11 | 银翼评测系（方法论） | 2026-10-21 八篇 + 10-24 蜂群篇 | —（公众号内容，无版本轴） | M1/M2 指标已落 baseline.md | 完结（效力待首轮实测，已在 gap 登记） |

## 二、能力差异明细（本机版本 vs 上游最新）

### 2.1 REA 6.4.0 → 6.8.0（跨 6.5/6.6/6.7 三个版本）

来自上游 CHANGELOG（morluto/rea，本日拉取）：

**新能力（对 hack/eda 逆向域直接增益）**：
1. **Agent Environments**（6.8 主打）：从网络捕获/浏览器场景/一句 prompt 构建本地 agent 环境，`environment-serve` 起流式 HTTP 服务派生读+证据门控写——为「逆向任务的回放重验」提供官方基建。
2. **新格式面**：GPU 代码对象（CUDA/HIP）、Erlang BEAM、Python pyc、Unity IL2CPP metadata（v24/27）、Godot PCK、PyInstaller、Node.js SEA、devicetree、GameCube/Wii DOL、PE Authenticode/TLS callbacks、ELF notes、Linux 内核模块元数据。
3. **原生调查增强**：跨 build 函数匹配、伪代码导出至可恢复目录、objdump 按符号选段、原生库存分页。
4. **恢复控制**：WASM/SQLite/firmware 各面 deadline 可调、MCP 启动预算、regex worker heap 上限。
5. **JSONL 输出**：`--format jsonl` 行式导出 + metadata 控制记录。

**breaking changes（已核对本机面）**：
- `analyze_function` 默认 retained summary（完整档案需 `detail: "complete"`）——hack SOUL 里如有旧调用习惯需注意。
- MCP input schema 默认 compact（完整版需 `REA_MCP_INPUT_SCHEMA_PROFILE=full`）——MCP 工具描述面会变小，正常。
- Node 前提 ^22.23.4 / ^24.22.1 / >=26.12.1——本机 node v24.22.1 ✅ 满足。
- Browser storage 新表示：历史哈希存储可读，但新旧捕获不能互比。

**本机验证（10-27）**：`rea --version`=6.8.0；`environment-serve`/`inspect-erlang-beam`/`inspect-gpu-code-objects`/`inspect-il2cpp-metadata` 命令在位（--help 实测）；4 profile mcp_servers.rea.enabled 均为 true，wrapper 引用不变（版本随 npm 全局包走）。

### 2.2 Ghidra 12.1.4 → 12.2

- 发布 2026-10-22，full backward compatible（项目数据）。
- **硬前提：JDK 25**（本机 jdk-25.jdk 已在位 ✅，仅 wrapper JAVA_HOME 仍指 temurin-21）。
- Server/BSim 部署 TLS 强制化（本机单机分析面不受影响）。
- 处置：登记缺口，不静默升级——升级动作=下载 12.2 + wrapper JAVA_HOME 换绑 jdk-25 + `rea doctor` 复验。REa wrapper 与 Ghidra 的兼容性以 REA 上游支持矩阵为准（REA 6.8 CHANGELOG 未见 Ghidra 12.2 门槛条目）。

### 2.3 ATT&CK v19.2 → v20.0

- 战术面 15 持平（无增删）。
- 技术 697→706，+9/−0，**全部 AI 类**：Direct Prompt Injection、Indirect Prompt Injection、AI Result Poisoning、AI-Enabled Exfiltration、Impair Autonomous Defenses、Anti-Automation Evasion、Avoid CAPTCHA、Automate CAPTCHA Completion、Steal Application Specific Passwords。
- 落点：`~/.hermes/skills/devops/security-tool-landscape-tracking/SKILL.md`（default profile 物理本体，orchestrator 经中央库共享）已刷 v20.0。llm-redteam 报告坐标系从此引 v20.0。

## 三、欠账与缺口登记

| 缺口 | 状态 | 去向 |
|------|------|------|
| DeepInfer / deepseek-recipe 调研未收口（目录无 VERDICT） | 欠账 | 本台账登记；裁决建议按需派卡（两仓 0 落后上游，快照新鲜，只欠裁决文档） |
| Ghidra 12.2 升级（JDK 25 换绑） | 缺口未动 | 需用户裁决后执行（涉 wrapper 变更） |
| hexstrike T1/T2 13:51 二次 gave_up（cc-switch 间歇超时；13:53 已恢复 200） | 待重入队 | consecutive_failures=2 熔断，blocked 不再自动重试；复活命令+时间线已留 t_2bee444f 卡 comment，由非围栏上下文（TUI/gateway 侧）执行；T3 t_58855791 在 todo 随依赖自动 promote |
| REAP 上游高频更新无自动同步 | 已知（10-26 登记） | 低优先；本日实测内容零漂移，机制面无增量 |
| CyberStrikeAI 10-23 新提交（durable async runs）未入调研基线 | 随 T2 复活覆盖 | T2 卡源码深读时 HEAD 即最新 |

## 四、验证记录（本日复跑口径）

```bash
rea --version                          # → 6.8.0 ✅
node --version                         # → v24.22.1（满足 REA 6.8 前提）✅
npm view rea-agents version            # → 6.8.0（上游）✅
grep "v20.0" ~/.hermes/skills/devops/security-tool-landscape-tracking/SKILL.md  # → 命中 ✅
sqlite3 swarm.db "SELECT status FROM tasks WHERE id IN ('t_632cbd94','t_20ad092c')"  # → ready/ready ✅
md5 REAP README local vs raw.githubusercontent 远程  # → a5790090… 一致 ✅
git -C DeepInfer rev-list --count HEAD..origin/main  # → 0 ✅
```
