#!/usr/bin/env python3
"""zcode-acp-delegate — coding-delegate 技能的引擎驱动（ACP over stdio）。

把一段实现指令一次性委托给 Ycode 编码引擎（zcode-acp-server stdio 桥），
流式过程与最终回执打成人类可读日志输出到 stdout——调用方（hermes agent）
用 `| tee materials/delegate-log.txt` 落委托指纹。

协议流程：initialize → initialized → session/new → session/prompt
         →（stream session/update）→ prompt 最终回执 → 收尾退出。

退出码（技能卡按此判 BLOCKED）：
  0  成功（stopReason=end_turn）
  2  引擎不可用（CLI 缺失/启动失败/初始化握手失败）
  3  超时（--timeout 秒内未收到最终回执）
  4  协议错误 / 引擎返回 error 或 cancel
  5  引擎过早退出（stdout 关闭）

仅用标准库；Python 3.9+。
"""
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import queue

EXIT_OK = 0
EXIT_ENGINE_MISSING = 2
EXIT_TIMEOUT = 3
EXIT_PROTOCOL = 4
EXIT_EARLY_EXIT = 5

DEFAULT_ENGINE_BINS = ("zcode-acp-server", "zcode-acp")
DEFAULT_TIMEOUT = 900


def log(msg: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {msg}", flush=True)


def find_engine(override: str):
    """返回引擎启动命令（list）。override 优先；否则按 DEFAULT_ENGINE_BINS 找 PATH。
    zcode-acp 需要 `server` 子参数才进 stdio 桥模式。"""
    if override:
        if shutil.which(override.split()[0]) or os.path.isfile(override.split()[0]):
            return override.split()
        return None
    for name in DEFAULT_ENGINE_BINS:
        path = shutil.which(name)
        if path:
            return [path] + (["server"] if name == "zcode-acp" else [])
    return None


def compact_update(update: dict) -> str:
    """session/update → 一行摘要（工具调用标题是 diff 评审的主证据）。

    实测 schema（zcode-acp-server 0.43.2）：params.update.sessionUpdate 是类型
    字符串（tool_call/agent_message_chunk/usage_update/...），负载是同级键；
    kind 归一优先取该字符串，再退 type/kind（tool_call 事件的工具类别 edit/execute）。
    """
    node = update.get("update") or update
    kind = "?"
    if isinstance(node.get("sessionUpdate"), str):
        kind = node["sessionUpdate"]
        node = {k: v for k, v in node.items() if k != "sessionUpdate"}
    kind = node.get("type") or node.get("kind") or kind
    parts = []
    for key in ("title", "status", "name", "state", "summary"):
        val = node.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(f"{key}={val.strip()[:160]}")
    if not parts:
        parts.append(json.dumps(node, ensure_ascii=False)[:160])
    return f"{kind} " + " ".join(parts)


def update_kind(update: dict) -> str:
    node = update.get("update") or update
    val = node.get("sessionUpdate")
    return val if isinstance(val, str) else "?"


def update_text(update: dict) -> str:
    node = update.get("update") or update
    content = node.get("content") or {}
    if isinstance(content, dict):
        return str(content.get("text") or "")
    return ""


def main() -> int:
    ap = argparse.ArgumentParser(description="coding-delegate 引擎驱动（ACP over stdio）")
    ap.add_argument("prompt", help="实现指令全文；@file 表示从文件读")
    ap.add_argument("--cwd", default=".", help="任务 workspace（session/new 的 cwd）")
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT,
                    help=f"prompt 阶段总超时秒数（默认 {DEFAULT_TIMEOUT}）")
    ap.add_argument("--engine", default=os.environ.get("ZCODE_ACP_BIN", ""),
                    help="引擎可执行文件（默认按 PATH 找 zcode-acp-server / zcode-acp）")
    args = ap.parse_args()

    prompt = args.prompt
    if prompt.startswith("@") and os.path.isfile(prompt[1:]):
        with open(prompt[1:], encoding="utf-8") as fh:
            prompt = fh.read()

    cmd = find_engine(args.engine)
    if not cmd:
        log(f"RESULT exit={EXIT_ENGINE_MISSING} engine=NOT_FOUND（PATH 无 zcode-acp-server/zcode-acp）")
        return EXIT_ENGINE_MISSING

    cwd = os.path.abspath(args.cwd)
    log(f"engine={' '.join(cmd)} cwd={cwd} timeout={args.timeout}s prompt_chars={len(prompt)}")

    try:
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1, cwd=cwd)
    except OSError as exc:
        log(f"RESULT exit={EXIT_ENGINE_MISSING} spawn_error={exc}")
        return EXIT_ENGINE_MISSING

    lines = queue.Queue()

    def reader():
        for line in proc.stdout:
            lines.put(line.rstrip("\n"))
        lines.put(None)  # stdout 关闭哨兵

    threading.Thread(target=reader, daemon=True).start()

    def send(payload: dict) -> None:
        proc.stdin.write(json.dumps(payload) + "\n")
        proc.stdin.flush()

    def recv(deadline: float):
        """返回 (json 消息 | None=超时 | 'EOF')。"""
        remain = deadline - time.time()
        if remain <= 0:
            return None
        try:
            line = lines.get(timeout=remain)
        except queue.Empty:
            return None
        if line is None:
            return "EOF"
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return ("BADLINE", line)  # 非 JSON 行按噪音跳过

    next_id = [10]  # 1=initialize、100=prompt 为硬编码；rpc 从 10 起避免撞号

    def rpc(method: str, params: dict, deadline: float):
        next_id[0] += 1
        rid = next_id[0]
        send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        while True:
            msg = recv(deadline)
            if msg is None or msg == "EOF":
                return msg
            if not isinstance(msg, dict):
                continue  # BADLINE 噪音
            if msg.get("id") == rid:
                return msg

    t0 = time.time()
    deadline = t0 + args.timeout

    # ── 1. initialize 握手 ──
    send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": 1,
        "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False},
                               "terminal": False}},
        "meta": {"clientInfo": {"name": "coding-delegate-driver", "version": "1"}}})
    init = None
    while True:
        msg = recv(deadline)
        if msg is None or msg == "EOF" or (isinstance(msg, dict) and msg.get("id") == 1):
            init = msg
            break
    if not isinstance(init, dict) or "result" not in init:
        log(f"initialize 失败：{str(init)[:300]}")
        log(f"RESULT exit={EXIT_ENGINE_MISSING} stage=initialize")
        proc.kill()
        return EXIT_ENGINE_MISSING
    agent_info = init["result"].get("agentInfo", {})
    log(f"initialized 握手 OK：{agent_info.get('name')} {agent_info.get('version')}")

    send({"jsonrpc": "2.0", "method": "initialized", "params": {}})

    # ── 2. session/new ──
    sess = rpc("session/new", {"cwd": cwd, "mcpServers": []}, min(deadline, time.time() + 60))
    if not isinstance(sess, dict) or "result" not in sess:
        log(f"session/new 失败：{str(sess)[:300]}")
        log(f"RESULT exit={EXIT_ENGINE_MISSING} stage=session_new")
        proc.kill()
        return EXIT_ENGINE_MISSING
    session_id = sess["result"].get("sessionId")
    log(f"session 建立成功：{session_id}")

    # ── 3. session/prompt（流式收 update）──
    send({"jsonrpc": "2.0", "id": 100, "method": "session/prompt",
          "params": {"sessionId": session_id,
                     "prompt": [{"type": "text", "text": prompt}]}})
    updates = 0
    final = None
    eof = False
    agent_text = []   # agent_message_chunk 累积（引擎最终答复进日志，评审免翻原始流）
    while final is None:
        msg = recv(deadline)
        if msg is None:
            log(f"RESULT exit={EXIT_TIMEOUT} stage=prompt elapsed={int(time.time()-t0)}s")
            proc.kill()
            return EXIT_TIMEOUT
        if msg == "EOF":
            eof = True
            break
        if not isinstance(msg, dict):
            continue
        if msg.get("method") == "session/update":
            node = msg.get("params", {})
            kind = update_kind(node)
            updates += 1
            if kind == "agent_message_chunk":
                agent_text.append(update_text(node))
            elif kind in ("usage_update", "agent_thought_chunk"):
                pass  # 计费/思考流不进委托日志（最终 usage 在 RESULT 行）
            else:
                log(f"update: {compact_update(node)}")
        elif msg.get("id") == 100:
            final = msg
        elif msg.get("method") == "session/request_permission":
            # 委托会话按无人值守设计（yolo 默认）；引擎仍弹权限时如实转达并拒绝放行。
            send({"jsonrpc": "2.0", "id": msg.get("id"), "result": {"outcome": {
                "outcome": "cancel"}}})
            log("update: request_permission → cancel（驱动不代行人工确认）")

    if eof or final is None:
        log(f"RESULT exit={EXIT_EARLY_EXIT} stage=prompt updates={updates}")
        proc.kill()
        return EXIT_EARLY_EXIT

    if "error" in final:
        log(f"prompt 返回错误：{str(final['error'])[:300]}")
        log(f"RESULT exit={EXIT_PROTOCOL} stage=prompt updates={updates}")
        proc.kill()
        return EXIT_PROTOCOL

    result = final.get("result", {})
    stop = result.get("stopReason")
    usage = result.get("usage", {})
    usage_s = (f"in={usage.get('inputTokens', '?')} out={usage.get('outputTokens', '?')} "
               f"total={usage.get('totalTokens', '?')}")
    reply = "".join(agent_text).strip()
    if reply:
        log(f"引擎答复：{reply[:800]}")
    log(f"prompt 收尾：stopReason={stop} {usage_s} updates={updates} elapsed={int(time.time()-t0)}s")
    ok = stop == "end_turn"
    log(f"RESULT exit={0 if ok else EXIT_PROTOCOL} stopReason={stop} {usage_s}")
    try:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    return 0 if ok else EXIT_PROTOCOL


if __name__ == "__main__":
    sys.exit(main())
