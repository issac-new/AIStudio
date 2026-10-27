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
from pathlib import Path

EXIT_OK = 0
EXIT_ENGINE_MISSING = 2
EXIT_TIMEOUT = 3
EXIT_PROTOCOL = 4
EXIT_EARLY_EXIT = 5

DEFAULT_ENGINE_BINS = ("zcode-acp-server", "zcode-acp")
DEFAULT_TIMEOUT = 900

INSTRUCTION_HEADER = "## 本轮实现指令"


def log(msg: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {msg}", flush=True)


class TaskContextError(Exception):
    """--task 装配失败（任务不存在/工作区未物化/路径逃逸）——exit 2 语义。"""


def resolve_task_workspace(task, board: str | None):
    """任务 workspace 规范化：绝对直用；相对锚定板 workspaces 根（/../ 逃逸拒绝）；
    scratch 空路径按 <root>/<task-id> 预测。返回 (绝对路径, 是否已物化)。"""
    from hermes_cli import kanban_db as kb

    raw = (getattr(task, "workspace_path", None) or "").strip()
    root = kb.workspaces_root(board=board)
    if not raw:
        kind = getattr(task, "workspace_kind", None) or "scratch"
        if kind in ("scratch",):
            p = root / task.id
        else:
            raise TaskContextError(f"workspace_kind={kind} 且无 workspace_path，无法定位工作区")
    else:
        import os as _os
        from pathlib import PurePath
        if _os.path.isabs(raw):
            p = Path(raw)
        else:
            rel = PurePath(raw)
            if rel.is_absolute() or ".." in rel.parts:
                raise TaskContextError(f"相对 workspace_path 逃逸拒绝：{raw}")
            p = root / raw
    return p.expanduser(), p.expanduser().is_dir()


def load_task_context(task_id: str, board: str | None = None):
    """taskId → (worker_context 全文, 规范 cwd)。修订/正文/handoff/评论由程序
    装配（build_worker_context 与 spawn 同源），不依赖调用方抄写。"""
    from hermes_cli import kanban_db as kb
    from hermes_cli import kanban_db_connect as kbc

    with kbc.connect(board=board) as conn:
        task = kb.get_task(conn, task_id)
        if task is None:
            raise TaskContextError(f"任务不存在：task={task_id} board={board or 'default'}")
        context = kb.build_worker_context(conn, task_id)
    cwd, materialized = resolve_task_workspace(task, board)
    if not materialized:
        raise TaskContextError(f"任务工作区未物化：{cwd}")
    return context, task, cwd


def compose_task_prompt(context: str, instruction: str) -> str:
    return f"{context.rstrip()}\n\n{INSTRUCTION_HEADER}\n{instruction.strip()}\n"


def write_delegate_result(cwd: Path, payload: dict) -> Path | None:
    """materials/delegate-result.json 原子落盘（tmp+rename）；失败不掩盖主结果。"""
    try:
        d = cwd / "materials"
        d.mkdir(parents=True, exist_ok=True)
        out = d / "delegate-result.json"
        tmp = d / f".delegate-result.{os.getpid()}.tmp"
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf8")
        tmp.replace(out)
        return out
    except OSError as exc:
        log(f"delegate-result.json 落盘失败（不掩盖主结果）：{exc}")
        return None


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


YCODE_FORK_CLI = os.path.expanduser("~/.hermes/ycode/zcode.cjs")
OFFICIAL_BUNDLE_CLI = "/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs"


def resolve_engine_bin_env():
    """ACP 桥拉起编码引擎的环境校正。

    桥（zcode-acp-server）按 ZCODE_BIN > PATH zcode > 官方 ZCode.app 桌面捆绑
    解析引擎（其 resolve.js）。2026-10-26 实测矩阵定谳：coding-plan anthropic
    端点对公开 main 基底（3c5b2276=3.16.1 系列，含本仓分叉与无补丁纯净构建）
    的请求一律 500（GLM-5.3 与 Flash 双模型皆然），仅私有发布线 3.16.3 客户端
    通过（同凭据同提示词）。故解析序=显式 ZCODE_BIN（用户覆盖，不动）> 官方
    捆绑（在位时）> 分叉部署位（~/.hermes/ycode/zcode.cjs，
    `scripts/zcode-engine.mjs install-cli` 落位）> 桥自兜底。upstream main
    追平 3.16.2+ 后把 OFFICIAL 分支下移一行即回切分叉。返回来源标记供日志
    断言引擎身份。
    """
    if os.environ.get("ZCODE_BIN", "").strip():
        return "env"
    if os.path.isfile(OFFICIAL_BUNDLE_CLI):
        os.environ["ZCODE_BIN"] = OFFICIAL_BUNDLE_CLI
        return "official-bundle"
    if os.path.isfile(YCODE_FORK_CLI):
        os.environ["ZCODE_BIN"] = YCODE_FORK_CLI
        return "ycode-fork"
    return "bridge-default"


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
    ap.add_argument("--model", default=os.environ.get("ZCODE_ACP_MODEL", ""),
                    help="会话模型（如 GLM-5.3；空=引擎默认。经桥 session/setModel 在建会话后设置）")
    ap.add_argument("--task", default="",
                    help="kanban 任务 id：装配 build_worker_context 全文注入 prompt，"
                         "cwd 取任务规范 workspace（覆盖 --cwd）")
    ap.add_argument("--board", default="",
                    help="任务所在板 slug（--task 时使用，缺省 default）")
    args = ap.parse_args()

    prompt = args.prompt
    if prompt.startswith("@") and os.path.isfile(prompt[1:]):
        with open(prompt[1:], encoding="utf-8") as fh:
            prompt = fh.read()

    task_mode = bool(args.task.strip())
    task_meta: dict = {"taskId": args.task.strip() or None, "board": (args.board.strip() or "default") if task_mode else None}
    cwd_override: str | None = None
    if task_mode:
        try:
            context, task, ws = load_task_context(args.task.strip(), args.board.strip() or None)
        except TaskContextError as exc:
            log(f"RESULT exit={EXIT_ENGINE_MISSING} stage=task_context error={exc}")
            return EXIT_ENGINE_MISSING
        prompt = compose_task_prompt(context, prompt)
        cwd_override = str(ws)
        task_meta.update({
            "taskTitle": getattr(task, "title", None),
            "taskStatus": getattr(task, "status", None),
            "assignee": getattr(task, "assignee", None),
            "branch": getattr(task, "branch_name", None),
        })
        log(f"task 上下文装配：task={args.task.strip()} workspace={ws} prompt_chars={len(prompt)}")

    cmd = find_engine(args.engine)
    if not cmd:
        log(f"RESULT exit={EXIT_ENGINE_MISSING} engine=NOT_FOUND（PATH 无 zcode-acp-server/zcode-acp）")
        if task_mode and cwd_override:
            write_delegate_result(Path(cwd_override), {**task_meta, "exit": EXIT_ENGINE_MISSING,
                                                       "stage": "engine_not_found", "prompt_sha256": __import__("hashlib").sha256(prompt.encode()).hexdigest()})
        return EXIT_ENGINE_MISSING

    cwd = os.path.abspath(cwd_override or args.cwd)
    engine_src = resolve_engine_bin_env()
    engine_bin = os.environ.get("ZCODE_BIN", "(桥自解析)")
    prompt_sha = __import__("hashlib").sha256(prompt.encode()).hexdigest()
    t_start = int(time.time())
    log(f"engine={' '.join(cmd)} engine_bin_source={engine_src} engine_bin={engine_bin} cwd={cwd} timeout={args.timeout}s prompt_chars={len(prompt)}")

    def finish(exit_code: int, stage_or_stop: str, session_id=None, usage=None) -> int:
        """统一收口：RESULT 行 + 任务模式落 delegate-result.json（机器可读证据）。"""
        if task_mode:
            write_delegate_result(Path(cwd), {
                **task_meta,
                "sessionId": session_id,
                "cwd": cwd,
                "engineBin": engine_bin,
                "engineBinSource": engine_src,
                "model": args.model or None,
                "stopReason": stage_or_stop if stage_or_stop in ("end_turn", "timeout", "cancelled", "error") else None,
                "stage": None if stage_or_stop in ("end_turn",) else stage_or_stop,
                "exit": exit_code,
                "promptSha256": prompt_sha,
                "promptChars": len(prompt),
                "usage": usage or {},
                "startedAt": t_start,
                "endedAt": int(time.time()),
            })
        return exit_code

    try:
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1, cwd=cwd)
    except OSError as exc:
        log(f"RESULT exit={EXIT_ENGINE_MISSING} spawn_error={exc}")
        return finish(EXIT_ENGINE_MISSING, "spawn_error")

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
        return finish(EXIT_ENGINE_MISSING, "initialize")
    agent_info = init["result"].get("agentInfo", {})
    log(f"initialized 握手 OK：{agent_info.get('name')} {agent_info.get('version')}")

    send({"jsonrpc": "2.0", "method": "initialized", "params": {}})

    # ── 2. session/new ──
    sess = rpc("session/new", {"cwd": cwd, "mcpServers": []}, min(deadline, time.time() + 60))
    if not isinstance(sess, dict) or "result" not in sess:
        log(f"session/new 失败：{str(sess)[:300]}")
        log(f"RESULT exit={EXIT_ENGINE_MISSING} stage=session_new")
        proc.kill()
        return finish(EXIT_ENGINE_MISSING, "session_new")
    session_id = sess["result"].get("sessionId")
    log(f"session 建立成功：{session_id}")

    # ── 2.5 会话模型（可选；--model / ZCODE_ACP_MODEL）──
    # 引擎默认模型取自机器配置——计划端点侧某模型失效时（2026-10-26 实例：
    # coding-plan 的 GLM-5.3-Flash 全量 500、GLM-5.3 全量 200），委托方须能
    # 按任务指定模型。显式指定的模型设置失败即终止：换默认模型偷跑=结果不真。
    if args.model:
        setm = rpc("session/setModel", {"sessionId": session_id, "modelId": args.model},
                   min(deadline, time.time() + 30))
        if not (isinstance(setm, dict) and "result" in setm and "error" not in setm):
            log(f"session/setModel 失败（model={args.model}）：{str(setm)[:300]}")
            log(f"RESULT exit={EXIT_PROTOCOL} stage=set_model")
            proc.kill()
            return finish(EXIT_PROTOCOL, "set_model", session_id)
        log(f"session 模型已设置：{args.model}")

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
            return finish(EXIT_TIMEOUT, "timeout", session_id)
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
        return finish(EXIT_EARLY_EXIT, "early_exit", session_id)

    if "error" in final:
        log(f"prompt 返回错误：{str(final['error'])[:300]}")
        log(f"RESULT exit={EXIT_PROTOCOL} stage=prompt updates={updates}")
        proc.kill()
        return finish(EXIT_PROTOCOL, "prompt_error", session_id)

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
    return finish(0 if ok else EXIT_PROTOCOL, stop, session_id, usage)


if __name__ == "__main__":
    sys.exit(main())
