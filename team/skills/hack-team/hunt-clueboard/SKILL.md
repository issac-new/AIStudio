---
name: hunt-clueboard
description: "当前目标线索板（跨轮工作记忆），读→挖→写回。Use when 开始挖新目标、会话压缩/换会话后续挖、用户说线索板/写板/读板/建板/继续挖，或本轮产出 Host/路径/密钥/证伪结果需跨轮保留。负责维护 reports/<TARGET_SLUG>/CLUEBOARD.md，专防否定证据（SPA壳/405/空数组/NXDOMAIN）在压缩后丢失；不负责拆 JS、打越权或成稿。模板见同目录 CLUEBOARD.template.md。"
version: 1.0.0
author: "hack-exploit (CK-fusion T1, 2026-11-09)"
license: "MIT"
routing:
  phase: [recon, exploit, report]
  target_type: [web, mobile]
  technologies: []
  vuln_hints: []
  task_types: [hunt]
is_broad_knowledge: false
aliases: [线索板, clueboard, clue-board, 工作记忆, 跨轮记忆, 建板, 写板, 读板, 继续挖]
metadata:
  hermes:
    tags: [hunt, clueboard, working-memory, cross-session, ck-fusion]
    source: "融合自 zhaji2333/CkSKILLS (MIT, 2026-11-09)"
    target_profile: hack-exploit
---

# hunt-clueboard — 当前目标线索板（工作记忆）

> 融合自 zhaji2333/CkSKILLS (MIT, 2026-11-09)，本机适配：板路径 hunts/<目标>/ → reports/<TARGET_SLUG>/（对齐 target-scoped-workspace，raw/ 与 findings/ 同级）；互链技能改本机名；注入 scope-gate 授权红线；工具引用改 terminal/browser_exec 等价。
> 互链映射（FUSION-REPORT §五）：recon-js-analysis → wih-secret-hunter + js-api-reverse；auth-access-control → redteam-auth；api-protocol-security → cybersecurity/testing-api-*；cloud-infra-supply-chain → supply-chain-security；android-security-audit/apk-reversing/asc-fast-hunt → android-apk-hunt；report → src-report-gate。

**红线：仅用于已授权安全测试。** 目标必须先过 `scope-gate`（scope.txt 授权范围内）；缺授权 → 停手并 `kanban_block`，不发包、不建板。

薄过程 skill，对标 `src-report-gate`：成稿技能收口出报告，本技能**把线索从对话里拿出来落盘**。不挖洞、不替代 `wih-secret-hunter` / `js-api-reverse` / `unauth-path-key-hunt`。

**定位：低配黑板架构。** 专项技能是知识源（往板上写假设与证据），`CLUEBOARD.md` 是黑板（共享工作记忆），`skill-resolver` 路由 + 板上「当前焦点」是控制（决定下一步加载谁）。仍是单 Agent 顺序调度，不是多知识源并行抢写。

没有板，压缩或换会话后会从主站 JS 重开一局，否定证据（SPA 壳、405、空数组、NXDOMAIN）最先丢。

## 何时调用

- 新目标开工、攻击面梳理开始
- 用户说「线索板 / 写板 / 读板 / 建板 / 继续挖」
- 会话压缩后续挖、换人/换会话接着测
- 本轮产生了 Host/路径/密钥/证伪结果，必须写回

**不要调用**

- 还在问「要不要做线索板」的概念题 → 直接按本文建板
- 漏洞已确认只成稿 → `src-report-gate`（成稿前读板上「已证实」行）
- 拆 JS / 打未授权 / 打越权本身 → 对应挖洞技能；本技能只规定读写

## 和挖洞技能的关系

```
开工 → hunt-clueboard 建/读板
         │
         ├─ JS 拆包 / 密钥提取     → wih-secret-hunter + js-api-reverse → 写回 1/2/3/5
         ├─ 零身份路径与钥         → unauth-path-key-hunt → 写回 2/3/4/7
         ├─ 角色 / IDOR            → redteam-auth → 写回 2 鉴权列
         ├─ 全方法 / BOLA / GraphQL → cybersecurity/testing-api-* + bola-session-detection
         └─ 成稿                   → src-report-gate（只读已证实）
```

