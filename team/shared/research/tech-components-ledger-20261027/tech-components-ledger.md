# 技术组件台账（终态单文件）

> 唯一事实源（范围见 §一.5）。既往全部组件型调研线 × 上游版本差异 × 判级 × 处置，一表统管。
> 建立日 2026-10-28，由三件分卷（主索引/动作验收卷/历史差异卷）整合而成（原件归档本目录 `archive/`）。
> 上游状态实测锚：2026-10-27 全量批量 + 2026-10-28 🔴 面复测 + 2026-10-31 点名刷新 + 2026-11-13 点名刷新（gh api/npm/PyPI，见 §六）。
> 口径：只收组件型调研线（有版本轴的 repo/CLI/框架）；方法论类（微信文/论文）不入本表，落地状态归设计文档附录 B。
> 刷新程序权威源 = skill `tech-component-ledger-refresh-orch`（本文件即其产物契约所指的终态台账）。

## 一、维护契约

1. **季度重跑**（随单元对账）：全组件面重扫 + 上游实测 + 判级刷新 + 退役线复活检查。
2. **点名触发**：用户说「组件台账/更新到最新版」→ 增量重查 🔴🟡 两档 + RETIRED 线各查一次 pushed_at。
3. **退役线（用户裁决 2026-10-27）**：上游 `pushed_at` 距基准日 >90 天 → 保留历史轨迹、标 RETIRED、不再跟进。退役 ≠ 删除（报告/裁决矩阵/落地物原位保留，只停上游增量跟进）。临线（75-89 天）标「观察至 +90 天」；在跑卡未收口的临线组件，卡收口后退役。复活条款：重跑时 RETIRED 线仍查 pushed_at，复活（90 天内又有 push）按新增量重判级回观察名单。
4. 判级口径：🔴 基线后大增量（>20 commits 或跨 minor）；🟡 中等增量；🟢 零/微增量/死水/已完结。🔴🟡 判级即派卡依据，放行前交用户裁决。
5. **范围与三账分工（2026-10-31 补）**：本表是「组件型调研线」的唯一事实源，不是全仓所有版本定义的唯一来源。三棵 vendor 树（hermes-studio/hermes-agent/zcode）的钉版、升级流程与活跃补丁数以 `vendor/VENDOR.md` 为准，本表不重复登记版本行；技能域清单与运行时对账归 `skills/swarm-yuan/references/capability-map.md`；`docs/upstream-analysis/component-ledger.md` 已于 2026-10-28 降级为历史档案，不再新增行（2026-10-30 的 HelixHarness 行已迁入本表 §3.2）。方法论类（论文/微信文）不入本表，落地状态归设计文档附录 B。
6. **集成分支入 compare 基线（2026-11-13 立规，源=Cybermes「零漂移」误判教训）**：上游以集成分支（dev/next/release 类）开发、main 只在发布时移动的仓，compare 判漂移必须把集成分支纳入基线（`compare/<tag>...<集成分支>` 或 pushed_at 查集成分支头）；只对 main compare 会把发布间隔误读为「零漂移」。点名刷新时对本表活跃线顺查默认分支是否=集成分支形态。

## 二、判级汇总（2026-10-31 点名刷新后）

