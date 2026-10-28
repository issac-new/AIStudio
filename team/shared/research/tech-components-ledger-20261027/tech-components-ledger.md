# 技术组件台账（终态单文件）

> 唯一事实源。既往全部组件型调研线 × 上游版本差异 × 判级 × 处置，一表统管。
> 建立日 2026-10-28，由三件分卷（主索引/动作验收卷/历史差异卷）整合而成（原件归档本目录 `archive/`）。
> 上游状态实测锚：2026-10-27 全量批量（gh api/npm/PyPI，见 §六）+ 2026-10-28 🔴 面复测。
> 口径：只收组件型调研线（有版本轴的 repo/CLI/框架）；方法论类（微信文/论文）不入本表，落地状态归设计文档附录 B。
> 刷新程序权威源 = skill `tech-component-ledger-refresh-orch`（本文件即其产物契约所指的终态台账）。

## 一、维护契约

1. **季度重跑**（随单元对账）：全组件面重扫 + 上游实测 + 判级刷新 + 退役线复活检查。
2. **点名触发**：用户说「组件台账/更新到最新版」→ 增量重查 🔴🟡 两档 + RETIRED 线各查一次 pushed_at。
3. **退役线（用户裁决 2026-10-27）**：上游 `pushed_at` 距基准日 >90 天 → 保留历史轨迹、标 RETIRED、不再跟进。退役 ≠ 删除（报告/裁决矩阵/落地物原位保留，只停上游增量跟进）。临线（75-89 天）标「观察至 +90 天」；在跑卡未收口的临线组件，卡收口后退役。复活条款：重跑时 RETIRED 线仍查 pushed_at，复活（90 天内又有 push）按新增量重判级回观察名单。
4. 判级口径：🔴 基线后大增量（>20 commits 或跨 minor）；🟡 中等增量；🟢 零/微增量/死水/已完结。🔴🟡 判级即派卡依据，放行前交用户裁决。

## 二、判级汇总（2026-10-28 复测后）

- 🔴 **6 条 delta 全部完成（2026-10-28）**：semantica（196c）、OpenExecutive（113c）、mattpocock/skills（v1.3.1+49c）、x402（273c 全量，spec 核心零推进/SDK 层演进+STANDARDS-MATRIX 4 处刷新）、Autopt（43c 两段式架构演进，G9 fixture 复跑全绿 70 passed）、Cybermes（162c MCP-first 转向，原结论 6 过期/3 成立/1 勘误）。
- 🟡 **8 条**：DSH next 通道（rc.2→rc.4）、better-harness（0.6.4→0.7.0-alpha2）、pi-harness、AgentENV（v0.2.4）、A2A（v1.0.1）+ delta 后降档 3 条（x402/Autopt/Cybermes，差异已盘点完毕进入吸收决策期）。
- 🟢 **18 条**：其余全部——RETIRED 4 条（AP2/ACP/openclaw-sec/HexStrikeAI）+ laya 决策退役线 + 完结线（ARL-Next/REAP/OpenSecurity/RedEvoAgent/LongHorizon/HarnessEval-W/Dream-RSI 系/Graph-Engineering/commerce-agents/FIBO/os-taxonomy/ATT&CK 已落地/DeepInfer/deepseek-recipe/Sonic）。
- 🔴 delta 产物落位：外置盘 research/{semantica,openexec,agent-skills,autopt,cybermes,x402}-delta-20261028/ 各一份报告（卡 t_5bf395b3/t_fb51a770/t_21d69a77/t_767b724d/t_17bc9db5/t_b0c916bb 全 done）。
- **必吸收项已全部落地（13:38 收口，卡 t_87adf8cb/t_f304f7b4 done）**：semantica-runtime 两条 0.7.0 地雷规避+锚点刷新；prompt-injection-guard 反 padding 三关+八分类；skill-fleet-consistency-audit 第五层 unattended 分类；security-domain-delegation v1.4.0 两节（scope-as-code 四字段+out-of-scope 优先+max_requests 熔断 / sanitizeSlug 防穿越红线）；pay-orchestrator STANDARDS-MATRIX 4 处刷新（auth-capture 第四 scheme/§42 upfront 已实现/§43 SDK spendControls 纵深/双周 SOP rev-list>50 触发器）。agent-skills/Autopt 无必吸收项（结论性收口）。
- 修正记录：x402 原汇总误归 🟡，10-28 复测 ≥100c 封顶升 🔴；Cybermes commits 面波动（since 10-19=0）但 tags v3.5.0 在顶且当日 push，按版本轴维持 🔴。
- 管线终态（10-28）：hexstrike T1/T2/T3 全 done（T3 四落地物=skill evidence-governed-execution v1.0.0+pentest-methodology-fusion v2.0.0+4 hack profile 接线+skill-catalog 登记）；🔴 delta 六卡全 done。

