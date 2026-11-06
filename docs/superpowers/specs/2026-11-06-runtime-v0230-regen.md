# 2026-11-06 runtime 覆盖层 v0.23.0 重灌（发版阻塞清偿）

## 变更

v0.23.0 换血批（6e57ade4→4e3228ab）把宿主 ~/.hermes runtime 部到 v0.23.0 态（11-06 14:41）但仓内 runtime/ 模板未随基线重灌（该批挂账 N-1~N-x 在案）——v2 注入链的部署预检 fail-closed 拦截整链（9 件漂移零补丁中止），v1.0.13 发版阻塞。本批按规则 10 配方补重灌：

- **8 件整树回灌**（宿主 v0.23.0 态为已知良好基底）：kanban_db.py（_coerce_run_id run27 毒指针免疫重构随回）、kanban_tools.py、hosted_rooms.py、run_busy.py、run_inbound.py（bot_loop_guard/automatic_notices_allowed 架构）、platforms/base.py、locales/en.yaml、locales/zh.yaml。
- **runaway_guard.py 定向合并**：基底换宿主 v0.23.0 版（换血批重生成时未携带 AI Native T3 颤振信号——本批补回）：五锚点嫁接 file_edit_thrash（信号名/字段/记录钩子/窗口裁剪/检查链）＋方法本体移植；`test_runaway_file_thrash.py` 守门 0 退活体过。
- 本批只清发版阻塞面（inject 预检归零）；换血批挂账的其余项（SIM 三层接线/宿主 601 缺口等）仍归原批台账。

## 决策记录

- **为何由发版轮代清**：部署预检 fail-closed 是 v2 链的正确新行为（负例②有守门），漂移不收口则无法注入/测试/打包；规则 10 给出配方（宿主良好态回灌模板＋模板领先 force 部署），不属越权代修而是机械执行。属主会话已收口（14:52 末次提交后静默）。
- **runaway_guard 嫁接而非整取**：换血批的 v0.23.0 重生成丢颤振信号属重生成缺陷（上游基线不含我仓 overlay 增补，重灌须显式携带）；本批以宿主为基底保 v0.23.0 适配、以 HEAD 模板为颤振来源保 T3 能力，双守门（语法＋file_thrash 测试）验证。

## 验证

- `python3 -c ast.parse` 九件语法过；`test_runaway_file_thrash.py` exit=0；颤振活体触发（同文件异参连续失败）与 exact_action_repeat 先拦语义均实证。
- 重灌后 `node scripts/deploy-agent-runtime.mjs --apply --force` 差异归零、`npm run inject` 部署预检过（RESULT complete）——见提交后主树实测。

## 设计文档影响

DESIGN_SYNC: none——runtime 覆盖层随基线重灌是既定升级配方（VENDOR.md 口径），无机制变更。
