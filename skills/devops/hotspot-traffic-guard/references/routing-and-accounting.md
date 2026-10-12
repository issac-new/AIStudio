# 路由语义与流量计量判定表

## 1. 「直连」的两层语义

| 层 | 含义 | 观测手段 |
|---|---|---|
| 应用层直连 | 应用未调用应用代理（cc-switch/HTTP_PROXY 等），自己发起到目标的 TLS | `ps -E -p <pid>` 看 env；应用配置文件 baseUrl |
| 系统层路由 | macOS 按路由表把流量交给某接口（en0 / utun*） | `route -n get default`；`lsof -nP -i` 看套接字绑定的本地地址 |

**判定规则**：说「X 直连模型服务」只覆盖应用层。系统层走不走 VPN 由默认路由决定，
与应用直连无关。两层都核对完才能描述「请求经过哪个组件」。
错误示范：把「SFM 全局隧道接管默认路由」说成「应用通过某 VPN 访问模型」。

## 2. Funnel / 出站代理 / 隧道 三者语义

| 机制 | 方向 | 语义 |
|---|---|---|
| Tailscale Funnel | **入站** | 把本机服务暴露到公网（经由 Tailscale 中继）；不是出站代理 |
| Tailscale 普通隧道 | 出站(内网) | 打到 tailnet 内其他节点；公网流量默认不走它（除非出口节点开启） |
| SFM/WARP 类 Network Extension | 出站(全局) | 接管默认路由后，所有公网流量进隧道 |

**判定规则**：没有连接证据（`lsof`/代理日志）时，不得声称某应用的模型请求「经过 Funnel」。
`utun*` 的存在 ≠ 某应用在用它；归因需要套接字级或日志级证据。

## 3. 热点流量计量口径

| 要计量 | 用 | 禁止 |
|---|---|---|
| 运营商实际消耗 | **物理热点接口（通常 en0）两次采样的增量** | en0 与 utun* 字段直接相加（隧道封装重复计数） |
| 来源归因 | nettop 进程级增量、代理/应用日志、token 账本 | 用进程数字代替物理接口计量 |
| 时段切片 | 必须有区间基线（如 09:00 快照） | 用接口累计总量声称「今天09:00后消耗」 |

采样方法（无需 sudo）：
```bash
netstat -ib | awk '$1=="en0"{print $7,$10}'   # Ibytes/Obytes
# 两次采样差值 = 窗口内真实消耗；nettop -P -L 1 -x -t external 做进程归因
```

**历史窗口（「近 N 日消耗」类）**：macOS 无用户态历史用量库（接口计数器仅开机累计；`/var/networkd/dbusage.db` 需 root；NetworkExtension tracker-info 是二进制 trie，勿逆向）——无基线时回溯只能用应用层账本（cc-switch / zcode db / 代理账本）按日聚合 + token→字节估算（上行 ~3.5 B/tok；fresh 与 cache_read **都算上行**——提示缓存省的是服务端算力/费用，请求体每轮仍全量上线，禁按「cache 命中=省流量」折减），并用开机累计值校验量级；禁用累计值冒充近 N 日。物理口基线快照 append 至 `~/hermes-docker-sandbox/workspace/net-usage/en0-snapshots.log`，有两条以上快照即可差值精确计量；完整方法见 `network-egress-attribution` 的历史窗口一节。

### 账本切片实操陷阱

