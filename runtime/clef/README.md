# clef 本地判定服务（toolresultguard S1 后端）

Clef 27B MLX 4bit（`mlx-community/clef-4bit`，Apache 2.0）本地 SystemOne 决策服务。
本目录 = 机器本地运行手册与脚本正本（venv 等实机产物在 `~/lab/clef-runtime/`，不入库）。

## 事实（2026-10-06 定选；延迟为当晚实测修正）

- 判定接口：`POST /v1/systemone`（兼容 TypeSafe Jev/SystemOne 协议；choice/score/noul 三原语）
- 运行方式：`clef_mlx.py serve`（**必须**——LM Studio / mlx_lm.generate 只加载骨干输出乱码，
  joint_head 决策头只有该脚本认）
- **端口 8001**：本机 8000 被 Laya MLX 服务占用（`~/.hermes/scripts/laya_mlx_serve.py`），
  clef 服务用 8001（`TRG_BASE_URL=http://127.0.0.1:8001`）
- **延迟实测（M1 Pro 32GB）**：287 token 稳态 13-14 s；653 token 中文 schema 163 s——
  **本机 27B 仅可用于异步低频判定**（摘要复审/工作流质量/回合完成态）；同步路径
  （逐消息路由、记忆召回过滤、守卫同步判定）不可用。toolresultguard 默认
  `TRG_TIMEOUT_MS=3000` 即为此设计（超时 fail-open，实际生效 S0 规则层）
- 内存边界：下载 16.3GB，峰值 17.1-19.6GB（1k/4k/16k token），32GB Mac 压线——
  判定输入裁剪 ≤4k token（toolresultguard `maxStateChars=6000` 已按此设定），16k 禁用
- 版本三元组（升级须过 toolresultguard 样本回归）：mlx 0.32.3 / mlx-vlm 0.7.6 / 快照 2026-10-06
- 4bit 代价：Decision Index 抽样 57.02（8bit 57.96，官方全量 61.21），文本顶层答案与 bf16 10/10 一致；注入样本实测判定质量正确（p=0.99 / A1 归类）

## 使用

```bash
# 启动（脚本自检分片是否下完）
bash overlay/runtime/clef/start-clef.sh

# 验证（健康检查 + 上游 jev.md 同款三原语样例 + 短/长 state 延迟实测）
bash overlay/runtime/clef/verify-clef.sh
```

## 与 SwarmStudio 的接线

- toolresultguard（P1a）：`TRG_BASE_URL` 默认 `http://127.0.0.1:8001`，`TRG_ENABLED=1` 启用
- 上游四门 JEV 集成切换（P2 第 0 步）：Models 页 JEV tab，API root 填 `http://127.0.0.1:8001`
  （不带 `/v1`），apiKey 任意非空串，model 用 `GET /v1/models` 返回名

台账：`docs/superpowers/specs/2026-10-06-five-article-research-and-capability-plan.md` §0/§P2
