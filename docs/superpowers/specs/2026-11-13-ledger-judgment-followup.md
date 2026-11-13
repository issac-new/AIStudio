# 2026-11-13 台账裁决执行批（用户令「完成未做」）

## 变更

清偿台账点名刷新批（spec `2026-11-13-tech-ledger-refresh-vendor-upgrade.md`）交付说明中的三项未做（2026-11-09 同名先例模式）：

1. **zcode v3.18.0→v3.18.2 能力差异逐项裁定**：148 文件 +5870/−692 按主题逐项裁定（随基线获得/overlay 无动作/不适用），裁定清单落 spec §附录 与台账 §二批注；补 zcode-patches 零失配的机制解释（补丁面与上游变化面不相交的验证）。
2. **CyberStrikeAI v1.8.0 T2 源码深读重开**：按新引擎形态（Eino 全删→「Go 守治理+Node worker 托管 Pi SDK 1.5.2」双进程＋漏洞复测工作台）重开源码深读，产出外置盘报告 `research/cyberstrikeai-deepread-v18-20261113/`，替换已过期的 10-22 基线深读（Eino 章作废）。
3. **可选吸收 7 项触发条件逐项复核**（OpenExecutive 3＋Cybermes 4，Cybermes B4 集成分支立规已即办不计）：逐项核对触发条件当前是否满足——满足者本批落地，未满足者维持挂起并在台账行内记复核结论与下次复核钩子。重点复核 OpenExec B1 循环防护启发式的触发条件（「simharness 出现循环失控案例」）——run14 G5 熔断 85 圈循环事故（2026-10-10）是否构成满足。

## 决策记录

1. **UserChallenge·执行令**：用户令「完成未做」——交付说明挂账项全数处置，非选择性执行。
2. **可选项处置口径**：「完成未做」不等于机械全做——可选项的设计即条件触发；执行=逐项复核触发条件，满足则做、不满足则记录复核证据维持挂起（避免为清账而造无验收面的死功能，仓规「触发条件明确才动」）。
3. zcode 裁定产出走 spec 附录而非新台账节（148 文件逐项清单属本批决策事实，台账只落结论行）。

## 验证

- 裁定清单逐项带锚（diff stat/文件路径/commit）。
- 深读报告验收五件齐（精确计数/主题聚类/基线过期结论/吸收建议三档/sha 锚）。
- 触发条件复核逐项带证据（仓内案例检索结果/接线现状）。
- 台账批注随批落盘；目标测试（docs-ssot-guard）绿。

## 设计文档影响

DESIGN_SYNC: none。纯台账/调研/裁定面，不触及整合正本与数字总账；zcode 基线内容已随前批入库，本批只补裁定叙事。

## 附录 A：可选吸收 7 项触发条件复核表（T3，2026-11-13 实测）

| # | 触发条件（delta 报告原文口径） | 复核证据 | 裁定 |
|---|---|---|---|
| OpenExec B1 循环防护启发式（#752 同 action 同 result 4 次即停＋15min 步上限） | simharness 出现循环失控案例 | run14 G5 85 圈事故（2026-10-10）构成历史满足；但本仓执行器层已有 `vendor/hermes-agent/agent/runaway_guard.py` 三维度检测（exact_action_repeat=同动作工具+参数指纹连续重复／exact_result_repeat=同结果指纹连续重复动作可不同／polling_repeat=同工具同目标结果不变，runaway_guard.py:8-12，2026-11-05 三死法批 cea63dd4e 落地）精确覆盖且粒度超出 #752 单一启发式；闸门层另有熔断证据签名并入 main tip（45b8d2f87/43df7b4ef）、判词锚钉（59dda6dee）、G5 重入消费（run27 批）多代根治 | **不吸收——机制已覆盖且更细**（吸收会造成同族双源） |
| OpenExec B2 审批放行参数化（#761 Waits/Goes 双轴＋#780 三次重复放行） | 审批疲劳实测信号 | custom/server/approval-inbox 与 callgate 全文 grep「疲劳/fatigue」零命中——疲劳信号采集面不存在，信号本身未产生 | 维持挂起（触发未满足） |
| OpenExec B3 盲区披露卡（#787） | RAG 问答面上线 | custom/server 无 rag/qa 产品面目录 | 维持挂起 |
| Cybermes B1 finding 文件名校验＋info 归 recon_notes | hack 域聚合第三方扫描报告或落 finding 记录 | 现行 findings 形态=kanban 卡 metadata 执行留痕验证（evidence-governed-execution SKILL.md:50），无文件系统 finding 聚合 | 维持挂起 |
| Cybermes B2 PATH 包装器自递归防护＋sqlmap 式 dispatcher | 吸收侧引入 tools/bin 式 PATH 包装器 | `tools/bin` 不存在（ls 零命中），无包装器分发面 | 维持挂起 |
| Cybermes B3 npx 强制 @latest＋24h 缓存节流 | §12 登记的 cybermes-mcp filter_stream 真接线 | security-domain-delegation §12 维持「登记不接线」 | 维持挂起 |
| Cybermes B4 delta 巡检纳入集成分支 | 立即 | 前批已落台账 §一.6 立规 | **已完成**（前批） |

