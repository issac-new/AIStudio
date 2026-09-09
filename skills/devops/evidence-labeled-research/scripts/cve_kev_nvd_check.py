#!/usr/bin/env python3
"""CVE intel freshness check: CISA KEV membership + NVD record state/scores.

Usage:
    python3 scripts/cve_kev_nvd_check.py CVE-2026-18885 CVE-2026-18886
    python3 scripts/cve_kev_nvd_check.py            # ServiceNow Aug-2026 batch default

Why: vendor CNA self-scores drift after disclosure (case: CVE-2026-6876
revised 8.7 -> 10.0 within 5 days, NVD lastModified 2026-09-01). News-article
scores are snapshots; re-verify at analysis time and cite lastModified.
"""
import json
import sys
import urllib.request

DEFAULT_CVES = [
    "CVE-2026-18885", "CVE-2026-18886", "CVE-2026-74820", "CVE-2026-6876", "CVE-2026-6875",
]
KEV_URLS = [
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    "https://raw.githubusercontent.com/cisagov/kev-data/develop/kev.json",
]
UA = {"User-Agent": "cve-intel-check/1.0"}


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def check_kev(cves):
    kev = None
    for url in KEV_URLS:
        try:
            kev = fetch(url)
            print(f"=== CISA KEV OK via {url.split('/')[2]} | dateReleased {kev.get('dateReleased', '?')} ===")
            break
        except Exception as ex:
            print(f"KEV via {url} failed: {ex}")
    if kev is None:
        print("KEV: ALL feed URLs failed")
        return
    indexed = {e["cveID"]: e for e in kev.get("vulnerabilities", [])}
    for c in cves:
        e = indexed.get(c)
        if e:
            print(f"  {c}: IN KEV | added {e.get('dateAdded')} | ransomware: {e.get('knownRansomwareCampaignUse', '?')}")
        else:
            print(f"  {c}: not in KEV")


def check_nvd(cve):
    try:
        data = fetch(f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve}")
    except Exception as ex:
        print(f"  {cve}: NVD query failed: {ex}")
        return
    vulns = data.get("vulnerabilities", [])
    if not vulns:
        print(f"  {cve}: NOT FOUND in NVD")
        return
    rec = vulns[0]["cve"]
    print(f"  {cve}: state={rec.get('vulnStatus')} | published={rec.get('published', '')[:10]} | lastModified={rec.get('lastModified', '')[:10]}")
    for mtype, entries in rec.get("metrics", {}).items():
        for e in entries:  # guard: SSVC entries have no cvssData
            d = e.get("cvssData") or {}
            if d:
                print(f"      {mtype} | source={e.get('source')} | type={e.get('type')} | score={d.get('baseScore')} | vector={d.get('vectorString')}")
            else:
                print(f"      {mtype} | source={e.get('source')} | (no cvssData)")
    desc = next((d["value"] for d in rec.get("descriptions", []) if d.get("lang") == "en"), "")
    print(f"      desc: {desc[:180]}")


if __name__ == "__main__":
    cves = sys.argv[1:] or DEFAULT_CVES
    check_kev(cves)
    print("\n=== NVD records ===")
    for c in cves:
        check_nvd(c)