- **基线三树（版本轴归 VENDOR.md）**：hermes-studio 已发 v0.8.0（2026-10-30，`f67b587b9`，基线后 58c，跨 minor；补丁 329 目标路径被上游移走，属硬冲突）；hermes-agent 仍 v0.22.5（main 领先 3087c，无新稳定 tag）；zcode 上游 main 到 v3.17.1 线（`a60ba6a7`，单提交 5231 文件，包版本 3.16.2→3.17.1，按「跟 main」政策待升级轮）。
- 🔴 **3 条**：semantica（v0.7.0 未发版，217c）、OpenExecutive（v0.6.8，基线 30319d9 后 124c；v0.6.6→v0.6.8 又 28c）、mattpocock/skills（v1.3.2，v1.3.1 后 51c）。
- 🟡 **10 条**：Ghidra（12.2 待 JDK 25 换绑）、CyberStrikeAI（release 密集，T2 卡在跑）、Autopt（43c，delta 已完成）、Cybermes（v3.5.0，10-31 复测代码零漂移，吸收决策期）、DSH（latest=next=0.2.1-rc.5，alpha=0.2.2-alpha.2）、better-harness（v0.7.0-alpha2，基线后 67c）、pi-harness（v1.4.0，248c）、AgentENV（v0.2.4，21c，论文型不派卡）、x402（2026-08-26 首提交后 295c）、A2A（稳定 1.0.1，tag 面已出 v1.1.0-rc，v1.0.1 后 92c）。
- 🟢 **28 条**：其余全部 + HelixHarness（2026-10-29 开源 1.0.0，五项机制已吸收）。含 RETIRED 5 条（AP2/ACP/openclaw-sec/HexStrikeAI/sia）+ laya 决策退役线（Startlux-Decision）+ 完结线（ARL-Next/REAP/OpenSecurity/RedEvoAgent/LongHorizon/HarnessEval-W/Dream-RSI 系/Graph-Engineering/commerce-agents/FIBO/os-taxonomy/ATT&CK 已落地/DeepInfer/deepseek-recipe/Sonic）。
- 🔴 delta 产物落位：外置盘 research/{semantica,openexec,agent-skills,autopt,cybermes,x402}-delta-20261028/ 各一份报告（卡 t_5bf395b3/t_fb51a770/t_21d69a77/t_767b724d/t_17bc9db5/t_b0c916bb 全 done）。
- **必吸收项已全部落地（2026-10-28 13:38 收口，卡 t_87adf8cb/t_f304f7b4 done）**：semantica-runtime 两条 0.7.0 地雷规避+锚点刷新；prompt-injection-guard 反 padding 三关+八分类；skill-fleet-consistency-audit 第五层 unattended 分类；security-domain-delegation v1.4.0 两节（scope-as-code 四字段+out-of-scope 优先+max_requests 熔断 / sanitizeSlug 防穿越红线）；pay-orchestrator STANDARDS-MATRIX 4 处刷新（auth-capture 第四 scheme/§42 upfront 已实现/§43 SDK spendControls 纵深/双周 SOP rev-list>50 触发器）。agent-skills/Autopt 无必吸收项（结论性收口）。
- 修正记录：x402 原汇总误归 🟡，10-28 复测 ≥100c 封顶升 🔴；Cybermes commits 面波动（since 10-19=0）但 tags v3.5.0 在顶且当日 push，按版本轴维持 🔴；10-31 复测代码零漂移，转 🟡 吸收决策期。
- 管线终态（10-28）：hexstrike T1/T2/T3 全 done（T3 四落地物=skill evidence-governed-execution v1.0.0+pentest-methodology-fusion v2.0.0+4 hack profile 接线+skill-catalog 登记）；🔴 delta 六卡全 done。
- **2026-11-07 全量核对批注（46 条当日实测，spec `2026-11-07-vendor-upgrade-studio-v0817`）**：持平 26／有更新 16／无版本轴 3／未能核对 1（Graph-Engineering 仓 404）。要点：Ghidra 转 🟢（wrapper 实测已绑 12.2+JDK25，§4.2 旧记录订正）；DSH 本机已升 0.2.2-rc.1＋dsh-tui 0.19.0（上游 next=0.2.2-rc.1/alpha=0.2.2-alpha.3）；有更新待盘点=OpenExecutive v0.6.9、AgentENV v0.2.5、ARL-Next v1.4.5、pi-harness v1.5.0、addyosmani/agent-skills 0.6.15（打破 10-13 静默）、REAP 11-05 新 push、ATT&CK v20.1（技能面仍引 v20.0，数据更新挂账）、semantica main 245c 仍未发版（钉 v0.7.0 口径不变）、HelixHarness +4c、harness2 +18c、x402 main ≈1497c（Link 分页口径，增量异常宜 compare 复核）；openagentontology 过 11-05 定日线且 11-07 仍零 push（92 天）→ 按 §一.3 应转 RETIRED（待执行）；运行时基线三树=studio v0.8.17（本批升级）／agent v0.23.0／zcode 3.17.2@a9fe401e 持平；REAGent 6.8.0=npm latest 持平；仓名勘误=hexstrike-ai（0x4m4）、REA-Prompts（JoasASantos）。
- **2026-11-09 点名刷新批注（§一.2 触发，32 点位当日实测=点名 26＋补测 6，spec `2026-11-09-runtime-deps-refresh`）**：🔴 3 条全维持——semantica（v0.7.0...main **252c**、11-09 当日仍 push）、OpenExecutive（已发 **v0.7.0 跨 minor**（11-07 17:42），30319d9...main 210c，10-18/10-31 两轮 delta 版本表过期，重跑 delta 待用户裁决）、mattpocock（v1.3.2 后仅 3c，「v1.3.2 增量待补」欠账关闭）。**判级建议升 🔴 2 条（交用户裁决）**：better-harness（v0.6.4...main 359c，10-31 记 67c 的口径端点建议派卡前复核）、pi-harness（tag 顶 v1.5.0 跨 minor，v1.4.0...main 634c）。🟡 维持 6 条（CyberStrikeAI v1.7.24 release 面持平／Autopt 43c 持平静默 17 天／Cybermes v3.5.0 identical／AgentENV v0.2.5 论文型／x402 343c／A2A rc 未推进）。**x402 挂账证伪关闭**：11-07 的「≈1497c」系 Link 分页口径异常，compare 复核真实 343c（since 10-31 +48c）。**openagentontology RETIRED 复核通过**：11-09 实测 pushed_at=2026-08-07 静默 **94 天**>90、v0.2.0...main 7c 未动，无复活，11-07 判定执行定谳，定日复查线关闭。**Graph-Engineering 正名锚定 `DEEP-JLU/Awesome-Graph-Engineering`**（description 与综述线吻合、399★、10-30 仍收 PR；基线 sha a2de779 对该仓 compare 404 疑历史重写，增量不猜数留待下轮；10-31「仓 404 未定名」欠账可销）。仓名正名勘误：ACP=agentic-commerce-protocol/agentic-commerce-protocol、HexStrikeAI=0x4m4/hexstrike-ai（小写）、Startlux-Decision=StartLuxLabs/StartLux-Decision（slux npm 已 Unpublished 佐证关停）。补测 🟢 线（点名面外、用户质询后补齐）：lh-harness PyPI 0.1.8 持平／rea-agents npm 6.8.0 持平／FIBO 10-27 后零 push 持平／element-web 稳定 v1.12.33 持平（tag 面出 v1.12.34-rc.1 记档）／deepseek-recipe 快照 0 落后持平／**DeepInfer +1c 漂移**（5537415→a679bb86，11-03 push，快照型微增量记档不追）。ATT&CK v20.1 挂账维持（无 v20.2；技能面主引用句 v20.0 属文档句刷新欠账）。运行时基线三树=**studio v0.8.20（本批升级，上游三 tag 连发 10 提交）**／agent v0.23.0（canary 流不追）／zcode a9fe401e（main 同点）。
- **2026-11-09 裁决执行批注（同日晚，用户令「完成未做」，spec `2026-11-09-ledger-judgment-followup`）**：①better-harness/pi-harness 判级正式升 🔴（§3.2 两行随批改判，均观察线无本机依赖不派吸收卡）；②OpenExecutive v0.7.0 delta 重跑收口（报告落外置盘 `research/openexec-delta-20261109/`——五主题/五面同构/结论性，§3.2 行基线进 v0.7.0）；③ATT&CK 技能面 v20.0 指引句刷新为 v20.1（security-tool-landscape-tracking SKILL.md 主体段，11-07 挂账清偿）。
- **2026-11-13 点名刷新批注（§一.2 触发，用户裁决「全做＋三 delta 重跑」，spec `2026-11-13-tech-ledger-refresh-vendor-upgrade`）**：基线三树=**studio v0.8.21 本批升级**（11-11 发，3c/72f：BOT 协作历史统一聊天卡片＋STT 空 transcript 修复）／agent v0.23.1 持平（main +5475c canary 不追）／**zcode v3.18.2 本批同步**（main 两 sync 提交 `fec97590`，148f：memory-diagnostics/credential-security/voice-input）。🔴 5 条全维持：semantica 252→**255c**（11-09 后仅 3 个安全修复，趋缓）、OpenExecutive v0.7.0→**v0.7.3**（4 天 3 版，delta 重跑收口=同构推进无必吸收，基线进 v0.7.3）、mattpocock v1.3.2...main 1→**5c**（implement-spec 每票子代理/chief-of-staff wiki/software-factory 术语；镜像跟 tag 纪律不动，等 v1.3.3+）、better-harness 359→**361c**、pi-harness tag 顶 **v1.5.2**。🟡 面：**Cybermes 复活重判**——「identical 零漂移」系只对 main compare 的观测假象（集成分支 dev 11-13 一次性合入 71c＋tag v3.5.1），delta 重跑收口=Scope Guard fail-open/sanitizeSlug 两条已吸收红线各一次真实加固，**必吸收 3 项已随批落 security-domain-delegation v1.5.0**，判级回 🟡（对齐完成）；CyberStrikeAI v1.7.24→**v1.8.0**（11-13 跨 minor，delta 重跑收口=引擎级重构：Eino 全删换「Go 守治理+Node worker 托管 Pi SDK 1.5.2」双进程＋漏洞复测工作台；基线治理机制零触碰存活，两件机制吸收候选挂可选；**T2 源码深读卡已过期**标记挂行）；Autopt 43c 持平静默 21 天、AgentENV v0.2.5 持平（11-13 仍 push）、x402 11-01 后 87c 活跃、A2A v1.0.1+rc 持平。**addyosmani/agent-skills 打破静默**（10-14 后 ≥100c，11-01 push review findings 验证主题）→ 🟢 复活观察。**RETIRED 5 线复核全无复活**（AP2 150/ACP 118/openclaw-sec 141/HexStrikeAI 102/openagentontology 98 天）。**rea-agents 6.9.0**（11-12 发；本机实测已 6.9.0，台账 6.8.0 行滞后订正；能力差异见 §4.4）。DSH latest 0.2.2-rc.1 持平（next 通道进 rc.3 不追）。
- **2026-11-13 裁决执行批注（同日深夜，用户令「完成未做」，spec `2026-11-13-ledger-judgment-followup`）**：①zcode v3.18.2 逐项裁定收口（13 主题 148 文件全随基线直放、必需 overlay 动作 **0**、Windows 离线包通道零影响、i18n zh-CN +17 行中文受益——报告 `research/zcode-3182-delta-assessment-20261113/`）；②CyberStrikeAI T2 深读重开收口（v1.8.0 基线，必吸收 3 项落 evidence-governed-execution v1.1.0，上表行同批更新）；③可选 7 项触发条件逐项复核——OpenExec B1 定谳**不吸收**（本仓 `vendor/hermes-agent/agent/runaway_guard.py` 三维度检测 exact_action_repeat/exact_result_repeat/polling_repeat 精确覆盖且超出 #752 启发式）、Cybermes B4 前批已完成、其余 5 项触发未满足维持挂起（复核证据逐项入 spec 附录 A）。
- **2026-11-23 点名刷新批注（§一.2 触发，用户令「更新台账到最新版并完成兼容升级」，spec `2026-11-23-tech-ledger-latest-compat`）**：基线三树=**studio v0.8.30 本批升级**（8a51d1bcf，16c/117f，5 补丁适配 510/510 重放零失败幂等二连）／agent v0.23.3 持平（最新稳定，canary 不追）／**zcode 3.18.2 @fec97590 持平**（公开 main 与 Release 均停 3.18.2；本机安装版 3.19.1 为另账快照事实——catalog-check 7869 键一致，公开源码未发布不冒充基线；宿主 RPC 复制面同批同步 fec97590，旧 pin 872ad96 清偿）。本机常驻实测：**rea-agents 6.10.1**（npm latest 11-20 发，`rea --version`＋`npm ls -g` 双通道一致，已对齐；6.9→6.10 能力差异盘点挂下轮）、**DSH 0.2.2-rc.5**（=latest/next 已对齐；alpha 0.2.3-alpha.2 不追）、Ghidra 12.2 持平。🔴 4 条原线维持：semantica **276c**（v0.7.0 未发版）、OpenExecutive **v0.7.7**（11-18 发；v0.7.3...main 144c、30319d9...main 414c；org 改名 SenteLabsAI→ForeactLabs 重定向；delta 重跑待裁决）、better-harness 361c、pi-harness **v1.6.0 跨 minor**（11-20 发；v1.5.0...main 809c）。mattpocock 5→9c 降 🟡。**判级建议升 🔴 9 条（交用户裁决，本批只记档不派卡）**：addyosmani 0.6.13→**0.6.17**（11-18 发；基线后 164c，复活成势）、SkillOpt v0.2.0...main **429c**、Sage v2.2.0...main 48c（11 月以来 135c）、ARL-Next **v1.5.1 跨 minor**（11-21 发；v1.4.3 锚后 90c，本机移植件需复核）、OpenSecurity 2.0...main **200c**（本轮补测精确 compare 暴露，此前轮未跑）、os-taxonomy **214c**（**勘误：非本地快照，公开仓 withmarbleapp/os-taxonomy**，本地技能 manifest 字节哈希锚 fc060c4）、DeepInfer 集成分支 **nv-dev 29c**（main 仅 +1c；§一.6 集成分支立规面）、element-web **develop 282c**（stable v1.12.35，参考线）、CyberStrikeAI v1.8.0→**v1.8.1**（11-19 发；已发版增量 24c，v1.8.1=main 头零漂移——同 Cybermes 对齐锚口径，升档与否交裁决）。🟡 面：Cybermes v3.5.1 后 2c 微增（对齐完成）、Autopt 43c 静默 31 天、AgentENV v0.2.5 持平＋v0.3.0-rc.1 RC 不追、x402 npm 2.32.0/PyPI 2.29.0（11-20；11-22 delta 报告头 e35bf88 后零新增）、A2A rc 后 1c、HelixHarness ad6c1bff...main 16c（feature 线恰 20c 未破阈）、harness2 18c、lh-harness 基线进 0.1.8（tag 后 11c；原始锚 25c 备案）、MobileWorld 6c、Graph-Engineering main 09-09 后 15c（a2de779 compare 404 增量未知不猜数）。**RETIRED 复活 1 条**：openagentontology 11-17 push 1c（纯文档 CLAUDE.md，距今 6 天）→ 退出 RETIRED 回 🟢 复活观察；其余 RETIRED 6 线复核零复活（AP2 159/ACP 128/openclaw-sec 151/HexStrikeAI 112 天；Startlux 决策退役；laya 线）。临线观察：HarnessEval-W 静默 77 天（观察至 12-06）、sia 静默 89 天（观察至 11-24，届时零 push 即转 RETIRED）。ATT&CK v20.1 仍最新（技能面已引 v20.1，§3.6 行同批订正）。
- **2026-11-23 ZCode 4.0.0 同步批注（用户令「Zcode 已升级至 4.0，同步完成 AIStudio 的相关升级」，spec `2026-11-23-zcode-400-upgrade-release`）**：基线三树＝studio v0.8.30 持平／agent v0.23.3 持平／**zcode 4.0.0 @a4b44451 本批升级**（上游 main、tag v4.0.0、缓存树 HEAD 三者同一提交；本机安装版 4.0.0，源码基线与安装版自本批起合一，上一批「安装版 3.19.1 另账快照」的口径作废；catalog-check 7870 键／110 命名空间，相对 3.19.1 新增 1 键）。补丁面 11 条零退役（004/006/009/011 随新基线重做，其余原样应用）；宿主 RPC 复制面同步 a4b44451（10 文件闭包仅 proxy-channel.ts 有差量）。CLI `--version` 读的是 CLI 工作区版本 0.18.0（旧基线 0.17.1），与仓根 4.0.0 分属两套版本号。未做：3.19.x 与 4.0 的新特性对本仓的功能级逐项对照（挂账）。

