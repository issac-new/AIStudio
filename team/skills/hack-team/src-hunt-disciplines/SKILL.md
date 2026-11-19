---
name: src-hunt-disciplines
description: SRC 漏洞挖掘十条执行纪律 + 30 秒快速排查清单 + 高价值入口点速查——横向 checklist 化纪律层。hunt/audit 任务开工、方向不明、收尾自检时逐条对照。提炼自 CkSKILLS AGENTS.md（MIT），与 PentestMethodology SOUL 节选互补不重复。Use when 安全测试开工/测试卡壳换方向/覆盖度自检/收尾前核对。
version: 1.0.0
license: "MIT (提炼自 zhaji2333/CkSKILLS AGENTS.md §2/§8/§9 + xss-frontend-security description 层)"
routing:
  phase: [recon, exploit, report]
  target_type: [web, api, mobile, cloud]
  technologies: []
  vuln_hints: []
  task_types: [hunt, audit]
is_broad_knowledge: true
aliases: [hunt-disciplines, ten-disciplines, src-disciplines, 测试纪律, 快速排查清单, 覆盖度自检]
---

# src-hunt-disciplines — 十条测试执行纪律（横向 checklist 层）

> **定位**：checklist 化的横向执行纪律，任何角色（recon/exploit/auditor/forensics）在任何阶段都能逐条对照。
> **分工**：本 skill 是横向纪律全集；各 profile SOUL 内的 PentestMethodology 融合节是角色级节选（recon 侧重 Curl-First 与被动优先，exploit 侧重升级与 payload）。两边不重复：SOUL 讲「角色怎么做」，这里讲「每轮必须过哪些格子」。
> **来源**：提炼自 CkSKILLS `AGENTS.md`（zhaji2333/CkSKILLS，MIT）§2 测试执行纪律 + §8 快速排查清单 + §9 高价值入口点速查；XSS 优先级提点取自源 xss-frontend-security description 层。源仓库工作约束中与本机授权门冲突的两条越权条款显式不吸收（融合裁决 M7）。

**红线：仅授权测试。** 实质动作（发包/扫描/利用）前先过 `scope-gate` 授权门；目标不在授权范围 → 停，不测。

## 一、十条测试执行纪律

### 1. JS 不吃透，不发包

对 Web 资产先做前端资产还原，再进入接口测试：

- webpack chunk / source map 还原 → 提取 API 路径、参数结构、鉴权方式、密钥（AK/SK/JWT/secret）、隐藏功能（未上架页面、内部接口）
- 全方法 × 全参数测试：GET/POST/PUT/DELETE × 显式参数 + 隐藏参数
- 工具：`wih-secret-hunter`（JS chunk 四级瀑布提密钥）+ `js-api-reverse`（前端加密参数逆向）

判定：JS 面没吃透就发包 = 盲测，容易漏同源隐藏接口和携带弱鉴权的旧 API。

### 2. 覆盖度自检（四态标记，测完必输出）

每轮测试结束输出四态清单，变种思维强制：

- ✅ 已测（附结论：成洞/不成洞/为什么）
- ❌ 未测（附原因：无权限/超范围/时间不够）
- 🔄 变种（已测但还有未试的变形：编码/类型/注入点/顺序/大小写双写）
- 💡 关联（本接口的发现可与其他接口组合的线索）

变种维度记忆口诀：**编码（URL/Unicode/双写）、类型（JSON/form/XML）、注入点（参数名/头/路径）、顺序（多步骤换序）、大小写双写**。

### 3. 漏洞嗅觉（异常信号即线索）

响应中出现以下任一异常 → 记录、对比验证、分析、尝试利用，不当噪声跳过：

- 响应时间异常（同接口不同参数耗时差 >2 倍 → 盲注/SSRF 疑点）
- 体量异常（同类请求响应大小突增/突减 → 数据回显差异）
- 措辞异常（错误信息带堆栈/SQL 片段/内部路径）
- 状态码异常（405 暗示方法未覆盖、500 带回显、301/302 暴露内部跳转）
- 字段异常（响应里出现请求不该看到的字段 → 越权疑点）

### 4. 业务建模（状态机 + 角色矩阵 + 非法路径）

对核心业务（支付/订单/权限/风控）先建模再测试：

