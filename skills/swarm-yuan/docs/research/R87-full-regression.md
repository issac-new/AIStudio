# R87 全量回归轮：双栈演练（Vue2+ElementUI+SpringBoot+MyBatis+MySQL 前后端同仓 + Next.js+Prisma 7）

> 2026-10-04，用户指令触发：「完整回归测试（生成典型场景的 skill 然后基于其进行若干项典型研发工作），识别并排查修复缺陷，验证通过后发版」+ 中途加码「必须包含 Vuejs+ElementUI、Spring Framework+MyBatis+MySQL+Spring Boot 的前后端项目」。
> 证据分级：A 级（本机真实工具链全链实测——docker MySQL 8.4.11 / Maven 3.9.16+JDK17 / pnpm10+Node24 / Next 16.3.8 / Prisma 7.10）。
> 结论：1 缺陷（D3）修复+变异锁 7 向；2 误报澄清（D1/D2 为设计行为）；流A×2+流B 三类执勤全通。

## 一、演练项目（全部真实可跑）

| 项目 | 栈 | 实测 |
|------|-----|------|
| r87-drill/fullstack | backend: SpringBoot 3.2.5+MyBatis 3.0.3+MySQL 8.4.11（docker 3307）；frontend: Vue 2.7.16+ElementUI 2.15.14+Vite 4 | 后端 11 用例（H2 MODE=MySQL）；前端 12 用例；真库全链冒烟（stats/POST 带标签/dueDate echo）；pnpm build 绿 |
| r87-drill/nextjs-drill | Next.js 16.3.8 App Router+Prisma 7.10（better-sqlite3 adapter）+Vitest 5 | 6 用例绿+next build 绿（含 tsc） |

环境坑实录（进 dev-guide 常见坑）：Prisma 7 破坏性变更（schema 内 url 报 P1012 → prisma.config.ts datasource.url + client adapter 双通道；adapter 构造对象参数 `{url:"file:…"}`；导出名 `PrismaBetterSqlite3` 小写 q）；pnpm 拦原生模块构建（onlyBuiltDependencies）；JDBC characterEncoding=utf8mb4 非法（Java 编码名用 utf8）；MyBatis 单参 @Param+useGeneratedKeys 取不回键（按唯一键回查）；前后端列表契约包装形态统一。

## 二、流A×2（生成全流程）

- 骨架→inject-frameworks→AI 填充→--all→mark-active→--all-full 两技能全通。
- **探测面**：fullstack 7 框架全对（spring-boot/mybatis/vue/element/vite/jest-vitest/mysql——同仓 backend/frontend 子目录形态复合 BUILD/TEST_CMD 正确嗅探）；nextjs 4 框架全对（react/nextjs/prisma/jest-vitest——81 规则集含 Next/Prisma）。
- **mark-active 三关实录**：框架 glob 全空被拦 → AI 填 glob → spec-first 联动（WRITABLE_DIRS 空）被拦 → 填语义 conf → 占位符/DIM/decisions 核验 → active。防线逐关真实工作。
- framework-knowledge 填充策略：真实规律（每条带本仓 file 锚）+删冗槽（85 槽不硬凑——"不拼凑"纪律），strict 占位符清零。

## 三、流B（执勤三类）

1. **TDD 全链（dueDate 需求）**：spec（§5.5 四勾选+§19/§20 左移）→红测先行（后端编译红+前端 4 红）→spec 歧义在红阶段暴露（PATCH null 语义，落 decisions）→四件套同步实现→绿（11+12 用例）→真库 ALTER+冒烟 echo→--all fail=0→review-record 追记→状态机 open→design→build→verify→archive 全链（跳级拦截+proposal 准入+verify_result 门三重实证）。
2. **指纹自成长**：--write 基线（28 文件）→加 HealthController→--diff 精准检出（29/.java+1/scope=backend）→reference-manual 单条更新→新基线落盘。
3. **hook 三面+审计**：rules.d forbid 无条件面（npm publish 硬拦 deny JSON 带替代方案）→捕获面（PostToolUse exit 1 记 flag）→拦截面（Write deny 带三条解除路径）→--report 四段（决策事件/拦截率/门禁聚合/工具分布）。

## 四、缺陷与处置

| # | 现象 | 定性 | 处置 |
|---|------|------|------|
| D3 | check_deps：版本表列带自然尾注（"4.5.14（devDep）"）时 `_norm_ver` 只剥 range 前缀不剥括号注记 → 假阳性 fail，且报错信息两侧显示相同版本（自相矛盾证据） | **真缺陷**（P1）：归一化容错缺失 | 修复：`_norm_ver` 从第一个括号（全角（/半角(）截断（版本号内括号不合法，截断安全；RELEASE 无括号形态不受影响）。变异锁 7 向（含 R75-D2 补齐语义+RELEASE 语义保持+负向不误放真变更）；变异验证红→绿实证。同族清剿：split-gates 分发同源单点；baseline 提取 awk 在 check_deps 内同修复覆盖 |
| D1 候选 | ACTIVE_FRAMEWORKS 不在 precheck.conf | 误报澄清：按设计落 arch.conf:92（框架门禁的家） | 无需修 |
| D2 候选 | inject-frameworks 只补 glob 占位不推导默认值 | 误报澄清：注释与实现一致（AI 填充职责，arch.conf:90 声明） | 登记增强候选：探测信号→默认 glob 自动推导（每框架默认表在门禁片段元数据已有示例形态） |
| F3 | mark-active DIM 核验输出"接口端点 6 / 列 0 / NO_LIST" | 观察项：枚举有值清单列空的诚实披露形态 | 观察不改 |
| 坑复现 | hook 测试 payload 缺 `hook_event_name` 字段全静默 | R80 已知坑第二次实证（协议字段必带，非缺陷） | 无需修（test-fail-gate-hook 已有覆盖） |

## 五、验证与收口

- 变异锁：tests/test-r87-full-regression.sh 7 向；run-sweep 全量（含新锁）；CI。
- 版本：v2.50.0。
- 预算：随发体积实测登记（见 CHANGELOG）。
