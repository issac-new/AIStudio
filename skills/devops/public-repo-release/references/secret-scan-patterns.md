# 保密扫描模式清单（公开发布前在打包树上执行）

## 一条龙扫描命令

```bash
cd <打包后的仓库根>

# secrets（命中即处理；排除占位符/示例行后复核）
grep -rEn "api_key: [^P$]|sk-[A-Za-z0-9]{40}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{30}|syt_[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9]|AIzaSy[A-Za-z0-9_-]{33}" --exclude-dir=.git .

# 中国生态 token / 账号 ID（常规清单必漏项）
grep -rEn "WEIXIN_TOKEN: [a-z0-9]|WEIXIN_ACCOUNT_ID: [a-z0-9]|@[a-z]+\.im\.bot|@im\.wechat" --exclude-dir=.git . | grep -v '\${\|<\|your-\|YOUR-'

# 隐私（家人/路径/邮箱——按本机实际身份定制词表）
grep -rln "真实邮箱域名\|家人姓名\|小区/学校名\|出生年月\|/Users/<本机用户名>" --exclude-dir=.git .

# 杂质文件
find . \( -name ".git" -o -name "*.bak*" -o -name "*.rollback*" -o -name "*.log" -o -name "auth.json" -o -name ".env" -o -name "*.db" \) -not -path "./.git/*"

# 档案本体确认（引用名可留，本体必须不存在）
find . \( -name "child-profile.md" -o -name "mom-observations" \) -not -path "./.git/*"
```

## Secret 模式表

| 模式 | 正则片段 | 备注 |
|---|---|---|
| Matrix token | `syt_[A-Za-z0-9_-]{16,}` | profiles.yaml env_extra、脚本注释 |
| 微信 bot token | `账号ID@im\.bot:[0-9a-f]{32,}` | WEIXIN_TOKEN 值 |
| 微信 bot 账号 ID | `[0-9a-f]{12}@im\.bot` | WEIXIN_ACCOUNT_ID、skill 文档 |
| 微信真实用户 ID | `…@im\.wechat` | skill 文档示例里最易漏 |
| OpenAI/Anthropic | `sk-[A-Za-z0-9]{40}` / `sk-ant-` | |
| GitHub | `ghp_` / `gho_` + 30-36 位 | |
| Slack | `xox[baprs]-` | |
| Google | `AIzaSy` + 33 位 | |
| 通用赋值 | `WEIXIN_TOKEN: [a-z0-9]`（非 `${`、非空） |
| Matrix 房间 ID | `![A-Za-z0-9_-]{16,}:<homeserver>` → `<matrix-room-id>`（含 SOUL/rules/文档示例里的真实房间 ID） |
| Matrix 事件/会话 ID | `\$[A-Za-z0-9_-]{30,}` → `<event-id>`（30+ 位避开 `${VAR}` 占位符；`matrix_threads.json` 整文件都是，运行态直接排除） |
| 半截 key | `sk-[A-Za-z0-9]{3}\...`（对照表里的省略形）→ `sk-REDACTED` | |

## 隐私模式表

- 真实邮箱（个人 QQ/Gmail 域）→ 替换 `your@example.com`；机器人邮箱（agent.qq.com 类）→ `your-bot@example.com`
- 硬编码用户路径 `/Users/<name>` → `/Users/YOURNAME`（一次性可达上百文件，sed 循环处理 md/yaml/py/sh/json/txt）
- 家人姓名/生日/住址/学校 → 泛化占位符（`your-child`、`CHILD_BIRTH`、`your-neighborhood`）
- SOUL 里的**引用名**（child-profile.md 等）保留——只要本体文件不在树中

## jobs.json 私人条目过滤

按关键词剔除 job（连带删 scripts/ 里对应脚本 + 引用闭环复核）：

```
孩子 / 记忆双写 / trip / 旅行 / 中秋 / [已移除]- / [已移除]教育
```

过滤后必须复核：每个保留 job 的 `script` 字段在 scripts/ 里真实存在，缺失的一并移除（引用闭环）。注意绝对路径 `"script": "/Users/.../scripts/xxx.sh"` 在同步后经 `/Users/YOURNAME→/Users/YOURNAME` 替换，按文件名匹配判存在，别按原路径。保留 job 的 `last_error`/`last_delivery_error` 错误日志字段**先占位符化再截断**——直接截到 120 字符仍会带 room-id/token 前缀（v3.2 实证：`matrix:<room-id>:$XRDW…[truncated]` 漏网）。

## 泄露后 read-back 验证（push 后必做）

```bash
TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill | grep ^password= | cut -d= -f2)
# HEAD 确认
curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/<owner>/<repo>/commits?per_page=5"
# 重点文件拉回重扫（base64）
curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/<owner>/<repo>/contents/<path>" \
  | python3 -c "import json,base64,sys,re; c=base64.b64decode(json.load(sys.stdin)['content']).decode(); print(re.findall(r'<泄露正则>', c) or '干净')"
```

## 占位符替换基线（保持 generate-configs.py 结构兼容）

- `WEIXIN_TOKEN: <真实值>` → `WEIXIN_TOKEN: ${WEIXIN_TOKEN}`
- `MATRIX_ACCESS_TOKEN: syt_…` → `MATRIX_ACCESS_TOKEN: ${MATRIX_ACCESS_TOKEN}`
- `WEIXIN_ACCOUNT_ID: <真实>` → `WEIXIN_ACCOUNT_ID: ${WEIXIN_ACCOUNT_ID}`
- 只换值不删键；替换后 `diff` 确认仅值变化