- **状态机**：画出业务对象的合法状态迁移图（下单→待支付→已支付→已发货→退款），攻击目标是非法迁移边
- **角色矩阵**：角色 × 操作 的权限矩阵，攻击目标是矩阵外的格子（普通用户触发管理员操作）
- **非法路径**：跳步（未支付直接发货）、回退（已退款再次发货）、重复（并发双花）
- **一致性校验位置**：金额/数量在前后端哪里校验、回调里校验不校验
- **并发**：资金链路必测竞态与重放（专项打法见 `business-logic-vulnerabilities`）

### 5. 失败升级（L1-L7 概览）

payload 被拦不等于没有漏洞，按级升级：

| 级 | 手段 | 一句话 |
|---|---|---|
| L1 | 编码 | URL/Unicode/Hex 变形 |
| L2 | 变形 | 大小写/双写/注释/等价函数 |
| L3 | 逻辑 | 换等价语法达成同一语义 |
| L4 | 协议 | HTTP 方法/分块/参数污染/解析差异 |
| L5 | 换入口 | 等价接口/旧版本 API/移动端通道 |
| L6 | 组合 | 多个单点缺陷串联 |
| L7 | 时间 | 竞态/重放/TOCTOU |

**硬规则：至少升到 L4 才能下「无漏洞」结论。** 分级引擎与各注入场景的 L0-L4 payload 示例见 `exploit-payload-escalation`（其 L4 含换攻击面档位，与上表 L5-L7 语义衔接）。

### 6. 跨接口关联（五问）

单点测完必过五问，低危组合可提级：

1. **信息流**：A 接口的输出能不能当 B 接口的输入（泄露的工号 → 越权查详情）
2. **凭证**：A 处拿到的 token/签名能不能在 B 处用（跨接口凭证混用）
3. **状态**：A 改了状态，B 是否感知（双端状态不同步 → 并发窗口）
4. **权限**：A 接口校验的角色，B 接口校不校验（同角色不同接口鉴权差异）
5. **时序**：A 和 B 的先后顺序能不能反过来（先发货后校验类缺陷）

### 7. 开发者视角（优先测清单）

站在写代码的人的角度想哪里容易偷懒，优先测：

- 新功能（上线匆忙、代码评审不充分）
- 内部接口（没打算暴露但路由可达）
- 批量操作（循环里漏了逐条鉴权）
- 旧 API（新版上线旧版忘下线、鉴权从没补过）
- 错误分支（开发只测了 happy path）
- 管理后台（/admin /manager /console /backstage）
- 第三方回调（callback 常按设计无鉴权）
- 导出下载（导出接口常沿用列表权限但数据范围更大）
- 定时任务（job 触发的路径常无登录态校验）

### 8. 信息收集要脏（线索当轮写板）

信息源不限于目标主站，脏数据源清单：

- Wayback Machine（下线页面/旧接口）
- GitHub/GitLab（代码泄露、密钥硬编码、内部文档）
- Google Dork（site:/inurl:/filetype: 组合）
- 证书透明度日志（子域/内部域名）
- 招聘 JD（技术栈泄露：用了什么框架/中间件）
- JS 注释、robots.txt、source map、APK/IPA、Changelog

**写板纪律：线索当轮写入 `reports/<TARGET_SLUG>/CLUEBOARD.md`（见 `hunt-clueboard`）。不进板的收集，本轮不算完**——下轮换会话就丢。`TARGET_SLUG` 命名规则见 `target-scoped-workspace`。

### 9. 对抗意识（四问）

测试前先搞清防御在哪，再选打法：

1. 防御在**哪一层**（WAF/网关/应用层/数据库层）
2. 每层的**规则是什么**（关键词黑名单/正则/频控/语义分析）
3. 规则的**边界在哪**（只拦 query 不拦 header？只拦 GET 不拦 POST？）
4. 层与层之间的**协议/编码/逻辑差异**（WAF 解析与后端解析不一致 = 绕过窗口）

### 10. 暂停思考（触发条件）

出现以下任一信号 → 停下通用测试，切对应专项 skill 深挖：

- 发现**加密签名**（请求带 sign/token 且算法未知）→ `js-api-reverse`
- **权限不明**（接口行为与角色预期不符）→ `redteam-auth`
- **异常响应**（触发漏洞嗅觉但无法解释）→ 停下来分析，不换下一个
- **3 连失败**（同类 payload 三连被拦）→ `exploit-payload-escalation` 升级
- **新攻击面**（小程序/云函数/AI 入口/GraphQL 首次出现）→ 对应专项
- **复杂业务**（资金链路/多角色流转）→ `business-logic-vulnerabilities`
- **多低危**（一堆疑似低危堆积）→ 纪律 6 五问做组合提级