## 三、分域总表

### 3.1 hack/安全域（10 条）

| 组件 | 基线（上次调研） | 上游现况（实测） | 判级/差异 | 处置与去向 |
|------|------------------|------------------|-----------|------------|
| REA MCP（rea-agents） | 6.10.1（11-23 本机对齐） | 6.10.1（npm 11-20 发；`rea --version`＋`npm ls -g` 双通道一致） | 🟢 已升级到位 | 11-23 实测本机已 6.10.1=latest；**6.9→6.10 能力差异已盘点（§4.5，同日 N33-2 清偿）**——Evidence rev2 无本仓持久化资产不适用、Ghidra 12.2+JDK25 前提已满足（repo main 领先 npm tag 2500c 属 monorepo 常态，不判级） |
| Ghidra | 12.2（wrapper 实测已绑 `ghidra_12.2_PUBLIC`+JDK25，2026-11-07 订正） | 12.2 持平（releases/latest 仍 Ghidra_12.2_build；master 676c 为常态开发流，不按 repo commits 判级） | 🟢 已换绑 | 旧记录（12.1.4+temurin-21 待换绑）系台账滞后，§4.2 已订正 |
| HexStrikeAI (0x4m4) | v6.0 源码深读立项（10-22） | 末 push 2026-08-03（11-23 复核静默 112 天，无复活） | 🟢 上游停滞 | RETIRED 2026-10-28（用户显式裁决豁免 85 天线；T1/T2 卡已收口，T3 融合卡 t_58855791 照常跑完） |
| CyberStrikeAI (AIPentest) | v1.8.1（11-23 点名刷新） | **v1.8.1**（11-19 发）；v1.8.0...v1.8.1=24c；v1.8.1=main 头零漂移 | 🟡 release 密集；**升 🔴 候选交裁决**（已发版增量 24c>20，口径同 Cybermes 对齐锚） | 11-23 点名：24c 增量未读；delta 重跑与否交用户裁决。11-13 两报告（delta＋T2 深读）结论仍有效：引擎架构级更换存活、必吸收 3 项已落 evidence-governed-execution v1.1.0 |
| Autopt (shiyeshu) | 06c834e（08-18，fixture 已落地 G9） | 43c 持平（11-23 复核零新 push，静默 31 天） | 🟡 delta 已完成 | G9 fixture 复跑全绿 70 passed（独立仿真与上游解耦）；fixture 的 Deputy 硬否决模型与上游有界谏言语义有差异，见 delta §5 |
| Cybermes (Zyrexnn) | v3.5.1（11-13 delta 收口） | v3.5.1 后 main/dev 各 2c（纯文档，11-23 实测；末 push 11-16） | 🟢 对齐后微增 | §一.6 立规后观测口径健康；无动作 |
| ARL-Next (owl234) | 已落地本机（wih_engine.py 移植） | **v1.5.1**（11-21 发，跨 minor）；v1.4.3...main 90c、v1.5.1...main 1c | 🟡→**🔴 候选交裁决**（跨 minor＋锚后 90c） | 本机移植件 wih_engine.py 需对 v1.5 线复核；派卡与否交用户裁决 |
| REAP (JoasASantos) | 10-26 快照融合（skill v1.2.0） | main 10-27 后 2c 微增（11-23 实测） | 🟢 | 无动作 |
| OpenSecurity (zylc369) | 2.0 源码分析+蓝军报告（10-17） | tag 2.0 不变；2.0...main **200c**（11-23 首次精确 compare，末 push 11-13） | 🟢→**🔴 候选交裁决**（200c>20，此前轮未跑 compare 未暴露） | delta 派卡与否交用户裁决 |
| RedEvoAgent | arXiv v2（10-23 融合，llm-redteam v1.7.0） | arXiv 仍 v1/v2 无 v3；配套仓 main 零 push（11-23 复核） | 🟢 已完结 | 融合产物 v1.7.0 在位，无增量 |

### 3.2 Harness/Agent 运行时域（15 条）

