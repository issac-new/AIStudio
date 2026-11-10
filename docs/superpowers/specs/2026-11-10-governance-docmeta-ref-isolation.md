# 治理工件读路径 origin/main 引用缺席致误报「不在仓」（docMeta 异常隔离）＋四缺口面收口（2026-11-10）

## 变更

**D2（产品缺陷，已修）：`custom/server/governance/governance-controller.ts` docMeta 的 refs 循环无单 ref 异常隔离——治理仓默认分支为 master 时 `origin/main` 引用缺席，`git log origin/main` 以 fatal bad revision reject，异常炸掉整个 try 块，把已命中的 HEAD 查询结果一并丢弃，工件被误判 `exists:false`。** 表现为读写自相矛盾：PUT /doc 刚提交成功（文件落盘＋git commit 都在），GET /overview 却显示「不在仓」，gov-docs 页全部工件永远「缺失」。真实治理仓（issac-new/governance，remote=github）默认分支即 master，克隆形态必中此缺陷；既有测试夹具用 `update-ref` 手造 origin/main（governance-controller.test.ts:34），从未暴露。

修复两处：
1. docMeta：单 ref 查询 `.catch(() => '')` 隔离——缺席 ref 记空串继续，「HEAD 与 origin/main 取较新者」语义不变；
2. GET /doc 对象库回退：无 ref 工件 origin/main 缺席时回退 HEAD（docMeta 已判在库，读取不得因远程引用缺席 500）；ref 工件（G3 分支证据件）仍恒读 entry.ref 真值快照不放宽。

**四缺口面收口（同轮交互级排查补完，前轮 spec=2026-11-10-interaction-walkthrough-round）：**
- eval UI：正确载荷（problem/expectedBehavior/rubric[]）表单提交→201→集出现在列表→封存 seal 200 全闭环；集 DELETE 405＝密封不可删设计（非缺陷）。
- projects：`hermes project create`（projects.db）＋`kanban create --project` 落 project_id→UI 列表出现→暂停按钮点击→`POST /pause 200`→resume 200 全链（pause/resume/complete 三端点实存）。
- gov-docs：修复后工件行（含 commit 锚点）→点选→docview→编辑→保存 PUT 200→内容落仓→git 提交（隔离克隆仓 `bb27797 治理工件编辑：G1 需求冻结`）浏览器级全闭环。
- matrix：REST 通道真闭环（真 homeserver 127.0.0.1:8008 真账号建房/发 3 条消息/退房清场，matrix-session ledger 3 pass 0 defect）；内嵌 element-web 面板冷加载超时维持既有定性（2026-11-02 全功能回归轮：无已连接会话环境＝访客态，内容验收须专项轮）。

## 决策记录

- D2 修法取「单 ref 异常隔离」而非「把 origin/main 改成 origin/master 或动态探测默认分支」（Mechanical）：隔离修恢复「任一 ref 可用即有真值」的 fail-soft 语义，对双分支形态零行为变化；动态探测默认分支会改变取较新者的比较集合，属超范围改语义，不动。
- 治理仓走查数据面用克隆隔离（Mechanical）：GOVERNANCE_REPO 指向 `/tmp/governance-iso`（clone 自仓内嵌套 `governance/`），写路径（PUT→git commit）全部落克隆仓，不污染生产治理历史。
- projects 域判定（Taste）：「无新建项目 UI」是现状陈述非缺陷（项目经 CLI/桌面会话锚定创建，板经 bind-board 挂项目）；列表/暂停/恢复/完结四端点与 UI 动作链本轮全部实证。

## 验证

- 回归测试：`governance-controller.test.ts` 新增「master 默认分支仓（无 origin/main 引用）工件仍 exists:true 且可读全文」用例——克隆形态仓（刻意不造 origin/main）断言 overview exists:true＋commit 匹配＋GET /doc 200 含全文；套件 8/8 过。
- 活体：修复后 `/api/governance/overview` freeze exists=true（commit=ab1ac03）；UI 全闭环 C2-C5 4/4（选行→编辑→保存→stamp 落仓→git log 见 `bb27797`）。
- 修复前活体证据：PUT 200（文件＋两次 git 提交在仓）但 overview/doc 均 404「not in repo」；独立复刻 docMeta 的 execFile 调用定位 `fatal: bad revision 'origin/main'` reject 路径。

## 设计文档影响

DESIGN_SYNC: none——治理工件读路径的 fail-soft 语义修复（仓缺席/引用缺席如实降级不编造），不改变既有设计决策与契约面；origin/main 双查询意图（编辑链 HEAD 领先时取较新者）保持原样。