## 三、分域总表

### 3.1 hack/安全域（10 条）

| 组件 | 基线（上次调研） | 上游现况（实测） | 判级/差异 | 处置与去向 |
|------|------------------|------------------|-----------|------------|
| REA MCP（rea-agents） | 6.4.0（10-12 部署，170 工具） | **6.8.0**（npm 10-25） | 🟢 已升级到位 | ✅ 10-27 升级+冒烟通过（能力差异见 §4.1） |
| Ghidra | 12.1.4（10-14 部署） | **12.2**（10-22 发布） | 🟡 待换绑 | 缺口登记：需 JDK 25（已确认在位）+ wrapper JAVA_HOME 换绑，未静默动（见 §4.2） |
| HexStrikeAI (0x4m4) | v6.0 源码深读立项（10-22） | 末 push 2026-08-03，13116★ | 🟢 上游停滞 | **RETIRED 2026-10-28**（T1/T2 卡已收口 done，静默 85 天；T3 融合卡 t_58855791 ready 照常跑完，融合属内部工作不受退役影响） |
| CyberStrikeAI (AIPentest) | 调研立项（10-22） | v1.7.24（10-16）+ 10-23 durable async runs 提交 | 🟡 release 密集 | T2 卡 t_20ad092c 在跑，源码深读按最新 HEAD（自动覆盖 10-23 增量） |
| Autopt (shiyeshu) | 06c834e（08-18，fixture 已落地 G9） | 43c 两段式架构演进（10-28 delta 实测） | 🟡 delta 已完成 | G9 fixture 复跑全绿 70 passed（独立仿真与上游解耦）；fixture 的 Deputy 硬否决模型与上游有界谏言语义有差异，见 delta §5 |
| Cybermes (Zyrexnn) | v2.0.0（融合分析在案） | v3.5.0=main（162c，10-27 push 仅 tag 元数据） | 🟡 delta 已完成 | **MCP-first 转向**（Go 原生 MCP server，Hermes 降为 12 客户端之一）；原结论 6 过期/3 成立/1 勘误；hack 域必吸收=Scope Guard scope-as-code+sanitizeSlug |
| ARL-Next (owl234) | 已落地本机（wih_engine.py 移植） | 持续维护线 | 🟢 | 无动作 |
| REAP (JoasASantos) | 10-26 快照融合（skill v1.2.0） | README+Skills md5 零漂移（10-27 实测）；星 2462→2817 仅热度 | 🟢 | 无动作 |
| OpenSecurity (zylc369) | 2.0 源码分析+蓝军报告（10-17） | tag 2.0 不变，10-19 有 push | 🟢 | 无动作 |
| RedEvoAgent | arXiv v2（10-23 融合，llm-redteam v1.7.0） | arXiv 仍 v1/v2，无 v3 | 🟢 已完结 | 融合产物 v1.7.0 在位，无增量 |

### 3.2 Harness/Agent 运行时域（9 条）