| 组件 | 基线 | 上游现况 | 判级/差异 | 处置 |
|------|------|----------|-----------|------|
| semantica (semantica-agi) | v0.7.0 / 2a9afec（09-23 源码分析） | v0.7.0 未发版，main **276c**（11-23 实测） | 🔴 大增量；本机有 semantica-runtime 常驻技能 | 最优先增量卡（运行时组件，过期风险实存）；10-28 delta 已收口，增量趋缓观察 |
| OpenExecutive (ForeactLabs，旧名 SenteLabsAI 重定向) | v0.7.3（11-13 delta 收口） | **v0.7.7**（11-18 发）；v0.7.3...main 144c，30319d9...main **414c**，v0.7.7...main 24c | 🔴 高活跃（节奏未衰减） | 11-13 delta 结论覆盖至 v0.7.3；v0.7.4~7 增量 delta 重跑待用户裁决；可选 3 项触发条件与不吸收面不变 |
| mattpocock/skills | v1.3.2（R143 镜像刷新基线） | v1.3.2 仍 tag 顶；v1.3.2...main **9c**（11-23 实测；changeset-release 线 10c） | 🟡 微增（无新 tag，11-23 自 🔴 降档） | **镜像跟 tag 纪律**——物化基线=v1.3.2 不动，等 v1.3.3+ 整刷 |
| addyosmani/agent-skills | 0.6.13（10-18 delta） | **0.6.17**（11-18 发）；0.6.13...main **164c** | 🟢→**🔴 候选交裁决**（复活成势，四版连发） | review findings 验证主题与本仓独立审查节点同构；delta 派卡与否交用户裁决 |
| DSH (@deepseek-ai/dsh) | 0.2.2-rc.5（11-23 本机对齐） | latest=next=**0.2.2-rc.5**；alpha=0.2.3-alpha.2（不追） | 🟢 已对齐 latest | 11-23 实测 `dsh --version`=0.2.2-rc.5 与 npm dist-tags 一致；正确仓=deepseek-ai/deepseek-harness（repo-wide compare 不作 CLI 判级口径） |
| better-harness (QoderAI) | 0.6.4 深读（10 月初） | v0.7.0-alpha2 仍 tag 顶；v0.6.4...main **361c**（11-23 复核持平） | 🔴 大增量（11-09 用户裁决升档） | 观察线（无本机依赖，不派吸收卡） |
| pi-harness (earendil-works/pi) | v1.5.0（R143 登记） | tag 顶 **v1.6.0**（11-20 发，跨 minor）；v1.5.0...main **809c** | 🔴 跨 minor＋大增量（11-09 用户裁决升档） | 无在役依赖，按需跟；runtimes.tsv source 行下轮随 R144+ 刷新 |
| LongHorizon-Harness (lh-harness) | v0.1.8（PyPI 11-23 基线进位） | PyPI 0.1.8 持平；v0.1.8...main 11c（原始锚 a1dd9306...main 25c 备案） | 🟡 tag 后微增 | 无动作 |
| HarnessEval-W (MirroS-Lab) | 深读+蓝军复核 | 末 push 09-07（11-23 静默 77 天，临线） | 🟢 观察至 2026-12-06 | 到线零 push 即按 §一.3 转 RETIRED |
| Startlux-Decision (laya 线) | v1.1 模型+影子评测（10-17/19） | laya v0.4.15；主仓 v1.1.0 后 3c（决策退役不改判） | 🟢 已裁决退役（slux 关停，决策线非静默原因），仅留评测判例 | 无动作 |
| HelixHarness (didi) | 2026-10-29 开源 1.0.0（单提交 ad6c1bff） | ad6c1bff...main 16c；feature 线 20c 恰未破阈（11-23 实测，末 push 11-21） | 🟡 微增 | 五项机制已吸收（spec 内容收据、四层上下文读取计量、F2P/P2P 校准合同、隐藏断言与澄清冻结、命令式验收）；见 `2026-10-30-helixharness-absorption.md` |
| google-research/harness2 | 2026-10-31 首次调研（v0 免论文 2610.14224） | 基线 1cfe254 后 18c（11-23 实测） | 🟡 微增 | Propose–Probe–Compose＋八面组件＝本仓改进台同源上游；其同任务行为对比编排记入 R2 参考（报告 §三） |
| microsoft/SkillOpt | 2026-10-31 首次调研（v0.2.0，论文 2605.23904） | v0.2.0...main **429c**（11-23 实测） | 🟢→**🔴 候选交裁决** | 技能文档=可训练状态＋验证集严格门＋夜间 Sleep 演化；文本学习率对应本仓编辑预算；增量卡派否交用户 |
| hexo-ai/sia | 2026-10-31 首次调研 | v0.6.0 后 1c；末 push 08-26（11-25 复核静默 90 天，零新 push） | 🟢 RETIRED（11-25 复核未复活） | 调研档案保留，停上游跟进 |
| ZHangZHengEric/Sage | 2026-10-31 首次调研 | tag 顶 **v2.2.0**（11-13 发）；v2.2.0...main 48c、11 月以来 135c | 🟢→**🔴 候选交裁决** | 「产出候选不激活」人审采纳＋声明式安全面＝与本仓定位最接近的安全门参照；增量卡派否交用户 |

### 3.3 Agent 编排/多智能体域（4 条，survey 型引用）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| AgentENV (kvcache-ai) | 架构综述 | v0.2.5 稳定持平（11-06 发）；开发线 v0.3.0-rc.1 分支 118c（RC 不追） | 🟡 论文型，无本机依赖 | 观察线，不派卡 |
| Dream-RSI / ModularRSI / Qwen-Planner / MobileWorld | 微信文+论文机制调研（10-23 证据矩阵） | Dream-RSI/ModularRSI/Qwen-Planner（Tongyi-MAI/Qwen-Planner-Agent）零新增；MobileWorld 6c（11-23 实测） | 🟢 机制结论不随小版本失效（MobileWorld 微增记档） | 无动作 |
| Graph-Engineering 综述 (DEEP-JLU) | a2de779（09-08 融合） | 仓名已锚定 `DEEP-JLU/Awesome-Graph-Engineering`；a2de779...main compare 仍 404（疑历史重写），main 09-09 后 15c 活跃（11-23 实测） | 🟡 活跃微增（原始增量未知不猜数） | 精确增量留待下轮重锚基线 |
| commerce-agents (anthropics) | 09-04 源码分析 | main 09-05 后 0 commits（11-16 pushed_at 系 dependabot 非 main） | 🟢 零增量 | 无动作 |

### 3.4 支付协议域（4 条，aipay 系列 08-25）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| x402 (x402-foundation) | e35bf884（11-22 delta 报告头） | npm @x402/core **2.32.0**/PyPI 2.29.0/Go v2.32.0（11-20 tag）；报告头后 main **0c**（11-23 实测；报告头前窗口 31c 已由 11-22 delta 收口） | 🟡 delta 已完成 | STANDARDS-MATRIX 4 处刷新（含 auth-capture 第四 scheme 漏盘实缺口）；pay 域网关按需跟 |
| A2A (a2aproject) | 同上 | 稳定 v1.0.1；v1.1.0-rc→dev-1.1 仅 1c（11-23 实测）；v1.0.1 累计 99c（机械套阈值会红——既有台账按稳定/RC 口径判黄，口径冲突留用户裁决） | 🟡 1.1 进 rc，稳定版仍 1.0.1 | pay 域按需；rc 破坏面未读，不提前升级 |
| AP2 (google-agentic-commerce) | 同上 | v0.2.0，末 push 06-17（11-23 静默 159 天） | 🟢 RETIRED（11-23 复核未复活） | 调研档案保留，停上游跟进 |
| ACP (agentic-commerce-protocol) | 同上 | 末 push 07-18（11-23 静默 128 天） | 🟢 RETIRED（11-23 复核未复活） | 同上 |

### 3.5 知识工程/本体域（3 条）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| FIBO (edmcouncil) | fibo-01..03 系列深读 | master_2026Q3...master 3c（11-23 实测） | 🟢 标准本体稳定 | 无动作 |
| openagentontology (CWNApps) | v0.2.0 复刻报告（p1-2a） | **复活（11-23 实测）**：11-17 push 1c（纯文档 CLAUDE.md，距今 6 天）；v0.2.0...main 8c | 🟢 退出 RETIRED 回复活观察 | 复活条款触发回观察名单；后续增量按新增量重判级 |
| os-taxonomy | fc060c4（本地技能 manifest 字节哈希锚定，11-23 正名） | 公开仓 **withmarbleapp/os-taxonomy**（v1.0.0 后 Unreleased 连发）；fc060c4...main **214c**（本体/课标/教学研究/player 大增量） | 🟢→**🔴 候选交裁决**（**勘误：非本地快照无公开源——本地技能明确指向该公开仓**） | 增量调研卡派否交用户裁决；k12edu 技能数据面随裁决复核 |

