# 2026-10-27 台账 §9 七项待办清偿＋swarm-yuan 技能域调研组件补录轮

## 变更

用户指令「完成7 项待办」＋追加「要包括 swarm yuan skill 调研的第三方组件及 skill 等」。批次构成：

1. **待办 1/2（升级轮）——上游阻塞确认**：三棵基线树本轮 fetch 复核仍无新稳定 tag（studio v0.7.39/agent v0.22.5+canary/zcode 持平），升级不可执行；台账行更新复核时间戳与状态。
2. **待办 3（quality-gate v2.0.0 增量调研）**：克隆 v2.0.0 源码，读 release notes＋源码级差异（重点 scope:event/AsyncAPI 3.0.x 契约核验），产调研结论与吸收裁定，入台账。
3. **待办 4（swarm-eval 数值 run）**：起 SIM_ROOT 隔离实例，执行 mixed-motive 首跑＋消融 run（MX_ABLATE_ROLES）＋注入 run（MX_BYZANTINE_SPEC），数字回填 spec；环境/额度受限则如实挂账并给现场证据。
4. **待办 5（Cybersecurity-Skills 语料刷新）**：克隆 mukul975 仓（817/818 skills），重扫域/技能结构，刷新 team/skills/anthropic-cybersec-skills-index 索引技能。
5. **待办 6（RELEASE-NOTES 2.x 补档）**：从 git 历史与 specs 重建 v0.7.32/0.7.34/0.7.35 三轮条目；2.x 版本线按模块版本方案（cockpit=0.7.39-studio.1）正式收线注记。
6. **待办 7（semantica/pua/fibo pin 评估）**：已核——三 pin 全部零移动（semantica v0.7.0 最新 release/pua e6e6cd2 仍 main HEAD/fibo master_2026Q3 持平），维持现 pin。
7. **swarm-yuan 技能域第三方组件/skill 补录（用户追加）**：以 capability-map（54 参考文档＋22 上游运行时对账表）＋docs/research 轮档＋team/skills 融合技能上游源为事实源，提取未入台账的第三方组件/技能/方法论源，去重后补入台账新分节。

## 决策记录

- D1：待办 1/2 的"完成"边界＝上游发新稳定版才可升级（钉版纪律，上轮 D8 裁定延续）；本轮无新版即如实记"仍阻塞＋复核时间戳"，不 sync 未发版流。
- D2：swarm-eval run 按用户指令执行真实数值 run（非仅结构复验）；失败/受限如实报现场证据不造假数字。
- D3（用户指令）：台账补录 swarm-yuan 技能域调研面——产品面组件账（本台账）与技能域吸收账（capability-map）互链不合并的分界维持，但组件/技能**清单层**须在本台账可见（新增分节），capability-map 仍是技能域实施对账正本。
- D4：worktree 上限延续放宽（在途 6 个均为并行会话保护中；用户已指令完成待办，开工为隐含授权）。

## 待办 4 run 终态（2026-10-27，SIM_ROOT 实例真实执行）

- **mixed-motive 首跑（占位口径如实）**：RUN_ID=mm-20261027-base／base2（base2 全链 rc=0）。指标（mx-mixed-motive.py 纯函数，9 条契约行＝3 单元×3 轮）：welfare=480.0、gini=0.3333、nashDeviation=0.6667（相对离差代理，D12 降档口径）、budgetUtilization=0.6667、unit_a/b 各得 240、unit_c 得 0。占位声明：单元账号 token 未供给，竞标 DM「指令未达」如实记录，出价为场景保底（r×10/50）——结算与指标链路为真实执行，出价非 agent 真实决策。证据：runs/mm-20261027-base{,2}/evidence/mixed-motive-{ledger.jsonl,report.json}。
- **消融旋钮真链路**：RUN_ID=knob-20261027-ablate2，MX_ABLATE_ROLES=chen-agent——mention 过滤生效＋compensate 台账落行（compensation-ledger.tsv：`ablation-skip role=chen-agent … mention 已过滤`）。边界：群发通道 SEND-FAILED（独立点火缺主链 room_analysis 上下文），过滤机制本身已验。
- **拜占庭注入真链路**：RUN_ID=knob-20261027-byz3，MX_BYZANTINE_SPEC=chen-agent:noise——DM 实发（房 !btGNIvrdqqDjmHXzVI:matrix.test）＋byzantine-events.log 落行 `BYZ|chen-agent|noise|injected`（BCR 度量的回查锚）。
- **仍挂账（主链级，需专门 run 窗口）**：每角色一轮的全量消融 criticality 数字与注入后 BCR/暴露窗读数（需 26 步主链 run 的 r18 数据，单会话不可行——与前几轮同口径如实挂账）。

## 中间发现与决策（随批增补）

- D5（mx-up 两处根治，2026-10-27 实锤）：①运行时补丁语义 marker 提取只认 def/class，609 补丁全部新符号为模块级常量（_BLOCKER_AUTH_DEGRAde_SEC/MIN）→ 语义在位却误报 fail；修＝marker 候选补 `^+NAME=` 顶层常量形态（mx-lib.sh mx_apply_agent_patches）。②mx-up 从不刷新 agent 源码快照（provision 只在 mx-setup 调）——宿主升 0.22.5 后旧快照（@135e609a1，10-21 供）缺 hermes_dir_acl/base_log_safety 等 24 个新模块，网关 import 连环崩；修＝mx-up 在补丁自愈前调 `mx_provision_agent_src`（键同跳过幂等，键异全量重照）。曾试把 hermes_dir_acl.py 搬入 runtime 覆盖层＋manifest，判定为双源真相（24K 模块须随上游维护）已撤——正路是快照新鲜度而非搬运。
- D7（首跑暴露的 5 处场景骨架缺陷，随批根治）：①step() 助手从未存在（骨架引用即崩）——mx-scenario-lib 补通用幂等步执行器；②mixed-motive 回执提取行 run14 A1 同型 pipefail 陷阱——内联 || true；③capture_step 在独立场景下 SCRIPT_DIR unbound 崩收尾——头部 fail-soft 守卫；④dm_room_agent 的 local 同句自引用展开陷阱（独立调用即 unbound，主链被驱动全局变量掩盖）——拆两行声明；⑤SIM 专属补丁 637 对 0.22.5 上下文漂移——run.py 两 hunk 按真实基（注入态 vendor）重生成（v3，双向验证过）。
- D6（worktree 跑 mx-up 的路径失真）：mx-sim-mautrix-ensure 的 SIM 回落推导 `dirname $0/../../..＋/ncwk-sim-mux` 在 worktree 下失真；显式 `AIPAY_SIM_ROOT`＋`MX_NCWK_ROOT` 两 env 后正常（不改代码——主树运行本就正确，属 worktree 用法注记）。

## 验证

- 台账批：gongwen-lint 散文段清零；条目锚点可解析。
- 调研批（quality-gate/CyberSec）：结论带官方源 URL 或本地 git 锚点；版本号来自官方页面原文。
- RELEASE-NOTES 批：补档条目每条带 git 提交/spec 锚点；不改动既有版本事实。
- swarm-eval 批：run 产物落 SIM_ROOT runs/；数字回填 spec（"产出实验数字后回填"承诺兑现）。
- 代码批（索引技能刷新如有代码改动）：目标 vitest＋typecheck；合并前 npm test 全量。

## 设计文档影响

DESIGN_SYNC: none（本轮为台账/调研/文档补档面，不触及整合正本与数字总账的机制或数字口径；台账自洽更新——若总账 specs 计数因本批 spec +1 需对账，收口批并入本 spec 同一提交时如触及则翻 touched）