| 组件 | 基线 | 上游现况 | 判级/差异 | 处置 |
|------|------|----------|-----------|------|
| semantica (semantica-agi) | v0.7.0 / 2a9afec（09-23 源码分析） | 10-27 仍 push，≥100c 封顶 | 🔴 大增量；本机有 semantica-runtime 常驻技能 | **最优先增量卡**（运行时组件，过期风险实存） |
| OpenExecutive (SenteLabsAI) | main@30319d9（10-18 delta） | v0.6.6，10-27 仍 push，≥100c 封顶（0.6.1→0.6.6 五版本） | 🔴 高活跃，10-18 报告版本表已过期 | 优先增量卡 |
| mattpocock/skills | 2026-08-24 main@6654f6b（09-02 融合轮） | **v1.3.1**（10-04 tag）+ 未发版 49c（main@59db609，10-27） | 🔴 增量已盘点（delta 报告 10-28） | ✅ delta 完成：implement-spec/pr/retro 新三件、GLOSSARY 改名、devops-rd 旧产物已迁不受影响；**市集三件套依赖的是 dsh plugin-market 线，与此线无关**（原「依赖此线」表述系混记，勘误 #6） |
| addyosmani/agent-skills | 0.6.13（10-18 delta） | tag 顶仍 0.6.13，10-13 后零 push（404 澄清：mattpocock/agent-skills 不存在） | 🟢 静默 15 天 | 观察线（未到退役线） |
| DSH (@deepseek-ai/dsh) | v0.2.1-rc.2（10-18 delta） | latest=0.2.1-rc.2，next=**0.2.1-rc.4** | 🟡 next 通道 2 个 rc 未盘点（npm 面已装 0.17.0 是 dsh-tui 线） | 轻跟 next 通道 |
| better-harness (QoderAI) | 0.6.4 深读（10 月初） | v0.7.0-alpha2（09-12）+ 10-20 push | 🟡 跨 minor | 轻跟 |
| pi-harness (earendil/badlogic pi-mono) | 源码级深读（快照非 pin） | pi-agent 0.9.0 / pi-ai 0.73.1 持续发版 | 🟡 无在役依赖 | 按需跟 |
| LongHorizon-Harness (lh-harness) | v0.1.7 / a1dd9306（10-18） | PyPI 0.1.8（08-20） | 🟢 仅 1 patch | 无动作 |
| HarnessEval-W (MirroS-Lab) | 深读+蓝军复核 | 末 push 09-07（静默 51 天，未到线） | 🟢 | 无动作 |
| Startlux-Decision (laya 线) | v1.1 模型+影子评测（10-17/19） | laya v0.4.15 | 🟢 **已裁决退役**（slux 关停，决策线非静默原因），仅留评测判例 | 无动作 |

### 3.3 Agent 编排/多智能体域（4 条，survey 型引用）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| AgentENV (kvcache-ai) | 架构综述 | v0.2.4（10-23），10-27 仍 push | 🟡 论文型，无本机依赖 | 观察线，不派卡 |
| Dream-RSI / ModularRSI / Qwen-Planner / MobileWorld | 微信文+论文机制调研（10-23 证据矩阵） | Dream-RSI / MobileWorld 10-23 仍 push | 🟢 机制结论不随小版本失效 | 无动作 |
| Graph-Engineering 综述 (DEEP-JLU) | a2de779（09-08 融合） | 10-06 push（awesome 清单型） | 🟢 | 无动作 |
| commerce-agents (anthropics) | 09-04 源码分析 | 09-05 后实测 0 commits | 🟢 零增量 | 无动作 |

### 3.4 支付协议域（4 条，aipay 系列 08-25）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| x402 (x402-foundation) | aipay 报告（08-25） | 273c 全量（10-28 delta），spec 核心零推进/SDK 层演进 | 🟡 delta 已完成 | STANDARDS-MATRIX 4 处刷新（含 auth-capture 第四 scheme 漏盘实缺口）；pay 域网关按需跟 |
| A2A (a2aproject) | 同上 | v1.0.1，10-21 push | 🟡 tag 冻结 1.0，小幅增量 | pay 域按需 |
| AP2 (google-agentic-commerce) | 同上 | v0.2.0，06-17 后静默（132 天） | 🟢 **RETIRED 2026-10-28** | 调研档案保留，停上游跟进 |
| ACP (agentic-commerce-protocol) | 同上 | 07-18 后静默（101 天） | 🟢 **RETIRED 2026-10-28** | 同上 |

### 3.5 知识工程/本体域（3 条）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| FIBO (edmcouncil) | fibo-01..03 系列深读 | 10-26 push（Q3/Q4 例行 release） | 🟢 标准本体稳定 | 无动作 |
| openagentontology (CWNApps) | v0.2.0 复刻报告（p1-2a） | 08-07 后静默（81 天） | 🟢 **临线观察至 2026-11-05**，届时仍静默即 RETIRED | 定日复查 |
| os-taxonomy | v1.0.0（本地快照型） | — | 🟢 | 无动作 |