## 附录 B：zcode v3.18.0→v3.18.2 逐项裁定（T1，报告全文 `research/zcode-3182-delta-assessment-20261113/`）

13 主题 148 文件逐项裁定结论（完整表见报告）：

| 主题 | 裁定 | 一句话依据 |
|---|---|---|
| memory-diagnostics（CLI 8 文件） | 随基线获得，仅记档 | 有界内存采样落盘，与执行内核审批账本不同域 |
| credential-security（shared 4 文件） | 随基线获得，仅记档 | Linux keyring 回退+数据根密钥共享；AIStudio 无自有凭据面 |
| Start 套餐国内登录修复 | 随基线获得 | 上游修复直收 |
| Windows 安装器整修（installer-process-helper cpp） | 不适用（记档） | 三脚本对 runtime-host/build.json grep 零命中，Windows 离线包通道不受影响；未来纳入安装器产物时需带 helper exe |
| 麦克风权限与语音输入 | 随基线获得 | 桌面能力面 |
| UI 修复杂项/macOS 字体平滑/Web 远控移动端/浏览器设计模式 | 随基线获得 | 上游产品面 |
| i18n×5 | 随基线获得（**中文体验受益**） | zh-CN +17 行（字体平滑 2+麦克风权限引导 11 正向改写） |
| e2e 基建/文档同步/版本台账 | 随基线获得 | 测试与文档面 |

**总论**：必需 overlay 侧动作 **0**；10 枚补丁零文本失配（002/010 同文件不同 hunk 锚漂移属预期直放）；补丁面与上游变化面不相交的机制解释=补丁触碰的 zcodeAgentService/official-plugin-definitions/MCP inputSchema 等锚点文件均不在本轮 148 文件变化集中。

## 附录 C：CyberStrikeAI v1.8.0 T2 深读收口（T2，报告全文 `research/cyberstrikeai-deepread-v18-20261113/`）

新引擎拓扑：Go 宿主握全部权力（工具放行/HITL/toolguard/MCP 执行/证据签发/输出有界化压在 `pi_runner.go invoke()` 单一漏斗六道闸），一次性 Node worker（Pi SDK 1.5.2 钉版）只跑模型循环，stdin/stdout JSONL 提案-回执，工具永不落 worker 侧。

- 旧基线处置：2026-10-22 Eino 基线深读 §2/附录 A 作废，§10 索引 70 条约 22 条已随本报告重锚；治理类结论（证据门/Jev/toolguard/C2 七类/黑板）经字节级 diff 实证全部存活。台账「T2 深读卡过期」标记解除。
- **必吸收 3 项已落 evidence-governed-execution v1.1.0**：①工具调用 ID 防重放三件套（§1.7）②崩溃安全两侧配对（§3.6）③生成内容不得作为新用户指令再导入三层实现（§4.4）。
- 可选 4 项带触发条件挂起（economy 预览门控/本地模型探测清单/复测快照模式/跨源重定向阻断）；不吸收 4 项（Pi 引擎本体/发布指纹链/tool_search 渐进披露/工作台 UI）。
- delta 报告原「必吸收 1（evidence 全量+失败回退）」源码级复核降档为可选——spill 骨架基线已有，v1.8.0 增量仅 ReduceForModel 预压缩+economy 门控。
- 判级维持 🟡（release 密集）。
