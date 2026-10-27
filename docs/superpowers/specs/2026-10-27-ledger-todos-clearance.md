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

## 验证

- 台账批：gongwen-lint 散文段清零；条目锚点可解析。
- 调研批（quality-gate/CyberSec）：结论带官方源 URL 或本地 git 锚点；版本号来自官方页面原文。
- RELEASE-NOTES 批：补档条目每条带 git 提交/spec 锚点；不改动既有版本事实。
- swarm-eval 批：run 产物落 SIM_ROOT runs/；数字回填 spec（"产出实验数字后回填"承诺兑现）。
- 代码批（索引技能刷新如有代码改动）：目标 vitest＋typecheck；合并前 npm test 全量。

## 设计文档影响

DESIGN_SYNC: none（本轮为台账/调研/文档补档面，不触及整合正本与数字总账的机制或数字口径；台账自洽更新——若总账 specs 计数因本批 spec +1 需对账，收口批并入本 spec 同一提交时如触及则翻 touched）
