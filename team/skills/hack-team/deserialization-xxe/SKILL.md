---
name: deserialization-xxe
description: "反序列化与解析器漏洞专项 — Java/PHP/Python/.NET 反序列化RCE链、XXE、原型污染、ysoserial/phpggc 利用链构造与验证。当发现XML导入/SOAP/Office解析、序列化数据入口(Java readObject/PHP unserialize/Python pickle/.NET BinaryFormatter)、JSON深合并、yaml.load、不可信反序列化入口、React Server Components flight 流响应消费端（CVE-2026-126187）时调用。"
version: 1.1.0
author: Hermes Agent (ported from zhaji2333/CkSKILLS)
license: MIT
metadata:
  hermes:
    tags: [hack-team, deserialization, xxe, prototype-pollution, gadget-chain, ysoserial, phpggc, rce, web]
    related_skills: [security-auditor, exploit-payload-escalation, file-handling, redteam-ssrf, supply-chain-security, scope-gate, poc-evidence-snapshot, fp-check]
    source: "github.com/zhaji2333/CkSKILLS (.agents/skills/deserialization-xxe/SKILL.md, 100 行, MIT)"
    fused: "2026-11-09 CK-Fusion T4"
routing:
  phase: [exploit]
  target_type: [web, api]
  technologies: [java, php, python, dotnet, nodejs, react-rsc, xml]
  vuln_hints: [deser, xxe, rce, prototype-pollution, gadget-chain, oob, rsc-flight]
  task_types: [deserialization, xxe, prototype-pollution, parser-exploit]
---

# deserialization-xxe — 反序列化与解析器漏洞专项深度挖掘

> 来源：CK-Skills `deserialization-xxe`（github.com/zhaji2333/CkSKILLS，MIT，`.agents/skills/deserialization-xxe/SKILL.md` 100 行），
> 2026-11-09 CK-Fusion T4 全文亲读搬运；工具项按本机 2026-11-09 实测状态标注，CK 源互链已按融合报告 §五改写为本机技能名。
> **仅限已授权目标：动手前 scope.txt 已固化并过 `scope-gate`；RCE 类验证以最小化回显为准。**

## 何时调用（触发条件）

- XML 导入/上传、SOAP 接口、Office/Excel 解析
- 序列化数据入口（Java readObject、PHP unserialize、Python pickle、.NET BinaryFormatter）
- JSON 深合并/深拷贝（Node.js 原型污染）
- yaml.load 未指定安全 Loader
- 代码审计发现危险函数（见 `security-auditor`；文件入口类功能先过 `file-handling` 场景表）

## 一、漏洞类型全景

| 类型 | 语言/场景 | 修复 |
|---|---|---|
| H1. 反序列化 | Java/PHP/Python/.NET | 禁用危险反序列化、白名单 |
| H2. XXE | XML导入、SOAP、Office解析 | 禁用外部实体 |
| H3. 原型污染 | Node.js对象合并 | 过滤危险键 |
| H4. RSC flight 流反序列化 | React Server Components 响应消费端（Next.js 等，CVE-2026-126187） | 升级 react-server-dom-* 至修复版；不接受不可信源 RSC 响应 |

## 二、反序列化专项

### 各语言危险入口

```
Java:   readObject / XMLDecoder / JNDI lookup / JdbcRowSetImpl / TemplatesImpl
PHP:    unserialize / phar反序列化
Python: pickle.loads / yaml.load(Loader=Loader)
.NET:   BinaryFormatter / XMLSerializer
JS/RSC: react-server-dom-* flight 流按行解析（$F 服务器引用行 / FormData 流字段 1_p_S<id>）
```

### 利用工具（本机状态 2026-11-09）

| 语言 | 工具 | 本机状态 |
|---|---|---|
| Java | ysoserial / marshalsec（RMI/LDAP 起服务） | 未装；java ✅ 已装。需生成 payload 时经用户授权后从官方 GitHub release 拉取，禁第三方转投渠道 |
| PHP | phpggc | 未装；同上，授权后官方仓库拉取 |
| Python | pickle 手工构造 | python3 ✅ 本机即可构造（见下） |

