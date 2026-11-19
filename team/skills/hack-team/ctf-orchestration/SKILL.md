---
name: ctf-orchestration
description: "CTF 竞赛编排——七类题目（pwn/reverse/crypto/web/forensics/mobile/cloud-ad-misc）分类路由到我方既有能力锚点进场，CTF 授权门特化判定（不外溢），赛中 easy-first 并行调度+升级查表四档止损，赛后 writeup 证据纪律+同族迁移写回 knowledge-base。Use when CTF/夺旗/竞赛题目（栈溢出/堆利用/逆向/密码/Web/取证/APK/AI/云/AD 杂项）开工分类进场、卡题按时间查表升级、或需要产出可复现 writeup 与同族迁移条目。"
version: 1.0.0
license: "internal（编制纪律模式吸收自 sapper-v2 MIT；CTF 分类场景面对照 reverse-skill 的 CTF-Sandbox-Orchestrator（GPLv3 收集件）仅取分类维度，未 vendor 任何正文）"
routing:
  phase: [recon, enum, exploit, privesc, post, report]
  target_type: [binary, web, mobile, cloud, ad, network]
  technologies: []
  vuln_hints: []
  task_types: [ctf]
is_broad_knowledge: true
aliases: [ctf, ctf-orchestration, pwn, 夺旗, writeup]
metadata:
  hermes:
    tags: [ctf, orchestration, easy-first, escalation-ladder, stop-loss, writeup, isomorphism-transfer]
    sources:
      - "sapper-v2（github.com/N1nEmAn/sapper-v2，MIT）README §4 Law（easy-first 并行/升级查表/止损）+ §5 Isomorphism transfer——按模式自写，未 vendor 正文，本地正典 repo-sapper-v2.md"
      - "reverse-skill（github.com/zhaoxuya520/reverse-skill，主仓 MIT）CTF-Sandbox-Orchestrator 子模块为 GPLv3 收集件——仅作分类场景对照（pwn/reverse/crypto/mobile/DFIR/云容器/AI/AD 八向，本地正典 repo-reverse-skill.md），禁 vendor 其任何正文"
      - "父卡 t_92231462 产物：knowledge-base/SKILL.md（同族迁移条目格式基准）"
    fusion_wave: W2-D (t_e2d75352, 2026-11-02)
---

# CTF Orchestration — CTF 竞赛编排（分类路由 + 授权门特化 + 编制纪律 + writeup）

> 一句话：**CTF 是编排问题，不是单题智力问题。** 先分类路由到我方既有能力进场，
> 卡题按时间查表升级（不恋战），破一题蒸馏一族，赛后 writeup 全证据可复现。
> 杠杆依据：sapper-v2 靠同款编制纪律（easy-first/升级查表/同族迁移），用 10.3 亿
> token 打平烧 45.8 亿 token 的对手（同 85 flag，腾讯云攻防赛 80.18 冠军）。

## 触发条件（何时用本技能）

- 接到 CTF 平台分配的题目（pwn/reverse/crypto/web/forensics/mobile/misc 任一类）
- 赛中卡题，需要判断「换手法/换角度/换人/止损」哪一档
- 拿到 flag 待提交，或提交被拒需要复盘
- 赛后写 writeup、提炼同族打法、写回 knowledge-base

## 定位与分工

本技能是**编排层**：分类路由、授权判定、调度纪律、产出规范。具体执行走各分类
锚点技能（§b 路由表），经验沉淀走 knowledge-base，死路记账走 failure-trace-index。
本技能自身不产生任何目标流量——所有主动动作由分类锚点在 §a 授权门判定通过后执行。

## a. CTF 授权门特化判定

**特化判定（仅对 CTF 平台场景生效）**：

- **CTF 平台注册参赛 = 目标侧授权已具备**（比赛条款即授权书）。注册参赛行为本身
  构成对「平台分配范围内目标」的相互授权，无需再走书面授权书流程。
- **scope = 平台分配的题面、靶机、flag 提交接口**。题目附件里的内网地址、题目
  下发的容器地址、平台显式分配的 VPN 网段内的靶机，都在 scope 内。

**不豁免的红线（比赛条款授权不覆盖）**：

