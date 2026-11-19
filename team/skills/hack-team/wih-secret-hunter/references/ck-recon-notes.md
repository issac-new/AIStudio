# CK 增量笔记 — webpack/sourcemap 还原 · 资产扩展 · 凭证深挖

> **来源**：CK-Skills `recon-js-analysis`（github.com/zhaji2333/CkSKILLS，MIT，
> `.agents/skills/recon-js-analysis/SKILL.md` 149 行），2026-11-09 CK-Fusion T4
> 全文亲读后取**增量**融合（本机 wih-secret-hunter 已覆盖的 chunk 发现/敏感规则
> 不重复收录）。本文件是 `wih-secret-hunter` 的 references：wih_engine.py 跑完
> 后命中下述场景时按本笔记执行。
>
> **头部适配区（CK 名→本机名对照，正文一律只用本机名）**：
>
> | CK 源名 | 本机名（正文用） |
> |---|---|
> | recon-js-analysis | wih-secret-hunter + js-api-reverse（本技能本体） |
> | android-security-audit / apk-reversing / asc-fast-hunt | android-apk-hunt |
> | miniprogram-security | miniprogram-security（CK-Fusion 同名新建） |
> | cloud-infra-supply-chain | supply-chain-security |
> | hunt-clueboard | hunt-clueboard（CK-Fusion 同名新建） |
> | unauth-path-key-hunt | unauth-path-key-hunt（CK-Fusion 同名新建） |
> | api-protocol-security | cybersecurity: testing-api-* 系列 |
> | auth-access-control | redteam-auth |
> | injection-vulns | redteam-sqli / redteam-ssti |
> | ssrf-internal-network | redteam-ssrf |
> | file-handling / deserialization-xxe | 同名本机技能（CK-Fusion T4 新建） |

## 一、何时读本笔记

- wih_engine.py 4 级瀑布跑完，需要进一步还原 webpack chunk / source map 源码
- 提取结果含 URL/IP/域名清单，需要资产扩展
- 提取到 appid/appkey/AppSecret/AK/SK/推送密钥等应用凭证，需要深挖与上报

## 二、webpack / source map 还原细则（增量）

纪律：**JS 不吃透，不发包**——先完整还原再动手。

1. **chunk 发现层不重做**：HTML→Next.js manifest→Webpack/Vite→generic 四级瀑布
   已由 `scripts/wih_engine.py` 覆盖；本节只补「还原」环节。
2. **source map 检测**：JS 同目录 `.map` 文件；或 JS 末尾 `//# sourceMappingURL=`
   注释。用 curl 直接拉取（`curl -ksS https://<授权目标>/app.js.map`）。
3. **还原工具本机化**（2026-11-09 实测）：
   - `sourcemaps` Python 库 / npm `shuji` 本机均未装。多数场景 map 内
     `sourcesContent` 已含完整源码，python3 标准库 json 直接抽取即可，零安装：
     `python3 -c "import json;d=json.load(open('app.js.map'));[print(c) for c in d.get('sourcesContent',[]) if c]"`
   - 需要 VLQ mappings 完整还原时，授权后 `npx shuji`（零安装运行）。
   - CK 推荐的 Packer-InfoFinder 本机未装；其能力（自动发现 JS/拆 chunk/提取接口
     与敏感信息）已被 wih_engine 覆盖，重复能力不引入。
4. **map 命中后的提取顺序**：`sources` 数组（原始文件路径 = 前端目录结构情报）→
   `sourcesContent`（完整源码）→ `names`。grep 范围：API 路由表、鉴权/签名逻辑、
   注释与 TODO、内网域名、测试账号、Feature Flag。
5. **混淆代码**：先 beautify 再逐模块读（`npx js-beautify` 零安装；或编辑器格式化）。
   优先定位：路由定义、API 调用、请求拦截器、响应处理器。
6. **必提取清单**：所有 API 端点（含注释掉的/条件判断里的/环境变量控制的）、
   参数结构（必填/选填/隐藏/调试参数）、鉴权机制（token 生成/签名算法/刷新）、
   前端路由表、角色权限判断、WebSocket 端点与消息格式、错误处理泄露点。
   加密/签名还原转 `js-api-reverse`。

## 三、URL/IP/域名 → 资产扩展（提取后必须做）

1. 每条 URL/IP/域名单独成行，**标注来源**（`webpack 提取` / `app.js` /
   `source map` / `APP 抓包` / `APK 反编译`），便于交接与复盘。
2. 全部回流资产测绘流程：子域名枚举 → 端口扫描 → 目录扫描（ffuf 本机已装 ✅）→
   指纹识别。
3. 按攻击面价值分类标注：API 网关 / 后台·管理端域名 / CDN-OSS 存储桶 / 内网 IP /
   云服务端点 / 第三方回调地址——每一条都是可扩展攻击面。
4. **APP 抓包来源的 URL/IP/域名必须提醒用户关注**：很可能是 APP 后台或业务接口
   域名，鉴权往往弱于前端接口，是比前端接口更高价值的测试目标
   （联动 `android-apk-hunt` / `miniprogram-security`）。
5. 产出去向：写入 `reports/<TARGET_SLUG>/` 资产清单（target-scoped-workspace
   规范）；发现的新子域/新端口/新后台回流 recon 队列再测。

## 四、appid/appkey 凭证 → 上报与深挖

发现 appid/appkey/AppSecret/AK/SK/推送密钥后**必须单独列出上报用户**，不允许只
在接口清单里带过。

1. **上报**：作为重点发现单独成条（wih JSON records + evidence 目录；报告内脱敏
   保留前 8 字符 + hash——见 SKILL.md 红线 §3）。
2. **验证有效性**：用凭证直接调对应后端接口/云服务 API。云厂商 AK/SK 可致云资产
   接管（联动 `supply-chain-security`）。注意本机红线：**主动云 API 验证须用户
   显式授权**（ARL 原 verifier 仅格式校验；执行级验证走
   `_shared/scripts/verify_finding.py`）。
3. **定位归属**：凭证书透明度日志、代码仓库搜索、目标域名对比，确认凭证对应的
   域名与服务。
4. **越权面**：凭证对应的管理接口/统计接口/推送接口是否可越权调用、是否缺鉴权。
5. **泄漏面多渠道互证**：历史版本 JS、Wayback、日志、错误信息、GitHub 泄露。

## 五、纪律与红线（继承本技能 SKILL.md）

- JS 不吃透不发包；只做被动抓取与正则提取，主动验证（发包/调云 API）前过
  `scope-gate` 且凭据主动使用须用户显式授权
- OOB/回连只用自有或授权回调端点，禁向公共 DNSLog 类第三方提交目标数据
- 凭据/敏感值报告内脱敏，完整值仅存 evidence 目录
