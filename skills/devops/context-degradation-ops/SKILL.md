---
name: context-degradation-ops
description: Use when 长会话退化/上下文压缩机制/压缩模型治理类调研与完善方案
tags: [hermes, context, compression, long-session, runtime]
---

# 长会话退化与上下文压缩（运行时机制速查）

落位说明：本件承载 autonomous-ai-agents:hermes-agent（伞内技能，skill_manage 不可寻址，见 orchestrator-profile-skill-writeback）路由表未覆盖的调研成果。hermes-agent 路由表若后续加入本域条目，以那边为准并删除本件，防双事实源。

适用问题类：「多轮长会话稳定性/质量/指令遵循越来越差，如何完善运行时」「上下文压缩怎么工作的」「压缩模型能不能换」。机制结论以源码为准；行号随版本漂移，以文件路径与符号名为锚。

## 机制事实（源码验证，本机 git 安装树 `~/.hermes/hermes-agent`）

- 内置压缩器是有损摘要：廉价辅助模型摘要中段 turn，只保留头尾。出处：`agent/context_compressor.py` 模块 docstring；`hermes_cli/config_defaults.py` 中 `context.engine` 注释原文 "compressor = built-in lossy summarization"。
- 压缩目标比例默认 `summary_target_ratio: float = 0.20`（`context_compressor.py`）：中段压到原大小 20%，细节第一轮压缩即丢；多次压缩损失复合——指令约束、验收标准这类细节最先被丢。
- 摘要模型走 auxiliary 通道（`context_compressor.py` 引 `agent.auxiliary_client`，配置键 `auxiliary.compression`）：摘要模型弱，压缩后 agent 就在二手转述上继续工作。
- 断路器（`_tripped`）：provider 证实的无效压缩 ≥2 次跳闸，另有摘要失败 cooldown 与 structural backoff。它只防「压缩失败」，不防「压缩成功但关键约束已丢」。
- 压缩策略可整体替换：`config.yaml` 的 `context.engine`（默认 `"compressor"`），插件引擎放 `plugins/context_engine/<name>/`，导出 `ContextEngine` 子类，永不自动激活。插件 ABC 见 `agent/context_engine.py` 与官方文档 developer-guide/context-engine-plugin。
- 引导式压缩：`/compress <focus_topic>` 把 focus 传给引擎，支持引导压缩的引擎优先保留该主题的信息。
- 压缩遥测已存在：`agent/conversation_compression_telemetry.py`；state.db 用 `parent_session_id` 记录压缩触发的会话分裂。观测面已有，默认无人消费。

## 「如何规避长会话退化」决策顺序

按此顺序给方案，逐层升级，不跳级：

1. **配置层**：治理 `auxiliary.compression` 摘要模型档位，长会话重度 profile 用较强推理档。摘要质量决定压缩后全部后续会话的保真度；成本集中在压缩瞬间。
2. **纪律层**：状态外置——目标/约束/验收清单/阶段进展落盘 workspace 文件，不信任上下文持久性；压缩后靠 re-read 文件恢复而非靠摘要记忆。主动 `/compress` 带 focus topic，不等自动压缩随机丢。
3. **观测层**：消费压缩遥测，单会话压缩次数超阈值（如 ≥3）的卡标记退化高风险、收卡验收加严；验收清单中途机械抽查，不只收卡时验收。
4. **引擎层（最后）**：换/写 context-engine 插件（knowledge-DAG 类无损引擎）。工程量大，1–3 落地后大概率够用；遥测显示压缩仍是瓶颈再立项。

## 落地状态（2026-10-12 四项全部完成，机械验收过）

1. 配置层：全 fleet `auxiliary.compression.model` → `claude-opus-5`（47 profile + 根 config，单键 patch 零漂移，备份可回滚）。**通道实测**：cc-switch 直写 glm-5.3/aim 会被降级成 flash，opus 系别名是唯一可达的非 flash 强档入口。
2. 纪律层：`long-session-hygiene` 技能（orchestrator/skills/devops/，已传播 worker-coder/researcher/tester/ops-devops）。
3. 观测层：`~/.hermes/bin/compression-report.py`（只读双模式，HIGH_RISK=压缩≥3/会话）。
4. 引擎层：LCM 插件已交付——workspace/t4-lcm-engine（64/64 单测+冒烟硬证据），装在 `~/.hermes/plugins/lcm/` + 字面路径副本。**试点已激活（2026-10-12 用户裁决方案 A）**：worker-coder profile `context.engine: lcm`（激活前配置备份 pilot/worker-coder-config-before-*.yaml，回滚=同命令设回 compressor）。激活实证=真实会话日志 `INFO lcm: LCM session start` + `cache/lcm/<sid>/lcm-dag.json` 写出；观察基线 pilot/baseline-worker-coder-*.txt，一周后用 compression-report --db <worker-coder state.db> 对比压缩频次。其他 profile 仍 compressor。

**激活/配置变更验收门**：config 读回只证明写入意图，不证明引擎加载——「已激活」必须拿运行时证据：真会话跑一发（one-shot 含工具调用即可），日志出现引擎特征行（lcm 为 `INFO lcm: LCM session start`）且 on_session_end 写出状态文件（`cache/lcm/<sid>/lcm-dag.json`）才算数。别拿 `hermes tools` 无引擎工具当回退判据——列工具子命令可能不装配 context engine，已加载的引擎在工具列表里可以一个工具都不出现（弱证据，实测过）。扩大激活范围或回滚后各重验一发。

**激活操作坑**：`hermes config set` 的 profile 选择认 `HERMES_HOME`（指向 profile home），不认 `HERMES_PROFILE`——后者会静默写进当前 profile 的 config（已踩，误写后需立即设回）。通用插件加载器对 plugin.yaml 的 kind=context_engine 报 unknown kind 按 standalone 处理，无害（引擎走独立发现通道），日志噪声可忽略。

**实现坑（激活/二次开发必读）**：① 用户级引擎真实发现路径是 `$HERMES_HOME/plugins/<name>/`，非文档字面 `plugins/context_engine/<name>/`；② profile 模式（`-p`）只看 profile home 内 plugins/，全局 `~/.hermes/plugins` 装法对 profile 会话不可见（曾静默回退 compressor 假阴性）；③ profile 运行时 HERMES_HOME 已是 profile home，状态路径勿再拼 profiles/<name>。

## 调研手法（本类问题通用）

1. 先拉 `llms.txt` 定位官方文档页（本类：`/developer-guide/context-engine-plugin`、`/user-guide/sessions`、`/user-guide/features/delegation`）。
2. 本机源码树 grep 配置键与类名拿 file:line 锚点；模块 docstring 第一段通常是机制一句话说明。
3. `hermes_cli/config_defaults.py` 是全部配置键默认值与官方注释的单一落点，搜键名比搜功能词快。