- **进程级计数器是 since-boot 累计，禁当日窗口切片**——只当量级体检用：开机累计本就很小（如隧道进程数十小时仅几十 MB）即可直接断言窗口内无大流量。
- **nettop 参数坑**：`-p` 选进程不是选接口；`-k` 后跟键列表会吃掉输出列。进程归因用 `nettop -P -L 1 -x -t external` 全量输出后以 awk 按列名取。
- **zcode db 时区**：`first_token_at` 为毫秒 epoch UTC。「今日 09:00 CST 后」写 `first_token_at >= (strftime('%s','now','start of day','+1 hour')*1000)`（即 UTC 01:00）；展示用 `datetime(first_token_at/1000,'unixepoch','+8 hours')`。禁在 `'start of day'` 后拼本地偏移（如 `'+9 hours'`）——start of day 本身按 UTC 计。常用列：model_id / input_tokens / output_tokens / reasoning_tokens / cache_read_input_tokens / cache_creation_input_tokens。
- **cc-switch 日志日内轮转**：当天请求会劈在 `cc-switch.log` 与 `cc-switch_<date>_<time>.log` 两个文件，全日切片两个都要 grep；小时分布用 `sed -E "s/^\[$TODAY\]\[([0-9]{2}):.*/\1/" | sort | uniq -c` 提取。
- **进程级归因的两个静默盲区（归因缺口 ≠ 偷跑，先对齐再断言）**：
  - `nettop -t external` 只统计应用态 socket——SFM/NetworkExtension 的隧道封装、内核态转发不被归因。实测同窗物理口 out=24.48MB，进程级合计仅 0.89MB（**96% 缺口**）。对齐公式：`物理口双采样增量 − 进程级增量 = 未归因（隧道封装/内核态）`，缺口大时改查隧道口增量。
  - 走 `TUN`/VpnApi 的实现（如 clash）读流量计数恒为 0、连接不出现在 `ss -tnp`，**进程级接口对它天然漏计**；该类实现必须走隧道口计数或物理口差值归因。
- **累计值大 ≠ 窗口内活跃**：接口/进程计数是 since-boot 累计。判定「某口当前是否在跑」必须同一接口双窗差值（如间隔 120s 两次 `netstat -ib`），差值≈0 即该口静默——禁拿累计值当窗口流量，也禁拿「累计大」反推「今日在跑」。
- **上行/下行形态预检**：正常 LLM 请求形态是下行 ≫ 上行或大体对称；出现**上行持续反超下行**（如 3.2h out=1.6GB / in=450MB）先查三处：① LLM prompt 上行（`lsof -nP -i TCP -sTCP:ESTABLISHED` 看代理是否连着云端点，配合请求账本核 token 量级）；② 隧道封装（隧道口增量 vs 物理口增量比对，比值≈1 才算经隧道）；③ 大额上传类进程（网盘/同步/备份）。三者都排除才可能是异常偷跑。

## 4. 切断隧道流量的处置顺序

1. 识别接管默认路由的具体服务：`scutil --nc list` + `route -n get default`
2. 只停目标服务：`scutil --nc stop "<service-name>"`（勿杀无关 Tailscale/本地代理）
3. 验证闭环：默认路由回 en0、旧 utun 消失、低成本连通性测试（curl 两三个站）
4. 检查自动重连：Network Extension 显示 `activated enabled` ≠ 已永久禁用；
   永久禁用需系统设置/sudo 单独步骤，断开状态会复活

## 5. 证据分层表达

| 标签 | 含义 |
|---|---|
| 已观测 | 命令输出直接证实（附命令与时间） |
| 推断 | 由证据链推出（写明链条，如 TLS 证书→WAF fallback→业务方身份） |
| 未验证 | 尚无输出支持；明说，不得写成结论 |

## 6. 本机网络层防线清单（2026-09-28 在位）

| 层 | 载体 | 职责 |
|---|---|---|
| pf 锚点 `hermes-hotspot-guard` | /etc/pf.anchors/，hotspot-guardd.sh 动态切换 | 热点下封大额更新包（HF/VSCode/微信/macOS/Qoder） |
| pf 锚点 `hermes-zcode-block` | 同上，无条件 | ZCode 历史已知上传端点（111.206.191.0/24 等） |
| pf 锚点 `hermes-zcode-bigmodel-only` | 同上，无条件 | ZCode bigmodel 白名单+生态端点封禁（见 endpoint-identity.md） |
| ZCode provider_config | ~/.zcode/v2/provider_config.json | 非 bigmodel provider 全部显式 enabled=false |

改动任一层后：`sudo pfctl -f /etc/pf.conf` 重载；验证用 `sudo pfctl -s labels | grep zcode_` 看命中；免密 sudo 不可用时，模式切换证据改读 guardd 自身日志 `/var/log/hotspot-guardd.log` 的 `mode=hotspot applied` 行。
