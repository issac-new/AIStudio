---
ruleset_id: dotnet
适用版本: .NET 6+ / C# 10+
最后调研: 2026-07-23（来源：Microsoft .NET Documentation + OWASP .NET Cheat Sheet）
深度门槛: 10
---
## §1 探查信号
| 信号类型 | 模式 | 置信度 |
|---|---|---|
| 文件 | `*.csproj` 含 `Microsoft.NET.Sdk` | 高 |
| 文件 | `Program.cs` 或 `Startup.cs` | 中 |
| 依赖 | `*.cs` 含 `using Microsoft.AspNetCore` | 高 |

## §2 特定构件枚举
- ASP.NET 端点：`grep -rlE '\[Http(Get|Post|Put|Delete)' --include='*.cs'`
- EF Core 使用点：`grep -rlE 'DbContext|DbSet' --include='*.cs'`

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）
### 规律：SQL 查询须参数化
- **适用版本**: 全版本
- **规律**: 禁用字符串拼接 SQL，须用参数化查询或 EF Core LINQ。
- **违反后果**: SQL 注入（CWE-89）。
- **验证方法**: `ExecuteSqlRaw` 或 `CommandText` 含 `$"` 或 `+` 拼接 → fail。
- **对应门禁**: fw_dotnet_sql_injection(fail)

```verify
id: dotnet-r1
cmd: 
expect: always
```

### 规律：密码须哈希存储
- **适用版本**: 全版本
- **规律**: 密码须用 BCrypt/PBKDF2/Argon2 哈希，禁明文存储。
- **违反后果**: 密码泄露（CWE-916）。
- **验证方法**: 含 password 赋值但无 Hash/BCrypt/PBKDF2 → fail。
- **对应门禁**: fw_dotnet_password_hash(fail)

```verify
id: dotnet-r2
cmd: 
expect: always
```

### 规律：须用 HTTPS
- **适用版本**: ASP.NET Core 2.1+
- **规律**: 须启用 UseHttpsRedirection，禁明文 HTTP。
- **违反后果**: 明文传输（CWE-319）。
- **验证方法**: `UseHttpsRedirection` 未配置 → warn。
- **对应门禁**: fw_dotnet_https(warn)

```verify
id: dotnet-r3
cmd: 
expect: always
```

### 规律：须配 CORS
- **适用版本**: ASP.NET Core
- **规律**: 须显式配置 CORS，禁 AllowAnyOrigin + AllowCredentials。
- **违反后果**: 跨域攻击（CWE-942）。
- **验证方法**: `AllowAnyOrigin` 与 `AllowCredentials` 同时出现 → fail。
- **对应门禁**: fw_dotnet_cors(fail)

```verify
id: dotnet-r4
cmd: 
expect: always
```

### 规律：须配身份验证
- **适用版本**: ASP.NET Core
- **规律**: 敏感端点须加 [Authorize]，禁匿名访问。
- **违反后果**: 未授权访问（CWE-306）。
- **验证方法**: `[HttpGet]` / `[HttpPost]` 但无 `[Authorize]` → warn。
- **对应门禁**: fw_dotnet_auth(warn)

```verify
id: dotnet-r5
cmd: 
expect: always
```

### 规律：须用 async/await
- **适用版本**: C# 5+
- **规律**: 异步操作须用 async/await，禁 .Result/.Wait() 死锁。
- **违反后果**: 线程死锁（CWE-833）。
- **验证方法**: `.Result` 或 `.Wait()` 命中 → warn。
- **对应门禁**: fw_dotnet_async(warn)

```verify
id: dotnet-r6
cmd: 
expect: always
```

### 规律：须用依赖注入
- **适用版本**: .NET Core+
- **规律**: 服务须通过 DI 注入，禁 new 直接实例化。
- **违反后果**: 耦合度高，难测试。
- **验证方法**: `new HttpClient()` 或 `new DbContext()` → warn。
- **对应门禁**: fw_dotnet_di(warn)

```verify
id: dotnet-r7
cmd: 
expect: always
```

### 规律：须用结构化日志
- **适用版本**: .NET Core+
- **规律**: 须用 ILogger 结构化日志，禁 Console.WriteLine 生产代码。
- **违反后果**: 日志不可检索（CWE-209）。
- **验证方法**: `Console.WriteLine` 命中 → warn。
- **对应门禁**: fw_dotnet_logging(warn)

```verify
id: dotnet-r8
cmd: 
expect: always
```

### 规律：须用 EF Core 迁移
- **适用版本**: EF Core
- **规律**: 数据库变更须用 EF Core Migrations，禁裸 SQL 迁移。
- **违反后果**: 迁移不可追溯。
- **验证方法**: `ExecuteSqlRaw` 含 `CREATE TABLE` → warn。
- **对应门禁**: fw_dotnet_ef_migration(warn)

```verify
id: dotnet-r9
cmd: 
expect: always
```

### 规律：须启用 nullable 引用类型
- **适用版本**: C# 8+
- **规律**: 须 `#nullable enable` 或 csproj `<Nullable>enable</Nullable>`。
- **违反后果**: 空指针异常（CWE-476）。
- **验证方法**: 无 `#nullable enable` 且 csproj 无 `<Nullable>enable</Nullable>` → warn。
- **对应门禁**: fw_dotnet_nullable(warn)

```verify
id: dotnet-r10
cmd: 
expect: always
```

## §4 门禁清单
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---|---|---|---|---|
| fw_dotnet_sql_injection | fail | ExecuteSqlRaw/CommandText 含拼接 → fail | DOTNET_GLOBS | CWE-89 |
| fw_dotnet_password_hash | fail | password 赋值无 Hash → fail | DOTNET_GLOBS | CWE-916 |
| fw_dotnet_cors | fail | AllowAnyOrigin+AllowCredentials → fail | DOTNET_GLOBS | CWE-942 |
| fw_dotnet_https | warn | 无 UseHttpsRedirection → warn | DOTNET_GLOBS | CWE-319 |
| fw_dotnet_auth | warn | HttpGet/Post 无 Authorize → warn | DOTNET_GLOBS | CWE-306 |
| fw_dotnet_async | warn | .Result/.Wait() → warn | DOTNET_GLOBS | CWE-833 |
| fw_dotnet_di | warn | new HttpClient()/DbContext() → warn | DOTNET_GLOBS | — |
| fw_dotnet_logging | warn | Console.WriteLine → warn | DOTNET_GLOBS | CWE-209 |
| fw_dotnet_ef_migration | warn | ExecuteSqlRaw CREATE TABLE → warn | DOTNET_GLOBS | — |
| fw_dotnet_nullable | warn | 无 #nullable enable → warn | DOTNET_GLOBS | CWE-476 |

## §5 跨框架交互规则
无已知强交互。

## §6 版本陷阱速查
| 版本 | 变化 | 影响 |
|---|---|---|
| .NET 6 | LTS 长期支持 | .NET 5 项目须升级 |
| C# 8 | nullable 引用类型 | 须显式 enable |
