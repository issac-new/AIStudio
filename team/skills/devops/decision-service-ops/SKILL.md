---
name: decision-service-ops
description: 查本地决策服务(:8000)引擎身份/变体选型/实例运维时用：本机证据优先于公网检索。
version: 1.0.0
metadata:
  hermes:
    tags: [decision-service, slux, engine-identity, variant-selection, ops]
---

# decision-service-ops — 本地决策服务身份核查与变体运维

## 何时用

- 回答「现在决策用的是哪个模型/变体」类身份问题
- 为 :8000 换权重/变体，或评估要不要加 AutoThink 离线仲裁实例
- 决策服务健康排查、LaunchAgent 常驻运维

问句设计、choice/noul/score 三原语、模板与输出口径不归本 skill——看 default
profile 的 `clef-jev`（本 profile 只读可 skill_view）。

## 铁律：身份问题先查本机，再查公网

内部部署对公网检索不可见。把「公网搜不到」当「不存在」会错判现场。
回答引擎身份的证据链，按序取：

1. `curl -s -m 5 http://127.0.0.1:8000/health` — `model`/`kind`/`think_mode` 字段直接给答案
2. `launchctl list | grep -i lux` — 常驻服务与 PID
3. LaunchAgent plist 的 `ProgramArguments` — 权重路径、backend、端口的最终事实
4. hindsight 记忆 + `~/.hermes/logs/startlux27-requests/` 请求记账（可算分歧率的对照臂）

公网只用来补官方基准与文档，不判本机在跑什么。

## 架构现状（以 health 实测为准，勿信本节旧值）

- 在线决策权 = 主 LLM；:8000 只收异步评估请求（fire-and-forget 落账，
  `SLUX_SHADOW_OFF=1` 关闭），不阻塞任何热路径
- 写入时现役：StartLux-Decision v1.1 27B-Instant MLX-4bit，
  LaunchAgent `ai.hermes.startlux27-serve`，权重内置盘+nvme 双份
- 已退役归档：clef-9B / clef-27B / slux-9B（nvme 冷存档区，含 manifest 与评测结果）
- 盘上未部署：27B AutoThink MLX-4bit（2026-10-19 下载，
  `/Volumes/nvme2230/lm-studio-model/startlux-models/StartLux-Decision-v1.1-27B-AutoThink-MLX-4bit`，
  15GB，17/17 文件与 HF rev 0049c33f 字节级一致）。判定变体看 config.json：无
  `jev_prompt_attention:"bidirectional"` 即 AutoThink（因果注意力）；其
  `decision_config.json` 无 `auto_think` 块属正常（引擎内置默认，serve 选项或
  auto_think 块可覆盖）。启动：`~/.venvs/startlux/bin/startlux-decide serve --model
  <上述路径> --backend mlx --port <非8000> --request-log <目录>`，发布配置 gate 0.9。
- 请求契约 `/v1/systemone`，与上游 jev 逐字兼容

## API 变体行为（易踩）

- Instant 权重对带 `think_mode: auto/always` 的请求回 422；`gate`/`mix`/
  `think_budget` 被接受但无效。要思考能力必须另起 AutoThink 权重的独立实例，
  不能对 Instant 发 think 字段。
- AutoThink 的思考是采样生成（按请求 settings+seed），不可复现；延迟可达百秒级；
  MLX 后端单 call 串行，思考请求会阻塞后续排队 → 永不进同步热路径，只做离线仲裁。

## 变体选型

详见 `references/variant-selection.md`（分数/分域/量化损失/旋钮权衡全表）。
核心规则：要「读」的题（路由/分类/归因预判）用 Instant；要「算」的题（规则核对、
对账复核、排班冲突这类对比对题形）才值得起 AutoThink 离线实例。AutoThink 关掉
思考后的单遍读出比 Instant 更弱——它不是「更好的 Instant」。

## 与 default profile clef-jev 的分工与欠账

- 分工：clef-jev 管怎么问（问句设计/模板/输出口径/安全纪律）；本 skill 管问谁、
  换谁、怎么跑（引擎身份/选型/部署运维）。
- 欠账：clef-jev 的 SKILL.md 仍写「clef-flash-4bit」「替代主 LLM 自评」及
  「决策回执落 clef-decisions.jsonl」，与现状不符——需在 default 前台会话
  （`hermes -p default`）patch 其标题、前置检查与请求契约的 model 字段后，
  同步删本节欠账说明。
