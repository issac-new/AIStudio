# 出站推送防骚扰门（Outbound Guard）协议

> 来源：SenteLabsAI/OpenExecutive `orchestrator/outbound_guard.py:1-194`（2026-09-03 源码级调研）
> 适用：一切 agent 主动向用户/渠道推送的消息（cron 推送、kanban 完成通知、Matrix/微信 bot 消息、告警分发）
> 与 Matrix 七层防线的关系：七层防线防 bot 死循环（接收侧），本协议防推送骚扰（发送侧），互补

---

## 一、三控制（所有主动推送经唯一 chokepoint 过三道）

### 控制 1：内容去重（dedup）

- **规则**：同一接收人，在去重窗口内已发过**近似内容** → 拒发
- **归一化算法**（对称于存储端，outbound_guard.py:64-80）：
  1. 先截取前 160 字符（`_DEDUP_PREFIX_CHARS`）
  2. 折叠连续空白为单空格
  3. casefold（大小写折叠）
  4. 两侧同算法比对（clip-then-normalize，不得 normalize-then-clip）
- **默认窗口**：60 分钟

### 控制 2：每人限频（per-recipient rate cap）

- **规则**：同一接收人，在限频窗口内已发 N 条 → 拒发
- **默认**：每 60 分钟窗口最多 5 条/人（全局节流 `gateway_notify_interval: 180` 之上叠加）
- 系统级告警（熔断/安全）可豁免，但必须记录豁免理由

### 控制 3：安静时段（quiet hours）

- **规则**：接收人处于安静时段 → 拒发或延迟至下一可用窗口
- **默认安静时段**：22:00-08:00（本地时区）
- **豁免**：severity=urgent（需配合 `_shared/02-org-orchestration/alert-triage-rules.md` 分级）

## 二、Fail-open 原则（outbound_guard.py 核心设计决策）

> 防骚扰辅助门**绝不**把可工作的发送变成丢消息或崩溃。

- 内部查询失败（DB 读不出历史/时间解析失败）→ **放行**（返回 allow）
- 拒发 → 返回**人类可读 reason**，发送方记录日志并可将消息 `schedule_followup` 到下一窗口
- 抑制是**非破坏性**的：不删消息，只延迟/拒绝当次发送

## 三、Hermes 落地映射

| 层 | 落地点 | 机制 |
|----|--------|------|
| cron 推送 | `cronjob` 执行后产出 → 过本门 → 才进 Gateway 推送 | cron 脚本内检查最近推送记录（~/.hermes/cron/<job>/last_sends.jsonl） |
| kanban 通知 | `kanban_complete/block` 触发 Gateway 通知 → 过本门 | Gateway notifier 层 |
| Matrix bot | 与七层防线联动：七层管「是否继续对话」，本门管「这条发不发」 | matrix 发送前调用 |
| 微信 bot | 同 Matrix | weixin 发送前调用 |

## 四、配置参数（写入 ~/.hermes/config.yaml gateway 段）

```yaml
gateway:
  outbound_guard:
    dedup_window_minutes: 60        # 控制 1
    rate_max_per_recipient: 5       # 控制 2
    rate_window_minutes: 60         # 控制 2
    quiet_hours_start: "22:00"      # 控制 3
    quiet_hours_end: "08:00"        # 控制 3
    urgent_bypass: true             # urgent 告警豁免安静时段
```

## 五、判定流程（发送方逐条过）

```
拟发送消息
  │ 1. 去重？→ 命中 → 拒发(reason="duplicate within 60m")
  │ 2. 限频？→ 超 5 条/h → 拒发(reason="rate cap 5/h for <recipient>")
  │ 3. 安静时段？→ 命中且非 urgent → 拒发(reason="quiet hours 22:00-08:00")
  │ 内部错误 → 放行（fail-open）+ 日志
  ▼
发送
```
