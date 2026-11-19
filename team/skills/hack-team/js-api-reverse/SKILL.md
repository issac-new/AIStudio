---
name: js-api-reverse
description: "前端加密参数逆向 + API/GraphQL 专项测试。Use when 目标 Web 站点请求带 sign/token/时间戳等加密签名参数需要定位入口、还原算法、复现签名重放，或需要从前端 JS 穷举全量 API 路由做匿名可达性判定、IDOR/越权 A/B 差分、GraphQL 专项（introspection/深度查询/批量操作）。"
version: 1.0.0
author: "hack-exploit (fusion W2-A, 2026-11-02)"
license: "internal"
routing:
  phase: [enum, exploit]
  target_type: [web]
  technologies: [javascript, graphql, webpack]
  vuln_hints: [idor, auth-bypass]
  task_types: [exploit, audit]
is_broad_knowledge: false
aliases: [js-reverse, js加密参数, 签名逆向, sign参数, 前端加密, api-security, graphql-security, 路由穷举, 路由表穷举]
metadata:
  hermes:
    tags: [web, js-reverse, crypto-params, api-security, graphql, idor, anonymous-access, artex, wave2]
    source: "模式参考 S3 reverse-skill (github.com/zhaoxuya520/reverse-skill) skills/js-reverse + skills/api-security——按模式自写，禁 vendor 正文（FUSION-DOSSIER 2026-11-01 §五/§七）；ARTEX 三条来自同档案 §二.8"
    target_profile: hack-exploit
---

# js-api-reverse — 前端加密参数逆向 + API/GraphQL 专项

两场景一份技能：请求带签名参数看 §a，API 面授权与穷举看 §b。两条线共用同一套「抓全前端 JS → AST 解析 → 带登录态重放」底座。

## 何时用（触发条件）

- 请求里出现 `sign` / `token` / `signature` / `nonce` / `timestamp` 等参数，改动任何业务参数签名校验失败，无法直接重放或 fuzz。
- 需要目标全量 API 路由清单（前端只暴露一部分，目录爆破拿不到 SPA 内部接口）。
- 需要判定哪些接口匿名可达、哪些接口双账号 A/B 差分有越权（IDOR/BOLA）。
- 目标有 GraphQL 端点（`/graphql` `/gql` 或请求体 `{query: ...}`）。

## 0. 开工前置（两场景共用）

1. Scope 前置：目标必须在 scope.txt 授权范围内，实质请求前过 `scope-gate`（缺授权 → `kanban_block`，不测）。
2. 会话有效性探针：每轮开工先发 1 个已知需登录的轻量请求（如 `/api/user/profile`）。返回 401/302 登录跳转 → 凭证失效，先换凭证再干活（见 §c.3）。
3. 工作区按 `target-scoped-workspace` 规范：`reports/<TARGET_SLUG>/{findings,poc,evidence}/`。

## a. 前端加密参数逆向工作流（定位 → 补环境 → 还原 → 复现 → 重放）

### a.1 定位签名入口（三法，由轻到重）

**法一：抓包看参数形态**（先跑这个，5 分钟内定性）

```bash
T=https://target.example.com   # 授权范围内的目标
cd ~/.hermes/skills/hack-team/js-api-reverse
node scripts/capture_api.js "$T" --out /tmp/cap.jsonl --stay-ms 8000
```

`capture_api.js` 用 playwright 驱动系统 Chrome（`channel:'chrome'`），页面侧包 `fetch`/`XMLHttpRequest`/`sendBeacon`，在**请求构建时刻**取 `new Error().stack` —— 调用栈的 file:line 直接指向拼签名的函数，这是 jshook 类 MCP 的零依赖替代（本机无该 MCP，2026-11-02 实证）。

判读 `/tmp/cap.jsonl`：
- `req_body`/`hook_body` 里出现 sign、timestamp 成对 → 定性「时间戳+签名」。
- `hook_stack` 非空 → 拿到签名函数所在 JS 文件与行号，直接进 a.3。
- hook 拿不到栈（框架封装太深）→ 法二。

