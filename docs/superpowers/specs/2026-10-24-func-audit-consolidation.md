# 功能层全面排查与整合批（D25）：假功能根治+死代码清理+方案锚定组件回归

- 日期：2026-10-24
- 状态：已落地
- 载体：`feat/func-audit-consolidate`（worktree `func-audit`，验证前端 8651）

## 排查方法与结论总览

三路源码排查（假功能/重复功能/方案完备性对照）+ 主会话逐项复核 + IAB 活体
验证。1210 处 @click 全量核验、32 个路由名交叉比对、全流程方案 V8.47
正本逐条对照（F1-F34）。

## 一、确证假功能与根治（A 批）

| # | 问题 | 根治 |
|---|---|---|
| A1 | 「更换头像」按钮无任何处理器（matrix-chat/MatrixRoomSettingsPanel.vue:197） | **真实现**：pickAvatar→隐藏 file input→client.uploadContent（新老返回形态兼容）→m.room.avatar state 事件→bumpRoomVersion；权限沿用 state 事件权（canEditName）；失败显示错误不静默。词条 avatarUploadFailed 经 patch 473 追加（en/zh，hunk 计数+1，upstream 注入态同步）。单测 4 条锁链路（IAB 无法驱动文件选择器，端到端以单测锁定） |
| A2 | IDE 云分享链接指向不存在路由 `#/ide/shared/:token`（token 静默丢弃落主壳）；服务端 prompt 通道自认 stub 骨架 | **入口下线**：IdeChatPane 摘除 ⇗ 分享按钮、删 IdeShareEntry 组件与测试；i18n shareStub 改口「云分享入口已下线，待服务端接线后再恢复」；服务端三端点骨架保留；选段导出（本地文件，真实可用）保留 |
| A3 | 交接记录区零数据通道，「记录会出现在这里」承诺永不可能兑现（HandoffSection） | **下线**：摘 StageRiskPanel/GovOrgKnowledgeView 两挂载点，删组件。IDE 侧 KanbanHandoffSection（真实 4 类×5 态状态机）不受影响 |
| A4 | 12 个死组件/死代码：CockpitAttention（能力已被 AttentionStrip 收编）、MatrixMessageList（自述弃用壳）、KanbanTaskForm（被 InlineCreate 取代）、RunStageBadge、StageFlow、六个 NavEntry（Skillgov/Eval/Bpa/Ontology/Inbox/Accounts——头注声称挂 FlowNavPanel 实则零引用，真实导航走 IaSideNav ISLAND_NAVS）、legacy-view-loaders 的 hermes.kanban/journey 死装载项、WorkbenchView onNewChat 死函数 | 全部删除（每项先全树 grep 复核引用：相互「引用」实为头注文字提及） |
| A5 | gov-settings-registry「看板配置」条目指向重定向路由（语义过期） | 删除条目 |

## 二、方案锚定组件回归（B 批，全流程方案完备性复盘产出）

| # | 组件 | 方案锚点 | 处置 |
|---|---|---|---|
| B1 | GovHealthSection（机器门禁实况 G1-G6 chips） | 方案 F16（L1041-1042 承诺的用户入口）——原为孤儿 | **挂回** ⑥治理 metrics 签（StageMetricsPanel 顶部） |
| B2 | CapacitySection（容量分析：按人估算/实际人日/覆盖率） | 方案 L1057 步 22 面板——原为孤儿 | **挂回** ⑤验收 delivery 签（DailyDeliveryPanel 尾部） |
| B3 | GovOntologySection（语义体检五端点） | 方案 F18 | **删除**：能力已由 /app/ontology 工作台承接（双头收敛），随删 gov-ontology-fibo 测试 |

两端点服务端在营（capacity/overview 401 鉴权正常、qgate-verdicts 在
governance-controller:460）。

## 三、方案完备性复盘要点（V8.47 × 实现对照，F1-F34）

**完整 18 项**（治理族、检索、清偿门、问题对账、监督/证据库、锚反查、
双凭证/净额、四专题页、姿态设置等）。**部分 13 项**集中在两类：

1. **推演结果呈现面入口降级**（2026-10-20 日常/推演拆分批副作用）：
   - 六闸仪+26 步总览藏在导演台「技术详情」开关后（F4/F7/F27）
   - AC 判定链与 14 件交付链只在证据库折叠 details（F14）
   - 推演 HTML 报告无产品查看入口（F32，仅帧图廊）
2. **方案锚定缺件**：GovClusterSection 不存在（F19 集群巡检官收敛性卡）；
   运行编排只读化与方案「autosched 已落地」口径不符（F24）

**超出方案的能力**（建议收编正本，V8.48 候选）：治理姿态签、安全审计签、
长程可信签、交付效能签、导演台产品内图推演全链、受控 harness 启动器、
双 run 体系分流。

## 四、待用户裁定（本轮不动）

- SkillgovSection（生成器/角色映射/教训库完整 UI，端点在营无其他消费方）：
  并入 /app/skillgov 页 or 退役
- ManagementAccountsPanel（三账面板）、SpecEditorView 编排器子树+LoopCreateWizard
  （随 loop 路由退役失联；编排能力或已由 sim/orchestration+导演台承接）：
  挂回 or 退役
- 轻度重叠（可接受现状）：技能启停 toggle 两处（SkillsView vs IDE 插件目录）；
  三份静态命令清单（Spotlight/命令面板/侧栏）

## 验证

- vitest custom/client 全量 2731 用例绿（含新增 room-settings-avatar 4 条；
  删 2 个死组件随行测试）
- raw-hex 预算闸：修复本批引入的 1 处裸 hex 兜底 + 并行工作流批的 2 处
  #e8a13c（顺手根治，预算闸是全局门禁）
- IAB 活体（8651）：⑥metrics 出现「Six Gates + Six-Domain Check」门禁实况；
  ⑤delivery 出现容量分析（真实数据：615 卡覆盖统计）；④risk 交接永空区消失；
  IDE 聊天头部 ⇗ 按钮消失

## 决策记录

1. **假功能三档处置**：能真实现的真实现（头像，标准 matrix 协议链路）；
   未接线骨架的入口下线待接线恢复（云分享——服务端 stub 自认，留着只会
   产生死链）；无数据通道的承诺面下线（交接区）。三档共同点=不再向用户
   呈现做不到的承诺。
2. **方案锚定孤儿优先挂回而非删除**：GovHealthSection/CapacitySection 是
   方案 F16/L1057 明文承诺的用户面且端点在营——孤儿化是拆分批入口重构的
   副作用，挂回即恢复承诺；GovOntologySection 因能力已有新家才删（双头收敛）。
3. **死代码删除前逐项全树 grep 复核**：子代理报告的「引用」部分实为头注
   文字互指，复核后才动手（与 D23 视觉走查同款纪律）。
4. **顺手根治并行批的预算闸违规**：#e8a13c 两处虽非本批引入，但预算闸是
   推送门禁，不修则本批被卡。
