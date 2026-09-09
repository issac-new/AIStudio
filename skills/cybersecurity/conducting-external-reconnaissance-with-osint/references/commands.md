# External Reconnaissance & OSINT — Command Templates

Threatswarm-style recon/osint agent playbook. Commands are copy-paste ready; replace
`target.com` / `TARGET` with the in-scope asset. Requires written authorization.

---

## Phase 0 — Setup & Authorization

```bash
export TARGET="target.com"
mkdir -p recon/{subs,live,urls,osint,screenshots} && cd recon
# Verify scope ownership before touching anything
whois $TARGET | egrep -i 'Registrant|Org|Name Server'
```

---

## Phase 1 — Passive Subdomain Enumeration (no target interaction)

Goal: widest possible subdomain list from passive sources only.

```bash
# subfinder (fast, many sources)
subfinder -d $TARGET -all -silent -o subs/subfinder.txt

# amass passive (slower, deeper)
amass enum -passive -d $TARGET -o subs/amass.txt

# Certificate Transparency logs
curl -s "https://crt.sh/?q=%25.$TARGET&output=json" \
  | jq -r '.[].name_value' | sed 's/\*\.//g' | sort -u > subs/crtsh.txt

# assetfinder + findomain (quick wins)
assetfinder --subs-only $TARGET > subs/assetfinder.txt
findomain -t $TARGET -q > subs/findomain.txt

# Merge + dedupe
cat subs/*.txt | sort -u > subs/all_subs.txt
wc -l subs/all_subs.txt
```

### ASN / IP range discovery (for netblock recon)

```bash
# Find the org's ASN and prefixes
whois -h whois.cymru.com " -v $(dig +short $TARGET A | head -1)"
amass intel -org "Target Corp" -max-dns-queries 2500
asnmap -org "Target Corp" -silent
```

---

## Phase 2 — DNS Resolution & Live Host Probing

Goal: figure out which subdomains resolve, and which respond on HTTP(S).

```bash
# Resolve subdomains → IPs (dnsx / puredns)
dnsx -l subs/all_subs.txt -a -resp -silent -o subs/resolved.txt
cat subs/resolved.txt | awk '{print $1}' > subs/resolved_hosts.txt

# HTTP probing — status, title, tech, CDN
httpx -l subs/resolved_hosts.txt -title -tech-detect -status-code \
  -web-server -cdn -follow-redirects -silent -o live/httpx_full.txt

# Keep only live web targets
httpx -l subs/resolved_hosts.txt -silent -mc 200,301,302,401,403 -o live/live_hosts.txt

# Screenshot live hosts for visual triage
gowitness scan file -f live/live_hosts.txt --screenshot-path screenshots/ \
  --threads 8 2>/dev/null || eyewitness -f live/live_hosts.txt -d screenshots/
```

---

## Phase 3 — OSINT: WHOIS / DNS / Email / People

Goal: gather non-technical intelligence (never touches target hosts).

### WHOIS & DNS records

```bash
whois $TARGET > osint/whois.txt
dig $TARGET ANY +noall +answer
dig $TARGET MX TXT NS SOA +noall +answer
# Zone transfer attempt (usually fails, cheap to try)
for ns in $(dig +short NS $TARGET); do dig axfr @$ns $TARGET; done
# Reverse WHOIS on registrant to find sibling domains
#   https://viewdns.info/reversewhois/  or whoxy.com
```

### Email harvesting & breach data

```bash
# theHarvester across all sources
theHarvester -d $TARGET -b all -f osint/harvester.html

# Email format + verification (Hunter.io)
#   https://hunter.io/email-finder  → pattern like {f}.{l}@target.com

# Have I Been Pwned (needs API key)
curl -s -H "hibp-api-key: $HIBP_KEY" \
  "https://haveibeenpwned.com/api/v3/breachedaccount/user@$TARGET" | jq .

# Dehashed / IntelligenceX (paid) — search for domain-level leaks
```