## 二、XSS 优先级提点（增量并入）

来源：CkSKILLS xss-frontend-security description 层的优先级裁决；打法细节一律走本机 `redteam-xss`，不另建平行知识。

- **跳转型 XSS 优先测**：中间跳转页、登录回跳、SSO 回调、分享/邀请链接、支付回调、扫码登录回跳——任何 `target`/`redirect` 类参数驱动 `location` 跳转的点，**第一时间测**（`javascript:` 伪协议升级为同源 XSS；仅 http(s) 放行时评估开放重定向单独成洞）。
- **AI 输出/Markdown 渲染型 XSS**：AI 对话页/分享页用 marked→innerHTML 无净化渲染模型输出时，测 AI 输出型存储 XSS（AI 侧输出操纵见 `llm-redteam`，渲染侧落地见 `redteam-xss`）。

## 三、快速排查清单（30 秒定位方向）

方向不明时从上往下勾，命中即切对应技能：

- [ ] 未鉴权敏感接口？路径已知 → `cybersecurity/testing-api-*` 系列；路径不在主站 JS / 无业务账号 / 加密当鉴权 / 迁域残留 → `unauth-path-key-hunt`
- [ ] 对象级校验缺失（IDOR）？→ `redteam-auth`
- [ ] 拼接查询/命令/模板渲染？→ `redteam-sqli` / `redteam-ssti`
- [ ] 上传/下载/导入/解析功能？→ `file-handling`
- [ ] URL 访问代理（SSRF 入口）？→ `redteam-ssrf`
- [ ] token/JWT 校验缺陷？→ `redteam-auth`
- [ ] 并发/重放致资金或状态异常？→ `business-logic-vulnerabilities`
- [ ] 配置泄露/调试接口/错误栈？→ `supply-chain-security` / `cybersecurity/testing-api-*`
- [ ] 新目标/继续挖/线索要跨轮留？→ `hunt-clueboard`
- [ ] 攻击面不清、找不到接口/密钥？→ `wih-secret-hunter` + `js-api-reverse`
- [ ] 路径不在当前前端、兄弟域/同 IP、405/`data:[]`、getRsaKey？→ `unauth-path-key-hunt`
- [ ] 有源码可审计？→ `security-auditor`
- [ ] payload 被拦？→ `exploit-payload-escalation`
- [ ] LLM/Chatbot/Agent/RAG/Copilot？用户输入进大模型或工具调用？→ `llm-redteam`
- [ ] 拿到 APK 要秒级搜密钥/签名/隐藏接口/Manifest 组件面？→ `android-apk-hunt`

## 四、高价值入口点速查

按入口类型扫攻击面时的优先清单：

| 入口类型 | 具体点位 |
|---|---|
| 用户中心 | 注册/登录/找回密码/绑定手机/实名认证 |
| 支付流程 | 下单→支付→回调→退款→提现（全链路） |
| 文件功能 | 头像/附件上传、导入导出、报表下载 |
| 管理后台 | /admin /manager /console /backstage |
| API 面 | /api/v1 /graphql /swagger /actuator |
| 冷门高价值 | 客服/工单、邮件通知、二维码/短链、日志/监控、第三方登录、分享/邀请、数据导出 |
| 零身份面 | 独立 H5 / 旧域下线 / 兄弟域漏路径 / 前端加密当鉴权（→ `unauth-path-key-hunt`） |
| AI 入口 | AI 客服/Chatbot、AI 助手/Copilot、文档问答/RAG、AI 写作/编程、AI 搜索、多模态解析、代码解释器、Agent 工具调用（→ `llm-redteam`） |
| 移动入口 | 硬编码密钥/签名函数/隐藏调试后门/组件面清单，大包秒级快筛（→ `android-apk-hunt`） |

## 使用方式

- 开工：过 §三 快速排查清单定方向 + §四 入口点速查圈攻击面
- 每轮收尾：过 §一.2 覆盖度四态 + §一.8 写板纪律
- 卡壳：过 §一.5 失败升级档位 + §一.10 暂停思考触发条件
- 本 skill 只给格子不给打法；每个格子指向的专项 skill 承载打法细节
