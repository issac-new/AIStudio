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

- 台账批：gongwen-lint 机械体检——散文段清零；余 24 处硬违规全部位于表格单元格并列枚举（linter 自注「并列小标题的分号是合法格式」豁免类），如实声明。条目证据锚点抽查可解析（file:line 实在）。
- 升级批（未触发，见 D8）：三棵树均无新稳定 tag——hermes-studio 最新 tag＝所钉 v0.7.39（main 领先 28 未发版提交）、hermes-agent 最新稳定＝v0.22.5（GitHub Latest 交叉确认，其后仅每日 canary，main 领先 1852 提交）、zcode 与 origin/main 持平。未发版移动已做主题级预研入台账 §2。
- 挂账清偿批（四项落地）：
  - callgate 执法接线：`npx vitest run custom/server/callgate` = 21/21（新增 callgate-hook 11 例：总闸默认零行为/限流/熔断/mcp 分键/fail-open/REST 校验）。
  - taskledger 接线：`npx vitest run custom/server/taskledger custom/server/kanban custom/server/zcode custom/server/services` = 121/121（新增 mention 映射 1 例；dispatch-lane 走查确认登记在途）。
  - 红队 S1：`npx vitest run custom/server/redteam custom/server/eval/__tests__/eval-baidu-http.test.ts` = 30/30（新增 redteam-s1 6 例；既有断言随 s1Wired=true 口径更新）。
  - A2A 看板归属：`npx vitest run custom/server/a2a custom/server/harness/__tests__` = 89/89（新增 board-ownership 6 例）；真实正本活体投影 9 域验证（node strip-types）。
- swarm-eval 残余 run（未执行数值 run，如实挂账）：结构面复验 `bash -n mx-scenario-lib.sh` 通过＋`npx vitest run tests/swarm-eval-followup.test.ts tests/swarm-collab-integration.test.ts`（simharness 自有配置）= 15/15。数值 run 需 SIM_ROOT 实例小时级窗口（连续三轮同口径挂账），执行配方入台账 §9 待办 4。
- 版本核对副产品：upstream/ 参照树 5 棵已推进检出（claude-code v2.1.311、dsh-context v0.77.0、dsh-TUI/kimi-code/multica tip），全部 pristine。
- 全量（收口批）：`npm test` = 918 文件 6,573 过/0 败/11 跳过（rc=0，第三跑；第一跑 2 处失败＝sequence-guard 链长断言随 7 节链更新＋docs-ssot 新 spec 未登记附录 A 索引——本批补登 363→364；第二跑另见 simulation-node-executors 1ms 时间戳与 secaudit 20s 超时两处负载抖动，隔离复跑均过、与本次改动无代码路径交集）。`npm run typecheck:harness` 0 错（三新模块已入点名清单）。
- 提交门禁：jargon 词表零新增；失败如实报告。

## 决策记录（随批增补）

- D8（批 2 落地裁定，2026-10-27）：三棵基线树 fetch 后均无新稳定发版——升级批条件不触发。用户 D2 裁决的「同批执行升级」按其前提「若发现上游有新版本」理解为新稳定发版；同步到未发版 main tip（agent 1852 提交）违反供应链钉版纪律（2026-10-24 立法：精确 pin、发布版基线），不采纳。两棵树的未发版移动已完成主题级预研（台账 §2），发版即启动升级轮。
- D9（批 5e 落地裁定）：swarm-eval 数值 run 本轮不执行——需 SIM 实例与模型额度的小时级窗口，与本轮台账/落码主线争抢；结构面复验绿＋配方入台账待办。连续三轮同口径挂账，不静默丢弃。

## 设计文档影响

DESIGN_SYNC: touched（本提交随批兑现）
- 整合正本 `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§7.7 增「调研台账正本」段（含四挂账清偿与三基线树核对结论）；版本行 R18→R19（并行检索四批已取 R18，rebase 顺延）；文档变更记录表落 R19 行。
- 数字总账 `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：核实日头增台账立账批口径（端点 +3/specs 377 磁盘实测/全量 6,584=6,573 过）；文档行 specs 377。
- 附录 A 索引 `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（A.1 并行双流 367＋本批 1=368 份）。
