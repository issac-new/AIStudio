# Desktop App ↔ Gateway 错误链排障

桌面 App（Hermes.app）报错的两大类：认证握手断（ticket）与会话索引悬空（not_found）。
两类根因不同、处置不同，先判类再动手。

## 一、ticket 握手失败（表现：模型响应中断）

**症状**：App 内报 `Operation interrupted: waiting for model response (Ns elapsed)`，
同时 `~/.hermes/logs/desktop.log` 尾部刷 `Invalid gateway ticket response` 或
`Gateway ticket bootstrap failed`。

**判性三步（顺序固定）**：

1. `curl -s -m 5 localhost:8650/health` —— 网关进程是否健康。
2. 看 desktop.log 尾部错误签名（用下面的消毒读法，别裸 grep）。
3. 网关 ok + App 持续报 ticket 错 = **App 侧 ticket 与网关失同步**（网关重启后旧
   token 失效，App 不会自动重 bootstrap）。处置 = 完全退出 App（Cmd+Q）再重开，
   新窗口重新走 ticket bootstrap。15 秒内恢复。

**判性规则**：
- ticket 错误覆盖全部 profile（`/api/cron/jobs?profile=all` 的返回把每个 profile
  逐个报 bootstrap failed）→ 握手层问题，不是单 profile 配置问题。
- 不要先怀疑模型/供应商/cc-switch。先查 /health 和 desktop.log，模型慢是最后一档归因。
- App 报「等待模型响应超时」的秒数小（<10s）且密集出现 → 几乎总是连接被掐，不是模型真慢。

## 二、会话索引悬空（表现：恢复失败 not_found）

**症状**：App 点「恢复会话」报 `恢复失败: JsonRpcGatewayError: not_found`。

**机制**：会话索引有两层——`~/.hermes/sessions/sessions.json`（legacy mirror）与
`state.db` 的 `gateway_routing` 表（正本）。索引条目存在 ≠ 会话文件存在。
会话清理（prune/删 profile 目录）后索引条目残留 → 恢复必然 not_found。

**诊断**：

```bash
# 1. 索引里有没有
python3 -c "import json; d=json.load(open('$HOME/.hermes/sessions/sessions.json')); print('<session_id>' in json.dumps(d))"

# 2. session_key 自带归属（agent:<profile>:<platform>:dm:<id>@<domain>）——先解码 key 判归属，别猜 profile
grep -o '"[^"]*<session_id>[^"]*"' ~/.hermes/sessions/sessions.json

# 3. 磁盘上有没有（key 里的 <profile> 决定查哪个目录）
ls ~/.hermes/profiles/<profile>/sessions/<session_id>.jsonl 2>/dev/null \
  || ls ~/.hermes/sessions/<session_id>* 2>/dev/null \
  || echo 'DANGLING: 索引有、磁盘无'
```

**处置**：删悬空条目，两处都删（sessions.json 对应 key + state.db `gateway_routing`
表同 key 行）。删前逐条核对——索引里混着活会话条目（微信 dm 等在用通道），盲删会断正在用的会话。

## 三、坑：desktop.log 裸 grep 静默返回空

`tail -N logfile | grep` 在 desktop.log 这类混有长行/控制字符的日志上可能返回空，
但内容其实就在尾部——别因 grep 空就断言「日志里没有」。消毒读法：

```bash
tail -c 8000 ~/.hermes/logs/desktop.log | tr -c '[:print:]\n' '?' | tail -50
```

先用字节窗口消毒，确认有内容后再按需扩大窗口或做定向 grep。
