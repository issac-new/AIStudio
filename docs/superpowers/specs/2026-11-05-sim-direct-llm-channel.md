# 2026-11-05 SIM 直连 LLM 通道（脱离 cc-switch 代理）

## 变更

- 新增 `simharness/mux/mx_model_channel.py`：SIM 直连 LLM 通道单一事实源——XGLM 主通道、SGLM fallback、模型 glm-5.3、上下文 1M、协议 anthropic_messages；base_url 与两把 api_key 运行时从 cc-switch DB（providers 表 app_type='hermes' 的 XGLM/SGLM 行）读取，不硬编码。CLI：`--emit-config`（打印模型三键段）/`--check`（直连形态判定，setup 后守门/幂等检查）；库接口 `apply_direct_channel(out)`。
- `simharness/mux/mx-lib.sh` 三处生成器（write_root_config/write_user_profile/write_agent_profile）在拷贝宿主快照模型段后统一调用 `apply_direct_channel(out)` 整段替换模型三键（model/fallback_providers/custom_providers）；调用点 env 注入 `MX_MUX_DIR`（BASH_SOURCE 定位，免依赖调用方 SCRIPT_DIR）。回滚开关 `MX_MODEL_CHANNEL=host`（沿用宿主快照模型段）；临时换库用 `MX_MODEL_CC_DB` 指定别的 DB。
- 新增 `simharness/tests/sim-direct-channel.test.ts`：六面守门——emit 取数（DB 两 key 各归其位、1M、anthropic_messages）、DB 缺行响亮失败、host 回滚 no-op、--check 双态（直连过/代理形态拦）、三生成器接线计数（缺一处=下轮 setup 再生回代理通道）、mx-lib 语法门。
- 存量 SIM 运行树（root config + 42 profile）已同批用同规则改写为直连形态（备份 `SIM_ROOT/var/backups/profiles-direct-20261105-185420/`，改写器 `var/rewrite_profiles_direct_llm.py` 幂等可重跑），本轮 run27 在途 spawn 即直连；本 spec 落地保证 run28 起 mx-setup 再生时不再回退代理通道。

## 决策记录

- 根因（run27 烧机三连熔断＋run25 429 风暴实录）：cc-switch 本地代理是 SIM LLM 通道的单点故障面——idle 掐流（streaming_idle_timeout 120s 掐死深思考静默段）、流截断、请求重试风暴三次致熔断；通道修复（改库调超时）治标不治本。用户指令 2026-11-05：推演所用 hermes agent 全编制统一直连，配置信息从 cc-switch 取，协议统一 anthropic。
- 协议落地取 **anthropic_messages＋端点后缀双保险**：base_url 以 `/anthropic` 结尾时 hermes `host_mandated_api_mode` 会把会话钉死在该协议（providers.py），即使档内 api_mode 残留旧值也不漂移；helper 对该后缀做显式校验，通道换非 anthropic 端点须重新评估。
- **fallback 走 hermes 原生链**（`fallback_providers` 裸名引用 custom_providers，凭证经 `_named_custom_rung` 解析）：不引入新故障面，与产品自身 provider_fallback 评测面同构。
- **值不硬编码**：key/base_url 每次 provisioning 时从 cc-switch DB 活取——cc-switch 仍是凭证单一事实源（用户口径「配置信息从 ccswitch 中取」），SIM 只是不再经它的代理转发面；换钥重跑 mx-setup 即生效，DB 缺行响亮失败防半套配置。
- TLS 前置验证：SIM 网关 venv Python（uv OpenSSL 默认路径）与 anthropic SDK（httpx）对 bigmodel 证书链验证实测通过（系统 python3 因 python.org 发行版无默认 CA 而失败，与网关无关，不处置）。
- 不动宿主 `~/.hermes/config.yaml`（宿主 Hermes 桌面应用通道不在本指令范围）；SIM 生成器在拷贝后覆写模型段，宿主源保持原样。

## 验证

- `npx vitest run tests/sim-direct-channel.test.ts`（simharness 树）：6/6 全绿（夹具自持：临时 sqlite DB 双通道行）。
- `bash -n simharness/mux/mx-lib.sh` 语法门过。
- 生成器代码路径端到端（真宿主 `~/.hermes/config.yaml` 源＋真 cc-switch DB）：产出直连段（provider=xglm/fallback=sglm/anthropic_messages/两 key 互异），model_catalog 等其余键原样保留。
- 通道实测（2026-11-05 18:5x）：XGLM/SGLM 两 key 经网关同款 venv anthropic SDK 直打 `https://open.bigmodel.cn/api/anthropic/v1/messages`——两路 200、2.3s 完整回合（thinking+正文+end_turn、上下文 1M 档）；改写后 SIM 侧 cc-switch /hermes/v1 零新流量。
- 存量 42 profile＋root config 改写后结构断言全过（provider/fallback/api_mode/context_length/key 互异/无 15721 残留）。

## 设计文档影响

DESIGN_SYNC: none——harness 运行环境供给面变更（LLM 通道从本地代理改直连），模型语义（glm-5.3/1M）与推演闸门协议未变，不触及整合正本与数字总账；通道决策记录以本 spec 为事实源。