Python pickle 本机构造模板（仅授权靶场）：

```python
import pickle, base64, subprocess
class P:
    def __reduce__(self):
        return (subprocess.check_output, (['id'],))
print(base64.b64encode(pickle.dumps(P())).decode())  # 喂给可控的 pickle.loads 入口
```

### 利用链思路

- Java：Gadget 链（CommonsCollections、CommonsBeanutils 等）→ RMI/LDAP 打 JNDI（JNDI 外连打内网 → 联动 `redteam-ssrf`）
- PHP：POP 链（Laravel/ThinkPHP/Yii 框架 gadget）+ phar 协议触发
- Python：pickle 反序列化执行命令
- 入口识别：base64/hex 编码的序列化流、`rO0AB`（Java）、`a:{}`（PHP）、`O:8:`（PHP对象）、flight 行 `$` 前缀 + `self.__next_f.push`（RSC）

### React Server Components flight 流反序列化专项（v1.1.0 新增）

> 锚点：GHSA-xqc2-xf4c-x3h3 / CVE-2026-126187（React 官方公告 2026-10-14，Critical，CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N 9.5）。
> 证据：gap-20261110-002 npm registry 真实包 react-server-dom-webpack 19.2.8↔19.2.9 补丁差分（卡 evidence/client.diff）。

**漏洞类目**：flight 流按行反序列化时，`$F` 服务器引用的 `metaData.id/bound` 未验型 + `then` 键可注入 thenable + `response` 对象（含 requireModule/模块表闭包=代码执行能力）以 `chunk.reason` 明文挂载可被构造数据触达 → 不可信 RSC 响应可在消费端 RCE。补丁同时落在 client.*/server.* 双端（npm 包文件级 diff 实测），消费端=浏览器或 server-to-server RSC 消费方（后者部署形态为推断，官方未明示）。

**版本对照**（webpack/parcel/turbopack 三包同矩阵）：受影响 19.0.0–19.0.8 / 19.1.0–19.1.9 / 19.2.0–19.2.8 / 19.3.0；修复 19.0.9 / 19.1.10 / 19.2.9 / 19.3.1。公告正文 "19.0.09" 为笔误，npm registry 实发 19.0.9（实测）。

**修复三簇**（19.2.9 diff 逐 hunk 实测）：
1. `loadServerReference` 验型守卫：`"then"===key→null`、`"string"!==typeof id→null`、`bound.value` 必须 `isArrayImpl` 才 `bind.apply` —— 堵类型混淆 + thenable 注入；
2. `RESPONSE_SYMBOL=Symbol()`：`response` 改挂不可猜 Symbol 键 —— 堵 response 对象（模块加载闭包）泄露；
3. FormData 流字段名 `formFieldPrefix+streamId` → `formFieldPrefix+"S"+streamId` —— 堵多 typed array/Blob 字段名碰撞致行解析错位，对应官方触发条件「响应含多个类型化数组且存在攻击者可控值」。

**识别入口（探测锚点）**：
- 响应体 `self.__next_f.push([1,"..."])`（Next.js App Router HTML 内嵌 flight 行）
- 请求 `?_rsc=<hash>` / 头 `RSC: 1` / `Next-Router-State-Tree`（RSC 数据请求协商）
- 响应 `Content-Type: text/x-component`；FormData 流字段 `1_p_S<id>`（修复后）/ `1_p<id>`（修复前=漏洞版本指纹）
- `package-lock.json`/`node_modules` 中 `react-server-dom-webpack|parcel|turbopack` 版本 ∈ 受影响矩阵

**审计/验证路径**（联动 `pentest-methodology-fusion` §12.4 可达性三步）：
1. 版本命中：lock 文件比对矩阵（仅候选）；
2. 调用点可达：应用含 server 组件且框架/打包器支持 RSC（Next.js App Router/Waku/自研 flight 消费端）；
3. 入参可控：RSC 响应体是否受攻击者影响——缓存投毒 / 反代响应体可控 / server-to-server 拉取不可信上游 / 用户数据混入 flight 行；且需多 typed array（二进制/流式）在场才满足 AT:P 触发条件（官方定性「极罕见模式」）。
- 动态验证仅限授权靶场：构造多 typed array + 可控行的 flight 响应喂消费端，最小化回显证明（红线 2）。

