#!/usr/bin/env python3
"""Patch hermes-agent/tools/skills_sync.py — profile-layer skills install as symlinks.

Root cause (2026-08-06): `hermes update` runs seed_profile_skills() →
sync_skills() with HERMES_HOME=<profile_dir>. The bundled sync then uses
shutil.copytree() to materialise missing categories as REAL directories
inside each profile's skills/, recreating directory copies that should be
symlinks to ~/.hermes/skills/. This resurrected pruned skills and duplicated
the shared skill tree per profile (see session 20260806_* "skills 错配").

Fix: when HERMES_HOME points at a NAMED profile (not the default ~/.hermes),
install new/updated skill categories as symlinks into ~/.hermes/skills/<rel>
(the shared layer) when that target exists; only fall back to copytree when
the shared target is missing. This keeps update-time seeding symlink-based
for named profiles while leaving the default profile behaviour unchanged.

Idempotent: re-applying the patch is a no-op (guarded by signature checks in
apply-source-patches.sh).
"""
import re
from pathlib import Path

REPO = Path.home() / ".hermes" / "hermes-agent"
TARGET = REPO / "tools" / "skills_sync.py"

src = TARGET.read_text(encoding="utf-8")

# ── 1. Insert helper after _get_bundled_dir() (after line 76) ──
HELPER = '''
def _is_named_profile_home() -> bool:
    """True when HERMES_HOME is a named profile under ~/.hermes/profiles/<name>.

    The default install (HERMES_HOME == ~/.hermes) keeps copytree semantics;
    named profiles switch to symlink installs so update-time seeding cannot
    materialise per-profile directory copies of shared skills.
    """
    try:
        home = HERMES_HOME.resolve()
    except OSError:
        return False
    profiles_root = (Path.home() / ".hermes" / "profiles").resolve()
    return home != profiles_root and str(home).startswith(str(profiles_root) + "/")


def _shared_layer_target(rel: Path) -> Path:
    """Return the shared-layer path for a skill's relative path under skills/.

    e.g. rel=productivity/xlsx -> ~/.hermes/skills/productivity/xlsx
    """
    return Path.home() / ".hermes" / "skills" / rel


def _install_skill_dest(skill_src: Path, rel: Path, quiet: bool = False) -> bool:
    """Install one skill category into this profile's skills dir.

    Named profiles: symlink to the shared layer (~/.hermes/skills/<rel>) when
    the shared target exists; fall back to copytree only when it doesn't
    (custom-only categories). Returns True when something was installed.
    """
    dest = SKILLS_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if _is_named_profile_home():
        shared_target = _shared_layer_target(rel)
        if shared_target.exists():
            try:
                dest.symlink_to(shared_target, target_is_directory=True)
                if not quiet:
                    print(f"  + {rel} (symlink -> shared)")
                return True
            except (OSError, IOError) as e:
                if not quiet:
                    print(f"  ! Failed to link {rel}: {e}")
                return False
        # shared target missing — fall through to copy (custom category)
    try:
        shutil.copytree(skill_src, dest)
        if not quiet:
            print(f"  + {rel}")
        return True
    except (OSError, IOError) as e:
        if not quiet:
            print(f"  ! Failed to copy {rel}: {e}")
        return False

'''

anchor = "def _get_bundled_dir() -> Path:"
assert anchor in src, "anchor _get_bundled_dir not found"
# Insert after the function body of _get_bundled_dir (find the next top-level def after anchor)
idx = src.index(anchor)
next_def = src.index("\ndef ", idx + 1)
src = src[:next_def] + HELPER + src[next_def:]

# ── 2. Replace the three copytree install/update sites with the helper ──
# Site A: "New skill — never offered before" (else branch at ~line 824-830)
old_a = """                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(skill_src, dest)
                    copied.append(skill_name)
                    manifest[skill_name] = bundled_hash
                    if not quiet:
                        print(f"  + {skill_name}")"""
new_a = """                else:
                    _rel = _compute_relative_dest(skill_src, bundled_dir)
                    if _install_skill_dest(skill_src, _rel, quiet=quiet):
                        copied.append(skill_name)
                        manifest[skill_name] = bundled_hash"""
assert old_a in src, "site A not found"
src = src.replace(old_a, new_a, 1)

# Site B: update branch (move aside then copytree, ~line 880-890)
old_b = """                    shutil.move(str(dest), str(backup))
                    try:
                        shutil.copytree(skill_src, dest)
                        manifest[skill_name] = bundled_hash
                        updated.append(skill_name)
                        if not quiet:
                            print(f"  ↑ {skill_name} (updated)")"""
new_b = """                    shutil.move(str(dest), str(backup))
                    try:
                        _rel = _compute_relative_dest(skill_src, bundled_dir)
                        if _install_skill_dest(skill_src, _rel, quiet=quiet):
                            manifest[skill_name] = bundled_hash
                            updated.append(skill_name)
                            if not quiet:
                                print(f"  ↑ {skill_name} (updated)")"""
assert old_b in src, "site B not found"
src = src.replace(old_b, new_b, 1)

# Site C: restore_official_optional_skill copytree (~line 398) — keep as copy
# (restore path is intentional copy; symlinks there could surprise hub users).
# No change needed.

TARGET.write_text(src, encoding="utf-8")
print("patched:", TARGET)