**法二：源码关键词搜索**

```bash
# JS chunk 全量拉取复用 wih-secret-hunter 的 4 级瀑布解析（HTML→Webpack/Vite/Next.js）
grep -lE 'sign|signature|nonce|encrypt|HmacSHA|createHash|CryptoJS' chunks/*.js | head
grep -oE '[?&](sign|signature|nonce|ts|timestamp)=' chunks/*.js | sort | uniq -c
```

搜到参数名后反向找赋值点：`sign:` `sign =` `params.sign`，顺调用链上溯到加密函数。

**法三：hook 断点（法一法二都不中时）**

在 `capture_api.js --extra-hook` 注入自定义 hook：包 `JSON.stringify`（加密前对象多经它）、`Object.defineProperty` 检测、或对目标函数注入 `debugger`。CDP 路线可用 `page.route` 改写 JS 响应体在签名函数入口插 `debugger;`，配 `Debugger.pause` 单步。

### a.2 补环境（浏览器环境模拟）

首选**免补环境**：直接在真实页面上下文里执行（不扣码）：

```js
// playwright evaluate：页面已过风控初始化，环境天然完整
const sign = await page.evaluate((params) => window.__signFn(params), testParams);
```

次选**扣码到 Node**（页面有反调试/频繁检测时）：把签名函数连同依赖拷出来本地跑，按报错逐项补环境。常见检测点清单：

| 检测点 | 补法 |
|---|---|
| `navigator.webdriver` | 定值 `false`（playwright 默认 `true`，扣码后无此问题） |
| `navigator.userAgent/plugins/languages` | 按抓包真实值设置 |
| `window.chrome` | 补空对象 + `runtime` 桩 |
| `document.referrer/cookie` | 按真实请求头值设置 |
| canvas/时区指纹 | 页内跑则天然一致；Node 侧优先找不依赖指纹的分支 |

webpack 打包站点：定位 `__webpack_require__` 入口，按模块号抽函数；chunk 拉取复用 `wih-secret-hunter`。

### a.3 还原算法

- 明文算法（md5/sha/hmac/aes/base64）：函数体可读 → 直接识别，Node `crypto` 复现。
- 自定义混淆：先探测 `//# sourceMappingURL`（生产环境偶发未删）；`eval`/`new Function` 动态代码 → hook 拿实参实码。
- AST 级改写用 acorn（本机 `~/.hermes/hermes-agent/node_modules` 实证在位；`acorn-walk` 缺失需手写 walker，参考 `scripts/extract_routes.js` 内置实现）。

### a.4 复现签名（对拍）

固定输入对拍线上输出：抓包拿一组真实 `(参数, sign)` 对，本地跑还原算法，输出逐字节一致才算还原成功。时间戳参数允许 ±窗口，其余参数必须完全一致。不一致 → 回 a.2 查环境差异（最常见的死因是字符集/键序/URL encode 差异）。

### a.5 请求重放验证

签名复现后，改一个业务参数（如金额、id）重算签名重放。重放请求与响应原始报文进 evidence，走 §d 证据锚定。重放成功 + 服务端接受了被改参数 = 签名保护被绕过，finding 成立。

### a.6 工具映射与降级链（本机实证 2026-11-02）

| 能力 | 首选 | 本机实况 | 降级路径（已验证） |
|---|---|---|---|
| 抓包/重放拦截 | mitmproxy / Reqable / Burp | 均缺 | `capture_api.js`（playwright+系统 Chrome，`channel:'chrome'`；默认 chromium 二进制未装，勿用 `chromium.launch()` 裸调） |
| JS hook/断点 | jshook 类 MCP | 未装 | `capture_api.js` hook + `Error().stack` 调用栈；`--extra-hook` 注自定义 hook |
| AST 解析 | acorn / @babel/parser | 在位（hermes-agent/node_modules） | 直接可用；`acorn-walk` 缺 → 手写 walker |
| 浏览器自动化 | playwright(python) | python 模块缺 | **Node playwright**（模块在位）；注意 `ctx.addInitScript` 必须先注册再 `newPage`，page 级对首个 setContent 文档不生效（本机踩坑实证） |
| JS chunk 拉取 | wih-secret-hunter | 在位 | `scripts/wih_engine.py` 4 级瀑布 |

