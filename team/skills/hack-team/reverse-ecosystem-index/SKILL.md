---
name: reverse-ecosystem-index
description: 逆向生态索引第一跳——动手拆任何闭源 app/API/设备/协议/文件格式之前，先查 awesome-reverse-engineered（17,728 个逆向成果开源项目，nightly 刷新）是否已有人拆过。Use when 逆向工程/私有协议对接/文件格式解析/设备 IoT 互通任务开工前，先搜再做（search-first）。
version: 1.0.0
license: "script: MIT (vendored from alexgaoth/awesome-reverse-engineered); data: CC0 1.0"
routing:
  phase: [recon]
  target_type: [binary, mobile, network]
  technologies: []
  vuln_hints: []
  task_types: [recon, research]
is_broad_knowledge: true
aliases: [re_index, awesome-reverse-engineered, reverse-engineered, reverse-ecosystem-index, ecosystem-index]
---

# Reverse Ecosystem Index — 逆向生态索引（search-first 第一跳）

> 一句话：**动手拆之前，先查别人拆过没。**
> 索引 = awesome-reverse-engineered（github.com/alexgaoth/awesome-reverse-engineered，
> 17,728 个因逆向闭源 app/API/设备/协议/文件格式/游戏/AI 产品而生的开源项目，
> nightly 自动刷新，MIT 代码 + CC0 数据）。
> 本技能 = 该索引的本地检索客户端（vendor 上游单文件脚本 `re_index.py`，纯 Python stdlib）。

## a. 触发条件（开工前，不是卡壳后）

以下任一任务**开工第一跳**先跑本技能检索：

- 逆向工程：二进制 / APK / 固件 / Electron 应用
- 私有协议对接：无官方 API 的 app / Web 服务 / 云端接口
- 文件格式解析：私有容器 / 序列化 / 多媒体封装格式
- 设备 IoT 互通：智能硬件本地控制 / 蓝牙 / WiFi 协议 / 消息协议

> ⚠️ 这是流程纪律（prompt 级建议，无运行时强制）。实际接线点：
> ① 派单词写明「先查 reverse-ecosystem-index」；② knowledge-base/INDEX.md 头部指引行；
> ③ skill-resolver routing 元数据（phase=recon + target_type=binary/mobile/network）。

## b. 先搜再做三步

```bash
SCRIPT=~/.hermes/skills/hack-team/reverse-ecosystem-index/scripts/re_index.py
python3 $SCRIPT search <产品/厂商/协议关键词>   # ① 搜：ranked matches（star/健康度/匹配度排序）
python3 $SCRIPT info <owner/repo>              #    看条目 + README 节选
python3 $SCRIPT clone <owner/repo>             #    浅 clone 到 ./vendor/<name>（先确认 license）
python3 $SCRIPT categories                     #    浏览全部 20 个分类及计数
```

1. **search**：按产品 / 厂商 / 协议搜（英文关键词命中最好，中文平台类用产品英文名）。
2. **found（别人拆过）** → **用 + 修 + 上游报障**：直接用它，缺功能提 PR，坏了开 issue。
   一个维护中的客户端胜过十个私有脚本。
3. **not there（没人拆过）** → **做 + 开源 + 提交回索引**：自己拆完开源发布，
   再到上游开 issue/PR 把条目加进 `data/entries.json`，下个人从你停的地方开始。

数据两级模式（脚本内置）：

- **在线（默认）**：首跑自动拉取 `entries.json`（~7.9MB，17,728 条）到本技能 `data/`，
  之后每 24h 自动刷新一次；
- **离线**：`RE_INDEX_OFFLINE=1` 跳过网络刷新，只查本地副本（取证/隔离环境用）；
- 也可 `RE_INDEX_DATA=/path/to/entries.json` 强制指定数据文件。

实测输出（2026-11-02 本机，在线模式首跑）：

```
$ python3 scripts/re_index.py search tuya local
1. LocalTuya  ★4,013 · Python · GPL-3.0 · pushed 2026-01-29
   https://github.com/rospogrigio/localtuya
   Home Assistant integration for local control of Tuya devices without the cloud  [Devices, IoT & Hardware › Smart Home & IoT]

2. tuya-local  ★3,631 · Python · MIT · pushed 2026-10-31
   https://github.com/make-all/tuya-local
   Home Assistant integration for local Tuya device control with per-device configs  [Devices, IoT & Hardware › Smart Home & IoT]
```

离线模式同口径实测（`RE_INDEX_OFFLINE=1 python3 scripts/re_index.py search wechat protocol --limit 3`）
返回 wechat-ipad-protocol ★345 / openwechat ★5,464 / wechat4u ★1,862，ranked 输出正常。

## c. 健康度纪律（依赖前必查）

非官方 API 会随厂商单方面变更失效——**依赖任何条目前先看健康度**：

| 档 | 含义 | 依赖政策 |
|---|---|---|
| 🟢 Active | 12 个月内有 push | 可依赖 |
| 🟡 Slowing | 上次 push 1–3 年 | 可用，评估维护断层风险 |
| 🔴 Dormant | 3 年以上无 push | **依赖前必须声明风险** |
| 🗄️ Archived | 已被 owner 归档 | **依赖前必须声明风险**（视为只读参考） |

🗄️/🔴 项目进交付前，必须在回执 / finding 里显式声明「基于休眠/归档项目，
上游接口可能已变更打断」。`clone` 之后先看最近 commit 日期再决定投入多少。

## d. Scope 边界声明（与我方红线对齐）

该索引**只收互操作 / 保存 / 研究类**项目：非官方客户端与 SDK、开放驱动、
本地控制库、文件格式解析器、协议文档、重实现与反编译。上游 scope filter
**故意排除**：exploit / 越狱、安全或证书绑定绕过、解密工具、作弊、DRM 或
付费墙移除、验证码求解、账号机器人与凭据工具（已剔除 202 个仓库）。

两条纪律：

1. **索引收录 ≠ 我方授权**。索引内容不改变我方授权门判定——任何目标侧动作
   仍须过 scope-gate 与授权门，与本索引无关。
2. 排除清单与我方红线同向但不是替代：用索引里的合法互操作工具去做越权的事，
   仍按我方红线处置。

## e. 与 knowledge-base / failure-trace-index 的分工

| 库 | 回答的问题 | 谁更新 |
|---|---|---|
| **reverse-ecosystem-index（本技能）** | 「别人拆过没？」全球生态既有成果 | 上游 nightly 自动刷新 |
| knowledge-base | 「我们自己沉淀的打法」（方法论 / payload / 检测基线） | 我方任务写回 |
| failure-trace-index | 「这条路我们自己踩死过没？」跨卡死路账本 | 我方任务写回 |

开工检索顺序：**先查本索引**（全球有没有）→ 再查 knowledge-base（我们有没有）
→ 再查 failure-trace-index（我们踩过的坑）→ 三处都空，才从零动手拆；
拆完按 b-3 回馈开源与索引。

## 维护信息

- 上游：github.com/alexgaoth/awesome-reverse-engineered（MIT 代码 + CC0 数据，nightly refresh）
- vendored 文件：`scripts/re_index.py`——保留 MIT license 头，三处文档化本地改造
  （数据路径指本技能 `data/`；`RE_INDEX_OFFLINE` 离线模式；docstring 同步），其余与上游逐字节一致
- 落地任务：t_4513aa9a（2026-11-02 融合 Wave1-A）
- 数据快照 `data/entries.json` 由脚本自动拉取/刷新（勿手工编辑；删掉后下次运行自动重拉）
