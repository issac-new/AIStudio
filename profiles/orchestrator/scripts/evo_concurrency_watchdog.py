#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""evo 并发熔断看门狗：防 BigModel 账户级 429 队列雪崩（用户 2026-09-05 裁决）。

信号源（cc-switch DB，只读）：
  - proxy_request_logs：近 15min 内 bigmodel 账户的 429 数（MGLM/MBGM 同 key 共池，按 URL 聚合）
  - proxy_request_logs：近 15min 内 503 数（cc-switch 自发"无可用 Provider"= 最严重信号）
  - provider_health：MGLM/MBGM 的 is_healthy / consecutive_failures

三档状态机（降档立即；升档走"试探-回退"自适应，不设固定等待期）：
  L0 NORMAL   12/4（用户批准基线）
  L1 GUARDED   6/2（触发：15min 内 bigmodel 429 ≥3，或任一 provider cf≥2）
  L2 CRITICAL  2/1（触发：15min 内 429 ≥10 或 503 ≥3，或任一 provider 熔断跳闸 is_healthy=0）

升档（尽快恢复 GLM 正常使用）：降档档位下 worker 仍在发请求——若 BigModel 1302 限速
仍在生效，这些请求必然继续 429。因此「近 5min 0 错误 + 期间 ≥5 条真实请求」即是
限速已解除的在线证据，满足即立即升档（典型恢复 5-10min）。防震荡不靠固定迟滞，
靠指数退避：升档后 10min 内再被降档（试探失败），下次试探推迟 10/20/40min 封顶。
升错的代价可控：看门狗 5min tick 自动降回，几条 429 远够不着 cc-switch 熔断阈值。

关键机制（源码实锚 kanban_db_dispatch.py:2336-2340）：dispatcher 每 tick 热重读
config.yaml 的 max_in_progress，本脚本改配置后 ≤60s 自动生效，无需重启 gateway。

安全纪律：
  - 绝不 yaml round-trip 重写 config.yaml（会剥注释）——只做正则行内替换两个数字
  - L0 状态绝不写配置（基线归用户管）；降档时记录基线供恢复
  - 每天首写前备份 config.yaml.bak-evo-<MMDD>（一天一份）
  - 状态文件幂等：只在档位变化时写配置+发邮件
  - 任何异常静默退出 0（看门狗自身不能成为告警源；DB 锁等瞬时错误跳过本轮）