## 铁律

1. **先读后挖。** 板上已证伪的 Host/路径本轮禁止当新发现再扫一遍。
2. **当轮写回。** 线索不进板，本轮收集不算完成。禁止「等下再整理」。
3. **板是台账不是日记。** 只写判断、出处、状态、下一步。
4. **否定证据优先。** 主站没有、SPA 壳、NXDOMAIN、错字段 `[]` 必须进第 4 节。
5. **PII 不进板。** 字段名和条数可以写；完整银行账号/手机/证件不写。原料进 `raw/`。

## 文件位置

```
reports/<TARGET_SLUG>/CLUEBOARD.md
reports/<TARGET_SLUG>/raw/          ← 可选，JS 摘录、响应头，禁止完整 PII
```

TARGET_SLUG 按 `target-scoped-workspace` 规范由 Host 生成（`api-gw.example.com` → `api-gw_example_com`）。一份目标一块板，不把多系统揉进一个文件。

板与 `findings/` `pocs/` `evidence/` `engagement/` 同级，分工不混：

| 载体 | 管什么 |
|---|---|
| `CLUEBOARD.md` | 作战线索记忆（假设/证伪/待打，未达 finding 级） |
| `engagement/vulnerabilities.md` | 漏洞三态账本（Theoretical/Candidate/Confirmed）；`findings/` 只收 Confirmed |
| `raw/` | 线索原料（JS 摘录、响应头）；Confirmed 后正式证据归 `evidence/` |

跨会话恢复双入口：先读板「当前焦点」+ `engagement/timeline.md` 尾部；两处对不上以 timeline 为准（append-only）。

建板：复制本 skill 目录 `CLUEBOARD.template.md` → 填 TARGET_SLUG 和开工日。已有板则只读补写，不另起。

## 读写协议

### 开工（每轮对话第一次碰这个目标）

1. 找 `reports/<TARGET_SLUG>/CLUEBOARD.md`，没有就从模板复制。
2. 读第 0/1/4/6 节，把「当前焦点」当成本轮第一任务。
3. 再调 `wih-secret-hunter` / `unauth-path-key-hunt` 等挖洞技能。

### 挖的过程中

每条可复用判断立刻追加到对应表，状态四选一：`假设` / `已证伪` / `已证实` / `待打`。

| 产出 | 写入 |
|---|---|
| 新 Host、301、同 IP | §1 |
| 路径/方法、405、`data:[]` | §2 |
| getRsaKey、JSEncrypt、字段名 | §3 |
| 扫过但无效 | §4 |
| appid/密钥（打码） | §5 |
| 下一步动作 | §6 |
| ✅/❌/🔄/💡 | §7 |

出处必须能指到公开面（JS 文件、urlscan、兄弟域指纹）。没有出处的路径保持 `假设`。

指纹怎么分类，见 `unauth-path-key-hunt` §P2，此处不重复。

### 收工（本轮结束前）

- 更新「当前焦点」为下一轮第一件事
- 假设仍超过 5 条就删最弱的或标证伪
- 板超过约 200 行：判断留在板上，原料搬 `raw/`

### 下「无此接口」之前

板上必须能看到失败升级已到 L4（网关 Host + 405/业务 JSON）。见 `unauth-path-key-hunt` §P7。不到 L4 不准用主站 404 结案。

## 禁止写成什么样

- 聊天记录粘贴、整份 bundle、HAR 全文
- 「今天测了很久」类过程散文
- 无状态的 URL 清单（必须有指纹和状态列）
- 把登录 Network 截图 URL 写成「已证实出处」（只能进假设，待公开面复原）

## Related Skills

- `target-scoped-workspace` — 板所在目录规范（reports/<TARGET_SLUG>/ 七件套同级分工）
- `unauth-path-key-hunt` — 零身份路径与密钥猎杀；板 §2/§3/§4/§7 的主要生产者
- `src-report-gate` — 成稿收口，只读板上「已证实」行
- `scope-gate` — 授权门，建板前置

## 交接一句

板是跨轮唯一工作记忆。压缩摘要、聊天里的接口列表都可以丢；**丢板等于没挖过。**