### 3.6 工具链域（5 条，本机部署组件）

| 组件 | 基线 | 上游现况 | 判级 | 处置 |
|------|------|----------|------|------|
| ATT&CK（方法论坐标系） | v20.1（11-09 技能面已刷） | v20.1 仍最新（无 v20.2；11-23 复核） | 🟢 已落地 | 技能面已引 v20.1（差异见 §4.3） |
| DeepInfer | 5537415（10-25 快照） | main +1c；**集成分支 nv-dev 29c**（SM120/Cake MoE/NCCL 主题，11-23 实测；§一.6 立规面） | 🟢→**🔴 候选交裁决**（nv-dev 29c>20） | 欠账：调研未收口（目录无 VERDICT，见 §5；路径 `~/.hermes/shared/research/20261026-deepseek-infer-recipe/`）；nv-dev 增量卡派否交用户裁决 |
| deepseek-recipe | 935817c（10-20 快照） | origin/main=935817c（identical，11-23 复核） | 🟢 快照新鲜 | 同上 |
| openclaw-sec-skills (Batman0506) | 概念引用 | 末 push 06-25（11-23 静默 151 天） | 🟢 RETIRED（11-23 复核未复活） | 档案保留 |
| Sonic Harness（蛙池） | 机制分析 S1-S12（10-22） | 无公开 repo（闭源产品） | 🟢 机制层已吸收 | 完结 |

## 四、已部署组件能力差异明细

### 4.1 REA 6.4.0 → 6.8.0（跨 6.5/6.6/6.7）

新能力：① Agent Environments（6.8 主打）——从网络捕获/浏览器场景/一句 prompt 构建本地 agent 环境，`environment-serve` 流式 HTTP 服务+证据门控写，逆向回放重验基建；② 新格式面——GPU 代码对象（CUDA/HIP）、Erlang BEAM、Python pyc、Unity IL2CPP（v24/27）、Godot PCK、PyInstaller、Node SEA、devicetree、DOL、PE Authenticode/TLS callbacks、ELF notes、内核模块元数据；③ 原生调查增强——跨 build 函数匹配、伪代码导出、objdump 按符号选段、库存分页；④ 恢复控制——各面 deadline 可调、MCP 启动预算、regex worker heap 上限；⑤ `--format jsonl` 行式导出。

breaking changes（已核对本机面）：`analyze_function` 默认 retained summary（完整档案需 `detail:"complete"`）；MCP input schema 默认 compact（完整版需 `REA_MCP_INPUT_SCHEMA_PROFILE=full`）；Node 前提 ^22.23.4/^24.22.1/>=26.12.1（本机 v24.22.1 ✅）；Browser storage 新旧捕获不能互比。

本机验证（10-27）：`rea --version`=6.8.0；`environment-serve`/`inspect-erlang-beam`/`inspect-gpu-code-objects`/`inspect-il2cpp-metadata` --help 在位；4 profile mcp_servers.rea.enabled=true，wrapper 引用不变。10-31 复测 npm `rea-agents` 仍 6.8.0。

### 4.2 Ghidra 12.1.4 → 12.2（已完成换绑，2026-11-07 台账订正）

发布 10-22，项目数据全兼容。硬前提 JDK 25（本机 jdk-25.jdk 已在位，仅 wrapper JAVA_HOME=temurin-21 未换绑）。Server/BSim TLS 强制化（单机分析面不受影响）。升级动作 = 下载 12.2 + wrapper 换绑 jdk-25 + `rea doctor` 复验；REA 6.8 CHANGELOG 未见 Ghidra 12.2 门槛条目，兼容性以 REA 上游支持矩阵为准。10-31 复核：本机 wrapper 仍指 `ghidra_12.1.4_PUBLIC` + `temurin-21`，未动。**2026-11-07 实测订正：`~/lab/tools/rea-mcp-wrapper.sh` 已 `GHIDRA_INSTALL_DIR=ghidra_12.2_PUBLIC` + `JAVA_HOME=jdk-25.jdk`，与 12.2 最新 release revision 8ca9077 一致，本节缺口关闭。**

### 4.3 ATT&CK v19.2 → v20.0

战术面 15 持平。技术 697→706，+9/−0 全 AI 类：Direct Prompt Injection、Indirect Prompt Injection、AI Result Poisoning、AI-Enabled Exfiltration、Impair Autonomous Defenses、Anti-Automation Evasion、Avoid CAPTCHA、Automate CAPTCHA Completion、Steal Application Specific Passwords。落点：`team/skills/devops/security-tool-landscape-tracking/SKILL.md` 已刷，llm-redteam 坐标系从此引 v20.0。

### 4.4 REA 6.8.0 → 6.9.0（2026-11-12 发布，本机已 6.9.0）

发布主题（官方 release notes，tag `rea-agents-6.9.0`，日期 2026-11-11）：

1. **桌面任务/环境大版**：build computer（可复用构建机）内捕获/导出/见证桌面任务；SHA-256 钉版 AppImage/上游归档安装桌面应用；一捕获多任务；seed/end 检查点选择＋seed 文档启动打开；ReFS 卷支持（与 NTFS 同保 ACL/文件身份/快照/清理检查）。
2. **新格式面**：.NET 单文件/Bun standalone/Deno compile 可执行的盘点与提取；UnityFS/Godot 3 PCK/微信小程序包/Zstandard ZIP 成员/经典 iNES；Intel HEX/Motorola S-record/U-Boot uImage/FIT/ESP flash/UF2/DfuSe 固件区段（保留容器声明）；NTFS MFT 记录＋USN journal 离线盘点；V8 code-cache 头与字节模式（不执行缓存，报 Electron cachedData 边界）；OpenAPI 操作/GraphQL SDL 离线清单＋与 HAR 观察比对；Windows Shell Link；Python 3.14/3.15 pyc 头识别。
3. **调查增强**：Playwright v10 trace Evidence 导入＋离线验证浏览器场景；R8 mappings 应用＋Android manifest 组件声明＋JNI 静态候选＋外部 DEX 调用者追踪；ELF/PE/Mach-O 加固报告＋Mach-O 分片加密＋unwind 表恢复函数区间；Linux core-dump 进程/映射 notes＋内核版本配置；LLDB 源坐标；Ghidra 项目经验证副本复用＋跨会话 checkpoint；Kuna/目录反编译独立重试。
4. **Evidence/分页/预算**：保留观察全面分页（native/引用/feature 追踪/批量反编译摘要）；Evidence 记录按需读取＋缺失链发现；资源预算失败可操作化（CLI/MCP 全域）＋每调用限额从操作快照读取。
5. **CLI/MCP 面**：guided workflows＋已装指南搜索；MCP 工具族选择＋compact 输出 schema；插件安装（Claude Code/Codex 自包含＋Cursor Marketplace＋CodeBuddy/LM Studio/Cline 注册）；Windows P0 DOS MZ＋RISC-V ilp32 admission。

本机核验（11-13）：`rea --version`=6.9.0、`npm ls -g rea-agents`=6.9.0（双通道一致；台账旧记 6.8.0 系滞后）。wrapper（`~/lab/tools/rea-mcp-wrapper.sh`）GHIDRA 12.2＋JDK25 绑定不变。6.8→6.9 无 breaking 前提变化（Node 前提同 6.8 口径）。

### 4.5 REA 6.9.0 → 6.10.1（2026-11-20 发布，N33-2 盘点）

发布主题（官方 release notes，tag `rea-agents-6.10.0/6.10.1`）：

