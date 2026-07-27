#!/usr/bin/env python3
"""
patch-acp-plugin-for-claude.py

One-shot patcher: adds the `claude` provider branch to
`hermes-plugin-acp-client/__init__.py` — _resolve_provider().

Includes npx path fallback logic (Linuxbrew, nvm, /usr/local/bin)
and improved error messages matching orchestrator's reference version.

Usage:
  python3 patch-acp-plugin-for-claude.py                        # patches the default profile
  python3 patch-acp-plugin-for-claude.py --profile worker-coder # patches a specific profile
  python3 patch-acp-plugin-for-claude.py --all                  # patches ALL profiles
  python3 patch-acp-plugin-for-claude.py --check                # check only, no changes

Safe to re-run — idempotent (checks if patch already applied).
"""

import os, sys, re, argparse, glob


def find_all_profiles() -> list[str]:
    """Discover all Hermes profiles with ACP plugin installed."""
    profiles_dir = os.path.expanduser("~/.hermes/profiles")
    if not os.path.isdir(profiles_dir):
        return []
    results = []
    for entry in os.listdir(profiles_dir):
        plugin_init = os.path.join(profiles_dir, entry, "plugins", "acp-client", "__init__.py")
        if os.path.isfile(plugin_init):
            results.append(entry)
    return sorted(results)


def find_plugin_init(profile: str = None) -> str:
    """Locate the ACP plugin __init__.py."""
    if profile:
        base = os.path.expanduser(f"~/.hermes/profiles/{profile}/plugins/acp-client")
    else:
        base = os.path.expanduser("~/.hermes/plugins/acp-client")

    path = os.path.join(base, "__init__.py")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"ACP plugin __init__.py not found at {path}")
    return path


def already_patched(content: str) -> bool:
    """Check if the orchestrator-level patch (with npx fallbacks + improved errors) is applied."""
    return (
        'elif name == "claude":' in content
        and 'if not npx_path:' in content
    )


def _claude_branch() -> str:
    """Return the claude provider branch matching orchestrator's reference version."""
    return '''
    elif name == "claude":
        # 1) Direct binary path (preferred)
        binary = provider_cfg.get("binary", "")
        if binary:
            binary = os.path.expanduser(binary)
            if not os.path.isfile(binary):
                raise FileNotFoundError(
                    f"Claude ACP binary not found at '{binary}'. "
                    f"Install with: npm install -g @agentclientprotocol/claude-agent-acp"
                )
            extra_args = provider_cfg.get("args", [])
            return [binary] + extra_args, "Claude Agent"

        # 2) Via npx (fallback)
        npx = provider_cfg.get("npx", "npx")
        npx_path = shutil.which(npx)
        if not npx_path:
            for candidate in [
                "/home/linuxbrew/.linuxbrew/bin/npx",
                "/usr/local/bin/npx",
                os.path.expanduser("~/.nvm/current/bin/npx"),
            ]:
                if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                    npx_path = candidate
                    break
        if npx_path:
            package = provider_cfg.get("package", "@agentclientprotocol/claude-agent-acp")
            return [npx_path, package], "Claude Agent"

        raise FileNotFoundError(
            "Claude ACP provider requires either:\\n"
            "  1) binary path to claude-agent-acp, or\\n"
            "  2) npx (Node.js) to run @agentclientprotocol/claude-agent-acp"
        )

'''


def patch_file(path: str, dry_run: bool = False) -> bool:
    """Patch _resolve_provider to add claude. Returns True if changed."""
    with open(path) as f:
        content = f.read()

    if already_patched(content):
        print(f"  ✅ Already patched — claude provider with npx fallbacks present.")
        return False

    # If claude branch exists but without npx fallbacks, we need to upgrade it
    if 'elif name == "claude":' in content and not already_patched(content):
        print(f"  ⬆️  Upgrading claude provider branch (adding npx fallbacks + better errors)...")
        # Simple approach: find and replace the old claude branch with the new one
        old_pattern = r"elif name == \"claude\":.*?(?=\n    elif |\n    else:)"
        match = re.search(old_pattern, content, re.DOTALL)
        if match:
            content = content.replace(match.group(0), _claude_branch().strip())
            if dry_run:
                print(f"  🔍 Dry-run: would upgrade {path}")
                return True
            with open(path, 'w') as f:
                f.write(content)
            print(f"  ✅ Upgraded {path}")
            return True
        print(f"  ❌ Could not match existing claude branch for replacement")
        return False

    # Find the final else block
    old_else = re.search(
        r'(\n    else:\n        raise ValueError\(\n            f"Unknown ACP provider.*?Available:.*?"\n        \))',
        content, re.DOTALL
    )
    if not old_else:
        print(f"  ❌ Could not find the final else block in _resolve_provider()")
        return False

    # Insert claude branch before the final else
    updated = content.replace(old_else.group(1), _claude_branch() + old_else.group(1))

    # Update error message to include claude
    updated = updated.replace(
        "Available: opencode, codex",
        "Available: opencode, codex, claude"
    )

    # Also update _PROVIDER_DESC if it still omits claude
    updated = updated.replace(
        "'opencode' or 'codex'",
        "'opencode', 'codex', or 'claude'"
    )

    if dry_run:
        print(f"  🔍 Dry-run: would patch {path}")
        return True

    with open(path, 'w') as f:
        f.write(updated)

    print(f"  ✅ Patched {path}")
    print(f"     Added: claude provider branch + npx fallbacks + updated _PROVIDER_DESC")
    return True


def main():
    parser = argparse.ArgumentParser(description="Patch ACP plugin for claude provider support")
    parser.add_argument("--profile", "-p", help="Target Hermes profile")
    parser.add_argument("--all", action="store_true", help="Patch ALL profiles with ACP plugin installed")
    parser.add_argument("--check", action="store_true", help="Check only, no changes")
    args = parser.parse_args()

    if args.all:
        profiles = find_all_profiles()
        if not profiles:
            print("❌ No profiles with ACP plugin found.")
            sys.exit(1)
        print(f"📂 Found {len(profiles)} profile(s) with ACP plugin: {', '.join(profiles)}")
        changed_any = False
        for prof in profiles:
            try:
                path = find_plugin_init(prof)
                changed = patch_file(path, dry_run=args.check)
                changed_any = changed_any or changed
            except FileNotFoundError:
                print(f"  ⚠️  Profile '{prof}' plugin dir not found, skipping")
        sys.exit(0 if changed_any or args.check else 0)

    try:
        path = find_plugin_init(args.profile)
        print(f"📂 Found: {path}")
        changed = patch_file(path, dry_run=args.check)
        sys.exit(0 if changed or args.check else 0)
    except FileNotFoundError as e:
        print(f"❌ {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
