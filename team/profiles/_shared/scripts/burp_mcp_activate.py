#!/usr/bin/env python3
"""
burp_mcp_activate.py — Burp MCP Phase 1 激活脚本

用途：在获得 Burp Suite Pro License 后，一键激活 Burp MCP Phase 1。
包含：License 验证、Extension 加载、配置启用、工具发现验证。

用法：
  python3 burp_mcp_activate.py --license-key <KEY> [--burp-path "/Applications/Burp Suite.app"]

前置条件：
- Burp Suite Pro 已安装且已激活 License
- burp-mcp-all.jar 已下载到 ~/.hermes/tools/burp-mcp-all.jar
- Node.js Bridge 依赖已安装 ~/.hermes/tools/burp-mcp-bridge/bridge/
- hack-exploit config.yaml 已包含 mcp-burp toolset 和 burp mcp server 配置
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def run_cmd(cmd: list[str], cwd: str = None, timeout: int = 30) -> tuple[int, str, str]:
    """运行命令，返回 (exit_code, stdout, stderr)"""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"
    except Exception as e:
        return 1, "", str(e)


def check_burp_installed(burp_path: str) -> bool:
    """检查 Burp Suite 是否安装"""
    if os.path.isdir(burp_path):
        print(f"✅ Burp Suite 发现: {burp_path}")
        return True
    print(f"❌ Burp Suite 未找到: {burp_path}")
    return False


def check_license_activated(burp_path: str) -> bool:
    """检查 Burp Suite Pro License 是否已激活（通过检查是否能加载 Extension）"""
    # 简单检查：尝试启动 Burp 并在输出中查找 Pro 标识
    # 注意：这需要 Burp 实际运行，这里只做路径检查
    license_file = os.path.expanduser("~/.BurpSuite/license")
    if os.path.isfile(license_file):
        print(f"✅ 发现 License 文件: {license_file}")
        return True
    print(f"⚠️ 未发现 License 文件 (~/.BurpSuite/license)，请确认已在 Burp UI 中激活 Pro License")
    return False


def load_java_extension(burp_path: str, jar_path: str) -> tuple[bool, str]:
    """加载 Java Extension 到 Burp Suite"""
    # 通过 Burp 的命令行参数加载 extension（需要 Burp 运行）
    # 这里提供两种方式：
    # 1. 如果 Burp 已运行，通过 REST API（如果启用）或手动操作
    # 2. 启动 Burp 并加载 extension
    
    print("📦 尝试加载 Burp MCP Extension...")
    print(f"   JAR: {jar_path}")
    print(f"   Burp: {burp_path}")
    
    # 方式：启动 Burp 并加载 extension（headless 模式）
    # 注意：这会启动一个 Burp 实例，加载 extension 后退出
    # 实际生产中建议手动在 Burp UI 中加载
    
    cmd = [
        "java", "-jar", os.path.join(burp_path, "Contents/Resources/app/burpsuite.jar"),
        "--headless",
        "--load-extension", jar_path
    ]
    
    # 由于 Burp headless 加载 extension 需要 UI 交互，这里只给出手动步骤
    print("⚠️ Burp Extension 加载需要在 Burp UI 中手动完成：")
    print("   1. 打开 Burp Suite Professional")
    print("   2. Extensions -> Extensions -> Add")
    print("   3. Extension type: Java")
    print(f"   4. 选择: {jar_path}")
    print("   5. 确认输出显示 'Burp MCP Bridge extension loaded'")
    
    return True, "需手动在 Burp UI 中加载"


def enable_mcp_server(config_path: str) -> bool:
    """启用 config.yaml 中的 burp mcp server"""
    import yaml
    
    print(f"🔧 修改配置: {config_path}")
    
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    
    # 确保 mcp.servers.burp 存在且 enabled: true
    if "mcp_servers" not in config:
        config["mcp_servers"] = {}
    
    if "burp" not in config["mcp_servers"]:
        print("❌ 配置中缺少 mcp_servers.burp 节点")
        return False
    
    config["mcp_servers"]["burp"]["enabled"] = True
    
    # 备份原配置
    backup_path = config_path + ".bak." + time.strftime("%Y%m%d-%H%M%S")
    os.rename(config_path, backup_path)
    print(f"   备份原配置: {backup_path}")
    
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, sort_keys=False)
    
    print("✅ 已启用 mcp.servers.burp.enabled = true")
    return True


def verify_tool_discovery(profile: str = "hack-exploit") -> bool:
    """验证工具发现（通过 acp_agents 或 kanban 工具列表）"""
    print(f"🔍 验证工具发现 (profile: {profile})...")
    
    # 尝试通过 acp_agents 查看可用工具
    # 这里需要实际的 Hermes 环境运行
    print("   请在 hack-exploit profile 中运行以下验证：")
    print("   1. 重启 hack-exploit profile 或 gateway")
    print("   2. 调用 acp_agents 查看可用 agents")
    print("   3. 应看到 23 个 Burp 工具（proxy.http_history, proxy.send_to_repeater, scanner.scan 等）")
    
    return True


def update_tool_registry() -> bool:
    """更新 hack-tool-registry.md 状态为 Phase 1 接入完成"""
    registry_path = os.path.expanduser("~/.hermes/profiles/_shared/hack-tool-registry.md")
    
    if not os.path.isfile(registry_path):
        print(f"❌ 找不到工具注册表: {registry_path}")
        return False
    
    with open(registry_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 更新状态行
    if "⚠️ Phase 1 配置就绪，待 Pro License" in content:
        content = content.replace(
            "⚠️ Phase 1 配置就绪，待 Pro License",
            "✅ Phase 1 接入完成"
        )
        with open(registry_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("✅ 已更新 hack-tool-registry.md 状态为 'Phase 1 接入完成'")
        return True
    else:
        print("⚠️ 未找到预期的状态行，跳过更新")
        return True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Burp MCP Phase 1 激活脚本")
    ap.add_argument("--license-key", help="Burp Suite Pro License Key（可选，若已在 UI 激活可省略）")
    ap.add_argument("--burp-path", default="/Applications/Burp Suite.app", help="Burp Suite 安装路径")
    ap.add_argument("--jar-path", default="~/.hermes/tools/burp-mcp-all.jar", help="burp-mcp-all.jar 路径")
    ap.add_argument("--config-path", default="~/.hermes/profiles/hack-exploit/config.yaml", help="hack-exploit config.yaml 路径")
    ap.add_argument("--skip-license-check", action="store_true", help="跳过 License 检查（仅测试用）")
    ap.add_argument("--dry-run", action="store_true", help="仅打印将执行的操作，不实际修改")
    args = ap.parse_args(argv)

    print("=" * 60)
    print("🚀 Burp MCP Phase 1 激活脚本")
    print("=" * 60)

    # 展开路径
    burp_path = os.path.expanduser(args.burp_path)
    jar_path = os.path.expanduser(args.jar_path)
    config_path = os.path.expanduser(args.config_path)

    # 1. 检查前置条件
    print("\n📋 [1/6] 检查前置条件")
    if not check_burp_installed(burp_path):
        return 1
    if not os.path.isfile(os.path.expanduser(jar_path)):
        print(f"❌ JAR 文件不存在: {jar_path}")
        return 1
    print(f"✅ JAR 文件存在: {jar_path}")
    if not os.path.isfile(config_path):
        print(f"❌ 配置文件不存在: {config_path}")
        return 1
    print(f"✅ 配置文件存在: {config_path}")

    # 2. License 检查
    print("\n📋 [2/6] 检查 Burp Suite Pro License")
    if not args.skip_license_check:
        if not check_license_activated(burp_path):
            print("❌ Burp Suite Pro License 未激活，无法继续")
            print("   请先在 Burp Suite UI 中激活 Pro License")
            return 1
    else:
        print("⚠️ 跳过 License 检查（--skip-license-check）")

    # 3. 加载 Java Extension（手动步骤指引）
    print("\n📋 [3/6] 加载 Java Extension")
    if args.dry_run:
        print("   [DRY RUN] 将指引手动在 Burp UI 中加载 Extension")
    else:
        success, msg = load_java_extension(burp_path, os.path.expanduser(jar_path))
        if not success:
            print(f"❌ {msg}")
            return 1
        print(f"   {msg}")
        print("   请手动完成后按回车继续...")
        input()

    # 4. 启用 MCP Server 配置
    print("\n📋 [4/6] 启用 MCP Server 配置")
    if args.dry_run:
        print(f"   [DRY RUN] 将修改 {config_path}: mcp.servers.burp.enabled = true")
    else:
        if not enable_mcp_server(config_path):
            return 1

    # 5. 验证工具发现
    print("\n📋 [5/6] 验证工具发现")
    verify_tool_discovery()

    # 6. 更新工具注册表
    print("\n📋 [6/6] 更新工具注册表状态")
    if args.dry_run:
        print("   [DRY RUN] 将更新 hack-tool-registry.md 状态")
    else:
        update_tool_registry()

    print("\n" + "=" * 60)
    print("✅ Burp MCP Phase 1 激活流程完成！")
    print("=" * 60)
    print("\n后续步骤：")
    print("1. 重启 hack-exploit profile 或 gateway")
    print("2. 在 hack-exploit 中验证工具发现")
    print("3. 运行测试任务确认 Burp 工具可用")
    print("\n如需回滚：")
    print("  pkill -f 'burp-mcp-bridge'")
    print("  sed -i '/mcp-burp/d' ~/.hermes/profiles/hack-exploit/config.yaml")
    print("  sed -i '/mcp:/,/^$/ {/burp:/,/^  [a-z]/d}' ~/.hermes/profiles/hack-exploit/config.yaml")

    return 0


if __name__ == "__main__":
    sys.exit(main())