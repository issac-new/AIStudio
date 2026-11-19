---
name: unauth-path-key-hunt
description: "零身份公开面：路径与密钥猎杀。Use when 未授权/零身份测试但路径不在主站 JS、禁止依赖登录 Network 截图当发现源、独立 H5/旧域名 NXDOMAIN/品牌迁域、兄弟域或同 IP Host 漏路径、网关 405 或 data 空数组、getRsaKey/JSEncrypt/前端加密被当成鉴权时调用。负责零身份公开面还原路径与密钥、响应指纹分流、加密证伪、迁域复查。JS 拆包与密钥提取见 wih-secret-hunter + js-api-reverse；角色/IDOR 见 redteam-auth；路径已知后的全方法/BOLA 见 cybersecurity/testing-api-* 与 bola-session-detection。"
version: 1.0.0
author: "hack-exploit (CK-fusion T1, 2026-11-09)"
license: "MIT"
routing:
  phase: [recon, enum]
  target_type: [web]
  technologies: []
  vuln_hints: [unauth, bola, idor]
  task_types: [hunt]
is_broad_knowledge: false
aliases: [未授权, 无鉴权, 零身份, unauth, 路径还原, 接口发现, 隐藏接口, 密钥还原, 取钥, getRsaKey, JSEncrypt, 前端加密当鉴权, 加密证伪, 迁域, 旧域名, NXDOMAIN, 405, 空数组, 响应指纹, 兄弟域, 同IP换Host]
metadata:
  hermes:
    tags: [unauth, path-discovery, key-recovery, response-fingerprint, zero-identity, ck-fusion]
    source: "融合自 zhaji2333/CkSKILLS (MIT, 2026-11-09)"
    target_profile: hack-exploit
---

# unauth-path-key-hunt — 零身份公开面：路径与密钥猎杀

> 融合自 zhaji2333/CkSKILLS (MIT, 2026-11-09)，本机适配：互链技能改本机名；线索板路径 hunts/<目标>/ → reports/<TARGET_SLUG>/；可利用性评估由 fp-check + evidence-governed-execution 承接；工具引用改 terminal/browser_exec 等价。
> 互链映射（FUSION-REPORT §五）：recon-js-analysis → wih-secret-hunter + js-api-reverse；auth-access-control → redteam-auth；api-protocol-security → cybersecurity/testing-api-*；cloud-infra-supply-chain → supply-chain-security；android-security-audit/apk-reversing/asc-fast-hunt → android-apk-hunt；report → src-report-gate。

**红线：仅用于已授权安全测试。** 所有目标（含兄弟域、同 IP、旧域名）必须先过 `scope-gate`（scope.txt 授权范围内）；缺授权 → 停手并 `kanban_block`，不发包。「兄弟域/同 IP 换 Host」等手法不得用于扩大到授权范围外的主机。

**本机工具注记：** curl/`--resolve` 探测直接在 terminal 跑；需要真实浏览器渲染或执行 JS 用 browser_exec；JS 批量抓取与 AST 解析优先复用 `js-api-reverse/scripts/capture_api.js` 与 `wih-secret-hunter` 管线，不重造。

编排型 skill。只解决「没有后台账号、路径不在当前前端时，如何独立还原接口并证伪加密=鉴权」。不替代 JS 拆包、越权矩阵、API 全方法。

## 何时调用

- 未授权 / 攻击者没有该业务账号（纯零身份）
- 路径不在主站 JS；用户要求不要用登录 Network 截图当发现源
- 独立 H5、旧子域 NXDOMAIN、品牌迁域（旧 Host 301/消失）
- 兄弟域、同 IP、`--resolve` 换 Host 漏出路径
- 网关 `405 Method Not Allowed`、`200 data:[]`、短文案「链接不存在」
- `getRsaKey` / JSEncrypt / SM2 / 前端 AES，怀疑只是传输混淆

**不要调用（交给别人）**

