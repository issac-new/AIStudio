# 2026-11-08 security 门存量分批第一口（SQL 族清零＋拍摄账号正式修正＋IDE_TASK 按轮注入）

来源：run28 帧审计修复尾批（用户令「统一按建议执行」）＋属主会话 2026-11-08T22:10 决策的存量 66 条分批计划。实况勘误：d636895ab spec 所述「SECURITY_SQL_EXCLUDE 登记制」代码未落地（两份安装副本 gates-strict.sh 均无该机制），security 门 SQL 族实测仍 7 红。

## 变更

1. **`custom/server/harness/workbench/store.ts` SQL 标识符形状守卫**：新增 `assertIdent()`（与 qgate persistence 同款 `^[A-Za-z_][A-Za-z0-9_]*$`），migrate/read/write 三处 `db.prepare` 的 `${table}`/`${col}` 插值点全守卫——调用面虽为本文件字面量，经参数传递后静态不可判，形状白名单把注入面收敛为合法标识符字符集（属主 D1 决策同款）。
2. **`simharness/mux/capture-plan.env` 三键拍摄账号正式切 admin**：anexec_done/review_done/ready_done 三面板（文档评审/待裁决/发布审批）路由面属平台超管，fanfan 视角恒 403——run28 补拍轮实证（原帧内容区报错 + admin 补拍即完整）。临时切号补拍的过渡态转正。
3. **`simharness/aipay-scenario.sh` IDE_TASK 按轮注入**：ide 步拍摄前解析 fanfan-pm-plan 板首卡 id 注入 `IDE_TASK`（r18-plan-vars 既有展开通道）；解析失败记 `ide-task-resolve-fail` 问题单不静默——根治 run28「默认任务号跨轮失效→深链错帧」。
4. **门侧登记（生成物 conf，不入仓）**：`SQL_INJECTION_WHITELIST` 三条（persistence 守卫行＋orchestrator 两行纯参数化算术撞正则）＋`EVAL_WHITELIST` 语料片段＋sensitive 豁免核对——命中降 warn 披露；正本留 `.swarm-yuan/decisions.jsonl` 2026-11-08T22:40 行（conf 重渲染洗掉可按此回填）。
5. **GATE_ENFORCE_DENY 回挂 sensitive,deps**（用户裁决 C 的收尾）；security 维持摘除——属主明示「存量按族分批裁决后恢复」。

## 决策记录

1. workbench 用形状守卫而非显式分支：三表两列经参数传递，守卫一次覆盖且拒绝逃逸字符（对齐属主 D1）。
2. orchestrator 两行登记而非改写 SQL：`attempts = attempts + 1` 是合法算术，改写（如 `attempts+1` 去空格）徒增 diff——门粗滤正则的形态误触按属主 D3 登记制处理。
3. capture-plan 三键账号属规划正本修正（非补拍临时态）：fanfan 恒 403 是路由权限事实，拍摄位跟随权限面。
4. conf 登记走既有旋钮（SQL_INJECTION_WHITELIST/EVAL_WHITELIST）不新增门代码——属主挂账明示分批，不越权重写门实现。

## 验证

- `bash -n simharness/aipay-scenario.sh` 过；workbench store 改动后 `npx vitest run custom/__tests__/`（目标面如有 workbench 测试则随跑）。
- security/sensitive/deps 三单门主树复跑：SQL fail 清零（登记项降 warn）、语料误触清零。
- capture-plan 三键行 `grep` 断言（tests/capture-plan-registry-coverage 既有守门随跑）。

## 设计文档影响

DESIGN_SYNC: none —— 采集拍摄位账号/驱动注入与 SQL 加固均不触及整合正本与数字总账；关联前批 `2026-11-08-sql-ident-whitelist.md`（本批为其存量的第一口）与 `2026-11-08-frame-verify-error-markers.md`（补拍轮收尾）。
