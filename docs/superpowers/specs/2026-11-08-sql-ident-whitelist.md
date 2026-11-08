# 2026-11-08 SQL 标识符白名单化批（security 门恢复前置）

> 来源：DENY 卫生批挂账项——security 门 SQL 检查对「标识符插值（值参数化）」形态的静态误报，产品侧根治＋门侧登记制。

## 变更

1. **`custom/qgate/src/executors/persistence.ts` 标识符形状守卫**：新增 `assertIdent()`（`^[A-Za-z_][A-Za-z0-9_]*$` 形状白名单，违例即抛不静默）——SQLite 标识符无法参数化，形状白名单是注入面的确定性收敛（拒绝引号/分号/空格等一切逃逸字符）；t/table/whereKeys 三插值点全守卫。
2. **`custom/server/userperms/middleware.ts` 显式三分支 SQL**：`WHERE ${by}` 三元插值消插值——列名以字面量钉死在 id/username/matrix_user_id 三个显式 prepare 分支（静态可判，语义不变，测试 17/17）。
3. **`custom/server/approval-rules/approval-controller.ts` 注释改写**：注释行 ` + `/`DELETE` 措辞撞门扫描正则——语义等价改写（「本人、无主、super_admin 三类并集」）。
4. **门侧登记制**（技能资产 gates-strict.sh＋conf）：`SECURITY_SQL_EXCLUDE` 按文件路径登记（人工复核标识符来源后落账；命中降 warn 披露、未登记照 fail）——persistence.ts（形状守卫在位）＋approval-domain.ts（rm 防护正则定义行，量词 `+` 撞扫描非 SQL）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | persistence 用形状守卫而非枚举表白名单 | scenario 表名动态配置（枚举漂移面大）；形状白名单一次覆盖全部标识符且拒绝一切逃逸字符 |
| D2 | userperms 用显式分支而非同款守卫 | 三列名静态已知，消插值（静态可判）优于守卫（运行时判）——能静态判的不留运行时 |
| D3 | 门登记制按文件路径而非行指纹 | 行内容随迭代变（登记即失效=每次重登）；文件级+人工复核+warn 披露=豁免可审计 |

## 验证

- userperms 平台策略测试 17/17；`bash -n` 门语法过。
- security 门（合并后终态）：SQL fail 消零（persistence 降 warn 登记、userperms/approval 消插值）——恢复 security 门白名单。
- 坑实录：bash 3.2 UTF-8 下 `$var` 后紧跟全角标点首字节吸入变量名（run12 同型）——门内字符串一律 `${var}` 花括号隔离。

## 设计文档影响

DESIGN_SYNC: none——qgate/server 安全加固与门禁配置面，不触及整合正本与数字总账。
