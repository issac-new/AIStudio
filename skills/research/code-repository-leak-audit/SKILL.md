---
name: code-repository-leak-audit
description: "Audit public code repositories (GitHub/Gitee/GitCode/CODING/GitLab public) for a specific organization's leaked code, hardcoded config/secrets, and internal-tool source exposure. Use when the user asks to 检索/排查 code leaks, config leaks, key/secret leaks, or internal-tool exposure for a company. Covers the gh CLI code-search workflow, Gitee API v5 employee-account discovery, repo tree inspection, commit-email attribution, cross-repo credential-reuse detection, the risk-rating matrix, and the evidence-snapshot report format."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [osint, code-leak, secret-leak, github, gitee, supply-chain, reconnaissance, chinese-companies]
    related_skills:
      - osint-asset-mapping
      - scope-discipline
      - deep-research-workflow
---

# Code Repository Leak Audit

Search **public** code repositories for an organization's leaked source code, hardcoded configuration, credentials, and internal-tool exposure. Every finding must be backed by a real API call and a content snippet — never fabricate a leak. If a platform returns nothing, say so explicitly.

## When to use

- User asks to 检索/排查 代码泄露 / 配置泄露 / 密钥泄露 / 内部工具暴露 for a company
- Supply-chain security review: did a vendor or integrator publish a customer's internal code?
- Pre-engagement / due-diligence: what internal tools and config patterns are publicly exposed?
- Breach scoping: a known leak exists — find all related repositories by the same maintainer

**Boundary**: only public repository metadata and public blob content. Never clone private repos, never use leaked credentials to log in, never send traffic to the target's infrastructure. State this compliance boundary in the final report.

## The 6-step workflow

### Step 1 — Identity expansion (keywords)

Before searching, enumerate all identifiers a leak might carry. Missing one means missing leaks.

| Category | Examples (for 杭州行芯科技有限公司) |
|----------|-----------------------------------|
| Full Chinese name | 杭州行芯科技有限公司, 行芯科技, 行芯 |
| English name / domain | Phlexing, phlexing.com |
| Email domain | @phlexing.com (search commits + code) |
| Product names | GloryEX, GloryBolt, PhyBolt, GloryPolaris, GloryWatt, GloryEye |
| Internal tool names | (discovered during search — e.g. a PMS DB name) |

### Step 2 — GitHub search (authenticated gh CLI)

Use `gh api` with the authenticated keyring token — no separate PAT needed. Code search requires authentication.

```bash
# Repository search
gh api -X GET search/repositories -f q="phlexing" -f per_page=30 \
  --jq '.total_count, (.items[]? | "\(.full_name) | \(.description // "n/a") | \(.html_url)")'

# Code search (requires auth)
gh api -X GET search/code -f q="phlexing.com" -f per_page=30 \
  --jq '.total_count, (.items[]? | "\(.repository.full_name) | \(.path)")'

# User/org search
gh api -X GET search/users -f q="phlexing" -f per_page=20 \
  --jq '.total_count, (.items[]? | "\(.login) | type:\(.type) | \(.html_url)")'
```

**Query strategy** (run all of these — different queries catch different leaks):

| Query shape | Catches |
|-------------|--------|
| `"company.com"` (domain in code) | External links, hardcoded URLs, email addresses |
| `company password` / `company secret` | Config files with company name near credential keys |
| `@company.com` (email in commits/code) | Employee email leakage — **note: GitHub code search does NOT index commit author emails; use the commits API instead** |
| Product names (GloryEX, GloryBolt...) | Source of proprietary tools |
| `repo:<user>/<repo> <keyword>` | Scoped deep-dive once a suspicious repo is found |

**Pitfall — username collision**: A company name as a GitHub user/repo name is often an unrelated project. `phlexing` on GitHub is a Ruby ERB→Phlex converter (marcoroth/phlexing), NOT the Chinese [已移除] company. Always verify ownership before attributing a repo to the target company. Verification signals:
- DB name in config matches the company (`phlexing_new` → 行芯)
- Commit author email domain matches (`@chandao.com` → integrator, not the company itself)
- Custom extension directories named after the company (`extension/custom/.../phlexing.php`)
- Company product names in the codebase

### Step 3 — Commit-email attribution (who pushed it)

```bash
# List commits, extract author/committer emails
gh api "repos/<owner>/<repo>/commits?per_page=100" \
  --jq '.[] | "\(.commit.author.name) <\(.commit.author.email)> | \(.commit.message | split("\n")[0])"'
```

Collect all author/committer emails. An `@company.com` email confirms the repo belongs to the target. An integrator email (`@chandao.com`, `@vendor.com`) means a supplier leaked a customer's code — a common supply-chain leak pattern.

### Step 4 — Config / secret extraction

Once a suspicious repo is identified, pull its config files. For each repo, check:

| File pattern | What it leaks |
|--------------|-------------|
| `config/my.php` (ZenTao/禅道) | DB host/user/password/name — **see references/zentao-config-leak.md** |
| `.env` / `.env.local` / `.env.production` (Laravel, many frameworks) | APP_KEY, DB_*, MAIL_*, AWS_*, third-party API keys |
| `config/database.php` / `config/app.php` | DB defaults, app URL |
| `application.yml` / `application.properties` (Java/Spring) | DB creds, JWT secrets |
| `settings.py` (Django) | SECRET_KEY, DB creds |
| `config.json` / `secrets.yaml` / `*.conf` | App-specific secrets |
| `config/license/*callback.php` (ZenTao ionCube) | License expiry, company placeholder |

```bash
# Fetch a single file's content (base64-decoded)
gh api "repos/<owner>/<repo>/contents/<path>" --jq '.content | @base64d'
```

