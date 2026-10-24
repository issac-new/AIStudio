---
name: poc-evidence-snapshot
description: "Use when recording a verified PoC/finding in an authorized engagement — bind SHA-256 content-addressed snapshots of request/response evidence to the finding so it is replayable and tamper-evident. Analysis/record-keeping skill: works on evidence files already captured within scope."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [exploit, evidence, sha256, content-addressed, replay, artex]
    source: "ARTEX evidence store: evidence/store.go:62-116, traffic/traffic.go:545-552 (T1§9); T4 合并报告矩阵#5"
    target_profile: hack-exploit
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# PoC Evidence Snapshot — SHA-256 内容寻址证据快照绑定

> 对照 ARTEX evidence store：流量/证据 SHA-256 内容寻址快照 + finding 绑定版本（`evidence/store.go:62-116`）。本集群基座 = target-scoped-workspace 的 `evidence/` 目录。本技能定义**证据落盘与绑定规范**，不产出任何攻击内容。

## 何时用（触发条件）

- 一个 PoC/finding 已验证，要写进报告——必须绑定可复放证据，不接受「只写文字描述」
- findings 复盘时需要证明「证据未被事后改动」（防篡改）
- 交接给 reviewer/auditor 时需要「自包含可复放」的证据包

## 目录与绑定格式

```
<workspace>/evidence/
├── blobs/<sha256>            # 内容寻址快照（请求/响应原文/截图/工具输出）
└── index.jsonl               # 一行一绑定记录
```

index.jsonl 条目：

| 字段 | 说明 |
|---|---|
| finding_id | finding 编号（f-xxx） |
| blob_sha256 | 证据内容 sha256（= blobs/ 文件名，内容寻址） |
| kind | request / response / screenshot / tool-output |
| replay | 可复放命令或步骤（纯描述；如 curl 命令模板） |
| captured_at | epoch |
| card_id | 采集卡号 |

**铁律**：blob 文件名 = 其 sha256。改一个字节 → sha 变 → 立即可见。绑定记录不含敏感值本身（值在 blob 里，blob 属 scope 内证据，按 target-scoped-workspace 归档）。

## 标准步骤

1. 证据文件已存在（scope 内已采集）→ 快照：`python3 scripts/ev_snapshot.py --evidence-root <dir> --finding f-001 --kind request --file <path> --replay "curl 模板描述"`
2. 查询 finding 的全部证据：`python3 scripts/ev_verify.py --evidence-root <dir> --finding f-001 --list`
3. 收尾防篡改校验：`python3 scripts/ev_verify.py --evidence-root <dir> --all`（重算全部 blob sha256 对账 index，漂移即 exit=1）
4. 报告引用：引用 `blob_sha256` 而非文件路径——路径会变，hash 不会

## 陷阱

- 直接把证据文件留在 /tmp 或卡 workspace scratch → 24h 清理后证据蒸发。必须落 `evidence/blobs/`（持久层）
- 报告写「见附件 screenshot.png」→ 附件重命名/重压缩后断链。用 sha256 引用
- `--all` 校验发现漂移（index 记录的 sha 与 blob 实际 sha 不符）→ 按篡改/损坏处置，先 block 查因，不要「顺手修 index」迁就现状
- replay 字段只写已授权范围内的复放描述；禁止在此字段嵌入任何未授权目标的操作指令

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/poc-evidence-snapshot/scripts/accept_poc_evidence_snapshot.py
# 预期输出末行：ALL GREEN poc-evidence-snapshot acceptance exit=0
# 含 2 次预期真实拦截：
#   T1 篡改 blob 后 --all 校验抓出 sha 漂移（exit=1）
#   T2 index 引用不存在的 blob 校验抓出悬空绑定（exit=1）
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_poc_evidence_snapshot.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实拦截 1（T1）：快照后篡改 blob 内容 1 字节，`ev_verify --all` 重算 sha256 抓出漂移 exit=1。
- 真实拦截 2（T2）：手工插入指向不存在 blob 的绑定行，校验抓出悬空引用 exit=1。

## 与既有机制关系

- 下游承接 `exploit-chain-runner`（链步骤 evidence ref → 本技能 blob 绑定）
- 对接 `evidence-gate` / `verify_finding.py`（机械校验证据存在性由其承载，本技能管内容寻址与防篡改）
- 落 `target-scoped-workspace` 的 `evidence/` 目录（持久层，随 engagement 归档）

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。
