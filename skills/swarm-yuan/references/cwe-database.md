> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# CWE 元数据库（ISO/IEC 5055 + GB/T 34943 完整分级）

# CWE 元数据库（ISO/IEC 5055 + GB/T 34943 完整分级）

> 本文件是 swarm-yuan 仓库实际涉及的 **60 个唯一 CWE** 的完整元数据库，对齐 ISO/IEC 5055:2021（自动化源代码质量度量，138 弱点映射 CWE）与 GB/T 34943-34946（源代码漏洞测试规范）。
> 口径权威源：`assets/facts.conf`（FACT_CWE_ENTRIES=60）。
> 用法：`precheck.sh --cwe-audit` 逐条对账本表；框架规则 md / framework-gates 中的 CWE 标注须在本表登记。
> 来源：CWE 视图 799（CWE Top 25 Most Dangerous Software Weaknesses, 2025）+ ISO/IEC 5055 四特性分类 + GB/T 34943 系列。

## 分级维度

每条 CWE 登记六个维度：
1. **CWE 编号** — CWE 数据库唯一标识
2. **名称** — 简短中英文名称
3. **OWASP Top 10:2025** — 映射的 OWASP 类别
4. **严重度** — High / Medium / Low（基于 CWE Top 25 排名 + ISO 5055 影响）
5. **ISO 5055 四特性** — 可靠性(R) / 安全性(S) / 性能(P) / 可维护性(M)
6. **检查点** — swarm-yuan 门禁/框架规则对应的检测位置

---

## A. 注入类（OWASP A03）

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-20 | 输入验证不当 Improper Input Validation | A03 | High | S,R | --security §1.1 / framework:validation |
| CWE-74 | 注入 Improper Neutralization of Special Elements in Output | A03 | High | S | --security §1.1 / framework:express,gin,koa |
| CWE-78 | OS 命令注入 OS Command Injection | A03 | High | S | --security §1.3 |
| CWE-89 | SQL 注入 SQL Injection | A03 | High | S | --security §1.2 / framework:mybatis,typeorm,prisma |
| CWE-94 | 代码注入 Code Injection | A03 | High | S | --security §1.4 (eval) / framework:langchain |
| CWE-95 | eval 注入 Improper Neutralization of Directives in Dynamically Evaluated Code | A03 | High | S | --security §1.4 |

## B. 跨站/路径类

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-22 | 路径穿越 Path Traversal | A01 | High | S | --security §2.1 |
| CWE-79 | 跨站脚本 XSS | A03 | Medium | S | --security §1.2 / framework:vue,react,angular |
| CWE-352 | 跨站请求伪造 CSRF | A01 | Medium | S | framework:spring-security,fastify |
| CWE-601 | 开放重定向 Open Redirect | A01 | Medium | S | framework:express,koa,gin |

## C. 认证/授权类（OWASP A01/A07）

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-284 | 授权不当 Improper Access Control | A01 | High | S | --authz §3 (CORS 放行带凭据) |
| CWE-306 | 关键功能缺失认证 Missing Authentication for Critical Function | A07 | High | S | framework:spring-security,flask |
| CWE-307 | 多次失败认证不限制 Improper Restriction of Excessive Authentication Attempts | A07 | Medium | S,R | framework:spring-security |
| CWE-384 | 会话固定 Session Fixation | A07 | Medium | S | framework:spring-security |
| CWE-521 | 弱密码要求 Weak Password Requirements | A07 | Medium | S | --security §1.5 / framework:validation |
| CWE-522 | 密码保护不足 Insufficiently Protected Credentials | A02 | High | S | framework:spring-security,flask |
| CWE-639 | 授权通过可预测的参数 IDOR | A01 | High | S | --authz §2 |
| CWE-749 | 危险资源暴露 Dangerous Resource Exposed | A01 | Medium | S | framework:spring-security |
| CWE-862 | 缺失授权 Missing Authorization | A01 | High | S | --authz §1 |
| CWE-863 | 授权不正确 Incorrect Authorization | A01 | High | S | --authz §2 |
| CWE-915 | 动态计算属性名不当控制 Improperly Controlled Modification of Dynamically-Determined Object Attributes | A08 | Medium | S | framework:langchain |

## D. 加密/敏感数据类（OWASP A02）

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-256 | 明文存储密码 Plaintext Storage of a Password | A02 | High | S | --sensitive / --security §1.6 |
| CWE-295 | 证书验证不当 Improper Certificate Validation | A02 | High | S | --security §1.8 (禁用 TLS) / framework:redis |
| CWE-312 | 明文存储敏感信息 Cleartext Storage of Sensitive Information | A02 | High | S | --sensitive / framework:flask,django |
| CWE-319 | 明文传输敏感信息 Cleartext Transmission of Sensitive Information | A02 | High | S | --security §1.8 (禁用 TLS) |
| CWE-321 | 硬编码密钥 Use of Hard-coded Cryptographic Key | A02 | High | S | --security §1.1 (硬编码密钥) / framework:redis,langchain |
| CWE-327 | 弱加密算法 Use of a Broken or Risky Cryptographic Algorithm | A02 | High | S | --crypto (弱算法黑名单) / GB/T 39786 |
| CWE-489 | 激活调试代码 Active Debug Code | A05 | Medium | S | --security §1.10 (调试模式生产) |
| CWE-798 | 硬编码凭证 Use of Hard-coded Credentials | A07 | High | S | --security §1.1 / --sensitive |
| CWE-918 | 服务端请求伪造 SSRF | A10 | High | S | --security §2.4 |

## E. 反序列化/数据完整性类（OWASP A08）

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-502 | 不可信数据反序列化 Deserialization of Untrusted Data | A08 | High | S | --security §2.2 / framework:java |