**误报边界**（官方原文）：不含服务端 React 代码的应用不受影响；未使用支持 RSC 的框架/打包器/插件的应用不受影响。纯 SPA/CSR React 不在射程；版本命中但响应体不可控=不可达，按 §12.4 只记存疑。

## 三、XXE 专项

### 基础 Payload

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<foo>&xxe;</foo>
```

### 进阶利用

- 无回显：外部 DTD + 带外（OOB）读取文件
- SSRF：`SYSTEM "http://169.254.169.254/latest/meta-data/"`（云元数据链转 `redteam-ssrf`）
- 文件读取：`file:///etc/passwd`、`php://filter/read=convert.base64-encode/resource=config.php`
- 协议：http/ftp/gopher
- Office 文档 XXE：docx/xlsx 内 XML 注入外部实体（入口发现转 `file-handling` §五）

### 触发场景

- XML/Excel/CSV 导入
- SOAP 接口
- 文档预览/转换
- SVG 上传（图片上传点也测 XXE）

> XXE payload 被拦时按 `exploit-payload-escalation` L0-L7 升级（编码/变形/协议/换入口）；
> OOB 回连端点只能用自有或授权回调域名/服务，禁向公共 DNSLog 类第三方提交目标数据。

## 四、原型污染专项（Node.js）

```
__proto__ / constructor.prototype / constructor.prototype.__proto__
```

### 触发场景

- JSON.parse 后深合并（lodash.merge、Object.assign 递归合并）
- 配置合并、查询参数合并

### 利用思路

- 污染 `__proto__.isAdmin=true` / `__proto__.shell=...`
- 污染 `__proto__.env`（pug/ejs 模板引擎 RCE）
- 污染 `Object.prototype` 影响全局校验逻辑

## 五、验证要点

- 反序列化：先确认可控输入点与编码方式，再选 gadget 链验证 RCE
- XXE：先测回显（文件读取），无回显用 OOB（授权回调端点）验证
- 原型污染：控制台/接口验证 `Object.prototype` 被污染
- 每个 payload 至少尝试到 Level 4 绕过（编码/变形/协议）——升级路径与硬规则见 `exploit-payload-escalation`
- 证据链：可控性证明（原始请求）+ 触发证据（回显/OOB 记录）按 `poc-evidence-snapshot` 固化，结论复核过 `fp-check`

## 六、修复建议

- 禁用危险反序列化或使用白名单/黑名单过滤
- XML 解析禁用外部实体（XXE 防护）
- yaml 使用 `SafeLoader`
- 深合并过滤 `__proto__`/`constructor` 键
- 输入校验：拒绝序列化对象格式（按业务白名单）

## 红线

1. 仅限授权范围：scope.txt 已固化并过 `scope-gate`；越界目标一律不测
2. RCE 验证最小化：只做回显/延迟/OOB 级证明，不落持久化后门，不改系统状态
3. gadget 工具（ysoserial/phpggc）获取须用户授权且只从官方源拉取；OOB 回调用授权端点；凭据/敏感回显在报告中脱敏，完整值仅存 evidence 目录

## Related Skills

- `security-auditor` — 源码审计侧反序列化危险函数与 gadget 依赖定位
- `file-handling` — 文件导入/Office/SVG 入口发现（XXE 的上游场景表）
- `exploit-payload-escalation` — payload 被拦截时的 L0-L7 升级与硬规则
- `redteam-ssrf` — XXE/JNDI 外连打内网与云元数据链
- `supply-chain-security` — gadget 依赖（CommonsCollections 等）版本与 CVE 对照；react-server-dom-* 三包版本矩阵扫描（npm audit/osv-scanner 路由）
- `patch-diff-exploit` — npm 双版本 tarball diff 推导利用（本节修复三簇即其 19.2.8↔19.2.9 差分产物）
- `poc-evidence-snapshot` / `fp-check` — 证据固化与误报复核