"""
import json
import os
import re
import sqlite3
import smtplib
import ssl
import sys
import time
from datetime import datetime
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr

HOME = os.path.expanduser("~")
CC_DB = os.path.join(HOME, ".cc-switch", "cc-switch.db")
CONFIG_YAML = os.path.join(HOME, ".hermes", "config.yaml")
EVO_DIR = os.path.join(HOME, ".hermes", "evo")
STATE_PATH = os.path.join(EVO_DIR, "cache", "concurrency_state.json")
ENV_PATH = os.path.join(HOME, ".hermes", ".env")
TO_EMAIL = "your@example.com"

WINDOW_S = 900          # 降档信号窗口 15min
CLEAN_WINDOW_S = 300    # 升档干净判定窗口 5min
CLEAN_MIN_REQ = 5       # 干净窗内至少 N 条真实请求（活跃度证明，防"没流量≠没事"）
BACKOFF_BASE_S = 600    # 试探失败后升档退避基数 10min，10/20/40 封顶
T_L1_429, T_L2_429 = 3, 10
T_L2_503 = 3

LEVELS = {
    "L0": {"max_in_progress": 12, "per_profile": 4},
    "L1": {"max_in_progress": 6, "per_profile": 2},
    "L2": {"max_in_progress": 2, "per_profile": 1},
}
BASELINE = LEVELS["L0"]


def log(msg: str):
    print(msg, flush=True)


def load_env() -> dict:
    env = {}
    try:
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except OSError:
        pass
    return env


def send_alert(subject: str, body: str):
    if os.environ.get("EVO_CONC_NOEMAIL"):
        log(f"[noemail] {subject}")
        return
    env = load_env()
    user, pwd = env.get("EMAIL_ADDRESS"), env.get("EMAIL_PASSWORD")
    host, port = env.get("EMAIL_SMTP_HOST"), env.get("EMAIL_SMTP_PORT", "465")
    if not (user and pwd and host):
        log(f"[email-skip] SMTP 凭据缺失: {subject}")
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["From"] = formataddr((str(Header("Hermes 并发看门狗", "utf-8")), user))
        msg["To"] = TO_EMAIL
        msg["Subject"] = Header(subject, "utf-8")
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, int(port), context=ctx, timeout=20) as s:
            s.login(user, pwd)
            s.sendmail(user, [TO_EMAIL], msg.as_string())
        log(f"[email] {subject} -> {TO_EMAIL}")
    except Exception as e:
        log(f"[email-fail] {subject}: {e}")


def read_signals() -> dict:
    """只读 cc-switch DB。任何异常返回 None（本轮放弃，保持现状）。"""
    if os.environ.get("EVO_CONC_SIM_429"):
        n = int(os.environ["EVO_CONC_SIM_429"])
        return {"bm_429": n, "p503": 0, "any_unhealthy": False, "any_cf2": n >= 3,
                "err5": 0, "req5": max(n, 8), "sim": True}
    if not os.path.exists(CC_DB):
        return None
    try:
        con = sqlite3.connect(f"file:{CC_DB}?mode=ro", uri=True, timeout=3)
        con.execute("PRAGMA busy_timeout=3000")
        cutoff = int(time.time()) - WINDOW_S
        cut5 = int(time.time()) - CLEAN_WINDOW_S
        bm_429 = con.execute(
            "SELECT COUNT(*) FROM proxy_request_logs "
            "WHERE status_code=429 AND created_at>=? AND provider_id IN "
            "  (SELECT DISTINCT provider_id FROM provider_endpoints "
            "   WHERE url LIKE '%bigmodel%')", (cutoff,)).fetchone()[0]
        p503 = con.execute(
            "SELECT COUNT(*) FROM proxy_request_logs "
            "WHERE status_code=503 AND created_at>=?", (cutoff,)).fetchone()[0]
        # 5min 短窗：全部错误（429/5xx）与总请求量——升档的"干净+活跃"证据
        err5 = con.execute(
            "SELECT COUNT(*) FROM proxy_request_logs "
            "WHERE status_code>=400 AND created_at>=?", (cut5,)).fetchone()[0]
        req5 = con.execute(
            "SELECT COUNT(*) FROM proxy_request_logs "
            "WHERE created_at>=?", (cut5,)).fetchone()[0]
        health = con.execute(
            "SELECT ph.is_healthy, ph.consecutive_failures "
            "FROM provider_health ph JOIN providers p "
            "  ON p.id=ph.provider_id AND p.app_type=ph.app_type "
            "WHERE (p.name IN ('MGLM','MBGM'))").fetchall()
        con.close()
        any_unhealthy = any(row[0] == 0 for row in health)
        any_cf2 = any((row[1] or 0) >= 2 for row in health)
        return {"bm_429": bm_429, "p503": p503,
                "any_unhealthy": bool(any_unhealthy), "any_cf2": bool(any_cf2),
                "err5": err5, "req5": req5}
    except sqlite3.Error:
        return None


def compute_level(sig: dict) -> str:
    if sig["bm_429"] >= T_L2_429 or sig["p503"] >= T_L2_503 or sig["any_unhealthy"]:
        return "L2"
    if sig["bm_429"] >= T_L1_429 or sig["p503"] >= 1 or sig["any_cf2"]:
        return "L1"
    return "L0"


def read_state() -> dict:
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"level": "L0", "since": datetime.now().isoformat(timespec="seconds"),
                "baseline": BASELINE}


def save_state(st: dict):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_PATH)


def current_config_caps() -> tuple:
    try:
        text = open(CONFIG_YAML, encoding="utf-8").read()
    except OSError:
        return (None, None)
    mg = re.search(r"^\s*max_in_progress:\s*(\d+)\s*$", text, re.M)
    mp = re.search(r"^\s*max_in_progress_per_profile:\s*(\d+)\s*$", text, re.M)
    return ((int(mg.group(1)) if mg else None),
            (int(mp.group(1)) if mp else None))


def write_config_caps(global_n: int, per_profile_n: int) -> bool:
    """正则行内替换两个数字，保留全部注释与格式。成功返回 True。"""
    try:
        text = open(CONFIG_YAML, encoding="utf-8").read()
    except OSError:
        return False
    # 每天一份备份（首写时）
    bak = f"{CONFIG_YAML}.bak-evo-{datetime.now().strftime('%m%d')}"
    if not os.path.exists(bak):
        try:
            with open(bak, "w", encoding="utf-8") as f:
                f.write(text)
        except OSError:
            pass
    new_text, n1 = re.subn(
        r"^(\s*max_in_progress:\s*)\d+\s*$", rf"\g<1>{global_n}", text,
        count=1, flags=re.M)
    new_text, n2 = re.subn(
        r"^(\s*max_in_progress_per_profile:\s*)\d+\s*$",
        rf"\g<1>{per_profile_n}", new_text, count=1, flags=re.M)
    if n1 != 1 or n2 != 1:
        log(f"[config-error] 替换计数异常 n1={n1} n2={n2}，放弃写入")
        return False
    tmp = CONFIG_YAML + ".evo-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new_text)
    os.replace(tmp, CONFIG_YAML)
    return True


def main() -> int:
    sig = read_signals()
    if sig is None:
        return 0  # DB 锁/缺失：跳过本轮，保持现状（静默）
    level = compute_level(sig)
    st = read_state()
    now = time.time()
    dry = bool(os.environ.get("EVO_CONC_DRYRUN"))

    if dry:
        log(f"[dryrun] signals={sig} computed={level} state={st.get('level')}")
        return 0

    cur_level = st.get("level", "L0")
    baseline = st.get("baseline") or BASELINE

    if level == cur_level:
        # 档位未变：校验配置是否漂移（有人手动改回/重启覆盖）——除 L0 外强制拉回
        if level != "L0":
            want = LEVELS[level]
            have = current_config_caps()
            if (have[0], have[1]) != (want["max_in_progress"], want["per_profile"]):
                if write_config_caps(want["max_in_progress"], want["per_profile"]):
                    log(f"[re-assert] {level} caps={want['max_in_progress']}/"
                        f"{want['per_profile']} (检测到配置漂移已拉回)")
        return 0

    # ---- 档位变化 ----
    if level != "L0":
        # 降档：记录基线（第一次降档时从配置抓真实基线），写低档 caps。
        # 若上一档位是刚从试探升上来的（10min 内），视为试探失败 → 退避翻倍。
        if cur_level == "L0":
            have = current_config_caps()
            baseline = {"max_in_progress": have[0] or BASELINE["max_in_progress"],
                        "per_profile": have[1] or BASELINE["per_profile"]}
        try:
            last_up = datetime.fromisoformat(st.get("last_up") or "").timestamp()
            if now - last_up < BACKOFF_BASE_S:
                st["backoff_s"] = min(int(st.get("backoff_s") or BACKOFF_BASE_S) * 2,
                                      4 * BACKOFF_BASE_S)
                st["probe_failed_at"] = datetime.now().isoformat(timespec="seconds")
        except ValueError:
            pass
        caps = LEVELS[level]
        if write_config_caps(caps["max_in_progress"], caps["per_profile"]):
            st.update({"level": level, "since": datetime.now().isoformat(timespec="seconds"),
                       "baseline": baseline, "signals": sig})
            save_state(st)
            send_alert(
                f"【evo】并发降级 {cur_level}→{level} caps={caps['max_in_progress']}/{caps['per_profile']}",
                f"信号: {json.dumps(sig, ensure_ascii=False)}\n"
                f"dispatcher 并发上限已调低（≤60s 热生效，无需重启）。\n"
                f"基线已记录: {baseline['max_in_progress']}/{baseline['per_profile']}。\n"
                f"注: 429 可能来自外部客户端洪峰（cc-switch 共池信号），本机已自动让路。")
        return 0

    # ---- 升档（目标 L0）：试探-回退自适应 ----
    # 条件 A：干净+活跃证明（近 5min 0 错误且 ≥5 条真实请求 = worker 在线试过没事）
    # 条件 B：试探退避——上次试探失败后，需等 backoff_s 才允许下一次试探
    clean = (sig.get("err5", 1) == 0 and sig.get("req5", 0) >= CLEAN_MIN_REQ)
    if not clean:
        return 0  # 限速仍在生效或流量不足，继续观察（5min 后再试）
    backoff_s = int(st.get("backoff_s") or 0)
    fail_at = st.get("probe_failed_at")
    if backoff_s and fail_at:
        try:
            if now - datetime.fromisoformat(fail_at).timestamp() < backoff_s:
                return 0  # 退避期内：信号再干净也等（防震荡升级）
        except ValueError:
            pass
    restore = baseline if cur_level != "L0" else BASELINE
    if write_config_caps(restore["max_in_progress"], restore["per_profile"]):
        held_min = 0
        try:
            held_min = int((now - datetime.fromisoformat(st.get("since") or "").timestamp()) / 60)
        except ValueError:
            pass
        st.update({"level": "L0", "since": datetime.now().isoformat(timespec="seconds"),
                   "baseline": None, "signals": sig,
                   "last_up": datetime.now().isoformat(timespec="seconds"),
                   "backoff_s": 0, "probe_failed_at": None})
        save_state(st)
        send_alert(
            f"【evo】并发恢复 {cur_level}→L0 caps={restore['max_in_progress']}/{restore['per_profile']}",
            f"信号: {json.dumps(sig, ensure_ascii=False)}\n"
            f"在 {cur_level} 停留 {held_min} 分钟；近 5min 0 错误且 {sig.get('req5')} 条请求"
            f"（限速解除在线证据），试探性恢复基线（≤60s 热生效）。\n"
            f"若为外部洪峰间歇，10min 内复发会自动降回并进入指数退避。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
