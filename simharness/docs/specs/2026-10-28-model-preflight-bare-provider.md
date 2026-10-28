# 模型预检探针认 0.22.5 裸 provider 名（run23 起跑红根治）

日期：2026-10-28 ｜ 状态：已实施 ｜ 关联：run23 起跑（RUN_ID=20261028-v8-run23）

## 变更

`mux/mx-lib.sh` `model_preflight()`：provider 间接引用解析去掉 `custom:` 前缀强绑定——裸名（如宿主 0.22.5 归一产出的 `cc-switch-route`）同样按 `custom_providers[]` 名字查表解析 base_url/api_key/model；`custom:<名>` 前缀形态保持兼容。探针请求链（anthropic `/v1/messages` → openai `/chat/completions` 候选）不动。

## 决策记录

- **D1 修探针，不改 profile 归一**：宿主 config.yaml（0.22.5）的模型段就是 `model.provider: <裸名>` + `custom_providers[]` 形态，真实 agent 链路（网关 → cc-switch `127.0.0.1:15721/hermes/v1`，api_mode=codex_responses）按此形态工作正常（实测 POST `/hermes/v1/responses` 200、`/hermes/v1/chat/completions` 200）；探针是唯一没跟上该形态的消费方。改归一写 `custom:` 前缀＝与宿主真实形态脱钩且要动两处，修探针＝单点对齐 hermes 自身解析序。
- **D2 兜底链不动**：anthropic 面 404（该路由无此面）后 openai 候选已实测可达，修复解析后自然命中 `ok`。
- D3 run 中热修按 run22 纪律走原子替换（temp+mv），监督器 30s 重试循环自动吃到新码，无需重启监督器。

## 验证

- 修复前实录：17:40-17:43 三轮驱动 rc=1，15 profile 全 `unreachable`（supervisor 日志 20261028-v8-run23-supervisor.log）。
- 修复后：`model_preflight` 逐 profile 全 `ok`（本 spec 随批附实测输出）；监督器下轮重试过预检进入 smoke 步。

## 设计文档影响

DESIGN_SYNC: none——探针是 harness 内部判读工具，不触及方案 V8.55 的 26 步/六闸/判据冻结面，整合正本无需修订。
