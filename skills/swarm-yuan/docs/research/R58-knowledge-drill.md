# R58 知识库真机演练轮：四段知识协议实弹验证

> 2026-09-25，"继续"指令接续换栈/刷新两方向后的第三向：R49 吸收的四段知识协议（六步读法/回归分级/过期三态/悬置清单/页面三角）首次真机验证。
> 项目：r47-drill-vue-spring（Vue2+ElementUI + Spring Boot+MyBatis 同仓，R47 实证可跑；Maven 3.9.16/Java 17/Node 24 实测）。
> 结论：协议主体可执行，**8 处缺陷**（D1-D6/D8-D9）全修并带变异锁；mark-active 全流程走通。v2.27.0。

## 一、演练流程实录

1. 流A 生成 kb58-vue-spring（create + relations-extract 91 边〔import 73/mapper-binding 2/data-mapping 4/field-mapping 12〕+ detect-frameworks 8 框架 + conf-render）；六文件填充由子代理完成（六文件零占位符、99 条框架规律、5 条决策账，mvn test 31/31 + npm test 13/13 + 双构建实测）；--mark-active → status: active。
2. **六步读法×5**：业务概念（recipes 三源溯源齐）/服务契约（file:line 锚点齐）/数据流（负向诚实：contact 字段不存在报"无边命中"而非编造；正向：username→UserMapper.xml:8 一跳带证据）/架构决策（§5.2 文档冲突表）/链路（import 边可追 controller→dto）——协议可执行，抓 D2 空结果语义二义。
3. **回归分级真推**：场景 User.username→loginName。路③数据面（field-mapping/data-mapping 反查）→UserMapperIntegrationTest 必跑；种子对照（漏改 XML property）→ UserMapperIntegrationTest 6 红，必跑集覆盖 ✓。**推导集漏前端两 spec**（UserListView/users-store 明明引用该字段）——D1 契约面缺失实锤。
4. **过期三态**：touch 文件内容后 --diff 报"无变化"——指纹只看结构，D8 触发盲区实锤。
5. **悬置清单**：填充期无任何落点（notes/cognition.md 不存在）——D6 实锤；修复后销项实演（db 只读矛盾→回填转正）。
6. **页面三角**：知识库无承载位（grep 零命中）——D5 实锤。
7. **mark-active 卡壳**：check_framework_globs 拦 vite——D9 双挑食（名字形态+值形态）实锤，修复后转通；D3（"禁止改语义"误聚合）同步在 mark-active 输出中行为验证（假告警消失/真告警保留）。

## 二、缺陷清单（8 修 + 2 裁决）

| # | 缺陷 | 修复 | 锁 |
|---|------|------|-----|
| D1 | 数据模型配方三查缺对外契约面（同族漏修第九形态） | 三查→四查 + §19②注记 + knowledge-lifecycle 同族 | L1 |
| D2 | relations-query 空结果语义二义 | 三支判别提示 | L5 行为 |
| D3 | "禁止改语义"说明词误聚合为禁止改标注 | gsub 剔除后判 | L6 源码 |
| D4 | emit 节点⑥ 硬编码 pytest/mutation | `<测试命令>` 占位 | run-gen-e2e 同族锁 |
| D5 | 页面三角零落点 | template-spec §3 承载行 | L2 |
| D6 | 悬置清单零落点 | 填充规则 ★悬置清单（notes/cognition.md） | L3 |
| D8 | 过期三态触发盲区（内容演化不触发） | SKILL.md 触发双路 | L4 |
| D9 | check_framework_globs 双挑食（非 glob 名+标量值） | 认全部声明变量+值双形态 | L7 行为 |

裁决两件：①backend/db 只读 vs 迁移仅追加 → 迁移可追加/历史禁改（悬置清单销项实录）；②vite 检查器问题 → 并入 D9。

## 三、项目级观察（知识库内容质量信号，非生成器缺陷）

README 双处失真（缺 PATCH 端点/测试数 23 vs 实测 44）、schema 双源无 Flyway 背书、默认弱口令 `${DB_PASSWORD:dev-only}`、CORS 全开、前端单包 974KB、fetchUser 无调用方——全部如实入知识库 §5.2 冲突表/安全清单（以代码为准原则）。

## 四、验证清单

- [x] mark-active 全流程走通（status: active；三关：零占位符/框架 glob/inventory 三审计）
- [x] test-r58-knowledge-drill-locks 8/8 PASS（含 L7 双行为锁）
- [x] 全量 sweep 37 测试零失败；self-check 全绿（版本三面 v2.27.0、双预算登记后达标）
- [x] 种子对照实证（漏改 XML 6 红 ⊆ 必跑集）；D3 行为实证


## 五、R59 同族清剿收尾（2026-09-25，v2.27.1）

D1 修复的"修一处必 grep 同族"全仓执行：家族 15 文件清剿出 6 处同族漏网（spec-template 模板本体/spring-data-jpa 规律/SKILL.md 弧线表/mybatis 门禁提示/relations-extract 头注/relations-query 注释），全部补契约面语义；D9 形态挑食同族复查零残留；L8 清剿面锁 7 断言入变异锁（15/15 PASS）。教训：**修复落点的清单要分层清剿——guide 层（template-spec）与 artifact 层（spec-template 模板本体）是两处，模板本体漏了 guide 修了等于没修**。
