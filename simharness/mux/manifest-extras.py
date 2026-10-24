#!/usr/bin/env python3
"""中央清单角色增量匹配器（mx-lib.sh install_skills 调用；守门测试测本真身）。

语义与 overlay skillprovision/manifest.ts 同源：精确 > 最长后缀 > 最长前缀；
**忽略 '*' 通用行**（sim 基线=SKILLS_INSTALL 同构分发，通用行叠装会翻倍）。
输出：命中角色的技能名每行一个（无命中=空输出）。清单坏文件=静默空输出
（fail-soft，install_skills 侧零行为变化）。
"""
import json
import sys


def spec(m: str) -> int:
    if m == '*':
        return 0
    if m.startswith('*'):
        return 500 + len(m)
    if m.endswith('*'):
        return 400 + len(m)
    return 1000 + len(m)


def matches(m: str, p: str) -> bool:
    if m == '*':
        return True
    if m.startswith('*'):
        return p.endswith(m[1:])
    if m.endswith('*'):
        return p.startswith(m[:-1])
    return m == p


def main(profile: str, path: str) -> None:
    try:
        roles = json.load(open(path)).get('roles', [])
    except Exception:
        return
    hit = [r for r in roles if r.get('match') and r['match'] != '*' and matches(r['match'], profile)]
    if not hit:
        return
    best = max(spec(r['match']) for r in hit)
    seen, out = set(), []
    for r in hit:
        if spec(r['match']) != best:
            continue
        for s in r.get('skills', []):
            if s not in seen:
                seen.add(s)
                out.append(s)
    print('\n'.join(out))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
