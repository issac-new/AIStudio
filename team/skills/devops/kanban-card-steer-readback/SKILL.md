---
name: kanban-card-steer-readback
description: "Use when 读回在跑卡 body 或 steer 改向 worker：CLI 截断坑与 comment 通道。"
version: 1.0.0
metadata:
  author: orchestrator
  license: MIT
  hermes:
    tags: [kanban, orchestrator, steer, closeout]
    related_skills: [orchestrator-fusion-closeout, orchestrator-dag-supervision-forensics]
---

# Kanban 在跑卡的读回与改向（orchestrator 侧）

## When to Use

- 需要读回 running 卡的 body（确认 worker 看到的任务书）
- 需给在跑 worker 中途改向（steer）：工作已由其他轨完成转验收、补充侦察结论、收缩范围
- complete 被「running under a live worker claim」拒，需处置双轨卡
- 卡对 CLI 可见但物理库定位失败

管理对**running 状态 kanban 卡**的读写操作。相关但不同域：卡片生命周期修复见 kanban-card-lifecycle-repair；DAG 监督取证见 orchestrator-dag-supervision-forensics；双轨收口见 orchestrator-fusion-closeout §六。

## 读卡：CLI 是唯一可靠通道，但 body 有截断边界

- 读卡统一走 `hermes kanban --board <slug> show <id> --json`。**task.body 截断在 2000 字符**——长卡 body 末段（常是收尾契约/验收标准尾部）在 CLI 视图里不可见。
- 因此**禁止**「CLI 读回 body → 拼接新段 → `edit --body` 重写」：截断视图重建全文会把尾段静默丢掉。body 重写仅当完整原文另有出处（建卡时的原文变量/早期完整读回）时才做。

## 改向（steer）：comment 是默认通道

- 给在跑 worker 输送改向指令（工作已完成转验收/补充侦察结论/收缩范围），写 `kanban_comment`——worker 重读卡时 comment 与 body 同载，且 comment 无截断、不覆盖任何原文。
- comment 内容三件套：已完成清单（防重复执行写操作）+ 可直接粘贴的验收命令（含期望输出）+ 不符时的处置（block 回报附实际输出）。
- 双轨卡（orchestrator 会话亲干 + dispatcher 又派 worker 同卡）的信号是 complete 被「running under a live worker claim」拒——此时 steer comment 要显式声明「禁重复写操作，只验证收卡」，防 worker 重跑已落地的变更。

## 卡库定位：找不到物理库时别猎库

- 卡对 CLI 可见但对 `boards/*/kanban.db`、profile 级 kanban.db 不可见（空壳库/表不存在）时，不要升级为全 ~/.hermes grep 扫库——多库空壳+目录大体量下只会收获超时。读写一律收敛到 CLI；确需物理库时先看 CLI help 给出的解析规则，不猜路径。

## Pitfalls

- **验收 grep 0 命中先换工具复核**：对中文/emoji 边界、含 shell 转义的 grep/awk 区间抽取报 0 时，先换 sed 区间或直读文件再判「内容缺失」——管道转义错误与内容缺失同形，误报会冤杀完好交付并触发无谓返工。
- **steer 后要盯到终态**：comment 只是输送，不是收口——改向后轮询 `show --json` 直到 done/blocked，并以独立抽查（非自述）确认验收真跑过。
