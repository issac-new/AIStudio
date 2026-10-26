#!/usr/bin/env python3
"""REAP 融合卡 t_1ece18b8 冻结验收标准 6 项机械独立验收（双轨并行交付后的独立核验）"""
import subprocess, os, json, hashlib, re, sys

W = '/Users/YOURNAME/.hermes/shared/research/reap-fusion-20261026'
results = {}

# ── AC1: skill version + REAP section + references ≥27 ──
base = os.path.expanduser('~/.hermes/skills/devops/rea-reverse-engineering')
c = open(f'{base}/SKILL.md').read()
m = re.search(r'^version:\s*(\S+)', c, re.M)
ver = m.group(1) if m else None
reap_n = int(subprocess.run(f'find {base}/references/reap -type f | wc -l', shell=True, capture_output=True, text=True).stdout.strip())
results['AC1_skill_v1.2.0_REAP_27files'] = {
    'version': ver, 'has_REAP_heading': '## REAP 提示词库' in c, 'reap_file_count': reap_n,
    'pass': ver == '1.2.0' and '## REAP 提示词库' in c and reap_n >= 27,
}

# ── AC2: 34 处 SKILL.md md5 全一致（含硬链形态）──
r = subprocess.run('ls -d ~/.hermes/profiles/*/skills/*/rea-reverse-engineering ~/.hermes/profiles/*/skills/*/*/rea-reverse-engineering 2>/dev/null', shell=True, capture_output=True, text=True)
dirs = [d for d in r.stdout.strip().split('\n') if d]
paths = [f"{d}/SKILL.md" for d in dirs] + [f"{base}/SKILL.md"]
md5_set = {hashlib.md5(open(p,'rb').read()).hexdigest() for p in paths}
inodes = {os.stat(p).st_ino for p in paths}
results['AC2_34_hardlink_md5'] = {
    'count': len(paths), 'distinct_md5': len(md5_set), 'distinct_inodes': len(inodes),
    'md5': list(md5_set)[0] if len(md5_set)==1 else None,
    'pass': len(paths) == 34 and len(md5_set) == 1,
}

# ── AC3: mcp_servers.rea 形状三键一致 + recon 不装 ──
import yaml
shapes = {}
for prof in ['hack-forensics','hack-exploit','hack-auditor']:
    with open(os.path.expanduser(f'~/.hermes/profiles/{prof}/config.yaml')) as f:
        cfg = yaml.safe_load(f)
    rea = (cfg.get('mcp_servers') or {}).get('rea')
    shapes[prof] = {k: rea.get(k) for k in ('command','args','env','enabled')} if rea else None
    # validate yaml loads back
with open(os.path.expanduser('~/.hermes/profiles/hack-recon/config.yaml')) as f:
    recon_has_rea = 'rea' in (yaml.safe_load(f).get('mcp_servers') or {})
shape_ok = all(
    shapes[p] and shapes[p]['command'] == shapes['hack-forensics']['command']
    and shapes[p]['args'] == shapes['hack-forensics']['args']
    and shapes[p]['env'] == shapes['hack-forensics']['env']
    for p in ['hack-exploit','hack-auditor']
)
three_keys = bool(shapes['hack-forensics']) and all(k in shapes['hack-forensics'] for k in ('command','args','env'))
results['AC3_mcp_shape'] = {
    'forensics': shapes['hack-forensics'],
    'exploit_matches': shapes['hack-exploit'] == shapes['hack-forensics'],
    'auditor_matches': shapes['hack-auditor'] == shapes['hack-forensics'],
    'recon_has_rea': recon_has_rea,
    'pass': three_keys and shape_ok and not recon_has_rea,
}

# ── AC4: resolver 命中 ──
r = subprocess.run('python3 /Users/YOURNAME/.hermes/profiles/_shared/scripts/resolver_cli.py "逆向分析这个二进制文件" --json', shell=True, capture_output=True, text=True)
try:
    res = json.loads(r.stdout)
    pid_ = res['primary']['id'] if res['primary'] else None
    sups = [s['id'] for s in res.get('supports', [])]
    results['AC4_resolver_hit'] = {
        'primary': pid_, 'supports': sups, 'confidence': res.get('confidence'),
        'pass': 'rea-reverse-engineering' in ([pid_] if pid_ else []) + sups,
    }
except Exception as e:
    results['AC4_resolver_hit'] = {'error': str(e), 'raw': r.stdout[:400], 'pass': False}

# ── AC5: 4 hack SOUL 各含 REAP 节且带可执行命令 ──
ac5 = {}
for prof in ['hack-forensics','hack-exploit','hack-auditor','hack-recon']:
    soul = os.path.expanduser(f'~/.hermes/profiles/{prof}/SOUL.md')
    sc = open(soul).read()
    has_heading = 'REA/REAP 逆向能力' in sc
    # extract section until next ## heading
    mm = re.search(r'## REA/REAP 逆向能力.*?(?=\n## |\Z)', sc, re.S)
    sec = mm.group(0) if mm else ''
    has_cmd = bool(re.search(r'```', sec)) and ('skill_view' in sec or 'resolver_cli' in sec or re.search(r'^\s{0,4}(hermes|rea|python3|ls|grep)\b', sec, re.M))
    ac5[prof] = {'heading': has_heading, 'section_len': len(sec), 'has_exec_cmd': has_cmd,
                 'pass': has_heading and has_cmd}
results['AC5_soul_x4'] = ac5
results['AC5_soul_x4']['pass'] = all(v['pass'] for v in ac5.values())

# ── AC6: workspace 产物（原文+正典+裁决）──
def ex(rel): return os.path.exists(f'{W}/{rel}')
ac6 = {
    'wx_article': ex('wx-article-original.json'),
    'canon_README': ex('REA-Prompts-main/README.md'),
    'canon_system_prompt': ex('REA-Prompts-main/system_prompt.md'),
    'canon_26_packs': int(subprocess.run(f'ls -d {W}/REA-Prompts-main/Skills/reap-* 2>/dev/null | wc -l', shell=True, capture_output=True, text=True).stdout.strip()),
    'verdict_doc': ex('FUSION-VERDICT-20261026.md'),
    'inventory': ex('INVENTORY.json'),
}
ac6['pass'] = ac6['wx_article'] and ac6['canon_README'] and ac6['canon_system_prompt'] and ac6['canon_26_packs'] == 26 and ac6['verdict_doc']
results['AC6_workspace'] = ac6

# ── summary ──
all_pass = all(v['pass'] for v in results.values())
print(json.dumps(results, indent=2, ensure_ascii=False, default=str))
print(f"\n===== TOTAL: {'ALL PASS' if all_pass else 'FAIL'} =====")
sys.exit(0 if all_pass else 1)