## b. API/GraphQL 专项

### b.1 路由表穷举（AST 解析前端 JS 出全量路由+参数表）

```bash
cd ~/.hermes/skills/hack-team/js-api-reverse
node scripts/extract_routes.js ~/work/target/chunks/ --json routes.json
# stdout：files_scanned / parse_failures / routes=N / graphql_ops=M + 逐路由摘要
# routes.json：[{path, methods, params, data_keys, files}] + graphql 操作表
```

提取覆盖：`fetch`/`axios.*`/`$http`/`XMLHttpRequest.open` 调用点、路径形字符串字面量（`/api/`、`/v1/x/y`、REST 模板 `:id`）、GraphQL `query/mutation/subscription` 操作名（含模板串形态）、请求体键（`JSON.stringify` 内层对象与 `body/data` 属性）。压缩/JSX 文件解析失败会计入 `parse_failures` 披露，不静默丢。

产出三用：匿名可达性输入（b.2）、A/B 差分目标清单（b.3）、派单盲区对照（c.2）。

### b.2 匿名可达性判定

对 routes.json 全量路由发**无凭证**请求，按响应分类：

| 响应 | 判定 |
|---|---|
| 200 + 业务数据 | 匿名可达（未授权访问，直接 finding） |
| 200 + 空对象/默认值 | 疑似，比带凭证响应差异 |
| 401/403 | 鉴权在 |
| 302 → login | 鉴权在（重定向型） |
| 404 | 路由存在性存疑（前端遗留死代码） |

限速：串行 + 每请求间隔 ≥300ms，最小影响。

### b.3 IDOR/越权 A/B 差分（双账号同接口比响应）

双账号（同权限级 A、B）同接口对拍：A 创建资源 → B 用 A 的对象 ID 请求 → 响应内容/状态码与 A 自访一致 = 水平越权。垂直越权：低权账号带高权接口路由重放。

批量判定与会话级对象枚举特征分析**复用既有 `bola-session-detection`**（`scripts/bola_analyze.py`，会话特征基线替代不可靠的 IP 限速判定）。差分结果逐条记 `(endpoint, parameter, vuln_class)` 进 coverage（pentest-methodology-fusion 纪律）。

### b.4 GraphQL 专项（≥3 类测试点）

端点识别：routes.json 的 graphql_ops 非空，或抓包见 `{query: ...}` 请求体。五类专项：

1. **introspection 泄露**：`{__schema{types{name fields{name}}}}`。被禁时四条绕过：内联注释切片 `__schema{types{name}}__schema{types{fields{name}}}`、别名分片、关键词大小写/空白变形、`__type(name:"X")` 单类型枚举。
2. **深度嵌套/循环自引用**：`a{b{a{b{...}}}}` 深度 50+ 探 DoS 面（授权测试点到为止，一次即停，不做压力测试）。
3. **批量操作**：alias 复制同一 mutation 并发提交（竞态条件：余额/库存/投票类一次请求 N 份）；mutation 参数枚举（IDOR 面：改 `input:{id}`）。
4. **字段级授权差异**：同一对象敏感字段（email/phone/token）与普通字段分开请求，比授权差异——schema 级鉴权常漏字段级。
5. **盲测（introspection 关闭）**：报错信息差异、字段名 suggestion（GraphQL 会提示 `Did you mean ...`）逐字段还原 schema。

