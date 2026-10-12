---
name: protected-file-approval-handling
description: >-
  受保护文件审批门处置：归位可做、挂接等批、不换路径重试。
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, approvals, guardrail, orchestration, kanban-worker]
    related_skills: [agent-soul-patching, kanban-db-guarded-writes, worker-completion-independence-verification]
---

# 受保护文件审批门处置（protected-file-approval-handling）

> 来源：2026-09-25 会话（t_de25eba6 悬空收口）。知识文件已归位但 3 处 SOUL 编辑被审批门拦，
> orchestrator 两次申请审批均超时，按红线停手留痕。提炼为通用处置链。

## When to Use

- worker 因 SOUL.md / agent-instruction 受保护文件写入被审批门拦而 blocked
- 同一文件双路径拷贝（workspace 镜像 vs 真实配置区）未同步，疑似「写了但没落地」
- clarify 审批超时，需决定是否重试
- 卡的产出分「文件归位」与「SOUL 挂接」两半，验收需分开判定

## 核心红线

**headless 审批超时 ≠ 批准（silence is not consent）**。审批超时后不得：
- 代写（orchestrator 直接 patch 受保护文件）
- 换路径重试（写 workspace 镜像目录、cp 绕写、让另一个 worker/delegate 再试）
- 反复催批（连试 2 次超时后必停）

换路径重试=绕护栏，等于把审批门当噪音。审批门拦的就是这个动作。

## 处置链（按序执行，不跳步）

### 1. 双路径比对：区分「归位」与「挂接」

同一份内容常有两处拷贝：
- **workspace 镜像**：`workspace/profiles/...`（worker 编辑用，git 管）
- **真实配置区**：`~/.hermes/profiles/...`（实际生效）

worker 写对了镜像副本但真实区未同步 = **没落地**。归位前先比对：

```bash
ls -la <真实路径> <镜像路径>   # 比对 size/时间戳
```

### 2. 归位半边随时可做（orchestrator 直接执行）

知识文件/产物 cp 到真实路径，复核 size 一致。这一步只动文件不动受保护字段，不触审批门：

```bash
cp <镜像路径>/<file> <真实路径>/
ls -la <真实路径>/<file>   # 复核 size 与镜像一致
```

### 3. 挂接半边走审批门（锚点定稿→留痕→申请→停）

SOUL/SKILL 引用挂接属受保护编辑：

1. **锚点定稿**：`grep -n` 精确到行，把 old_string/new_string 写进 kanban_comment 留痕——审批一过即可盲落，不需二次定位
2. **clarify 向用户申请一次**（列清楚每处锚点+编辑内容）
3. **超时即停**：卡留 `blocked`，comment 留痕（哪些已落地 ✅ / 哪些待审批 ⏳），不反复重试

### 4. 卡验收标准分半列勾选

frozen 验收标准把归位/挂接分开列：

```markdown
## 验收标准（frozen: true）
- [x] 知识文件归位真实配置区（ls 复核 size 一致）
- [ ] SOUL 引用挂接 N 处（⏳待用户审批，锚点已定稿见 comment）
```

避免因审批悬空把已落地的半边也报未完成，误导下轮验收。

## 常见错误形状（反例）

| 错误 | 为什么错 | 正确 |
|---|---|---|
| worker 写 workspace 镜像就报「知识已沉淀」 | 真实配置区未同步，运行时不读镜像 | cp 归位 + ls 复核 |
| orchestrator 看 worker 被拦就代写 | 换执行者=换路径重试，绕护栏 | 锚点留痕 + 向用户申请 |
| clarify 超时再试一次、再试一次 | 催批=把护栏当噪音 | 2 次超时后必停，卡留 blocked |
| 因 SOUL 挂接悬空报整卡未完成 | 归位半边已落地，整卡未完成=误报 | 验收标准分半列勾选 |

## 与相关 skill 边界

- `agent-soul-patching`：SOUL 批量补丁的**编辑技法**（怎么改）；本 skill 是**审批门处置**（何时能改、何时停手）
- `kanban-db-guarded-writes`：DB 层护栏过墙（认证连接 API）；本 skill 是文件层保护门（审批流）
- `worker-completion-independence-verification`：worker 自述验收；本 skill 是 worker 被拦后的 orchestrator 处置