**Use `execute_code`** to batch-fetch and scan many config files — `gh api` per file is slow and chatty. Fetch the full tree once, filter candidate paths, then pull content in a loop.

### Step 5 — Cross-repo credential-reuse detection

A single maintainer with multiple customer repos often reuses the same weak password across all of them. After finding one leak:

```bash
# List the maintainer's public repos
gh api users/<maintainer>/repos --jq '.[] | "\(.name) | \(.language // "n/a") | pushed:\(.pushed_at)"'

# Check the same config file in each repo
for r in repo1 repo2 repo3; do
  echo "--- $r ---"
  gh api "repos/<maintainer>/$r/contents/config/my.php" --jq '.content | @base64d' | grep -E 'db->(name|user|password|host|port)'
done
```

Same password across N customer DBs = a systemic integrator leak, not a one-off.

### Step 6 — Gitee / GitCode / CODING search

Chinese companies and integrators often use Gitee. The API is open (no auth needed for public search).

```bash
# Gitee: search users by company name fragment — finds employee accounts
curl -s "https://gitee.com/api/v5/search/users?q=phlexing&per_page=20" \
  | jq -r '.[]? | "\(.login) | \(.name // "n/a") | \(.html_url) | created:\(.created_at)"'

# Gitee: per-user public repos
curl -s "https://gitee.com/api/v5/users/<login>/repos?per_page=50" | jq 'length, (.[]? | .full_name)'

# Gitee: org search
curl -s "https://gitee.com/api/v5/orgs/<name>" | jq '{login,name,public_repos,created_at}'
```

**Employee-account pattern**: accounts named `<name>_company` or `company-<name>` (e.g. `kevinshi_phlexing`, `phlexing-ericzhao`), created in a tight time window (same week = batch registration), reveal employee names and the internal account-naming convention — even when the accounts have no public repos.

**GitCode / CODING**: public search APIs are unreliable/empty. Use DuckDuckGo HTML as a fallback for `site:gitcode.com <company>` and `site:coding.net <company>` — but DuckDuckGo HTML blocks after 1-2 queries (see osint-asset-mapping's search-engine ladder). Do not rely on these.

## Risk rating matrix

| Level | Criteria |
|-------|----------|
| 🔴 High | Hardcoded production credentials (DB root password, cloud API keys) in a public repo, OR full internal-tool source with customization specific to the target company |
| 🟠 Medium | Reused weak credentials across multiple repos, employee account exposure revealing names/naming conventions, internal workflow structure exposed (PMS modules, API endpoints) |
| 🟡 Low | Public website source with external links to the company, information-only docs (company/product descriptions reposted from official site), template files with placeholder secrets |
| ⚪ Info | Company mentioned in third-party content with no internal data exposure |

## Evidence snapshot format

Each finding must include:
1. **Platform + repo URL + file path** (exact, deep-linkable)
2. **Risk level** (per matrix above)
3. **Evidence snippet** — the actual leaked content, truncated to the relevant lines, in a code block
4. **Key points** — why this matters (DB name matches company, credential is plaintext, debug mode on, etc.)
5. **Reproduction command** — a `gh api` or `curl` one-liner that regenerates the evidence

## Report structure

```
# <Company> 公开代码仓库泄露检索报告
> 检索时间 | 检索范围 | 合规声明(仅公开仓库,未触碰基础设施)
## 一、发现总览 (summary table: #, 平台, 仓库/位置, 类型, 风险, 简述)
## 二、高/中风险发现详情 (per-finding: URL, file, risk, evidence snippet, key points, reproduction command)
## 三、低风险/信息性发现
## 四、检索覆盖与方法 (per-platform: query → hit count → interpretation; what was NOT found)
## 五、结论与建议 (core conclusions + remediation suggestions — state as recommendations, do not execute)
```

End the report with a compliance statement: all data from public repo metadata + public blobs, no credentials used to log in, no traffic sent to target infrastructure.

## Pitfalls

- **GitHub code search does NOT index commit author emails** — searching `@company.com` in code returns 0 even when employees committed. Use the commits API (`repos/.../commits`) and extract `.commit.author.email` instead.
- **GitHub code search returns 0 for scoped queries on very large repos** — the index may not have processed the repo. Fall back to fetching the git tree and scanning file names directly.
- **Gitee `search/repositories` often returns `[]`** even when repos exist — the search index is sparse. Prefer `search/users` to find employee accounts, then list each user's repos directly.
- **DuckDuckGo HTML blocks after 1-2 queries** — returns empty results with HTTP 200. Do not interpret empty DDG results as "no leaks exist"; it means the engine blocked you.
- **Same maintainer ≠ same company** — an integrator (e.g. ZenTao implementer `@chandao.com`) may publish multiple customers' repos. The leak is the integrator's, affecting the customer. Attribute correctly.
- **`.env.example` is usually safe** — it's a template with empty values. `.env` (committed by mistake) is the leak. Check `.gitignore` to see what was *supposed* to be excluded.
- **Debug mode = data exposure** — e.g. ZenTao `$config->debug = 6` causes the app to print full SQL + stack traces on errors. A committed config with debug on is a risk even without credentials.

## Related skills

- **osint-asset-mapping** — for mapping a company's own public assets (DNS, ICP, bidding, WeChat, patents). This skill is the "code leak" complement to that "asset map" skill. Load both for a full OSINT sweep.
- **scope-discipline** — when the user constrains to "仅检索公开仓库，不触碰目标基础设施" — enforce the read-only boundary.
- **deep-research-workflow** — for broader multi-source research with parallel subagents.

## References

- `references/zentao-config-leak.md` — the ZenTao/禅道 `config/my.php` hardcoded-credential leak pattern (DB host/user/password/name, debug level, license callbacks). ZenTao is the most widely used PMS in Chinese tech companies; this pattern recurs constantly.