### Cloud storage & code repositories

```bash
# S3 / Azure / GCP bucket discovery
cloud_enum -k target -k $TARGET -l osint/cloud_enum.txt

# GitHub secret hunting
trufflehog github --org=target --only-verified
gitleaks detect --source https://github.com/target/repo -v

# GitHub dorks (search in browser):
#   org:target "password"
#   org:target "api_key" OR "apikey" OR "secret"
#   "target.com" extension:env
#   "target.com" filename:.git-credentials
```

### Google Dorks (run in browser)

```
site:target.com filetype:pdf OR filetype:xlsx OR filetype:docx
site:target.com inurl:admin OR inurl:login OR inurl:portal
site:target.com intitle:"index of /"
site:target.com ext:sql OR ext:bak OR ext:conf OR ext:log
site:pastebin.com "target.com"
site:github.com "target.com" password
```

### Wayback Machine — historical endpoints

```bash
# All archived URLs for the domain
curl -s "http://web.archive.org/cdx/search/cdx?url=*.$TARGET/*&output=text&fl=original&collapse=urlkey" \
  | sort -u > osint/wayback_urls.txt

# Quick param-bearing endpoints
gau --subs $TARGET | sort -u > osint/gau_urls.txt
waybackurls $TARGET | grep -E '\.js$|\?|\.json' | sort -u > osint/wayback_interesting.txt
```

### Shodan / Censys (infrastructure without scanning)

```bash
shodan search "ssl.cert.subject.cn:$TARGET" --fields ip_str,port,hostnames,org
shodan search "hostname:$TARGET" --fields ip_str,port,http.title,product
# Censys: search "services.tls.certificates.leaf_data.subject.common_name: target.com"
```

---

## Phase 4 — Content Discovery on Live Hosts

Goal: find hidden directories/files/endpoints on confirmed live web targets.

```bash
# Directory brute-force
feroxbuster -u https://app.$TARGET -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt \
  -t 50 -o live/ferox_app.txt

# Per-host batch mode
while read h; do feroxbuster -u "$h" -w /usr/share/seclists/Discovery/Web-Content/common.txt \
  --silent -q -o "live/ferox_$(echo $h | md5sum | cut -c1-8).txt"; done < live/live_hosts.txt

# JS endpoint extraction
cat osint/wayback_urls.txt | grep '\.js$' | head -50 | while read js; do
  curl -s "$js" | grep -oE '"/[a-zA-Z0-9_/.-]+"' | sort -u
done > live/js_endpoints.txt

# katana / gospider crawling
katana -list live/live_hosts.txt -d 3 -jc -o live/katana.txt
```

---

## Phase 5 — Vulnerability Sweep of Recon Surface

Goal: low-noise nuclei sweep over everything found. Feed into `conducting-network-penetration-test` for deeper testing.

```bash
# Tech + CVE templates against live hosts
nuclei -l live/live_hosts.txt -severity critical,high,medium \
  -rl 50 -c 25 -silent -o live/nuclei_results.txt

# Exposure/misconfiguration templates (low false-positive set)
nuclei -l live/live_hosts.txt -tags exposure,misconfig,takeover,panel \
  -silent -o live/nuclei_exposures.txt

# Subdomain takeover check
subzy run --targets subs/resolved_hosts.txt --hide_fails
```

---

## Reporting Checklist

- [ ] Total subdomains (per source breakdown)
- [ ] Live HTTP(S) hosts with tech fingerprint + status
- [ ] IP → ASN → cloud provider mapping
- [ ] Emails harvested + format pattern
- [ ] Credentials/secrets found (repo, paste, breach)
- [ ] Cloud buckets / exposed storage
- [ ] Nuclei findings (crit/high first) with evidence
- [ ] Screenshot gallery of interesting panels
- [ ] Hand-off targets for active scanning phase
