# SwarmStudio 设计数字总账

> 全域数字唯一事实源（2026-10-23 自整合正本 R1 附录 B 独立成档，整合 R2 决策 I5）。
> 核实日：2026-10-27（全局检索合并批：统一顶部弹窗、旧 `/app/search` 改兼容重定向、specs 371、方案 V8.55；前次 2026-10-26=九点对账轮全量复测；设计文档同步机制立法批随批更新：变量 199/specs 342；Qoder 主动性吸收轮刷新三行：补丁 405/服务端域 149/specs 350 实测；挂账清偿批：补丁 406/specs 351；JoyAI 闭环吸收轮：补丁 407/服务端域 152/specs 354；挂账清偿批：路由 +sim/map/specs 355/全量 6,448；清偿批二：补丁 408/端点 +map-annotations；批三：补丁 409/全量 6,466）。任何文档引用数字以本表为准；本表只增改不并列双口径，历史口径见各档案。

| 域 | 项 | 数字 |
|---|---|---|
| 产品面 | 模式/页签/入口/岛 | 3/34/6/4（2026-10-26 加挂微轮 +⑥治理·主动性两轴页签） |
| 产品面 | 路由/客户端目录/服务端域 | 90/19/152（+delivery/precedent/expertise/proactivity，2026-10-26 Qoder 吸收轮；2026-10-26 JoyAI 闭环吸收轮 +specs/workitem/impact 三域；挂账清偿批路由 +sim/map） |
| 产品面 | 补丁 studio/zcode（series 登记） | 409/8（批三 699 mapnotes socket namespace；清偿批二 698 mapnotes 挂载；2026-10-26 晚口径并 Qoder 双轮实测：691 fail-soft、692 kanban-patch-running、693 element-web-dir-override、694 element-web-wasm-csp、695 proactivity 挂载、696 agent 目标登记对齐台账；JoyAI 闭环吸收轮 697 workitem+impact 挂载；zcode 009 claude-skills-compat） |
| 产品面 | 用户决策/常设/纠正 | 148/30/27 |
| 产品面 | 全量测试 | 滚动口径见各轮 spec 验证段（2026-10-26 JoyAI 挂账清偿批 worktree=6,448 过/0 败/11 跳过；吸收轮 6,438 两轮；主树未注入时全量出假红，必须先 inject） |
| 产品面 | 六闸/介入/检测器/prelaunch | 6/14/31/30 |
| 产品面 | 净树重放 | clean+inject 全链通过（2026-10-26 worktree 实测；series 现量见上行随批对账） |
| 产品面 | FIBO | 37/21/16 |
| 产品面 | 天猫吸收面（2026-10-23） | 端点 7（delivery 4+expertise 2+precedent 1）；介入六类/两层（run22=98/85+13）；画像 14 人 455 证据；C 档补数 81/81；判例=run 单元 |
| 产品面 | 群体协作读数面（2026-10-24 含清账批） | 端点 1（delivery swarm-collab＋?compare= 消融对比）；四维度读数＋全文保真双口径＋拜占庭 BCR/暴露窗；红队种子库 v2=36 任务 6 向量；交付效能第⑤区；消融/拜占庭旋钮（默认关）＋mixed-motive-bidding 场景＋welfare/gini/nash 指标器；obs-signals byProfile 分桶；simharness 采集透传（判据零变化） |
| 产品面 | 研发闭环串联面（2026-10-26 含挂账清偿批） | 端点 4（workitem panorama＋impact requirement＋suggest-modules＋ontology fibo/related-docs）；fewshot 派发语境接线＋bigram 向量双口径召回；泳道证据摄取（lane_handoff/lane_session）＋全景面板泳道履历面；run 完成失败样本自动回流（EVAL_AUTO_REFLOW_ON_RUN）；业务地图页 sim/map（多图层画布）；IDE 任务侧栏⌗全景面板＋导演台影响推演卡/AI 拆模块＋FIBO 关联 spec 列；批二：画布标注（map-annotations 端点+节点角标+指纹持久化）＋fewshot LLM 重排档（FLYWHEEL_FEWSHOT_RERANK 选通）＋mention 通道 lane_session 源；批三：标注实时协同（LWW-Register+socket 房间广播+presence，补丁 699）＋squad 委托链重排注入（fetchTaskTitle 迁 governance 解环） |
| 产品面 | 推演/方案/纪律 | 22 轮（run22 六闸全过）/V8.55/86 条正文（编号至 86） |
| 运行面 | 编制/账号/profile/板 | 15/30/42/28 |
| 运行面 | 宿主/sim profile | 49-50/45 |
| 运行面 | 技能中位 | 296（8-563） |
| 运行面 | 并发/峰值/扇出 | 30/13/4-6-3 |
| 运行面 | 安全 20 项 | 4/15/1 |
| 运行面 | 阻断挂起 | 10/≥4 周 |
| 运行面 | 域决策 | 144/21 |
| 运行面 | 上报/新鲜度 | 340KB/48h |
| 运行面 | fleet | 45/45 |
| 能力层 | 版本/决策 | v2.95.0（+R142 运行时刷新 2026-10-25）/50 |
| 能力层 | 门禁 | 56（11/18/19/6） |
| 能力层 | 特征卡/运行时/领域 | 17/15/32 |
| 能力层 | references/research/reviews | 57/99/1 |
| 能力层 | 随发文件 | 92（lite 46） |
| 能力层 | 变量/预算 | 199/200（2026-10-26 设计文档同步轮 +DESIGN_SYNC_REQUIRED/DESIGN_DOCS） |
| 文档 | specs/plans/研究档 | 373/63/32（2026-10-27 真值修复批 +1；plans/研究档沿用 2026-10-26 口径） |

## 来源覆盖（2026-10-26 复测）

全量覆盖：341 specs、62 plans、31 研究档、21 运行面 spec、V8 正本 2,727 行、simharness 7 份、能力层 57 方法论＋2,837 行决策史＋99 research、45 份 feedback。未逐字：1.7M 旧汇编、hermes-agent 源码细部、产品面部分历史正文。

## 维护规则

数字只在本表定义一次；整合正本与其他文档引用数字以本表为准；vendor 基线版本以 vendor/VENDOR.md 为单一事实源；每批合入 main 随批对账（并行轮密集期不得隔轮积压——2026-10-26 九点对账轮裁定，此前「每季度对账」在单仓整合提速后失效，三轮数字漂移实录为本条依据）。**随批对账已机制化（2026-10-26 设计文档同步轮立法）**：XXX-DEV 技能 spec 四要素之「设计文档影响」声明（DESIGN_SYNC: touched/none）+L2 提交钩子机械核验——触及本表/整合正本的变更声明 touched 须同批兑现修订，纯内部变更声明 none 附理由经节点⑦审查背书；本表与本行即该机制管辖对象。