- **禁打平台基础设施**：计分板、题目下发服务、平台 API 本身、数据库——打分逻辑
  漏洞（改分/抢分）不属于「解题」，属于攻击平台。
- **禁打其他队伍机器**：赛段网络里出现的其他队选手机、队服 VPN 地址——即使是
  攻防赛（A/D）形态，也只打平台明示的「可攻击目标列表」。
- **禁队间攻击**：不探测/不利用其他队伍的解题环境。
- **线下赛以赛事条款为准**：现场规则覆盖本节默认值（有的线下赛显式允许队间攻击，
  以条款原文为唯一依据）。

**判定程序（进场前三问，全过才用本节特化授权）**：

1. 目标是不是「注册参赛的 CTF 平台分配的题面/靶机/flag 提交接口」？
2. 比赛条款是否允许自动化/AI 选手参赛？（部分赛事禁止，条款没写 = 先问主办方）
3. 打算动的具体目标是否在题面分配范围内？

任一问不过 → 本节特化授权不适用，按真实目标处理。

**特化判定不得外溢**：真实目标渗透仍走 security-domain-delegation §1 完整授权门，
本节只对 CTF 平台场景生效。任何「先用 CTF 判定拿到授权再转打真实目标」的推理链
一律无效——CTF 特化授权与真实目标授权是两个不相通的门。

## b. 分类路由表（每类映射我方真实存在的能力锚点）

**每类第一步固定**：先查 knowledge-base 同类条目（`grep -i "<类别关键词>"
~/.hermes/skills/hack-team/knowledge-base/INDEX.md`）——有成熟打法直接带进场，
不从零推导；同时查 failure-trace-index（是不是已经死过一次）。两头都查完再动手。

| 类别 | 识别特征 | 能力锚点（真实存在） | 专项工具链 |
|---|---|---|---|
| pwn（栈/堆） | 二进制附件 + nc 地址；栈溢出/堆利用/格式化字符串/ROP | `rea-reverse-engineering`（devops/，binary 面+反编译）+ knowledge-base 同族条目 | gdb / pwntools（§e 降级链） |
| reverse | 附件只求算法/密钥/序列号，无交互服务 | `rea-reverse-engineering` + `reverse-ecosystem-index`（hack-team/，先搜再做：别人拆过没）+ `knowledge-base` | REA CLI / r2 / jadx（ELF 用 r2，APK 用 jadx） |
| crypto | 数学题面：RSA/ECC/格/古典密码/侧信道 | 无专项 skill——python/sage 工具链（§e 降级链）+ knowledge-base | sage / python sympy+gmpy2 |
| web | HTTP 服务/上传点/登录框；注入/XSS/SSTI/SSRF/逻辑漏洞 | `websec-toolbox` + `redteam-sqli`/`redteam-xss`/`redteam-ssti`/`redteam-ssrf`/`redteam-auth` + `business-logic-vulnerabilities` + `bola-session-detection`（均 hack-team/） | curl 优先（curl-first 纪律），确认漏洞后才上扫描器 |
| forensics / DFIR | 流量包/磁盘镜像/内存 dump/日志分析 | `cybersecurity-forensics`（~/.hermes/skills/cybersecurity-forensics/，60+ 取证技能面） | binwalk / file / strings（§e） |
| mobile | APK/IPA 附件；反混淆/脱壳/native so | `rea-reverse-engineering`（APK/DEX 面）+ `js-api-reverse`（前端加密参数）+ security-domain-delegation「国内分发 APK 获取决策表」（devops/，APK 拿不到时） | jadx / apktool（§e 降级链） |
| cloud / 容器 | k8s/docker 靶场、云凭证挑战 | `intranet-penetration-sop`（hack-team/，云内网链）+ case-by-case | kubectl / docker CLI |
| AD / 内网 | 域环境靶场、Kerberos/LDAP 题 | `intranet-penetration-sop`（hack-team/，AD 全链）+ `knowledge-base` | impacket 套件 |
| misc / AI / LLM | LLM 提示注入题/agent 沙箱/杂项 | `llm-redteam`（hack-team/，LLM 平台面）+ `wih-secret-hunter`（JS 敏感信息提取）+ `js-api-reverse` | case-by-case |