### 3.6 工具链域（5 条，本机部署组件）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| ATT&CK（方法论坐标系） | v19.2（2026-08） | **v20.0** | 🟢 已落地 | ✅ 10-27 技能刷 v20.0（差异见 §4.3） |
| DeepInfer | 5537415（10-25 快照） | origin/main=5537415（0 落后） | 🟢 快照新鲜 | **欠账：调研未收口**（目录无 VERDICT，见 §5） |
| deepseek-recipe | 935817c（10-20 快照） | origin/main=935817c（0 落后） | 🟢 快照新鲜 | 同上 |
| openclaw-sec-skills (Batman0506) | 概念引用 | 06-25 后静默（124 天） | 🟢 **RETIRED 2026-10-28** | 档案保留 |
| Sonic Harness（蛙池） | 机制分析 S1-S12（10-22） | 无公开 repo（闭源产品） | 🟢 机制层已吸收 | 完结 |

## 四、已部署组件能力差异明细

### 4.1 REA 6.4.0 → 6.8.0（跨 6.5/6.6/6.7）

新能力：① Agent Environments（6.8 主打）——从网络捕获/浏览器场景/一句 prompt 构建本地 agent 环境，`environment-serve` 流式 HTTP 服务+证据门控写，逆向回放重验基建；② 新格式面——GPU 代码对象（CUDA/HIP）、Erlang BEAM、Python pyc、Unity IL2CPP（v24/27）、Godot PCK、PyInstaller、Node SEA、devicetree、DOL、PE Authenticode/TLS callbacks、ELF notes、内核模块元数据；③ 原生调查增强——跨 build 函数匹配、伪代码导出、objdump 按符号选段、库存分页；④ 恢复控制——各面 deadline 可调、MCP 启动预算、regex worker heap 上限；⑤ `--format jsonl` 行式导出。

breaking changes（已核对本机面）：`analyze_function` 默认 retained summary（完整档案需 `detail:"complete"`）；MCP input schema 默认 compact（完整版需 `REA_MCP_INPUT_SCHEMA_PROFILE=full`）；Node 前提 ^22.23.4/^24.22.1/>=26.12.1（本机 v24.22.1 ✅）；Browser storage 新旧捕获不能互比。

本机验证（10-27）：`rea --version`=6.8.0；`environment-serve`/`inspect-erlang-beam`/`inspect-gpu-code-objects`/`inspect-il2cpp-metadata` --help 在位；4 profile mcp_servers.rea.enabled=true，wrapper 引用不变。

### 4.2 Ghidra 12.1.4 → 12.2（待用户裁决）

发布 10-22，项目数据全兼容。硬前提 JDK 25（本机 jdk-25.jdk 已在位，仅 wrapper JAVA_HOME=temurin-21 未换绑）。Server/BSim TLS 强制化（单机分析面不受影响）。升级动作 = 下载 12.2 + wrapper 换绑 jdk-25 + `rea doctor` 复验；REA 6.8 CHANGELOG 未见 Ghidra 12.2 门槛条目，兼容性以 REA 上游支持矩阵为准。

### 4.3 ATT&CK v19.2 → v20.0

战术面 15 持平。技术 697→706，+9/−0 全 AI 类：Direct Prompt Injection、Indirect Prompt Injection、AI Result Poisoning、AI-Enabled Exfiltration、Impair Autonomous Defenses、Anti-Automation Evasion、Avoid CAPTCHA、Automate CAPTCHA Completion、Steal Application Specific Passwords。落点：`~/.hermes/skills/devops/security-tool-landscape-tracking/SKILL.md` 已刷，llm-redteam 坐标系从此引 v20.0。

## 五、欠账与缺口登记

| 项 | 状态 | 去向 |
|----|------|------|
| DeepInfer / deepseek-recipe 调研未收口（无 VERDICT） | 欠账 | 两仓 0 落后、快照新鲜，只欠裁决文档；按需派卡 |
| Ghidra 12.2 升级（JDK 25 换绑） | 缺口未动 | 需用户裁决后执行（涉 wrapper 变更） |
| REAP 上游高频更新无自动同步 | 已知（10-26 登记） | 低优先；内容零漂移，机制面无增量 |
| openagentontology 临线 | 观察中 | 2026-11-05 复查 pushed_at |
| HexStrikeAI 退役触发 | ✅ 已执行 | T1/T2 done（10-28），本表已改 RETIRED；T3 融合卡照常收口 |

## 六、验证锚（重跑可复现）

