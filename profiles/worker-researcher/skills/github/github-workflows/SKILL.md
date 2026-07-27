---
name: github-workflows
description: Complete GitHub workflow operations — authentication, code review, issues, PR lifecycle, repo management, and CI/CD. Both gh CLI and git+curl fallback approaches, with common auth detection and owner/repo extraction shared across all operations.
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [github, git, pull-requests, code-review, issues, automation, ci-cd]
    related_skills: []
---

# GitHub Workflows

One umbrella for all GitHub operations — authentication, code review, issues, PRs, repo management, releases, and CI/CD.

## Common Setup

Every GitHub workflow starts with auth detection and owner/repo extraction:

```bash
# Auth detection
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  AUTH="gh"
else
  AUTH="git"
  if [ -z "$GITHUB_TOKEN" ]; then
    if _env="${HERMES_HOME:-$HOME/.hermes}/.env"; [ -f "$_env" ] && grep -q "^GITHUB_TOKEN=" "$_env"; then
      GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" "$_env" | head -1 | cut -d= -f2 | tr -d '\\n\\r')
    elif grep -q "github.com" ~/.git-credentials 2>/dev/null; then
      GITHUB_TOKEN=$(grep "github.com" ~/.git-credentials 2>/dev/null | head -1 | sed 's|https://[^:]*:\\([^@]*\\)@.*|\\1|')
    fi
  fi
fi

# Owner/repo extraction
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [ -n "$REMOTE_URL" ]; then
  OWNER_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\\.com[:/]||; s|\\.git$||')
  OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
  REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
fi
```

## Quick Reference by Area

### 1. Authentication
Full reference: `references/authentication.md`

Two methods:
- **HTTPS with PAT**: `git config --global credential.helper store` then use token as password
- **SSH**: `ssh-keygen -t ed25519` + add to GitHub keys
- **gh CLI**: `gh auth login` handles both API and git auth

### 2. Code Review
Full reference: `references/code-review.md`

For local changes (pre-push):
```bash
git diff main...HEAD --stat
git diff main...HEAD
```

For PR review:
```bash
gh pr view 123 && gh pr diff 123
gh pr review 123 --approve --body "LGTM"
```

### 3. Issues Management
Full reference: `references/issues.md`

```bash
gh issue list --state open --label "bug"
gh issue create --title "Bug" --body "Details" --label "bug"
gh issue edit 42 --add-label "priority:high"
gh issue close 42
```

### 4. PR Workflow
Full reference: `references/pr-workflow.md`

```bash
git checkout -b feat/my-feature
git add . && git commit -m "feat: description"
git push -u origin HEAD
gh pr create --title "feat: ..." --body "Summary"
gh pr merge --squash --delete-branch
```

### 5. Repo Management
Full reference: `references/repo-management.md`

```bash
gh repo create my-project --public --clone
gh repo fork owner/repo --clone
gh release create v1.0.0 --generate-notes
gh secret set API_KEY --body "value"
```

## Key Patterns

### Dual-Mode Operations (gh preferred, curl fallback)
Every operation shows the `gh` CLI approach first, then `curl` + REST API as fallback. The auth detection block determines which method to use.

### CI Auto-Fix Loop
1. Check CI status → identify failures
2. Read failure logs → understand error
3. Fix code → commit → push
4. Re-check status
5. Repeat up to 3 attempts

### Code Review Checklist
- **Correctness**: edge cases, error paths
- **Security**: no hardcoded secrets, SQL injection, XSS
- **Quality**: clear naming, DRY, single responsibility
- **Testing**: new code paths tested, happy + error paths
- **Performance**: no N+1 queries, appropriate caching
- **Docs**: public APIs documented, README updated

## Reference Files

| Reference | Origin | Content |
|-----------|--------|---------|
| `references/authentication.md` | `github-auth` | PAT/SSH/gh auth setup, credential helpers |
| `references/code-review.md` | `github-code-review` | Local and PR review, inline comments, formal reviews |
| `references/issues.md` | `github-issues` | View, create, manage, triage, bulk ops |
| `references/pr-workflow.md` | `github-pr-workflow` | Branch, commit, PR, CI, merge lifecycle |
| `references/repo-management.md` | `github-repo-management` | Clone, create, fork, releases, secrets, actions |