GraphQL 专项细节可加载 `cybersecurity/performing-graphql-security-assessment` 与 `hack-team/pentest-methodology-fusion`。

## c. ARTEX 实战三条（写卡与开工纪律，来源 FUSION-DOSSIER §二.8）

1. **凭证写 goal 不写 constraint**：派单/建卡时把凭证可用性写进目标（"用 A、B 双账号完成 X 接口 A/B 差分"），不要只写成约束。写 goal，规划器才会据此拆出差分子目标并扩面；写 constraint 只剩限制不开方向。
2. **路由清单进派单补盲区**：b.1 的 routes.json 与「已测路由」求差集，差集就是盲区清单，附进派单卡 body（`kanban_create`）——自动探测已覆盖大部分路由时，补的就是它没碰过的那部分。
3. **每轮开工先探会话有效性**：凭证过期即换，失效账号从派单剔除再开工。凭证注入是最易坏环节：站点结构改了注入函数没跟上 → 取空 → 整轮白跑。探针失败先修注入，不盲目重试。

## d. 红线声明

- **仅授权目标**：开工前过 `scope-gate`（scope.txt 契约）；无授权 → `kanban_block(kind="needs_input")`，不测。
- **最小影响**：能读不写，能验证不利用；DoS 类测试点（深度查询）一次即停。
- **证据锚定**：抓包/重放证据（capture_api.js 产出、原始请求响应报文）一律走 **`poc-evidence-snapshot`**（`scripts/ev_snapshot.py`，SHA-256 内容寻址快照）锚定后进 finding，`ev_verify.py --all` 对账；无锚定的截图/复制粘贴不算证据。
- **凭据脱敏**：报告与 kanban 字段不留明文凭证/签名密钥；token 类只留前后 4 位。

## 与既有技能的分工

| 场景 | 用谁 |
|---|---|
| JS chunk 拉取/敏感信息提取 | `wih-secret-hunter` |
| 越权判定基线/对象枚举特征 | `bola-session-detection` |
| 证据 SHA-256 锚定 | `poc-evidence-snapshot` |
| 通用 web 漏洞 playbook/coverage | `pentest-methodology-fusion` |
| SQL 注入利用（API 参数发现后） | `hack-team/redteam-sqli` |
| 逆向成果先搜再做 | `reverse-ecosystem-index` |

## 验收命令（copy-paste，实跑 exit=0）

```bash
cd ~/.hermes/skills/hack-team/js-api-reverse
node scripts/extract_routes.js --selftest   # 末行 SELFTEST PASS extract_routes.js（零网络，内嵌 fixture：7 路由+2 GraphQL 操作+body 键断言）
node scripts/capture_api.js --selftest      # 末行 SELFTEST PASS capture_api.js（零网络，page.route 本地回环：请求+hook 调用栈+sign 键断言）
grep -c 'A/B 差分' SKILL.md                 # ≥1
grep -c 'bola-session-detection' SKILL.md   # ≥1
grep -c 'poc-evidence-snapshot' SKILL.md    # ≥1
```

2026-11-02 本机实跑：两条 SELFTEST PASS 均 exit=0；三个 grep 均 ≥1。

## 维护信息

- 来源：S3 reverse-skill（github.com/zhaoxuya520/reverse-skill）`skills/js-reverse` + `skills/api-security` 模式参考，按模式自写禁 vendor 正文；ARTEX 三条来自 `~/.hermes/shared/research/hack-teams-fusion-20261101/FUSION-DOSSIER.md` §二.8。
- 工具实况标注日期 2026-11-02；工具变动（装/卸 mitmproxy、chromium、python playwright）时更新 §a.6 表。
- 踩坑记录（本机实证，改脚本前先读）：① playwright 默认 chromium 二进制未装，必须 `channel:'chrome'`；② `ctx.addInitScript` 必须先注册后 `newPage`；③ `setContent` 的 about:blank 基址解析不了相对 URL，自测用绝对 URL + `page.route` 本地拦截。