- 攻击面不清、要广撒网拆 webpack / 脏收集 → `wih-secret-hunter` + `js-api-reverse`
- 路径已通，打角色/IDOR/JWT/验证码 → `redteam-auth`
- 路径已通，全方法、BOLA、Swagger、走私 → `cybersecurity/testing-api-*` 系列
- 调试面板/中间件/对象存储未授权 → `supply-chain-security`
- 路径在 APK/小程序包里 → `android-apk-hunt` / `miniprogram-security`
- 已验证要成稿 → `src-report-gate`

## 与其它技能分工

```
怀疑隐藏未授权
    │
    ▼
unauth-path-key-hunt     找 Host/路径/钥，证伪加密
    ├─ 拆 webpack / 脏收集 / 提字符串     → wih-secret-hunter + js-api-reverse
    ├─ 路径已通，角色墙 / IDOR            → redteam-auth
    ├─ 路径已通，全方法 / 旧版 / 网关协议  → cybersecurity/testing-api-* + bola-session-detection
    ├─ 路径在包里                         → android-apk-hunt / miniprogram-security
    └─ 已验证成稿                         → src-report-gate
```

拆 JS、Wayback、Packer 的细则以 `wih-secret-hunter` + `js-api-reverse` 为准，此处不重复。

跨轮线索落盘以 `hunt-clueboard` 为准：开工先读 `reports/<TARGET_SLUG>/CLUEBOARD.md`，P2 指纹/405/`[]`/迁域结论当轮写回，禁止只写在对话里。

## 铁律

1. 发现阶段禁止把「已登录 Network」当路径出处。截图只作假设，公开面复原才是证据。
2. 主站 JS 没有 ≠ 接口不存在。
3. 客户端能拿到的 RSA/AES/uuid ≠ 鉴权。
4. SPA 的 404 不是接口的 404。没到失败升级 L4 不准写「无此接口」。
5. 旧 H5 / 旧 Host 下线 ≠ 后端方法下线。

---

## P0 零身份约束

**允许的发现源：** 未登录 HTML/JS/map；CT / urlscan / Wayback / GitHub；兄弟域与同 IP；301 Location；公开文档；未登录可下的 APP/小程序包。

**不允许当发现源：** 业务账号登录后的 DevTools；报告截图里的 URL（降级为待验证假设）。

口令：截图里的路径 = 假设；公开面复原 = 证据。

---

## P1 入口地图

分清四类 Host，标 DNS/IP，不要只盯主域：

| 类 | 典型 | 下一步 |
|---|---|---|
| C 端壳 | 主站 / m / 品牌新域 Next/Vue | 在此搜路径常失败，记录后换场 |
| API 网关 | appgw / apigw / qr / gateway | P2 指纹，不要当 SPA 扫目录 |
| 独立业务 H5 | invoice / vat / asp / mag / 活动 CDN | 优先拆 JS、打 `/gp` `/mag` 等前缀 |
| 后台/SSO | passport / admin / 服务商域 | 记下 sid；零身份只证「墙在哪」 |

品牌新域、301 目标必须列入地图。

**通过门：** 至少标出「C 端壳 / 疑似网关 / 疑似业务 H5」三类。

---

## P2 响应指纹（禁止 `-L` 跟着 302 再看 body）

记录四元组：`状态码 / Content-Type / Server / body 形态`。

| 指纹 | 含义 | 动作 |
|---|---|---|
| SPA HTML 404（Next `X-Powered-By`，几十 KB index） | 前端路由吞路径，不是这个后端 | 换 Host |
| 网关 JSON：`no api` / `Route Not Found` / `divide: selector` | 网关活着，这条 route 没挂 | 换 Host 或前缀 |
| 业务 JSON：`success/code/message`，path 出现在 body | 真应用 | 进入 P4/P5 |
| 短 body 业务文案（「链接不存在」）vs 统一 404 页 | 路径存在、资源不存在 | 保留前缀，补 module/method |
| 302 → SSO | 有鉴权墙，不是「没有服务」 | 记下 Location 的 sid/应用名 |
| 405 `Request method 'GET' not supported` | 控制器在，方法不对 | 立刻 POST |
| 200 + `data:[]` | 已进控制器，只是没命中数据 | 补参数/加密/字段名 |
| 同 IP 换 Host → 403 / `404 Route Not Found` | 虚拟主机隔离 | 继续找对的 ServerName |
| Node-RED editor/admin API（`:1880`，GET `/flows` 200、editor HTML title） | 未认证 Node-RED 实例 | **RCE 原语**：`POST /flows` 部署 `inject`(1s 触发一次)→`exec` 流即执行 shell，无需交互。CVE-2026-58115（CVSS 10，西门子 IoT2050 工控镜像实例，SSA-834709，4.3.4.1 修复；VulnCheck 蜜罐 2026-10-30 起在野，curl UA 直打）。注意载荷三层编码（flow 定义→base64→wget/curl），请求体 grep 不到明文下载命令 |

