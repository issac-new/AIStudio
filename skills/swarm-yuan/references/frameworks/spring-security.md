---
ruleset_id: spring-security
适用版本: Spring Security 6.4.x–7.1.x（7.x 差异单独标注；5.x WebSecurityConfigurerAdapter 体系已移除，仅存于遗留项目）
最后调研: 2026-07-17（来源：https://spring.io/projects/spring-security ；https://docs.spring.io/spring-security/reference/servlet/configuration/java.html ；https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html ；https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html ；https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html ；https://docs.spring.io/spring-security/reference/servlet/authentication/rememberme.html ；https://docs.spring.io/spring-security/reference/servlet/oauth2/login/core.html ）
深度门槛: 12
---

# Spring Security 规则集

<!--
本规则集覆盖 Spring Security 6.4.x（Boot 3.4 体系）与 7.x（Boot 4.0 体系，现行 7.1.x，2026-07 调研）。
核心范式转移：6.x 起 WebSecurityConfigurerAdapter 移除，安全配置一律 SecurityFilterChain Bean + lambda DSL；
7.x 起 authorizeRequests/antMatchers 等旧 API 彻底移除，统一 authorizeHttpRequests/requestMatchers。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.security:spring-security-core` / `spring-security-web` / `spring-security-config` / `org.springframework.boot:spring-boot-starter-security` / `spring-security-oauth2-client` / `spring-security-oauth2-resource-server` | 高 |
| 注解 | `@EnableWebSecurity` / `@EnableMethodSecurity` / `@EnableGlobalMethodSecurity`（遗留） / `@PreAuthorize` / `@PostAuthorize` / `@Secured` / `@RolesAllowed` | 高 |
| 配置 | `spring.security.*` / `security.jwt.*` / `jjwt.secret` / `spring.security.oauth2.client.registration.*` | 高 |
| 代码 | `SecurityFilterChain` / `WebSecurityConfigurerAdapter` / `PasswordEncoder` / `UserDetailsService` / `OncePerRequestFilter` / `JwtAuthenticationToken` | 高 |
| 文件 | `**/SecurityConfig*.java` / `**/*SecurityConfiguration.java` | 中（需组合依赖信号） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 spring-security 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- SecurityFilterChain Bean：`grep -rnE 'SecurityFilterChain' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：声明 SecurityFilterChain 的方法数）
- PasswordEncoder Bean：`grep -rnE 'PasswordEncoder' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 PasswordEncoder 的 .java 文件数）
- 方法级安全注解：`grep -rlE '@(PreAuthorize|PostAuthorize|Secured|RolesAllowed)\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：文件数）
- UserDetailsService 实现：`grep -rlE 'implements UserDetailsService|UserDetailsService' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：文件数）
- JWT 相关代码：`grep -rnE 'Jwts\.|JwtDecoder|NimbusJwtDecoder|signWith\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- OAuth2 client 注册：`grep -rnE 'spring\.security\.oauth2\.client|redirect-uri' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties'`
- 遗留适配器：`grep -rnE 'extends WebSecurityConfigurerAdapter' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数，6.x+ 必须为 0）

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：WebSecurityConfigurerAdapter 已废弃移除，须用 SecurityFilterChain Bean + lambda DSL
- **适用版本**: Spring Security 6.x 移除 / 7.x 终态（5.7 起 @Deprecated）
- **规律**: `extends WebSecurityConfigurerAdapter` 在 6.x 起编译即不存在。安全配置须改为 `@Bean SecurityFilterChain filterChain(HttpSecurity http)`，所有 `authorizeHttpRequests/csrf/cors/sessionManagement` 等配置走 lambda DSL（`Customizer.withDefaults()` 或 `x -> x...`），认证配置从 `configure(AuthenticationManagerBuilder)` 迁移为 `AuthenticationManager` Bean。
- **违反后果**: 升级到 6.x/7.x 编译失败 `cannot find symbol WebSecurityConfigurerAdapter`；遗留 5.x 项目停留在 EOL 版本无安全补丁。
- **验证方法**: `grep -rnE 'extends WebSecurityConfigurerAdapter' *.java`，命中即 fail。
- **对应门禁**: fw_ssec_adapter(fail)

```verify
id: spring-security-r1
cmd: grep -rnE 'extends WebSecurityConfigurerAdapter' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：PasswordEncoder 禁用 NoOp/MD5/SHA1 等弱哈希，须 BCrypt/Argon2
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: 官方 password-storage 文档明确 `NoOpPasswordEncoder`、`Md5PasswordEncoder`、`MessageDigestPasswordEncoder`、`StandardPasswordEncoder`（SHA-256 迭代 256 次仍不足）均"not secure / only for legacy / testing"。生产须 `BCryptPasswordEncoder`（默认强度 10）或 `Argon2PasswordEncoder`，多算法并存迁移期用 `DelegatingPasswordEncoder`。
- **违反后果**: 口令库泄露即被彩虹表/GPU 秒破（CWE-327 弱哈希、CWE-759 无盐哈希）。
- **验证方法**: `grep -rnE 'NoOpPasswordEncoder|Md5PasswordEncoder|MessageDigestPasswordEncoder|StandardPasswordEncoder|SHAPasswordEncoder|LdapShaPasswordEncoder' *.java`，命中即 fail。
- **对应门禁**: fw_ssec_password_encoder(fail)

```verify
id: spring-security-r2
cmd: grep -rnE 'NoOpPasswordEncoder|Md5PasswordEncoder|MessageDigestPasswordEncoder|StandardPasswordEncoder|SHAPasswordEncoder|LdapShaPasswordEncoder' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：密码禁止明文存储/明文写入 UserDetails
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: 内存用户 `User.withUsername("u").password("明文")` 或代码中 `setPassword("明文")` 未过 encoder，等同于明文存储。须 `password(encoder.encode(raw))`，或内存 demo 场景用 `{noop}明文` 显式声明（仅测试）。DB 存储的口令列绝不允许明文。
- **违反后果**: 内存/B 数据库被读即口令全泄露（CWE-256 明文存储、CWE-312）。
- **验证方法**: `grep -rnE '\.password\("[^"{]' *.java`（password 参数为无前缀字面量），命中即 fail。
- **对应门禁**: fw_ssec_plaintext_password(fail)

```verify
id: spring-security-r3
cmd: grep -rnE '\.password\("[^"{]' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：User.withDefaultPasswordEncoder 仅限 demo，禁止进生产
- **适用版本**: Spring Security 5.x–7.x 全版本（官方 javadoc 标注 "only intended for demos"）
- **规律**: `User.withDefaultPasswordEncoder()` 内部等价明文+弱编码，官方 javadoc 明示 "not considered secure for production"。任何生产代码不得出现；demo 代码也建议改为 `User.builder().password(encoder.encode(...))`。
- **违反后果**: 示例代码被复制进生产 → 口令弱保护泄露。
- **验证方法**: `grep -rnE 'withDefaultPasswordEncoder' *.java`，命中即 fail。
- **对应门禁**: fw_ssec_default_password_encoder(fail)

```verify
id: spring-security-r4
cmd: grep -rnE 'withDefaultPasswordEncoder' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：JWT 验签密钥禁止硬编码，须外部化 + 支持轮换
- **适用版本**: Spring Security 6.x–7.x + jjwt 0.11/0.12 / Nimbus JOSE JWT
- **规律**: `signWith("硬编码字符串")`、`Keys.hmacShaKeyFor("字面量".getBytes())`、`NimbusJwtDecoder.withSecretKey(硬编码)`、yml 中 `jwt.secret: 长字面量` 均属密钥硬编码。密钥须从环境变量/KMS/Vault 注入（`${JWT_SECRET}`），HS256 密钥 ≥ 256bit；支持密钥轮换（kid 头 + 多密钥 Resolver）。硬编码密钥进 git 即永久泄露。
- **违反后果**: 密钥随源码泄露 → 任意伪造 token（CWE-321 硬编码密钥、CWE-798）。
- **验证方法**: `grep -rnE 'signWith\("|hmacShaKeyFor\("[^"]+"\.getBytes' *.java` 命中即 fail；yml/properties 中 `secret[:=] 长字面量`（不含 `${`）命中即 fail。
- **对应门禁**: fw_ssec_jwt_secret(fail)

```verify
id: spring-security-r5
cmd: grep -rnE 'signWith\("|hmacShaKeyFor\("[^"]+"\.getBytes' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：CSRF 仅对无状态 REST API 可关，表单/浏览器会话必须开
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: `csrf(AbstractHttpConfigurer::disable)` 仅当 (a) 纯无状态 REST（`SessionCreationPolicy.STATELESS`）且 (b) 认证走 Bearer token 而非 Cookie 时才可关闭。浏览器表单会话、remember-me、OAuth2 login 场景关闭 CSRF = 敞开跨站请求伪造。6.x 起默认 CSRF token 存 `HttpSessionCsrfTokenRepository`，SPA 须用 `CookieCsrfTokenRepository`。
- **违反后果**: 浏览器会话应用关 CSRF → CSRF 攻击（CWE-352）。
- **验证方法**: `grep -rnE 'csrf\(.*disable|AbstractHttpConfigurer::disable|\.csrf\(\)\.disable' *.java`，命中即 warn（人工确认无状态 REST + 非 Cookie 认证）。
- **对应门禁**: fw_ssec_csrf(warn)

```verify
id: spring-security-r6
cmd: grep -rnE 'csrf\(.*disable|AbstractHttpConfigurer::disable|\.csrf\(\)\.disable' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@PreAuthorize SpEL 禁止字符串拼接，防 SpEL 注入
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: `@PreAuthorize("hasRole('" + role + "')")` 把运行时字符串拼进 SpEL 表达式，等价 OGNL/SpEL 注入面。动态权限须用 `#param` 变量引用（`@PreAuthorize("hasRole(#role)")` 配合 `@P`/参数名）或自定义 `PermissionEvaluator`，绝不拼接。
- **违反后果**: SpEL 注入 → 表达式任意执行/越权（CWE-943）。
- **验证方法**: `grep -rnE '@(PreAuthorize|PostAuthorize)\([^)]*"' *.java | grep '\+'`，命中即 warn（提示改 #param）。
- **对应门禁**: fw_ssec_preauthorize_concat(warn)

```verify
id: spring-security-r7
cmd: grep -rnE '@(PreAuthorize|PostAuthorize)\([^)]*"' --include='*.java' "${PROJECT_DIR}" | grep '\+'
expect: hits>0
```

### 规律：CORS 通配源与 allowCredentials(true) 互斥，二者同现即漏洞
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: `allowedOrigins("*")`（或 `allowedOriginPatterns("*")`）+ `allowCredentials(true)` 同现：浏览器规范禁止 `Access-Control-Allow-Origin: *` 携带凭据；部分历史版本 `allowedOriginPatterns` 宽松匹配会被绕过。跨域带凭据必须枚举精确源。
- **违反后果**: CORS 配置被绕过 → 跨站读取敏感响应（CWE-942 过宽 CORS）。
- **验证方法**: 同一 .java 文件同时命中 `allowedOrigin(s|Patterns)\("\*"` 与 `allowCredentials(true)` → warn。
- **对应门禁**: fw_ssec_cors_wildcard_creds(warn)

```verify
id: spring-security-r8
cmd: 
expect: always
```

### 规律：CORS 配置须在 Security 过滤链上显式启用，顺序先于认证过滤器
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: 只声明 `CorsConfigurationSource` Bean 而未在 `SecurityFilterChain` 上调 `.cors(...)`，CORS 预检请求会被认证过滤器拦截返回 401（浏览器预检不带凭据）。Spring Security 的 `CorsFilter` 必须位于认证过滤器之前；自定义 `FilterRegistrationBean<CorsFilter>` 与 Security 链并存时须设 `Ordered.HIGHEST_PRECEDENCE`，否则双过滤器顺序错乱。
- **违反后果**: 预检 OPTIONS 401 → 前端跨域全挂；或双 CORS 头冲突。
- **验证方法**: 项目检出 `CorsConfigurationSource` 但全部 SecurityFilterChain 文件无 `\.cors\(` → warn。
- **对应门禁**: fw_ssec_cors_config(warn)

```verify
id: spring-security-r9
cmd: 
expect: always
```

### 规律：hasRole 自动补 ROLE_ 前缀，禁写 hasRole("ROLE_X")
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: `hasRole("ADMIN")` 内部拼接为 `ROLE_ADMIN` 再比对；写 `hasRole("ROLE_ADMIN")` 实际校验 `ROLE_ROLE_ADMIN`，永远 false → 接口静默全拒。`hasAuthority("ROLE_ADMIN")` 才是字面量比对。角色授权二选一：`hasRole("短名")` 或 `hasAuthority("完整名")`。
- **违反后果**: 授权规则静默失效（全拒或配合错误配置全放）。
- **验证方法**: `grep -rnE 'has(Role|AnyRole)\("ROLE_' *.java`，命中即 warn。
- **对应门禁**: fw_ssec_role_prefix(warn)

```verify
id: spring-security-r10
cmd: grep -rnE 'has(Role|AnyRole)\("ROLE_' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@PreAuthorize 须 @EnableMethodSecurity 激活，否则注解静默失效
- **适用版本**: Spring Security 6.x–7.x（6.x 起 @EnableGlobalMethodSecurity 废弃，改 @EnableMethodSecurity）
- **规律**: `@PreAuthorize` 由 AOP 代理执行，无 `@EnableMethodSecurity`（6.x+）或 `@EnableGlobalMethodSecurity(prePostEnabled=true)`（5.x 遗留）时注解完全不被处理——接口裸奔无鉴权。7.x 中 @EnableGlobalMethodSecurity 已移除。
- **违反后果**: 方法级鉴权静默缺失 → 越权访问（CWE-862 缺失授权）。
- **验证方法**: 项目检出 `@PreAuthorize` 但无 `@EnableMethodSecurity` 且无 `@EnableGlobalMethodSecurity` → warn。
- **对应门禁**: fw_ssec_method_security(warn)

```verify
id: spring-security-r11
cmd: 
expect: always
```

### 规律：会话固定防护禁止关闭（sessionFixation none 禁）
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: 默认 `sessionFixation(sf -> sf.migrateSession())`：认证成功后换发新 session id 并迁移属性，防会话固定攻击。显式 `none()` 关闭后，攻击者可预设 session id 诱导受害者登录后接管会话。仅特殊场景（如无 session 的纯 API）才考虑，且应直接 STATELESS。
- **违反后果**: 会话固定攻击（CWE-384）。
- **验证方法**: `grep -rnE 'sessionFixation' *.java` 命中行同现 `none` → warn。
- **对应门禁**: fw_ssec_session_fixation(warn)

```verify
id: spring-security-r12
cmd: grep -rnE 'sessionFixation' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：remember-me 必须显式 key 且按密钥管理，禁硬编码
- **适用版本**: Spring Security 6.x–7.x 全版本
- **规律**: `rememberMe(r -> r.key("..."))` 的 key 参与 remember-me cookie HMAC 签名。不显式设置时每次启动随机生成（重启即全部 cookie 失效，多实例部署互相不认）；硬编码进源码则泄露即可伪造任意用户 remember-me cookie。key 须外部化（`${REMEMBER_ME_KEY}`）且按密钥轮换管理；生产建议 `PersistentTokenRepository` 方案。
- **违反后果**: key 泄露 → 伪造登录态 cookie（CWE-321）；不配 key → 重启/多实例会话失效。
- **验证方法**: `grep -rlE '\.rememberMe\(|rememberMe\(' *.java` 的文件内无 `.key\(` → warn；`key\("硬编码"` 字面量由 fw_ssec_jwt_secret 同类规则覆盖。
- **对应门禁**: fw_ssec_remember_me_key(warn)

```verify
id: spring-security-r13
cmd: grep -rlE '\.rememberMe\(|rememberMe\(' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：OAuth2 redirect_uri 禁止通配，须精确匹配
- **适用版本**: Spring Security 6.x–7.x OAuth2 Client
- **规律**: `spring.security.oauth2.client.registration.*.redirect-uri` 默认模板 `{baseUrl}/login/oauth2/code/{registrationId}` 即精确匹配。自定义 redirect-uri 带 `*` 通配或与授权服务器登记不一致，会导致授权码被重定向到攻击者域名（open redirect 链）。授权服务器侧登记的 redirect_uri 必须与客户端配置完全一致。
- **违反后果**: 授权码泄露 → 账户接管（CWE-601 open redirect）。
- **验证方法**: `grep -rnE 'redirect-uri.*\*' *.yml *.yaml *.properties`，命中即 warn。
- **对应门禁**: fw_ssec_oauth2_redirect(warn)

```verify
id: spring-security-r14
cmd: grep -rnE 'redirect-uri.*\*' --include='*.yml' --include='*.yaml' --include='*.properties' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：antMatchers/authorizeRequests 已移除，迁 requestMatchers/authorizeHttpRequests
- **适用版本**: Spring Security 6.x 废弃 / 7.x 移除
- **规律**: 6.x 起 `antMatchers/mvcMatchers/regexMatchers` 废弃、7.x 移除，统一 `requestMatchers(...)`（内部按 DispatcherServlet 路径匹配，避免路径匹配歧义）；`authorizeRequests()` 旧链式 API 由 `authorizeHttpRequests(auth -> auth...)` lambda DSL 取代。旧 API 在 7.x 编译失败。
- **违反后果**: 升级 7.x 编译失败；antMatchers 路径匹配歧义曾致授权绕过 CVE。
- **验证方法**: `grep -rnE 'antMatchers\(|\.authorizeRequests\(' *.java`，命中即 warn。
- **对应门禁**: fw_ssec_deprecated_api(warn)

```verify
id: spring-security-r15
cmd: grep -rnE 'antMatchers\(|\.authorizeRequests\(' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

<!--
共 15 条规律（≥12 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_ssec_adapter | fail | `extends WebSecurityConfigurerAdapter` 命中即 fail（6.x+ 已移除）(n/a) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_password_encoder | fail | NoOp/Md5/MessageDigest/Standard/SHA/LdapSha PasswordEncoder 命中即 fail (CWE-327) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_plaintext_password | fail | `.password("字面量")`（无 { 前缀）命中即 fail 明文存储 (CWE-256) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_default_password_encoder | fail | `withDefaultPasswordEncoder` 命中即 fail（官方标注仅 demo）(CWE-327) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_jwt_secret | fail | `signWith("字面量")`/`hmacShaKeyFor("字面量".getBytes` 或 yml `secret: 长字面量`（无 ${）命中即 fail (CWE-321) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_csrf | warn | `csrf(...disable)` 命中 → warn 人工确认无状态 REST + 非 Cookie 认证 (CWE-352) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_preauthorize_concat | warn | @PreAuthorize/@PostAuthorize 表达式含 `+` 拼接 → warn SpEL 注入面 (CWE-943) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_cors_wildcard_creds | warn | 同文件 `allowedOrigin(s\|Patterns)("*")` + `allowCredentials(true)` → warn (CWE-942) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_cors_config | warn | 检出 CorsConfigurationSource 但无 `.cors(` → warn 过滤链顺序 (CWE-942) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_role_prefix | warn | `hasRole("ROLE_`/`hasAnyRole("ROLE_` 命中 → warn 双前缀 (n/a) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_method_security | warn | 有 @PreAuthorize 但无 @EnableMethodSecurity/@EnableGlobalMethodSecurity → warn (CWE-862) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_session_fixation | warn | `sessionFixation` + `none` 同现 → warn 会话固定防护被关 (CWE-384) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_remember_me_key | warn | 文件含 rememberMe( 但无 .key( → warn 随机 key/多实例失效 (CWE-321) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_oauth2_redirect | warn | yml `redirect-uri` 含 `*` → warn 通配开放重定向 (CWE-601) | SPRINGSEC_SRC_GLOBS |
| fw_ssec_deprecated_api | warn | `antMatchers(`/`.authorizeRequests(` 命中 → warn 7.x 已移除 (n/a) | SPRINGSEC_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_ssec_<rule>（rule 全小写下划线）。
本表 15 条 id 须在 assets/framework-gates/spring-security.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_ssec_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: spring-security  requires_conf: SPRINGSEC_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 extends WebSecurityConfigurerAdapter + NoOpPasswordEncoder + .password("明文") → adapter/password_encoder/plaintext_password fail 主触发；compliant 用 SecurityFilterChain lambda + BCryptPasswordEncoder 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| spring-security × spring-cloud | Gateway/Feign 服务间调用须传递认证 token（`RelayTokenFilter`/`OAuth2AuthorizedClientManager`），内部端点 SecurityFilterChain 显式放行或内网隔离 | 否则服务间调用 401 连环失败；内部端点误暴露公网则越权 |
| spring-security × spring-data-jpa | 审计字段（@CreatedBy）须从 SecurityContextHolder 取当前用户实现 `AuditorAware`；方法级 @PreAuthorize 与 Repository 层 @Query 的 `?#{principal.x}` SpEL 二选一不叠加 | 双重鉴权逻辑漂移易留绕过面；AuditorAware 取错上下文导致审计字段为空/串号 |
| spring-security × mapstruct | UserDetails/Principal 实体转 DTO 时必须 `unmappedTargetPolicy=ERROR` + 显式 ignore 敏感字段（password/authorities） | 默认 IGNORE 策略下改名静默漏映射，敏感字段反向泄露（CWE-200） |
| spring-security × lombok | 自定义 UserDetails 用 @Data 时 toString 排除 password 字段（`@ToString(exclude="password")`） | 日志误打印实体 → 口令哈希/明文入日志（CWE-532） |

<!--
无强交互的框架组合省略；本表聚焦 spring-security 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Spring Security 5.7 | WebSecurityConfigurerAdapter @Deprecated；引入 SecurityFilterChain Bean 范式 | 5.7–5.8 为迁移窗口，并存两种写法 |
| Spring Security 6.0 | 移除 WebSecurityConfigurerAdapter；lambda DSL 强制；antMatchers 废弃；`@EnableMethodSecurity` 取代 `@EnableGlobalMethodSecurity`；默认 AuthorizationManager 取代 AccessDecisionManager | 5.x 配置全部须重写；authorizeRequests 改 authorizeHttpRequests |
| Spring Security 6.1 | 所有 DSL `and()` 链式方法废弃（lambda DSL 终态）；`requestMatchers` 默认用 PathPatternRequestMatcher | 混用 `.and()` 编译告警；路径匹配语义收紧 |
| Spring Security 6.3 | `Password4j` 支持可选；`CompromisedPasswordChecker` 正式化 | 弱口令检查可声明式接入 |
| Spring Security 6.4 | Kotlin DSL 与 Java DSL 对齐；Passkeys/WebAuthn 支持 | 旧 Kotlin 扩展函数签名微调 |
| Spring Security 7.0 | 移除全部 6.x 废弃 API（antMatchers/authorizeRequests/@EnableGlobalMethodSecurity）；jakarta 终态；`@AuthorizationManagerArgumentResolver` 等元注解重构（待验证：7.0 具体移除清单以官方 migration guide 为准） | 6.x 已告警代码在 7.x 直接编译失败；迁移前须先清零 6.x deprecation |
| Spring Security 7.1 | 现行版本（2026-07 调研时 spring.io 首页展示 7.1.0）；具体变更点待验证（未逐条核对 release notes） | 待验证：规律按 6.x→7.x 通用迁移面陈述，7.1 特有变更须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