路由表使用纪律：

- 锚点必须先 `ls <锚点路径>/SKILL.md` 验存在再引用——表里的锚点是 2026-11-02
  实测在位的，技能库会演化。
- 复合题（如 APK 里嵌 native crypto）按主类别进场、副类别拉第二锚点，不串场。
- 分类拿不准时（misc 大杂烩）：先 file/strings/binwalk 附件定型，再回本表。

## c. sapper 编制纪律 CTF 特化

### c.1 easy-first 并行调度

开赛/开工第一轮：**全题扫一遍**（题面+附件类型+服务指纹），按「预估难度」升序
排进攻队列——易题全并行先收，难题放后。理由（sapper 实证）：易题快收的 flag
会解锁情报（题面模式、出题人习惯、平台 flag 格式），反哺难题；先把分数收进口。

### c.2 升级查表四档（决策从推理变成查表）

单题无进展计时，到档即执行对应动作，**不恋战、不凭感觉**：

| 档 | 无进展时长 | 动作 |
|---|---|---|
| 1 | 0-10min | 换战术指令：同角度换手法（如注入点换 payload 族、溢出换偏移） |
| 2 | 10-20min | 换角度重开：丢当前假设，换入口/换漏洞类（如 web 打不通转看源码泄露） |
| 3 | 20-30min | 换人或标记搁置：开新会话带事实摘要进场（旧上下文可能已被死假设污染），或先换题 |
| 4 | 30-45min | **止损关题**：写死路记录进 failure-trace-index（题号/已试角度/死因/部分成果/可复用残值），转下一题 |

止损不是放弃：sapper 实证后期同族题破防后回头 3 分钟收一题。搁置题在
knowledge-base 出现同族条目时立即重开。

### c.3 同族题识别 → 打法提炼 → 写回

- **识别**：编排者读全部题面，找「结构同形」题族——同框架同插件、同打包方式、
  同加密套路、同出题模板。sapper 战例：Digital Shelf 破防后 40 分钟连下 12 旗。
- **提炼**：单题破防立即蒸馏打法（入口/工具/关键命令/坑点），广播给同族未解题。
- **写回**：赛后把验证过的打法写进 knowledge-base 同族迁移条目——**格式以父卡
  t_92231462 产物为准**（`knowledge-base/SKILL.md` §d isomorphism 条目规范）：

```markdown
# <标题>
- 标签: <≤10 字>
- 概括: <≤50 字>
- 类型: isomorphism
- 日期: YYYY-MM-DD
- 适用形状: <新目标命中即迁移的形状描述>
- 已验证实例: <本次 CTF 哪几题跑通，比赛名/卡号/报告路径>
- 迁移时要换的参数: <目标特定值清单>
- 迁移时保真的骨架: <直接照抄的步骤>

## 完整打法
（入口 → 工具命令 → 成功判定 → 坑点；命令真实可复跑）
```

写回两步：① 建条目文件落 `knowledge-base/methodology/`；② INDEX.md 加一行。
纪律：isomorphism 条目只能从已验证打法抽象（比赛里真跑通的），禁理论推测生成。

## d. writeup 产出纪律

### d.1 结构：Evidence → Finding → Path + timeline

每题 writeup 四段：

1. **Evidence**：原始证据（附件哈希、关键请求/响应报文、脚本输出、截图路径）
2. **Finding**：从证据推出的结论（漏洞类/算法/绕过点），每个 Finding 引用至少
   一个证据锚（文件绝对路径）——无证据的解法标 UNVERIFIED
3. **Path**：完整解题路径（从题面到 flag 的步骤序列，每步给可复跑命令）
4. **timeline**：时间线（何时拿题/何时各档升级/何时破防/何时提交），事后复盘
   升级查表执行率的依据

### d.2 flag 提交状态机

```
未提交 ──提交──> 已提交 ──平台判定──> 通过（记账：分值/时间）
   ^                │
   │                └──被拒──> 记录拒绝原因 ──> 回 §c 升级查表（flag 错→重解；
   │                                          格式错→修正重交；非预期解→单独标注）
   └──重新提取────────┘
```