**通过门：** 每个候选路径都归入上表。禁止再写「404 所以没有」。

---

## P3 路径发现五源（并行）

优先级从「更像零身份攻击者」到「更脏」。webpack/脏收集操作见 `wih-secret-hunter` + `js-api-reverse`。

| 源 | 做什么 | 通过信号 |
|---|---|---|
| 1 现网 JS | 首页、buildManifest、异步 chunk、baseURL | 路径或方法名字符串有公开出处 |
| 2 历史旁路 | urlscan / Wayback / CT / 第三方脚本引用的 Host | 旧 URL、CDN 活动页、发票/售后等业务词 |
| 3 兄弟域 + 同 IP | 对未解析旧 Host `--resolve` 到网关 IP | 对 Host=业务 200；错 Host=网关 404/403 |
| 4 命名习惯 | 有第一段后续猜：`/{svc}/{module}/{method}/{id}`、`/gp/{ctx}/{action}`、`ForFree`/`open`/`anon` | 405 或业务 JSON |
| 5 包 | C 端 Web 没有的方法名 | 交给 `android-apk-hunt` / `miniprogram-security`，产物回到本 skill 打 Host |

主站源1 为空是常态，进入源2/3，不要结案。

**通过门：** 路径字符串能指出公开出处（JS 行 / urlscan / 兄弟域指纹）。没有出处仍是假设。

---

## P4 密钥还原与鉴权证伪

目标不是解密，是判断密码学有没有替代鉴权。

从 JS 必须对齐 6 项（提取步骤走 `wih-secret-hunter` / `js-api-reverse`）：

1. 取钥接口（`getRsaKey` / `getPublicKey` / ticket）
2. 算法与填充（JSEncrypt 默认 PKCS#1 v1.5）
3. **POST 字段名**（响应里的 `uuid` 可能要改名为 `rsaUuid`）
4. 密钥生命周期（多次 GET 是否同一 uuid/公钥 → 静态密钥 ID）
5. 加密范围（只加密关键字，还是整包）
6. 无 Cookie 能否取钥

口令：

- 客户端能取的「密钥」，对攻击者不是密钥。
- 加密查询字 ≠ 证明你是谁。
- 字段名以 JS 为准，猜错会假阴性（空数组）。

### T0–T3 对照（详细越权矩阵见 `redteam-auth` + `cybersecurity/testing-for-broken-access-control`）

| 编号 | 条件 | 仍业务成功则 |
|---|---|---|
| T0 | 无 Cookie、无 Authorization | 未授权 |
| T1 | 错误/过期 Token | 鉴权没校验 |
| T2 | 有登录但无该业务角色 | SSO 与 ACL 分离，记录「能进门不能办事」 |
| T3 | 去掉加密或改错绑定字段 | 加密是协议还是装饰 |

T0 成功 + 敏感字段 → 未授权成立。T0 仅 302/ACL、业务接口已下线 → 路径存在但利用链断，分开写。

---

## P5 字段对齐（空结果最易误判）

1. GET 目标方法 → 吃 405，改 POST
2. POST `{}` → `data:[]` 说明已进控制器
3. 明文关键字 / 错字段名 / 对字段名+密文 三组对照
4. 从**同类加密接口**抄字段名（改密用 `rsaUuid`，查询多半同一个）

示例（字段名错了会像没洞）：

| body | 常见结果 |
|---|---|
| `{}` | 200 `[]`（无鉴权） |
| `{title: 密文}` | `[]`（缺绑定） |
| `{title, uuid}` | `[]`（名错） |
| `{title, rsaUuid}` | 非空列表 |