```bash
# 2026-10-27 全量批量：gh api repos/<o>/<r> --jq '{pushed_at,stargazers_count}' + tags（/tmp/upstream_batch2.sh 口径）
# 2026-10-28 🔴 面复测（本表 §二 修正依据）：
gh api "repos/SenteLabsAI/OpenExecutive/commits?since=2026-10-19T00:00:00Z&per_page=100" --jq length   # 100 封顶
gh api "repos/semantica-agi/semantica/commits?since=2026-09-24T00:00:00Z&per_page=100" --jq length     # 100 封顶
gh api "repos/x402-foundation/x402/commits?since=2026-08-26T00:00:00Z&per_page=100" --jq length        # 100 封顶
gh api "repos/shiyeshu/Autopt/commits?since=2026-08-19T00:00:00Z&per_page=100" --jq length             # 43
gh api repos/Zyrexnn/Cybermes/tags --jq '.[0].name'                                                    # v3.5.0
gh api repos/mattpocock/skills/tags --jq '.[0].name'                                                   # v1.3.1
# 版本轴补充：npm view @deepseek-ai/dsh dist-tags；curl pypi.org/pypi/lh-harness/json
# 本机面：rea --version=6.8.0；node v24.22.1；grep v20.0 security-tool-landscape-tracking/SKILL.md
```

## 七、整合勘误（2026-10-28）

1. 剔除幽灵条目：原主索引列「AutoPT (Dizzy-K) 148 天 RETIRED」——30 线台账查无此线（唯一 Autopt 是 shiyeshu，🔴 活跃），判定为索引笔误，已删。
2. x402 判级修正：原 v2 §七汇总误归 🟡，行内实为 🔴；10-28 复测 ≥100c 封顶，定 🔴。🔴 5→6 条、🟡 6→5 条。
3. 行数口径：本表分域行级机械计数 35 条（10+9+4+4+3+5，REAP/HexStrike/CyberStrike 不重复计），此前「30 条」为分卷近似口径，以本表为准。
5. 补漏（2026-10-28 用户质询后机械对账发现）：整合时漏落 OpenSecurity(zylc369) 与 RedEvoAgent 两行，已补回 §3.1——两线均 🟢 完结，无处置变化。
6. 混记勘误（2026-10-28 delta 报告发现）：原「agent-skills (mattpocock/skills) 0.6.13→v1.3.1」系两条不同线混记——0.6.13 属 addyosmani/agent-skills（tag 顶未动、10-13 后零 push），v1.3.1 属 mattpocock/skills（基线应为 2026-08-24 融合轮）。已拆两行；「市集三件套依赖此线」表述撤销（三件套上游=dsh plugin-market）。
7. 封顶修正：semantica 基线后增量 196c（delta 报告 compare API 全量实测），此前台账「≥100c 封顶」为 API 封顶近似；OpenExecutive 实测 113c。判级结论不变。
4. 银翼评测系（v1 表 #11）为方法论类无版本轴，按口径移出组件表，落地状态归设计文档附录 B。

## 八、变更日志

- 2026-10-28 13:38 必吸收项全部落地（两张吸收卡 done+机械验收 5 组全过）；台账任务全链完结。
- 2026-10-28 🔴 六条 delta 全部收口（最后三卡 t_767b724d/t_17bc9db5/t_b0c916bb 13:04 done）；x402/Autopt/Cybermes 按 delta 实测降档 🟡；T3 融合 done。
- 2026-10-28 类级 bug 修复记录：review 通道强制注入 sdlc-review 技能预载，但该技能已被归档治理收进 .archive/ → review 态卡派给任意 profile 必死循环（ValueError kanban_skills_unavailable）。已从归档恢复到中央库 devops 类别。教训：技能归档前应 grep kanban 源码硬依赖技能名。
- 2026-10-28 HexStrikeAI 正式 RETIRED（T1/T2 收口触发；T3 融合卡不受影响照常跑）。
- 2026-10-28 整合为终态单文件；执行 3 个月退役裁决（RETIRED 4 静默线 + laya 决策线 + artex 已归档线；HexStrikeAI 等卡收口；openagentontology 临线观察）；🔴 面六仓复测并修正判级。三件分卷原件归档 `archive/`。
- 2026-10-27 v1（动作验收）+ v2（历史 30 线差异）落盘，上游状态全量当日实测；REA 升 6.8.0、ATT&CK 刷 v20.0、rea-agents 冒烟通过。留痕卡 t_2bee444f。
