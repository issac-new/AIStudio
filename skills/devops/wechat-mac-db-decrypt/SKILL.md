---
name: wechat-mac-db-decrypt
description: 解密并导出 macOS 微信 4.x 本地聊天数据库做分析——密钥提取/解密/跨分库导出全链路。
triggers:
  - "分析微信聊天记录"
  - "导出微信消息"
  - "解密微信数据库"
  - "wechat db decrypt"
---

# WeChat Mac 4.x 数据库解密与导出

适用微信 Mac 4.x（xwechat_files 布局；布局与权限路径在本机 4.1.13 实测）。
任务类别：解密用户本人账号的聊天库 → 导出指定会话 → 统计/分析。

## 红线
- 只处理用户本人账号、且用户明确请求的数据。需要 sudo 时凭据绝不猜测：TUI 直接问用户；headless 走 `kanban_block(kind="needs_input")`。
- `wechat_keys.json`（密钥）只存本地工作区，绝不进报告/评论/外发通道；交付报告脱敏引用原文。

## 数据布局

```
~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/<user>_<hash>/
  db_storage/message/message_0..N.db   # 聊天分库(SQLCipher, 每库独立密钥)
  db_storage/contact/contact.db        # 联系人(remark/nick_name, 群名也在这)
  db_storage/session/session.db        # 会话列表
  msg/file/<yyyy-mm>/                  # 附件明文可直接拷
  msg/attach/                          # 图片 .dat 加密格式
```

判定加密：文件头无 `SQLite format 3`，第 1 页前 16 字节=盐。
密钥排除法（都实测过）：不在 Keychain、不在 MMKV、不在 config——只在运行中的微信进程内存。

## 密钥提取（root lldb 断点法，唯一可行路径）

前置：`brew install sqlcipher`；lldb 系统自带；脚本 `scripts/find_key_lldb.py`（拷到工作目录跑）。

```bash
cd <工作目录> &&  # 先 ⌘Q 完全退出微信
sudo env PYTHONPATH=$(/usr/bin/lldb -P) /usr/bin/python3 find_key_lldb.py --rounds 4 --collect 90
# 看到 waiting for WeChat launch 后: 启动微信登录 → 前台点目标会话/通讯录/搜索框
```

流程：脚本等微信启动→attach→定位 setCipherKey→断点收集；2-4 轮（每轮 ⌘Q 重启）累积 `wechat_keys.json`（去重持久）。

坑（全部实证，别重蹈）：
- 非 root lldb attach 必被系统拒（hardened runtime + SIP）——先非 root 试一次拿证据，再向用户要 sudo。
- 内存 regex 扫描法（memscan）在 4.1.7+ 命中 0 把密钥——直接用断点法。
- 给微信.app 重签名加 get-task-allow 在新 macOS 是死路（sandbox 绑腾讯团队 ID，errno 153 起不动；恢复只能 App Store 重装）。
- 上游 Thearas/wechat-db-decrypt-macos 已删码（只剩 README）；GitHub 搜仓库名找 fork，纯 Python 先审计再跑。
- 微信惰性开库：登录只开 session/message_0/contact，其余分库要点进对应 UI 才开——某库没采到就换地方点、多跑一轮。

## 解密与导出

`scripts/decrypt_export.py`：`--verify`（离线 HMAC-SHA512 校验密钥，不碰微信）→ `--decrypt`（临时目录拷 db+wal+shm → sqlcipher `sqlcipher_export` → integrity_check）→ `--list-chats` / `--chat <名字>`（跨分库合并导出+统计）。

表结构与合并规则见 `references/wechat41-schema.md`。核心铁律：**一个会话分散在全部 message_N 分库**（同表名各存不同区间），必须全分库合并、按 server_id 去重、Name2Id 按分库各自 join。

## 验收

- 解密成功 = `integrity_check` ok 且表计数 > 0；导出完整 = 各分库行数合计与导出条数（去重后）对账。
- 分析报告注明时间窗口（首末消息时间）与非文本消息的占位统计。