**通过门：** 至少一种变体能把 `[]` 变成非空，或错误信息给出参数名。否则只写「接口暴露，危害未证实」。

路径对齐之后的全方法/BOLA/分页遍历交给 `cybersecurity/testing-api-*` 系列（BOLA 会话级差分另见 `bola-session-detection`，前端路由穷举与双账号 A/B 见 `js-api-reverse` §b）。

---

## P6 迁域复查

旧站下线必须四问：

1. 旧 Host 是 NXDOMAIN 还是 301？301 的 Location 是新战场。
2. 新品牌域有没有把 API 一起搬走，还是只搬了 C 端壳？
3. 同 IP 上哪个 ServerName 还在反代这套前缀（`/gp` `/mag`）？
4. 前端 chunk 删了方法名，网关上方法还在不在？（405/200 比 JS 诚实）

---

## P7 失败升级

没到 L4 不准写「无此接口」：

| Level | 动作 |
|---|---|
| L1 | 主站 JS 全文搜 |
| L2 | 异步 chunk / 独立 H5 JS |
| L3 | 兄弟域、CDN、urlscan、CT |
| L4 | 网关 Host 探测 + 405 / 业务 JSON |
| L5 | 换入口：APP、小程序、开放文档 |
| L6 | 旧方法名 + 新 Host |
| L7 | Wayback 旧 JS 的 baseURL 打现网 |

---

## P8 危害落地与输出

- 列表类：公开公司简称作关键字；统计条数与含账号/税号字段数；正文只出脱敏样本。
- ID 类：先解决 ID 从哪来（公开格式、C 端自己的单、枚举）。没有合法 ID 不能宣称可打任意用户。
- 复现用 curl（terminal 跑），证明请求无登录 Cookie。
- 输出落盘按 `target-scoped-workspace`：finding → `findings/`，PoC → `pocs/`，证据 → `evidence/`；未经 fp-check 六门不进 findings/。
- 覆盖度必填：✅已测 / ❌未测 / 🔄变种 / 💡关联（口径见 `src-hunt-disciplines`）；同步写进 `reports/<TARGET_SLUG>/CLUEBOARD.md` 第 7 节。
- 可利用性判定与证据门走 `fp-check` 六门 + `evidence-governed-execution`；成稿走 `src-report-gate`（只读板上「已证实」行）。

---

## 通用决策句

1. 主站没有，去兄弟域和历史域。
2. SPA 的 404 不是接口的 404。
3. 「链接不存在」/405/空数组，往往比统一 404 更值钱。
4. 路径跟 Host 走，不跟品牌官网走。
5. 前端能取的 RSA/AES/uuid 只是协议，不是登录。
6. 加密字段名以 JS 为准，猜错就假阴性。
7. H5 下线只删了壳，旧 method 可能还在网关上。
8. 截图证明利用，公开面证明发现。

类型对照：角色隔离后台（C 端无路径）/ 专项独立 H5 / 换皮迁域 / 前端已删后端未下。四类可叠加。

---

## 修复（未授权接口）

- 网关统一鉴权；`ForFree`/`open`/`anon` 默认视为危险命名，必须有身份或强频控+最小字段。
- 前端加密不能替代登录；取钥接口同样要鉴权或只对已登录会话下发。
- 下线 H5 必须同时下线路由/控制器，不能只删 DNS。
- 企业抬头等财务身份禁止对未登录返回完整银行账号。

## Related Skills

- `hunt-clueboard` — 跨轮线索板；P2 指纹/迁域/覆盖度结论当轮写回
- `wih-secret-hunter` / `js-api-reverse` — JS 拆包、密钥提取、加密参数还原（P3/P4 上游）
- `redteam-auth` — T0–T3 之后的角色/IDOR/JWT 越权矩阵
- `cybersecurity/testing-api-*` / `bola-session-detection` — 路径打通后的全方法与 BOLA
- `src-hunt-disciplines` — 覆盖度四态口径与十条测试纪律
- `scope-gate` — 授权门（含兄弟域/同 IP/旧域必须逐一在范围内）