1. **UEFI 三件离线工具**：firmware volumes/files/AMI NVRAM 的盘点与提取（`extract-uefi-firmware` 等 CLI＋MCP 面）。
2. **新格式面**：Android boot images/OTA payloads、NES 2.0 容器、Maven POM/Gradle module-metadata/NuGet .nupkg 元数据（`inspect-maven-gradle-metadata`/`inspect-nuget-nupkg`）。
3. **Evidence revision 2（大 breaking）**：file/process/debugger/browser 观测显式 subject 身份体系——`evidence_format: 2` 必填；`subject.identity` 取代 `subject.digest/format/architecture`（文件身份用 sha256）；Identity 参与 Evidence IDs → **旧观测/捆绑/快照必须用 6.10 重建**（重导出不更新身份），跨版本 `compare_artifacts` 前须重建 6.7-era artifact summaries；process captures 须 `manifest.root_process`；Rizin/GDB 会话身份 `{kind:"session",...}`；Ghidra/Hopper profiles 改 `analysis_profile.parameters.producer`；浏览器/PCAP/Android/native 各面 schema 收紧（Recreate 长尾清单见原 notes）。
4. **Ghidra 12.2 lane 扩展**：DOS COM（线性 `0x100` load_address）＋RISC-V/MIPS32/PowerPC64 ELF 目标；前提=受支持 12.x build（≥12.2）＋该 build 声明范围 JDK（验证版 12.2=JDK≥25）。
5. **IDA attached 注册收紧**：须显式 `"protocol":"native"`＋native 插件端点；legacy 1.4 proxy 注册须迁移。
6. 6.10.1 patch：kuna serial job count 常量修复（#12735）。

本机核验（2026-11-23）：`rea --version`=6.10.1；新面 --help 实测在位（extract-uefi-firmware/inspect-maven-gradle-metadata/inspect-nuget-nupkg/inspect-android-* 族）；wrapper `GHIDRA 12.2＋JDK25` 绑定不变且恰好满足 6.10 的 Ghidra 前提（无需动作）。

**对本仓影响判定**：本仓对 REA 为实时调用型消费、无持久化 Evidence 资产——Evidence rev2 的「重建义务」不适用；Node 前提未见变化（沿用 6.8 口径 v24.22.1 ✓）。无迁移动作。

## 五、欠账与缺口登记

| 项 | 状态 | 去向 |
|----|------|------|
| hermes-studio 0.7.39 → v0.8.0 升级 | ✅ 已完成（2026-10-31 升级批） | spec `2026-10-31-studio-v080-upgrade.md`：pristine 换血＋44 失败件重生成（150/517 退役归档、266/197/528/623 迁位）＋esp32→mcu 品牌迁移；全量重放零失败 |
| zcode 上游 main v3.17.1 线同步 | ✅ 已完成（2026-10-31 同步批） | spec `2026-10-31-zcode-3171-sync.md`：pristine 换血＋8 补丁全重放（002/006 重生成）；引擎构建绿 |
| DeepInfer / deepseek-recipe 调研未收口（无 VERDICT） | 欠账 | 两仓 0 落后、快照新鲜，只欠裁决文档；目录 `~/.hermes/shared/research/20261026-deepseek-infer-recipe/`；按需派卡 |
| Ghidra 12.2 升级（JDK 25 换绑） | ✅ 已完成（2026-11-07 实测订正） | wrapper 已绑 12.2+jdk-25（此前某轮已完成，台账 10-31 记录滞后）；12.2=上游最新 |
| REAP 上游高频更新无自动同步 | 已知（10-26 登记） | 低优先；11-07 实测 11-05 有新 push（快照后漂移待比对），机制面无增量 |
| openagentontology 临线 | ✅ RETIRED 已执行（2026-11-07）；**2026-11-23 复活回观察**（11-17 push 1c 纯文档触发复活条款，§3.5 行同批改 🟢） | §3.5 行同批转复活观察；ATT&CK v20.1 企业域 STIX-diff 零差量（15/706 全同）同批入 security-tool-landscape-tracking 技能注记 |
| HexStrikeAI 退役触发 | 已执行（2026-10-28） | T1/T2 done，本表已改 RETIRED；T3 融合卡照常收口；用户显式裁决豁免 85 天线（§一.3 的 90 天规则在个案上由用户裁决） |
| 组件台账计数无自动化守门 | 新增（2026-10-31） | 本轮修复 36/35/6-8-18 三套口径矛盾后，仍无测试解析台账行数；建议下轮加一个机械核对（§三行数=§二合计=§七.3 总数） |

## 六、验证锚（重跑可复现）

```bash
# 2026-10-31 点名刷新（全部 gh api，认证 5000/hr；勿裸 curl api.github.com）
gh api repos/EKKOLearnAI/hermes-studio/releases/latest --jq '{tag_name,published_at}'      # v0.8.0 / 2026-10-30
gh api repos/EKKOLearnAI/hermes-studio/compare/8f215f59d...v0.8.0 --jq .ahead_by           # 58
gh api repos/NousResearch/hermes-agent/releases/latest --jq .tag_name                     # v0.22.5
gh api repos/NousResearch/hermes-agent/compare/v0.22.5...main --jq .ahead_by               # 3087
git -C upstream/zcode fetch --all --tags
git -C upstream/zcode rev-list --count 3c5b2276..origin/main                               # 1（单提交 5231 文件）
gh api repos/SenteLabsAI/OpenExecutive/releases/latest --jq .tag_name                      # v0.6.8
gh api repos/SenteLabsAI/OpenExecutive/compare/30319d9...v0.6.8 --jq .ahead_by              # 124
gh api repos/mattpocock/skills/tags --jq '.[0].name'                                       # v1.3.2
gh api repos/mattpocock/skills/compare/v1.3.1...v1.3.2 --jq .ahead_by                       # 51
gh api repos/semantica-agi/semantica/compare/v0.7.0...main --jq .ahead_by                    # 217
gh api repos/a2aproject/A2A/tags --jq '.[].name' | head -5                                 # v1.1.0-rc 在前，稳定 release 仍 v1.0.1
gh api repos/shiyeshu/Autopt/compare/06c834e...main --jq .ahead_by                          # 43
gh api repos/Zyrexnn/Cybermes/compare/v3.5.0...main --jq .identical                         # true
gh api repos/mattpocock/skills/compare/v1.3.2...main --jq .ahead_by                         # 1
npm view @deepseek-ai/dsh dist-tags --json                                                  # next=0.2.1-rc.5, alpha=0.2.2-alpha.2
curl -s https://pypi.org/pypi/lh-harness/json | jq -r '.info.version, .releases[.info.version][0].upload_time'  # 0.1.8 / 2026-10-21
# 本机面：rea --version=6.8.0；node v24.22.1；grep v20.0 team/skills/devops/security-tool-landscape-tracking/SKILL.md
# 基线版本：vendor/zcode/package.json=3.16.2；zcode-patches/series 8 条活跃（002-009）
```

```bash
# 2026-11-13 点名刷新（全部 gh api）
gh api repos/EKKOLearnAI/ekko-studio/releases/latest --jq '{tag_name,published_at}'     # v0.8.21 / 2026-11-11
gh api "repos/EKKOLearnAI/ekko-studio/compare/v0.8.20...v0.8.21" --jq '{ahead_by}'      # 3（72 files）
gh api repos/NousResearch/hermes-agent/releases/latest --jq '.tag_name'                 # v0.23.1（持平）
git -C upstream/zcode fetch origin && git -C upstream/zcode rev-parse --short origin/main  # fec97590（v3.18.2）
gh api repos/semantica-agi/semantica/compare/v0.7.0...main --jq '.ahead_by'              # 255
gh api repos/SenteLabsAI/OpenExecutive/releases/latest --jq '.tag_name'                  # v0.7.3
gh api repos/SenteLabsAI/OpenExecutive/compare/v0.7.0...v0.7.3 --jq '.ahead_by'          # 80
gh api repos/mattpocock/skills/compare/v1.3.2...main --jq '.ahead_by'                    # 5
gh api repos/Zyrexnn/Cybermes/compare/v3.5.0...main --jq '.ahead_by'                     # 71（含集成分支合入；只对 main 曾误判 identical，见 §一.6）
gh api repos/AIPentest/CyberStrikeAI/releases/latest --jq '{tag_name,published_at}'      # v1.8.0 / 2026-11-13
gh api "repos/AIPentest/CyberStrikeAI/compare/v1.7.24...v1.8.0" --jq '.ahead_by'         # 71
gh api repos/QoderAI/better-harness/compare/v0.6.4...main --jq '.ahead_by'               # 361
gh api repos/earendil-works/pi/tags --jq '.[0].name'                                     # v1.5.2
npm view rea-agents version                                                              # 6.9.0；本机 rea --version 同点
# 本机面：rea --version=6.9.0；vendor/hermes-studio/packages/desktop/package.json version=0.8.21（pristine）；vendor/zcode/package.json=3.18.2
```

