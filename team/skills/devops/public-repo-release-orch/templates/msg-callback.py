# filter-repo --message-callback 回调体模板 (用法: git filter-repo --force --message-callback "$(cat msg-callback.py)")
# 三条硬约束: ①bytes 进 bytes 出 ②末行必须 return ③替换规则分层(敏感值→占位符 / 过程噪声→通用化 / 超长主题拆分进 body)
import re

SENSITIVE = [
    # (re.compile(r"<真实值模式>"), "<中性占位符>"),  # 用户名/人名称呼/城市小区/域前缀/内部 id 如 t_[0-9a-f]{6}
]
NOISE = [
    # (re.compile(r"（并行[^）]*）"), ""),  # 过程叙事括号注记
]
BODY_DROP = re.compile(r"^\s*[（(][^）)]*<过程词>[^）)]*[）)]\s*$")
MAXSUBJ = 120

msg = message.decode("utf-8", "surrogateescape") if isinstance(message, bytes) else message
for pat, rep in SENSITIVE:
    msg = pat.sub(rep, msg)
for pat, rep in NOISE:
    msg = pat.sub(rep, msg)
lines = msg.split("\n")
subj, rest = lines[0], lines[1:]
if len(subj) > MAXSUBJ:  # 超长主题: 在句读边界拆分, 余文移入 body (不删信息)
    cut = max(subj.rfind(p, 0, MAXSUBJ) for p in "——；;，,、")
    if cut < MAXSUBJ // 2:
        cut = MAXSUBJ
    moved = subj[cut:].lstrip("——；;，,、 ")
    subj = subj[:cut].rstrip("——；;，,、 ")
    rest = ([moved] + rest) if moved else rest
out, prev_blank = [subj], True
for ln in rest:
    if BODY_DROP.match(ln):
        continue
    blank = (ln.strip() == "")
    if blank and prev_blank:
        continue
    out.append(ln)
    prev_blank = blank
while out and out[-1].strip() == "":
    out.pop()
newmsg = "\n".join(out)
return newmsg.encode("utf-8", "surrogateescape") if isinstance(message, bytes) else newmsg
