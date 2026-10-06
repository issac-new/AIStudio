# clef 本地判定服务（toolresultguard S1 后端）

Clef 决策模型 MLX 4bit 家族本地 SystemOne 服务。本目录 = 机器本地运行手册与脚本正本
（venv 等实机产物在 `~/lab/clef-runtime/`，不入库）。

## 拓扑（2026-10-06 深夜定，Laya 已退役）

| 档位 | 模型 | 端口 | 实测延迟（M1 Pro 32GB） | 用途 |
|---|---|---|---|---|
| **主力** | `mlx-community/clef-flash-4bit`（9B） | **8000** | 287tok 3.3-3.6s；守卫 schema 646tok 8.8s | 一切判定（含守卫同步路径） |
| 备件 | `mlx-community/clef-4bit`（27B） | 8001 | 287tok 13-14s；646tok 163s | 异步低频高质量判定（`CLEF_MODEL=27b` 手动起） |

- 判定接口：`POST /v1/systemone`（兼容 TypeSafe Jev/SystemOne 协议；choice/score/noul 三原语）
- 运行方式：`clef_mlx.py serve`（**必须**——LM Studio / mlx_lm.generate 只加载骨干输出乱码，
  joint_head 决策头只有它认）；LM Studio 只当下载器（模型目录在 nvme2230 的 lm-studio-model）
- Laya 退役记录：服务已停、plist/脚本归档于 `~/.hermes/backup/laya-retired-20261006/`、
  venv 1.2G 与 HF 缓存重复副本 5.8G 已删（合计腾 7G）

## 使用

```bash
# 启动主力 flash（默认；自检分片是否下完）
bash overlay/runtime/clef/start-clef.sh
# 启动 27B 备件（异步低频场景才用）
CLEF_MODEL=27b bash overlay/runtime/clef/start-clef.sh

# 验证（健康检查 + 上游 jev.md 同款三原语样例 + 延迟实测）
bash overlay/runtime/clef/verify-clef.sh
```

## 与 SwarmStudio 的接线

- toolresultguard（P1a）：`TRG_BASE_URL` 默认 `http://127.0.0.1:8000`（flash 主力）、
  `TRG_TIMEOUT_MS` 默认 12000（flash 守卫 schema 实测 8.8s）、`TRG_ENABLED=1` 启用
- 上游四门 JEV 集成切换（P2 第 0 步）：Models 页 JEV tab，API root 填 `http://127.0.0.1:8000`
  （不带 `/v1`），apiKey 任意非空串，model 用 `GET /v1/models` 返回名；
  flash 档下路由类同步门也可切（3.3-3.6s/条，体感自定），27B 档仅摘要复审/工作流质量

## 纪律

- 内存边界：flash 峰值 ~7-8.6GB 宽裕；27B 峰值 17.1-19.6GB 压线 32GB——两档**不同时跑**
- 判定输入裁剪 ≤4k token（toolresultguard `maxStateChars=6000` 已按此设定），16k 禁用
- 版本三元组（升级须过 toolresultguard 样本回归）：mlx 0.32.3 / mlx-vlm 0.7.6 / 快照 2026-10-06
- 4bit 代价：flash Decision Index 抽样约 -1 分（54.65 vs 官方 57.07）；27B 57.02（8bit 57.96）；
  两档注入样本实测判定质量均正确（27B p=0.99/A1；flash p=0.95/A7）

台账：`docs/superpowers/specs/2026-10-06-five-article-research-and-capability-plan.md` §0/§P2