```bash
# 2026-11-23 点名刷新（gh api/npm/本机三通道）
gh api repos/EKKOLearnAI/ekko-studio/releases/latest --jq '{tag_name,published_at}'   # v0.8.30 / 2026-11-21
gh api "repos/EKKOLearnAI/ekko-studio/compare/v0.8.28...v0.8.30" --jq '{ahead_by}'    # 16（117 files +3885/−574）
git -C upstream/zcode fetch origin && git -C upstream/zcode rev-parse --short origin/main   # fec97590（3.18.2，公开源码未发 3.19）
plutil -extract CFBundleShortVersionString raw /Applications/ZCode.app/Contents/Info.plist  # 3.19.1（安装版快照另账）
npm run catalog-check                                                                  # OK：3.19.1，7869 键 / 110 命名空间
gh api repos/semantica-agi/semantica/compare/v0.7.0...main --jq .ahead_by              # 276
gh api repos/ForeactLabs/OpenExecutive/releases/latest --jq .tag_name                  # v0.7.7（旧名 SenteLabsAI 重定向）
gh api repos/ForeactLabs/OpenExecutive/compare/v0.7.3...main --jq .ahead_by            # 144
gh api repos/mattpocock/skills/compare/v1.3.2...main --jq .ahead_by                    # 9（降 🟡）
gh api repos/addyosmani/agent-skills/releases/latest --jq .tag_name                    # 0.6.17（🔴 候选）
gh api repos/microsoft/SkillOpt/compare/v0.2.0...main --jq .ahead_by                   # 429（🔴 候选）
gh api repos/ZHangZHengEric/Sage/compare/v2.2.0...main --jq .ahead_by                  # 48（🔴 候选）
gh api repos/owl234/ARL-Next/compare/v1.4.3...main --jq .ahead_by                      # 90（v1.5.1 跨 minor，🔴 候选）
gh api repos/zylc369/OpenSecurity/compare/2.0...main --jq .ahead_by                    # 200（🔴 候选）
gh api repos/AIPentest/CyberStrikeAI/compare/v1.8.0...v1.8.1 --jq .ahead_by            # 24（升档候选交裁决）
gh api repos/Zyrexnn/Cybermes/compare/v1.5.1...dev --jq .ahead_by                      # 2（对齐后微增）
gh api repos/CWNApps/openagentontology --jq .pushed_at                                 # 2026-11-17（复活回观察）
gh api repos/withmarbleapp/os-taxonomy/compare/fc060c46aca8a8797bf23153a16e018100f6f901...main --jq .ahead_by  # 214（🔴 候选，公开仓正名）
gh api repos/deepseek-ai/DeepInfer/compare/553741557a57df44a46fb3ab72b6aafeaf945337...nv-dev --jq .ahead_by    # 29（集成分支立规面，🔴 候选）
npm view rea-agents version                                                            # 6.10.1；本机 rea --version 同点
npm view @deepseek-ai/dsh dist-tags --json                                             # latest=next=0.2.2-rc.5；本机 dsh --version 同点
# 本机面：vendor/hermes-studio/packages/desktop/package.json=0.8.30（pristine）；vendor/zcode/package.json=3.18.2；custom/server/zcode/vendor/rpc pin=@fec97590
```

```bash
# 2026-11-23 ZCode 4.0.0 同步批（上游缓存仓／本机两通道）
git -C upstream/zcode rev-parse --short origin/main                         # a4b44451
git -C upstream/zcode rev-parse --short v4.0.0^{commit}                     # a4b44451（main 与 tag 为同一提交）
git -C upstream/zcode rev-parse --short HEAD                                # a4b44451
plutil -extract CFBundleShortVersionString raw /Applications/ZCode.app/Contents/Info.plist  # 4.0.0（安装版；源码基线与之合一）
npm run catalog-check                                                       # OK：4.0.0，7870 键 / 110 命名空间，与快照一致
# 本机面：vendor/zcode/package.json=4.0.0；vendor/zcode/apps/zcode-cli/package.json=0.18.0（CLI --version）；custom/server/zcode/vendor/rpc pin=@a4b44451
```

## 七、整合勘误

1. 剔除幽灵条目：原主索引列「AutoPT (Dizzy-K) 148 天 RETIRED」——30 线台账查无此线（唯一 Autopt 是 shiyeshu，🔴 活跃），判定为索引笔误，已删。
2. x402 判级修正：原 v2 §七汇总误归 🟡，行内实为 🔴；10-28 复测 ≥100c 封顶，定 🔴。🔴 5→6 条、🟡 6→5 条。
3. 行数口径（2026-10-31 修正）：本表分域行级机械计数 **41 条**（10+15+4+4+3+5），其中 §3.2 由 9 改 11（原 9 是标题笔误，实际 10 行，加 HelixHarness 后 11）；§二判级合计 3🔴+10🟡+24🟢=37；此前「35 条」「36 条」「6/8/18」「3/10/23」口径作废。
5. 补漏（2026-10-28 用户质询后机械对账发现）：整合时漏落 OpenSecurity(zylc369) 与 RedEvoAgent 两行，已补回 §3.1——两线均 🟢 完结，无处置变化。
6. 混记勘误（2026-10-28 delta 报告发现）：原「agent-skills (mattpocock/skills) 0.6.13→v1.3.1」系两条不同线混记——0.6.13 属 addyosmani/agent-skills（tag 顶未动、10-13 后零 push），v1.3.1 属 mattpocock/skills（基线应为 2026-08-24 融合轮）。已拆两行；「市集三件套依赖此线」表述撤销（三件套上游=dsh plugin-market）。
7. 封顶修正：semantica 基线后增量 196c（delta 报告 compare API 全量实测），此前台账「≥100c 封顶」为 API 封顶近似；OpenExecutive 实测 113c。判级结论不变。2026-10-31 复测 semantica 217c、OpenExecutive 124c（以 compare API 为准）。
4. 银翼评测系（v1 表 #11）为方法论类无版本轴，按口径移出组件表，落地状态归设计文档附录 B。
8. **2026-10-31 上游仓改名**：hermes-studio 的 GitHub full_name 实为 `EKKOLearnAI/ekko-studio`（旧名 `hermes-studio` 是重定向别名）；`vendor/VENDOR.md` 的 remote 行需下次同步前更新。另：v1.0.x tag 是 Android 线（APK），不是桌面稳定线，不能拿它判「最新稳定」。
9. **2026-10-31 LongHorizon 日期勘误**：PyPI `lh-harness` 0.1.8 的 `upload_time` 实为 2026-10-21（原台账记 08-20），版本与判定不变。
10. **2026-10-31 A2A 版本勘误**：稳定 release 仍 v1.0.1，但 tag 面已出 `v1.1.0-rc`（2026-10-29）；台账按「稳定版」口径不升 🔴，只记 rc。
11. **2026-10-31 OpenExecutive / mattpocock 版本推进**：OpenExecutive 已发 v0.6.8（10-30），mattpocock/skills 已发 v1.3.2（10-29）；原 10-28 台账的 v0.6.6 / v1.3.1 已过期，delta 报告需按新 tag 重跑。
12. **2026-10-31 HelixHarness 迁移**：2026-10-30 吸收轮把 HelixHarness 行登记在旧账 `docs/upstream-analysis/component-ledger.md`，违反 2026-10-28「旧账冻结」指针；本轮迁入本表 §3.2，旧账该行删除，旧账恢复 10-28 冻结态。

## 八、变更日志

