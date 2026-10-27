# 2026-10-27 技术组件台账整理·最新版差异补齐·基线升级·挂账清偿轮

## 变更

本轮为多批次总纲（用户发起："整理此前历史上所有调研的各个技术组件的台账，更新到最新版，补齐与上次调研时其组件版本之间的能力差异，完善AIStudio"）：

1. **台账正本**：新建 `docs/upstream-analysis/component-ledger.md`（活文档，无日期缀），收敛全量历史调研组件（约 57 项：upstream 参照树 14 棵＋协议/标准＋外部产品＋公众号/论文方法论系列），列＝组件/类别/上次调研（日期+版本+commit）/本轮最新核实/能力差异要点/仓内现状/后续动作/证据锚点。
2. **版本核对**：upstream/ 缓存树逐棵 fetch＋HEAD..origin/main/tag 对比（先核 pristine）；无本地树组件走 web 官方源核对（官网/官方仓库优先）。产出版本移动表落台账。
3. **基线升级（条件触发）**：三棵 vendor 树（hermes-studio/hermes-agent/zcode）任一有移动即走 `vendor:sync`＋五门验证，升级批独立收口先合入（另立升级 spec）。
4. **差异吸收**：能力差异调研浮出的吸收候选，低风险高价值子集（A 类 custom/ 优先）同批落地，其余编号菜单留档。
5. **旧挂账清偿五项**：callgate 执法接线（wx 挂账 #14）/taskledger 派发入口接线（#7）/红队 S1 裁判接线/A2A 看板归属产品面读模型端点/swarm-eval 残余 run（消融/注入/mixed-motive 首跑）。
6. **滞后口径修正**：`docs/absorption-domain-README.md` "12 组件"口径更新并指向台账正本；`docs/upstream-analysis/2026-10-18-latest-coding-tools-matrix.md` 加 superseded 头注（保留不删）；`team/requirements.txt` 注释 0.22.4→0.22.5 口径。

## 决策记录

- D1（用户裁决 2026-10-27）：落码范围＝差异吸收＋旧挂账清偿（非仅出报告）。
- D2（用户裁决 2026-10-27）：三棵 vendor 基线树若有移动，同批执行升级；升级批独立收口先合入，吸收批在新基线上继续——一任务一收口，避免升级与吸收混批不可审查。
- D3：semantica/pua/fibo/qgate 等非基线树的上游 pin 不随批升级，只记台账＋升级建议（裁定留菜单）；本轮不引入任何新运行时依赖。
- D4：台账正本落位 `docs/upstream-analysis/component-ledger.md`，无日期缀活文档（终态表述规则）；与 `vendor/VENDOR.md`（vendor 钉版账）、swarm-yuan `references/capability-map.md`（技能域吸收账）互链不合并——三账各域单一事实源。
- D5（用户裁决 2026-10-27）：worktree 并行上限放宽至 10（在途 9 个无一可安全收口：2 个 <24h 已合并受 IN-FLIGHT 保护、doc-harness-residual 有未提交真实在途改动、其余未合入/在途保护）；本轮零清理零丢失。
- D6：RELEASE-NOTES 2.x 历史记账滞后（0.7.32/34/35 缺档、2.x 线未续）只列台账待办不动账——发布账对账归 release:check 体系。
- D7：正本 §7.7 明确否决清单项（音视频/spaces/Tauri/容器沙箱/主会话 append-only 等）本轮不碰；tmall 首响 P90 等属 hermes-agent 运行时 overlay 不可达项不做。

## 验证

- 台账批：gongwen-lint.py 机械体检通过；条目证据锚点抽查可解析（file:line 实在）。
- 升级批（若触发）：`npm run inject` 全量重放 studio 零 FAILED＋agent/zcode 零 WARN；`npm run typecheck:harness`；pytest 拼合树（vendor 补丁版＋runtime 覆盖层）；vitest 全量与基线背靠背；8647 /health 200 且 webui_version 对齐＋8649 走查；release:check；zcode 另跑 catalog-check --refresh＋8 条活跃补丁与 5 条 pnpm patch 逐条核对。
- 吸收/挂账批：每项目标 vitest（`npx vitest run <path>`）＋typecheck:harness；合并前 `npm test` 全量；涉 UI 面浏览器实物走查；新服务端模块并入 typecheck 点名清单；总闸默认关旋钮配守卫测试（先例 HERMES_TOOL_ENFORCE）。
- 提交门禁：jargon 词表零新增；失败如实报告。

## 设计文档影响

DESIGN_SYNC: none（本提交仅立总纲，尚无实际数字与结论可入正本；整合正本 §7.7 增行与数字总账随批对账在收口批同批兑现——届时本 spec 此段翻回 touched 并与修订同一提交，节点⑦审查背书）
