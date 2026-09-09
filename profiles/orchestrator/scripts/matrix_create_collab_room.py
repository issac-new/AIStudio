#!/usr/bin/env python3
"""Matrix 跨机协作房间创建 helper（orchestrator 专用）

用 @swarm 的 token 通过 Matrix Client-Server API 建私密房间并邀请对端 bot。
不依赖 mautrix，直接 aiohttp 调 homeserver——避免 gateway venv 依赖。

用法：
    python3 matrix_create_collab_room.py \
        --name "任务slug-协作" \
        --topic "看板任务 t_xxx 跨机协作" \
        --invite "@peer-bot:matrix.test,@peer2:other-server"

环境变量（从 ~/.hermes/profiles/orchestrator/.env 读，或 shell 注入）：
    MATRIX_HOMESERVER   形如 http://localhost:8008
    MATRIX_ACCESS_TOKEN @swarm 的 access token

输出：最后一行打印 room_id（形如 !xxx:matrix.test），供调用方捕获。
退出码：0 成功；1 参数/环境错误；2 homeserver 错误。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import aiohttp

ENV_PATH = Path.home() / ".hermes" / "profiles" / "orchestrator" / ".env"


def load_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    # shell 环境变量优先
    for k in ("MATRIX_HOMESERVER", "MATRIX_ACCESS_TOKEN"):
        if os.getenv(k):
            env[k] = os.environ[k]
    return env


async def create_room(homeserver: str, token: str, name: str, topic: str, invite: list[str]) -> str:
    url = f"{homeserver.rstrip('/')}/_matrix/client/v3/createRoom"
    payload = {
        "preset": "private_chat",          # 私密协作房（公房需 MATRIX_ALLOW_PUBLIC_ROOMS）
        "name": name,
        "topic": topic,
        "invite": invite,
        "is_direct": False,
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with aiohttp.ClientSession() as sess:
        async with sess.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            body = await resp.text()
            if resp.status != 200:
                raise RuntimeError(f"createRoom HTTP {resp.status}: {body}")
            data = json.loads(body)
            room_id = data.get("room_id")
            if not room_id:
                raise RuntimeError(f"createRoom 响应缺 room_id: {body}")
            return room_id


def main() -> int:
    ap = argparse.ArgumentParser(description="创建 Matrix 跨机协作房间")
    ap.add_argument("--name", required=True, help="房间名（任务slug-协作）")
    ap.add_argument("--topic", default="", help="房间主题（建议带看板 task-id）")
    ap.add_argument("--invite", required=True, help="逗号分隔的对端 bot MXID 列表")
    args = ap.parse_args()

    env = load_env()
    homeserver = env.get("MATRIX_HOMESERVER", "").strip()
    token = env.get("MATRIX_ACCESS_TOKEN", "").strip()
    if not homeserver or not token:
        print("ERROR: 缺 MATRIX_HOMESERVER / MATRIX_ACCESS_TOKEN（检查 orchestrator/.env）", file=sys.stderr)
        return 1

    invite = [m.strip() for m in args.invite.split(",") if m.strip()]
    if not invite:
        print("ERROR: --invite 至少一个对端 bot MXID", file=sys.stderr)
        return 1
    for m in invite:
        if not (m.startswith("@") and ":" in m):
            print(f"ERROR: 非法 MXID: {m}（应形如 @user:server）", file=sys.stderr)
            return 1

    try:
        room_id = asyncio.run(create_room(homeserver, token, args.name, args.topic, invite))
    except Exception as exc:
        print(f"ERROR: 建群失败: {exc}", file=sys.stderr)
        return 2

    print(f"✓ 房间已创建并邀请 {len(invite)} 个对端 bot")
    print(room_id)  # 最后一行 = room_id，供调用方捕获
    return 0


if __name__ == "__main__":
    sys.exit(main())