- 2026-11-26 全面复盘与发版批（spec `2026-11-26-full-retro-design-revision-batch.md`、`2026-11-26-release-v1.0.21-overlay.md`）：vendor 三基线持平（studio v0.8.30／agent v0.23.4／zcode 4.0.0 @a4b44451）；Ycode 补丁 11→14（013 生产依赖安全刷新、014 开发依赖安全刷新、015 独立服务端接入预装文档工具——合并期让号，全量重放后补选项类型声明）；补丁在册 518（patches 504＋zcode 14，v1.0.20 时为 510）；净基线全量重放 518/518 零失败；驾驶舱 0.8.30-studio.3、整体源码包 1.0.21-overlay。
- 2026-11-25 sia 转 RETIRED（挂账 N35-4 与 N33-4 的到点复核）：实测 pushed_at=2026-08-26T17:02:30Z、零新 push，静默 90 天达线；§3.2 该行改 RETIRED，判级汇总的 RETIRED 计数 4→5（🟢 总数 28 不变，退役线仍计在 🟢）；档案保留，停上游跟进。
- 2026-11-23 ZCode 4.0.0 同步发版批（spec `2026-11-23-zcode-400-upgrade-release.md`）：**zcode 基线 3.18.2 @fec97590→4.0.0 @a4b44451**（差量 2209 文件，含未发布源码的 3.19.x 全部变更；pristine 逐文件对账 19,354/19,355 相同，唯一差异为 gradlew.bat 换行符既有偏差；清掉 2 个混入基线的钩子留痕文件）；补丁 11 条零退役（004 接管哨兵分支／006 上下文重切／009 扩为两文件并配套上游新测试／011 补 live 入口回译语义；净基线 510/510 零失败幂等，四条变异探针配套用例必红）；宿主 RPC 复制面同步 a4b44451；词条快照 zcode-400；隔离真引擎会话导入→回读闭环通过；cockpit 0.8.30-studio.2／整体包 1.0.20-overlay。未做：3.19.x 与 4.0 的新特性对本仓的功能级逐项对照（挂账）。
- 2026-11-23 N33 清偿批（spec `2026-11-23-n33-closeout-batch.md`）：REA 6.9→6.10.1 差异盘点入账（§4.5，Evidence rev2 判定不适用本仓）；noop-inject 哨兵根治（仓内 scripts 面，台账 N33-1 闭环）。
- 2026-11-23 点名刷新批（§一.2 触发，用户令「更新台账到最新版并完成兼容升级」，spec `2026-11-23-tech-ledger-latest-compat.md`）：全表点名+RETIRED 复活检查实测；**vendor 单基线升级 studio v0.8.30**（5 补丁适配、clean+inject 510/510 零失败幂等二连）；agent v0.23.3/zcode 3.18.2 持平（zcode 安装版快照 3.19.1 另账，公开源码未发布）；**Ycode 宿主 RPC 复制面同步 fec97590**（retryable/profileId 透传、EventError 订阅结束语义；守门废除全文件豁免改确定性比较，RED→GREEN 实证）；rea-agents 6.10.1/DSH 0.2.2-rc.5 本机对齐 latest；判级升 🔴 候选 9 条记档交裁决（addyosmani/SkillOpt/Sage/ARL-Next/OpenSecurity/os-taxonomy 正名公开仓/DeepInfer nv-dev/element-web develop/CyberStrikeAI）；openagentontology 复活回观察；sia/HarnessEval-W 临线观察记档；ATT&CK v20.1 行订正。
- 2026-11-13 点名刷新批（§一.2 触发，用户裁决「全做＋三 delta 重跑」，spec `2026-11-13-tech-ledger-refresh-vendor-upgrade.md`）：点名面+RETIRED 线全实测；vendor 双基线随批升级（studio v0.8.21 补丁 042/768 重锚；zcode v3.18.2 补丁零重生成 10/10 直放）；rea-agents 6.9.0 本机核验已最新（§4.4 能力差异入账）；Cybermes 复活 delta 收口＋必吸收 3 项落 security-domain-delegation v1.5.0；OpenExecutive v0.7.3/CyberStrikeAI v1.8.0 delta 收口（均外置盘 research/*-delta-20261113/）；§一.6 集成分支入 compare 基线立规（Cybermes 零漂移误判教训）；addyosmani 复活观察记档。
- 2026-11-11 zcode 3.18.0 同步批：运行时基线三树 zcode 进位 a9fe401e→b95ebaff（v3.18.0，单 sync 提交 5099 文件；session-control/插件 extension host/worktree 隔离/登录 v2 随基线获得）；补丁 002/006 重生成＋新增 011（MCP inputSchema 参数名消毒＋调用回译，Qwen Code 1.0 逐项对照唯一确凿差距吸收项）。spec `2026-11-11-zcode-3180-sync-and-qwen-absorb.md`。
- 2026-11-09 裁决执行批（同日晚）：判级升档 better-harness/pi-harness 落表（用户令「完成未做」）；OpenExecutive v0.7.0 delta 收口（外置盘 openexec-delta-20261109/）；ATT- 2026-11-09 台账刷新批：点名刷新 32 点位CK v20.1 句刷新。spec `2026-11-09-ledger-judgment-followup.md`。
- 2026-11-09 台账刷新批：点名刷新 32 点位（26＋补测 6）；openagentontology RETIRED 复核通过（94 天定谳）；x402 1497c 异常证伪（343c）挂账关闭；Graph-Engineering 正名锚定；DeepInfer +1c 漂移记档；判级建议升 🔴 2 条（better-harness/pi-harness）与 OpenExecutive v0.7.0 delta 重跑待用户裁决。spec `2026-11-09-runtime-deps-refresh.md`。

- 2026-11-03 运行时台账刷新批：zcode 基线 → a9fe401e（v3.17.2，+1 提交/203 文件，8 补丁重放零失败零重生成，幂等二连验证过；upstream/zcode 缓存树同步治理）；exa-mcp-server 3.4.1→3.4.3（npm latest 实测）；semantica v0.7.0／pua e6e6cd2／hermes-agent v0.22.6／ekko-studio v1.0.9 上游核对均无更新。spec `2026-11-03-runtime-deps-refresh.md`。
- 2026-10-31 RSI 前沿轮：新增四条 harness 自改进框架线（harness2/SkillOpt/sia/Sage，首次在册 🟢），37→41 行；判级汇总 🟢 24→28。
- 2026-10-31 同步批：zcode 基线 → a60ba6a7（v3.17.1，8 补丁重放零失败，002/006 重生成，引擎构建绿）。
- 2026-10-31 升级批：hermes-studio 基线 → v0.8.0@f67b587b9（44 件重生成/2 退役/4 迁位，重放零失败，全量绿）。
- 2026-10-31 点名刷新：三棵 vendor 树 + 本机常驻 + 🔴🟡/RETIRED 线实测；修正 37 行计数口径、HelixHarness 双源、VENDOR 改名/版本/补丁数；登记 hermes-studio v0.8.0 与 zcode 3.17.1 两个升级欠账；DeepInfer 路径与 HexStrikeAI 裁免说明补齐。
- 2026-10-28 13:38 必吸收项全部落地（两张吸收卡 done+机械验收 5 组全过）；台账任务全链完结。
- 2026-10-28 🔴 六条 delta 全部收口（最后三卡 t_767b724d/t_17bc9db5/t_b0c916bb 13:04 done）；x402/Autopt/Cybermes 按 delta 实测降档 🟡；T3 融合 done。
- 2026-10-28 类级 bug 修复记录：review 通道强制注入 sdlc-review 技能预载，但该技能已被归档治理收进 .archive/ → review 态卡派给任意 profile 必死循环（ValueError kanban_skills_unavailable）。已从归档恢复到中央库 devops 类别。教训：技能归档前应 grep kanban 源码硬依赖技能名。
- 2026-10-28 HexStrikeAI 正式 RETIRED（T1/T2 收口触发；T3 融合卡不受影响照常跑）。
- 2026-10-28 整合为终态单文件；执行 3 个月退役裁决（RETIRED 4 静默线 + laya 决策线 + artex 已归档线；HexStrikeAI 等卡收口；openagentontology 临线观察）；🔴 面六仓复测并修正判级。三件分卷原件归档 `archive/`。
- 2026-10-27 v1（动作验收）+ v2（历史 30 线差异）落盘，上游状态全量当日实测；REA 升 6.8.0、ATT&CK 刷 v20.0、rea-agents 冒烟通过。留痕卡 t_2bee444f。