- **未提交**：拿到 flag 先本地验格式（平台 flag 正则），不盲交（有的平台错误
  提交扣分/限频）
- **已提交**：平台受理中，不重复提交
- **被拒**：区分三种死因——flag 内容错（回解题）/格式错（修正重交）/非预期解
  （解法碰巧通但非出题意图，单独标注，不进同族迁移条目）

集中提交纪律（sapper 信号兵机制）：全部 flag 由单一出口统一记账提交，防手滑、
防重复、防格式错——记账字段：题号/flag/提交时间/平台判定/分值。

### d.3 复现链五件套（对齐 security-domain-delegation §9）

每题 writeup 附五件套表，缺项标「复现链不完整+缺什么」：

| # | finding | 触发命令/报文 | 成功判定 | 证据锚 | 复现链 |
|---|---|---|---|---|---|
| 1 | <标题> | 可直接粘贴执行的命令 | 预期输出/机器可判 | 证据文件绝对路径+时间戳 | 完整/不完整+缺什么 |

## e. Preflight 表（按类别列依赖 + 缺失降级方案）

赛前/开工前按本卡类别逐项实测（`command -v` / `python3 -c "import X"`），缺失项
走降级链。**降级只换工具不换纪律**——§a 授权门与 §d 证据纪律不因工具降级豁免。

| 类别 | 依赖 | 缺失降级方案 |
|---|---|---|
| pwn | gdb | lldb（macOS 原生）→ r2 debug 模式 → REA `start_gdb_session` |
| pwn | pwntools | 纯 socket 脚本（python stdlib：struct 打包 + socket 收发）→ `pip3 install pwntools` |
| pwn/reverse | REA CLI（`rea`） | r2 + objdump 手工链（反编译质量降级） |
| reverse | r2 | objdump（纯反汇编，无分析引擎） |
| crypto | sage | python sympy + gmpy2（`pip3 install sympy gmpy2`）→ 纯 stdlib（大数内建/自实现格算法，仅小规模可行） |
| mobile | jadx | 无同级降级——先 `brew install jadx`；APK 拿不到走 security-domain-delegation 国内 APK 获取决策表 |
| mobile | apktool | jadx 单件可覆盖反编译+资源查看；需 smali 重打包时 `brew install apktool` |
| web | curl | python urllib（功能等价，交互差） |
| forensics | binwalk / file / strings | 均为 macOS 常备；缺失走 `brew install binwalk`；二进制速判可用 `xxd` + python struct |
| misc/AI | 无硬依赖 | 按题面现配 |

本机实测快照（2026-11-02，macOS 27.2）：在位 = python3 / pip3 / jadx / rea 6.8.0
（+REA MCP enabled）/ r2 / objdump / lldb / curl / binwalk / strings / file；
缺失 = gdb / sage / pwntools / sympy / gmpy2 / apktool / frida。快照会过期，
用前按表头命令重测。

## 来源与边界

- easy-first/升级查表四档/止损/同族迁移：sapper-v2（github.com/N1nEmAn/sapper-v2，
  MIT）README §4/§5 + 本地正典
  /Users/YOURNAME/.hermes/shared/research/hack-teams-fusion-20261101/repo-sapper-v2.md
- CTF 分类场景面（八向分类）：reverse-skill CTF-Sandbox-Orchestrator（GPLv3 收集件）
  仅作对照——分类维度参考，**未 vendor 任何正文**（融合档案 §七 纪律 1）；本地正典
  repo-reverse-skill.md
- writeup 五件套：security-domain-delegation §9（devops/）；同族迁移条目格式：
  knowledge-base/SKILL.md §d（父卡 t_92231462 产物，2026-11-02 冻结为格式基准）
- resolver 注册表条目（~/.hermes/profiles/_shared/scripts/skill_routing.json）
  仅挂 task_types:[ctf] 单钩 + 类别别名——宽面 typed 维（phase/target_type）留空，
  防止本编排技能在非 CTF 任务上抢精确技能的主选；frontmatter 全六段为真实范围声明
- 本技能正文不产生目标流量；文中命令仅在 §a 判定通过的 CTF scope 内执行