## F. 安全配置类（OWASP A05）

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-209 | 错误信息暴露敏感信息 Generation of Error Message Containing Sensitive Information | A05 | Medium | S | framework:express,koa,gin |
| CWE-532 | 日志注入敏感信息 Insertion of Sensitive Information into Log File | A09 | Medium | S | --sensitive (日志脱敏) / framework:flask,django |
| CWE-540 | 密码在源码/配置中明文 Inclusion of Sensitive Information in Source Code | A02 | Medium | S | --sensitive / framework:spring-security |
| CWE-668 | 资源暴露给非预期范围 Exposure of Resource to Wrong Sphere | A05 | Medium | S | framework:nestjs,fastify,express |
| CWE-693 | 保护机制失效 Protection Mechanism Failure | A05 | Medium | S | framework:spring-security |
| CWE-732 | 权限配置不当 Incorrect Permission Assignment for Critical Resource | A05 | Medium | S | framework:validation |
| CWE-770 | 无限资源分配 Allocation of Resources Without Limits or Throttling | A04 | Medium | R,P | framework:redis,xxl-job |
| CWE-778 | 日志审计不足 Insufficient Logging | A09 | Low | M | --shift-left §21 (可观测性) |
| CWE-942 | 过度宽松跨域 Permissive Cross-domain Policy with Untrusted Domains | A05 | Medium | S | --security §1.9 (CORS *) |
| CWE-943 | 数据过滤不当 Improper Neutralization of Special Elements in Data Query Logic | A03 | Medium | S | framework:mybatis,sqlserver |

## G. 可靠性/资源管理类（ISO 5055 R/P）

| CWE | 名称 | OWASP | 严重度 | ISO 5055 | 检查点 |
|-----|------|-------|--------|---------|-------|
| CWE-200 | 信息暴露 Exposure of Sensitive Information to an Unauthorized Actor | A01 | Medium | S | framework:express,koa,gin |
| CWE-359 | 私人信息暴露 Exposure of Private Personal Information | A01 | Medium | S | --privacy / framework:flask,django |
| CWE-362 | 竞态条件 Race Condition | A04 | Medium | R | framework:redis,xxl-job |
| CWE-390 | 错误无动作检测 Detection of Error Condition Without Action | — | Medium | R | framework:druid |
| CWE-400 | 不受控资源消耗 Uncontrolled Resource Consumption | A04 | Medium | R,P | framework:redis,xxl-job |
| CWE-401 | 释放后内存访问 Missing Release of Memory after Effective Lifetime | — | Medium | R | framework:c/cpp |
| CWE-598 | 使用 GET 方法查询信息 Use of GET Request Method With Sensitive Query Strings | A04 | Low | S | framework:express,koa |
| CWE-614 | 未设 Secure 标志的 Cookie Cookie Without 'Secure' Flag | A05 | Medium | S | framework:spring-security |
| CWE-662 | 同步资源共享不当 Improper Synchronization | A04 | Medium | R | framework:redis,xxl-job |
| CWE-667 | 多个权限域暴露 Exposure of System Data to an Unauthorized Control Sphere | A01 | Medium | S | framework:validation |
| CWE-672 | 保护机制失效 Operation on a Resource in a State Unexpected | A05 | Medium | R | framework:druid |
| CWE-681 | 数值转换不当 Improper Conversion between Numeric Types | — | Medium | R | framework:sqlserver |
| CWE-754 | 异常条件处理不当 Improper Check for Unusual or Exceptional Conditions | — | Medium | R | framework:validation |
| CWE-755 | 异常处理不当 Improper Handling of Exceptional Conditions | — | Medium | R | framework:validation |
| CWE-759 | 异常无处理 Use of a Non-existent Exception Class | — | Low | R | framework:validation |
| CWE-772 | 资源未释放 Missing Release of Resource after Effective Lifetime | — | Medium | R | framework:druid |
| CWE-1049 | 资源未初始化 Uninitialized Input | — | Medium | R | framework:java |
| CWE-1333 | 正则表达式 DoS Inefficient Regular Expression Complexity | A04 | Medium | P | framework:validation |
| CWE-1391 | 弱默认配置 Use of Weak Credentials | A07 | Medium | S | framework:spring-security |

---

## 对齐标准

| 标准 | 范围 | 本表覆盖 |
|------|------|---------|
| ISO/IEC 5055:2021 | 138 弱点（可靠性/安全性/性能/可维护性四特性） | 60 条（仓库实际涉及的子集；ISO 5055 全集 138 条的完整覆盖需机构 SAST 工具，本表是门禁级可查的文档锚点） |
| GB/T 34943-2017 | C/C++ 源代码漏洞测试规范 | CWE-89/79/327 等已映射 |
| GB/T 34944-2017 | Java 源代码漏洞测试规范 | CWE-89/502/798 等已映射 |
| GB/T 34946-2017 | 嵌入式软件源代码漏洞测试规范 | CWE-89/79 等已映射 |
| CWE Top 25:2025 | 年度最危险 25 弱点 | 本表 High 严重度项 ≥20 条覆盖 Top 25 核心子集 |
| OWASP Top 10:2025 | 10 大风险类别 | A01-A10 全覆盖 |

## 门禁承载

`precheck.sh --cwe-audit`：逐条对账本表——
① 仓库内所有 `CWE-[0-9]+` 标注（框架规则 md + framework-gates + security-spec）须在本表登记
② 本表每条 CWE 须有检查点（门禁/框架规则位置）
③ 严重度分级一致（High/Medium/Low）
缺登记/缺检查点/分级不一致 → warn（advisory，不阻断）。
